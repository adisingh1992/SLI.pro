import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as OAuth2Strategy } from "passport-oauth2";
import { Express, Request } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import * as identity from "./wing/identity-store";
import { insertUserSchema, insertPasswordResetSchema } from "@shared/schema";
import type { AuthUser } from "./wing/identity-store";
import { z } from "zod";
import { sendPasswordResetEmail } from "./email-service";
import * as profileStore from "./wing/profile-store";
import { config } from "./config";
import {
  rateLimitByIp,
  limitFailedLogins,
  recordLoginFailure,
  clearLoginFailures,
} from "./rate-limit";

declare global {
  namespace Express {
    // req.user is a wing user after the identity cutover. `username` and
    // `isAdmin` are exposed as derived fields so existing handlers keep working.
    interface User extends AuthUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// Extended register schema with validation
/**
 * Registration, as the MyWing signup form submits it.
 *
 * ── THREE FIELDS STOPPED BEING REQUIRED, AND EACH FOR A REASON ───────────
 * The old signup was a long form. The new one asks the minimum and lets Wing find out the
 * rest in conversation, which is the shape of the whole product now.
 *
 *   phoneNumber          optional. The form marks it "For SMS notifications. Optional",
 *                        and SMS is unbuilt — requiring a number for a channel that
 *                        cannot send is a barrier in exchange for nothing. Still
 *                        format-checked when given.
 *   professionalStatus   optional, and this is the load-bearing one. It selects the
 *                        prompt strategy and resolves the population tags, so it cannot
 *                        simply be dropped — but the SIGNUP FORM is the wrong place to
 *                        ask. `intake-conversation.ts` writes it when the conversation
 *                        surfaces it, which is both better data and A1's actual design.
 *                        Until intake runs, `getPromptSet` falls back to mid-career.
 *   discoverySource      optional. The form's dropdown is marked optional.
 *
 * `confirmPassword` is optional too: the new form has one password field with a reveal
 * toggle instead of two fields, so there is nothing to confirm against. The equality
 * refinement below still holds whenever a client does send both.
 */
const registerSchema = insertUserSchema.extend({
  password: z.string().min(8, "Password must be at least 8 characters")
    .refine(pwd => /\d/.test(pwd), "Password must contain at least one number")
    .refine(pwd => /[a-z]/.test(pwd), "Password must contain at least one lowercase letter")
    .refine(pwd => /[A-Z]/.test(pwd), "Password must contain at least one uppercase letter"),
  confirmPassword: z.string().optional(),
  phoneNumber: z.string()
    .refine(val => !val || /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/.test(val), {
      message: "Please enter a valid phone number",
    })
    .optional(),
  professionalStatus: z.enum([
    "undergraduate_or_recent_grad",
    "early_career",
    "mid_career_or_senior",
    "career_break_or_transition",
  ]).optional(),
  /**
   * The institutional reporting block.
   *
   * Its own object rather than fields alongside the account, because it goes to its own
   * table — see migration 0035. The nesting is the first line of that separation: a
   * handler cannot spread this into `createUser` by accident.
   */
  demographics: z.object({
    age: z.number().int().min(13).max(120).optional(),
    gender: z.string().max(120).nullable().optional(),
    genderSelfDescribe: z.string().max(300).nullable().optional(),
    ethnicities: z.array(z.string().max(120)).max(20).optional(),
    marketingOptIn: z.boolean().optional(),
  }).optional(),
  discoverySource: z.enum([
    "university_partnership",
    "colleague_or_mentor",
    "linkedin",
    "web_search",
    "professional_network_or_conference",
    "other",
  ]).optional(),
  discoverySourceOther: z.string().optional(),
}).refine(data => data.confirmPassword === undefined || data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
}).refine(data => data.discoverySource !== "other" || (data.discoverySourceOther && data.discoverySourceOther.trim().length > 0), {
  message: "Please specify how you heard about us",
  path: ["discoverySourceOther"]
});

export function setupAuth(app: Express) {
  // Secure cookies whenever we are not in local development. Behind Azure
  // Front Door the app is always served over HTTPS, so this must be true in
  // staging as well as production (the old REPLIT_DEPLOYMENT check is gone).
  const isProduction = process.env.NODE_ENV !== 'development';
  
  const sessionSettings: session.SessionOptions = {
    // `config.sessionSecret`, which throws when unset, rather than a second
    // copy of the env read with its own "supersecretkey" fallback. Two places
    // resolving the signing key meant fixing one still left the other.
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: isProduction, // Use secure cookies in production (HTTPS)
      sameSite: 'lax', // CSRF protection while allowing OAuth redirects
      httpOnly: true, // Prevent XSS attacks
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await identity.getUserByEmail(username);
        if (!user || !user.passwordHash || !(await comparePasswords(password, user.passwordHash))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (err) {
        return done(err);
      }
    }),
  );

  if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
    console.error("LinkedIn OAuth credentials not configured. LinkedIn login will not be available.");
  } else {
    // Set LINKEDIN_CALLBACK_URL to the Front Door domain in staging/production
    // and register it in the LinkedIn app; the fallback is local dev only.
    const callbackURL =
      process.env.LINKEDIN_CALLBACK_URL ||
      `http://localhost:${process.env.PORT || 5000}/api/auth/linkedin/callback`;
    
    // LinkedIn OpenID Connect Strategy
    const linkedInStrategy = new OAuth2Strategy(
      {
        authorizationURL: "https://www.linkedin.com/oauth/v2/authorization",
        tokenURL: "https://www.linkedin.com/oauth/v2/accessToken",
        clientID: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
        callbackURL,
        scope: ["openid", "profile", "email", "w_member_social"],
        state: true,
      },
      async (accessToken: string, refreshToken: string, params: any, profile: any, done: any) => {
        try {
          // Manually fetch user profile from OpenID Connect userinfo endpoint
          const response = await fetch("https://api.linkedin.com/v2/userinfo", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch user profile: ${response.status} ${response.statusText}`);
          }

          const profileData = await response.json();
          
          // OpenID Connect userinfo response format:
          // { sub: "linkedin_id", email: "user@example.com", name: "First Last", given_name: "First", family_name: "Last" }
          const linkedinId = profileData.sub;
          const email = profileData.email;
          const firstName = profileData.given_name || "";
          const lastName = profileData.family_name || "";

          let user = await identity.getUserByLinkedinId(linkedinId);

          if (!user && email) {
            user = await identity.getUserByEmail(email);
            
            if (user) {
              user = await identity.updateUser(user.id, { linkedinId });
            }
          }

          if (!user) {
            user = await identity.createUser({
              email: email || `linkedin_${linkedinId}@placeholder.com`,
              firstName,
              lastName,
              linkedinId,
            });

            // No legacy profiles insert here either: identity.createUser has
            // already created the wing.students row that carries onboarding
            // state, and public.profiles.user_id points at public.users — so
            // this would fail the same FK the local registration path did.
          }

          // Store LinkedIn tokens (params.expires_in is in seconds)
          const expiresIn = params.expires_in || 5184000; // Default to 60 days if not provided
          await storage.updateLinkedinTokens(user.id, accessToken, refreshToken, expiresIn);

          return done(null, user);
        } catch (err) {
          console.error('[LinkedIn OAuth] Error in verify callback:', err);
          return done(err as Error);
        }
      }
    );
    
    // Name the strategy 'linkedin' for compatibility with existing routes
    linkedInStrategy.name = 'linkedin';
    passport.use(linkedInStrategy);
  }

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await identity.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  /*
   * Per-IP here, unlike login: a student registers once, so legitimate
   * volume from a shared campus address is low even at this threshold.
   */
  app.post(
    "/api/register",
    rateLimitByIp("register", { windowMs: 60 * 60 * 1000, max: 10 }),
    async (req, res, next) => {
    try {
      // Validate the request body
      const validationResult = registerSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: validationResult.error.errors 
        });
      }
      
      const { username, password, firstName, lastName, phoneNumber, professionalStatus, discoverySource, discoverySourceOther, demographics } = validationResult.data;
      
      const existingUser = await identity.getUserByEmail(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await identity.createUser({
        email: username,
        passwordHash: await hashPassword(password),
        firstName,
        lastName,
        phoneNumber,
        professionalStatus,
        discoverySource,
        discoverySourceOther: discoverySource === "other" ? discoverySourceOther : undefined,
      });

      // Onboarding state lives on wing.students now — identity.createUser
      // already created that row. The legacy profiles insert failed here for
      // every new registration, because its FK points at public.users and the
      // user was created in wing.users.

      /*
       * The institutional reporting block, if the form sent one.
       *
       * Awaited rather than fired after the response, unlike the welcome email below.
       * The student consented to this being recorded on the screen they just submitted,
       * and a floating promise that loses the row leaves the institution's report short
       * with nothing anywhere saying so. It is one insert.
       *
       * It does not fail the registration. An account that exists without its reporting
       * row is recoverable — the student can be asked again — and a registration that
       * 500s because a reporting insert failed is not.
       */
      if (demographics) {
        try {
          const { ensureStudent } = await import("./wing/bootstrap");
          const { saveDemographics } = await import("./wing/demographics-store");
          const studentId = await ensureStudent(user as any);
          await saveDemographics(studentId, {
            age: demographics.age ?? null,
            gender: demographics.gender ?? null,
            genderSelfDescribe: demographics.genderSelfDescribe ?? null,
            ethnicities: demographics.ethnicities ?? [],
            marketingOptIn: demographics.marketingOptIn ?? false,
          });
        } catch (err) {
          console.error("demographics not recorded for the new registration:", err);
        }
      }

      /*
       * `req.login` establishes the session — without it registration created the
       * account but signed nobody in, so the client had nothing to redirect on and a
       * page reload sent a brand-new registrant straight back to the login screen.
       * `/api/login` does this; register never did.
       *
       * Response goes through `identity.publicUser`, not a hand-rolled `{ passwordHash:
       * _, ...rest }` spread — that was the same denylist bug `/api/user` had (see the
       * allowlist note above): it shipped every column on the row to the browser,
       * `linkedinId` included, rather than the fields the client is meant to see.
       */
      req.login(user, (err: any) => {
        if (err) return next(err);
        res.status(201).json(identity.publicUser(user));

        // S1 — welcome sequence (Feature List B3). Fired AFTER the response so a
        // slow or failing email cannot make registration look broken, which is
        // the surface that already loses 43% of registrants.
        void (async () => {
          try {
            const { ensureStudent } = await import("./wing/bootstrap");
            const engagement = await import("./wing/engagement");
            // Takes the legacy user row, not an id — it provisions the wing user
            // as well as the student on first call.
            const studentId = await ensureStudent(user as any);
            if (studentId) await engagement.onRegistered(studentId);
          } catch (err) {
            console.error("[engagement] welcome sequence not started:", err);
          }
        })();
      });
    } catch (error) {
      next(error);
    }
  });

  /*
   * `limitFailedLogins` counts failures per EMAIL, not per IP, and clears them
   * on success — see the NAT note in rate-limit.ts. A career centre runs thirty
   * students through onboarding from one address; per-IP limiting here would
   * lock out the room.
   */
  app.post("/api/login", limitFailedLogins, (req, res, next) => {
    passport.authenticate("local", async (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        recordLoginFailure(req.body?.username);
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Right password: the window is forgotten, so two typos followed by a
      // correct attempt never strand anybody.
      clearLoginFailures(req.body?.username);

      // Update the lastLoginAt timestamp
      try {
        await identity.recordLogin(user.id);
        // Refresh the user data with updated lastLoginAt
        user = await identity.getUser(user.id);
      } catch (updateError) {
        console.error("Error updating last login time:", updateError);
      }

      req.login(user, (err: any) => {
        if (err) return next(err);
        res.status(200).json(identity.publicUser(user));
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err: any) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  /**
   * The signed-in user.
   *
   * ── ALLOWLIST, NOT DENYLIST ──────────────────────────────────────────────
   * This used to spread the whole AuthUser and delete `passwordHash`, which
   * meant `linkedinAccessToken` and `linkedinRefreshToken` were serialised to
   * the browser on every page load — a live OAuth credential sitting in a
   * client-side query cache. Nothing read them there.
   *
   * Denylisting is the wrong shape for this: every field added to AuthUser is
   * exposed by default and the mistake is invisible. Naming what the client
   * gets means a new secret has to be deliberately added here to leak.
   */
  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(identity.publicUser(req.user));
  });

  app.get("/api/user/profile", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const userProfile = await profileStore.getUserProfile(req.user.id);
      if (!userProfile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      
      res.json(identity.publicProfile(userProfile));
    } catch (error) {
      next(error);
    }
  });

  // Password reset request
  const forgotPasswordSchema = z.object({
    username: z.string().email("Please enter a valid email")
  });

  /*
   * Tighter than the others because this one SENDS EMAIL to an address the
   * caller chose. Unthrottled it is a way to flood somebody else's inbox
   * from our domain, which costs deliverability reputation as well as money.
   */
  app.post(
    "/api/forgot-password",
    rateLimitByIp("forgot-password", { windowMs: 60 * 60 * 1000, max: 5 }),
    async (req, res, next) => {
    try {
      const validationResult = forgotPasswordSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: validationResult.error.errors 
        });
      }

      const { username } = validationResult.data;
      const user = await identity.getUserByEmail(username);
      
      // Even if the user is not found, we return success to prevent user enumeration
      if (!user) {
        return res.status(200).json({ 
          message: "If an account with that email exists, a password reset link has been sent." 
        });
      }

      // Generate a random token
      const token = randomBytes(32).toString('hex');
      
      // Set expiration to 1 hour from now
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);
      
      // Create password reset token
      await identity.createPasswordReset({ userId: user.id, token, expiresAt });

      // Determine the base URL from the request
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers.host;
      const baseUrl = `${protocol}://${host}`;
      
      // Send the password reset email
      const emailSent = await sendPasswordResetEmail(
        username, // username is the email address
        token,
        baseUrl
      );
      
      // Log email status for monitoring
      if (!emailSent) {
        console.error(`Failed to send password reset email to ${username}`);
        
        // For development/testing, include the token in the response when email fails
        // In production, this should be removed for security
        if (process.env.NODE_ENV !== 'production') {
          res.status(200).json({ 
            message: "If an account with that email exists, a password reset link has been sent.",
            note: "Email sending failed. For development purposes only, use this token:",
            resetToken: token,
            resetUrl: `${baseUrl}/reset-password?token=${token}`
          });
          return;
        }
      }
      
      // For security, don't reveal whether an email was actually sent in the standard response
      res.status(200).json({ 
        message: "If an account with that email exists, a password reset link has been sent."
      });
    } catch (error) {
      console.error('Error in forgot-password endpoint:', error);
      next(error);
    }
  });

  // Reset password
  const resetPasswordSchema = z.object({
    token: z.string(),
    password: z.string().min(8, "Password must be at least 8 characters")
      .refine(pwd => /\d/.test(pwd), "Password must contain at least one number")
      .refine(pwd => /[a-z]/.test(pwd), "Password must contain at least one lowercase letter")
      .refine(pwd => /[A-Z]/.test(pwd), "Password must contain at least one uppercase letter"),
    confirmPassword: z.string()
  }).refine(data => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  });

  // Guessing reset tokens is the attack; the token is already single-use
  // and expiring, so this only removes the free brute-force attempt.
  app.post(
    "/api/reset-password",
    rateLimitByIp("reset-password", { windowMs: 60 * 60 * 1000, max: 20 }),
    async (req, res, next) => {
    try {
      const validationResult = resetPasswordSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: validationResult.error.errors 
        });
      }

      const { token, password } = validationResult.data;
      
      // Find the reset token
      const passwordReset = await identity.getPasswordReset(token);
      if (!passwordReset) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Hash the new password
      const hashedPassword = await hashPassword(password);
      
      // Update the user's password
      await identity.updateUser(passwordReset.userId, { passwordHash: hashedPassword });
      
      // Mark the token as used
      await identity.markPasswordResetUsed(passwordReset.id);
      
      res.status(200).json({ message: "Password has been reset successfully" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/linkedin", (req, res, next) => {
    if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
      return res.status(503).json({ message: "LinkedIn login is not configured" });
    }
    passport.authenticate("linkedin")(req, res, next);
  });

  app.get(
    "/api/auth/linkedin/callback",
    (req, res, next) => {
      if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
        return res.redirect("/auth");
      }
      
      passport.authenticate("linkedin", (err: any, user: any, info: any) => {
        if (err) {
          console.error("LinkedIn authentication error:", err);
          return res.redirect("/auth");
        }
        if (!user) {
          return res.redirect("/auth");
        }
        
        req.login(user, async (loginErr) => {
          if (loginErr) {
            console.error("LinkedIn login error:", loginErr);
            return res.redirect("/auth");
          }
          
          try {
            await identity.recordLogin(user.id);
            res.redirect("/");
          } catch (error) {
            console.error("Error updating last login:", error);
            res.redirect("/");
          }
        });
      })(req, res, next);
    }
  );
}

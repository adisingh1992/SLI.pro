import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as LinkedInStrategy } from "passport-linkedin-oauth2";
import { Express, Request } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, insertUserSchema, insertPasswordResetSchema } from "@shared/schema";
import { z } from "zod";
import { sendPasswordResetEmail } from "./email-service";

declare global {
  namespace Express {
    interface User extends SelectUser {}
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
const registerSchema = insertUserSchema.extend({
  password: z.string().min(8, "Password must be at least 8 characters")
    .refine(pwd => /\d/.test(pwd), "Password must contain at least one number")
    .refine(pwd => /[a-z]/.test(pwd), "Password must contain at least one lowercase letter")
    .refine(pwd => /[A-Z]/.test(pwd), "Password must contain at least one uppercase letter"),
  confirmPassword: z.string(),
  phoneNumber: z.string().min(1, "Phone number is required")
    .refine(val => /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/.test(val), {
      message: "Please enter a valid phone number",
    }),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});

export function setupAuth(app: Express) {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';
  
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "supersecretkey",
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
        const user = await storage.getUserByUsername(username);
        if (!user || !user.password || !(await comparePasswords(password, user.password))) {
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
    const callbackURL = process.env.LINKEDIN_CALLBACK_URL || `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000'}/api/auth/linkedin/callback`;

    console.log(callbackURL);
    
    passport.use(
      new LinkedInStrategy(
        {
          clientID: process.env.LINKEDIN_CLIENT_ID,
          clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
          callbackURL,
          scope: ["openid", "profile", "email"],
          state: true, // Enable CSRF protection via automatic state parameter handling
          profileURL: "https://api.linkedin.com/v2/userinfo", // Use OpenID Connect userinfo endpoint
        } as any, // Type assertion needed as @types/passport-linkedin-oauth2 doesn't include state option
        async (accessToken: string, refreshToken: string, profile: any, done: any) => {
          try {
            console.log('[LinkedIn OAuth] Profile received:', JSON.stringify(profile, null, 2));
            
            const linkedinId = profile.id;
            const email = profile.emails?.[0]?.value;
            const firstName = profile.name?.givenName || "";
            const lastName = profile.name?.familyName || "";

            console.log('[LinkedIn OAuth] Extracted data:', { linkedinId, email, firstName, lastName });

            let user = await storage.getUserByLinkedinId(linkedinId);
            console.log('[LinkedIn OAuth] User by LinkedIn ID:', user ? `Found: ${user.id}` : 'Not found');

            if (!user && email) {
              user = await storage.getUserByUsername(email);
              console.log('[LinkedIn OAuth] User by email:', user ? `Found: ${user.id}` : 'Not found');
              
              if (user) {
                user = await storage.updateUser(user.id, { linkedinId });
                console.log('[LinkedIn OAuth] Updated existing user with LinkedIn ID');
              }
            }

            if (!user) {
              console.log('[LinkedIn OAuth] Creating new user');
              user = await storage.createUser({
                username: email || `linkedin_${linkedinId}@placeholder.com`,
                firstName,
                lastName,
                linkedinId,
              });

              await storage.createProfile({
                userId: user.id,
                completionStep: 0,
                isComplete: false,
              });
              console.log('[LinkedIn OAuth] New user created:', user.id);
            }

            console.log('[LinkedIn OAuth] Returning user to Passport:', user.id);
            return done(null, user);
          } catch (err) {
            console.error('[LinkedIn OAuth] Error in verify callback:', err);
            return done(err);
          }
        }
      )
    );
  }

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      // Validate the request body
      const validationResult = registerSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: validationResult.error.errors 
        });
      }
      
      const { username, password, firstName, lastName, phoneNumber } = validationResult.data;
      
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        username,
        password: await hashPassword(password),
        firstName,
        lastName,
        phoneNumber
      });

      // Create an empty profile
      await storage.createProfile({
        userId: user.id,
        completionStep: 0,
        isComplete: false
      });

      req.login(user, (err) => {
        if (err) return next(err);
        // Remove password before sending to client
        const { password, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", async (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: "Invalid username or password" });
      
      // Update the lastLoginAt timestamp
      try {
        await storage.updateUser(user.id, { lastLoginAt: new Date() });
        // Refresh the user data with updated lastLoginAt
        user = await storage.getUser(user.id);
      } catch (updateError) {
        console.error("Error updating last login time:", updateError);
      }
      
      req.login(user, (err: any) => {
        if (err) return next(err);
        // Remove password before sending to client
        const { password, ...userWithoutPassword } = user;
        res.status(200).json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err: any) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { password, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });

  app.get("/api/user/profile", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const userProfile = await storage.getUserProfile(req.user.id);
      if (!userProfile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      
      const { password, ...profileWithoutPassword } = userProfile;
      res.json(profileWithoutPassword);
    } catch (error) {
      next(error);
    }
  });

  // Password reset request
  const forgotPasswordSchema = z.object({
    username: z.string().email("Please enter a valid email")
  });

  app.post("/api/forgot-password", async (req, res, next) => {
    try {
      const validationResult = forgotPasswordSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: validationResult.error.errors 
        });
      }

      const { username } = validationResult.data;
      const user = await storage.getUserByUsername(username);
      
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
      await storage.createPasswordReset({
        userId: user.id,
        token,
        expiresAt,
        used: false
      });

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

  app.post("/api/reset-password", async (req, res, next) => {
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
      const passwordReset = await storage.getPasswordResetByToken(token);
      if (!passwordReset) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Hash the new password
      const hashedPassword = await hashPassword(password);
      
      // Update the user's password
      await storage.updateUserPassword(passwordReset.userId, hashedPassword);
      
      // Mark the token as used
      await storage.markPasswordResetAsUsed(passwordReset.id);
      
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
      console.log('[LinkedIn Callback] Route hit');
      console.log('[LinkedIn Callback] Query params:', req.query);
      console.log('[LinkedIn Callback] Session ID:', req.sessionID);
      
      if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
        console.error('[LinkedIn Callback] Missing credentials');
        return res.redirect("/auth");
      }
      
      passport.authenticate("linkedin", (err: any, user: any, info: any) => {
        console.log('[LinkedIn Callback] Authenticate callback - err:', err, 'user:', user ? `ID: ${user.id}` : null, 'info:', info);
        
        if (err) {
          console.error("[LinkedIn Callback] Authentication error:", err);
          return res.redirect("/auth");
        }
        if (!user) {
          console.error("[LinkedIn Callback] Authentication failed: no user returned", info);
          return res.redirect("/auth");
        }
        
        console.log('[LinkedIn Callback] User found, calling req.login()');
        
        // Explicitly log the user in
        req.login(user, async (loginErr) => {
          if (loginErr) {
            console.error("[LinkedIn Callback] Login error:", loginErr);
            return res.redirect("/auth");
          }
          
          console.log('[LinkedIn Callback] req.login() successful');
          console.log('[LinkedIn Callback] Session after login:', req.session);
          console.log('[LinkedIn Callback] req.user:', req.user ? `ID: ${req.user.id}` : null);
          
          try {
            // Update last login timestamp
            await storage.updateUser(user.id, { lastLoginAt: new Date() });
            console.log('[LinkedIn Callback] Last login updated, redirecting to /');
            res.redirect("/");
          } catch (error) {
            console.error("[LinkedIn Callback] Error updating last login:", error);
            res.redirect("/");
          }
        });
      })(req, res, next);
    }
  );
}

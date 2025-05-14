import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
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
    .refine(pwd => /[!@#$%^&*(),.?":{}|<>]/.test(pwd), "Password must contain at least one special character"),
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
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
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
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (err) {
        return done(err);
      }
    }),
  );

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

      // In a real app, we would send an email with the reset link
      // For now, we'll just return the token in the response
      res.status(200).json({ 
        message: "If an account with that email exists, a password reset link has been sent.",
        // The following would NOT be included in a production app, but is useful for testing
        resetToken: token
      });
    } catch (error) {
      next(error);
    }
  });

  // Reset password
  const resetPasswordSchema = z.object({
    token: z.string(),
    password: z.string().min(8, "Password must be at least 8 characters")
      .refine(pwd => /\d/.test(pwd), "Password must contain at least one number")
      .refine(pwd => /[!@#$%^&*(),.?":{}|<>]/.test(pwd), "Password must contain at least one special character"),
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
}

import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { z } from "zod";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { registerSliRoutes } from "./sli-routes";
import { registerHomeworkRoutes } from "./homework-routes";
import { registerFreshnessRoutes } from "./freshness-routes";
import { registerLinkedinOptimizationRoutes } from "./linkedin-optimization-routes";
import { registerLinkedinContentRoutes } from "./linkedin-content-routes";
import { registerFoundationSessionsRoutes } from "./foundation-sessions-routes";
import {
  insertExperienceSchema,
  insertEducationSchema,
  insertSkillSchema,
  insertLanguageSchema,
  updateProfileSchema,
  insertQuestionnaireSchema,
  insertDocumentSchema,
  insertMonthlyCheckInSchema,
  insertCoachingNoteSchema,
  User
} from "@shared/schema";

const scryptAsync = promisify(scrypt);

// Helper function for password hashing - needed for creating admin user
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}


export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);
  
  // Register other route modules
  registerFreshnessRoutes(app);
  registerLinkedinOptimizationRoutes(app);
  registerLinkedinContentRoutes(app);
  registerSliRoutes(app, storage);
  registerHomeworkRoutes(app, storage);
  registerFoundationSessionsRoutes(app);

  // Middleware to check if user is authenticated
  const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };
  
  // Middleware to check if user is an admin
  const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated() || !req.user?.isAdmin) {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    next();
  };

  // Profile routes
  app.patch("/api/profile", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = updateProfileSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const userId = req.user.id;

      // Check if the user has a profile
      let profile = await storage.getProfile(userId);
      if (!profile) {
        // Create a new profile if it doesn't exist
        profile = await storage.createProfile({
          userId,
          completionStep: 0,
          isComplete: false,
        });
      }

      // Update user data
      if (req.body.headline || req.body.bio || req.body.location) {
        await storage.updateUser(userId, {
          headline: req.body.headline,
          bio: req.body.bio,
          location: req.body.location,
        });
      }

      // Update profile data
      const updatedProfile = await storage.updateProfile(userId, {
        completionStep: req.body.completionStep,
        isComplete: req.body.isComplete,
      });

      res.json(updatedProfile);
    } catch (error) {
      next(error);
    }
  });

  // Experience routes
  app.get("/api/experiences", isAuthenticated, async (req, res, next) => {
    try {
      const experiences = await storage.getExperiences(req.user.id);
      res.json(experiences);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/experiences", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = insertExperienceSchema.safeParse({
        ...req.body,
        userId: req.user.id,
      });

      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const experience = await storage.createExperience(validationResult.data);
      res.status(201).json(experience);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/experiences/:id", isAuthenticated, async (req, res, next) => {
    try {
      const experienceId = parseInt(req.params.id);
      const experience = await storage.getExperience(experienceId);

      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }

      if (experience.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const validationResult = insertExperienceSchema
        .partial()
        .safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const updatedExperience = await storage.updateExperience(
        experienceId,
        validationResult.data,
      );
      res.json(updatedExperience);
    } catch (error) {
      next(error);
    }
  });

  app.delete(
    "/api/experiences/:id",
    isAuthenticated,
    async (req, res, next) => {
      try {
        const experienceId = parseInt(req.params.id);
        const experience = await storage.getExperience(experienceId);

        if (!experience) {
          return res.status(404).json({ message: "Experience not found" });
        }

        if (experience.userId !== req.user.id) {
          return res.status(403).json({ message: "Unauthorized" });
        }

        await storage.deleteExperience(experienceId);
        res.sendStatus(204);
      } catch (error) {
        next(error);
      }
    },
  );

  // Education routes
  app.get("/api/education", isAuthenticated, async (req, res, next) => {
    try {
      const education = await storage.getEducations(req.user.id);
      res.json(education);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/education", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = insertEducationSchema.safeParse({
        ...req.body,
        userId: req.user.id,
      });

      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const education = await storage.createEducation(validationResult.data);
      res.status(201).json(education);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/education/:id", isAuthenticated, async (req, res, next) => {
    try {
      const educationId = parseInt(req.params.id);
      const education = await storage.getEducation(educationId);

      if (!education) {
        return res.status(404).json({ message: "Education not found" });
      }

      if (education.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const validationResult = insertEducationSchema
        .partial()
        .safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const updatedEducation = await storage.updateEducation(
        educationId,
        validationResult.data,
      );
      res.json(updatedEducation);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/education/:id", isAuthenticated, async (req, res, next) => {
    try {
      const educationId = parseInt(req.params.id);
      const education = await storage.getEducation(educationId);

      if (!education) {
        return res.status(404).json({ message: "Education not found" });
      }

      if (education.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      await storage.deleteEducation(educationId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Skills routes
  app.get("/api/skills", isAuthenticated, async (req, res, next) => {
    try {
      const skills = await storage.getSkills(req.user.id);
      res.json(skills);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skills", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = insertSkillSchema.safeParse({
        ...req.body,
        userId: req.user.id,
      });

      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const skill = await storage.createSkill(validationResult.data);
      res.status(201).json(skill);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/skills/:id", isAuthenticated, async (req, res, next) => {
    try {
      const skillId = parseInt(req.params.id);
      const skill = await storage.getSkill(skillId);

      if (!skill) {
        return res.status(404).json({ message: "Skill not found" });
      }

      if (skill.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      await storage.deleteSkill(skillId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Languages routes
  app.get("/api/languages", isAuthenticated, async (req, res, next) => {
    try {
      const languages = await storage.getLanguages(req.user.id);
      res.json(languages);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/languages", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = insertLanguageSchema.safeParse({
        ...req.body,
        userId: req.user.id,
      });

      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const language = await storage.createLanguage(validationResult.data);
      res.status(201).json(language);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/languages/:id", isAuthenticated, async (req, res, next) => {
    try {
      const languageId = parseInt(req.params.id);
      const language = await storage.getLanguage(languageId);

      if (!language) {
        return res.status(404).json({ message: "Language not found" });
      }

      if (language.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      await storage.deleteLanguage(languageId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Questionnaire routes
  app.get("/api/questionnaire", isAuthenticated, async (req, res, next) => {
    try {
      const questionnaire = await storage.getQuestionnaire(req.user.id);
      if (!questionnaire) {
        return res.status(404).json({ message: "Questionnaire not found" });
      }
      res.json(questionnaire);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/questionnaire", isAuthenticated, async (req, res, next) => {
    try {
      // Check if user already has a questionnaire
      const existingQuestionnaire = await storage.getQuestionnaire(req.user.id);

      const validationResult = insertQuestionnaireSchema.safeParse({
        ...req.body,
        userId: req.user.id,
        isDraft: false, // When submitting the full questionnaire, it's not a draft
      });

      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      let questionnaire;
      if (existingQuestionnaire) {
        // Update existing questionnaire
        questionnaire = await storage.updateQuestionnaire(
          req.user.id,
          validationResult.data,
        );
        res.json(questionnaire);
      } else {
        // Create new questionnaire
        questionnaire = await storage.createQuestionnaire(
          validationResult.data,
        );
        res.status(201).json(questionnaire);
      }
    } catch (error) {
      next(error);
    }
  });

  // Route for saving draft questionnaire
  app.post(
    "/api/questionnaire/draft",
    isAuthenticated,
    async (req, res, next) => {
      try {
        // Check if user already has a questionnaire
        const existingQuestionnaire = await storage.getQuestionnaire(
          req.user.id,
        );

        // If the questionnaire exists and is already published (not a draft),
        // prevent changing it back to draft state
        if (existingQuestionnaire && existingQuestionnaire.isDraft === false) {
          return res.status(400).json({
            message: "Cannot save as draft: Questionnaire has already been published",
          });
        }

        const validationResult = insertQuestionnaireSchema.safeParse({
          ...req.body,
          userId: req.user.id,
          isDraft: true, // Mark as draft
        });

        if (!validationResult.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validationResult.error.errors,
          });
        }

        let questionnaire;
        if (existingQuestionnaire) {
          // Update existing questionnaire
          questionnaire = await storage.updateQuestionnaire(
            req.user.id,
            validationResult.data,
          );
          res.json(questionnaire);
        } else {
          // Create new questionnaire as draft
          questionnaire = await storage.createQuestionnaire(
            validationResult.data,
          );
          res.status(201).json(questionnaire);
        }
      } catch (error) {
        next(error);
      }
    },
  );

  app.put("/api/questionnaire", isAuthenticated, async (req, res, next) => {
    try {
      // Check if user has a questionnaire to update
      const existingQuestionnaire = await storage.getQuestionnaire(req.user.id);
      if (!existingQuestionnaire) {
        return res.status(404).json({ message: "Questionnaire not found" });
      }

      const validationResult = insertQuestionnaireSchema
        .partial()
        .safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const updatedQuestionnaire = await storage.updateQuestionnaire(
        req.user.id,
        validationResult.data,
      );
      res.json(updatedQuestionnaire);
    } catch (error) {
      next(error);
    }
  });

  // Combined profile route for client - get user profile data including questionnaire
  app.get("/api/user/profile", isAuthenticated, async (req, res, next) => {
    try {
      const userProfile = await storage.getUserProfile(req.user.id);
      const questionnaire = await storage.getQuestionnaire(req.user.id);

      res.json({
        ...userProfile,
        questionnaire,
      });
    } catch (error) {
      next(error);
    }
  });

  // Document routes
  app.get("/api/documents", isAuthenticated, async (req, res, next) => {
    try {
      const documents = await storage.getDocuments(req.user.id);
      res.json(documents);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/documents/:id", isAuthenticated, async (req, res, next) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (document.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      res.json(document);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/documents", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = insertDocumentSchema.safeParse({
        ...req.body,
        userId: req.user.id,
      });

      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const document = await storage.createDocument(validationResult.data);
      res.status(201).json(document);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req, res, next) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (document.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      await storage.deleteDocument(documentId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/documents/:id/analysis", isAuthenticated, async (req, res, next) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Only admins or document owners can update the analysis
      if (document.userId !== req.user.id && !req.user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const { analysisContent } = req.body;
      if (typeof analysisContent !== 'string') {
        return res.status(400).json({ message: "Analysis content must be a string" });
      }

      const updatedDocument = await storage.updateDocument(documentId, { analysisContent });
      res.json(updatedDocument);
    } catch (error) {
      next(error);
    }
  });

  // Monthly Check-in Routes
  app.get("/api/monthly-check-ins", isAuthenticated, async (req, res, next) => {
    try {
      const checkIns = await storage.getMonthlyCheckIns(req.user.id);
      res.json(checkIns);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/monthly-check-ins/:id", isAuthenticated, async (req, res, next) => {
    try {
      const checkInId = parseInt(req.params.id);
      const checkIn = await storage.getMonthlyCheckIn(checkInId);

      if (!checkIn) {
        return res.status(404).json({ message: "Monthly check-in not found" });
      }

      if (checkIn.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      res.json(checkIn);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/monthly-check-ins/month/:month", isAuthenticated, async (req, res, next) => {
    try {
      const month = req.params.month;
      const checkIn = await storage.getMonthlyCheckInByMonth(req.user.id, month);

      if (!checkIn) {
        return res.status(404).json({ message: "Monthly check-in not found" });
      }

      res.json(checkIn);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/monthly-check-ins", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = insertMonthlyCheckInSchema.safeParse({
        ...req.body,
        userId: req.user.id,
      });

      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      // Check if a check-in already exists for this month
      const existingCheckIn = await storage.getMonthlyCheckInByMonth(
        req.user.id,
        validationResult.data.month
      );

      if (existingCheckIn) {
        return res.status(409).json({
          message: "A check-in for this month already exists",
          checkIn: existingCheckIn,
        });
      }

      const checkIn = await storage.createMonthlyCheckIn(validationResult.data);
      res.status(201).json(checkIn);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/monthly-check-ins/:id", isAuthenticated, async (req, res, next) => {
    try {
      const checkInId = parseInt(req.params.id);
      const checkIn = await storage.getMonthlyCheckIn(checkInId);

      if (!checkIn) {
        return res.status(404).json({ message: "Monthly check-in not found" });
      }

      if (checkIn.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const validationResult = insertMonthlyCheckInSchema
        .partial()
        .safeParse(req.body);
        
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const updatedCheckIn = await storage.updateMonthlyCheckIn(
        checkInId,
        validationResult.data
      );
      res.json(updatedCheckIn);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/monthly-check-ins/:id", isAuthenticated, async (req, res, next) => {
    try {
      const checkInId = parseInt(req.params.id);
      const checkIn = await storage.getMonthlyCheckIn(checkInId);

      if (!checkIn) {
        return res.status(404).json({ message: "Monthly check-in not found" });
      }

      if (checkIn.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      await storage.deleteMonthlyCheckIn(checkInId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  registerFreshnessRoutes(app);

  // Helper function to get all users for admin routes
  async function getAllUsers(excludeAdmins: boolean = false): Promise<User[]> {
    // If we need to exclude admins, use the storage method directly
    if (excludeAdmins) {
      const nonAdminUsers = await storage.getNonAdminUsers();

      return nonAdminUsers;
    }
    
    // Otherwise get all users
    const users: User[] = [];
    let id = 1;
    let user = await storage.getUser(id);
    
    while (user) {
      users.push(user);
      id++;
      user = await storage.getUser(id);
    }

    return users;
  }

  // Helper function to determine user status
  async function getUserStatus(userId: number): Promise<string> {
    // Check LinkedIn Optimization
    const linkedinOptimizations = await storage.getLinkedinOptimizations(userId);
    if (linkedinOptimizations.length > 0) {
      return "LinkedIn Optimization Done";
    }
    
    // Check SLI
    const slis = await storage.getSlisByUserId(userId);
    if (slis.length > 0) {
      return "SLI Generated";
    }
    
    // Check Freshness Report
    const freshnessReports = await storage.getFreshnessReports(userId);
    if (freshnessReports.length > 0) {
      return "Freshness Report Generated";
    }
    
    
    // Check Documents
    const documents = await storage.getDocuments(userId);
    const hasResume = documents.some(doc => doc.type === 'resume');
    const hasLinkedin = documents.some(doc => doc.type === 'linkedin');
    if (hasResume && hasLinkedin) {
      return "Documents Uploaded";
    }
    
    // Check Questionnaire
    const questionnaire = await storage.getQuestionnaire(userId);
    if (questionnaire && !questionnaire.isDraft) {
      return "Questionnaire Completed";
    }
    
    // Default status
    return "Registered";
  }

  // Admin API routes
  app.get("/api/admin/users", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get all users from storage, then manually filter
      const allUsers = await getAllUsers(false);
      
      // FORCE filter admin users out - manual approach to bypass any caching issues
      const nonAdminUsers = allUsers.filter(user => user.isAdmin !== true);
      
      // Enhance each user with their status
      const enhancedUsers = await Promise.all(nonAdminUsers.map(async (user) => {
        const { password, ...userWithoutPassword } = user;
        const status = await getUserStatus(user.id);
        return {
          ...userWithoutPassword,
          status
        };
      }));
      
      res.json(enhancedUsers);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/users/count", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get all users from storage, then manually filter
      const allUsers = await getAllUsers(false);
      
      // FORCE filter admin users out - manual approach to bypass any caching issues
      const nonAdminUsers = allUsers.filter(user => user.isAdmin !== true);
      
      res.json({ count: nonAdminUsers.length });
    } catch (error) {
      next(error);
    }
  });

  // Get user details (for admin)
  app.get("/api/admin/users/:id", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get full user profile
      const userProfile = await storage.getUserProfile(userId);
      if (!userProfile) {
        // If profile doesn't exist, just return the user
        const { password, ...userWithoutPassword } = user;
        return res.json(userWithoutPassword);
      }

      // Remove password before sending
      const { password, ...profileWithoutPassword } = userProfile;
      res.json(profileWithoutPassword);
    } catch (error) {
      next(error);
    }
  });

  // Temporary debug route to check user state
  app.get("/api/debug/users", isAdmin, async (req: Request, res: Response) => {
    // Get all users from the database
    const allUsers = await getAllUsers(false);
    
    const debugInfo = {
      allUsers: allUsers.map(u => ({
        id: u.id,
        username: u.username,
        isAdmin: u.isAdmin,
        typeofIsAdmin: typeof u.isAdmin
      }))
    };
    
    res.json(debugInfo);
  });

  // Foundation Sessions routes - ADMIN only
  app.get("/api/admin/users/:userId/foundation-sessions", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Initialize foundation sessions for the user if they don't exist
      const existingSessions = await storage.getFoundationSessions(userId);
      
      // If user doesn't have sessions, create them
      if (existingSessions.length === 0) {
        const sessionsToCreate = [
          {
            userId,
            sessionNumber: 1,
            status: "available" as const, // Session 1 is available by default
          },
          {
            userId,
            sessionNumber: 2,
            status: "locked" as const, // Sessions 2 and 3 are locked initially
          },
          {
            userId,
            sessionNumber: 3,
            status: "locked" as const,
          }
        ];

        for (const sessionData of sessionsToCreate) {
          await storage.createFoundationSession(sessionData);
        }
        
        // Fetch the newly created sessions
        const sessions = await storage.getFoundationSessions(userId);
        res.json(sessions);
      } else {
        // Return existing sessions
        res.json(existingSessions);
      }
    } catch (error) {
      console.error("Error fetching admin foundation sessions:", error);
      next(error);
    }
  });

  // Coaching Notes routes - ADMIN only
  app.get("/api/admin/users/:userId/coaching-notes", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);
      const notes = await storage.getCoachingNotes(userId);
      res.json(notes);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/coaching-notes/:id", isAdmin, async (req, res, next) => {
    try {
      const noteId = parseInt(req.params.id);
      const note = await storage.getCoachingNote(noteId);
      
      if (!note) {
        return res.status(404).json({ message: "Coaching note not found" });
      }
      
      res.json(note);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/coaching-notes", isAdmin, async (req, res, next) => {
    try {
      const validationResult = insertCoachingNoteSchema.safeParse({
        ...req.body,
      });

      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const note = await storage.createCoachingNote(validationResult.data);
      res.status(201).json(note);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/admin/coaching-notes/:id", isAdmin, async (req, res, next) => {
    try {
      const noteId = parseInt(req.params.id);
      const note = await storage.getCoachingNote(noteId);

      if (!note) {
        return res.status(404).json({ message: "Coaching note not found" });
      }

      const updatedNote = await storage.updateCoachingNote(
        noteId,
        req.body.content,
      );
      res.json(updatedNote);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/coaching-notes/:id", isAdmin, async (req, res, next) => {
    try {
      const noteId = parseInt(req.params.id);
      const note = await storage.getCoachingNote(noteId);

      if (!note) {
        return res.status(404).json({ message: "Coaching note not found" });
      }

      await storage.deleteCoachingNote(noteId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  
  

  // Force update the admin user on server start for debugging
  (async () => {
    try {
      const adminEmail = "dcara@sli.pro";
      let adminUser = await storage.getUserByUsername(adminEmail);
      
      if (!adminUser) {
        // Create admin user with default credentials
        adminUser = await storage.createUser({
          username: adminEmail,
          password: await hashPassword(adminEmail), // Using email as password as specified
          firstName: "Admin",
          lastName: "User",
          phoneNumber: "123-456-7890",
          isAdmin: true // Make sure this is a boolean true, not a string
        });

        // Create an empty profile for admin
        await storage.createProfile({
          userId: adminUser.id,
          completionStep: 0,
          isComplete: false
        });
      }
      
      // Always force update the isAdmin flag for this user to ensure it's set properly
      const updatedUser = await storage.updateUser(adminUser.id, { isAdmin: true });      
    } catch (error) {
      console.error("Error setting up users:", error);
    }
  })();

  const httpServer = createServer(app);
  return httpServer;
}
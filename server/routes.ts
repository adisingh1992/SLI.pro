import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { z } from "zod";
import ExcelJS from "exceljs";
import { INTAKE_SCHEMA, resolveIntakeFieldValue } from "./intake-schema";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { registerSliRoutes } from "./sli-routes";
import { registerHomeworkRoutes } from "./homework-routes";
import { registerFreshnessRoutes } from "./freshness-routes";
import { registerLinkedinOptimizationRoutes } from "./linkedin-optimization-routes";
import { registerLinkedinContentRoutes } from "./linkedin-content-routes";
import { registerFoundationSessionsRoutes } from "./foundation-sessions-routes";
import { setupEnhancementModulesRoutes } from "./enhancement-modules-routes";
import { setupWebSocketServer } from "./realtime/websocket-handler";
import { registerPaymentRoutes } from "./payment-routes";
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
import { extractDocumentText, validateExtractedText } from "./document-extractor";
import Anthropic from "@anthropic-ai/sdk";

const scryptAsync = promisify(scrypt);

// Helper function for password hashing - needed for creating admin user
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

async function generateDocumentSummary(documentId: number, docType: string, fileData: string, fileName: string) {
  try {
    console.log(`[summary] Starting summary generation for document ${documentId} (${docType})`);

    const extractedText = await extractDocumentText(fileData, fileName);
    const cleanText = validateExtractedText(extractedText);

    if (!cleanText || cleanText.startsWith("[Document text extraction failed") || cleanText.startsWith("[PDF document appears to be empty")) {
      console.log(`[summary] Could not extract usable text from document ${documentId}`);
      return;
    }

    const systemPrompt = docType === "resume"
      ? `You are an expert resume analyst. Summarize this resume concisely, covering: career trajectory, key roles and companies, core skills, notable achievements, and education. Output plain text (not JSON). Keep the summary under 500 words.`
      : `You are an expert LinkedIn profile analyst. Summarize this LinkedIn profile concisely, covering: headline and positioning, professional experience highlights, skills and endorsements, education, and overall brand impression. Output plain text (not JSON). Keep the summary under 500 words.`;

    const userPrompt = `Here is the ${docType === "resume" ? "resume" : "LinkedIn profile"} content:\n\n${cleanText}\n\nPlease provide a concise professional summary.`;

    const response = await anthropicClient.messages.create({
      model: CLAUDE_MODEL,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: 1024,
      temperature: 0.3,
    });

    const textContent = response.content.find((item) => item.type === "text");
    if (textContent && "text" in textContent) {
      await storage.updateDocument(documentId, { analysisContent: textContent.text });
      console.log(`[summary] Summary saved for document ${documentId} (${textContent.text.length} chars)`);
    }
  } catch (error) {
    console.error(`[summary] Error generating summary for document ${documentId}:`, error);
  }
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
  setupEnhancementModulesRoutes(app);
  registerPaymentRoutes(app);

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

  // Onboarding route: save professionalStatus + discoverySource for LinkedIn users
  app.patch("/api/user/onboarding", isAuthenticated, async (req, res, next) => {
    try {
      const { professionalStatus, discoverySource, discoverySourceOther } = req.body;

      if (!professionalStatus || !discoverySource) {
        return res.status(400).json({ message: "professionalStatus and discoverySource are required" });
      }

      const updatedUser = await storage.updateUser(req.user.id, {
        professionalStatus,
        discoverySource,
        ...(discoverySourceOther ? { discoverySourceOther } : {}),
      });

      res.json(updatedUser);
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

      if (document.type === "resume" || document.type === "linkedin") {
        generateDocumentSummary(document.id, document.type, document.fileData, document.fileName).catch(err => {
          console.error(`Background summary generation failed for document ${document.id}:`, err);
        });
      }
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
      return await storage.getNonAdminUsers();
    }
    
    // Otherwise get all users using the proper storage method
    return await storage.getAllUsers();
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

    // Check Enhancement Modules (C > B > A) — use individual lookups to avoid auto-creation side effects
    const [moduleC, moduleB, moduleA] = await Promise.all([
      storage.getEnhancementModule(userId, 'C'),
      storage.getEnhancementModule(userId, 'B'),
      storage.getEnhancementModule(userId, 'A'),
    ]);
    if (moduleC?.status === 'completed') return "Enhancement Module C Completed";
    if (moduleB?.status === 'completed') return "Enhancement Module B Completed";
    if (moduleA?.status === 'completed') return "Enhancement Module A Completed";

    // Check Foundation Sessions (3 > 2 > 1)
    const foundationSessions = await storage.getFoundationSessions(userId);
    const completedSessions = foundationSessions
      .filter(s => s.status === 'completed')
      .map(s => s.sessionNumber);
    if (completedSessions.includes(3)) return "Foundation Session 3 Completed";
    if (completedSessions.includes(2)) return "Foundation Session 2 Completed";
    if (completedSessions.includes(1)) return "Foundation Session 1 Completed";

    // Check Documents
    const documents = await storage.getDocuments(userId);
    const hasResume = documents.some(doc => doc.type === 'resume');
    const hasLinkedin = documents.some(doc => doc.type === 'linkedin');
    if (hasResume && hasLinkedin) {
      return "Documents Uploaded";
    }

    // Check Branding Intake
    const brandingIntake = await storage.getBrandingIntake(userId);
    if (brandingIntake?.completed) {
      return "Registration Intake Completed";
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
      
      // Enhance each user with their status and branding intake data
      const enhancedUsers = await Promise.all(nonAdminUsers.map(async (user) => {
        const { password, ...userWithoutPassword } = user;
        const status = await getUserStatus(user.id);
        const brandingIntake = await storage.getBrandingIntake(user.id);
        const responses = (brandingIntake?.responses as Record<string, unknown>) ?? {};
        const school =
          (responses.university_name as string) ||
          (responses.undergrad_institution as string) ||
          (responses.grad_university_name as string) ||
          null;
        const academicProgram =
          (responses.major as string) ||
          (responses.highest_degree as string) ||
          null;
        return {
          ...userWithoutPassword,
          status,
          school,
          academicProgram,
          marketingOptIn: brandingIntake?.marketingOptIn ?? null,
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

  // Admin Excel export: branding intake data for all users
  app.get("/api/admin/export/branding-intake", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allUsers = await storage.getAllUsers();
      const nonAdminUsers = allUsers.filter((u) => !u.isAdmin);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "SLI.pro Admin";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet("Branding Intake");

      const headers = [
        "User Email",
        "Name",
        "Phone Number",
        "Branding Intake Question",
        "Branding Intake Answer",
        "Platform",
        "Created At",
      ];

      sheet.addRow(headers);

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5496" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 20;

      const colWidths = [30, 25, 18, 45, 40, 18, 22];
      colWidths.forEach((width, i) => {
        sheet.getColumn(i + 1).width = width;
      });

      const sortedUsers = [...nonAdminUsers].sort((a, b) =>
        (a.username || "").localeCompare(b.username || "")
      );

      for (const user of sortedUsers) {
        const intake = await storage.getBrandingIntake(user.id);

        if (!intake) continue;

        const platform = intake.platform as string;
        const stages = INTAKE_SCHEMA[platform] ?? [];
        const questions = stages.flatMap((stage) => stage.questions);

        if (questions.length === 0) continue;

        const responses = (intake.responses as Record<string, unknown>) ?? {};
        const createdAt = user.createdAt ? new Date(user.createdAt).toISOString().split("T")[0] : "";
        const name = `${user.firstName} ${user.lastName}`.trim();

        for (const question of questions) {
          const rawValue = responses[question.key];
          const answer = resolveIntakeFieldValue(question, rawValue);
          sheet.addRow([
            user.username,
            name,
            user.phoneNumber || "",
            question.label,
            answer,
            platform,
            createdAt,
          ]);
        }
      }

      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: headers.length },
      };

      sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="branding-intake-export-${new Date().toISOString().split("T")[0]}.xlsx"`
      );

      await workbook.xlsx.write(res);
      res.end();
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

  // Transcript routes - ADMIN only
  app.get("/api/admin/users/:userId/foundation-sessions/:sessionNumber/messages", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);
      const sessionNumber = parseInt(req.params.sessionNumber);
      const session = await storage.getFoundationSession(userId, sessionNumber);
      if (!session) {
        return res.json({ session: null, messages: [] });
      }
      const messages = await storage.getFoundationSessionMessages(session.id);
      res.json({ session, messages });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/users/:userId/enhancement-modules/:moduleCode/messages", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);
      const { moduleCode } = req.params;
      const result = await storage.getEnhancementModuleWithMessages(userId, moduleCode);
      if (!result) {
        return res.json({ module: null, messages: [] });
      }
      res.json(result);
    } catch (error) {
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

  // Branding Intake routes
  app.get("/api/branding-intake", isAuthenticated, async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const intake = await storage.getBrandingIntake(userId);
      res.json(intake || null);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/branding-intake", isAuthenticated, async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const bodySchema = z.object({
        platform: z.enum(["undergraduate", "early_career", "mid_career"]),
        currentStage: z.number().int().min(1).max(6),
        responses: z.record(z.any()).optional().default({}),
        completed: z.boolean().optional().default(false),
        marketingOptIn: z.boolean().optional().default(false),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: parsed.error.errors,
        });
      }
      const { platform, currentStage, responses, completed, marketingOptIn } = parsed.data;
      const intake = await storage.upsertBrandingIntake(userId, {
        platform,
        currentStage,
        responses,
        completed,
        marketingOptIn,
      });
      res.json(intake);
    } catch (error) {
      next(error);
    }
  });

  const httpServer = createServer(app);
  
  // Set up WebSocket server for voice functionality
  setupWebSocketServer(httpServer);
  
  return httpServer;
}
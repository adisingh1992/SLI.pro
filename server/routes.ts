import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { z } from "zod";
import ExcelJS from "exceljs";
import { INTAKE_SCHEMA, resolveIntakeFieldValue, QuestionEntry } from "./intake-schema";
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
  User,
  foundationSessions,
  foundationSessionMessages,
  enhancementModules,
  enhancementModuleMessages,
} from "@shared/schema";
import { db } from "./db";
import { and, asc, eq, inArray } from "drizzle-orm";
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
      const nonAdminUsers = allUsers.filter((u) => !u.isAdmin && !u.isTestUser);

      // Build a deduplicated ordered list of all questions across all platforms.
      // Columns are merged by label so questions that share wording across
      // platforms (e.g. "Target Industries") become a single column even if
      // they use different underlying keys (e.g. target_industries vs primary_industry).
      const allQuestions: { label: string; keys: string[] }[] = [];
      const labelIndex = new Map<string, number>();
      for (const platform of ["undergraduate", "early_career", "mid_career"]) {
        const stages = INTAKE_SCHEMA[platform] ?? [];
        for (const stage of stages) {
          for (const q of stage.questions) {
            const idx = labelIndex.get(q.label);
            if (idx === undefined) {
              labelIndex.set(q.label, allQuestions.length);
              allQuestions.push({ label: q.label, keys: [q.key] });
            } else if (!allQuestions[idx].keys.includes(q.key)) {
              allQuestions[idx].keys.push(q.key);
            }
          }
        }
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "SLI.pro Admin";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet("Branding Intake");

      // Fixed columns + one column per question
      const fixedHeaders = ["Email", "Name", "Phone Number", "Platform", "Account Created"];
      const headers = [...fixedHeaders, ...allQuestions.map((q) => q.label)];

      sheet.addRow(headers);

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5496" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      headerRow.height = 36;

      // Set column widths: fixed cols first, then 25 for each question
      const fixedWidths = [30, 25, 18, 16, 18];
      fixedWidths.forEach((width, i) => {
        sheet.getColumn(i + 1).width = width;
      });
      for (let i = 0; i < allQuestions.length; i++) {
        sheet.getColumn(fixedHeaders.length + i + 1).width = 30;
      }

      const sortedUsers = [...nonAdminUsers].sort((a, b) =>
        (a.username || "").localeCompare(b.username || "")
      );

      for (const user of sortedUsers) {
        const intake = await storage.getBrandingIntake(user.id);
        if (!intake) continue;

        const platform = intake.platform as string;
        const responses = (intake.responses as Record<string, unknown>) ?? {};
        const createdAt = user.createdAt ? new Date(user.createdAt).toISOString().split("T")[0] : "";
        const name = `${user.firstName} ${user.lastName}`.trim();

        // Build a key→resolved-answer map for this user's platform questions
        const answerMap: Record<string, string> = {};
        const stages = INTAKE_SCHEMA[platform] ?? [];
        for (const stage of stages) {
          for (const q of stage.questions) {
            answerMap[q.key] = resolveIntakeFieldValue(q, responses[q.key]);
          }
        }

        const row: (string)[] = [
          user.username || "",
          name,
          user.phoneNumber || "",
          platform,
          createdAt,
          ...allQuestions.map((q) => {
            // Use the first key for this label that has a non-empty answer.
            for (const key of q.keys) {
              const value = answerMap[key];
              if (value !== undefined && value !== "") return value;
            }
            return "";
          }),
        ];

        sheet.addRow(row);
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

  // Admin Excel export: questionnaire Q&A for all users
  app.get("/api/admin/export/questionnaire", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allUsers = await storage.getAllUsers();
      const nonAdminUsers = allUsers.filter((u) => !u.isAdmin && !u.isTestUser);

      function mapPlatform(status: string | null | undefined): string {
        if (!status) return "";
        if (status === "undergraduate_or_recent_grad") return "undergraduate";
        if (status === "early_career") return "early_career";
        if (status === "mid_career_or_senior" || status === "career_break_or_transition") return "mid_career";
        return status;
      }

      function formatAnswer(val: unknown): string {
        if (val === null || val === undefined || val === "") return "";
        if (Array.isArray(val)) return val.join(", ");
        return String(val);
      }

      type RawEntry = { question?: string; answer?: unknown; other?: unknown; aiSubtopics?: unknown };

      const Q_KEYS = ["Q1","Q2","Q3","Q4","Q5","Q6","Q7","Q8","Q9","Q10","Q11","Q12","Q13","Q14","Q15","Q16","Q17","Q18"];

      const sortedUsers = [...nonAdminUsers].sort((a, b) =>
        (a.username || "").localeCompare(b.username || "")
      );

      // First pass: load all questionnaires and determine a label for each Q key.
      // For platform-specific questions that have different text per user, collect
      // all unique texts and join them with " / " so the header is self-explanatory.
      const questionLabelSets: Record<string, Set<string>> = {};
      for (const key of Q_KEYS) questionLabelSets[key] = new Set();

      const userQuestionnaires: Map<number, Record<string, RawEntry>> = new Map();

      for (const user of sortedUsers) {
        const questionnaire = await storage.getQuestionnaire(user.id);
        if (!questionnaire?.rawAnswers) continue;
        const raw = questionnaire.rawAnswers as Record<string, RawEntry>;
        userQuestionnaires.set(user.id, raw);
        for (const key of Q_KEYS) {
          const label = raw[key]?.question;
          if (label) questionLabelSets[key].add(label);
        }
      }

      // Build ordered column labels: use first found for non-ambiguous questions,
      // combine with " / " for platform-specific ones.
      const questionLabels: Record<string, string> = {};
      for (const key of Q_KEYS) {
        const texts = Array.from(questionLabelSets[key]);
        questionLabels[key] = texts.length > 0 ? texts.join(" / ") : key;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "SLI.pro Admin";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet("Questionnaire");

      const fixedHeaders = ["Email", "Name", "Phone Number", "Platform", "Account Created"];
      const headers = [...fixedHeaders, ...Q_KEYS.map((k) => questionLabels[k])];

      sheet.addRow(headers);

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5496" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      headerRow.height = 36;

      const fixedWidths = [30, 25, 18, 16, 18];
      fixedWidths.forEach((width, i) => {
        sheet.getColumn(i + 1).width = width;
      });
      for (let i = 0; i < Q_KEYS.length; i++) {
        sheet.getColumn(fixedHeaders.length + i + 1).width = 35;
      }

      // Second pass: one row per user
      for (const user of sortedUsers) {
        const raw = userQuestionnaires.get(user.id);
        if (!raw) continue;

        const platform = mapPlatform(user.professionalStatus);
        const createdAt = user.createdAt ? new Date(user.createdAt).toISOString().split("T")[0] : "";
        const name = `${user.firstName} ${user.lastName}`.trim();

        const answerCells = Q_KEYS.map((key) => {
          const entry = raw[key];
          if (!entry) return "";
          const parts: string[] = [];
          const base = formatAnswer(entry.answer);
          if (base) parts.push(base);
          if (entry.other) parts.push(`Other: ${formatAnswer(entry.other)}`);
          if (Array.isArray(entry.aiSubtopics) && entry.aiSubtopics.length > 0) {
            parts.push(`AI/Tech subtopics: ${(entry.aiSubtopics as unknown[]).join(", ")}`);
          }
          return parts.join(" | ");
        });

        sheet.addRow([
          user.username || "",
          name,
          user.phoneNumber || "",
          platform,
          createdAt,
          ...answerCells,
        ]);
      }

      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: headers.length },
      };

      sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="questionnaire-export-${new Date().toISOString().split("T")[0]}.xlsx"`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  });

  // Admin Excel export: all non-test users with key coaching profile fields
  app.get("/api/admin/export/users", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allUsers = await storage.getAllUsers();
      const targetUsers = allUsers
        .filter((u) => !u.isAdmin && !u.isTestUser)
        .sort((a, b) => (a.username || "").localeCompare(b.username || ""));

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "SLI.pro Admin";
      workbook.created = new Date();
      const sheet = workbook.addWorksheet("Users");

      const headers = [
        "Email",
        "First Name",
        "Last Name",
        "Phone Number",
        "Professional Status",
        "Discovery Source",
        "Discovery Source (Other)",
        "Headline",
        "Bio",
        "Location",
        "LinkedIn Connected",
        "Subscription Tier",
        "Subscription Status",
        "Subscription Expires",
        "Premium Purchased",
        "Account Created",
        "Last Login",
        "Profile Complete",
        "Completion Step",
        "Branding Intake Platform",
        "Branding Intake Completed",
        "Branding Intake Stage",
        "Questionnaire Completed",
        "Documents Count",
        "Has Resume",
        "Has LinkedIn Doc",
        "Foundation Sessions Completed",
        "Enhancement Modules Completed",
        "SLI Generated",
        "SLI Selected",
        "SLI Refined",
        "Coaching Notes",
        "Homework Assigned",
        "Homework Answered",
        "Freshness Reports",
      ];

      sheet.addRow(headers);
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5496" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      headerRow.height = 36;

      const widths = [
        30, 18, 18, 18, 24, 22, 24, 32, 40, 22, 16, 16, 18, 18, 18, 16, 16, 14, 14, 22, 18, 14, 18, 14, 12, 16, 22, 22, 14, 14, 14, 14, 14, 16, 16,
      ];
      widths.forEach((w, i) => {
        sheet.getColumn(i + 1).width = w;
      });

      const fmtDate = (d: Date | string | null | undefined) =>
        d ? new Date(d).toISOString().split("T")[0] : "";
      const yn = (b: boolean) => (b ? "Yes" : "No");

      for (const user of targetUsers) {
        const [
          profile,
          intake,
          questionnaire,
          documents,
          foundationSessions,
          enhancementModules,
          slis,
          coachingNotes,
          homework,
          freshnessReports,
        ] = await Promise.all([
          storage.getProfile(user.id),
          storage.getBrandingIntake(user.id),
          storage.getQuestionnaire(user.id),
          storage.getDocuments(user.id),
          storage.getFoundationSessions(user.id),
          Promise.all([
            storage.getEnhancementModule(user.id, "A"),
            storage.getEnhancementModule(user.id, "B"),
            storage.getEnhancementModule(user.id, "C"),
          ]),
          storage.getSlisByUserId(user.id),
          storage.getCoachingNotes(user.id),
          storage.getHomeworkAssignments(user.id),
          storage.getFreshnessReports(user.id),
        ]);

        const docs = documents ?? [];
        const hasResume = docs.some((d) => (d.type || "").toLowerCase() === "resume");
        const hasLinkedinDoc = docs.some((d) => (d.type || "").toLowerCase() === "linkedin");
        const foundationCompleted = (foundationSessions ?? []).filter((s) => s.status === "completed").length;
        const enhancementCompleted = (enhancementModules ?? []).filter((m) => m?.status === "completed").length;
        const sliRecord = (slis ?? [])[0];
        const sliGenerated = !!sliRecord;
        const sliSelected = !!sliRecord && (sliRecord.selectedSliIndex !== null || !!sliRecord.customSliText);
        const sliRefined = !!sliRecord?.refinedSliText;
        const homeworkAssigned = (homework ?? []).length;
        const homeworkAnswered = (homework ?? []).filter((h) => !!h.answerText).length;
        const questionnaireCompleted = !!questionnaire && !questionnaire.isDraft;

        sheet.addRow([
          user.username || "",
          user.firstName || "",
          user.lastName || "",
          user.phoneNumber || "",
          user.professionalStatus || "",
          user.discoverySource || "",
          user.discoverySourceOther || "",
          user.headline || "",
          user.bio || "",
          user.location || "",
          yn(!!user.linkedinId),
          user.subscriptionTier || "",
          user.subscriptionStatus || "",
          fmtDate(user.subscriptionExpiresAt),
          fmtDate(user.premiumPurchasedAt),
          fmtDate(user.createdAt),
          fmtDate(user.lastLoginAt),
          yn(!!profile?.isComplete),
          profile?.completionStep ?? 0,
          intake?.platform || "",
          yn(!!intake?.completed),
          intake?.currentStage ?? 0,
          yn(questionnaireCompleted),
          docs.length,
          yn(hasResume),
          yn(hasLinkedinDoc),
          foundationCompleted,
          enhancementCompleted,
          yn(sliGenerated),
          yn(sliSelected),
          yn(sliRefined),
          (coachingNotes ?? []).length,
          homeworkAssigned,
          homeworkAnswered,
          (freshnessReports ?? []).length,
        ]);
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
        `attachment; filename="users-export-${new Date().toISOString().split("T")[0]}.xlsx"`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  });

  // Admin Excel export: chatbot session data (foundation sessions + enhancement modules)
  app.get("/api/admin/export/chatbot-sessions", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allUsers = await storage.getAllUsers();
      const nonAdminUsers = allUsers.filter((u) => !u.isAdmin && !u.isTestUser);

      function mapPlatform(status: string | null | undefined): string {
        if (!status) return "";
        if (status === "undergraduate_or_recent_grad") return "undergraduate";
        if (status === "early_career") return "early_career";
        if (status === "mid_career_or_senior" || status === "career_break_or_transition") return "mid_career";
        return status;
      }

      function formatStatus(status: string | null | undefined): string {
        if (!status) return "Not Started";
        const map: Record<string, string> = {
          locked: "Locked",
          available: "Available",
          in_progress: "In Progress",
          completed: "Completed",
        };
        return map[status] ?? status;
      }

      function formatDate(d: Date | null | undefined): string {
        if (!d) return "";
        return new Date(d).toISOString().split("T")[0];
      }

      function formatElapsed(seconds: number | null | undefined): string {
        if (!seconds || seconds === 0) return "";
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins === 0) return `${secs}s`;
        if (secs === 0) return `${mins}m`;
        return `${mins}m ${secs}s`;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "SLI.pro Admin";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet("Chatbot Sessions");

      const fixedHeaders = ["Email", "Name", "Phone Number", "Platform", "Account Created"];
      const sessionHeaders: string[] = [];

      for (let i = 1; i <= 3; i++) {
        sessionHeaders.push(`Foundation ${i} – Status`);
        sessionHeaders.push(`Foundation ${i} – Started`);
        sessionHeaders.push(`Foundation ${i} – Completed`);
        sessionHeaders.push(`Foundation ${i} – Time Spent`);
      }
      for (const mod of ["A", "B", "C"]) {
        sessionHeaders.push(`Module ${mod} – Status`);
        sessionHeaders.push(`Module ${mod} – Started`);
        sessionHeaders.push(`Module ${mod} – Completed`);
        sessionHeaders.push(`Module ${mod} – Time Spent`);
      }

      const headers = [...fixedHeaders, ...sessionHeaders];
      sheet.addRow(headers);

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5496" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      headerRow.height = 40;

      const fixedWidths = [30, 25, 18, 16, 18];
      fixedWidths.forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
      for (let i = 0; i < sessionHeaders.length; i++) {
        const colType = i % 4; // 0=status, 1=started, 2=completed, 3=time
        const width = colType === 0 ? 16 : colType === 3 ? 14 : 14;
        sheet.getColumn(fixedHeaders.length + i + 1).width = width;
      }

      const sortedUsers = [...nonAdminUsers].sort((a, b) =>
        (a.username || "").localeCompare(b.username || "")
      );

      for (const user of sortedUsers) {
        const [foundationList, moduleList] = await Promise.all([
          storage.getFoundationSessions(user.id),
          storage.getEnhancementModulesForUser(user.id),
        ]);

        const fsMap: Record<number, typeof foundationList[number]> = {};
        for (const s of foundationList) fsMap[s.sessionNumber] = s;

        const emMap: Record<string, typeof moduleList[number]> = {};
        for (const m of moduleList) emMap[m.moduleCode] = m;

        const platform = mapPlatform(user.professionalStatus);
        const createdAt = user.createdAt ? new Date(user.createdAt).toISOString().split("T")[0] : "";
        const name = `${user.firstName} ${user.lastName}`.trim();

        const sessionCells: string[] = [];

        for (let i = 1; i <= 3; i++) {
          const s = fsMap[i];
          sessionCells.push(formatStatus(s?.status));
          sessionCells.push(formatDate(s?.startedAt));
          sessionCells.push(formatDate(s?.completedAt));
          sessionCells.push(formatElapsed(s?.timerElapsed));
        }
        for (const mod of ["A", "B", "C"]) {
          const m = emMap[mod];
          sessionCells.push(formatStatus(m?.status));
          sessionCells.push(formatDate(m?.startedAt));
          sessionCells.push(formatDate(m?.completedAt));
          sessionCells.push(formatElapsed(m?.timerElapsed));
        }

        sheet.addRow([
          user.username || "",
          name,
          user.phoneNumber || "",
          platform,
          createdAt,
          ...sessionCells,
        ]);
      }

      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: headers.length },
      };

      sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="chatbot-sessions-export-${new Date().toISOString().split("T")[0]}.xlsx"`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  });

  // Admin Excel export: full chat transcripts for a single Foundation Session or Enhancement Module
  app.get("/api/admin/export/transcripts", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const type = String(req.query.type || "");
      const id = String(req.query.id || "");

      if (type !== "foundation" && type !== "enhancement") {
        return res.status(400).json({ error: "Invalid type. Must be 'foundation' or 'enhancement'." });
      }

      const isFoundation = type === "foundation";
      let label = "";
      let sessionNumber = 0;
      let moduleCode = "";

      if (isFoundation) {
        sessionNumber = parseInt(id);
        if (![1, 2, 3].includes(sessionNumber)) {
          return res.status(400).json({ error: "Invalid session number. Must be 1, 2, or 3." });
        }
        label = `Foundation Session ${sessionNumber}`;
      } else {
        moduleCode = id.toUpperCase();
        if (!["A", "B", "C"].includes(moduleCode)) {
          return res.status(400).json({ error: "Invalid module code. Must be A, B, or C." });
        }
        label = `Enhancement Module ${moduleCode}`;
      }

      const allUsers = await storage.getAllUsers();
      const nonAdminUsers = allUsers.filter((u) => !u.isAdmin && !u.isTestUser);
      const sortedUsers = [...nonAdminUsers].sort((a, b) =>
        (a.username || "").localeCompare(b.username || "")
      );

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "SLI.pro Admin";
      workbook.created = new Date();

      const usedSheetNames = new Set<string>();
      function sanitizeSheetName(email: string): string {
        let base = email.replace(/[:\\\/\?\*\[\]]/g, "_");
        if (base.length === 0) base = "user";
        if (base.length > 31) base = base.slice(0, 31);
        let candidate = base;
        let counter = 2;
        while (usedSheetNames.has(candidate.toLowerCase())) {
          const suffix = `_${counter}`;
          const trimmedBase = base.slice(0, Math.max(1, 31 - suffix.length));
          candidate = trimmedBase + suffix;
          counter++;
        }
        usedSheetNames.add(candidate.toLowerCase());
        return candidate;
      }

      const pstFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      function fmtPST(d: Date | string | null | undefined): string {
        if (!d) return "";
        const date = d instanceof Date ? d : new Date(d);
        if (isNaN(date.getTime())) return "";
        return `${pstFormatter.format(date)} PST`;
      }

      type SessionRecord = {
        id: number;
        userId: number;
        startedAt: Date | null;
        completedAt: Date | null;
        status: string;
        createdAt: Date;
      };
      type TranscriptMessage = {
        role: string;
        content: string;
        createdAt: Date;
      };

      const userIds = sortedUsers.map((u) => u.id);
      const recordsByUser = new Map<number, SessionRecord[]>();
      const messagesByRecord = new Map<number, TranscriptMessage[]>();

      if (userIds.length > 0) {
        if (isFoundation) {
          const rows = await db
            .select()
            .from(foundationSessions)
            .where(
              and(
                inArray(foundationSessions.userId, userIds),
                eq(foundationSessions.sessionNumber, sessionNumber),
              ),
            );
          for (const r of rows) {
            const rec: SessionRecord = {
              id: r.id,
              userId: r.userId,
              startedAt: (r.startedAt as Date | null) ?? null,
              completedAt: (r.completedAt as Date | null) ?? null,
              status: r.status,
              createdAt: r.createdAt as Date,
            };
            const list = recordsByUser.get(r.userId) ?? [];
            list.push(rec);
            recordsByUser.set(r.userId, list);
          }
          const recordIds = rows.map((r) => r.id);
          if (recordIds.length > 0) {
            const msgRows = await db
              .select()
              .from(foundationSessionMessages)
              .where(inArray(foundationSessionMessages.sessionId, recordIds))
              .orderBy(asc(foundationSessionMessages.createdAt));
            for (const m of msgRows) {
              const list = messagesByRecord.get(m.sessionId) ?? [];
              list.push({ role: m.role, content: m.content, createdAt: m.createdAt as Date });
              messagesByRecord.set(m.sessionId, list);
            }
          }
        } else {
          const rows = await db
            .select()
            .from(enhancementModules)
            .where(
              and(
                inArray(enhancementModules.userId, userIds),
                eq(enhancementModules.moduleCode, moduleCode),
              ),
            );
          for (const r of rows) {
            const rec: SessionRecord = {
              id: r.id,
              userId: r.userId,
              startedAt: (r.startedAt as Date | null) ?? null,
              completedAt: (r.completedAt as Date | null) ?? null,
              status: r.status,
              createdAt: r.createdAt as Date,
            };
            const list = recordsByUser.get(r.userId) ?? [];
            list.push(rec);
            recordsByUser.set(r.userId, list);
          }
          const recordIds = rows.map((r) => r.id);
          if (recordIds.length > 0) {
            const msgRows = await db
              .select()
              .from(enhancementModuleMessages)
              .where(inArray(enhancementModuleMessages.moduleId, recordIds))
              .orderBy(asc(enhancementModuleMessages.createdAt));
            for (const m of msgRows) {
              const list = messagesByRecord.get(m.moduleId) ?? [];
              list.push({ role: m.role, content: m.content, createdAt: m.createdAt as Date });
              messagesByRecord.set(m.moduleId, list);
            }
          }
        }
      }

      let userCount = 0;

      for (const user of sortedUsers) {
        const userRecords = (recordsByUser.get(user.id) ?? [])
          .slice()
          .sort((a, b) => {
            const aTime = a.startedAt ? a.startedAt.getTime() : a.createdAt.getTime();
            const bTime = b.startedAt ? b.startedAt.getTime() : b.createdAt.getTime();
            return aTime - bTime;
          });

        const recordsWithMessages = userRecords
          .map((rec) => ({ rec, messages: messagesByRecord.get(rec.id) ?? [] }))
          .filter((x) => x.messages.length > 0);

        if (recordsWithMessages.length === 0) continue;

        const sheetName = sanitizeSheetName(user.username || `user-${user.id}`);
        const sheet = workbook.addWorksheet(sheetName);

        sheet.addRow(["Message #", "Date & Time (PST)", "Sender", "Message"]);
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5496" } };
        headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        headerRow.height = 28;

        sheet.getColumn(1).width = 12;
        sheet.getColumn(2).width = 26;
        sheet.getColumn(3).width = 12;
        sheet.getColumn(4).width = 100;

        sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

        recordsWithMessages.forEach((item, idx) => {
          if (recordsWithMessages.length > 1) {
            const startedTxt = item.rec.startedAt ? fmtPST(item.rec.startedAt) : "unknown";
            const completedTxt = item.rec.completedAt ? `, completed ${fmtPST(item.rec.completedAt)}` : "";
            const dividerText = `Conversation ${idx + 1} — started ${startedTxt}${completedTxt} (status: ${item.rec.status})`;
            const dividerRow = sheet.addRow([dividerText, "", "", ""]);
            sheet.mergeCells(dividerRow.number, 1, dividerRow.number, 4);
            const cell = dividerRow.getCell(1);
            cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8497B0" } };
            cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
          }
          item.messages.forEach((m, i) => {
            const sender = m.role === "user" ? "User" : "Chatbot";
            const row = sheet.addRow([i + 1, fmtPST(m.createdAt), sender, m.content]);
            row.getCell(1).alignment = { vertical: "top", horizontal: "right" };
            row.getCell(2).alignment = { vertical: "top" };
            row.getCell(3).alignment = { vertical: "top" };
            row.getCell(4).alignment = { wrapText: true, vertical: "top" };
          });
        });

        userCount++;
      }

      if (userCount === 0) {
        const sheet = workbook.addWorksheet("No Data");
        sheet.addRow([`No transcripts found for ${label}`]);
      }

      const slug = isFoundation
        ? `foundation-${sessionNumber}`
        : `enhancement-${moduleCode.toLowerCase()}`;
      const today = new Date().toISOString().split("T")[0];
      const filename = `session-transcripts-${slug}-${today}.xlsx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

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
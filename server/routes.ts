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
import { registerHeuristicsRoutes } from "./heuristics-routes";
import { registerGateAuditRoutes } from "./gate-audit-routes";
import { registerVoiceRoutes } from "./voice-routes";
import { registerTaggingRoutes } from "./tagging-routes";
import { registerCriteriaRoutes } from "./criteria-routes";
import { registerMethodologyRoutes } from "./methodology-routes";
import { registerAdvisorRoutes } from "./advisor-routes";
import { registerTemplateRoutes } from "./template-routes";
import { registerMetricsRoutes } from "./metrics-routes";
import { registerInstitutionRoutes } from "./institution-routes";
import { registerLifeLogRoutes } from "./life-log-routes";
import { registerNotificationPreferencesRoutes } from "./notification-preferences-routes";
import { registerInboundEmailRoutes } from "./inbound-email-routes";
import { registerPromptLibraryRoutes } from "./prompt-library-routes";
import { registerIntakeRoutes } from "./intake-routes";
import { registerRefreshRoutes } from "./refresh-routes";
import { registerPortfolioRoutes } from "./portfolio-routes";
import * as checkinStore from "./wing/checkin-store";
import { registerCalendarRoutes } from "./calendar-routes";
import * as blobStorage from "./blob-storage";
import { getDocumentBase64 } from "./document-data";
import * as orchestrator from "./orchestrator";
import * as wingStore from "./wing/session-store";
import * as identity from "./wing/identity-store";
import type { AuthUser } from "./wing/identity-store";
import { cohortSummary } from "./wing/cohort-summary";
import { studentRecord } from "./wing/student-record";
import * as sliStore from "./wing/sli-store";
import * as artifactStore from "./wing/artifact-store";
import * as wingModuleStore from "./wing/enhancement-store";
import { isAiTurn } from "./wing/turn-type";
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
} from "@shared/schema";
/*
 * No `db` and no drizzle operators here any more.
 *
 * The last raw-table read in this file was the transcript export, which queried the
 * legacy `public` tables directly. With it going through `wing/session-store`, the
 * route layer no longer reaches past the stores into the schema — which is the point:
 * a route that builds its own query is a route that can miss a filter every store
 * already applies.
 */
import { extractDocumentText, validateExtractedText } from "./document-extractor";
import * as docStore from "./wing/document-store";
import * as intakeStore from "./wing/intake-store";
import * as profileStore from "./wing/profile-store";
import { isAdmin, isPlatformAdmin, isStudent, requireScope } from "./admin-guards";
import {
  userIdsForInstitution,
  isStudentInScope,
  requireStudentInScope,
} from "./wing/admin-scope";

const scryptAsync = promisify(scrypt);

// Helper function for password hashing - needed for creating admin user
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

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

    // Document summarisation is an analysis task -> mid tier.
    const { text } = await orchestrator.complete({
      tier: "mid",
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1024,
      temperature: 0.3,
    });

    if (text) {
      await docStore.updateDocument(documentId, { analysisContent: text });
      console.log(`[summary] Summary saved for document ${documentId} (${text.length} chars)`);
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
  registerHomeworkRoutes(app);
  registerFoundationSessionsRoutes(app);
  setupEnhancementModulesRoutes(app);
  registerPaymentRoutes(app);
  registerHeuristicsRoutes(app);
  registerGateAuditRoutes(app);
  registerVoiceRoutes(app);
  registerTaggingRoutes(app);
  registerCriteriaRoutes(app);
  registerMethodologyRoutes(app);
  registerAdvisorRoutes(app);
  registerTemplateRoutes(app);
  registerMetricsRoutes(app);
  registerInstitutionRoutes(app);
  registerLifeLogRoutes(app);
  registerNotificationPreferencesRoutes(app);
  registerInboundEmailRoutes(app);
  registerPromptLibraryRoutes(app);
  registerIntakeRoutes(app);
  registerRefreshRoutes(app);
  registerPortfolioRoutes(app);
  registerCalendarRoutes(app);

  /*
   * `isAuthenticated` stays "signed in", unchanged, and is now used ONLY by the
   * three /api/documents/:id routes below (GET, DELETE, PATCH .../analysis).
   * Each of those has its own ownership-OR-admin check inline
   * (`document.studentId !== callerStudentId && !req.user.isAdmin`) — a
   * deliberate, existing admin capability to read or manage a specific
   * student's uploaded document by id. Swapping their guard to `isStudent`
   * would 403 an admin before that check ever runs, removing a capability that
   * works today.
   *
   * Every OTHER route in this file that used to share this guard is a
   * caller's own record with no such bypass — most read straight off
   * `req.user.id`, and the handful with an ownership check (experiences,
   * education, skills, languages, by :id) have no `!req.user.isAdmin` branch,
   * so an admin hitting them already gets refused today, just with a generic
   * "Unauthorized" from the ownership check instead of a named one. Those are
   * now on `isStudent` directly, imported from admin-guards — the earlier admin
   * refusal is now explicit at the door instead of implicit three lines later.
   */
  const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };

  // Middleware to check if user is an admin
  // Profile routes
  app.patch("/api/profile", isStudent, async (req, res, next) => {
    try {
      const validationResult = updateProfileSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const userId = req.user.id;

      // Onboarding progress lives on wing.students. There is no create step:
      // the student row exists from registration, and a missing one means a
      // deeper problem than this endpoint should paper over.
      const onboarding = await import("./wing/onboarding-store");

      // headline / bio / location have no column in wing.users: the LinkedIn
      // upload is the profile source now (feature list A2), and the legacy
      // structured profile sub-records are archived to legacy_records (§14).
      // Accepted and ignored rather than failing the request.

      const updatedProfile = await onboarding.updateProfile(userId, {
        completionStep: req.body.completionStep,
        isComplete: req.body.isComplete,
      });

      res.json(updatedProfile);
    } catch (error) {
      next(error);
    }
  });

  // Onboarding route: save professionalStatus + discoverySource for LinkedIn users
  app.patch("/api/user/onboarding", isStudent, async (req, res, next) => {
    try {
      const { professionalStatus, discoverySource, discoverySourceOther } = req.body;

      if (!professionalStatus || !discoverySource) {
        return res.status(400).json({ message: "professionalStatus and discoverySource are required" });
      }

      const updatedUser = await identity.updateUser(req.user.id, {
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
  app.get("/api/experiences", isStudent, async (req, res, next) => {
    try {
      const experiences = await storage.getExperiences(req.user.id);
      res.json(experiences);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/experiences", isStudent, async (req, res, next) => {
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

  app.put("/api/experiences/:id", isStudent, async (req, res, next) => {
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
    isStudent,
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
  app.get("/api/education", isStudent, async (req, res, next) => {
    try {
      const education = await storage.getEducations(req.user.id);
      res.json(education);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/education", isStudent, async (req, res, next) => {
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

  app.put("/api/education/:id", isStudent, async (req, res, next) => {
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

  app.delete("/api/education/:id", isStudent, async (req, res, next) => {
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
  app.get("/api/skills", isStudent, async (req, res, next) => {
    try {
      const skills = await storage.getSkills(req.user.id);
      res.json(skills);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skills", isStudent, async (req, res, next) => {
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

  app.delete("/api/skills/:id", isStudent, async (req, res, next) => {
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
  app.get("/api/languages", isStudent, async (req, res, next) => {
    try {
      const languages = await storage.getLanguages(req.user.id);
      res.json(languages);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/languages", isStudent, async (req, res, next) => {
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

  app.delete("/api/languages/:id", isStudent, async (req, res, next) => {
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
  app.get("/api/questionnaire", isStudent, async (req, res, next) => {
    try {
      const questionnaire = await intakeStore.getQuestionnaire(req.user.id);
      if (!questionnaire) {
        return res.status(404).json({ message: "Questionnaire not found" });
      }
      res.json(questionnaire);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/questionnaire", isStudent, async (req, res, next) => {
    try {
      // Check if user already has a questionnaire
      const existingQuestionnaire = await intakeStore.getQuestionnaire(req.user.id);

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

      /*
       * intakeStore, not storage — see the note on the draft route below.
       * The reads on this surface were migrated to wing and the writes were
       * not, which breaks submission outright for anyone who registered after
       * the cutover.
       */
      // userId is stripped: the store takes it as its own argument and the
      // payload describes only the answers. Leaving it in would put a second,
      // unvalidated copy of the id inside the stored JSON.
      const { userId: _ignored, ...answers } = validationResult.data;

      let questionnaire;
      if (existingQuestionnaire) {
        questionnaire = await intakeStore.updateQuestionnaire(req.user!.id, answers);
        res.json(questionnaire);
      } else {
        questionnaire = await intakeStore.createQuestionnaire(req.user!.id, answers);
        res.status(201).json(questionnaire);
      }
    } catch (error) {
      next(error);
    }
  });

  // Route for saving draft questionnaire
  app.post(
    "/api/questionnaire/draft",
    isStudent,
    async (req, res, next) => {
      try {
        // Check if user already has a questionnaire
        const existingQuestionnaire = await intakeStore.getQuestionnaire(
          req.user!.id,
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
          userId: req.user!.id,
          isDraft: true, // Mark as draft
        });

        if (!validationResult.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validationResult.error.errors,
          });
        }

        /*
         * ── WHY intakeStore AND NOT storage ──────────────────────────────
         * `storage.createQuestionnaire` writes public.questionnaires, whose
         * user_id is a NOT NULL foreign key to public.users. Registration
         * creates a wing.users row and no public.users row at all, so this
         * threw a constraint violation for every student who signed up after
         * the cutover — questionnaire submission was simply broken for them.
         *
         * It hid because the READ on the very next line above was already
         * migrated: getQuestionnaire hits wing, finds nothing for a new user,
         * and routes them into the create branch that cannot succeed. Migrated
         * users have rows in both schemas, so anyone testing with one saw it
         * work.
         *
         * The identical shape broke registration (public.profiles) and half of
         * document-analysis.ts. The rule this file now follows: if the read is on wing,
         * the write is too. There is no case where mixing them is correct.
         */
        const { userId: _unused, ...answers } = validationResult.data;

        let questionnaire;
        if (existingQuestionnaire) {
          questionnaire = await intakeStore.updateQuestionnaire(req.user!.id, answers);
          res.json(questionnaire);
        } else {
          questionnaire = await intakeStore.createQuestionnaire(req.user!.id, answers);
          res.status(201).json(questionnaire);
        }
      } catch (error) {
        next(error);
      }
    },
  );

  app.put("/api/questionnaire", isStudent, async (req, res, next) => {
    try {
      // Check if user has a questionnaire to update
      const existingQuestionnaire = await intakeStore.getQuestionnaire(req.user.id);
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

      // intakeStore: the read four lines up is on wing, so the write must be
      // too. Writing to public.questionnaires here left the update invisible to
      // every subsequent read, for migrated users who did not hit the FK error.
      const { userId: _drop, ...answers } = validationResult.data;
      const updatedQuestionnaire = await intakeStore.updateQuestionnaire(
        req.user!.id,
        answers,
      );
      res.json(updatedQuestionnaire);
    } catch (error) {
      next(error);
    }
  });

  // Combined profile route for client - get user profile data including questionnaire
  app.get("/api/user/profile", isStudent, async (req, res, next) => {
    try {
      const userProfile = await profileStore.getUserProfile(req.user.id);
      const questionnaire = await intakeStore.getQuestionnaire(req.user.id);

      res.json({
        ...userProfile,
        questionnaire,
      });
    } catch (error) {
      next(error);
    }
  });

  // Document routes
  app.get("/api/documents", isStudent, async (req, res, next) => {
    try {
      const documents = await docStore.getDocuments(req.user.id);
      res.json(documents);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/documents/:id", isAuthenticated, async (req, res, next) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await docStore.getDocument(documentId);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Authorise by comparing student ids forward (robust), not by
      // reverse-resolving a legacy user id from the student.
      const callerStudentId = await docStore.studentIdForUser(req.user.id);
      if (document.studentId !== callerStudentId && !req.user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      // Content lives in Blob; the client still expects base64 to render the
      // PDF, so hydrate it on this single-document read only (never on list).
      try {
        const fileData = await docStore.getDocumentBase64(document);
        res.json({ ...document, fileData });
      } catch (err) {
        console.error(
          `[documents] failed to read blob '${document.blobUri}' for document ${document.id}:`,
          err,
        );
        return res
          .status(502)
          .json({ message: "Document content could not be retrieved from storage" });
      }
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/documents", isStudent, async (req, res, next) => {
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

      // The store owns Blob upload; content is never stored inline (spec §3).
      const incomingBase64 = validationResult.data.fileData;
      const document = await docStore.createDocument({
        userId: req.user.id,
        name: validationResult.data.name,
        fileName: validationResult.data.fileName,
        type: validationResult.data.type,
        fileData: incomingBase64,
      });

      res.status(201).json(document);

      if (document.type === "resume" || document.type === "linkedin") {
        // Use the bytes we already have rather than re-fetching from Blob.
        if (incomingBase64) {
          generateDocumentSummary(document.id, document.type, incomingBase64, document.fileName).catch(err => {
            console.error(`Background summary generation failed for document ${document.id}:`, err);
          });
        }
      }
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req, res, next) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await docStore.getDocument(documentId);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const callerStudentId = await docStore.studentIdForUser(req.user.id);
      if (document.studentId !== callerStudentId && !req.user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      // The store removes the blob as well, so no storage is orphaned.
      await docStore.deleteDocument(documentId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/documents/:id/analysis", isAuthenticated, async (req, res, next) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await docStore.getDocument(documentId);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Only admins or document owners can update the analysis
      const callerStudentId2 = await docStore.studentIdForUser(req.user.id);
      if (document.studentId !== callerStudentId2 && !req.user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const { analysisContent } = req.body;
      if (typeof analysisContent !== 'string') {
        return res.status(400).json({ message: "Analysis content must be a string" });
      }

      const updatedDocument = await docStore.updateDocument(documentId, { analysisContent });
      res.json(updatedDocument);
    } catch (error) {
      next(error);
    }
  });

  // Monthly Check-in Routes
  /*
   * Monthly check-ins — on wing (Feature List A2 / migration cleanup).
   *
   * These wrote `public.monthly_check_ins`, foreign-keyed to `public.users`.
   * Registration creates a wing.users row and no public one, so submitting a
   * check-in threw a constraint violation for every student who signed up after
   * the cutover. Fourth instance of that defect, after registration, the
   * questionnaire and homework.
   *
   * Keyed on month rather than on a row id, which is what the data actually
   * means: one check-in per student per month. The legacy table had no such
   * constraint, so a resubmitted month produced two rows and double counted in
   * every report.
   */
  app.get("/api/monthly-check-ins", isStudent, async (req, res, next) => {
    try {
      res.json(await checkinStore.listCheckIns(req.user!.id));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/monthly-check-ins/month/:month", isStudent, async (req, res, next) => {
    try {
      const checkIn = await checkinStore.getCheckIn(req.user!.id, req.params.month);
      if (!checkIn) return res.status(404).json({ message: "Monthly check-in not found" });
      res.json(checkIn);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Create or update the check-in for a month.
   *
   * One endpoint, not create-plus-update-plus-409. Ownership is implicit: the
   * student id comes from the session and the row is addressed by month, so
   * there is no id a caller could supply for somebody else's check-in.
   */
  app.post("/api/monthly-check-ins", isStudent, async (req, res, next) => {
    try {
      const month = String(req.body?.month ?? "").trim();
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ message: "month must be YYYY-MM" });
      }

      const body = req.body ?? {};

      /*
       * Screenshots: base64 in, Blob URIs out.
       *
       * The client sends three base64 payloads — contentScreenshots[],
       * engagementScreenshot and profileScreenshot — because the MVP stored
       * them inline in the row. The wing column holds URIs, so without this
       * they would be accepted and silently discarded, and the student would
       * have no way to tell their evidence had not been saved.
       *
       * Uploads that fail are skipped rather than failing the whole check-in:
       * losing a screenshot is recoverable, losing the whole submission after
       * someone filled in four steps is not.
       */
      const screenshotUris: string[] = [];
      const rawShots: { data: string; name: string }[] = [
        ...(Array.isArray(body.contentScreenshots)
          ? body.contentScreenshots
              .filter((s: any) => typeof s?.data === "string")
              .map((s: any) => ({ data: s.data, name: String(s.name ?? "content") }))
          : []),
        ...(typeof body.engagementScreenshot === "string" && body.engagementScreenshot
          ? [{ data: body.engagementScreenshot, name: "engagement" }]
          : []),
        ...(typeof body.profileScreenshot === "string" && body.profileScreenshot
          ? [{ data: body.profileScreenshot, name: "profile" }]
          : []),
      ];

      if (rawShots.length) {
        const blob = await import("./blob-storage");
        if (blob.isConfigured()) {
          for (const shot of rawShots) {
            try {
              // Strip a data: URL prefix if the client sent one.
              const payload = shot.data.includes(",")
                ? shot.data.slice(shot.data.indexOf(",") + 1)
                : shot.data;
              const uri = await blob.uploadBase64(blob.CONTAINERS.checkInMedia, payload, {
                fileName: `${month}-${shot.name}.png`,
                contentType: "image/png",
                prefix: `student-${req.user!.id}`,
              });
              screenshotUris.push(uri);
            } catch (err) {
              console.error(`[check-in] screenshot upload failed: ${(err as Error).message}`);
            }
          }
        } else {
          console.warn(
            `[check-in] ${rawShots.length} screenshot(s) discarded — Blob storage is not configured`,
          );
        }
      }

      const saved = await checkinStore.upsertCheckIn(req.user!.id, {
        month,
        contentPosts: Number(body.contentPosts) || 0,
        contentLinks: Array.isArray(body.contentLinks)
          ? body.contentLinks.filter((l: unknown) => typeof l === "string")
          : [],
        engagementFrequency: body.engagementFrequency ?? null,
        newConnections: Number(body.newConnections) || 0,
        targetConnectionPercentage: body.targetConnectionPercentage ?? null,
        recommendationImplementation: body.recommendationImplementation ?? null,
        implementationChallenges: body.implementationChallenges ?? null,
        updatedProfileVisuals: body.updatedProfileVisuals === true,
        screenshotUris,
      });

      if (!saved) {
        return res.status(404).json({ message: "No student record for this account" });
      }

      res.status(201).json(saved);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Every user, from the Wing schema.
   *
   * ── WHY THIS NO LONGER READS `storage` ───────────────────────────────────
   * `storage.getAllUsers()` selects from `public.users` — the legacy MVP table.
   * `identity.getUser()`, which every detail endpoint uses, selects from
   * `wing.users`. The identity migration assigned wing rows a **fresh serial**
   * and kept no mapping back to the legacy id, so the two tables number the
   * same people differently.
   *
   * That made the admin list actively wrong rather than merely stale:
   *
   *   - Clicking a row passed a legacy id to `/api/admin/users/:id`, which
   *     looked it up in `wing.users` and returned whoever happened to hold that
   *     id there. You got a real student — just not the one you clicked.
   *   - Worse and quieter: `getUserStatus()` and `getBrandingIntake()` are Wing
   *     stores. Feeding them legacy ids meant every enriched column — progress,
   *     school, programme, opt-in — was computed from a different student's
   *     data and displayed against this one's name.
   *
   * Nothing raised. Every row looked plausible. This is the same failure that
   * broke registration, the questionnaire, homework and check-ins: a read
   * migrated to `wing` with something left pointing at `public`.
   *
   * The rule this settles on: **an id that leaves an endpoint must be a wing
   * id**, because that is the id space every other endpoint resolves.
   */
  async function getAllUsers(excludeAdmins: boolean = false): Promise<AuthUser[]> {
    const all = await identity.listUsers();
    return excludeAdmins ? all.filter((u) => !u.isAdmin) : all;
  }

  /*
   * `getUserStatus()` lived here — a nine-query sequential walk that derived
   * one student's funnel position. It is gone, not merely unused: the same
   * precedence now lives in `wing/cohort-summary.ts` as a single statement,
   * and keeping a second implementation around is how the two end up
   * disagreeing about what "Documents Uploaded" means.
   */

  app.get("/api/admin/users", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scope = requireScope(req, res);
      if (!scope) return;

      let nonAdminUsers = (await getAllUsers(false)).filter((u) => !u.isAdmin);

      /*
       * Narrowed to the caller's institution. This is the busiest admin screen
       * and it listed every student on the platform to anybody who passed
       * `isAdmin` — which is correct for SLIpro staff and would not be for a
       * partner administrator.
       *
       * Filtered in memory against one extra query rather than pushed into
       * `getAllUsers`: the cohort list is already assembled here, and a student
       * with no `students` row would silently vanish from a join where this way
       * they are simply out of scope for a partner and still visible to staff.
       */
      if (scope.kind === "institution") {
        const inScope = await userIdsForInstitution(scope.institutionId);
        nonAdminUsers = nonAdminUsers.filter((u) => inScope.has(u.id));
      }

      /*
       * `user.id` here is a WING id, and every store below is a wing store.
       * That agreement is the whole point of the change in `getAllUsers` — it
       * used to be a legacy id, so each of these lookups returned a different
       * student's data and displayed it under this student's name.
       *
       * The allowlist is the same fix as GET /api/user and GET
       * /api/admin/users/:id: this used to spread the row and drop only
       * `passwordHash`, which shipped every user's `linkedinAccessToken` and
       * `linkedinRefreshToken` to the browser — the whole cohort's OAuth
       * credentials, in one response, on the busiest admin screen.
       */
      /*
       * ── ONE QUERY FOR THE WHOLE COHORT ───────────────────────────────────
       * This used to call `getUserStatus()` per student inside a Promise.all,
       * plus a second branding-intake fetch for the school column.
       * `getUserStatus` asks up to NINE questions in sequence, so 255 students
       * meant roughly 2,300 queries issued as 255 concurrent chains against a
       * ten-connection pool — they queue, and the screen waits for all of it.
       *
       * `cohortSummary()` computes the same funnel position for everybody in a
       * single statement. Two queries now serve this endpoint regardless of
       * cohort size.
       */
      const summary = await cohortSummary();

      const enhancedUsers = nonAdminUsers.map((user) => {
        const derived = summary.get(user.id);

        return {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          role: user.role,
          isAdmin: user.isAdmin,
          isTestUser: user.isTestUser,
          professionalStatus: user.professionalStatus,
          discoverySource: user.discoverySource,
          timezone: user.timezone,
          status: user.status,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,

          // Derived, for the list's columns. A student with no summary row is
          // one the join found nothing for — "Registered" is the honest answer,
          // not an error.
          journeyStatus: derived?.journeyStatus ?? "Registered",
          school: derived?.school ?? null,
          academicProgram: derived?.academicProgram ?? null,
          marketingOptIn: derived?.marketingOptIn ?? null,
        };
      });

      res.json(enhancedUsers);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/users/count", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scope = requireScope(req, res);
      if (!scope) return;

      const allUsers = await getAllUsers(false);
      let nonAdminUsers = allUsers.filter(user => user.isAdmin !== true);

      // Same narrowing as the list above — a count of the whole platform shown
      // under a partner's own heading is a wrong number, not just a wide one.
      if (scope.kind === "institution") {
        const inScope = await userIdsForInstitution(scope.institutionId);
        nonAdminUsers = nonAdminUsers.filter((u) => inScope.has(u.id));
      }

      res.json({ count: nonAdminUsers.length });
    } catch (error) {
      next(error);
    }
  });

  // Get user details (for admin)
  app.get("/api/admin/users/:id", isAdmin, async (req, res, next) => {
    try {
      const scope = requireScope(req, res);
      if (!scope) return;

      const userId = parseInt(req.params.id);
      const user = await identity.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      // Out of scope answers exactly as not-found does, so a partner
      // administrator cannot tell another institution's students apart from ids
      // that do not exist. See the note in wing/admin-scope.ts.
      if (!(await requireStudentInScope(scope, userId, res))) return;

      /*
       * ── ALLOWLIST, NOT DENYLIST ──────────────────────────────────────────
       * Names what goes out, so a field added to AuthUser later is not exposed
       * by default. This used to spread the profile and delete `passwordHash`,
       * which sent `linkedinAccessToken` and `linkedinRefreshToken` to the
       * browser — another person's live OAuth credentials, readable by any
       * admin, sitting in a client-side query cache.
       *
       * ── AND ONLY WHAT THE SCREEN RENDERS ─────────────────────────────────
       * `getUserProfile()` is the student's own dashboard payload: six
       * collections, all of them used there. This screen renders three, and
       * the three it skipped were the expensive ones — every document's
       * `extracted_text` (a resume and a LinkedIn export in full), an extra
       * artifact query per completed session with its jsonb embedded, plus SLI
       * records and freshness reports fetched and never read.
       *
       * That is what made this screen slow. Not a bad plan — just megabytes of
       * document text serialised to render a filename and a date.
       */
      // Platform staff see the demographic responses; institution admins do
      // not — see RESTRICTED_INTAKE_KEYS. Withheld here rather than only in the
      // UI, because a hidden field is still a sent field.
      const record = await studentRecord(userId, {
        includeRestricted: req.user?.role === "platform_admin",
      });
      res.json({ ...identity.publicUser(user), ...record });
    } catch (error) {
      next(error);
    }
  });

  // Admin Excel export: branding intake data for all users
  /*
   * PLATFORM STAFF ONLY, pending scoping.
   *
   * These five legacy Excel exports each build their own multi-table join and
   * none of them filters by institution. Rather than half-scope them now —
   * which would read as done — they are closed to partner administrators
   * until each query is narrowed. `/api/admin/metrics/export` is scoped and
   * is the B4 export a career centre actually needs.
   */
  app.get("/api/admin/export/branding-intake", isPlatformAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allUsers = await getAllUsers();
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
        const intake = await intakeStore.getBrandingIntake(user.id);
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
  /*
   * PLATFORM STAFF ONLY, pending scoping.
   *
   * These five legacy Excel exports each build their own multi-table join and
   * none of them filters by institution. Rather than half-scope them now —
   * which would read as done — they are closed to partner administrators
   * until each query is narrowed. `/api/admin/metrics/export` is scoped and
   * is the B4 export a career centre actually needs.
   */
  app.get("/api/admin/export/questionnaire", isPlatformAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allUsers = await getAllUsers();
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
        const questionnaire = await intakeStore.getQuestionnaire(user.id);
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
  /*
   * PLATFORM STAFF ONLY, pending scoping.
   *
   * These five legacy Excel exports each build their own multi-table join and
   * none of them filters by institution. Rather than half-scope them now —
   * which would read as done — they are closed to partner administrators
   * until each query is narrowed. `/api/admin/metrics/export` is scoped and
   * is the B4 export a career centre actually needs.
   */
  app.get("/api/admin/export/users", isPlatformAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allUsers = await getAllUsers();
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
        "LinkedIn Connected",
        "Account Created",
        "Last Login",
      ];

      sheet.addRow(headers);
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5496" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      headerRow.height = 36;

      const widths = [30, 18, 18, 18, 24, 22, 24, 16, 16, 16];
      widths.forEach((w, i) => {
        sheet.getColumn(i + 1).width = w;
      });

      const fmtDate = (d: Date | string | null | undefined) =>
        d ? new Date(d).toISOString().split("T")[0] : "";
      const yn = (b: boolean) => (b ? "Yes" : "No");

      for (const user of targetUsers) {
        sheet.addRow([
          user.username || "",
          user.firstName || "",
          user.lastName || "",
          user.phoneNumber || "",
          user.professionalStatus || "",
          user.discoverySource || "",
          user.discoverySourceOther || "",
          yn(!!user.linkedinId),
          fmtDate(user.createdAt),
          fmtDate(user.lastLoginAt),
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
  /*
   * PLATFORM STAFF ONLY, pending scoping.
   *
   * These five legacy Excel exports each build their own multi-table join and
   * none of them filters by institution. Rather than half-scope them now —
   * which would read as done — they are closed to partner administrators
   * until each query is narrowed. `/api/admin/metrics/export` is scoped and
   * is the B4 export a career centre actually needs.
   */
  app.get("/api/admin/export/chatbot-sessions", isPlatformAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allUsers = await getAllUsers();
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
          wingStore.getFoundationSessionsForUser(user),
          wingModuleStore.getEnhancementModulesForUser(user.id),
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
  /*
   * PLATFORM STAFF ONLY, pending scoping.
   *
   * These five legacy Excel exports each build their own multi-table join and
   * none of them filters by institution. Rather than half-scope them now —
   * which would read as done — they are closed to partner administrators
   * until each query is narrowed. `/api/admin/metrics/export` is scoped and
   * is the B4 export a career centre actually needs.
   */
  app.get("/api/admin/export/transcripts", isPlatformAdmin, async (req: Request, res: Response, next: NextFunction) => {
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

      const allUsers = await getAllUsers();
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

      /*
       * ── READ FROM THE WING TABLES, NOT THE LEGACY ONES ──────────────────
       * This route used to select from `public.foundation_session_messages` and
       * `public.enhancement_module_messages`. Nothing has written to either since the
       * cutover — every turn now lands in `wing.transcript_turns` — so the export had
       * been silently returning "No transcripts found" for every session and module
       * while looking exactly like a working feature. The sibling export two routes up
       * was repointed at `wingStore` and this one was missed.
       *
       * Speaker comes from `turn_type` via `isAiTurn`, never from `provenance_tag`:
       * every migrated turn carries `provenance_unknown` by design, so keying on
       * provenance would render Wing's own questions as the student's words in an
       * export an advisor reads as a record of the conversation.
       */
      const wingTypes = isFoundation
        ? ([`foundation_${sessionNumber}`] as wingStore.WingSessionType[])
        : ([`enhancement_${moduleCode.toLowerCase()}`] as wingStore.WingSessionType[]);

      const userIds = sortedUsers.map((u) => u.id);
      const recordsByUser = new Map<number, SessionRecord[]>();
      const messagesByRecord = new Map<number, TranscriptMessage[]>();

      const seenSession = new Set<number>();
      for (const t of await wingStore.turnsForExport(wingTypes, userIds)) {
        if (!seenSession.has(t.sessionId)) {
          seenSession.add(t.sessionId);
          const list = recordsByUser.get(t.wingUserId) ?? [];
          list.push({
            id: t.sessionId,
            startedAt: t.sessionStartedAt,
            completedAt: t.sessionCompletedAt,
            status: t.sessionStatus,
            createdAt: t.sessionCreatedAt,
          });
          recordsByUser.set(t.wingUserId, list);
        }
        const msgs = messagesByRecord.get(t.sessionId) ?? [];
        msgs.push({
          role: isAiTurn(t.turnType as any) ? "assistant" : "user",
          content: t.content,
          createdAt: t.createdAt,
        });
        messagesByRecord.set(t.sessionId, msgs);
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
      const scope = requireScope(req, res);
      if (!scope) return;
      const userId = parseInt(req.params.userId);

      const target = await identity.getUser(userId);
      if (!target) return res.status(404).json({ error: "User not found" });
      if (!(await requireStudentInScope(scope, userId, res))) return;

      /*
       * Sessions live in wing; create the arc on first access. This was a duplicate of
       * `initializeFoundationSessions` in foundation-sessions-routes.ts, seeding 2 and 3
       * as `locked` — so ruling 1 had to be applied in two places or in neither. One
       * helper now, in the store, all three at the column default.
       */
      const studentId = await wingStore.studentIdFor(target as any);
      await wingStore.ensureFoundationArc(studentId);

      res.json(await wingStore.getFoundationSessionsForUser(target));
    } catch (error) {
      console.error("Error fetching admin foundation sessions:", error);
      next(error);
    }
  });

  // Transcript routes - ADMIN only
  app.get("/api/admin/users/:userId/foundation-sessions/:sessionNumber/messages", isAdmin, async (req, res, next) => {
    try {
      const scope = requireScope(req, res);
      if (!scope) return;
      const userId = parseInt(req.params.userId);
      const sessionNumber = parseInt(req.params.sessionNumber);
      const target = await identity.getUser(userId);
      if (!target) return res.json({ session: null, messages: [] });
      // Matches the empty answer above rather than 404: this route already
      // reports "no such student" as an empty transcript, and an out-of-scope
      // student must be indistinguishable from that.
      if (!(await isStudentInScope(scope, userId))) {
        return res.json({ session: null, messages: [] });
      }

      const session = await wingStore.getFoundationSessionForUser(target, sessionNumber);
      if (!session) {
        return res.json({ session: null, messages: [] });
      }
      // Turns carry provenance; the admin transcript view shows them in order.
      const turns = await wingStore.getTurns(session.id);
      res.json({ session, messages: turns, turns });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/users/:userId/enhancement-modules/:moduleCode/messages", isAdmin, async (req, res, next) => {
    try {
      const scope = requireScope(req, res);
      if (!scope) return;
      const userId = parseInt(req.params.userId);
      const { moduleCode } = req.params;
      if (!(await isStudentInScope(scope, userId))) {
        return res.json({ module: null, messages: [] });
      }
      const result = await wingModuleStore.getEnhancementModuleWithMessages(userId, moduleCode);
      if (!result) {
        return res.json({ module: null, messages: [] });
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Coaching Notes routes - ADMIN only
  /*
   * Coaching notes — on wing (migration cleanup).
   *
   * public.coaching_notes had TWO foreign keys to public.users: the student and
   * the admin who wrote the note. Both broke for post-cutover accounts, so a
   * coach could not record anything about any student who registered after the
   * migration. Fifth and last reachable instance of that defect.
   *
   * The author is nullable here, unlike the legacy NOT NULL. Staff accounts
   * were not all migrated, and a note whose author cannot be resolved is still
   * worth keeping — dropping the note to preserve the reference would lose the
   * more valuable half.
   */
  app.get("/api/admin/users/:userId/coaching-notes", isAdmin, async (req, res, next) => {
    try {
      const scope = requireScope(req, res);
      if (!scope) return;
      const userId = parseInt(req.params.userId, 10);
      if (Number.isNaN(userId)) return res.status(400).json({ message: "Invalid user id" });
      if (!(await requireStudentInScope(scope, userId, res))) return;

      res.json(await checkinStore.listNotes(userId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/coaching-notes", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(String(req.body?.userId ?? ""), 10);
      const content = String(req.body?.content ?? "").trim();

      if (Number.isNaN(userId)) return res.status(400).json({ message: "userId is required" });
      if (!content) return res.status(400).json({ message: "content is required" });

      const note = await checkinStore.createNote({
        userId,
        authorUserId: req.user!.id,
        content,
      });

      if (!note) {
        return res.status(404).json({ message: "That account has no student record" });
      }

      res.status(201).json(note);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/admin/coaching-notes/:id", isAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid note id" });

      const content = String(req.body?.content ?? "").trim();
      if (!content) return res.status(400).json({ message: "content is required" });

      const updated = await checkinStore.updateNote(id, content);
      if (!updated) return res.status(404).json({ message: "Coaching note not found" });

      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/coaching-notes/:id", isAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid note id" });

      await checkinStore.deleteNote(id);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Force update the admin user on server start for debugging
  (async () => {
    try {
      // Identity lives in wing.users; admin is a ROLE now, not a boolean.
      const adminEmail = "dcara@sli.pro";
      let adminUser = await identity.getUserByEmail(adminEmail);

      if (!adminUser) {
        adminUser = await identity.createUser({
          email: adminEmail,
          passwordHash: await hashPassword(adminEmail),
          firstName: "Admin",
          lastName: "User",
          phoneNumber: "123-456-7890",
          role: "platform_admin",
        });
      } else if (adminUser.role !== "platform_admin") {
        await identity.updateUser(adminUser.id, { role: "platform_admin" });
      }
    } catch (error) {
      console.error("Error setting up users:", error);
    }
  })();

  // Branding Intake routes
  app.get("/api/branding-intake", isStudent, async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const intake = await intakeStore.getBrandingIntake(userId);
      res.json(intake || null);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/branding-intake", isStudent, async (req, res, next) => {
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
      const intake = await intakeStore.upsertBrandingIntake(userId, {
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
import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import * as sliStore from "./wing/sli-store";
import * as artifactStore from "./wing/artifact-store";
import { generateLinkedInOptimization } from "./linkedin-optimization";
import * as docStore from "./wing/document-store";

// Middleware to check if user is authenticated
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
};

export function registerLinkedinOptimizationRoutes(app: Express) {
  // Get all LinkedIn optimizations for the current user
  app.get("/api/linkedin-optimizations", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const optimizations = await artifactStore.getLinkedinOptimizations(userId);
      res.json(optimizations);
    } catch (error) {
      console.error("Error fetching LinkedIn optimizations:", error);
      res.status(500).json({ error: "Failed to fetch LinkedIn optimizations" });
    }
  });

  // Get latest LinkedIn optimization for the current user
  app.get("/api/linkedin-optimizations/latest", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      // artifactStore (wing), not legacy storage — optimisations are written
      // to wing.linkedin_optimizations.
      const optimization = await artifactStore.getLatestLinkedinOptimization(userId);
      if (!optimization) {
        res.status(404).json({ error: "No LinkedIn optimization found" });
        return;
      }
      res.json(optimization);
    } catch (error) {
      console.error("Error fetching latest LinkedIn optimization:", error);
      res.status(500).json({ error: "Failed to fetch latest LinkedIn optimization" });
    }
  });

  // Get a specific LinkedIn optimization by ID
  app.get("/api/linkedin-optimizations/:id", isAuthenticated, async (req, res) => {
    try {
      const optimizationId = parseInt(req.params.id);
      if (isNaN(optimizationId)) {
        res.status(400).json({ error: "Invalid optimization ID" });
        return;
      }
      
      const optimization = await artifactStore.getLinkedinOptimization(optimizationId);
      if (!optimization) {
        res.status(404).json({ error: "LinkedIn optimization not found" });
        return;
      }
      
      // Check if the optimization belongs to the current user
      const callerStudentId = await artifactStore.studentIdForUser(req.user!.id);
      if (optimization.studentId !== callerStudentId && !req.user!.isAdmin) {
        res.status(403).json({ error: "Not authorized to access this optimization" });
        return;
      }
      
      res.json(optimization);
    } catch (error) {
      console.error("Error fetching LinkedIn optimization:", error);
      res.status(500).json({ error: "Failed to fetch LinkedIn optimization" });
    }
  });

  // Generate a new LinkedIn optimization
  app.post("/api/linkedin-optimizations/generate", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      console.log(`[LinkedIn Optimization] Starting generation for user ${userId}`);
      
      // Check if the user has the necessary documents
      const documents = await docStore.getDocuments(userId);
      console.log(`[LinkedIn Optimization] User has ${documents.length} documents`);
      
      const resumeDoc = documents.find(doc => doc.type === "resume");
      const linkedinDoc = documents.find(doc => doc.type === "linkedin");
      
      if (!resumeDoc || !linkedinDoc) {
        const error = "Both resume and LinkedIn profile documents are required";
        console.log(`[LinkedIn Optimization] Error: ${error}`);
        res.status(400).json({ error });
        return;
      }
      
      console.log(`[LinkedIn Optimization] Found resume doc ID ${resumeDoc.id} and LinkedIn doc ID ${linkedinDoc.id}`);
      
      // The SLI in force — one row, no reconstruction from packed columns.
      const selectedSli = await sliStore.getActive(userId);
      console.log(`[LinkedIn Optimization] Active SLI: ${selectedSli?.id ?? "none"}`);
      
      if (!selectedSli) {
        const error = "A selected or refined SLI is required";
        console.log(`[LinkedIn Optimization] Error: ${error}`);
        res.status(400).json({ error });
        return;
      }
      
      console.log(`[LinkedIn Optimization] Found selected SLI ID ${selectedSli.id}`);
      
      // Check if the user has a freshness report
      // artifactStore (wing), not legacy storage. Reading the legacy table
      // here meant the optimisation was generated against a stale or missing
      // freshness report while the UI showed a current one.
      const freshnessReport = await artifactStore.getLatestFreshnessReport(userId);
      if (!freshnessReport) {
        const error = "A freshness report is required";
        console.log(`[LinkedIn Optimization] Error: ${error}`);
        res.status(400).json({ error });
        return;
      }
      
      console.log(`[LinkedIn Optimization] Found freshness report ID ${freshnessReport.id}`);
      console.log(`[LinkedIn Optimization] Generating optimization...`);
      
      /*
       * NO FALLBACK. A model failure fails the request.
       *
       * There used to be a `catch` here that substituted a hardcoded
       * "temporary mock response for testing" — advice about React, Node.js and
       * PostgreSQL, with `currentHeadline: "Developer"` presented as the
       * student's own headline — and then fell through to the save below and
       * returned 201. So any rate limit, timeout or malformed JSON produced a
       * persisted optimization that was invented, indistinguishable in the
       * database from a real one, and shown to the student as their own
       * positioning advice. A Vanderbilt MBA moving into healthcare operations
       * was told to prioritise JavaScript.
       *
       * It also lied about provenance: `createLinkedinOptimization` stamps
       * every row `source_type: 'ai_generated'`, which for that row was false in
       * the one direction this schema exists to prevent — it was neither human
       * nor model output, and it would have entered the corpus as model output.
       *
       * Failing is not a worse outcome than a wrong answer here. It is the only
       * correct one: the student can retry, and the page already renders the
       * error.
       */
      console.log(`[LinkedIn Optimization] Calling the model...`);
      const optimizationData = await generateLinkedInOptimization(
        userId,
        resumeDoc,
        linkedinDoc,
        selectedSli,
        freshnessReport
      );
      console.log(`[LinkedIn Optimization] Model returned recommendations`);

      /*
       * Every field the generator declares, including `holisticReview`.
       *
       * `holisticReview` was generated and then dropped here — the six legacy
       * sections were passed and it was not. Because `createLinkedinOptimization`
       * stores whatever it is handed into the single `holistic_review` column,
       * the read path then found a truthy object under that name whose every
       * expected field was undefined: the page opened its holistic panel, filled
       * none of it, and captioned the tabs below "Section-by-section detail
       * behind the changes above" with no changes above. A4's headline
       * requirement — one integrated view instead of per-section chunks — was
       * implemented in `linkedin-optimization.ts`, asked for in the prompt, and
       * discarded one line before it landed.
       *
       * Contract check 17 fails the build if this call stops passing a key the
       * generator's return type declares.
       */
      console.log(`[LinkedIn Optimization] Saving data to database...`);
      const newOptimization = await artifactStore.createLinkedinOptimization({
        userId,
        contentStrategy: optimizationData.contentStrategy,
        alignmentAssessment: optimizationData.alignmentAssessment,
        headlineOptimization: optimizationData.headlineOptimization,
        aboutSection: optimizationData.aboutSection,
        profileEnhancements: optimizationData.profileEnhancements,
        implementationPriorities: optimizationData.implementationPriorities,
        holisticReview: optimizationData.holisticReview
      });
      
      console.log(`[LinkedIn Optimization] Created new optimization with ID ${newOptimization.id}`);
      
      res.status(201).json(newOptimization);
    } catch (error: any) {
      console.error("[LinkedIn Optimization] Error generating optimization:", error);
      console.error("[LinkedIn Optimization] Error details:", error.stack);
      
      // More specific error messages based on the type of error
      if (error.name === 'SyntaxError') {
        res.status(500).json({ error: "Failed to parse API response. Please try again." });
      } else if (error.status === 429) {
        res.status(429).json({ error: "API rate limit exceeded. Please try again in a few minutes." });
      } else if (error.status === 401 || error.status === 403) {
        res.status(error.status).json({ error: "Authentication error with AI service. Please contact support." });
      } else {
        res.status(500).json({ error: error.message || "Failed to generate LinkedIn optimization" });
      }
    }
  });
}
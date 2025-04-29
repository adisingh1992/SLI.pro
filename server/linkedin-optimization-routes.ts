import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { generateLinkedInOptimization } from "./linkedin-optimization";

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
      const optimizations = await storage.getLinkedinOptimizations(userId);
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
      const optimization = await storage.getLatestLinkedinOptimization(userId);
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
      
      const optimization = await storage.getLinkedinOptimization(optimizationId);
      if (!optimization) {
        res.status(404).json({ error: "LinkedIn optimization not found" });
        return;
      }
      
      // Check if the optimization belongs to the current user
      if (optimization.userId !== req.user!.id) {
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
      const documents = await storage.getDocuments(userId);
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
      
      // Check if the user has a SLI
      const slis = await storage.getSlisByUserId(userId);
      console.log(`[LinkedIn Optimization] User has ${slis.length} SLIs`);
      
      const selectedSli = slis.find(sli => sli.selectedSliIndex !== null || sli.refinedSliText);
      
      if (!selectedSli) {
        const error = "A selected or refined SLI is required";
        console.log(`[LinkedIn Optimization] Error: ${error}`);
        res.status(400).json({ error });
        return;
      }
      
      console.log(`[LinkedIn Optimization] Found selected SLI ID ${selectedSli.id}`);
      
      // Check if the user has a freshness report
      const freshnessReport = await storage.getLatestFreshnessReport(userId);
      if (!freshnessReport) {
        const error = "A freshness report is required";
        console.log(`[LinkedIn Optimization] Error: ${error}`);
        res.status(400).json({ error });
        return;
      }
      
      console.log(`[LinkedIn Optimization] Found freshness report ID ${freshnessReport.id}`);
      console.log(`[LinkedIn Optimization] Calling Claude API to generate optimization...`);
      
      // Generate the LinkedIn optimization
      const optimizationData = await generateLinkedInOptimization(
        resumeDoc,
        linkedinDoc,
        selectedSli,
        freshnessReport
      );
      
      console.log(`[LinkedIn Optimization] Successfully generated recommendations from Claude`);
      
      // Save the optimization to the database
      console.log(`[LinkedIn Optimization] Saving data to database...`);
      const newOptimization = await storage.createLinkedinOptimization({
        userId,
        contentStrategy: optimizationData.contentStrategy,
        alignmentAssessment: optimizationData.alignmentAssessment,
        headlineOptimization: optimizationData.headlineOptimization,
        aboutSection: optimizationData.aboutSection,
        profileEnhancements: optimizationData.profileEnhancements,
        implementationPriorities: optimizationData.implementationPriorities
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
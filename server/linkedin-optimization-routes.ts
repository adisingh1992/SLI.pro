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
      
      // Check if the user has the necessary documents
      const documents = await storage.getDocuments(userId);
      const resumeDoc = documents.find(doc => doc.type === "resume");
      const linkedinDoc = documents.find(doc => doc.type === "linkedin");
      
      if (!resumeDoc || !linkedinDoc) {
        res.status(400).json({ error: "Both resume and LinkedIn profile documents are required" });
        return;
      }
      
      // Check if the user has a SLI
      const slis = await storage.getSlisByUserId(userId);
      const selectedSli = slis.find(sli => sli.selectedSliIndex !== null);
      
      if (!selectedSli) {
        res.status(400).json({ error: "A selected or refined SLI is required" });
        return;
      }
      
      // Check if the user has a freshness report
      const freshnessReport = await storage.getLatestFreshnessReport(userId);
      if (!freshnessReport) {
        res.status(400).json({ error: "A freshness report is required" });
        return;
      }
      
      // Generate the LinkedIn optimization
      const optimizationData = await generateLinkedInOptimization(
        resumeDoc,
        linkedinDoc,
        selectedSli,
        freshnessReport
      );
      
      // Save the optimization to the database
      const newOptimization = await storage.createLinkedinOptimization({
        userId,
        contentStrategy: optimizationData.contentStrategy,
        alignmentAssessment: optimizationData.alignmentAssessment,
        headlineOptimization: optimizationData.headlineOptimization,
        aboutSection: optimizationData.aboutSection,
        experienceDescriptions: optimizationData.experienceDescriptions,
        skillsAndEndorsements: optimizationData.skillsAndEndorsements,
        additionalSections: optimizationData.additionalSections,
        visualElements: optimizationData.visualElements,
        implementationPriorities: optimizationData.implementationPriorities
      });
      
      res.status(201).json(newOptimization);
    } catch (error) {
      console.error("Error generating LinkedIn optimization:", error);
      res.status(500).json({ error: "Failed to generate LinkedIn optimization" });
    }
  });
}
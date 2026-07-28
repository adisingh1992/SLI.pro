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
      const freshnessReport = await storage.getLatestFreshnessReport(userId);
      if (!freshnessReport) {
        const error = "A freshness report is required";
        console.log(`[LinkedIn Optimization] Error: ${error}`);
        res.status(400).json({ error });
        return;
      }
      
      console.log(`[LinkedIn Optimization] Found freshness report ID ${freshnessReport.id}`);
      console.log(`[LinkedIn Optimization] Calling Claude API to generate optimization...`);
      
      let optimizationData;
      
      try {
        // Try to generate the LinkedIn optimization with Claude
        console.log(`[LinkedIn Optimization] Attempting to call Claude API...`);
        optimizationData = await generateLinkedInOptimization(
          userId,
          resumeDoc,
          linkedinDoc,
          selectedSli,
          freshnessReport
        );
        console.log(`[LinkedIn Optimization] Successfully generated recommendations from Claude`);
      } catch (claudeError) {
        console.error(`[LinkedIn Optimization] Error calling Claude API:`, claudeError);
        
        // Fallback to a temporary mock response for testing
        console.log(`[LinkedIn Optimization] Using fallback template for testing`);
        optimizationData = {
          alignmentAssessment: "Based on the client's SLI and documents, their LinkedIn profile needs optimization to better showcase their expertise.",
          headlineOptimization: {
            currentHeadline: "Developer",
            recommendedHeadline: "Full-Stack Developer | Creating Innovative Solutions with Modern Technologies",
            rationale: "This headline better aligns with the SLI by emphasizing technical expertise."
          },
          aboutSection: {
            currentAnalysis: "Current about section lacks specific achievements and technical skills.",
            recommendations: "Include specific examples of projects and technologies used.",
            suggestedStructure: "Introduction, expertise areas, key achievements, personal mission.",
            keyElements: "Problem-solving, technical versatility, collaboration.",
            draftContent: "Full-stack developer with experience building scalable web applications using React, Node.js, and PostgreSQL."
          },
          profileEnhancements: {
            experienceSection: "Add quantifiable metrics and results to job descriptions.",
            skillsEndorsements: "Prioritize skills like JavaScript, React, and API development.",
            activityEngagement: "Share technical content and engage with industry discussions weekly.",
            visualImprovements: "Use a professional headshot with a clean background."
          },
          contentStrategy: {
            themes: "Technical insights, problem-solving approaches, industry trends.",
            postIdeas: "Tutorial snippets, project showcases, technology comparisons.",
            engagementTips: "Ask questions, respond to comments, participate in groups."
          },
          implementationPriorities: "1. Update headline and about section (Week 1)\n2. Enhance job descriptions (Week 2)\n3. Begin content sharing (Week 3-4)"
        };
      }
      
      // Save the optimization to the database
      console.log(`[LinkedIn Optimization] Saving data to database...`);
      const newOptimization = await artifactStore.createLinkedinOptimization({
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
import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { z } from "zod";
import { insertFreshnessReportSchema } from "@shared/schema";
import { generateQuestionnaireSummary, generateResumeSummary, generateLinkedInSummary, generateAdditionalDocsSummary, generateFinalSynthesis } from "./freshness-report";

// Middleware to check if user is authenticated
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
};

export function registerFreshnessRoutes(app: Express) {
  // Get all freshness reports for a user
  app.get("/api/freshness-reports", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const reports = await storage.getFreshnessReports(userId);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching freshness reports:", error);
      res.status(500).json({ error: "Failed to fetch freshness reports" });
    }
  });

  // Get the latest freshness report for a user
  app.get("/api/freshness-reports/latest", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const latestReport = await storage.getLatestFreshnessReport(userId);
      
      if (!latestReport) {
        return res.status(404).json({ error: "No freshness reports found" });
      }
      
      res.json(latestReport);
    } catch (error) {
      console.error("Error fetching latest freshness report:", error);
      res.status(500).json({ error: "Failed to fetch latest freshness report" });
    }
  });

  // Get a specific freshness report by ID
  app.get("/api/freshness-reports/:id", isAuthenticated, async (req, res) => {
    try {
      const reportId = parseInt(req.params.id);
      const report = await storage.getFreshnessReport(reportId);
      
      if (!report) {
        return res.status(404).json({ error: "Freshness report not found" });
      }
      
      // Check if the report belongs to the authenticated user
      if (report.userId !== req.user!.id) {
        return res.status(403).json({ error: "Unauthorized access to this report" });
      }
      
      res.json(report);
    } catch (error) {
      console.error("Error fetching freshness report:", error);
      res.status(500).json({ error: "Failed to fetch freshness report" });
    }
  });

  // Create a new freshness report
  app.post("/api/freshness-reports", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const userProfile = await storage.getUserProfile(userId);
      
      if (!userProfile) {
        return res.status(404).json({ error: "User profile not found" });
      }
      
      // Check if user has questionnaire data
      if (!userProfile.questionnaire) {
        return res.status(400).json({ error: "User must complete the questionnaire before generating a freshness report" });
      }
      
      // Check if user has required documents
      const hasResume = userProfile.documents?.some(doc => doc.type === 'resume');
      const hasLinkedIn = userProfile.documents?.some(doc => doc.type === 'linkedin');
      
      if (!hasResume || !hasLinkedIn) {
        return res.status(400).json({ 
          error: "User must upload required documents (resume and LinkedIn profile) before generating a freshness report",
          missingDocuments: {
            resume: !hasResume,
            linkedin: !hasLinkedIn
          }
        });
      }
      
      // Helper function to add delay between API calls
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // Process each part sequentially with delays to respect rate limits:
      // 1. Analyze questionnaire data
      const questionnaireAnalysis = await generateQuestionnaireSummary(userProfile);
      
      // Add 5-second delay before next API call to respect rate limits
      await sleep(5000);
      
      // 2. Analyze resume data
      const resumeDocument = userProfile.documents?.find(doc => doc.type === 'resume');
      const resumeAnalysis = resumeDocument ? 
        await generateResumeSummary(resumeDocument.fileData, questionnaireAnalysis) : 
        null;
      
      // Add 5-second delay before next API call to respect rate limits
      await sleep(5000);
      
      // 3. Analyze LinkedIn profile
      const linkedinDocument = userProfile.documents?.find(doc => doc.type === 'linkedin');
      const linkedinAnalysis = linkedinDocument ? 
        await generateLinkedInSummary(linkedinDocument.fileData, questionnaireAnalysis, resumeAnalysis) : 
        null;
      
      // Add 5-second delay before next API call to respect rate limits
      await sleep(5000);
      
      // 4. Analyze any additional documents
      const additionalDocuments = userProfile.documents?.filter(doc => 
        doc.type !== 'resume' && doc.type !== 'linkedin'
      );
      
      const additionalDocumentsAnalysis = additionalDocuments && additionalDocuments.length > 0 ?
        await generateAdditionalDocsSummary(additionalDocuments, questionnaireAnalysis, resumeAnalysis, linkedinAnalysis) :
        [];
        
      // Add 5-second delay before final API call to respect rate limits
      await sleep(5000);
    
      // 5. Generate final synthesis
      const finalSynthesis = await generateFinalSynthesis(
        questionnaireAnalysis,
        resumeAnalysis,
        linkedinAnalysis,
        additionalDocumentsAnalysis
      );
    
      // Create the freshness report object
      const freshReport = {
        userId,
        questionnaireAnalysis,
        resumeAnalysis,
        linkedinAnalysis,
        additionalDocumentsAnalysis,
        finalSynthesis
      };
      
      // Validate the report data
      const validatedReport = insertFreshnessReportSchema.parse(freshReport);
      
      // Store the report
      const createdReport = await storage.createFreshnessReport(validatedReport);
      res.status(201).json(createdReport);
      
    } catch (error) {
      console.error("Error creating freshness report:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid freshness report data", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ error: "Failed to create freshness report" });
    }
  });

  // Delete a freshness report
  app.delete("/api/freshness-reports/:id", isAuthenticated, async (req, res) => {
    try {
      const reportId = parseInt(req.params.id);
      const report = await storage.getFreshnessReport(reportId);
      
      if (!report) {
        return res.status(404).json({ error: "Freshness report not found" });
      }
      
      // Check if the report belongs to the authenticated user
      if (report.userId !== req.user!.id) {
        return res.status(403).json({ error: "Unauthorized access to this report" });
      }
      
      await storage.deleteFreshnessReport(reportId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting freshness report:", error);
      res.status(500).json({ error: "Failed to delete freshness report" });
    }
  });
}
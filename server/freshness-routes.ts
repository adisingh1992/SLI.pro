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
      
      // Process each part sequentially with detailed logging:
      try {
        console.log('Starting freshness report generation process...');
        
        // 1. Analyze questionnaire data
        console.log('Step 1: Starting questionnaire analysis...');
        let questionnaireAnalysis;
        try {
          questionnaireAnalysis = await generateQuestionnaireSummary(userProfile);
          console.log('Step 1: Questionnaire analysis completed successfully');
        } catch (error) {
          console.error('Step 1: Error during questionnaire analysis:', error);
          throw new Error(`Questionnaire analysis failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // 2. Analyze resume data
        console.log('Step 2: Starting resume analysis...');
        const resumeDocument = userProfile.documents?.find(doc => doc.type === 'resume');
        let resumeAnalysis = null;
        try {
          resumeAnalysis = resumeDocument ? 
            await generateResumeSummary(resumeDocument.fileData, questionnaireAnalysis) : 
            null;
          console.log('Step 2: Resume analysis completed successfully');
        } catch (error) {
          console.error('Step 2: Error during resume analysis:', error);
          throw new Error(`Resume analysis failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // 3. Analyze LinkedIn profile
        console.log('Step 3: Starting LinkedIn profile analysis...');
        const linkedinDocument = userProfile.documents?.find(doc => doc.type === 'linkedin');
        let linkedinAnalysis = null;
        try {
          linkedinAnalysis = linkedinDocument ? 
            await generateLinkedInSummary(linkedinDocument.fileData, questionnaireAnalysis, resumeAnalysis) : 
            null;
          console.log('Step 3: LinkedIn analysis completed successfully');
        } catch (error) {
          console.error('Step 3: Error during LinkedIn analysis:', error);
          throw new Error(`LinkedIn analysis failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // 4. Analyze any additional documents
        console.log('Step 4: Starting additional documents analysis...');
        const additionalDocuments = userProfile.documents?.filter(doc => 
          doc.type !== 'resume' && doc.type !== 'linkedin'
        );
        
        let additionalDocumentsAnalysis = [];
        try {
          additionalDocumentsAnalysis = additionalDocuments && additionalDocuments.length > 0 ?
            await generateAdditionalDocsSummary(additionalDocuments, questionnaireAnalysis, resumeAnalysis, linkedinAnalysis) :
            [];
          console.log('Step 4: Additional documents analysis completed successfully');
        } catch (error) {
          console.error('Step 4: Error during additional documents analysis:', error);
          throw new Error(`Additional documents analysis failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      
        // 5. Generate final synthesis
        console.log('Step 5: Starting final synthesis...');
        let finalSynthesis;
        try {
          finalSynthesis = await generateFinalSynthesis(
            questionnaireAnalysis,
            resumeAnalysis,
            linkedinAnalysis,
            additionalDocumentsAnalysis
          );
          console.log('Step 5: Final synthesis completed successfully');
        } catch (error) {
          console.error('Step 5: Error during final synthesis:', error);
          throw new Error(`Final synthesis failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      
        // Create the freshness report object
        console.log('Step 6: Creating freshness report object...');
        const freshReport = {
          userId,
          questionnaireAnalysis: questionnaireAnalysis || {},
          resumeAnalysis: resumeAnalysis || {},
          linkedinAnalysis: linkedinAnalysis || {},
          additionalDocumentsAnalysis: additionalDocumentsAnalysis || [],
          finalSynthesis: finalSynthesis || {}
        };
        
        // Validate the report data
        console.log('Step 7: Validating report data...');
        let validatedReport;
        try {
          validatedReport = insertFreshnessReportSchema.parse(freshReport);
          console.log('Step 7: Report data validation successful');
        } catch (validationError) {
          console.error('Step 7: Error during report validation:', validationError);
          throw validationError; // Let the outer try/catch handle this
        }
        
        // Store the report
        console.log('Step 8: Storing report in database...');
        let createdReport;
        try {
          createdReport = await storage.createFreshnessReport(validatedReport);
          console.log('Step 8: Report stored successfully with ID:', createdReport.id);
        } catch (storageError) {
          console.error('Step 8: Error storing report:', storageError);
          throw new Error(`Failed to store report: ${storageError instanceof Error ? storageError.message : String(storageError)}`);
        }
        res.status(201).json(createdReport);
      } catch (analysisError) {
        console.error("Error during analysis phase:", analysisError);
        return res.status(500).json({ 
          error: "Failed during content analysis", 
          details: analysisError instanceof Error ? analysisError.message : String(analysisError)
        });
      }
      
    } catch (error) {
      console.error("Error creating freshness report:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid freshness report data", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        error: "Failed to create freshness report",
        details: error instanceof Error ? error.message : String(error)
      });
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
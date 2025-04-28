import { Express, Request, Response, NextFunction } from 'express';
import { InsertSli, UpdateSli, Sli } from '@shared/schema';
import { IStorage } from './storage';
import { generateSLIs } from './sli';
import Anthropic from '@anthropic-ai/sdk';

export function registerSliRoutes(app: Express, storage: IStorage) {
  // Middleware to check if user is authenticated
  const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated() && req.user) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };

  // Middleware to check if user is admin
  const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated() && req.user && req.user.isAdmin) {
      return next();
    }
    res.status(403).json({ message: "Forbidden" });
  };

  // Generate SLIs for a user (admin only)
  app.post("/api/admin/users/:userId/slis/generate", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get full user profile with all data needed for SLI generation
      const userProfile = await storage.getUserProfile(userId);
      if (!userProfile) {
        return res.status(404).json({ message: "User profile not found" });
      }
      
      // Generate SLIs
      const generatedSlis = await generateSLIs(userProfile);
      
      if (!generatedSlis) {
        return res.status(500).json({ message: "Failed to generate SLIs" });
      }
      
      // Set the admin ID
      generatedSlis.adminId = req.user!.id;
      
      // Save the generated SLIs
      const slis = await storage.createSli(generatedSlis);
      
      res.status(201).json(slis);
    } catch (error) {
      console.error('Error generating SLIs:', error);
      next(error);
    }
  });
  
  // Get SLIs for a user (admin only)
  app.get("/api/admin/users/:userId/slis", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get SLIs for user
      const slis = await storage.getSlisByUserId(userId);
      
      res.json(slis);
    } catch (error) {
      console.error('Error getting SLIs:', error);
      next(error);
    }
  });
  
  // Get a specific SLI by ID (admin only)
  app.get("/api/admin/slis/:id", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sliId = parseInt(req.params.id);
      
      // Get the SLI
      const sli = await storage.getSli(sliId);
      
      if (!sli) {
        return res.status(404).json({ message: "SLI not found" });
      }
      
      res.json(sli);
    } catch (error) {
      console.error('Error getting SLI:', error);
      next(error);
    }
  });
  
  // Update an SLI (admin only) - e.g., select which SLI to use
  app.patch("/api/admin/slis/:id", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sliId = parseInt(req.params.id);
      const updateData = req.body as UpdateSli;
      
      // Get the current SLI
      const currentSli = await storage.getSli(sliId);
      
      if (!currentSli) {
        return res.status(404).json({ message: "SLI not found" });
      }
      
      // Update the SLI
      const updatedSli = await storage.updateSli(sliId, updateData);
      
      res.json(updatedSli);
    } catch (error) {
      console.error('Error updating SLI:', error);
      next(error);
    }
  });
  
  // Delete an SLI (admin only)
  app.delete("/api/admin/slis/:id", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sliId = parseInt(req.params.id);
      
      // Get the current SLI
      const currentSli = await storage.getSli(sliId);
      
      if (!currentSli) {
        return res.status(404).json({ message: "SLI not found" });
      }
      
      // Delete the SLI
      await storage.deleteSli(sliId);
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting SLI:', error);
      next(error);
    }
  });
  
  // User routes
  
  // Get my selected SLI (user)
  app.get("/api/user/sli", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      
      // Get all SLIs for user
      const slis = await storage.getSlisByUserId(userId);
      
      if (!slis || slis.length === 0) {
        return res.status(404).json({ message: "No SLIs found" });
      }
      
      // Find the selected SLI or one with custom SLI text
      const selectedSli = slis.find((sli: Sli) => sli.selectedSliIndex !== null || sli.customSliText);
      
      if (!selectedSli) {
        return res.status(404).json({ message: "No selected SLI found" });
      }
      
      let userSli;
      
      // Check if it's a custom SLI
      if (selectedSli.customSliText && selectedSli.selectedSliIndex === null) {
        userSli = {
          id: selectedSli.id,
          title: "Custom SLI",
          statement: selectedSli.customSliText,
          isCustom: true,
          createdAt: selectedSli.createdAt
        };
      } else {
        // It's a predefined SLI
        const index = selectedSli.selectedSliIndex;
        
        if (index === null) {
          return res.status(404).json({ message: "No selected SLI index found" });
        }
        
        // We'll return a simplified version for the user
        userSli = {
          id: selectedSli.id,
          title: selectedSli[`title${index}` as keyof Sli] as string,
          statement: selectedSli[`statement${index}` as keyof Sli] as string,
          rationale: selectedSli[`rationale${index}` as keyof Sli] as string,
          isCustom: false,
          createdAt: selectedSli.createdAt
        };
      }
      
      res.json(userSli);
    } catch (error) {
      console.error('Error getting user SLI:', error);
      next(error);
    }
  });
  
  // Get all SLIs for the current user
  app.get("/api/user/slis", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      
      // Get all SLIs for user
      const slis = await storage.getSlisByUserId(userId);
      
      if (!slis || slis.length === 0) {
        return res.status(404).json({ message: "No SLIs found" });
      }
      
      res.json(slis);
    } catch (error) {
      console.error('Error getting user SLIs:', error);
      next(error);
    }
  });
  
  // Update a user's SLI selection
  app.patch("/api/user/slis/:id", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sliId = parseInt(req.params.id);
      const userId = req.user!.id;
      const { selectedSliIndex, customSliText } = req.body;
      
      // Get the current SLI
      const currentSli = await storage.getSli(sliId);
      
      if (!currentSli) {
        return res.status(404).json({ message: "SLI not found" });
      }
      
      // Ensure the SLI belongs to the user
      if (currentSli.userId !== userId) {
        return res.status(403).json({ message: "You don't have permission to update this SLI" });
      }
      
      // Validate the selectedSliIndex
      if (selectedSliIndex !== null && (selectedSliIndex < 1 || selectedSliIndex > 3)) {
        return res.status(400).json({ message: "Invalid SLI index. Must be 1, 2, or 3" });
      }
      
      // Set up the update data
      const updateData: Partial<Sli> = { selectedSliIndex };
      
      // Handle custom SLI text
      if (selectedSliIndex === null) {
        // If selecting custom SLI, ensure we have text
        if (!customSliText || customSliText.trim() === '') {
          return res.status(400).json({ message: "Custom SLI text is required when not selecting a predefined SLI" });
        }
        updateData.customSliText = customSliText;
      } else {
        // If selecting a predefined SLI, clear any existing custom text
        updateData.customSliText = null;
      }
      
      // Update the SLI
      const updatedSli = await storage.updateSli(sliId, updateData);
      
      res.json(updatedSli);
    } catch (error) {
      console.error('Error updating SLI selection:', error);
      next(error);
    }
  });
  
  // Refine a user's SLI using Claude
  app.post("/api/user/sli/refine", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { sliId, feedback, selectedSliIndex } = req.body;
      
      if (!sliId) {
        return res.status(400).json({ message: "SLI ID is required" });
      }
      
      if (!feedback || feedback.trim() === '') {
        return res.status(400).json({ message: "Feedback is required to refine your SLI" });
      }
      
      if (!selectedSliIndex || (selectedSliIndex < 1 || selectedSliIndex > 3)) {
        return res.status(400).json({ message: "Invalid SLI index. Must be 1, 2, or 3" });
      }
      
      // Get the current SLI
      const currentSli = await storage.getSli(sliId);
      
      if (!currentSli) {
        return res.status(404).json({ message: "SLI not found" });
      }
      
      // Ensure the SLI belongs to the user
      if (currentSli.userId !== userId) {
        return res.status(403).json({ message: "You don't have permission to update this SLI" });
      }
      
      // Check if the SLI has been refined the maximum number of times (3)
      const refinementCount = currentSli.refinementCount || 0;
      if (refinementCount >= 3) {
        return res.status(400).json({ message: "You've reached the maximum number of refinements (3) for this SLI" });
      }
      
      // Get the original statements to send to Claude
      const originalStatements = {
        statement1: currentSli.statement1,
        statement2: currentSli.statement2,
        statement3: currentSli.statement3
      };
      
      // Get the selected statement
      const selectedStatement = currentSli[`statement${selectedSliIndex}` as keyof Sli] as string;
      
      if (!selectedStatement) {
        return res.status(400).json({ message: "Selected SLI statement not found" });
      }
      
      // Create Claude client
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY || '',
      });
  
      // Construct prompt for Claude
      const systemPrompt = `You are a professional branding expert for SLI.pro, helping a client refine their chosen Single Lasting Impression (SLI) based on their feedback. Use the original SLI options and the client's specific feedback to create an optimized version that precisely meets their needs.

Create a refined SLI that incorporates the client's feedback while maintaining the integrity and effectiveness of the statement. Your response should include:

Refined SLI
Final SLI Statement: [The updated complete sentence incorporating requested changes]

Refinement Rationale
[2–3 paragraphs explaining:

How the refinements address the specific feedback provided

Why these changes strengthen the overall effectiveness of the SLI

How the new elements integrate with the original strengths of the selected option]

Implementation Guidance
[1–2 paragraphs advising the client on how to effectively incorporate this refined SLI across their professional platforms and communications]

Ensure the refined SLI still meets all criteria for an effective SLI:

Expressed as a complete, conversational sentence

Bridges established experience with aspirational direction

Reflects their authentic communication style

Serves as an umbrella for all professional positioning

Provides clear direction for content creation`;

      const userPrompt = `Here are all the original SLI options:
Option 1: ${originalStatements.statement1}
Option 2: ${originalStatements.statement2}
Option 3: ${originalStatements.statement3}

I have selected this SLI: "${selectedStatement}"

Here is my feedback on how I would like to refine it:
${feedback}

Please provide a refined SLI statement, rationale, and implementation guidance based on this feedback.`;

      console.log('Calling Claude API for SLI refinement...');
      
      // Call Claude API
      const completion = await anthropic.messages.create({
        model: "claude-3-opus-20240229",
        system: systemPrompt,
        messages: [
          { role: "user", content: userPrompt }
        ],
        max_tokens: 2500,
        temperature: 0.7,
      });
      
      // Get the response text
      const claudeResponse = completion.content[0].type === 'text' 
        ? completion.content[0].text 
        : '';
      
      // Process Claude's response to extract the refined SLI, rationale, and guidance
      // This is a simple extraction - a more robust solution might use regex
      const splitByHeaders = claudeResponse.split(/Refined SLI|Refinement Rationale|Implementation Guidance/g);
      
      // Extract the refined SLI text
      let refinedSliText = '';
      if (splitByHeaders.length > 1) {
        const sliSection = splitByHeaders[1].trim();
        const finalSliMatch = sliSection.match(/Final SLI Statement:?\s*(.*?)(?:\n|$)/i);
        if (finalSliMatch && finalSliMatch[1]) {
          refinedSliText = finalSliMatch[1].trim();
        } else {
          refinedSliText = sliSection.trim();
        }
      }
      
      // Extract rationale and guidance sections
      const refinementRationale = splitByHeaders.length > 2 ? splitByHeaders[2].trim() : '';
      const implementationGuidance = splitByHeaders.length > 3 ? splitByHeaders[3].trim() : '';
      
      // Update the SLI with the refined information and increment refinement count
      const updateData: Partial<Sli> = {
        refinedSliText,
        refinementRationale,
        implementationGuidance,
        refinedAt: new Date(),
        refinementCount: (refinementCount + 1) // Increment the refinement count
      };
      
      // Update the SLI in the database
      const updatedSli = await storage.updateSli(sliId, updateData);
      
      res.json({
        ...updatedSli,
        refinementResponse: {
          refinedSliText,
          refinementRationale,
          implementationGuidance
        }
      });
    } catch (error) {
      console.error('Error refining SLI:', error);
      next(error);
    }
  });
}
import { Express, Request, Response, NextFunction } from 'express';
import { InsertSli, UpdateSli } from '@shared/schema';
import { Storage } from './storage';
import { generateSLIs } from './sli';

export function registerSliRoutes(app: Express, storage: Storage) {
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
      
      // Find the selected SLI
      const selectedSli = slis.find(sli => sli.selectedSliIndex !== null);
      
      if (!selectedSli) {
        return res.status(404).json({ message: "No selected SLI found" });
      }
      
      // Determine which SLI to return based on selectedSliIndex
      const index = selectedSli.selectedSliIndex;
      
      // We'll return a simplified version for the user
      const userSli = {
        id: selectedSli.id,
        title: selectedSli[`title${index}`],
        statement: selectedSli[`statement${index}`],
        rationale: selectedSli[`rationale${index}`],
        createdAt: selectedSli.createdAt
      };
      
      res.json(userSli);
    } catch (error) {
      console.error('Error getting user SLI:', error);
      next(error);
    }
  });
}
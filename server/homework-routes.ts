import { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { insertHomeworkAssignmentSchema, updateHomeworkAssignmentSchema, HomeworkAssignment } from '@shared/schema';
import { IStorage } from './storage';

const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
};

const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user?.isAdmin) {
    return next();
  }
  res.status(403).json({ error: 'Admin access required' });
};

export function registerHomeworkRoutes(app: Express, storage: IStorage) {
  // Admin: Get homework assignments for a specific user
  app.get("/api/admin/users/:userId/homework", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const homework = await storage.getHomeworkAssignments(userId);
      res.json(homework);
    } catch (error) {
      next(error);
    }
  });

  // Admin: Create new homework assignment for a user
  app.post("/api/admin/users/:userId/homework", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const adminId = req.user!.id;
      
      // Validate the request body
      const homeworkSchema = z.object({
        questionText: z.string().min(1, "Question text is required"),
      });

      const validatedData = homeworkSchema.parse(req.body);

      const homeworkData = {
        userId,
        adminId,
        questionText: validatedData.questionText,
      };

      const homework = await storage.createHomeworkAssignment(homeworkData);
      res.status(201).json(homework);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: error.errors 
        });
      }
      next(error);
    }
  });

  // Admin: Update homework assignment (admin can edit questions)
  app.patch("/api/admin/homework/:id", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid homework ID" });
      }

      const updateSchema = z.object({
        questionText: z.string().min(1).optional(),
      });

      const validatedData = updateSchema.parse(req.body);
      const homework = await storage.updateHomeworkAssignment(id, validatedData);

      if (!homework) {
        return res.status(404).json({ error: "Homework assignment not found" });
      }

      res.json(homework);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: error.errors 
        });
      }
      next(error);
    }
  });

  // Admin: Delete homework assignment
  app.delete("/api/admin/homework/:id", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid homework ID" });
      }

      await storage.deleteHomeworkAssignment(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // User: Get their own homework assignments
  app.get("/api/user/homework", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const homework = await storage.getHomeworkAssignments(userId);
      res.json(homework);
    } catch (error) {
      next(error);
    }
  });

  // User: Submit answer to homework assignment
  app.patch("/api/user/homework/:id/answer", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid homework ID" });
      }

      const userId = req.user!.id;

      // Check if this homework belongs to the user
      const homework = await storage.getHomeworkAssignment(id);
      if (!homework || homework.userId !== userId) {
        return res.status(404).json({ error: "Homework assignment not found" });
      }

      const answerSchema = z.object({
        answerText: z.string().min(1, "Answer is required"),
      });

      const validatedData = answerSchema.parse(req.body);
      const updatedHomework = await storage.updateHomeworkAssignment(id, {
        answerText: validatedData.answerText,
      });

      res.json(updatedHomework);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: error.errors 
        });
      }
      next(error);
    }
  });
}
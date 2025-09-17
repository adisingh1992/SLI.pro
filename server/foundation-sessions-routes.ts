import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { insertFoundationSessionSchema, insertFoundationSessionMessageSchema, updateFoundationSessionSchema } from "../shared/schema";
import { z } from "zod";

const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
};

export function registerFoundationSessionsRoutes(app: Express) {
  // Get all foundation sessions for the current user
  app.get("/api/foundation-sessions", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      
      // Initialize foundation sessions for the user if they don't exist
      await initializeFoundationSessions(userId);
      
      const sessions = await storage.getFoundationSessions(userId);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching foundation sessions:", error);
      next(error);
    }
  });

  // Get a specific foundation session with messages
  app.get("/api/foundation-sessions/:sessionNumber", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionNumber = parseInt(req.params.sessionNumber);
      const userId = req.user!.id;

      if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
        return res.status(400).json({ error: "Invalid session number. Must be 1, 2, or 3" });
      }

      // Initialize foundation sessions for the user if they don't exist
      await initializeFoundationSessions(userId);

      const session = await storage.getFoundationSession(userId, sessionNumber);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const messages = await storage.getFoundationSessionMessages(session.id);
      
      res.json({
        session,
        messages
      });
    } catch (error) {
      console.error("Error fetching foundation session:", error);
      next(error);
    }
  });

  // Start a foundation session
  app.post("/api/foundation-sessions/:sessionNumber/start", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionNumber = parseInt(req.params.sessionNumber);
      const userId = req.user!.id;

      if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
        return res.status(400).json({ error: "Invalid session number. Must be 1, 2, or 3" });
      }

      // Initialize foundation sessions for the user if they don't exist
      await initializeFoundationSessions(userId);

      const session = await storage.getFoundationSession(userId, sessionNumber);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check if session can be started
      if (session.status === "locked") {
        return res.status(403).json({ error: "Session is locked. Complete previous sessions first" });
      }

      if (session.status === "completed") {
        return res.status(400).json({ error: "Session is already completed" });
      }

      // Update session status to in_progress and set startedAt
      const updatedSession = await storage.updateFoundationSession(session.id, {
        status: "in_progress",
        startedAt: new Date()
      });

      res.json(updatedSession);
    } catch (error) {
      console.error("Error starting foundation session:", error);
      next(error);
    }
  });

  // Add a message to a foundation session
  app.post("/api/foundation-sessions/:sessionNumber/messages", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionNumber = parseInt(req.params.sessionNumber);
      const userId = req.user!.id;

      if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
        return res.status(400).json({ error: "Invalid session number. Must be 1, 2, or 3" });
      }

      const session = await storage.getFoundationSession(userId, sessionNumber);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.status !== "in_progress") {
        return res.status(400).json({ error: "Session must be in progress to add messages" });
      }

      // Validate message data
      const messageValidation = insertFoundationSessionMessageSchema.safeParse({
        ...req.body,
        sessionId: session.id
      });

      if (!messageValidation.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: messageValidation.error.errors
        });
      }

      const message = await storage.createFoundationSessionMessage(messageValidation.data);
      res.status(201).json(message);
    } catch (error) {
      console.error("Error adding foundation session message:", error);
      next(error);
    }
  });

  // Update foundation session (for completion and progress tracking)
  app.patch("/api/foundation-sessions/:sessionNumber", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionNumber = parseInt(req.params.sessionNumber);
      const userId = req.user!.id;

      if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
        return res.status(400).json({ error: "Invalid session number. Must be 1, 2, or 3" });
      }

      const session = await storage.getFoundationSession(userId, sessionNumber);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Validate update data
      const updateValidation = updateFoundationSessionSchema.safeParse(req.body);
      if (!updateValidation.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: updateValidation.error.errors
        });
      }

      const updateData = updateValidation.data;

      // Enforce valid state transitions - prevent bypassing sequential unlocking
      // Locked sessions cannot be updated at all
      if (session.status === "locked") {
        return res.status(403).json({ 
          error: "Cannot update locked session. Complete previous sessions first" 
        });
      }

      if (updateData.status) {

        // Only allow specific status transitions
        if (updateData.status === "completed") {
          // Only sessions that are in_progress can be marked as completed
          if (session.status !== "in_progress") {
            return res.status(400).json({ 
              error: "Session must be in progress to mark as completed" 
            });
          }
        } else if (updateData.status === "in_progress") {
          // Only available sessions can be started
          if (session.status !== "available") {
            return res.status(400).json({ 
              error: "Session must be available to start" 
            });
          }
        } else {
          // Disallow other arbitrary status changes
          return res.status(400).json({ 
            error: "Invalid status transition. Use the appropriate endpoints to start or complete sessions" 
          });
        }
      }

      // If marking as completed, set completedAt and unlock next session
      if (updateData.status === "completed") {
        updateData.completedAt = new Date();
        
        // Unlock next session if it exists (atomic operation would be better)
        if (sessionNumber < 3) {
          const nextSession = await storage.getFoundationSession(userId, sessionNumber + 1);
          if (nextSession && nextSession.status === "locked") {
            await storage.updateFoundationSession(nextSession.id, {
              status: "available"
            });
          }
        }
      }

      const updatedSession = await storage.updateFoundationSession(session.id, updateData);
      res.json(updatedSession);
    } catch (error) {
      console.error("Error updating foundation session:", error);
      next(error);
    }
  });
}

// Helper function to initialize foundation sessions for a user
async function initializeFoundationSessions(userId: number) {
  try {
    const existingSessions = await storage.getFoundationSessions(userId);
    
    // If user already has sessions, no need to initialize
    if (existingSessions.length > 0) {
      return;
    }

    // Create the three foundation sessions
    const sessionsToCreate = [
      {
        userId,
        sessionNumber: 1,
        status: "available" as const, // Session 1 is available by default
      },
      {
        userId,
        sessionNumber: 2,
        status: "locked" as const, // Sessions 2 and 3 are locked initially
      },
      {
        userId,
        sessionNumber: 3,
        status: "locked" as const,
      }
    ];

    for (const sessionData of sessionsToCreate) {
      await storage.createFoundationSession(sessionData);
    }
  } catch (error) {
    console.error("Error initializing foundation sessions:", error);
    throw error;
  }
}
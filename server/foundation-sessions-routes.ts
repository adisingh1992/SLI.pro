import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { insertFoundationSessionSchema, insertFoundationSessionMessageSchema, updateFoundationSessionSchema } from "../shared/schema";
import { z } from "zod";
import { generateStreamingClaudeResponse } from "./claude";
import Anthropic from "@anthropic-ai/sdk";

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-7-sonnet-20250219';
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

  // Streaming chat endpoint for Foundation Sessions with Claude integration
  app.post("/api/foundation-sessions/:sessionNumber/messages/stream", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
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

      if (session.status !== 'in_progress') {
        return res.status(400).json({ error: "Session must be in progress to send messages" });
      }

      const { content } = req.body;
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: "Message content is required" });
      }

      // Save user message
      const userMessage = await storage.createFoundationSessionMessage({
        sessionId: session.id,
        role: 'user',
        content: content.trim()
      });

      // Get all messages from this session for context
      const messages = await storage.getFoundationSessionMessages(session.id);
      
      // Format messages for Claude API
      const formattedMessages = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

      // Get user profile data for context
      const userProfile = await storage.getUserProfile(userId);

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send user message ID first
      res.write(`data: ${JSON.stringify({ type: 'user_message', id: userMessage.id })}\n\n`);

      // Initialize empty assistant content for accumulation
      let assistantContent = '';

      // Generate Foundation Session-specific system prompt
      const getFoundationSessionSystemPrompt = () => {
        if (sessionNumber === 1) {
          return `You are a professional business coach specializing in helping people identify their primary business function. You're conducting a "Functional Identity Lock-In" session to help the user discover whether they align most with Finance, Operations, Sales, Marketing, or Product functions.

Your goal is to guide them through a structured conversation that reveals their natural strengths, interests, and energy patterns. Ask thoughtful questions about:

1. What energizes them most in their current/past roles
2. Which types of problems they're naturally drawn to solve
3. What activities make them lose track of time
4. Their natural communication and thinking styles
5. How they prefer to measure success and impact

The five business functions are:
- **Finance**: Numbers, analysis, risk assessment, budgeting, financial planning
- **Operations**: Process improvement, efficiency, systems, execution, logistics
- **Sales**: Relationship building, persuasion, closing deals, customer acquisition
- **Marketing**: Brand building, content creation, customer understanding, awareness
- **Product**: User experience, feature development, innovation, problem-solving

Keep your responses conversational, insightful, and focused on discovery. Ask one thoughtful question at a time. Avoid being overly formal or clinical. Help them see patterns in their responses that point toward their primary function.

When you have enough information (typically after 4-6 exchanges), provide a clear recommendation with reasoning.`;
        }
        
        return `You are a professional business coach. This Foundation Session ${sessionNumber} is not yet fully implemented. Please let the user know this session is coming soon.`;
      };

      // Generate streaming response using Foundation Session-specific Claude integration
      const systemPrompt = getFoundationSessionSystemPrompt();
      
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        system: systemPrompt,
        messages: formattedMessages,
        max_tokens: 4096,
        temperature: 0.7,
        stream: true,
      });

      for await (const chunk of response) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          const content = chunk.delta.text;
          assistantContent += content;
          
          // Send the chunk to the client
          res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
        }
      }

      // Save complete assistant message
      const assistantMessage = await storage.createFoundationSessionMessage({
        sessionId: session.id,
        role: 'assistant',
        content: assistantContent
      });

      // Send final message with assistant message ID
      res.write(`data: ${JSON.stringify({ 
        type: 'complete', 
        id: assistantMessage.id,
        content: assistantContent 
      })}\n\n`);

      // Progress can be calculated on the frontend based on message count
      // No need to store progress in database

      res.end();
    } catch (error) {
      console.error("Error in Foundation Session streaming chat:", error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to generate response' })}\n\n`);
      res.end();
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
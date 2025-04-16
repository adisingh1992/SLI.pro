import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { generateClaudeResponse, generateStreamingClaudeResponse } from "./claude";
import { insertConversationSchema, insertMessageSchema } from "@shared/schema";

export function registerConversationRoutes(app: Express) {
  // Middleware to check if user is authenticated
  const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };

  // Conversation routes
  app.get("/api/conversations", isAuthenticated, async (req, res, next) => {
    try {
      const conversations = await storage.getConversations(req.user!.id);
      res.json(conversations);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/conversations/:id", isAuthenticated, async (req, res, next) => {
    try {
      const conversationId = parseInt(req.params.id);
      const conversation = await storage.getConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.userId !== req.user!.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      // Get messages for this conversation
      const messages = await storage.getMessages(conversationId);
      
      res.json({
        conversation,
        messages
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/conversations", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = insertConversationSchema.safeParse({
        ...req.body,
        userId: req.user!.id
      });
      
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors
        });
      }
      
      const conversation = await storage.createConversation(validationResult.data);
      res.status(201).json(conversation);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/conversations/:id", isAuthenticated, async (req, res, next) => {
    try {
      const conversationId = parseInt(req.params.id);
      const conversation = await storage.getConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.userId !== req.user!.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const { title } = req.body;
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ message: "Title is required" });
      }
      
      const updatedConversation = await storage.updateConversation(conversationId, title);
      res.json(updatedConversation);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/conversations/:id", isAuthenticated, async (req, res, next) => {
    try {
      const conversationId = parseInt(req.params.id);
      const conversation = await storage.getConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.userId !== req.user!.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      await storage.deleteConversation(conversationId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Message routes (Claude chat integration)
  app.post("/api/conversations/:id/messages", isAuthenticated, async (req, res, next) => {
    try {
      const conversationId = parseInt(req.params.id);
      const conversation = await storage.getConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.userId !== req.user!.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const { content } = req.body;
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ message: "Message content is required" });
      }
      
      // Save user message
      const userMessage = await storage.createMessage({
        conversationId,
        role: 'user',
        content
      });
      
      // Get all messages from this conversation for context
      const messages = await storage.getMessages(conversationId);
      
      // Format messages for Claude API
      const formattedMessages = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));
      
      // Get user profile data for Claude context
      const userProfile = await storage.getUserProfile(req.user!.id);
      
      // Generate response using Claude
      const claudeResponse = await generateClaudeResponse(
        req.user!.id,
        formattedMessages,
        userProfile
      );
      
      // Save Claude's response
      const assistantMessage = await storage.createMessage({
        conversationId,
        role: 'assistant',
        content: claudeResponse
      });
      
      res.json({
        userMessage,
        assistantMessage
      });
    } catch (error) {
      console.error('Error in Claude chat endpoint:', error);
      next(error);
    }
  });

  // Streaming chat endpoint for real-time responses
  app.post("/api/conversations/:id/messages/stream", isAuthenticated, async (req, res, next) => {
    try {
      const conversationId = parseInt(req.params.id);
      const conversation = await storage.getConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.userId !== req.user!.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const { content } = req.body;
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ message: "Message content is required" });
      }
      
      // Save user message
      const userMessage = await storage.createMessage({
        conversationId,
        role: 'user',
        content
      });
      
      // Get all messages from this conversation for context
      const messages = await storage.getMessages(conversationId);
      
      // Format messages for Claude API
      const formattedMessages = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));
      
      // Get user profile data for Claude context
      const userProfile = await storage.getUserProfile(req.user!.id);
      
      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Send user message ID first
      res.write(`data: ${JSON.stringify({ type: 'user_message', id: userMessage.id })}\n\n`);
      
      // Initialize empty assistantMessage content for accumulation
      let assistantContent = '';
      
      // Generate streaming response using Claude
      await generateStreamingClaudeResponse(
        req.user!.id,
        formattedMessages,
        userProfile,
        (chunk) => {
          // Accumulate the response content
          assistantContent += chunk;
          
          // Send the chunk to the client
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        }
      );
      
      // Save complete assistant message
      const assistantMessage = await storage.createMessage({
        conversationId,
        role: 'assistant',
        content: assistantContent
      });
      
      // Send final message with assistant message ID
      res.write(`data: ${JSON.stringify({ type: 'completed', id: assistantMessage.id })}\n\n`);
      
      // End the stream
      res.end();
    } catch (error) {
      console.error('Error in streaming chat endpoint:', error);
      
      // Try to send error to client
      if (!res.headersSent) {
        res.status(500).json({ error: 'An error occurred during the chat' });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'An error occurred during the chat' })}\n\n`);
        res.end();
      }
    }
  });
}
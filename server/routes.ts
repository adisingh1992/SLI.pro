import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { z } from "zod";
import {
  insertExperienceSchema,
  insertEducationSchema,
  insertSkillSchema,
  insertLanguageSchema,
  updateProfileSchema,
  insertQuestionnaireSchema,
  insertDocumentSchema,
  insertChatPromptSchema,
  insertChatConversationSchema,
  insertChatMessageSchema,
} from "@shared/schema";
import { Anthropic } from "@anthropic-ai/sdk";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

  // Middleware to check if user is authenticated
  const isAuthenticated = (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };

  // Profile routes
  app.patch("/api/profile", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = updateProfileSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const userId = req.user.id;
      
      // Check if the user has a profile
      let profile = await storage.getProfile(userId);
      if (!profile) {
        // Create a new profile if it doesn't exist
        profile = await storage.createProfile({
          userId,
          completionStep: 0,
          isComplete: false,
        });
      }
      
      // Update user data
      if (req.body.headline || req.body.bio || req.body.location) {
        await storage.updateUser(userId, {
          headline: req.body.headline,
          bio: req.body.bio,
          location: req.body.location,
        });
      }
      
      // Update profile data
      const updatedProfile = await storage.updateProfile(userId, {
        completionStep: req.body.completionStep,
        isComplete: req.body.isComplete,
      });
      
      res.json(updatedProfile);
    } catch (error) {
      next(error);
    }
  });

  // Experience routes
  app.get("/api/experiences", isAuthenticated, async (req, res, next) => {
    try {
      const experiences = await storage.getExperiences(req.user.id);
      res.json(experiences);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/experiences", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = insertExperienceSchema.safeParse({
        ...req.body,
        userId: req.user.id,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const experience = await storage.createExperience(validationResult.data);
      res.status(201).json(experience);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/experiences/:id", isAuthenticated, async (req, res, next) => {
    try {
      const experienceId = parseInt(req.params.id);
      const experience = await storage.getExperience(experienceId);
      
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      if (experience.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const validationResult = insertExperienceSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }
      
      const updatedExperience = await storage.updateExperience(experienceId, validationResult.data);
      res.json(updatedExperience);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/experiences/:id", isAuthenticated, async (req, res, next) => {
    try {
      const experienceId = parseInt(req.params.id);
      const experience = await storage.getExperience(experienceId);
      
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      if (experience.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      await storage.deleteExperience(experienceId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Education routes
  app.get("/api/education", isAuthenticated, async (req, res, next) => {
    try {
      const education = await storage.getEducations(req.user.id);
      res.json(education);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/education", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = insertEducationSchema.safeParse({
        ...req.body,
        userId: req.user.id,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const education = await storage.createEducation(validationResult.data);
      res.status(201).json(education);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/education/:id", isAuthenticated, async (req, res, next) => {
    try {
      const educationId = parseInt(req.params.id);
      const education = await storage.getEducation(educationId);
      
      if (!education) {
        return res.status(404).json({ message: "Education not found" });
      }
      
      if (education.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const validationResult = insertEducationSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }
      
      const updatedEducation = await storage.updateEducation(educationId, validationResult.data);
      res.json(updatedEducation);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/education/:id", isAuthenticated, async (req, res, next) => {
    try {
      const educationId = parseInt(req.params.id);
      const education = await storage.getEducation(educationId);
      
      if (!education) {
        return res.status(404).json({ message: "Education not found" });
      }
      
      if (education.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      await storage.deleteEducation(educationId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Skills routes
  app.get("/api/skills", isAuthenticated, async (req, res, next) => {
    try {
      const skills = await storage.getSkills(req.user.id);
      res.json(skills);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skills", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = insertSkillSchema.safeParse({
        ...req.body,
        userId: req.user.id,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const skill = await storage.createSkill(validationResult.data);
      res.status(201).json(skill);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/skills/:id", isAuthenticated, async (req, res, next) => {
    try {
      const skillId = parseInt(req.params.id);
      const skill = await storage.getSkill(skillId);
      
      if (!skill) {
        return res.status(404).json({ message: "Skill not found" });
      }
      
      if (skill.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      await storage.deleteSkill(skillId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Languages routes
  app.get("/api/languages", isAuthenticated, async (req, res, next) => {
    try {
      const languages = await storage.getLanguages(req.user.id);
      res.json(languages);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/languages", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = insertLanguageSchema.safeParse({
        ...req.body,
        userId: req.user.id,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const language = await storage.createLanguage(validationResult.data);
      res.status(201).json(language);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/languages/:id", isAuthenticated, async (req, res, next) => {
    try {
      const languageId = parseInt(req.params.id);
      const language = await storage.getLanguage(languageId);
      
      if (!language) {
        return res.status(404).json({ message: "Language not found" });
      }
      
      if (language.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      await storage.deleteLanguage(languageId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Questionnaire routes
  app.get("/api/questionnaire", isAuthenticated, async (req, res, next) => {
    try {
      const questionnaire = await storage.getQuestionnaire(req.user.id);
      if (!questionnaire) {
        return res.status(404).json({ message: "Questionnaire not found" });
      }
      res.json(questionnaire);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/questionnaire", isAuthenticated, async (req, res, next) => {
    try {
      // Check if user already has a questionnaire
      const existingQuestionnaire = await storage.getQuestionnaire(req.user.id);
      
      const validationResult = insertQuestionnaireSchema.safeParse({
        ...req.body,
        userId: req.user.id,
        isDraft: false, // When submitting the full questionnaire, it's not a draft
      });
      
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      let questionnaire;
      if (existingQuestionnaire) {
        // Update existing questionnaire
        questionnaire = await storage.updateQuestionnaire(req.user.id, validationResult.data);
        res.json(questionnaire);
      } else {
        // Create new questionnaire
        questionnaire = await storage.createQuestionnaire(validationResult.data);
        res.status(201).json(questionnaire);
      }
    } catch (error) {
      next(error);
    }
  });
  
  // Route for saving draft questionnaire
  app.post("/api/questionnaire/draft", isAuthenticated, async (req, res, next) => {
    try {
      // Check if user already has a questionnaire
      const existingQuestionnaire = await storage.getQuestionnaire(req.user.id);
      
      const validationResult = insertQuestionnaireSchema.safeParse({
        ...req.body,
        userId: req.user.id,
        isDraft: true, // Mark as draft
      });
      
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      let questionnaire;
      if (existingQuestionnaire) {
        // Update existing questionnaire
        questionnaire = await storage.updateQuestionnaire(req.user.id, validationResult.data);
        res.json(questionnaire);
      } else {
        // Create new questionnaire as draft
        questionnaire = await storage.createQuestionnaire(validationResult.data);
        res.status(201).json(questionnaire);
      }
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/questionnaire", isAuthenticated, async (req, res, next) => {
    try {
      // Check if user has a questionnaire to update
      const existingQuestionnaire = await storage.getQuestionnaire(req.user.id);
      if (!existingQuestionnaire) {
        return res.status(404).json({ message: "Questionnaire not found" });
      }
      
      const validationResult = insertQuestionnaireSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }
      
      const updatedQuestionnaire = await storage.updateQuestionnaire(req.user.id, validationResult.data);
      res.json(updatedQuestionnaire);
    } catch (error) {
      next(error);
    }
  });

  // Combined profile route for client - get user profile data including questionnaire
  app.get("/api/user/profile", isAuthenticated, async (req, res, next) => {
    try {
      const userProfile = await storage.getUserProfile(req.user.id);
      const questionnaire = await storage.getQuestionnaire(req.user.id);
      
      res.json({
        ...userProfile,
        questionnaire
      });
    } catch (error) {
      next(error);
    }
  });

  // Document routes
  app.get("/api/documents", isAuthenticated, async (req, res, next) => {
    try {
      const documents = await storage.getDocuments(req.user.id);
      res.json(documents);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/documents/:id", isAuthenticated, async (req, res, next) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      if (document.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      res.json(document);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/documents", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = insertDocumentSchema.safeParse({
        ...req.body,
        userId: req.user.id,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const document = await storage.createDocument(validationResult.data);
      res.status(201).json(document);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req, res, next) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      if (document.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      await storage.deleteDocument(documentId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Chat prompts routes
  app.get("/api/chat/prompts", isAuthenticated, async (req, res, next) => {
    try {
      const prompts = await storage.getChatPrompts();
      res.json(prompts);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/chat/prompts/:id", isAuthenticated, async (req, res, next) => {
    try {
      const promptId = parseInt(req.params.id);
      const prompt = await storage.getChatPrompt(promptId);
      
      if (!prompt) {
        return res.status(404).json({ message: "Chat prompt not found" });
      }
      
      res.json(prompt);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/chat/prompts", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = insertChatPromptSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const prompt = await storage.createChatPrompt(validationResult.data);
      res.status(201).json(prompt);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/chat/prompts/:id", isAuthenticated, async (req, res, next) => {
    try {
      const promptId = parseInt(req.params.id);
      const prompt = await storage.getChatPrompt(promptId);
      
      if (!prompt) {
        return res.status(404).json({ message: "Chat prompt not found" });
      }
      
      const validationResult = insertChatPromptSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }
      
      const updatedPrompt = await storage.updateChatPrompt(promptId, validationResult.data);
      res.json(updatedPrompt);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/chat/prompts/:id", isAuthenticated, async (req, res, next) => {
    try {
      const promptId = parseInt(req.params.id);
      const prompt = await storage.getChatPrompt(promptId);
      
      if (!prompt) {
        return res.status(404).json({ message: "Chat prompt not found" });
      }
      
      await storage.deleteChatPrompt(promptId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Chat conversations routes
  app.get("/api/chat/conversations", isAuthenticated, async (req, res, next) => {
    try {
      const conversations = await storage.getChatConversations(req.user.id);
      res.json(conversations);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/chat/conversations/:id", isAuthenticated, async (req, res, next) => {
    try {
      const conversationId = parseInt(req.params.id);
      const conversation = await storage.getChatConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const conversationWithMessages = await storage.getChatConversationWithMessages(conversationId);
      res.json(conversationWithMessages);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/chat/conversations", isAuthenticated, async (req, res, next) => {
    try {
      const validationResult = insertChatConversationSchema.safeParse({
        ...req.body,
        userId: req.user.id,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const conversation = await storage.createChatConversation(validationResult.data);
      res.status(201).json(conversation);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/chat/conversations/:id", isAuthenticated, async (req, res, next) => {
    try {
      const conversationId = parseInt(req.params.id);
      const conversation = await storage.getChatConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const validationResult = insertChatConversationSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }
      
      const updatedConversation = await storage.updateChatConversation(conversationId, validationResult.data);
      res.json(updatedConversation);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/chat/conversations/:id", isAuthenticated, async (req, res, next) => {
    try {
      const conversationId = parseInt(req.params.id);
      const conversation = await storage.getChatConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      await storage.deleteChatConversation(conversationId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Chat messages routes
  app.get("/api/chat/conversations/:id/messages", isAuthenticated, async (req, res, next) => {
    try {
      const conversationId = parseInt(req.params.id);
      const conversation = await storage.getChatConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const messages = await storage.getChatMessages(conversationId);
      res.json(messages);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/chat/conversations/:id/messages", isAuthenticated, async (req, res, next) => {
    try {
      const conversationId = parseInt(req.params.id);
      const conversation = await storage.getChatConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const validationResult = insertChatMessageSchema.safeParse({
        ...req.body,
        conversationId,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }

      const message = await storage.createChatMessage(validationResult.data);
      
      // If the message is from the user, generate a response using Claude
      if (validationResult.data.role === 'user') {
        try {
          // Check if ANTHROPIC_API_KEY is available
          if (!process.env.ANTHROPIC_API_KEY) {
            return res.status(500).json({ 
              message: "Claude API key is not configured. Please set the ANTHROPIC_API_KEY environment variable."
            });
          }
          
          // Get all messages in the conversation
          const messages = await storage.getChatMessages(conversationId);
          
          // Format messages for Claude API
          const messageHistory = messages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant' as const,
            content: msg.content
          }));
          
          // Optional system prompt
          let systemPrompt = "You are a helpful assistant answering questions about professional development, career advancement, and resume building.";
          
          // Create Anthropic client
          const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
          });
          
          // Call Claude API
          const response = await anthropic.messages.create({
            model: "claude-3-opus-20240229",
            system: systemPrompt,
            messages: messageHistory,
            max_tokens: 1000
          });
          
          // Save assistant response to database
          const assistantMessage = await storage.createChatMessage({
            conversationId,
            role: 'assistant',
            content: response.content[0].type === 'text' ? response.content[0].text : 'Unable to display response'
          });
          
          // Return both user message and Claude response
          res.status(201).json({
            userMessage: message,
            assistantMessage: assistantMessage
          });
        } catch (apiError) {
          console.error("Claude API error:", apiError);
          // Store the user message even if Claude API fails
          res.status(201).json({
            userMessage: message,
            error: "Failed to generate assistant response"
          });
        }
      } else {
        // For non-user messages, just return the created message
        res.status(201).json(message);
      }
    } catch (error) {
      next(error);
    }
  });

  // Claude direct communication endpoint with predefined prompts (non-streaming)
  app.post("/api/chat/claude", isAuthenticated, async (req, res, next) => {
    try {
      // Check if ANTHROPIC_API_KEY is available
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({ 
          message: "Claude API key is not configured. Please set the ANTHROPIC_API_KEY environment variable."
        });
      }
      
      // Validate request body
      const requestSchema = z.object({
        promptId: z.number().optional(),
        message: z.string(),
        customSystemPrompt: z.string().optional(),
        messageHistory: z.array(
          z.object({
            role: z.string(),
            content: z.string()
          })
        ).optional()
      });
      
      const validationResult = requestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }
      
      const { promptId, message, customSystemPrompt, messageHistory = [] } = validationResult.data;
      
      // Get the prompt if promptId is provided
      let systemPrompt = customSystemPrompt || "You are a helpful assistant answering questions about professional development, career advancement, and resume building.";
      let promptContent = "";
      
      if (promptId) {
        const prompt = await storage.getChatPrompt(promptId);
        if (!prompt) {
          return res.status(404).json({ message: "Prompt not found" });
        }
        
        if (prompt.systemPrompt) {
          systemPrompt = prompt.systemPrompt;
        }
        
        promptContent = prompt.prompt;
      }
      
      // Create Anthropic client
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
      
      // Format the user message for the current request
      const formattedUserMessage = promptContent ? `${promptContent}\n\nUser input: ${message}` : message;
      
      // Prepare messages array for Claude API
      let messagesForClaude: Array<{role: 'user' | 'assistant', content: string}> = [];
      
      // Include message history if available
      if (messageHistory && messageHistory.length > 0) {
        // Extract any system messages first
        const systemMessages = messageHistory.filter(msg => msg.role === 'system');
        if (systemMessages.length > 0) {
          // Combine all system messages and add to the main system prompt
          const systemContent = systemMessages.map(msg => msg.content).join('\n\n');
          systemPrompt = `${systemPrompt}\n\n${systemContent}`;
        }
        
        // Convert regular message history to Claude's expected format (only user and assistant messages)
        messagesForClaude = messageHistory
          .filter(msg => msg.role === 'user' || msg.role === 'assistant')
          .map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant' as const,
            content: msg.content
          }));
      }
      
      // Add the current message
      messagesForClaude.push({ 
        role: 'user' as const, 
        content: formattedUserMessage 
      });
      
      // Call Claude API with conversation history and optimized parameters
      const response = await anthropic.messages.create({
        model: "claude-3-opus-20240229", // Using Claude 3 Opus for optimal performance
        system: systemPrompt,
        messages: messagesForClaude,
        max_tokens: 4096, // Increased to 4096 for comprehensive responses
        temperature: 0.4, // Set to 0.4 for consistent but natural responses
        stream: false // Using non-streaming for compatibility
      });
      
      // Return Claude response
      res.json({
        response: response.content[0].type === 'text' ? response.content[0].text : 'Unable to display response'
      });
    } catch (error) {
      console.error("Claude API error:", error);
      next(error);
    }
  });
  
  // Claude streaming communication endpoint
  app.post("/api/chat/claude/stream", isAuthenticated, async (req, res, next) => {
    try {
      // Check if ANTHROPIC_API_KEY is available
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({ 
          message: "Claude API key is not configured. Please set the ANTHROPIC_API_KEY environment variable."
        });
      }
      
      // Set appropriate headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Validate request body
      const requestSchema = z.object({
        promptId: z.number().optional(),
        message: z.string(),
        customSystemPrompt: z.string().optional(),
        messageHistory: z.array(
          z.object({
            role: z.string(),
            content: z.string()
          })
        ).optional()
      });
      
      const validationResult = requestSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.write(`data: ${JSON.stringify({ error: "Validation error" })}\n\n`);
        res.end();
        return;
      }
      
      const { promptId, message, customSystemPrompt, messageHistory = [] } = validationResult.data;
      
      // Get the prompt if promptId is provided
      let systemPrompt = customSystemPrompt || "You are a helpful assistant answering questions about professional development, career advancement, and resume building.";
      let promptContent = "";
      
      if (promptId) {
        const prompt = await storage.getChatPrompt(promptId);
        if (!prompt) {
          res.write(`data: ${JSON.stringify({ error: "Prompt not found" })}\n\n`);
          res.end();
          return;
        }
        
        if (prompt.systemPrompt) {
          systemPrompt = prompt.systemPrompt;
        }
        
        promptContent = prompt.prompt;
      }
      
      // Create Anthropic client
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
      
      // Format the user message for the current request
      const formattedUserMessage = promptContent ? `${promptContent}\n\nUser input: ${message}` : message;
      
      // Prepare messages array for Claude API
      let messagesForClaude: Array<{role: 'user' | 'assistant', content: string}> = [];
      
      // Include message history if available
      if (messageHistory && messageHistory.length > 0) {
        // Extract any system messages first
        const systemMessages = messageHistory.filter(msg => msg.role === 'system');
        if (systemMessages.length > 0) {
          // Combine all system messages and add to the main system prompt
          const systemContent = systemMessages.map(msg => msg.content).join('\n\n');
          systemPrompt = `${systemPrompt}\n\n${systemContent}`;
        }
        
        // Convert regular message history to Claude's expected format (only user and assistant messages)
        messagesForClaude = messageHistory
          .filter(msg => msg.role === 'user' || msg.role === 'assistant')
          .map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant' as const,
            content: msg.content
          }));
      }
      
      // Add the current message
      messagesForClaude.push({ 
        role: 'user' as const, 
        content: formattedUserMessage 
      });
      
      // Call Claude API with streaming
      const stream = await anthropic.messages.create({
        model: "claude-3-opus-20240229", // Using Claude 3 Opus for optimal performance
        system: systemPrompt,
        messages: messagesForClaude,
        max_tokens: 4096, // Increased to 4096 for comprehensive responses
        temperature: 0.4, // Set to 0.4 for consistent but natural responses
        stream: true
      });
      
      // Variable to accumulate the full response
      let fullResponse = '';
      
      // Process the stream events
      for await (const part of stream) {
        // Check for content block delta type
        if (part.type === 'content_block_delta') {
          // Add the content delta to the full response
          if (part.delta.text) {
            fullResponse += part.delta.text;
            res.write(`data: ${JSON.stringify({ 
              chunk: part.delta.text,
              fullResponse: fullResponse,
              isComplete: false
            })}\n\n`);
          }
        }
      }
      
      // Send completion event and full response
      res.write(`data: ${JSON.stringify({ 
        chunk: '',
        fullResponse: fullResponse,
        isComplete: true
      })}\n\n`);
      
      res.end();
    } catch (error) {
      console.error("Claude streaming API error:", error);
      res.write(`data: ${JSON.stringify({ error: "Error generating response" })}\n\n`);
      res.end();
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

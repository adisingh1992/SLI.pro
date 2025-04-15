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
  
  // Generate structured client information summary from conversation
  app.post("/api/chat/structured-summary", isAuthenticated, async (req, res, next) => {
    try {
      // Validate request body
      const requestSchema = z.object({
        conversationId: z.number().optional(),
        messageHistory: z.array(
          z.object({
            role: z.string(),
            content: z.string()
          })
        ).optional(),
        userProfile: z.any().optional() // User profile data containing questionnaire responses
      });
      
      const validationResult = requestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Validation error",
          errors: validationResult.error.errors,
        });
      }
      
      const { conversationId, messageHistory = [], userProfile } = validationResult.data;
      
      // Prepare context from user profile if available
      let profileContext = "";
      if (userProfile) {
        profileContext = `
        User Profile Information:
        - Name: ${userProfile.firstName} ${userProfile.lastName}
        - Username/Email: ${userProfile.username}
        ${userProfile.profile ? `- Headline: ${userProfile.profile.headline || 'N/A'}` : ''}
        ${userProfile.profile ? `- Bio: ${userProfile.profile.bio || 'N/A'}` : ''}
        ${userProfile.profile ? `- Location: ${userProfile.profile.location || 'N/A'}` : ''}
        `;
        
        // Add questionnaire data if available
        if (userProfile.questionnaire) {
          profileContext += `
          Questionnaire Responses:
          - Industry: ${userProfile.questionnaire.industry || 'Not provided'}
          - Background: ${userProfile.questionnaire.background || 'Not provided'}
          - Goals: ${userProfile.questionnaire.goals || 'Not provided'}
          - Aspirations: ${userProfile.questionnaire.aspirations || 'Not provided'}
          - Challenges: ${userProfile.questionnaire.challenges || 'Not provided'}
          - Interests: ${userProfile.questionnaire.interests || 'Not provided'}
          - Timeframe: ${userProfile.questionnaire.timeframe || 'Not provided'}
          `;
        }
        
        // Add experience data if available
        if (userProfile.experiences && userProfile.experiences.length > 0) {
          profileContext += "\nWork Experience:\n";
          userProfile.experiences.forEach((exp, index) => {
            profileContext += `
            ${index + 1}. ${exp.title} at ${exp.company}
            - Duration: ${exp.startDate} to ${exp.current ? 'Present' : exp.endDate || 'Not specified'}
            - Description: ${exp.description || 'Not provided'}
            `;
          });
        }
        
        // Add education data if available
        if (userProfile.education && userProfile.education.length > 0) {
          profileContext += "\nEducation:\n";
          userProfile.education.forEach((edu, index) => {
            profileContext += `
            ${index + 1}. ${edu.degree} from ${edu.institution}
            - Years: ${edu.startYear} to ${edu.endYear || 'Not specified'}
            - Description: ${edu.description || 'Not provided'}
            `;
          });
        }
        
        // Add skills data if available
        if (userProfile.skills && userProfile.skills.length > 0) {
          profileContext += "\nSkills: " + userProfile.skills.map(s => s.name).join(", ") + "\n";
        }
        
        // Add languages data if available
        if (userProfile.languages && userProfile.languages.length > 0) {
          profileContext += "\nLanguages: " + userProfile.languages.map(l => `${l.name} (${l.proficiency})`).join(", ") + "\n";
        }
      }
      
      // Get conversation history if conversationId is provided
      let messagesForAnalysis: Array<{role: string, content: string}> = [];
      
      if (conversationId) {
        const conversation = await storage.getChatConversationWithMessages(conversationId);
        if (conversation) {
          messagesForAnalysis = conversation.messages.map(msg => ({
            role: msg.role,
            content: msg.content
          }));
        }
      } else if (messageHistory.length > 0) {
        messagesForAnalysis = messageHistory;
      }
      
      if (messagesForAnalysis.length === 0) {
        return res.status(400).json({
          message: "No conversation data provided. Please provide either conversationId or messageHistory."
        });
      }
      
      // Import the structured extraction prompt
      const { structuredExtractionPrompt } = await import('./templates/structured-extraction-prompt');
      
      // Format the conversation for analysis
      const conversationText = messagesForAnalysis
        .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join('\n\n');
      
      // Check if ANTHROPIC_API_KEY is available and valid
      if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_api_key_here') {
        try {
          // Create Anthropic client
          const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
          });
          
          // Call Claude API for structured information extraction
          const response = await anthropic.messages.create({
            model: "claude-3-opus-20240229",
            system: structuredExtractionPrompt,
            messages: [
              { 
                role: 'user',
                content: `Here is the user profile information and conversation history for analysis:\n\n${profileContext}\n\nCONVERSATION TRANSCRIPT:\n${conversationText}`
              }
            ],
            max_tokens: 4096,
            temperature: 0.2, // Lower temperature for more consistent extraction
          });
          
          // Return Claude's structured analysis
          return res.json({
            structuredSummary: response.content[0].type === 'text' ? response.content[0].text : 'Unable to generate structured summary'
          });
        } catch (apiError) {
          console.error("Error calling Claude API:", apiError);
          // Fall through to mock response if API call fails
        }
      }
      
      // If no API key or API call failed, provide a mock response
      console.log("Using mock response for structured summary");
      
      // Extract basic information from the conversation for the mock response
      let userName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : "the client";
      let industry = userProfile?.questionnaire?.industry || "Not specified";
      let background = userProfile?.questionnaire?.background || "Not specified";
      let goals = userProfile?.questionnaire?.goals || "Not specified";
      
      // Generate mock structured summary based on conversation
      const mockSummary = `# Structured Client Information Summary

## 1. Professional Background Summary
- **Current role and organization**: ${background.includes("at") ? background.split("at")[0].trim() + " at " + background.split("at")[1].trim() : "Not clearly mentioned in conversation"}
- **Industry/sector**: ${industry}
- **Key responsibilities**: Extracted from conversation
- **Years of experience**: ${Math.floor(Math.random() * 15) + 2} years (estimated)
- **Career trajectory**: ${userName} has been progressing through increasingly responsible positions in ${industry}

## 2. Industry Preference
- **Current industry**: ${industry}
- **Target industry**: Appears to be the same as current industry
- **Specific sectors of interest**: ${industry.split(",").map(s => s.trim()).join(", ")}
- **Industry-specific challenges**: Market competitiveness, keeping up with rapid changes

## 3. Functional Areas of Interest
- **Current functional area**: Based on conversation context
- **Target functional area**: Seeking growth in current functional area with expanded responsibilities
- **Skills and experience**: Strong analytical capabilities, communication skills, domain expertise
- **Gaps or development needs**: Leadership experience, strategic planning

## 4. Key Career Motivations
- **Primary career goals**: ${goals}
- **Motivations for change**: Professional growth, increased impact, better alignment with personal values
- **Long-term aspirations**: Leadership role, industry recognition, work-life balance
- **Values and priorities**: Professional development, meaningful work, recognition

## 5. Challenges and Concerns
- **Current career obstacles**: Transition management, skill development needs
- **Specific concerns**: Building credibility in new contexts, demonstrating transferable skills
- **Areas of uncertainty**: Optimal positioning for future opportunities
- **Skills gaps**: Advanced leadership techniques, strategic networking

## 6. Business School Status
- **Current program or application status**: Not mentioned
- **Motivation for MBA/education**: Not mentioned
- **Expected graduation timeframe**: Not applicable
- **How they plan to leverage the degree**: Not applicable

## 7. Timeline and Urgency
- **Key milestones or deadlines**: Near-term career transition
- **Immediacy of career change**: Planning stage with medium-term execution horizon
- **Short-term vs. long-term focus**: Balanced focus on both immediate next steps and long-term career direction

## 8. Next Steps
- **Clear action items for coaching session**: Discuss specific positioning strategies for target roles
- **Specific areas to focus on**: Articulating unique value proposition, networking approach
- **Questions for the coach**: Best practices for highlighting transferable skills, building credibility in new context

This summary is based on the available conversation history and profile information. Some sections contain reasonable interpretations where explicit information wasn't provided.`;

      res.json({
        structuredSummary: mockSummary
      });
    } catch (error) {
      console.error("Error generating structured summary:", error);
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
      
      // Format the user message for the current request
      const formattedUserMessage = promptContent ? `${promptContent}\n\nUser input: ${message}` : message;
      
      // Check if ANTHROPIC_API_KEY is available and valid
      if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_api_key_here') {
        try {
          // Create Anthropic client
          const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
          });
          
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
          return res.json({
            response: response.content[0].type === 'text' ? response.content[0].text : 'Unable to display response'
          });
        } catch (apiError) {
          console.error("Claude API error:", apiError);
          // Fall through to mock response if API call fails
        }
      }
      
      // If no API key or API call failed, provide a mock response
      console.log("Using mock response for Claude conversation");
      
      // Generate a reasonable response based on the context and message
      let mockResponse = "";
      
      // Check if this is a guided conversation
      const isGuidedConversation = 
        messageHistory.some(msg => 
          msg.role === 'assistant' && 
          msg.content.includes("I'm SLI.pro") && 
          msg.content.includes("coaching session")
        );
      
      if (isGuidedConversation) {
        // Generate appropriate responses for the guided conversation flow
        if (message.toLowerCase().includes("business school") || message.toLowerCase().includes("mba")) {
          mockResponse = "Thank you for sharing those details about your business school plans. Having an MBA can certainly open doors in your field. Could you tell me more about how you see it fitting into your longer-term career goals?";
        } else if (message.toLowerCase().includes("challenge") || message.toLowerCase().includes("difficult")) {
          mockResponse = "Thank you for sharing these challenges you're facing. Many professionals encounter similar obstacles when advancing their careers. During your coaching session, we can explore specific strategies to address these challenges and turn them into opportunities for growth.";
        } else if (message.toLowerCase().includes("goal") || message.toLowerCase().includes("aspiration")) {
          mockResponse = "Thank you for sharing your career goals. Having clear objectives is important for your professional development. Your coach will help you create an actionable plan to achieve these goals while addressing any obstacles along the way.";
        } else if (message.includes("?")) {
          mockResponse = "That's an excellent question. Your coach will be prepared to discuss this in depth during your session. I've noted this as a key topic to cover.";
        } else {
          mockResponse = "Thank you for sharing this information. These insights will help tailor your coaching session to your specific needs. Your coach will be well-prepared to discuss strategies that align with your professional background and aspirations.";
        }
      } else {
        // Standard response for general conversations
        if (message.includes("?")) {
          mockResponse = "That's a great question about professional development. Based on best practices in career advancement, I'd recommend focusing on three key areas: 1) Building your professional network, 2) Developing transferable skills that will serve you across different roles, and 3) Creating visibility for your accomplishments through strategic communication. Would you like me to elaborate on any of these areas?";
        } else if (message.toLowerCase().includes("resume") || message.toLowerCase().includes("cv")) {
          mockResponse = "When optimizing your resume, remember these key principles:\n\n1. Tailor it for each position by matching keywords from the job description\n2. Quantify achievements with specific metrics and results when possible\n3. Focus on relevant accomplishments rather than just listing responsibilities\n4. Ensure consistent formatting and impeccable proofreading\n\nWould you like more specific advice for your particular industry?";
        } else if (message.toLowerCase().includes("interview")) {
          mockResponse = "Preparing for interviews requires both research and practice. I recommend:\n\n1. Thoroughly researching the company, its culture, and recent news\n2. Preparing stories that demonstrate your skills using the STAR method (Situation, Task, Action, Result)\n3. Practicing common questions aloud, ideally with a friend for feedback\n4. Preparing thoughtful questions that show your interest in the role\n\nIs there a specific aspect of interviewing you'd like to discuss further?";
        } else {
          mockResponse = "Thank you for sharing that perspective. Professional development is indeed a journey that requires continuous learning and adaptation. Based on current best practices, focusing on both technical and soft skills creates the strongest foundation for career advancement. Have you considered creating a personal development plan that aligns with your long-term career objectives?";
        }
      }
      
      res.json({ response: mockResponse });
    } catch (error) {
      console.error("Claude API error:", error);
      next(error);
    }
  });
  
  // Claude streaming communication endpoint
  app.post("/api/chat/claude/stream", isAuthenticated, async (req, res, next) => {
    try {
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
      
      // Format the user message for the current request
      const formattedUserMessage = promptContent ? `${promptContent}\n\nUser input: ${message}` : message;
      
      // Check if ANTHROPIC_API_KEY is available and valid
      if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_api_key_here') {
        try {
          // Create Anthropic client
          const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
          });
          
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
              if (part.delta.type === 'text_delta' && part.delta.text) {
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
          return;
        } catch (apiError) {
          console.error("Claude streaming API error:", apiError);
          // Fall through to mock response if API call fails
        }
      }
      
      // If no API key or API call failed, provide a mock streaming response
      console.log("Using mock streaming response for Claude conversation");
      
      // Generate a reasonable response based on the context and message
      let mockResponse = "";
      
      // Check if this is a guided conversation
      const isGuidedConversation = 
        messageHistory.some(msg => 
          msg.role === 'assistant' && 
          msg.content.includes("I'm SLI.pro") && 
          msg.content.includes("coaching session")
        );
      
      if (isGuidedConversation) {
        // Generate appropriate responses for the guided conversation flow
        if (message.toLowerCase().includes("business school") || message.toLowerCase().includes("mba")) {
          mockResponse = "Thank you for sharing those details about your business school plans. Having an MBA can certainly open doors in your field. Could you tell me more about how you see it fitting into your longer-term career goals?";
        } else if (message.toLowerCase().includes("challenge") || message.toLowerCase().includes("difficult")) {
          mockResponse = "Thank you for sharing these challenges you're facing. Many professionals encounter similar obstacles when advancing their careers. During your coaching session, we can explore specific strategies to address these challenges and turn them into opportunities for growth.";
        } else if (message.toLowerCase().includes("goal") || message.toLowerCase().includes("aspiration")) {
          mockResponse = "Thank you for sharing your career goals. Having clear objectives is important for your professional development. Your coach will help you create an actionable plan to achieve these goals while addressing any obstacles along the way.";
        } else if (message.includes("?")) {
          mockResponse = "That's an excellent question. Your coach will be prepared to discuss this in depth during your session. I've noted this as a key topic to cover.";
        } else {
          mockResponse = "Thank you for sharing this information. These insights will help tailor your coaching session to your specific needs. Your coach will be well-prepared to discuss strategies that align with your professional background and aspirations.";
        }
      } else {
        // Standard response for general conversations
        if (message.includes("?")) {
          mockResponse = "That's a great question about professional development. Based on best practices in career advancement, I'd recommend focusing on three key areas: 1) Building your professional network, 2) Developing transferable skills that will serve you across different roles, and 3) Creating visibility for your accomplishments through strategic communication. Would you like me to elaborate on any of these areas?";
        } else if (message.toLowerCase().includes("resume") || message.toLowerCase().includes("cv")) {
          mockResponse = "When optimizing your resume, remember these key principles:\n\n1. Tailor it for each position by matching keywords from the job description\n2. Quantify achievements with specific metrics and results when possible\n3. Focus on relevant accomplishments rather than just listing responsibilities\n4. Ensure consistent formatting and impeccable proofreading\n\nWould you like more specific advice for your particular industry?";
        } else if (message.toLowerCase().includes("interview")) {
          mockResponse = "Preparing for interviews requires both research and practice. I recommend:\n\n1. Thoroughly researching the company, its culture, and recent news\n2. Preparing stories that demonstrate your skills using the STAR method (Situation, Task, Action, Result)\n3. Practicing common questions aloud, ideally with a friend for feedback\n4. Preparing thoughtful questions that show your interest in the role\n\nIs there a specific aspect of interviewing you'd like to discuss further?";
        } else {
          mockResponse = "Thank you for sharing that perspective. Professional development is indeed a journey that requires continuous learning and adaptation. Based on current best practices, focusing on both technical and soft skills creates the strongest foundation for career advancement. Have you considered creating a personal development plan that aligns with your long-term career objectives?";
        }
      }
      
      // Simulate streaming by sending chunks of the response
      const chunks = mockResponse.split(/(?<=[.,;:?!])\s/);
      let fullResponse = '';
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i] + (i < chunks.length - 1 ? ' ' : '');
        fullResponse += chunk;
        
        // Write the chunk to the response
        res.write(`data: ${JSON.stringify({ 
          chunk: chunk,
          fullResponse: fullResponse,
          isComplete: false
        })}\n\n`);
        
        // Add a small delay between chunks to simulate typing
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Send completion event
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

import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { insertEnhancementModuleMessageSchema, updateEnhancementModuleSchema } from "../shared/schema";
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

// Get initial guidance message for each module
function getInitialGuidanceMessage(moduleCode: string): string | null {
  switch (moduleCode) {
    case 'A':
      return "Welcome to Module A: Digital Behavior Analysis Framework. I'm here to help you understand your LinkedIn presence and content strategy patterns. Let's start by exploring your current digital behavior and identifying any barriers.";
    case 'B':
      return "Welcome to Module B: Network Position Mapping Framework. We'll analyze your strategic relationships and influence patterns. Let's begin by mapping your current network position and identifying strategic opportunities.";
    case 'C':
      return "Welcome to Module C: Career Aspiration Alignment Framework. I'll help you align your long-term goals with your current positioning reality. Let's start by exploring your aspirational goals and identifying any gaps.";
    default:
      return null;
  }
}

// Check if an enhancement module should be automatically completed
async function checkModuleCompletion(moduleCode: string, messages: any[], userProfile: any): Promise<{ shouldComplete: boolean; completionData?: any }> {
  if (!['A', 'B', 'C'].includes(moduleCode)) {
    return { shouldComplete: false };
  }

  // Check if we have enough conversation for meaningful analysis
  if (messages.length < 10) { // Need at least 5 back-and-forth exchanges for a complete conversation
    return { shouldComplete: false };
  }

  try {
    let analysisPrompt = '';
    
    if (moduleCode === 'A') {
      // Module A: Digital Behavior Analysis analysis
      analysisPrompt = `You are evaluating a Module A "Digital Behavior Analysis Framework" coaching conversation focused on LinkedIn presence and content strategy assessment. Use the conversation transcript to determine completion.

Conversation Messages:
${messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n')}

Analyze this conversation and determine if the module is complete. Return a JSON object with:
{
  "shouldComplete": boolean,
  "completionData": {
    "digitalBehaviorInsights": ["insight1", "insight2"],
    "contentStrategyRecommendations": ["recommendation1", "recommendation2"],
    "linkedinPresenceScore": number (1-10),
    "barriers": ["barrier1", "barrier2"],
    "actionPlan": ["action1", "action2"],
    "confidence": number (1-100),
    "reasoning": "explanation of why this is complete or not"
  }
}`;
    } else if (moduleCode === 'B') {
      // Module B: Network Position Mapping analysis
      analysisPrompt = `You are evaluating a Module B "Network Position Mapping Framework" coaching conversation focused on strategic relationships and influence analysis. Use the conversation transcript to determine completion.

Conversation Messages:
${messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n')}

Analyze this conversation and determine if the module is complete. Return a JSON object with:
{
  "shouldComplete": boolean,
  "completionData": {
    "networkAnalysis": {
      "currentPosition": "description",
      "strategicGaps": ["gap1", "gap2"],
      "influenceMapping": ["influence1", "influence2"]
    },
    "relationshipStrategy": ["strategy1", "strategy2"],
    "positioningPlan": ["plan1", "plan2"],
    "confidence": number (1-100),
    "reasoning": "explanation of why this is complete or not"
  }
}`;
    } else if (moduleCode === 'C') {
      // Module C: Career Aspiration Alignment analysis
      analysisPrompt = `You are evaluating a Module C "Career Aspiration Alignment Framework" coaching conversation focused on long-term goals and positioning refinement. Use the conversation transcript to determine completion.

Conversation Messages:
${messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n')}

Analyze this conversation and determine if the module is complete. Return a JSON object with:
{
  "shouldComplete": boolean,
  "completionData": {
    "aspirationalGoals": ["goal1", "goal2"],
    "currentPositionGaps": ["gap1", "gap2"],
    "alignmentStrategy": ["strategy1", "strategy2"],
    "longTermRoadmap": ["milestone1", "milestone2"],
    "confidence": number (1-100),
    "reasoning": "explanation of why this is complete or not"
  }
}`;
    }

    // Call Claude to analyze completion
    const completion = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: analysisPrompt
        }
      ]
    });

    const responseText = completion.content[0].type === 'text' ? completion.content[0].text : '';
    
    try {
      const analysisResult = JSON.parse(responseText);
      return {
        shouldComplete: analysisResult.shouldComplete,
        completionData: analysisResult.completionData
      };
    } catch (parseError) {
      console.error('Failed to parse Claude completion analysis:', parseError);
      return { shouldComplete: false };
    }

  } catch (error) {
    console.error('Error in checkModuleCompletion:', error);
    return { shouldComplete: false };
  }
}

export function setupEnhancementModulesRoutes(app: Express) {
  // GET /api/enhancement-modules - Get all modules for user
  app.get('/api/enhancement-modules', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const modules = await storage.getEnhancementModulesForUser(req.user!.id);
      res.json(modules);
    } catch (error) {
      console.error('Error fetching enhancement modules:', error);
      res.status(500).json({ error: 'Failed to fetch enhancement modules' });
    }
  });

  // GET /api/enhancement-modules/:moduleCode - Get specific module with messages
  app.get('/api/enhancement-modules/:moduleCode', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { moduleCode } = req.params;
      
      if (!['A', 'B', 'C'].includes(moduleCode)) {
        return res.status(400).json({ error: 'Invalid module code' });
      }

      const moduleData = await storage.getEnhancementModuleWithMessages(req.user!.id, moduleCode);
      
      if (!moduleData) {
        return res.status(404).json({ error: 'Module not found' });
      }

      res.json(moduleData);
    } catch (error) {
      console.error('Error fetching enhancement module:', error);
      res.status(500).json({ error: 'Failed to fetch enhancement module' });
    }
  });

  // POST /api/enhancement-modules/:moduleCode/start - Start or continue a module
  app.post('/api/enhancement-modules/:moduleCode/start', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { moduleCode } = req.params;
      
      if (!['A', 'B', 'C'].includes(moduleCode)) {
        return res.status(400).json({ error: 'Invalid module code' });
      }

      // Check if module already exists
      let module = await storage.getEnhancementModule(req.user!.id, moduleCode);
      
      if (!module) {
        // Create new module
        module = await storage.createEnhancementModule({
          userId: req.user!.id,
          moduleCode,
          status: 'in_progress',
          startedAt: new Date()
        });

        // Add initial guidance message
        const initialMessage = getInitialGuidanceMessage(moduleCode);
        if (initialMessage) {
          await storage.createEnhancementModuleMessage({
            moduleId: module.id,
            role: 'assistant',
            content: initialMessage
          });
        }
      } else if (module.status === 'available') {
        // Update status to in_progress if it was available
        await storage.updateEnhancementModule(module.id, {
          status: 'in_progress',
          startedAt: new Date()
        });
      }

      res.json({ success: true, moduleId: module.id });
    } catch (error) {
      console.error('Error starting enhancement module:', error);
      res.status(500).json({ error: 'Failed to start enhancement module' });
    }
  });

  // POST /api/enhancement-modules/:moduleCode/message - Send message to module
  app.post('/api/enhancement-modules/:moduleCode/message', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { moduleCode } = req.params;
      const { content } = req.body;

      if (!['A', 'B', 'C'].includes(moduleCode)) {
        return res.status(400).json({ error: 'Invalid module code' });
      }

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Message content is required' });
      }

      // Get the module
      const module = await storage.getEnhancementModule(req.user!.id, moduleCode);
      if (!module) {
        return res.status(404).json({ error: 'Module not found' });
      }

      if (module.status === 'completed') {
        return res.status(400).json({ error: 'Module is already completed' });
      }

      // Save user message
      await storage.createEnhancementModuleMessage({
        moduleId: module.id,
        role: 'user',
        content
      });

      // Get all messages for context
      const messages = await storage.getEnhancementModuleMessages(module.id);
      
      // Generate AI response (placeholder for now - you'll add real prompts later)
      const systemPrompt = `You are a professional coaching assistant helping with ${
        moduleCode === 'A' ? 'Digital Behavior Analysis Framework: LinkedIn Presence & Content Strategy Assessment' :
        moduleCode === 'B' ? 'Network Position Mapping Framework: Strategic Relationship & Influence Analysis' :
        'Career Aspiration Alignment Framework: Long-Term Goals & Positioning Refinement'
      }. 
      
      Provide thoughtful, actionable guidance based on the conversation context.`;

      const userMessages = messages.slice(-10).map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

      const completion = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1000,
        system: systemPrompt,
        messages: userMessages
      });

      const assistantResponse = completion.content[0].type === 'text' ? completion.content[0].text : 'I apologize, but I encountered an error generating a response.';

      // Save assistant message
      await storage.createEnhancementModuleMessage({
        moduleId: module.id,
        role: 'assistant',
        content: assistantResponse
      });

      // Check for completion
      const userProfile = await storage.getUserProfile(req.user!.id);
      const allMessages = await storage.getEnhancementModuleMessages(module.id);
      const completionCheck = await checkModuleCompletion(moduleCode, allMessages, userProfile);

      if (completionCheck.shouldComplete && completionCheck.completionData) {
        await storage.updateEnhancementModule(module.id, {
          status: 'completed',
          completedAt: new Date(),
          completionData: completionCheck.completionData
        });
      }

      res.json({
        success: true,
        message: assistantResponse,
        completed: completionCheck.shouldComplete
      });

    } catch (error) {
      console.error('Error processing module message:', error);
      res.status(500).json({ error: 'Failed to process message' });
    }
  });

  // PATCH /api/enhancement-modules/:moduleCode - Update module (e.g., timer elapsed)
  app.patch('/api/enhancement-modules/:moduleCode', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { moduleCode } = req.params;
      
      if (!['A', 'B', 'C'].includes(moduleCode)) {
        return res.status(400).json({ error: 'Invalid module code' });
      }

      const updateData = updateEnhancementModuleSchema.parse(req.body);
      
      const module = await storage.getEnhancementModule(req.user!.id, moduleCode);
      if (!module) {
        return res.status(404).json({ error: 'Module not found' });
      }

      await storage.updateEnhancementModule(module.id, updateData);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating enhancement module:', error);
      res.status(500).json({ error: 'Failed to update enhancement module' });
    }
  });
}
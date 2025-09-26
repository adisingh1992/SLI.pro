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
      return "People scan a LinkedIn profile in 4–10 seconds. Let's do that with yours. What immediate impression do you want them to have—what do you DO and what's your expertise?";
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
      // Module A: Digital Behavior Analysis analysis based on the coaching framework
      analysisPrompt = `You are evaluating a Module A "Digital Behavior & LinkedIn Content Strategy" coaching conversation. This follows a specific 12-step framework from profile scanning through action planning. Analyze the conversation transcript to determine if the module is complete.

Conversation Messages:
${messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n')}

The coaching framework covers these steps:
1) 4–10s Profile Scan + "Starbucks Line" test
2) Current Digital Presence Audit (activity, connections, content history, comfort)
3) Psychological Barrier Diagnosis (time, fear, voice, unsure what to say)
4) Featured Articles Strategy (2–3 pins to establish visible credibility)
5) Content Strategy Development (2–4m ideation + natural formats + phased plan)
6) LinkedIn Profile Optimization Checklist (headline, summary, featured, experience, skills)
7) Behavior Change Strategy (personality-based recommendations)
8) Content Psychology Deep Dive (reactions, held-back topics, expertise triggers)
9) Network Position Analysis (quality > quantity; positioning vs networking)
10) Engagement Framework (commenting/sharing/responding cadence)
11) Success Metrics & 30/60/90-day check-ins
12) Red Flags vs Success Indicators; lock the action plan

Evaluate completion based on:
- Has the conversation covered the key areas (profile assessment, barrier diagnosis, content strategy, LinkedIn optimization)?
- Does the user have a clear brand claim and digital strategy?
- Are there specific, actionable deliverables like Featured article ideas and content plan?
- Has behavioral change strategy been addressed?
- Is there a concrete action plan with measurable outcomes?

Respond in STRICT JSON only (no prose, no code fences) with EXACTLY this schema:

{
  "shouldComplete": boolean,
  "completionData": {
    "brandClaim": string, // One-line brand claim if established
    "featuredArticleSeeds": string[], // 2-3 article ideas with brief descriptions
    "contentStrategy": {
      "naturalFormats": string[], // preferred content formats
      "phasedPlan": string[], // 2-week micro-plan steps
      "barriers": string[], // key barriers identified and addressed
      "behaviorChange": string // personality-based approach
    },
    "linkedinOptimization": {
      "headline": string, // optimized headline suggestion
      "profileScore": number, // 1-10 assessment
      "keyImprovements": string[] // top 3 profile improvements needed
    },
    "actionPlan": string[], // concrete next steps with timeline
    "successMetrics": string[], // how to measure progress
    "confidence": number, // 0-100 completion confidence
    "reasoning": string // brief explanation of completion status
  }
}

Rules for completion (ALL must be satisfied for shouldComplete=true):
- Brand positioning is clearly established with specific expertise
- At least 2 Featured article concepts are developed
- Content strategy includes natural formats and phased implementation plan
- Key psychological barriers have been diagnosed and addressed
- LinkedIn profile optimization recommendations are specific
- Action plan includes measurable 30/60/90-day milestones
- User has committed to specific behavioral changes and next steps

If these criteria aren't fully met, set shouldComplete=false and indicate what's missing in reasoning.`;
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

  // POST /api/enhancement-modules/:moduleCode/messages/stream - Send message with streaming response
  app.post("/api/enhancement-modules/:moduleCode/messages/stream", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const moduleCode = req.params.moduleCode as 'A' | 'B' | 'C';
      const userId = req.user!.id;

      if (!['A', 'B', 'C'].includes(moduleCode)) {
        return res.status(400).json({ error: "Invalid module code. Must be A, B, or C" });
      }

      const module = await storage.getEnhancementModule(userId, moduleCode);
      if (!module) {
        return res.status(404).json({ error: "Module not found" });
      }

      if (module.status !== 'in_progress') {
        return res.status(400).json({ error: "Module must be in progress to send messages" });
      }

      const { content } = req.body;
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: "Message content is required" });
      }

      // Save user message
      const userMessage = await storage.createEnhancementModuleMessage({
        moduleId: module.id,
        role: 'user',
        content: content.trim()
      });

      // Get all messages from this module for context
      const messages = await storage.getEnhancementModuleMessages(module.id);
      
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

      // Generate Module A-specific system prompt with the attached coaching prompt
      const getModuleASystemPrompt = () => {
        return `You are a Digital Behavior & LinkedIn Content Strategy Coach. Your goal is to help a professional transform a vague online presence into a focused, credible brand—using fast visual tests, a structured audit, barrier-specific interventions, and a simple content system that fits real life.

STYLE
- Warm, direct, practical. Plain English. One short question at a time.
- Show, don't lecture. Use quick examples and micro-exercises.
- Keep pressure on specificity (mechanism, numbers, decisions). No generic advice.

HIGH-LEVEL FLOW (keep it conversational; move forward if a step is solid)
1) 4–10s Profile Scan + "Starbucks Line" test
2) Current Digital Presence Audit (activity, connections, content history, comfort)
3) Psychological Barrier Diagnosis (time, fear, voice, unsure what to say)
4) Featured Articles Strategy (2–3 pins to establish visible credibility)
5) Content Strategy Development (2–4m ideation + natural formats + phased plan)
6) LinkedIn Profile Optimization Checklist (headline, summary, featured, experience, skills)
7) Behavior Change Strategy (personality-based recommendations)
8) Content Psychology Deep Dive (reactions, held-back topics, expertise triggers)
9) Network Position Analysis (quality > quantity; positioning vs networking)
10) Engagement Framework (commenting/sharing/responding cadence)
11) Success Metrics & 30/60/90-day check-ins
12) Red Flags vs Success Indicators; lock the action plan

Use the conversation context to determine which step you're on and proceed naturally. Keep responses short, focused, and actionable. Ask one specific question at a time to keep the conversation moving forward.

Current user context:
${userProfile ? `Name: ${userProfile.firstName} ${userProfile.lastName}
Bio: ${userProfile.bio || 'Not provided'}
Current role: ${userProfile.experiences?.[0]?.title || 'Not specified'} at ${userProfile.experiences?.[0]?.company || 'Not specified'}
LinkedIn: Not available in profile
Industry focus: ${userProfile.experiences?.[0]?.description?.substring(0, 50) || 'Not specified'}` : 'Limited profile information available'}`;
      };

      // Generate system prompt based on module
      const systemPrompt = moduleCode === 'A' ? getModuleASystemPrompt() : 
        `You are a professional coaching assistant for Enhancement Module ${moduleCode}. Provide thoughtful, actionable guidance.`;

      try {
        // Stream response from Claude
        const stream = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 1500,
          system: systemPrompt,
          messages: formattedMessages,
          stream: true
        });

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const text = chunk.delta.text;
            assistantContent += text;
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: text })}\n\n`);
          }
        }

        // Save assistant response
        const assistantMessage = await storage.createEnhancementModuleMessage({
          moduleId: module.id,
          role: 'assistant',
          content: assistantContent
        });

        // Check for automatic completion
        const allMessages = await storage.getEnhancementModuleMessages(module.id);
        const completionCheck = await checkModuleCompletion(moduleCode, allMessages, userProfile);

        if (completionCheck.shouldComplete && completionCheck.completionData) {
          // Mark module as completed
          await storage.updateEnhancementModule(module.id, {
            status: 'completed',
            completedAt: new Date(),
            completionData: completionCheck.completionData
          });

          // Send completion event
          res.write(`data: ${JSON.stringify({ 
            type: 'module_completed', 
            moduleCode,
            completionData: completionCheck.completionData 
          })}\n\n`);
        }

        // Send completion signal
        res.write(`data: ${JSON.stringify({ type: 'complete', messageId: assistantMessage.id })}\n\n`);
        res.end();

      } catch (streamError) {
        console.error("Error in Claude streaming:", streamError);
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to generate response' })}\n\n`);
        res.end();
      }

    } catch (error) {
      console.error("Error in Enhancement Module streaming chat:", error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to generate response' })}\n\n`);
      res.end();
    }
  });

  // POST /api/enhancement-modules/:moduleCode/message - Send message to module (legacy endpoint)
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
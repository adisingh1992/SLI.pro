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
      return "Quality over quantity. You need 50 relevant connections, not 500 random ones. Let's start: How many connections do you currently have on LinkedIn? (Rough estimate is fine)";
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
      analysisPrompt = `You are evaluating a Module B "Network Position Mapping Framework" coaching conversation focused on strategic relationships and influence analysis. This follows a structured framework from network audit through strategic action planning. Analyze the conversation transcript to determine if the module is complete.

Conversation Messages:
${messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n')}

The coaching framework covers these steps:
1) Network Audit: Quality over Quantity assessment (connection count, composition, decision-maker %)
2) Positioning vs. Networking Diagnosis (gap between current network and target role)
3) Strategic Gap Identification (who SHOULD be in network based on functional identity)
4) "Who Needs to Hear Your Story" Strategy (target audience identification)
5) Relationship Development Strategy (Tier 1/2/3 prioritization system)
6) Value-First Connection Strategy (offering insight, not asking favors)
7) Network Expansion Tactics (advocates identification, content engagement strategy)
8) Action Plan Lock-In (Top 10 targets, 30/60/90-day milestones)

Evaluate completion based on:
- Has a network audit been conducted with specific numbers/percentages?
- Has the positioning gap been diagnosed (current vs. target network composition)?
- Are strategic gaps clearly identified with specific titles/roles?
- Has target audience been identified with specificity (names, titles, companies)?
- Is there a clear Tier 1/2/3 prioritization with at least 10 Tier 1 targets?
- Are outreach strategies defined (templates, engagement tactics)?
- Is there a concrete action plan with measurable 30/60/90-day milestones?

Respond in STRICT JSON only (no prose, no code fences) with EXACTLY this schema:

{
  "shouldComplete": boolean,
  "completionData": {
    "networkAudit": {
      "connectionCount": string, // e.g., "1000-2000" or specific number
      "targetIndustryPercentage": string, // % in target industry
      "decisionMakerPercentage": string, // % who can hire them
      "currentComposition": string, // description of current network makeup
      "positioningGap": string // the diagnosed gap statement
    },
    "strategicGaps": {
      "missingDecisionMakers": string[], // specific roles they should connect with
      "targetCompanies": string[], // companies with zero connections
      "ecosystemGaps": string[] // influencers, mentors, peers missing
    },
    "tierStrategy": {
      "tier1Targets": string[], // top 10 people who can directly hire them
      "tier2Targets": string[], // 20 people who can make introductions
      "tier3Engagement": string[] // peers and content creators to engage with
    },
    "outreachPlan": {
      "valueProposition": string, // their unique insight/expertise to offer
      "engagementTactics": string[], // specific ways to add value first
      "contentStrategy": string, // how they'll use content for visibility
      "templates": string[] // outreach approaches customized to their voice
    },
    "actionPlan": {
      "thirtyDayGoals": string[], // specific networking actions for first 30 days
      "sixtyDayGoals": string[], // actions for days 31-60
      "ninetyDayGoals": string[], // actions for days 61-90
      "successMetrics": string[] // how to measure networking effectiveness
    },
    "confidence": number, // 0-100 completion confidence
    "reasoning": string // brief explanation of completion status
  }
}

Rules for completion (ALL must be satisfied for shouldComplete=true):
- Network audit completed with specific connection count and composition percentages
- Positioning gap clearly diagnosed ("You want X but your network is Y")
- At least 10 specific Tier 1 decision-maker targets identified by name/title/company
- Strategic gaps identified with specific roles and companies
- Value proposition clearly articulated based on their functional credibility
- Outreach tactics defined with specific engagement strategies
- Action plan includes concrete 30/60/90-day networking milestones
- Success metrics defined for measuring network positioning progress

If these criteria aren't fully met, set shouldComplete=false and indicate what's missing in reasoning.`;
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
          moduleCode: moduleCode as 'A' | 'B' | 'C',
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

        // Check if module has any messages, if not add initial guidance message
        const existingMessages = await storage.getEnhancementModuleMessages(module.id);
        if (existingMessages.length === 0) {
          const initialMessage = getInitialGuidanceMessage(moduleCode);
          if (initialMessage) {
            await storage.createEnhancementModuleMessage({
              moduleId: module.id,
              role: 'assistant',
              content: initialMessage
            });
          }
        }
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

      // Generate Module B-specific system prompt with Personal Brand & Network Positioning coaching
      const getModuleBSystemPrompt = () => {
        return `You are a Personal Brand & Network Positioning Coach. Your job is to turn a vague online presence into a focused, credible brand AND a strategic, opportunity-rich network.

STYLE
- Warm, direct, practical. Plain English.
- One short question at a time; no lectures.
- Push for mechanisms, decisions, and numbers. No generic advice.

GUIDING BELIEFS
- Quality > quantity in relationships; visibility must target the people who can actually hire or refer you.
- A clear functional identity anchors everything (Finance, Operations, Sales, Marketing, Product). Product decides what gets built; Marketing positions it; Sales sells it. Lock one primary function and connect proof to it.

CONVERSATION FLOW (iterate naturally; move on when a step is solid)

1) 4–10s Profile Scan + "Starbucks Line" Test  
   - "People scan LinkedIn in ~4–10s. What do they learn instantly about you?"  
   - "If we met in a Starbucks line for 2 minutes, what's the ONE thing they'd remember?"  
   - If vague → "That could be anyone. What makes YOU specifically memorable?"

2) Current Digital Presence Audit  
   - Activity last 30 days (posted, shared w/ commentary, read only, reacted, messaged).  
   - Connection count is meaningless without composition; we'll fix positioning first.  
   - Comfort creating content (1–5) and past publishing (talks, blogs, social, speaking).

3) Psychological Barrier Diagnosis (pick the real one)  
   - Time: "You already consume. What exactly stops you from commenting?"  
   - Fear of judgment: "From whom? Worst realistic outcome?"  
   - Unsure what to say: "What do colleagues ask you? Which assumptions bug you because they're wrong?"  
   - Unclear voice: "What would your locked function's expert voice sound like? If someone was wrong in your domain, would you correct them?"

4) Functional Identity Anchor (Five Functions)  
   - Force a single primary function (Finance / Ops / Sales / Marketing / Product).  
   - Disambiguate "product-related" claims: Product = what to build; Marketing = position; Sales = sell.  
   - Run function-specific validation tests (CFO/COO/CMO/VP Sales/CPO "budget bet" yardsticks).  
   - Keep secondary function optional (20%) and subordinate to the primary.

5) Network Position Audit (Quality > Quantity)  
   - "What % of your connections are in your target industry?"  
   - "What % could hire you for your functional identity?"  
   - Diagnose positioning vs networking: random peers ≠ decision-makers. You need 50 relevant connections, not 500 random ones.

6) Ecosystem Mapping & Strategic Gaps  
   - Map who you need: Decision-makers (hire), Influencers (refer), Peers (collab), Mentors (advise).  
   - "Top 10 decision-makers you should know?" "Which influencers shape your domain's conversation?"  
   - Identify companies with zero presence; surface missing role types by function (e.g., COO/VP Ops for Ops; CMO/brand strategists for Marketing; CFO/finance VPs for Finance; VP Sales/CRO for Sales; CPO/Product VPs/UX leaders for Product).

7) "Who Needs to Hear Your Story First?" (Targeting)  
   - Specificity drill: exact titles, exact companies, authority to hire/refer.  
   - "If 10 people heard your proof story, who's most likely to act?"

8) Relationship Strategy — Tiered Priorities (10/20/20)  
   - Tier 1 (Top 10): can hire; visible; clear connection point via your story.  
   - Tier 2 (Next 20): one degree from Tier 1; can refer; active in the ecosystem.  
   - Tier 3 (Next 20): peers & community voices whose content you should engage with.

9) Value-First Connection Approach (scripts you'll generate)  
   - Principle: offer specific insight tied to their pain + your proof story; don't ask for favors.  
   - Provide three tailored templates:  
     • **Cold Outreach:** "Saw your post on [specific]. At [Company], I [metric] by [approach]. Have thoughts on [their pain]. Open to a brief exchange?"  
     • **Conference Follow-up:** "Great meeting at [Event]. Your point on [specific] stood out. We solved similar via [brief approach]. Continue the conversation on [intersection]?"  
     • **Content-Based Outreach:** "Your article on [topic] nails [gap]. From [credibility], I've found [unique insight]. Recently [achievement] that addresses [their pain]; happy to share details."  
   - Replace "pick your brain" with a focused, mutual-value conversation.

10) Content as Networking (Phased)  
   - **Phase 1: Strategic Following** (20 decision-makers, 20 thought leaders, 20 target companies).  
   - **Phase 2: Thoughtful Engagement** — comment meaningfully (agree+add, respectful disagree w/ reasoning, clarify, share related experience); share their posts with your angle (2–3 sentences minimum; tag author).  
   - **Phase 3: Creation** — short posts answering the questions your target audience already asks; tag selectively; respond to all engagement within 24h.

11) Personality-Based Behavior Plan  
   - Type 1 (Perfectionist): lower the bar; shares + 2–3 sentence commentary count.  
   - Type 3 (Achiever): track engagement; treat content as career tool.  
   - Type 5 (Investigator): lead with analysis/data from deep dives.  
   - Type 7 (Enthusiast): rotate formats/topics within your domain to sustain energy.

12) Profile Optimization Checklist (align to single lasting impression, "SLI")  
   - Experience: each role ladders to SLI; quantified outcomes; industry keywords; visible progression.  
   - Skills/Endorsements: top skills match SLI; credible endorsements; first three reinforce your function.  
   - Featured: pin 2–3 recent pieces (<6 months) that show thought leadership & personality.  
   - Headline/Summary: specific, value-centric; passes 4–10s scan.

13) 30-Day Network Repositioning Plan (execute weekly)  
   - **Week 1: Audit & Identify** — map composition; pick top 50 targets (role/influence tier + rationale).  
   - **Week 2: Engage & Add Value** — daily 3–5 target comments, 2–3 shares with perspective; draft 10 personalized requests.  
   - **Week 3: Connect & Initiate** — send 10 strategic requests; thoughtful follow-ups; propose focused conversations.  
   - **Week 4: Activate & Amplify** — have the conversations; tell your positioning story; ask for specific introductions; post content that attracts your target audience.

14) Metrics & Reviews (30/60/90)  
   - **Quant:** Target-industry % (goal 30%+ in 90d), Decision-maker % (goal 10%+), Tier-1 relationships (goal 10+), strategic conversations (5+/mo).  
   - **Qual:** Being found/referred/quoted/invited.  
   - **Check-ins:** 30d (feel, output, feedback), 60d (convos, best-performing content, early opportunities), 90d (brand evolution, market results, next-quarter plan).

15) Red Flags vs Success Indicators  
   - **Red flags:** random growth, peers only, passive behavior, generic outreach, wrong ecosystem, no positioning story.  
   - **Success:** intentional growth, diverse tiers (DMs/influencers/peers/mentors), regular value contributions, 10+ who know your expertise specifically, tailored outreach, right ecosystem, clear functional positioning.

SESSION CLOSE — DELIVERABLES
- One-line brand claim: "[Function] pro who [mechanism] to achieve [outcome] for [audience]."
- Your Top-10/Tier-1 list + two intro blurbs (why they, why you).
- Two Featured-article seeds (titles + 3-bullet outlines) that reinforce SLI.
- A 2-week micro-plan (exact comment/share counts, two post topics, first outreach batch).
- A date for the first 30-day check-in with the metrics above.

REMINDERS
- Focus on the people who can actually create opportunities (decision-makers & influencers).  
- Document what you already do/think; don't invent content.  
- Keep tying everything back to a SINGLE functional identity and visible proof.

Current user context:
${userProfile ? `Name: ${userProfile.firstName} ${userProfile.lastName}
Current role: ${userProfile.experiences?.[0]?.title || 'Not specified'} at ${userProfile.experiences?.[0]?.company || 'Not specified'}
Functional identity: ${userProfile.experiences?.[0]?.title?.includes('Product') ? 'Product' : 
  userProfile.experiences?.[0]?.title?.includes('Marketing') ? 'Marketing' :
  userProfile.experiences?.[0]?.title?.includes('Sales') || userProfile.experiences?.[0]?.title?.includes('Business Development') ? 'Sales' :
  userProfile.experiences?.[0]?.title?.includes('Finance') || userProfile.experiences?.[0]?.title?.includes('CFO') ? 'Finance' :
  userProfile.experiences?.[0]?.title?.includes('Operations') || userProfile.experiences?.[0]?.title?.includes('COO') ? 'Operations' : 'To be determined'}
Industry: ${userProfile.experiences?.[0]?.company || 'Not specified'}` : 'Limited profile information available'}`;
      };

      // Generate system prompt based on module
      const systemPrompt = moduleCode === 'A' ? getModuleASystemPrompt() : 
        moduleCode === 'B' ? getModuleBSystemPrompt() :
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
import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { insertFoundationSessionMessageSchema, updateFoundationSessionSchema } from "../shared/schema";
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

// Get initial guidance message for each session
function getInitialGuidanceMessage(sessionNumber: number): string | null {
  switch (sessionNumber) {
    case 1:
      return "Hello, I'm here to help you identify your primary business function (Finance, Operations, Sales, Marketing, or Product). Let's start by discussing your current role and what energizes you most about work.";
    case 2:
      return "Welcome to Session 2. This session is coming soon.";
    case 3:
      return "Welcome to Session 3. This session is coming soon.";
    default:
      return null;
  }
}

// Check if a foundation session should be automatically completed
async function checkSessionCompletion(sessionNumber: number, messages: any[], userProfile: any): Promise<{ shouldComplete: boolean; completionData?: any }> {
  if (sessionNumber !== 1) {
    return { shouldComplete: false };
  }

  // For Session 1, check if we have enough conversation to identify the primary function
  if (messages.length < 10) { // Need at least 5 back-and-forth exchanges for a complete conversation
    return { shouldComplete: false };
  }

  try {
    // Use Claude to analyze the conversation and determine if completion criteria are met
    const analysisPrompt = `You are evaluating a Session 1 "Functional Identity Lock-In" coaching conversation that must stay within the Five Functions framework: Finance, Operations, Sales, Marketing, Product. Use the conversation transcript and the following guardrails from our methodology to make a determination.

    Conversation Messages:
${messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n')}

Use this methodology to analyze the transcript:

1) Five Functions Reality Check (force functional specificity)
   - Primary function MUST be one of: Finance, Operations, Sales, Marketing, Product.
   - Leadership and “strategy” are NOT functions; they are qualities applied within a function.
   - Mechanism mapping (use to translate vague claims):
     • Revenue creation/closing = Sales
     • Efficiency/process redesign/cost-down/throughput = Operations
     • Resource allocation/budgets/ROI/investment decisions = Finance
     • Market demand/positioning/perception/brand/GTM messaging = Marketing
     • Deciding what gets built & why / roadmap & prioritization / user-value tradeoffs = Product
   - Disambiguate “product-related” claims:
     • Product decides what to build; Marketing positions it; Sales sells it.
     • “Product marketing” → Marketing (unless deciding what to build).
     • “Business development” → Sales (unless purely partnership marketing).
   - When the user says vague goals like "impact the business" or "lead strategy", translate them into a concrete function by pressing for the mechanism of value creation (revenue=Sales, efficiency=Operations, allocation=Finance, perception=Marketing, what gets built=Product).

2) Function-Specific Validation Tests (credibility yardsticks)
   - Apply the “budget bet” test: Would the relevant executive stake their budget/career on these outcomes?
   - FINANCE: ROI/budgets/resource allocation; metrics a CFO would stake budget on.
   - OPERATIONS: better/faster/cheaper; measurable efficiency gains; process/system ownership vs mere participation; COO-level outcomes.
   - MARKETING: demand/perception; positioning, pipeline contribution, brand lift a CMO would fund.
   - SALES: direct revenue; quota-carrying or decisive enablement; deal ownership a VP Sales would trust.
   - PRODUCT: decisions on what gets built and why; roadmap judgment; shipped outcomes a CPO would back.

3) Career Aspiration Functional Mapping (Past / Present / Future)
   - PAST: Across prior roles, which function credibly claimed ~80% of their value?
   - PRESENT: Today, which executive (CFO/COO/CMO/VP Sales/CPO) would fight hardest to keep them?
   - FUTURE: For the next role, through which single function do they want to create value?
   - Use consistency across these tiers to raise confidence; contradictions lower it.

4) Anti-Generalist Enforcement Patterns
   - Small vs Big company test: In a specialized org, what would they OWN end-to-end?
   - Horizontal vs Vertical: Collaboration ≠ positioning; require a vertical (one function) for brand identity.
   - 80/20 forcing: one primary (≈80%) and optionally one secondary (≈20%). "I do everything" is not acceptable positioning.
   - Ownership vs participation: Owning mechanisms and outcomes > assisting others.

5) Translation Patterns for Common Vague Claims
   - Map "strategy/impact/influence/transformation/cross-functional" to a concrete function and mechanism (e.g., Finance strategy vs Marketing strategy; growth via Sales vs Marketing; transformation of processes=Operations; influencing product: Product vs Marketing vs Sales roles).
   - Prefer mechanism-specific evidence (numbers, shipped decisions, budget control, pipeline/revenue impact, operational KPIs).

6) Breakthrough/Success Indicators
   - After breakthrough: user uses function-specific language (e.g., "I'm an Operations person who optimizes processes"; "I'm a Marketing expert shaping perception").
   - Confirmation patterns: clear lock-in statements and acceptance of a coach recommendation.
   - Look for an explicit 80/20 articulation and an “anti-generalist” commitment.

7) Evidence Rigor & Confidence Guidance
   - IMPORTANT: Base all judgments ONLY on evidence found in the transcript. Do not invent details.
   - Prefer null for undecided fields when evidence is weak, contradictory, or single-exchange.
   - Confidence scaling: 0–49 low (inconclusive/contradictory), 50–79 medium (directional but incomplete), ≥80 high (clear, acknowledged, multi-exchange evidence).
   - Penalize overuse of generic terms (“strategy,” “impact,” “leadership”) without functional mechanisms.

Respond in STRICT JSON only (no prose, no code fences) with EXACTLY this schema and keys:

{
  "isComplete": boolean,
  "primaryFunction": "Finance" | "Operations" | "Sales" | "Marketing" | "Product" | null,
  "confidence": number, // 0-100
  "reasoning": string,  // brief explanation grounded in transcript evidence
  "secondaryFunction": "Finance" | "Operations" | "Sales" | "Marketing" | "Product" | null,
  "functionalSplit": {"primary": number, "secondary": number} | null,
  "keyInsights": string[] // bullet-y phrases capturing: validation tests passed/failed, anti-generalist commitment, 80/20 clarity, translation patterns used, breakthrough phrases
}

Rules for setting fields:
- primaryFunction: set ONLY if the transcript clearly anchors to one of the five functions via mechanisms/outcomes aligned to that function.
- secondaryFunction: set ONLY if the transcript clearly states (or strongly implies) a minor second function; otherwise null.
- functionalSplit: set ONLY if an 80/20 (or similar) split is stated or clearly implied; otherwise null.
- keyInsights: include concrete snippets like "COO-level efficiency outcome", "80/20 declared: Product 80 / Marketing 20", "anti-generalist commitment made", "breakthrough phrase: 'I'm a Sales person who…'", "strategy translated to Marketing strategy", etc.

Keep the isComplete flow EXACTLY as follows (all must be satisfied to set isComplete=true):
- A primary function has been clearly identified with high confidence (80%+ confidence)
- The reasoning is well-established based on multiple conversation exchanges
- The user has explicitly acknowledged or agreed with the identification
- The conversation has reached a natural conclusion with both parties satisfied
- The coach has provided clear final recommendations and the user has responded positively

Edge handling:
- If conflicting signals exist (e.g., hopping between functions without lock-in), prefer null for primaryFunction and isComplete=false.
- If the user remains generalist (no 80/20 commitment or no vertical), keep isComplete=false even if a function was mentioned.
- If the transcript drifts into non-Session-1 topics, ignore them; focus strictly on functional identity lock-in.

    Return ONLY the JSON object, nothing else.`;

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      system: "You are an expert at analyzing coaching conversations. Always respond with valid JSON only.",
      messages: [{ role: 'user', content: analysisPrompt }],
      max_tokens: 1000,
      temperature: 0.1,
    });

    const analysisContent = response.content[0].type === 'text' ? response.content[0].text : '';
    const analysis = JSON.parse(analysisContent);

    if (analysis.isComplete && analysis.primaryFunction) {
      return {
        shouldComplete: true,
        completionData: {
          primaryFunction: analysis.primaryFunction,
          secondaryFunction: analysis.secondaryFunction,
          functionalSplit: analysis.functionalSplit,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          keyInsights: analysis.keyInsights,
          completedAt: new Date().toISOString()
        }
      };
    }

    return { shouldComplete: false };
  } catch (error) {
    console.error('Error checking session completion:', error);
    return { shouldComplete: false };
  }
}

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
        status: "in_progress" as const,
        startedAt: new Date()
      });

      // Create initial guidance message for the session (only if no messages exist)
      const existingMessages = await storage.getFoundationSessionMessages(session.id);
      if (existingMessages.length === 0) {
        const initialMessage = getInitialGuidanceMessage(sessionNumber);
        if (initialMessage) {
          await storage.createFoundationSessionMessage({
            sessionId: session.id,
            role: "assistant",
            content: initialMessage
          });
        }
      }

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
          return `You are a Functional Identity Lock-In coach for professionals working on personal brand building.

STYLE
- Speak in simple, everyday language.
- Be warm, direct, and incisive. Use “tough-love” only when clarity stalls.
- Ask short, concrete questions one at a time. Avoid long monologues.
- Keep the conversation natural; do not dump frameworks—use them as prompts.

CORE BELIEF
There are only five functions that create business value:
Finance, Operations, Sales, Marketing, Product.
Every credible professional primarily creates value in ONE of these. Your job is to help the user pick the ONE that credibly claims 80% of their value, then translate their vague aspirations into precise, function-anchored brand language.

OVERALL FLOW
1) Five-Functions Reality Check → 2) Function Validation Tests → 3) Anti-Generalist Enforcement → 4) Career Aspiration Mapping (Past / Present / Future) → 5) Vague→Specific Translation → 6) Breakthrough Confirmation.

------------------------------------------------------------
1) FIVE-FUNCTIONS REALITY CHECK  (OPENING)
Introduce the frame when needed:
“There are five functions that create business value: Finance, Operations, Sales, Marketing, Product. Your expertise mostly lives in ONE. Which one truly claims ~80% of your credible value?”

When user says “lead strategy” → force functional specificity:
- “Strategy isn’t a function—it’s an approach. Is this financial strategy, marketing strategy, or operational strategy?”
- “Everyone thinks they do strategy. Which function OWNS the strategy you want to lead?”
- “There’s Finance strategy, Operations strategy, Marketing strategy, Sales strategy, Product strategy. Pick your lane.”

When user says “impact the business” → force outcome specificity:
- “That could mean anything. Do you impact business through driving revenue (Sales), reducing costs (Operations), allocating resources (Finance), shaping perception (Marketing), or deciding what gets built (Product)?”
- “Everyone impacts the business. HOW specifically do you create business value?”
- “Impact through which function? What’s your mechanism of impact?”

When user says “influence products” → clarify role:
- “Are you deciding what gets built (Product), marketing what gets built (Marketing), or selling what gets built (Sales)?”
- “Influence how—market research, user feedback, competitive analysis, technical specs, or go-to-market?”
- “Product decides what gets built. Marketing positions it. Sales sells it. Which one are you?”

------------------------------------------------------------
2) FUNCTION VALIDATION TESTS (APPLY THE RELEVANT SET)
FINANCE
- “Do your achievements read like ROI, budgets, and allocation calls a CFO would stake their budget on?”
- “Would a Finance team hire you to OWN this, or only as a consultant for a project?”
- “When you say ‘business impact,’ do you mean you influenced how money gets allocated or spent?”

OPERATIONS
- “Operations makes things work better, faster, cheaper. Did you truly optimize processes or just participate?”
- “Would a COO stake their operational budget on you delivering efficiency gains?”
- “When you say ‘drive transformation,’ do you mean you redesigned how work gets done?”

MARKETING
- “Marketing drives demand and shapes perception. Did you change how people think about a product/company?”
- “Would a CMO bet their brand/demand budget on you to generate those outcomes?”
- “When you say ‘strategic impact,’ do you mean you changed market perception?”

SALES
- “Sales generates revenue via relationships and deals. Did you directly impact revenue or only support those who did?”
- “Would a VP Sales trust you with their biggest prospect?”
- “When you say ‘business development,’ did you personally close deals or enable others to close?”

PRODUCT
- “Product determines what gets built and why. Did you influence what customers actually use and value?”
- “Would a Chief Product Officer bet the roadmap on your judgment about user needs?”
- “When you say ‘innovation,’ do you mean you decided what features/products to build?”

------------------------------------------------------------
3) ANTI-GENERALIST ENFORCEMENT
Use these when the user stays broad or says “cross-functional.”

Small vs Big company test:
- “Everyone does ‘everything’ at small companies. In a specialized role at a large company, what would you OWN?”
- “You’re describing what you had to do, not what you’re best at. What would you CHOOSE to own?”

Horizontal vs Vertical skill challenge:
- “You’re describing horizontal skills. What’s your vertical expertise?”
- “Cross-functional collaboration is great. Cross-functional positioning is career suicide.”

80/20 forcing:
- “You mentioned Finance AND Operations AND Marketing. Which function do you OWN versus merely participate in?”
- “Primary function gets 80%, secondary gets 20%. What’s your 80%?”
- “You’re either a Finance person with Operations skills, or an Operations person with Finance skills. Choose.”

------------------------------------------------------------
4) CAREER ASPIRATION FUNCTIONAL MAPPING (3-TIER PASS)
TIER 1 — PRIOR EXPERIENCE (PAST)
- “Across your career so far, where did ~80% of your credible value come from—Finance, Ops, Sales, Marketing, or Product?”
- “Which function would have claimed you as ‘their person’?”
- “When colleagues had problems, which functional area came to YOU?”

TIER 2 — CURRENT ROLE (PRESENT)
- “Right now, which executive would fight hardest to keep you—CFO, COO, VP Sales, CMO, or CPO?”
- “80% of your day is [Finance/Operations/Sales/Marketing/Product]. Which one?”
- “Currently, you create value through which functional mechanism?”

TIER 3 — NEXT MOVE / FUTURE
- “You want to ‘impact the business’ next. Through which function: Finance decisions, Ops improvements, Sales results, Marketing influence, or Product choices?”
- “Five years out, what’s the role—and what functional expertise gets you hired for it?”

------------------------------------------------------------
5) VAGUE → FUNCTIONAL TRANSLATION PATTERNS
Use this table in conversation (don’t show the table; ask the right question):

- “Lead strategic initiatives”
  → “Strategy happens in every function. Are you leading Finance strategy, Marketing strategy, or Operations strategy?”
  → Outcome: specific functional strategy leadership.

- “Drive business transformation”
  → “Transformation of what? Processes (Operations), market position (Marketing), financial performance (Finance), or product offering (Product)?”
  → Outcome: clear transformation mechanism.

- “Influence product development”
  → “Influence how—market research (Marketing), user feedback or feasibility (Product), or go-to-market (Marketing)?”
  → Outcome: clear role in product ecosystem.

- “Impact company growth”
  → “Growth via what—revenue generation (Sales), market expansion (Marketing), efficiency (Operations), or capital allocation (Finance)?”
  → Outcome: specific growth lever ownership.

- “Work cross-functionally”
  → “Everyone works cross-functionally. What function owns you 80% of the time?”
  → Outcome: primary function with a secondary collaborator.

------------------------------------------------------------
6) COMMON RESISTANCE PATTERNS → YOUR RESPONSES
“I’m truly cross-functional.”
- “Cross-functional collaboration is great. Cross-functional positioning is career suicide. Pick your lane.”
- “Investors/hiring managers pick specialists. Which function do you OWN vs participate in?”
- “Generalists are expensive consultants. Specialists are irreplaceable employees.”

“My role requires all functions.”
- “Everyone does ‘everything’ at small companies. In a big company, what would you OWN?”
- “You’re describing what you had to do, not what you’re best at. What would you CHOOSE to own?”

“I want to be strategic across all areas.”
- “Strategy isn’t a function. There’s Finance strategy, Operations strategy, Marketing strategy—pick one.”
- “Strategic thinking is how you approach your function. What function are you strategic about?”

------------------------------------------------------------
7) EXAMPLES OF BREAKTHROUGHS (USE FOR COACHING COLOR, NOT AS FILLER)
- Example: Rushi Parikh — from vague “strategic impact” to Product Marketing
  • Ice-bucket moment: focus the conversation on credible value a market would bet budget on.
  • Breakthrough: “Strategic insights, differentiation, product-market fit” → Product Marketing fit.
- Example: Amanda — from “I want a big team” to Operations focus
  • Redirect: leadership and strategy are assumed at mid-career; identify the function you embody.
  • Breakthrough: clarity around Operations as the core function.

(Use these only if needed to illustrate how a vague aspiration becomes a function-anchored identity.)

------------------------------------------------------------
8) BREAKTHROUGH INDICATORS & CONFIRMATION
Before breakthrough (vague):
- “I impact the business through various initiatives.”
- “I lead strategic projects across different areas.”
- “I want to influence decision-making broadly.”
- “I drive transformation company-wide.”

After breakthrough (functionally clear):
- “I’m an Operations person who optimizes processes.”
- “I’m a Marketing expert who shapes market perception.”
- “I’m a Finance professional who drives resource allocation decisions.”
- “I’m a Product person who determines what gets built.”
- “I’m a Sales professional who generates revenue through relationships.”

When clarity lands, confirm explicitly:
- “Perfect. You’re a [FUNCTION] expert with [SECONDARY] capabilities.”
- “Locked in: [PRIMARY FUNCTION] professional who [SPECIFIC VALUE CREATION].”
- “Now we’re talking. That’s [FUNCTION] work, and you’re credible for it.”

------------------------------------------------------------
SESSION END OUTPUT (KEEP NATURAL)
When the user is clearly locked into a primary function:
1) Say the lock-in line: “Locked in: You’re a [PRIMARY FUNCTION] professional who [specific value creation], with [SECONDARY] as a 20% complement.”
2) Offer two next steps aligned to brand building, e.g.:
   - A one-sentence LinkedIn headline in that function.
   - 3 proof-point bullets that a CFO/COO/CMO/VP Sales/CPO would bet budget on.
If they’re not locked in, state the two most likely functions and the single test you want them to run this week to decide.

REMINDERS
- Never confuse leadership/strategy with function. Those are assumed at mid-career.
- Keep returning to 80/20 ownership, budget bets, and functional mechanisms of value.
- One clear function beats five fuzzy ones. Help them pick their lane and speak it confidently.

Once the functional identity is locked in, the session is complete and you SHOULD NOT ASK ANY FURTHER QUESTIONS OR OFFER TO DO ANYTHING ELSE. Just say the lock-in line and END THE CONVERSATION as the user does not have a way to reply to you anymore.
`;
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

      // Check if session should be automatically completed
      const allMessages = await storage.getFoundationSessionMessages(session.id);
      const completionCheck = await checkSessionCompletion(sessionNumber, allMessages, userProfile);
      
      if (completionCheck.shouldComplete) {
        // Automatically complete the session with the extracted data
        await storage.updateFoundationSession(session.id, {
          status: 'completed',
          completedAt: new Date(),
          completionData: completionCheck.completionData
        });

        // Unlock next session if it exists
        if (sessionNumber < 3) {
          const nextSession = await storage.getFoundationSession(userId, sessionNumber + 1);
          if (nextSession && nextSession.status === "locked") {
            await storage.updateFoundationSession(nextSession.id, {
              status: "available"
            });
          }
        }

        // Send completion notification
        res.write(`data: ${JSON.stringify({ 
          type: 'session_completed',
          sessionNumber,
          completionData: completionCheck.completionData
        })}\n\n`);
      }

      // Send final message with assistant message ID
      res.write(`data: ${JSON.stringify({ 
        type: 'complete', 
        id: assistantMessage.id,
        content: assistantContent 
      })}\n\n`);

      res.end();
    } catch (error) {
      console.error("Error in Foundation Session streaming chat:", error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to generate response' })}\n\n`);
      res.end();
    }
  });

  // Update timer elapsed time for a foundation session
  app.patch("/api/foundation-sessions/:sessionNumber/timer", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionNumber = parseInt(req.params.sessionNumber);
      const userId = req.user!.id;
      const { timerElapsed } = req.body;

      if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
        return res.status(400).json({ error: "Invalid session number. Must be 1, 2, or 3" });
      }

      if (typeof timerElapsed !== 'number' || timerElapsed < 0) {
        return res.status(400).json({ error: "timerElapsed must be a non-negative number" });
      }

      const session = await storage.getFoundationSession(userId, sessionNumber);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Only update timer for in-progress sessions
      if (session.status !== "in_progress") {
        return res.status(400).json({ error: "Timer can only be updated for in-progress sessions" });
      }

      // Update the timer elapsed time
      const updatedSession = await storage.updateFoundationSession(session.id, {
        timerElapsed
      });

      res.json({ timerElapsed: updatedSession?.timerElapsed || timerElapsed });
    } catch (error) {
      console.error("Error updating foundation session timer:", error);
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
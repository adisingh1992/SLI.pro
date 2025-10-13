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

// Format session completion data into a readable summary
function formatSessionSummary(sessionNumber: number, completionData: any): string {
  if (sessionNumber === 1 && completionData) {
    const functionalSplitText = completionData.functionalSplit 
      ? `${completionData.functionalSplit.primary}% primary / ${completionData.functionalSplit.secondary}% secondary`
      : 'Not specified';
    
    const keyInsightsText = completionData.keyInsights?.map((insight: string) => `• ${insight}`)?.join('\n') ?? '• None captured';
    
    return `
═══════════════════════════════════════════════════════════════
PREVIOUS SESSION SUMMARY (Session 1: Functional Identity Lock-In)
═══════════════════════════════════════════════════════════════

PRIMARY FUNCTION: ${completionData.primaryFunction || 'Not determined'}
SECONDARY FUNCTION: ${completionData.secondaryFunction || 'None'}
FUNCTIONAL SPLIT: ${functionalSplitText}
CONFIDENCE LEVEL: ${completionData.confidence ?? 0}%

KEY INSIGHTS:
${keyInsightsText}

REASONING:
${completionData.reasoning || 'No reasoning provided'}

═══════════════════════════════════════════════════════════════
`;
  }
  
  if (sessionNumber === 2 && completionData) {
    const proofBulletsText = completionData.proofBullets?.map((bullet: string) => `• ${bullet}`)?.join('\n') ?? '• None captured';
    const nextStepsText = completionData.nextSteps?.map((step: string) => `• ${step}`)?.join('\n') ?? '• None identified';
    
    return `
═══════════════════════════════════════════════════════════════
PREVIOUS SESSION SUMMARY (Session 2: Professional Credibility Assessment)
═══════════════════════════════════════════════════════════════

PRIMARY FUNCTION: ${completionData.primaryFunction || 'Not determined'}
CREDIBILITY TIER: ${completionData.credibilityTier || 'Not assessed'} (1 is strongest, 5 is weakest)

BRAND CLAIM:
${completionData.brandClaim || 'Not established'}

PROOF POINTS:
${proofBulletsText}

CHECK-WORTHY REASON (Why an investor/hiring manager would bet on them):
${completionData.checkWorthyReason || 'Not established'}

NEXT STEPS IDENTIFIED:
${nextStepsText}

═══════════════════════════════════════════════════════════════
`;
  }
  
  return '';
}

// Format questionnaire data into analysis context
function formatQuestionnaireContext(questionnaire: any): string {
  if (!questionnaire) {
    return '';
  }

  return `
═══════════════════════════════════════════════════════════════
BACKGROUND CONTEXT: USER QUESTIONNAIRE
═══════════════════════════════════════════════════════════════

Industry: ${questionnaire.industry ?? 'Not specified'}
Professional Background: ${questionnaire.background ?? 'Not provided'}
Career Goals: ${questionnaire.goals ?? 'Not specified'}
Aspirations: ${questionnaire.aspirations ?? 'Not provided'}
Challenges: ${questionnaire.challenges ?? 'Not specified'}
Interests: ${questionnaire.interests ?? 'Not provided'}
Timeframe: ${questionnaire.timeframe ?? 'Not specified'}

NOTE: This context was provided by the user in their initial questionnaire. The conversation transcript may reference this information without repeating it explicitly. Do not expect these details to be re-stated in the current conversation.
═══════════════════════════════════════════════════════════════
`;
}

// Format previous session context for analysis
async function formatPreviousSessionsContext(userId: number, currentSessionNumber: number): Promise<string> {
  try {
    const sessions = await storage.getFoundationSessions(userId);
    
    if (!sessions || sessions.length === 0) {
      return '';
    }

    let context = '';

    // For Session 2, include Session 1 summary
    if (currentSessionNumber === 2) {
      const session1 = sessions.find(s => s.sessionNumber === 1 && s.status === 'completed');
      if (session1?.completionData) {
        const data = session1.completionData;
        context += `
═══════════════════════════════════════════════════════════════
BACKGROUND CONTEXT: SESSION 1 (Functional Identity)
═══════════════════════════════════════════════════════════════

Primary Function: ${data.primaryFunction ?? 'Not determined'}
Secondary Function: ${data.secondaryFunction ?? 'None'}
Functional Split: ${data.functionalSplit ? `${data.functionalSplit.primary}% primary / ${data.functionalSplit.secondary}% secondary` : 'Not specified'}
Commitment: ${data.commitmentStatement ?? 'Not made'}

NOTE: The user has already established their functional identity in Session 1. The conversation may reference this without repeating the full exercise.
═══════════════════════════════════════════════════════════════
`;
      }
    }

    // For Session 3, include Session 1 and 2 summaries
    if (currentSessionNumber === 3) {
      const session1 = sessions.find(s => s.sessionNumber === 1 && s.status === 'completed');
      const session2 = sessions.find(s => s.sessionNumber === 2 && s.status === 'completed');
      
      if (session1?.completionData) {
        const data = session1.completionData;
        context += `
═══════════════════════════════════════════════════════════════
BACKGROUND CONTEXT: SESSION 1 (Functional Identity)
═══════════════════════════════════════════════════════════════

Primary Function: ${data.primaryFunction ?? 'Not determined'}
Commitment: ${data.commitmentStatement ?? 'Not made'}
`;
      }

      if (session2?.completionData) {
        const data = session2.completionData;
        const proofBulletsText = data.proofBullets?.slice(0, 3)?.map((bullet: string) => `• ${bullet}`)?.join('\n') ?? '';
        
        context += `
SESSION 2 (Credibility & Proof)
═══════════════════════════════════════════════════════════════

Credibility Tier: ${data.credibilityTier ? `Tier ${data.credibilityTier}` : 'Not assessed'}
Brand Claim: ${data.brandClaim ?? 'Not established'}
${proofBulletsText ? `Top Proof Points:\n${proofBulletsText}` : ''}

NOTE: The user has completed Sessions 1 & 2 covering functional identity and credibility proof. The conversation may build upon this foundation without repeating prior work.
═══════════════════════════════════════════════════════════════
`;
      }
    }

    return context;
  } catch (error) {
    console.error('Error formatting previous sessions context:', error);
    return '';
  }
}

// Get initial guidance message for each session
function getInitialGuidanceMessage(sessionNumber: number): string | null {
  switch (sessionNumber) {
    case 1:
      return "Hello, I'm here to help you identify your primary business function (Finance, Operations, Sales, Marketing, or Product). Let's start by discussing your current role and what energizes you most about work.";
    case 2:
      return "If I'm writing you a $1M check because you're credible, what SPECIFIC expertise am I investing in? Think like a ruthless, revenue-only investor: what would they throw $1M at YOU to do?";
    case 3:
      return "'I led cross-functional teams' means nothing by itself. We'll excavate the HOW, WHY, STRUGGLE, and INSIGHT so your stories prove credibility and fuel your brand.";
    default:
      return null;
  }
}

// Check if a foundation session should be automatically completed
async function checkSessionCompletion(userId: number, sessionNumber: number, messages: any[], userProfile: any): Promise<{ shouldComplete: boolean; completionData?: any }> {
  if (sessionNumber !== 1 && sessionNumber !== 2 && sessionNumber !== 3) {
    return { shouldComplete: false };
  }

  // Check if we have enough conversation for meaningful analysis
  if (messages.length < 10) { // Need at least 5 back-and-forth exchanges for a complete conversation
    return { shouldComplete: false };
  }

  try {
    // Fetch questionnaire and previous sessions context for analysis
    const questionnaire = await storage.getQuestionnaire(userId);
    const questionnaireContext = formatQuestionnaireContext(questionnaire);
    const previousSessionsContext = await formatPreviousSessionsContext(userId, sessionNumber);

    let analysisPrompt = '';
    
    if (sessionNumber === 1) {
      // Session 1: Functional Identity Lock-In analysis
      analysisPrompt = `${questionnaireContext}You are evaluating a Session 1 "Functional Identity Lock-In" coaching conversation that must stay within the Five Functions framework: Finance, Operations, Sales, Marketing, Product. Use the conversation transcript and the following guardrails from our methodology to make a determination.

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
    } else if (sessionNumber === 2) {
      // Session 2: Professional Credibility Assessment analysis
      analysisPrompt = `${questionnaireContext}${previousSessionsContext}You are evaluating a Session 2 "Professional Credibility Assessment" coaching conversation focused on identifying measurable expertise and business impact. Use the conversation transcript to determine if the user has established credible proof of expertise within one of the five functions: Finance, Operations, Sales, Marketing, Product.

    Conversation Messages:
${messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n')}

Use this methodology to analyze the transcript:

1) Evidence Quality Assessment
   - Tier 1: Measurable business outcomes (saved $ / grew revenue / % improvements / shipped usage & retention)
   - Tier 2: Channel-specific execution with clear levers and playbooks
   - Tier 3: Systems thinking WITH results (frameworks + concrete outcomes)
   - Tier 4: Intentionality without metrics (story is coherent but lacks numbers)
   - Tier 5: Soft skills & aspirations (no proof)

2) Credibility Proof Validation
   - Cross-context repeatability (proven at multiple companies/contexts)
   - Specific channels, methods, and decision criteria
   - Quantifiable results with numbers, percentages, dollar amounts
   - Strong opinions and principled stances on when to use different approaches

3) Function-Specific Credibility Markers
   - FINANCE: ROI decisions, budget allocation, resource optimization with measurable impact
   - OPERATIONS: Process improvements, efficiency gains, cost reductions with quantified outcomes
   - MARKETING: Demand generation, perception shifts, positioning with measurable results
   - SALES: Revenue generation, pipeline ownership, deal closure with specific numbers
   - PRODUCT: Product decisions, roadmap judgment, user value creation with shipped outcomes

4) Hard vs Soft Claims Detection
   - Flag aspirational language ("I want to," "I would be good at," "I could do")
   - Identify school-only examples or theoretical knowledge without practical application
   - Convert vague claims into specific functional mechanisms with proof

5) Completion Criteria
   - Clear functional expertise established with Tier 1-2 evidence
   - Measurable business impact demonstrated across contexts
   - Strong opinions and decision frameworks articulated
   - Credible proof that an investor/hiring manager would bet budget on

Respond in STRICT JSON only (no prose, no code fences) with EXACTLY this schema and keys:

{
  "isComplete": boolean,
  "primaryFunction": "Finance" | "Operations" | "Sales" | "Marketing" | "Product" | null,
  "confidence": number, // 0-100
  "reasoning": string,  // brief explanation grounded in transcript evidence
  "credibilityTier": 1 | 2 | 3 | 4 | 5, // Evidence tier achieved (1 is strongest)
  "proofBullets": string[], // 3-5 specific proof points with numbers/context
  "brandClaim": string, // One-line brand claim: "[Function] pro who [mechanism] to drive [measurable outcome]"
  "checkWorthyReason": string, // Why an investor/hiring manager would bet budget on them
  "nextSteps": string[] // If gaps remain: specific artifacts to build or proofs to gather
}

Rules for setting fields:
- primaryFunction: set ONLY if clear functional expertise is established with strong evidence
- credibilityTier: assess the strongest tier of evidence provided (prefer conservative rating)
- proofBullets: include only concrete, measurable evidence with numbers and context
- brandClaim: create only if strong functional identity and proof are established
- isComplete: true only if credibilityTier is 1 or 2 AND strong functional expertise is proven

Keep the isComplete flow EXACTLY as follows (all must be satisfied to set isComplete=true):
- Credibility tier 1 or 2 evidence has been established
- A primary function has been clearly identified with strong proof
- Measurable business impact has been demonstrated across contexts
- The user has strong opinions and decision frameworks
- The conversation has established check-worthy credibility for investors/hiring managers

Edge handling:
- If only aspirational or theoretical claims exist, keep isComplete=false
- If evidence is school-only or single-context, prefer lower credibility tier
- If no clear functional expertise is established, set primaryFunction to null

    Return ONLY the JSON object, nothing else.`;
    } else if (sessionNumber === 3) {
      // Session 3: Positioning Story Development analysis
      analysisPrompt = `${questionnaireContext}${previousSessionsContext}You are evaluating a Session 3 "Positioning Story Development" coaching conversation focused on extracting compelling stories that prove unique value. Use the conversation transcript to determine if the user has developed a complete, content-ready narrative with agency, methodology, vulnerability, specificity, and functional connection.

    Conversation Messages:
${messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n')}

Use this methodology to analyze the transcript:

1) Story Completeness Assessment (Green Lights)
   - Personal agency is explicit ("I did" vs "we did")
   - Thinking process visible (frameworks, contrarian insight, system lens)
   - Vulnerability present (tension, discomfort, growth)
   - Specificity achieved (numbers, before/after, unique approach)
   - Functional connection made (ties back to their primary function/credibility)

2) Story Quality Indicators
   - Signature story with clear context, stakes, challenge, approach, tension, outcome
   - Mechanisms and frameworks explicitly described
   - Decision points and trade-offs clearly articulated
   - Measurable outcomes with specific numbers or qualitative results
   - Repeatability demonstrated or implied

3) Content-Ready Elements
   - One-line brand claim established
   - 3-5 content post ideas derived from the story
   - Clear methodology that can be applied elsewhere
   - Contrarian insights or unique perspective surfaced

4) Red Flags to Detect
   - Too generic / could be anyone; soft skills only
   - Team win without agency; participation, not ownership
   - No vulnerability; success sounds effortless
   - Outcomes with no "how they think"
   - Vague claims without specific mechanisms

5) Completion Criteria
   - Complete signature story with all required elements
   - Clear personal agency and methodology established
   - Vulnerability and growth demonstrated
   - Content angles and brand positioning extracted
   - Functional connection to their credible expertise

Respond in STRICT JSON only (no prose, no code fences) with EXACTLY this schema and keys:

{
  "isComplete": boolean,
  "primaryFunction": "Finance" | "Operations" | "Sales" | "Marketing" | "Product" | null,
  "confidence": number, // 0-100
  "reasoning": string,  // brief explanation grounded in transcript evidence
  "signatureStory": {
    "title": string,
    "context": string,
    "challenge": string,
    "approach": string,
    "tension": string,
    "outcome": string,
    "repeatability": string
  } | null,
  "brandClaim": string, // "[Function] professional who [mechanism/approach] to achieve [measurable outcome]"
  "contentAngles": string[], // 3-5 content post ideas from the story
  "methodology": string, // Core framework or approach that makes them unique
  "nextSteps": string[] // If gaps remain: specific elements to develop or clarify
}

Rules for setting fields:
- primaryFunction: set ONLY if clear functional expertise connects to the story
- signatureStory: create only if all story elements (agency + methodology + vulnerability + specificity) are present
- brandClaim: create only if strong functional identity and story proof are established
- contentAngles: include only angles that emerge naturally from the conversation
- isComplete: true only if signature story is complete AND functional connection is clear

Keep the isComplete flow EXACTLY as follows (all must be satisfied to set isComplete=true):
- Personal agency explicitly established in the story
- Methodology and thinking process clearly articulated
- Vulnerability and growth demonstrated
- Specific outcomes with numbers or measurable results
- Functional connection to their credible expertise established
- Content angles and brand positioning extracted

Edge handling:
- If story lacks personal agency or is too generic, keep isComplete=false
- If no clear methodology or thinking process, set signatureStory to null
- If no functional connection established, prefer null for primaryFunction
- If conversation incomplete, provide specific nextSteps for what's missing

    Return ONLY the JSON object, nothing else.`;
    }

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
      let completionData: any = {
        primaryFunction: analysis.primaryFunction,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        completedAt: new Date().toISOString()
      };

      if (sessionNumber === 1) {
        // Session 1 specific data
        completionData.secondaryFunction = analysis.secondaryFunction;
        completionData.functionalSplit = analysis.functionalSplit;
        completionData.keyInsights = analysis.keyInsights;
      } else if (sessionNumber === 2) {
        // Session 2 specific data
        completionData.credibilityTier = analysis.credibilityTier;
        completionData.proofBullets = analysis.proofBullets;
        completionData.brandClaim = analysis.brandClaim;
        completionData.checkWorthyReason = analysis.checkWorthyReason;
        completionData.nextSteps = analysis.nextSteps;
      } else if (sessionNumber === 3) {
        // Session 3 specific data
        completionData.signatureStory = analysis.signatureStory;
        completionData.brandClaim = analysis.brandClaim;
        completionData.contentAngles = analysis.contentAngles;
        completionData.methodology = analysis.methodology;
        completionData.nextSteps = analysis.nextSteps;
      }

      return {
        shouldComplete: true,
        completionData
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

      // Get previous session's completion data if available
      let previousSessionData = null;
      if (sessionNumber > 1) {
        const previousSession = await storage.getFoundationSession(userId, sessionNumber - 1);
        if (previousSession?.status === 'completed' && previousSession.completionData) {
          previousSessionData = previousSession.completionData;
        }
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send user message ID first
      res.write(`data: ${JSON.stringify({ type: 'user_message', id: userMessage.id })}\n\n`);

      // Initialize empty assistant content for accumulation
      let assistantContent = '';

      // Generate Foundation Session-specific system prompt
      const getFoundationSessionSystemPrompt = (previousSessionData?: any) => {
        let basePrompt = '';
        
        // Add previous session summary if available
        if (previousSessionData) {
          const summary = formatSessionSummary(sessionNumber - 1, previousSessionData);
          if (summary) {
            basePrompt = `${summary}

⚠️ CRITICAL INSTRUCTION: The user has already completed the previous session shown above. Use this summary as essential context about what has been established. DO NOT repeat questions, exercises, or topics already covered in the previous session, instead mention the answers in the chat and confirm from the user again. Build upon this foundation to advance the conversation to new territory.

───────────────────────────────────────────────────────────────

`;
          }
        }
        
        if (sessionNumber === 1) {
          return basePrompt + `You are a Functional Identity Lock-In coach for professionals working on personal brand building.

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

CRITICAL COMPLETION INSTRUCTION:
Do NOT end this session prematurely. The session is ONLY complete when ALL of the following are definitively established:
1. Primary function is clearly locked (Finance, Operations, Sales, Marketing, or Product)
2. User has confirmed this is their 80% value creation mechanism
3. If applicable, secondary function (20%) is identified
4. Functional split is explicitly stated and agreed upon

If ANY required data is missing or the user has given vague/incomplete answers:
- Ask the question again in a different way
- Provide examples to clarify what you need
- Push for specificity until you get a clear, definitive answer
- Do NOT thank them and wish them good luck until ALL criteria are met

Only when the functional identity is COMPLETELY locked in with all required data should you:
1. Say the lock-in line: "Locked in: You're a [PRIMARY FUNCTION] professional who [specific value creation], with [SECONDARY] as a 20% complement."
2. Provide the two next steps aligned to brand building
3. Then and ONLY then, end the conversation naturally
`;
        } else if (sessionNumber === 2) {
          return `You are a VC-style Credibility Coach for professionals working on personal brand building.

STYLE & TONE
- Be warm, direct, and "tough-love" when needed. Conversational, plain English.
- Keep questions short, one at a time. No monologues. Escalate specificity progressively.
- Stay ROI-obsessed: investors and hiring managers bet on credible proof, not aspirations.

CORE PROBLEM TO SOLVE
- Most clients speak in aspirations; VCs/hiring managers care about proof and ROI.
- Your job: convert soft claims into hard, cross-context, measurable evidence—and lock the brand to a credible function (Marketing, Sales, Product, Operations, Finance).

OPENING MOVE — THE $1M VC TEST (with alternative framings)
- Ask: "If I'm writing you a $1M check because you're credible, what SPECIFIC expertise am I investing in?"
- Variants:
  • "Where are you credible enough that I'd take a bet on you right now?"
  • "What exact job would a startup hire you for because you can deliver ROI?"
  • "Think like a ruthless, revenue-only investor: what would they throw $1M at YOU to do?"

THE "ICE BUCKET" INTERVENTION (signature move)
- When you hear soft claims ("lead strategy," "impact the business," "world-class at X," "I'm intentional," "I brainstorm well"):
  • Say: "A VC doesn't care about that. What will they find you CREDIBLE for—in Marketing, Sales, Product, Operations, or Finance?"
  • Keep pressing until the user names a function and a mechanism of value creation.

WEAK VS HARD-KNOCKS — CLAIM DETECTION
- Flag weak/squishy: brainstorming, insights, intentionality, "world-class," "I could do it," school projects, "eyes closed."
- Convert to hard-knocks evidence: concrete channels/methods used, decision points owned, shipped results, repeated across contexts, with numbers.

SPECIFICITY ESCALATION LADDER (Level 1→4)
- L1 (Soft response): "Your coworkers may enjoy that story; investors won't. What's the ROI-credible skill?"
- L2 (Function): "Which function owns this? Marketing, Sales, Product, Operations, or Finance?"
- L3 (Channel/method): "Which channels/methods? What did you do, precisely? When do you choose A vs B?"
- L4 (Cross-context): "Where did you repeat this—Company A and Company B? Show it's not one-off luck."

ASPIRATION ↔ ACHIEVEMENT GAP (name it fast)
- Red-flag phrases: "I want to…," "I would be good at…," "I wish I had a portfolio…," "In school I enjoyed…," "I could do that 'eyes closed'…"
- Your reality checks:
  • "That's aspirational. What have you DONE?"
  • "What do you have paid-work proof for?"
  • "School projects don't count—show production results."

EVIDENCE HIERARCHY (strongest → weakest)
- Tier 1: Measurable business outcomes (saved $ / grew revenue / % improvements / shipped usage & retention).
- Tier 2: Channel-specific execution (e.g., YouTube, LinkedIn, podcasts, events) with clear levers and playbooks.
- Tier 3: Systems thinking WITH results (frameworks + concrete outcomes).
- Tier 4: Intentionality without metrics (story is coherent but lacks numbers).
- Tier 5: Soft skills & aspirations (no proof).
→ Always push upward toward Tier 1–2 evidence.

PROOF-EXTRACTION PROCESS (the 6-step sequence)
1) Identify the aspiration: "I want to lead strategy / direct product / be world-class at X…"
2) Apply the VC test: "What makes you credible for a job someone must hire TODAY?"
3) Force functional specificity: Marketing / Sales / Product / Operations / Finance — pick ONE primary.
4) Extract channel/method detail: enumerate levers, when to use which, your decision criteria.
5) Demand cross-context proof: repeatability at A and B (or A and an agency/side context).
6) Get the numbers: how much, how many, % change, $ impact, volume, time saved, throughput.

CREDIBILITY LITMUS TESTS (quick validators)
- ROI test: "Why would I, as an investor, bet budget on YOU?"
- Hiring manager test: "What job are you provably qualified to OWN?"
- Differentiation test: "What strong opinions/plays do you have that separate you from peers?"
- Cross-context test: "Where else did you repeat this?"
- Opinion test: "What's your principled stance on when to pull each lever?"

COMMON RESISTANCE PATTERNS → YOUR RESPONSES
- "I could do it if given a chance." → "What DO you have proof of? Paid work only."
- "My journey/intentionality shows credibility." → "Investors buy outcomes; show ROI."
- "I'm good at brainstorming/leadership." → "Everyone says that. Show hard expertise with metrics."
- "I want to impact via strategy." → "Strategy isn't a function. Is it Finance, Ops, Marketing, Sales, or Product strategy—and what proof?"

FIVE-FUNCTIONS ANCHOR (keep returning to mechanism)
- Finance = resource allocation, budgets, ROI decisions.
- Operations = better/faster/cheaper; throughput, quality, cost-down.
- Marketing = demand, perception, positioning, GTM messaging.
- Sales = direct revenue, pipeline ownership, closing or decisive enablement.
- Product = what gets built and why; roadmap, prioritization, user-value tradeoffs.

CONVERSATION FLOW (natural, iterative)
1) Start with the $1M test. If soft → Ice Bucket.
2) Lock a primary function (optionally note a secondary).
3) Walk the specificity ladder (function → channels/methods → cross-context → metrics).
4) Run litmus tests; handle resistance.
5) Summarize evidence at the top tier it genuinely supports.

SESSION END — DELIVERABLES (concise, action-oriented)
- One-line brand claim: "[Function] pro who [mechanism] to drive [measurable outcome]."
- 3–5 proof bullets (Tier-1/2 evidence only), each with a number, lever, and repeatability context.
- "$1M check reason": one sentence on why an investor/hiring manager would bet budget on them now.
- Next steps if gaps remain: specific artifacts to build (portfolio pieces, case studies, channel proofs), targeted reps to gather numbers, and where to repeat results.

GUARDRAILS
- Never accept school projects as core proof. Never stop at vague "strategy/impact" talk.
- Keep forcing mechanisms, numbers, and cross-context repetition.
- Always translate soft claims into one of the five functions and ROI language.

Once you have established their credible expertise with measurable proof and locked their primary function, the session is complete and you SHOULD NOT ASK ANY FURTHER QUESTIONS OR OFFER TO DO ANYTHING ELSE. Provide the final deliverables and END THE CONVERSATION as the user does not have a way to reply to you anymore.
`;
        } else if (sessionNumber === 3) {
          return `You are a Story Extraction Coach for professionals building their personal brand (Session 3). Your job is to turn generic claims into compelling, content-ready narratives that reveal HOW they think, WHY they chose a path, the STRUGGLE they navigated, and the INSIGHTS they earned—then tie each story back to their functional credibility.

STYLE & CONVERSATION RULES
- Warm, direct, and incisive; plain English; "one short question at a time."
- Keep it natural—no monologues. Escalate specificity progressively.
- Default to "I, not we." Refuse vague claims; always seek mechanisms, trade-offs, and numbers.
- Prioritize agency, methodology, vulnerability, specificity, and functional connection.

CORE CHALLENGE TO STATE UP FRONT
"'I led cross-functional teams' means nothing by itself. We'll excavate the HOW, WHY, STRUGGLE, and INSIGHT so your stories prove credibility and fuel your brand."

------------------------------------------------------------
PART 1 — SIGNATURE STORY EXCAVATION (OPENING PROMPTS)
Use the "Surprise Success" mining technique:
- "Give me the story where you surprised yourself with the outcome. What result did you not expect?"
- "When was your approach different from everyone else's—what did you see that they missed?"
- "What are you proud of that most people wouldn't understand was hard?"
- "Tell me about a result that made your boss look good—how did they react?"

Goal: surface authentic pride, unique perspective, unexpected outcomes.

------------------------------------------------------------
PART 2 — HOW YOU THINK (METHODOLOGY & DECISIONING)
Probe for frameworks, levers, and judgment calls:
- "What made YOUR approach different from what anyone else would try?"
- "Which framework/tool/method did you use that others hadn't considered?"
- "Where did the idea come from? What told you this was the right bet?"
- "What was the contrarian insight that changed the outcome?"

Decision-making philosophy:
- "When you faced the trade-off, how did you think about it?"
- "What was going through your mind at the decision point?"
- "What drives that choice—impact, principle, risk posture, something else?"

First-principles pattern (if applicable):
- "What's the fundamental question you asked?"
- "How did you break the problem down? Which assumptions did you reject?"

Contrarian perspective pattern:
- "What does everyone in your industry believe that you think is wrong?"
- "What's the conventional wisdom you challenge—and why?"

Systems-thinking pattern:
- "How do the parts connect? What system sits underneath this problem?"
- "Which structural factors (org, incentives, flows) shaped the outcome?"

Win–win value pattern:
- "How did you ensure it created value for others? What's 'in it for them'?"

------------------------------------------------------------
PART 3 — VULNERABILITY & STRUGGLE (AUTHENTICITY LAYER)
Expose the tension and growth:
- "How does [strength/value A] conflict with [constraint/value B]?"
- "What were you uncomfortable with? What did you have to change about yourself?"
- "What did you force yourself to do that went against your nature?"
- "What's something you're proud of that others wouldn't realize was hard—and why?"

Gap check:
- "When have you felt the gap between your 'work self' and 'authentic self'?"
- "Which parts of you do you amplify or downplay at work?"

------------------------------------------------------------
PART 4 — IDEAL PROFESSIONAL SELF (FRAMING EXERCISE)
Set expectations:
"Assume that in any mid-career role you'll do some strategy and team management. Set that aside. Describe your ideal professional self's distinctive qualities, interactions, and impact."

Use to surface non-generic traits that differentiate their brand.

------------------------------------------------------------
PART 5 — CONTENT IDEATION FROM STORIES
Run a "2–4 minute speed-run":
"List every topic you could write about from this single lasting impression. Don't filter—breadth over polish."

Then generate thought-leadership angles:
- "How does your expertise apply to [current trend/news]?"
- "What's a contrarian take on [industry assumption]?"
- "What lessons from [your background] apply to [target area]?"
- "What would you tell someone just starting in [your field]?"

------------------------------------------------------------
PART 6 — STORY QUALITY GATEKEEPERS (FILTERS & REDIRECTS)
Team-win filter:
- "Sounds like a team win. What was YOUR specific contribution?"
- "You said 'we.' What did YOU personally decide, build, or optimize?"

Credibility check:
- "If I called your old team, what would they remember you for?"
- "What problem do people text YOU about on weekends—and why?"

Forbidden story types → Redirects:
- "Led a successful team project" → "Your fingerprints: what did you own?"
- "Managed a challenging situation" → "What measurable result proves it worked?"
- "Helped the company grow" → "Where's the causal link to your work?"
- "Contributed to strategy" → "Which recommendation of yours shipped? Outcome?"
- "Collaborated cross-functionally" → "How did you guide it? What struggle did you overcome?"

------------------------------------------------------------
PART 7 — SUCCESS INDICATORS (GREEN LIGHTS) VS RED FLAGS
Green lights (ship-ready story):
- Personal agency is explicit ("I did").
- Thinking process visible (frameworks, contrarian insight, system lens).
- Vulnerability present (tension, discomfort, growth).
- Specificity achieved (numbers, before/after, unique approach).
- Functional connection made (ties back to their primary function/credibility).

Red flags (keep excavating):
- Too generic / could be anyone; soft skills only.
- Team win without agency; participation, not ownership.
- No vulnerability; success sounds effortless.
- Outcomes with no "how they think."

------------------------------------------------------------
PART 8 — IMPLEMENTATION FLOW (TIME-BOXED RHYTHM)
Stage 1 (Minutes 2–4): Surface-level excavation
- Surprise success; unexpected outcomes; pride with hidden difficulty.

Stage 2 (Minutes 5–7): Methodology & mindset
- What made their approach different; frameworks; contrarian/system/first-principles; decision criteria.

Stage 3 (Minutes 8–9): Vulnerability & learning
- Discomfort, internal conflict, growth; values in tension.

Stage 4 (Minute 10): Content validation & functional tie-back
- Confirm agency + methodology + vulnerability + specificity; link to their function.

------------------------------------------------------------
PART 9 — SESSION CLOSE (DELIVERABLES)
Provide concise, content-ready outputs:
1) One-line brand claim:
   "[Function] professional who [mechanism/approach] to achieve [measurable outcome]."
2) One polished Signature Story (outline):
   - Title
   - Context & stakes
   - Challenge & constraints
   - Approach (frameworks, levers, decisions, trade-offs)
   - Tension/Vulnerability (what felt hard; what changed in you)
   - Outcome (numbers, before/after, quality/throughput/revenue/etc.)
   - Repeatability (where else you applied it or would apply it)
3) 3–5 content post ideas derived from the story
   - First-principles angle, contrarian take, systems insight, win–win philosophy
4) Next steps (if gaps): exact artifacts to build (case study, portfolio proof), metrics to capture, and a plan to repeat results in a second context.

REMINDERS
- Keep pressing until we have agency, methodology, vulnerability, specificity, and a functional connection.
- Translate soft claims into proof the market respects; numbers and decision points matter.
- Ask one targeted question at a time. If answers stay generic, escalate to tension/decision/metric prompts.

Once you have a complete story with all required elements (agency + methodology + vulnerability + specificity + functional connection), the session is complete and you SHOULD NOT ASK ANY FURTHER QUESTIONS OR OFFER TO DO ANYTHING ELSE. Provide the final deliverables and END THE CONVERSATION as the user does not have a way to reply to you anymore.
`;
        }
        
        return `You are a professional business coach. This Foundation Session ${sessionNumber} is not yet fully implemented. Please let the user know this session is coming soon.`;
      };

      // Generate streaming response using Foundation Session-specific Claude integration
      const systemPrompt = getFoundationSessionSystemPrompt(previousSessionData);
      
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
      const completionCheck = await checkSessionCompletion(userId, sessionNumber, allMessages, userProfile);
      
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
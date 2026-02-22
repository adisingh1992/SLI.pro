import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import {
  insertEnhancementModuleMessageSchema,
  updateEnhancementModuleSchema,
} from "../shared/schema";
import Anthropic from "@anthropic-ai/sdk";

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
};

const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user?.isAdmin) {
    return next();
  }
  res.status(403).json({ error: "Admin access required" });
};

// Get initial guidance message for each module
function getInitialGuidanceMessage(moduleCode: string): string | null {
  switch (moduleCode) {
    case "A":
      return "This module analyzes digital behavior patterns and content engagement psychology. Understanding how professionals interact with your online presence helps optimize positioning for maximum impact.\n\nThe first exercise is the 'Starbucks Line Test'—a 10-15 second elevator pitch that captures what you do in memorable, jargon-free language. This isn't your job title; it's how you'd explain your expertise to someone casually while waiting for coffee.";
    case "B":
      return "Quality over quantity. You need 50 relevant connections, not 500 random ones. Let's start: How many connections do you currently have on LinkedIn? (Rough estimate is fine)";
    case "C":
      return "Career Aspiration Alignment Framework. I'll help you align your long-term goals with your current positioning reality. Let's start by exploring your aspirational goals and identifying any gaps.";
    default:
      return null;
  }
}

// Format previous module's completion data into a summary for the next module's system prompt
function formatModuleSummary(moduleCode: string, completionData: any): string {
  if (moduleCode === "A") {
    const featuredArticlesText =
      completionData.featuredArticleSeeds
        ?.map((article: string) => `• ${article}`)
        ?.join("\n") ?? "• None developed";
    const naturalFormatsText =
      completionData.contentStrategy?.naturalFormats
        ?.map((format: string) => `• ${format}`)
        ?.join("\n") ?? "• None identified";
    const phasedPlanText =
      completionData.contentStrategy?.phasedPlan
        ?.map((step: string) => `• ${step}`)
        ?.join("\n") ?? "• No plan created";
    const barriersText =
      completionData.contentStrategy?.barriers
        ?.map((barrier: string) => `• ${barrier}`)
        ?.join("\n") ?? "• None identified";
    const keyImprovementsText =
      completionData.linkedinOptimization?.keyImprovements
        ?.map((improvement: string) => `• ${improvement}`)
        ?.join("\n") ?? "• None specified";
    const actionPlanText =
      completionData.actionPlan
        ?.map((step: string) => `• ${step}`)
        ?.join("\n") ?? "• No action plan";
    const successMetricsText =
      completionData.successMetrics
        ?.map((metric: string) => `• ${metric}`)
        ?.join("\n") ?? "• No metrics defined";

    return `
═══════════════════════════════════════════════════════════════
PREVIOUS MODULE SUMMARY (Module A: Digital Behavior & LinkedIn)
═══════════════════════════════════════════════════════════════

Brand Claim: ${completionData.brandClaim ?? "Not established"}

Featured Article Ideas:
${featuredArticlesText}

Content Strategy:
  Natural Formats:
${naturalFormatsText}
  
  Phased Plan:
${phasedPlanText}
  
  Barriers Addressed:
${barriersText}
  
  Behavior Change Approach: ${completionData.contentStrategy?.behaviorChange ?? "Not defined"}

LinkedIn Optimization:
  Headline Suggestion: ${completionData.linkedinOptimization?.headline ?? "Not provided"}
  Profile Score: ${completionData.linkedinOptimization?.profileScore ?? "N/A"}/10
  Key Improvements:
${keyImprovementsText}

Action Plan:
${actionPlanText}

Success Metrics:
${successMetricsText}

Confidence Level: ${completionData.confidence ?? "N/A"}%

CRITICAL: Do not repeat questions about digital behavior, LinkedIn content strategy, featured articles, or profile optimization, instead mention the answers in the chat and confirm from the user again. Build upon this foundation.
═══════════════════════════════════════════════════════════════
`;
  }

  if (moduleCode === "B") {
    const strategicGapsText =
      completionData.strategicGaps
        ?.map((gap: string) => `• ${gap}`)
        ?.join("\n") ?? "• None identified";
    const tier1TargetsText =
      completionData.tier1Targets
        ?.map((target: string) => `• ${target}`)
        ?.join("\n") ?? "• None defined";
    const tier2TargetsText =
      completionData.tier2Targets
        ?.map((target: string) => `• ${target}`)
        ?.join("\n") ?? "• None defined";
    const outreachTemplatesText =
      completionData.outreachTemplates
        ?.map((template: string) => `• ${template}`)
        ?.join("\n") ?? "• None created";
    const profileOptimizationText =
      completionData.profileOptimization
        ?.map((item: string) => `• ${item}`)
        ?.join("\n") ?? "• None specified";
    const thirtyDayPlanText =
      completionData.thirtyDayPlan
        ?.map((step: string) => `• ${step}`)
        ?.join("\n") ?? "• No plan created";
    const psychologicalBarriersText =
      completionData.psychologicalBarriers
        ?.map((barrier: string) => `• ${barrier}`)
        ?.join("\n") ?? "• None identified";

    return `
═══════════════════════════════════════════════════════════════
PREVIOUS MODULE SUMMARY (Module B: Network Position Mapping)
═══════════════════════════════════════════════════════════════

Functional Identity: ${completionData.functionalIdentity ?? "Not established"}

Psychological Barriers:
${psychologicalBarriersText}

Digital Presence Audit: ${completionData.digitalPresenceAudit ?? "Not completed"}

Network Analysis:
  Current Position: ${completionData.networkAuditSummary ?? "Not assessed"}
  Positioning Gap: ${completionData.positioningGap ?? "Not identified"}
  
Strategic Gaps:
${strategicGapsText}

Relationship Strategy:
  Tier 1 Targets (Top 10 decision-makers):
${tier1TargetsText}
  
  Tier 2 Targets (Next 20 influencers/referrers):
${tier2TargetsText}
  
  Value Proposition: ${completionData.valueProposition ?? "Not articulated"}

Outreach Approaches:
${outreachTemplatesText}

Profile Optimization Recommendations:
${profileOptimizationText}

30-Day Network Repositioning Plan:
${thirtyDayPlanText}

Confidence Level: ${completionData.confidence ?? "N/A"}%

CRITICAL: Do not repeat questions about functional identity, network composition, relationship tiering, or outreach strategies, instead mention the answers in the chat and confirm from the user again. Build upon this foundation.
═══════════════════════════════════════════════════════════════
`;
  }

  return "";
}

// Format questionnaire data into a summary for system prompt context
function formatQuestionnaireSummary(questionnaire: any): string {
  if (!questionnaire) {
    return "";
  }

  return `
═══════════════════════════════════════════════════════════════
USER QUESTIONNAIRE SUMMARY
═══════════════════════════════════════════════════════════════

Industry: ${questionnaire.industry ?? "Not specified"}
Professional Background: ${questionnaire.background ?? "Not provided"}
Career Goals: ${questionnaire.goals ?? "Not specified"}
Aspirations: ${questionnaire.aspirations ?? "Not provided"}
Challenges: ${questionnaire.challenges ?? "Not specified"}
Interests: ${questionnaire.interests ?? "Not provided"}
Timeframe: ${questionnaire.timeframe ?? "Not specified"}

CRITICAL: The user has already provided this information in their questionnaire. Do not ask these questions again. Reference this context naturally in your coaching, instead mention the answers in the chat and confirm from the user again.
═══════════════════════════════════════════════════════════════
`;
}

// Format resume documents into a summary for system prompt context
async function formatResumeSummary(userId: number): Promise<string> {
  try {
    const documents = await storage.getDocuments(userId);
    const resumeDocuments = documents.filter((doc) => doc.type === "resume");

    if (!resumeDocuments || resumeDocuments.length === 0) {
      return "";
    }

    // Use the most recent resume (last uploaded)
    const resume = resumeDocuments[resumeDocuments.length - 1];

    if (!resume.analysisContent && !resume.name) {
      return "";
    }

    return `
═══════════════════════════════════════════════════════════════
USER RESUME SUMMARY
═══════════════════════════════════════════════════════════════

Document Name: ${resume.name}
${resume.analysisContent ? `\nResume Content Analysis:\n${resume.analysisContent}` : ""}

CRITICAL: The user has already uploaded their resume. Use this information to provide personalized coaching based on their actual experience and background. Reference specific details from their resume naturally in your guidance.
═══════════════════════════════════════════════════════════════
`;
  } catch (error) {
    console.error("Error formatting resume summary:", error);
    return "";
  }
}

// Format foundation sessions 1, 2, 3 data into a concise combined summary
async function formatFoundationSessionsSummary(
  userId: number,
): Promise<string> {
  try {
    // Fetch all foundation sessions for the user
    const sessions = await storage.getFoundationSessions(userId);

    if (!sessions || sessions.length === 0) {
      return "";
    }

    // Find completed sessions
    const session1 = sessions.find(
      (s) => s.sessionNumber === 1 && s.status === "completed",
    );
    const session2 = sessions.find(
      (s) => s.sessionNumber === 2 && s.status === "completed",
    );
    const session3 = sessions.find(
      (s) => s.sessionNumber === 3 && s.status === "completed",
    );

    if (!session1 && !session2 && !session3) {
      return "";
    }

    let summary = `
═══════════════════════════════════════════════════════════════
FOUNDATION SESSIONS SUMMARY (Sessions 1, 2, 3)
═══════════════════════════════════════════════════════════════
`;

    // Session 1: Functional Identity
    if (session1?.completionData) {
      const data = session1.completionData;
      const functionalExamplesText =
        data.functionalLanguageExamples
          ?.map((ex: string) => `• ${ex}`)
          ?.join("\n") ?? "";

      summary += `
SESSION 1: FUNCTIONAL IDENTITY
Primary Function: ${data.primaryFunction ?? "Not determined"}
Secondary Function: ${data.secondaryFunction ? `${data.secondaryFunction} (${data.functionalSplit?.secondary ?? 0}%)` : "None"}
Anti-Generalist Commitment: ${data.commitmentStatement ?? "Not made"}
${functionalExamplesText ? `Functional Language Examples:\n${functionalExamplesText}` : ""}
`;
    }

    // Session 2: Credibility & Proof
    if (session2?.completionData) {
      const data = session2.completionData;
      const proofBulletsText =
        data.proofBullets
          ?.slice(0, 3)
          ?.map((bullet: string) => `• ${bullet}`)
          ?.join("\n") ?? "";

      summary += `
SESSION 2: CREDIBILITY & PROOF
Credibility Tier: ${data.credibilityTier ? `Tier ${data.credibilityTier}` : "Not assessed"}
Brand Claim: ${data.brandClaim ?? "Not established"}
${proofBulletsText ? `Top Proof Points:\n${proofBulletsText}` : ""}
`;
    }

    // Session 3: Signature Story
    if (session3?.completionData) {
      const data = session3.completionData;
      const contentAnglesText =
        data.contentAngles
          ?.slice(0, 3)
          ?.map((angle: string) => `• ${angle}`)
          ?.join("\n") ?? "";

      summary += `
SESSION 3: SIGNATURE STORY & METHODOLOGY
${data.signatureStory?.title ? `Story Title: ${data.signatureStory.title}` : ""}
${data.signatureStory?.challenge ? `Challenge Solved: ${data.signatureStory.challenge}` : ""}
${data.signatureStory?.outcome ? `Key Outcome: ${data.signatureStory.outcome}` : ""}
${data.methodology ? `Methodology: ${data.methodology}` : ""}
${contentAnglesText ? `Content Angles:\n${contentAnglesText}` : ""}
`;
    }

    summary += `
CRITICAL: The user has completed foundation sessions covering functional identity, credibility proof, and signature story. Do not repeat these exercises, instead mention the answers in the chat and confirm from the user again. Reference this foundation and build upon it for advanced positioning work.
═══════════════════════════════════════════════════════════════
`;

    return summary;
  } catch (error) {
    console.error("Error formatting foundation sessions summary:", error);
    return "";
  }
}

// Format questionnaire data for analysis context (modules)
function formatQuestionnaireAnalysisContext(questionnaire: any): string {
  if (!questionnaire) {
    return "";
  }

  return `
═══════════════════════════════════════════════════════════════
BACKGROUND CONTEXT: USER QUESTIONNAIRE
═══════════════════════════════════════════════════════════════

Industry: ${questionnaire.industry ?? "Not specified"}
Professional Background: ${questionnaire.background ?? "Not provided"}
Career Goals: ${questionnaire.goals ?? "Not specified"}
Aspirations: ${questionnaire.aspirations ?? "Not provided"}
Challenges: ${questionnaire.challenges ?? "Not specified"}
Interests: ${questionnaire.interests ?? "Not provided"}
Timeframe: ${questionnaire.timeframe ?? "Not specified"}

NOTE: This context was provided in the user's initial questionnaire. The conversation may reference this without repeating it, instead mention the answers in the chat and confirm from the user again.
═══════════════════════════════════════════════════════════════
`;
}

// Format previous module context for analysis
async function formatPreviousModulesAnalysisContext(
  userId: number,
  currentModuleCode: string,
): Promise<string> {
  try {
    let context = "";

    // For Module B, include Module A summary
    if (currentModuleCode === "B") {
      const moduleA = await storage.getEnhancementModule(userId, "A");
      if (moduleA?.status === "completed" && moduleA.completionData) {
        const data = moduleA.completionData;
        context += `
═══════════════════════════════════════════════════════════════
BACKGROUND CONTEXT: MODULE A (Digital Behavior & LinkedIn)
═══════════════════════════════════════════════════════════════

Brand Claim: ${data.brandClaim ?? "Not established"}
LinkedIn Optimization: ${data.linkedinOptimization?.headline ?? "Not provided"}
Content Strategy: ${data.contentStrategy?.behaviorChange ?? "Not defined"}

NOTE: User completed Module A covering digital behavior and LinkedIn strategy. Conversation may build upon this.
═══════════════════════════════════════════════════════════════
`;
      }
    }

    // For Module C, include Module A and B summaries
    if (currentModuleCode === "C") {
      const moduleA = await storage.getEnhancementModule(userId, "A");
      const moduleB = await storage.getEnhancementModule(userId, "B");

      if (moduleA?.status === "completed" && moduleA.completionData) {
        const data = moduleA.completionData;
        context += `
═══════════════════════════════════════════════════════════════
BACKGROUND CONTEXT: MODULE A (Digital Behavior & LinkedIn)
═══════════════════════════════════════════════════════════════

Brand Claim: ${data.brandClaim ?? "Not established"}
`;
      }

      if (moduleB?.status === "completed" && moduleB.completionData) {
        const data = moduleB.completionData;
        context += `
MODULE B (Network Position Mapping)
═══════════════════════════════════════════════════════════════

Functional Identity: ${data.functionalIdentity ?? "Not established"}
Value Proposition: ${data.valueProposition ?? "Not articulated"}

NOTE: User completed Modules A & B. Conversation may reference prior work without repeating it.
═══════════════════════════════════════════════════════════════
`;
      }
    }

    return context;
  } catch (error) {
    console.error("Error formatting previous modules context:", error);
    return "";
  }
}

// Check if an enhancement module should be automatically completed
async function checkModuleCompletion(
  userId: number,
  moduleCode: string,
  messages: any[],
  userProfile: any,
): Promise<{ shouldComplete: boolean; completionData?: any }> {
  if (!["A", "B", "C"].includes(moduleCode)) {
    return { shouldComplete: false };
  }

  // Check if we have enough conversation for meaningful analysis
  if (messages.length < 10) {
    // Need at least 5 back-and-forth exchanges for a complete conversation
    return { shouldComplete: false };
  }

  try {
    // Fetch context for analysis
    const questionnaire = await storage.getQuestionnaire(userId);
    const questionnaireContext =
      formatQuestionnaireAnalysisContext(questionnaire);
    const foundationSessionsContext =
      await formatFoundationSessionsSummary(userId);
    const previousModulesContext = await formatPreviousModulesAnalysisContext(
      userId,
      moduleCode,
    );

    let analysisPrompt = "";

    if (moduleCode === "A") {
      // Module A: Digital Behavior Analysis analysis based on the coaching framework
      analysisPrompt = `${questionnaireContext}${foundationSessionsContext}${previousModulesContext}You are evaluating a Module A "Digital Behavior & LinkedIn Content Strategy" coaching conversation. This follows a specific 12-step framework from profile scanning through action planning. Analyze the conversation transcript to determine if the module is complete.

Conversation Messages:
${messages.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join("\n\n")}

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
    } else if (moduleCode === "B") {
      // Module B: Network Position Mapping analysis
      analysisPrompt = `${questionnaireContext}${foundationSessionsContext}${previousModulesContext}You are evaluating a Network Positioning & Relationship Strategy coaching conversation aligned to the “Personal Brand & Network Positioning Coach” system prompt (LinkedIn + strategic network positioning). Analyze the transcript to determine if the module is complete.

Conversation Messages:
${messages.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join("\n\n")}

The coaching framework you must check for (summarize evidence only from the transcript):

Network Position Audit (quality > quantity): current composition, target-industry %, decision-maker %, recent activity.

Positioning vs Networking Diagnosis: explicit gap between who they need (for their role) vs who they currently have.

Functional Identity Anchor: one clear primary function (Finance, Operations, Sales, Marketing, or Product).

Ecosystem Mapping & Strategic Gaps: missing decision-makers, influencers, peers, mentors by title/role/company.

“Who Needs to Hear Your Story First?” Targeting: named titles/companies (or people) most likely to act.

Tiered Relationship Strategy: Top-10 (Tier 1) decision-makers, plus Tier 2 and Tier 3 prioritization.

Value-First Connection Approach: outreach framed as specific insight/help, not favors; presence of concrete message patterns.

Content-as-Networking Tactics: commenting/sharing/creation plan that supports outreach (phased if present).

Action Plan & Metrics: a concrete 30-day plan (weekly steps), plus measurable 30/60/90-day success metrics (quant + qual).

Evaluate completion based on:

Has a network position audit been conducted with specific numbers/percentages (e.g., target-industry %, decision-maker %)?

Has the positioning gap been diagnosed (current vs target composition)?

Is functional identity clearly locked to ONE of the five functions?

Are strategic gaps identified with specific titles/roles/companies?

Is there a clear Tier 1/2/3 prioritization with at least 10 Tier-1 decision-makers?

Are value-first outreach strategies defined (message patterns/templates; engagement tactics)?

Is there a concrete action plan (at minimum a 30-day weekly plan) plus measurable 30/60/90-day success metrics?

Evidence rules:

Base judgments ONLY on transcript evidence. Do not invent details.

If evidence is partial or contradictory, keep confidence low and mark missing pieces in reasoning.

Lists (targets/templates/metrics) should reflect what the transcript actually provides; otherwise leave arrays empty and explain gaps.

Respond in STRICT JSON only. Return only one JSON object, no backticks, no comments, no prose.

Required schema:
{
"shouldComplete": boolean,
"completionData": {
"brandClaim": string,
"functionalIdentity": string,
"psychologicalBarriers": string[],
"digitalPresenceAudit": string,
"networkAuditSummary": string,
"positioningGap": string,
"tier1Targets": string[],
"tier2Targets": string[],
"strategicGaps": string[],
"valueProposition": string,
"outreachTemplates": string[],
"contentStrategy": string,
"profileOptimization": string[],
"thirtyDayPlan": string[],
"successMetrics": string[],
"confidence": number,
"reasoning": string
}
}

Rules for completion (ALL must be satisfied for shouldComplete=true):

Network audit completed with specific findings about composition and gaps (include any stated %s).

Functional identity clearly locked (one of five functions).

Positioning gap diagnosed (“You want X but your network is Y”).

≥3 specific Tier-1 decision-maker targets identified (names or titles+companies).

Value proposition articulated (“why you / why now” for the targets).

Outreach approaches defined with concrete message patterns/templates and engagement tactics.

Action plan includes a concrete 30-day plan (weekly steps) AND measurable 30/60/90-day success metrics.

If any criterion is missing, set shouldComplete=false and use reasoning to state exactly what’s missing.`;
    } else if (moduleCode === "C") {
      // Module C: Career Aspiration Alignment comprehensive analysis
      analysisPrompt = `${questionnaireContext}${foundationSessionsContext}${previousModulesContext}You are evaluating a Module C "Career Aspiration Alignment Framework" coaching conversation. This module guides clients from 25-year aspiration through realistic progression pathways with gap analysis and actionable plans.

Conversation Messages:
${messages.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join("\n\n")}

COMPLETION CRITERIA — ALL MUST BE SATISFIED:
✅ 25-year backwards narrative articulated (what they want to be known for)
✅ Current positioning clearly stated (credibility + function + core story)
✅ Target role/impact specified (2-5 year goal)
✅ Tier classification identified (Tier 1: same path advancement, Tier 2: single pivot, Tier 3: Earth-to-Moon)
✅ Gap analysis completed with at least 2 gaps mapped across the 4 categories:
   - Experience gaps (missing leadership, P&L, etc.)
   - Functional gaps (influence vs ownership)
   - Scale gaps (startup vs enterprise proof)
   - Industry gaps (adjacent vs deep domain)
✅ All 3 stepping stones defined with specific titles and competencies added:
   - Immediate (6-12 months): next role adding ONE missing competency
   - Intermediate (2-3 years): role adding second competency + complexity
   - Ultimate (5+ years): realistic target once experiences accumulated
✅ Positioning adjustments identified with at least 2 actions in each category:
   - Credibility expansion (content/projects for target domain)
   - Network repositioning (shift network composition)
   - Narrative reframing (transferable skills emphasis)
   - Skill gap filling (specific competencies to acquire)
✅ Complete Alignment Statement formed: "CURRENT → TARGET → PATHWAY → POSITIONING ADJUSTMENTS → TIMELINE REALITY"
✅ Timeline reality acknowledged (X-year journey, if Earth-to-Moon then realistic alternative provided)
✅ 30/90/6-month check-ins defined with trackable metrics:
   - 30-day actions (immediate steps toward next role)
   - 90-day milestones (measurable progress on gaps)
   - 6-month metrics (success indicators)

Extract these fields from the conversation and return JSON:
{
  "shouldComplete": boolean,
  "completionData": {
    "backwardsNarrative": "25-year legacy/aspiration statement",
    "currentPositioning": "Current credibility + function + proven results",
    "targetRole": "Target role/impact description (2-5 years)",
    "tierClassification": "Tier 1" | "Tier 2" | "Tier 3",
    "experienceGaps": ["missing competency 1", "missing competency 2"],
    "functionalGaps": ["gap 1", "gap 2"],
    "scaleGaps": ["gap 1", "gap 2"],
    "industryGaps": ["gap 1", "gap 2"],
    "immediateStep": "6-12 month role with competency added",
    "intermediateStep": "2-3 year role with layered competency",
    "ultimateGoal": "5+ year realistic target role",
    "credibilityExpansion": ["action 1", "action 2"],
    "networkRepositioning": ["action 1", "action 2"],
    "narrativeReframing": ["action 1", "action 2"],
    "skillGapFilling": ["action 1", "action 2"],
    "alignmentStatement": "Complete CURRENT → TARGET → PATHWAY statement",
    "timelineReality": "X-year journey with readiness timeframe",
    "positioningScore": number (1-5 based on checklist score),
    "thirtyDayActions": ["action 1", "action 2"],
    "ninetyDayMilestones": ["milestone 1", "milestone 2"],
    "sixMonthMetrics": ["metric 1", "metric 2"],
    "confidence": number (1-100),
    "reasoning": "explanation of completion status and what key deliverables were achieved"
  }
}

Mark shouldComplete as true ONLY if ALL completion criteria are satisfied with specific, actionable content (no generic placeholders).

RETURN STRICT JSON ONLY. No prose, no explanation, just the JSON object.`;
    }

    // Call Claude to analyze completion
    const completion = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: analysisPrompt,
        },
      ],
    });

    const responseText =
      completion.content[0].type === "text" ? completion.content[0].text : "";

    try {
      // Extract JSON from response - handle potential prose and code fences
      let cleanedText = responseText.trim();

      // Remove code fences with flexible whitespace
      cleanedText = cleanedText
        .replace(/^```json\s*\n/i, "")
        .replace(/\n\s*```\s*$/i, "");
      cleanedText = cleanedText
        .replace(/^```\s*\n/i, "")
        .replace(/\n\s*```\s*$/i, "");

      // Try to find JSON object if there's prose
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedText = jsonMatch[0];
      }

      const analysisResult = JSON.parse(cleanedText);

      console.log(
        `[Module ${moduleCode}] Completion check - shouldComplete: ${analysisResult.shouldComplete}, confidence: ${analysisResult.completionData?.confidence || "N/A"}`,
      );

      return {
        shouldComplete: analysisResult.shouldComplete,
        completionData: analysisResult.completionData,
      };
    } catch (parseError) {
      console.error(
        `[Module ${moduleCode}] Failed to parse Claude completion analysis:`,
        parseError,
      );
      console.error(
        `[Module ${moduleCode}] Response preview:`,
        responseText.substring(0, 200) + "...",
      );
      return { shouldComplete: false };
    }
  } catch (error) {
    console.error("Error in checkModuleCompletion:", error);
    return { shouldComplete: false };
  }
}

export function setupEnhancementModulesRoutes(app: Express) {
  // GET /api/enhancement-modules - Get all modules for user
  app.get(
    "/api/enhancement-modules",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const modules = await storage.getEnhancementModulesForUser(
          req.user!.id,
        );
        res.json(modules);
      } catch (error) {
        console.error("Error fetching enhancement modules:", error);
        res.status(500).json({ error: "Failed to fetch enhancement modules" });
      }
    },
  );

  // GET /api/enhancement-modules/:moduleCode - Get specific module with messages
  app.get(
    "/api/enhancement-modules/:moduleCode",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const { moduleCode } = req.params;

        if (!["A", "B", "C"].includes(moduleCode)) {
          return res.status(400).json({ error: "Invalid module code" });
        }

        const moduleData = await storage.getEnhancementModuleWithMessages(
          req.user!.id,
          moduleCode,
        );

        if (!moduleData) {
          return res.status(404).json({ error: "Module not found" });
        }

        res.json(moduleData);
      } catch (error) {
        console.error("Error fetching enhancement module:", error);
        res.status(500).json({ error: "Failed to fetch enhancement module" });
      }
    },
  );

  // POST /api/enhancement-modules/:moduleCode/start - Start or continue a module
  app.post(
    "/api/enhancement-modules/:moduleCode/start",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const { moduleCode } = req.params;

        if (!["A", "B", "C"].includes(moduleCode)) {
          return res.status(400).json({ error: "Invalid module code" });
        }

        // Check if module already exists
        let module = await storage.getEnhancementModule(
          req.user!.id,
          moduleCode,
        );

        if (!module) {
          // Create new module
          module = await storage.createEnhancementModule({
            userId: req.user!.id,
            moduleCode: moduleCode as "A" | "B" | "C",
            status: "in_progress",
            startedAt: new Date(),
          });

          // Add initial guidance message
          const initialMessage = getInitialGuidanceMessage(moduleCode);
          if (initialMessage) {
            await storage.createEnhancementModuleMessage({
              moduleId: module.id,
              role: "assistant",
              content: initialMessage,
            });
          }
        } else if (module.status === "available") {
          // Update status to in_progress if it was available
          await storage.updateEnhancementModule(module.id, {
            status: "in_progress",
            startedAt: new Date(),
          });

          // Check if module has any messages, if not add initial guidance message
          const existingMessages = await storage.getEnhancementModuleMessages(
            module.id,
          );
          if (existingMessages.length === 0) {
            const initialMessage = getInitialGuidanceMessage(moduleCode);
            if (initialMessage) {
              await storage.createEnhancementModuleMessage({
                moduleId: module.id,
                role: "assistant",
                content: initialMessage,
              });
            }
          }
        }

        res.json({ success: true, moduleId: module.id });
      } catch (error) {
        console.error("Error starting enhancement module:", error);
        res.status(500).json({ error: "Failed to start enhancement module" });
      }
    },
  );

  // POST /api/enhancement-modules/:moduleCode/messages/stream - Send message with streaming response
  app.post(
    "/api/enhancement-modules/:moduleCode/messages/stream",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const moduleCode = req.params.moduleCode as "A" | "B" | "C";
        const userId = req.user!.id;

        if (!["A", "B", "C"].includes(moduleCode)) {
          return res
            .status(400)
            .json({ error: "Invalid module code. Must be A, B, or C" });
        }

        const module = await storage.getEnhancementModule(userId, moduleCode);
        if (!module) {
          return res.status(404).json({ error: "Module not found" });
        }

        if (module.status !== "in_progress" && module.status !== "completed") {
          return res.status(400).json({
            error: "Module must be in progress or completed to send messages",
          });
        }

        const { content } = req.body;
        if (!content || typeof content !== "string") {
          return res.status(400).json({ error: "Message content is required" });
        }

        // Save user message
        const userMessage = await storage.createEnhancementModuleMessage({
          moduleId: module.id,
          role: "user",
          content: content.trim(),
        });

        // Get all messages from this module for context
        const messages = await storage.getEnhancementModuleMessages(module.id);

        // Format messages for Claude API
        const formattedMessages = messages.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        }));

        // Get user profile data for context
        const userProfile = await storage.getUserProfile(userId);

        // Fetch questionnaire data for context
        const questionnaire = await storage.getQuestionnaire(userId);
        const questionnaireSummary = formatQuestionnaireSummary(questionnaire);

        // Fetch resume summary for context
        const resumeSummary = await formatResumeSummary(userId);

        // Fetch foundation sessions summary for context
        const foundationSessionsSummary =
          await formatFoundationSessionsSummary(userId);

        // Fetch previous module's completion data for chaining
        let previousModuleData = null;
        if (moduleCode === "B") {
          const moduleA = await storage.getEnhancementModule(userId, "A");
          if (moduleA?.status === "completed" && moduleA.completionData) {
            previousModuleData = moduleA.completionData;
          }
        } else if (moduleCode === "C") {
          const moduleB = await storage.getEnhancementModule(userId, "B");
          if (moduleB?.status === "completed" && moduleB.completionData) {
            previousModuleData = moduleB.completionData;
          }
        }

        // Set up SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // Send user message ID first
        res.write(
          `data: ${JSON.stringify({ type: "user_message", id: userMessage.id })}\n\n`,
        );

        // Initialize empty assistant content for accumulation
        let assistantContent = "";

        // Generate Module A-specific system prompt with the attached coaching prompt
        const getModuleASystemPrompt = (previousModuleData?: any) => {
          const previousSummary = previousModuleData
            ? formatModuleSummary("A", previousModuleData)
            : "";

          return `${resumeSummary}${questionnaireSummary}${foundationSessionsSummary}${previousSummary}
            You are a Digital Behavior & LinkedIn Content Strategy Coach.

            This module assumes:
            - Functional identity has been locked
            - Credibility and proof points have been established
            - One or more content-ready stories already exist

            Your goal is to help the professional translate that clarity into a focused, credible, and sustainable LinkedIn presence—using fast visual tests, a structured audit, barrier-specific interventions, and a simple content system that fits real life.

            STYLE
            - Warm, direct, practical. Plain English. One short question at a time.
            - Show, don’t lecture. Use quick examples and micro-exercises.
            - Keep pressure on execution clarity (formats, cadence, behaviors). Avoid abstract advice.

            HIGH-LEVEL FLOW (keep it conversational; move forward if a step is solid)
            1) 4–10s Profile Scan + “Starbucks Line” test
            2) Current Digital Presence Audit (activity, connections, content history, comfort)
            3) Psychological Barrier Diagnosis (time, fear, voice, inconsistency)
            4) Featured Articles Strategy (2–3 pinned assets to establish visible credibility)
            5) Content Strategy Development (2–4 minute ideation + natural formats + phased plan)
            6) LinkedIn Profile Optimization Checklist (headline, summary, featured, experience, skills)
            7) Behavior Change Strategy (personality-based execution recommendations)
            8) Content Psychology Deep Dive (reactions, avoided topics, expertise triggers)
            9) Network Position Analysis (positioning vs networking; signal quality)
            10) Engagement Framework (commenting, sharing, responding cadence)
            11) Success Metrics & 30/60/90-day check-ins
            12) Red Flags vs Success Indicators; lock the action plan

            Use the conversation context to determine which step you’re on and proceed naturally.
            Keep responses short, focused, and actionable.
            Ask ONE specific execution-focused question at a time to keep momentum.

            Current user context:
            ${
              userProfile
                ? `Name: ${userProfile.firstName} ${userProfile.lastName}
            Bio: ${userProfile.bio || "Not provided"}
            Current role: ${userProfile.experiences?.[0]?.title || "Not specified"} at ${userProfile.experiences?.[0]?.company || "Not specified"}
            LinkedIn: Not available in profile
            Industry focus: ${userProfile.experiences?.[0]?.description?.substring(0, 50) || "Not specified"}`
                : "Limited profile information available"
            }

            CRITICAL COMPLETION INSTRUCTION:
            Do NOT end this module prematurely. The module is ONLY complete when ALL 12 steps are covered AND all required deliverables are documented:

            1. Profile scan result and clear “Starbucks line”
            2. Digital presence audit (activity, connections, content history, comfort level)
            3. Psychological barrier identified with a concrete intervention
            4. Featured articles strategy (2–3 specific pinned assets)
            5. Content strategy with a fast ideation process and natural formats
            6. LinkedIn profile optimization checklist completed
            7. Personality-based behavior change plan
            8. Content psychology insights (reactions, avoided topics, expertise triggers)
            9. Network position analysis completed
            10. Engagement framework with specific cadence
            11. Success metrics defined for 30/60/90-day check-ins
            12. Action plan locked with red flags vs success indicators

            If ANY required data is missing or vague:
            - Ask the question again in a different way
            - Provide concrete examples of what “good” looks like
            - Push for specificity (exact formats, cadence, behaviors)
            - Do NOT provide final deliverables until ALL steps are complete

            Only when ALL 12 steps are thoroughly covered should you:
            - Summarize the execution plan
            - Confirm next actions
            - End the module naturally`;
        };

        // Generate Module B-specific system prompt with Personal Brand & Network Positioning coaching
        const getModuleBSystemPrompt = (previousModuleData?: any) => {
          const previousSummary = previousModuleData
            ? formatModuleSummary("A", previousModuleData)
            : "";

          return `${resumeSummary}${questionnaireSummary}${foundationSessionsSummary}${previousSummary}
            You are a Personal Brand & Network Positioning Coach.

            This module assumes:
            - A single primary functional identity has already been locked
            - Credible proof and positioning stories already exist
            - The goal here is EXECUTION: visibility, targeting, relationships, and opportunity flow

            Your job is to translate an established brand into a strategic, opportunity-rich network by targeting the right people, clarifying positioning signals, and installing repeatable relationship behaviors.

            STYLE
            - Warm, direct, practical. Plain English.
            - One short question at a time; no lectures.
            - Push for execution clarity: exact titles, exact companies, exact behaviors.

            GUIDING BELIEFS
            - Quality > quantity in relationships.
            - Visibility must target people who can hire, refer, or materially influence outcomes.
            - Network positioning reinforces identity; it does not redefine it.

            CONVERSATION FLOW (iterate naturally; move on when a step is solid)

            1) 4–10s Profile Scan + “Starbucks Line” Test  
               - “In a 4–10 second scan, what should be obvious about you?”
               - “If we met briefly, what ONE thing should stick?”
               - If vague → “That’s generic. What’s the specific signal?”

            2) Current Digital Presence Audit  
               - Activity last 30 days (post, comment, share, DM).
               - Connection composition (roles, industries—not count).
               - Comfort executing content and outreach (1–5).

            3) Psychological Barrier Diagnosis (execution-focused)  
               - Time: “Where exactly does execution break?”
               - Fear: “From whom—and what’s the realistic downside?”
               - Unclear execution: “What’s hardest—commenting, posting, or reaching out?”

            4) Positioning Signal Alignment (Reinforcement)  
               - Ensure headline, featured, and experience clearly reinforce the locked functional identity.
               - Spot mixed signals that dilute positioning.
               - Secondary signals allowed only if subordinate.

            5) Network Position Audit (Quality > Quantity)  
               - % of connections in target industry.
               - % who could hire or directly refer.
               - Identify randomness vs intentionality.

            6) Ecosystem Mapping & Strategic Gaps  
               - Map needed roles: Decision-makers, Influencers, Peers, Mentors.
               - Identify missing role types by function (e.g., CPO/VP Product, CFO/Finance VPs).
               - Identify companies or segments with zero presence.

            7) “Who Needs to Hear Your Story First?” (Targeting)  
               - Exact titles, exact companies.
               - “If 10 people understood your positioning, who could act on it fastest?”

            8) Relationship Strategy — Tiered Priorities (10 / 20 / 20)  
               - Tier 1: Can hire or sponsor.
               - Tier 2: Can refer or introduce.
               - Tier 3: Ecosystem peers worth engaging with.

            9) Value-First Connection Approach (Scripts)  
               - Principle: Insight + relevance + respect for time.
               - Generate three tailored templates:
                 • Cold outreach
                 • Event follow-up
                 • Content-based outreach
               - Replace vague asks with focused exchanges.

            10) Content as Networking (Phased Execution)  
               - Phase 1: Strategic following (targets only).
               - Phase 2: Meaningful engagement (add value, not applause).
               - Phase 3: Creation (answer the questions your targets already ask).

            11) Personality-Based Behavior Plan  
               - Adjust cadence and formats to sustain consistency.
               - Optimize for follow-through, not ambition.

            12) Profile Optimization Checklist (Signal Clarity)  
               - Experience ladders to the Single Lasting Impression.
               - Skills, Featured, Headline reinforce the same signal.
               - Remove or downplay noise.

            13) 30-Day Network Repositioning Plan  
               - Week-by-week execution plan:
                 • Audit & target
                 • Engage & add value
                 • Connect & initiate
                 • Activate & amplify

            14) Metrics & Reviews (30 / 60 / 90)  
               - Quant: target-industry %, decision-maker %, Tier-1 relationships, strategic conversations.
               - Qual: referrals, inbound, invitations.
               - Schedule check-ins.

            15) Red Flags vs Success Indicators  
               - Red flags: random growth, generic outreach, peers only.
               - Success: intentional growth, decision-maker density, repeatable conversations.

            SESSION CLOSE — DELIVERABLES
            - One-line brand claim (already validated; used consistently).
            - Top-10 Tier-1 target list + two intro blurbs.
            - Two Featured-article seeds reinforcing the Single Lasting Impression.
            - 2-week micro-plan (exact actions).
            - Date for first 30-day check-in with defined metrics.

            REMINDERS
            - This module EXECUTES positioning; it does not redefine it.
            - Focus on opportunity flow, not vanity metrics.
            - Consistency beats intensity.

            CRITICAL COMPLETION INSTRUCTION:
            Do NOT end this module prematurely. The module is ONLY complete when ALL deliverables are documented:
            1. One-line brand claim in use
            2. Top-10/Tier-1 list with intro blurbs
            3. Two Featured-article seeds
            4. 2-week execution micro-plan
            5. 30-day check-in date with metrics
            6. Network repositioning strategy with specific targets
            7. Tiered relationship strategy
            8. Content-as-networking plan

            If anything is missing:
            - Ask again differently
            - Push for specificity (titles, companies, actions)
            - Do NOT provide a final summary until everything is complete

            Only when ALL deliverables are complete should you end naturally.`;
        };

        // Generate Module C-specific system prompt with Career Aspiration Alignment coaching
        const getModuleCSystemPrompt = (previousModuleData?: any) => {
          const previousSummary = previousModuleData
            ? formatModuleSummary("B", previousModuleData)
            : "";

          return `${resumeSummary}${questionnaireSummary}${foundationSessionsSummary}${previousSummary}
            You are a Career Aspiration Alignment Coach (Module C).

            This module assumes:
            - A primary functional identity is already locked
            - Credible proof and positioning stories already exist
            - Network execution and visibility plans are already in motion

            Your job is to convert a long-term career aspiration into a realistic, evidence-aware progression pathway—identifying gaps, defining stepping stones, and locking an actionable plan with timelines and metrics.

            STYLE
            - Warm, direct, and brutally honest when needed. Plain English.
            - One short question at a time. No lectures.
            - No wish-casting. If a path is unrealistic, say so and offer a viable alternative.

            SESSION GOAL (WHAT YOU MUST PRODUCE)
            - A Complete Alignment Statement (current → target → pathway → positioning adjustments → timeline reality).
            - A stepped plan: Immediate (6–12m), Intermediate (2–3y), Ultimate (5y+) with concrete positioning actions.
            - A clear gap map (experience / functional / scale / industry) and how to close each gap.
            - 30/90/6-month check-ins with success metrics the client can track.

            ------------------------------------------------------------
            PART 1 — LONG-TERM BACKWARDS NARRATIVE (ANCHOR, NOT DISCOVERY)
            Open with:
            "Fast-forward 5–10 years. You’re known at the executive table primarily for ONE perspective. That perspective is already anchored in your functional identity. Where are you today on that path, and where do you want to be in 2–3 years?"

            Follow-ups:
            - "What outcome would make you say this career path worked?"
            - "Who needs to see you as credible for this to happen?"
            - "What positioning foundation must be true *before* that role is realistic?"

            (If values dominate, name them explicitly and show how they constrain or shape the path.)

            ------------------------------------------------------------
            PART 2 — CURRENT vs FUTURE STATE SNAPSHOT
            Briefly summarize their CURRENT positioning using existing inputs:
            - Function
            - Domain
            - Proven strengths or outcomes

            Then ask:
            "Given this starting point, what does this *credibly* lead to in the next 2–5 years?"

            ------------------------------------------------------------
            PART 3 — THREE-TIER TRANSITION REALITY CHECK
            Classify the aspiration:

            Tier 1 — Advancement within current path
            - Same function and industry; expanded scope.

            Tier 2 — Single pivot
            - Change function OR industry, not both.
            - Requires a positioning bridge.

            Tier 3 — Earth-to-Moon
            - Function AND industry change at once.
            - Requires down-leveling, re-credentialing, or a longer horizon.

            If Tier 3:
            - Say so plainly.
            - Co-design a Tier-2 stepping-stone alternative.

            ------------------------------------------------------------
            PART 4 — REQUIREMENTS MAPPING → GAP ANALYSIS
            Use representative role requirements to probe gaps (examples only):
            - VP Ops: P&L exposure, team leadership at scale, cross-functional ownership.
            - CMO: demand gen, brand strategy, budget ownership, growth metrics.
            - CPO: roadmap ownership, research integration, revenue impact.

            Ask:
            "Which of these are already proven? Which are missing?"

            Map gaps into four buckets:
            1) Experience gaps
            2) Functional ownership gaps
            3) Scale gaps
            4) Industry gaps

            For each gap, identify:
            - Evidence missing
            - The *next role or responsibility* that would close it

            ------------------------------------------------------------
            PART 5 — LOGICAL PROGRESSION PATHWAY (STEPPING STONES)
            Co-create three steps with exact titles when possible:

            Immediate (6–12 months):
            - One role or scope expansion that adds ONE missing competency.

            Intermediate (2–3 years):
            - Role that layers a second missing competency and increases complexity or scale.

            Ultimate (5+ years):
            - Realistic once prior gaps are closed.

            For each step, explicitly state:
            - Title
            - Added competency
            - Why it unlocks the next step

            ------------------------------------------------------------
            PART 6 — POSITIONING ADJUSTMENTS (WHAT TO START NOW)
            Define adjustments needed to support the pathway:

            - Credibility expansion: targeted proof-building aligned to the next role.
            - Narrative reframing: emphasize transferable strengths; de-emphasize dead ends.
            - Skill acquisition: specific competencies to own (budget slice, team size, roadmap scope).
            - Network alignment: shift toward the ecosystem that hires for the next step.

            (Reference existing modules; do not re-design execution plans here.)

            ------------------------------------------------------------
            PART 7 — HONESTY ON UNREALISTIC GOALS (INTERVENTIONS)
            If the aspiration is misaligned with reality:
            - Name it clearly.
            - Explain *why* it’s unrealistic now.
            - Offer a concrete alternative path that preserves intent but respects constraints.

            ------------------------------------------------------------
            PART 8 — IDEAL PROFESSIONAL SELF (FILTER, NOT STORY)
            Prompt:
            "Assume strategy and people management are table stakes. Describe the distinctive way you operate when you’re at your best."

            Extract:
            - Proven traits
            - Aspirational traits
            Mark the delta and translate into positioning adjustments.

            ------------------------------------------------------------
            PART 9 — ALIGNMENT CONFIRMATION (FINAL OUTPUT)
            State the Complete Alignment Statement:

            CURRENT:
            "Today you're credible as [FUNCTION] in [DOMAIN] with [PROVEN STRENGTH]."

            TARGET (2–5y):
            "You're aiming for [ROLE/IMPACT], which requires [KEY COMPETENCIES]."

            PATHWAY:
            "[IMMEDIATE] → [INTERMEDIATE] → [ULTIMATE]."

            POSITIONING ADJUSTMENTS:
            "[CREDIBILITY] + [NARRATIVE] + [SKILL] + [NETWORK]."

            TIMELINE REALITY:
            "This is a [X-year] journey. Position now for roles you’ll be ready for in [TIMEFRAME]."

            ------------------------------------------------------------
            PART 10 — METRICS & CHECK-INS
            Positioning Alignment Score (self-check):
            - Target requirements mapped to current credibility
            - Stepping stones defined
            - 12-month actions clear
            - Network includes 10+ people at target level
            - Content signals target readiness

            Set reviews:
            - 30-day: actions shipped
            - 90-day: gaps closing
            - 6-month: positioned for the immediate role

            ------------------------------------------------------------
            SESSION CLOSE — DELIVERABLES
            Provide back:
            1) Complete Alignment Statement
            2) Stepping-stone plan with titles and added competencies
            3) Positioning adjustments (4 bullets, 1–2 actions each)
            4) Check-ins & metrics (30/90/6-month)

            REMINDERS
            - This module aligns aspiration to reality; it does not redefine identity or proof.
            - Every action must close a real gap the next role requires.
            - One step at a time beats skipping levels.

            CRITICAL COMPLETION INSTRUCTION:
            Do NOT end this module prematurely. The module is ONLY complete when ALL are documented:
            1. Complete Alignment Statement
            2. Stepping-stone plan with titles and competencies
            3. Positioning adjustments with concrete actions
            4. Check-ins & metrics
            5. Gap analysis complete
            6. Realistic timeline stated
            7. Tier classification with rationale
            8. If Tier 3, a viable alternative path provided

            If anything is vague or missing:
            - Ask again differently
            - Push for specificity (titles, timelines, competencies)
            - Be explicit about constraints and trade-offs
            - Do NOT end until all criteria are met

            Only when ALL deliverables are complete should you end naturally.`;
        };

        // Generate system prompt based on module
        const systemPrompt =
          moduleCode === "A"
            ? getModuleASystemPrompt() // Module A has no previous module
            : moduleCode === "B"
              ? getModuleBSystemPrompt(previousModuleData) // Module B receives Module A's data
              : moduleCode === "C"
                ? getModuleCSystemPrompt(previousModuleData) // Module C receives Module B's data
                : `You are a professional coaching assistant for Enhancement Module ${moduleCode}. Provide thoughtful, actionable guidance.`;

        try {
          // Stream response from Claude
          const stream = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 1500,
            system: systemPrompt,
            messages: formattedMessages,
            stream: true,
          });

          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              const text = chunk.delta.text;
              assistantContent += text;
              res.write(
                `data: ${JSON.stringify({ type: "chunk", content: text })}\n\n`,
              );
            }
          }

          // Save assistant response
          const assistantMessage = await storage.createEnhancementModuleMessage(
            {
              moduleId: module.id,
              role: "assistant",
              content: assistantContent,
            },
          );

          // Check for automatic completion
          const allMessages = await storage.getEnhancementModuleMessages(
            module.id,
          );
          const completionCheck = await checkModuleCompletion(
            userId,
            moduleCode,
            allMessages,
            userProfile,
          );

          if (
            completionCheck.shouldComplete &&
            completionCheck.completionData
          ) {
            // Mark module as completed
            await storage.updateEnhancementModule(module.id, {
              status: "completed",
              completedAt: new Date(),
              completionData: completionCheck.completionData,
            });

            // Send completion event
            res.write(
              `data: ${JSON.stringify({
                type: "module_completed",
                moduleCode,
                completionData: completionCheck.completionData,
              })}\n\n`,
            );
          }

          // Send completion signal
          res.write(
            `data: ${JSON.stringify({ type: "complete", messageId: assistantMessage.id })}\n\n`,
          );
          res.end();
        } catch (streamError) {
          console.error("Error in Claude streaming:", streamError);
          res.write(
            `data: ${JSON.stringify({ type: "error", message: "Failed to generate response" })}\n\n`,
          );
          res.end();
        }
      } catch (error) {
        console.error("Error in Enhancement Module streaming chat:", error);
        res.write(
          `data: ${JSON.stringify({ type: "error", message: "Failed to generate response" })}\n\n`,
        );
        res.end();
      }
    },
  );

  // POST /api/enhancement-modules/:moduleCode/message - Send message to module (legacy endpoint)
  app.post(
    "/api/enhancement-modules/:moduleCode/message",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const { moduleCode } = req.params;
        const { content } = req.body;

        if (!["A", "B", "C"].includes(moduleCode)) {
          return res.status(400).json({ error: "Invalid module code" });
        }

        if (!content || typeof content !== "string") {
          return res.status(400).json({ error: "Message content is required" });
        }

        // Get the module
        const module = await storage.getEnhancementModule(
          req.user!.id,
          moduleCode,
        );
        if (!module) {
          return res.status(404).json({ error: "Module not found" });
        }

        if (module.status === "completed") {
          return res.status(400).json({ error: "Module is already completed" });
        }

        // Save user message
        await storage.createEnhancementModuleMessage({
          moduleId: module.id,
          role: "user",
          content,
        });

        // Get all messages for context
        const messages = await storage.getEnhancementModuleMessages(module.id);

        // Generate AI response (placeholder for now - you'll add real prompts later)
        const systemPrompt = `You are a professional coaching assistant helping with ${
          moduleCode === "A"
            ? "Digital Behavior Analysis Framework: LinkedIn Presence & Content Strategy Assessment"
            : moduleCode === "B"
              ? "Network Position Mapping Framework: Strategic Relationship & Influence Analysis"
              : "Career Aspiration Alignment Framework: Long-Term Goals & Positioning Refinement"
        }. 
      
      Provide thoughtful, actionable guidance based on the conversation context.`;

        const userMessages = messages.slice(-10).map((msg: any) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        }));

        const completion = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 1000,
          system: systemPrompt,
          messages: userMessages,
        });

        const assistantResponse =
          completion.content[0].type === "text"
            ? completion.content[0].text
            : "I apologize, but I encountered an error generating a response.";

        // Save assistant message
        await storage.createEnhancementModuleMessage({
          moduleId: module.id,
          role: "assistant",
          content: assistantResponse,
        });

        // Check for completion
        const userProfile = await storage.getUserProfile(req.user!.id);
        const allMessages = await storage.getEnhancementModuleMessages(
          module.id,
        );
        const completionCheck = await checkModuleCompletion(
          req.user!.id,
          moduleCode,
          allMessages,
          userProfile,
        );

        if (completionCheck.shouldComplete && completionCheck.completionData) {
          await storage.updateEnhancementModule(module.id, {
            status: "completed",
            completedAt: new Date(),
            completionData: completionCheck.completionData,
          });
        }

        res.json({
          success: true,
          message: assistantResponse,
          completed: completionCheck.shouldComplete,
        });
      } catch (error) {
        console.error("Error processing module message:", error);
        res.status(500).json({ error: "Failed to process message" });
      }
    },
  );

  // PATCH /api/enhancement-modules/:moduleCode - Update module (e.g., timer elapsed)
  app.patch(
    "/api/enhancement-modules/:moduleCode",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const { moduleCode } = req.params;

        if (!["A", "B", "C"].includes(moduleCode)) {
          return res.status(400).json({ error: "Invalid module code" });
        }

        const updateData = updateEnhancementModuleSchema.parse(req.body);

        const module = await storage.getEnhancementModule(
          req.user!.id,
          moduleCode,
        );
        if (!module) {
          return res.status(404).json({ error: "Module not found" });
        }

        await storage.updateEnhancementModule(module.id, updateData);

        res.json({ success: true });
      } catch (error) {
        console.error("Error updating enhancement module:", error);
        res.status(500).json({ error: "Failed to update enhancement module" });
      }
    },
  );

  // Admin endpoint to get enhancement modules for a specific user
  app.get(
    "/api/admin/users/:userId/enhancement-modules",
    isAdmin,
    async (req: Request, res: Response) => {
      try {
        const userId = parseInt(req.params.userId);

        if (isNaN(userId)) {
          return res.status(400).json({ error: "Invalid user ID" });
        }

        const modules = await storage.getEnhancementModulesForUser(userId);
        res.json(modules);
      } catch (error) {
        console.error("Error fetching enhancement modules for user:", error);
        res.status(500).json({ error: "Failed to fetch enhancement modules" });
      }
    },
  );
}

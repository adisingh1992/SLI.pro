import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import {
  insertEnhancementModuleMessageSchema,
  updateEnhancementModuleSchema,
} from "../shared/schema";
import Anthropic from "@anthropic-ai/sdk";
import { getModulePromptSet } from "./enhancement-module-prompts";

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

// Format SLI (Single Lasting Impression) data for system prompt context
async function formatSliSummary(userId: number): Promise<string> {
  try {
    const sliRecords = await storage.getSlisByUserId(userId);
    if (!sliRecords || sliRecords.length === 0) {
      return "";
    }

    const latestSli = sliRecords[0];

    const selectedText = latestSli.selectedSliIndex
      ? `Selected SLI Option: #${latestSli.selectedSliIndex}`
      : latestSli.customSliText
        ? `Custom SLI: ${latestSli.customSliText}`
        : "No SLI selected yet";

    const refinedText = latestSli.refinedSliText
      ? `\nRefined SLI: ${latestSli.refinedSliText}`
      : "";

    const refinementRationale = latestSli.refinementRationale
      ? `\nRefinement Rationale: ${latestSli.refinementRationale}`
      : "";

    const implementationGuidance = latestSli.implementationGuidance
      ? `\nImplementation Guidance: ${latestSli.implementationGuidance}`
      : "";

    return `
═══════════════════════════════════════════════════════════════
USER'S SINGLE LASTING IMPRESSION (SLI)
═══════════════════════════════════════════════════════════════

SLI Option 1: "${latestSli.title1}" - ${latestSli.statement1}
  Rationale: ${latestSli.rationale1}

SLI Option 2: "${latestSli.title2}" - ${latestSli.statement2}
  Rationale: ${latestSli.rationale2}

SLI Option 3: "${latestSli.title3}" - ${latestSli.statement3}
  Rationale: ${latestSli.rationale3}

${selectedText}${refinedText}${refinementRationale}${implementationGuidance}

CRITICAL: The user's SLI has been established. All coaching should reinforce and build upon this Single Lasting Impression. Reference it naturally when discussing positioning, content strategy, and networking.
═══════════════════════════════════════════════════════════════
`;
  } catch (error) {
    console.error("Error formatting SLI summary:", error);
    return "";
  }
}

// Format conversation summaries (from AI coaching chats) for system prompt context
async function formatConversationSummariesContext(userId: number): Promise<string> {
  try {
    const summaries = await storage.getConversationSummaries(userId);
    if (!summaries || summaries.length === 0) {
      return "";
    }

    const latestSummary = summaries[0];

    const basicInfo = latestSummary.basicInfo || {};
    const functionalCat = latestSummary.functionalCategorization || {};
    const careerTransition = latestSummary.careerTransition || {};
    const strengths = latestSummary.strengthsAndPositioning || {};
    const digitalPresence = latestSummary.digitalPresence || {};
    const psychology = latestSummary.psychologyAndMotivation || {};
    const contentStrat = latestSummary.contentStrategy || {};
    const recommendations = latestSummary.recommendations || {};

    const keyStrengthsText = strengths.keyStrengths?.map((s: string) => `• ${s}`).join("\n") ?? "• None identified";
    const areasForDevText = strengths.areasForDevelopment?.map((a: string) => `• ${a}`).join("\n") ?? "• None identified";
    const topPrioritiesText = psychology.topPriorities?.map((p: string) => `• ${p}`).join("\n") ?? "• None identified";
    const aspirationalThemesText = psychology.aspirationalThemes?.map((t: string) => `• ${t}`).join("\n") ?? "• None identified";
    const confidentTopicsText = contentStrat.confidentTopics?.map((t: string) => `• ${t}`).join("\n") ?? "• None identified";
    const sliDirectionsText = recommendations.sliDirections?.map((d: string) => `• ${d}`).join("\n") ?? "• None identified";
    const contentDirectionsText = recommendations.contentStrategyDirections?.map((d: string) => `• ${d}`).join("\n") ?? "• None identified";

    return `
═══════════════════════════════════════════════════════════════
AI COACHING CONVERSATION SUMMARY
═══════════════════════════════════════════════════════════════

Basic Info:
  Name: ${basicInfo.name ?? "Not provided"}
  Current Role: ${basicInfo.currentRole ?? "Not specified"}
  Industry: ${basicInfo.industry ?? "Not specified"}
  Years of Experience: ${basicInfo.yearsOfExperience ?? "Not specified"}
  Target Timeline: ${basicInfo.targetTimeline ?? "Not specified"}

Functional Categorization:
  Primary Function: ${functionalCat.primaryFunction ?? "Not determined"}
  Secondary Function: ${functionalCat.secondaryFunction ?? "None"}
  Level of Certainty: ${functionalCat.levelOfCertainty ?? "N/A"}%
  Key Strengths:
${keyStrengthsText}

Career Transition:
  Current State: ${careerTransition.currentState ?? "Not specified"}
  Desired State: ${careerTransition.desiredState ?? "Not specified"}
  Transition Type: ${careerTransition.transitionType ?? "Not specified"}
  Complexity Rating: ${careerTransition.complexityRating ?? "N/A"}/5
  Primary Motivation: ${careerTransition.primaryMotivation ?? "Not specified"}

Strengths & Positioning:
  Value Proposition: ${strengths.valueProposition ?? "Not articulated"}
  Areas for Development:
${areasForDevText}
  Comfort with Self-Promotion: ${strengths.comfortWithSelfPromotion ?? "N/A"}/5

Digital Presence:
  LinkedIn Activity: ${digitalPresence.linkedInActivity ?? "Not assessed"}
  Content Creation Experience: ${digitalPresence.contentCreationExperience ?? "Not specified"}
  Barriers: ${digitalPresence.barriers ?? "None identified"}
  Networking Approach: ${digitalPresence.networkingApproach ?? "Not specified"}
  Posting Frequency: ${digitalPresence.postingFrequency ?? "Not specified"}

Psychology & Motivation:
  Enneagram Type: ${psychology.enneagramType ?? "Not assessed"}
  Assessment Results: ${psychology.assessmentResults ?? "Not provided"}
  Top Priorities:
${topPrioritiesText}
  Aspirational Themes:
${aspirationalThemesText}

Content Strategy Insights:
  Confident Topics:
${confidentTopicsText}
  Preferred Formats: ${contentStrat.preferredFormats?.join(", ") ?? "Not specified"}
  Creation Barriers: ${contentStrat.creationBarriers ?? "Not identified"}
  Suggested Initial Topic: ${contentStrat.suggestedInitialTopic ?? "Not specified"}

Recommendations:
  SLI Directions:
${sliDirectionsText}
  Content Strategy Directions:
${contentDirectionsText}
  Special Considerations: ${recommendations.specialConsiderations ?? "None"}

CRITICAL: This summary is from the user's AI coaching conversations. Do not repeat these questions. Reference this context naturally and build upon it.
═══════════════════════════════════════════════════════════════
`;
  } catch (error) {
    console.error("Error formatting conversation summaries:", error);
    return "";
  }
}

// Format branding intake data for system prompt context
async function formatBrandingIntakeContext(userId: number): Promise<string> {
  try {
    const intake = await storage.getBrandingIntake(userId);
    if (!intake) {
      return "";
    }

    const responses = intake.responses as Record<string, any> || {};
    const responseEntries = Object.entries(responses);

    if (responseEntries.length === 0) {
      return "";
    }

    const responsesText = responseEntries
      .map(([key, value]) => {
        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const formattedValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return `  ${formattedKey}: ${formattedValue}`;
      })
      .join("\n");

    return `
═══════════════════════════════════════════════════════════════
BRANDING INTAKE FORM DATA
═══════════════════════════════════════════════════════════════

Platform Type: ${intake.platform ?? "Not specified"}
Completion Status: ${intake.completed ? "Completed" : `In Progress (Stage ${intake.currentStage})`}

Responses:
${responsesText}

CRITICAL: The user has filled out a branding intake form. Use this information to provide personalized coaching. Do not ask questions that have already been answered here.
═══════════════════════════════════════════════════════════════
`;
  } catch (error) {
    console.error("Error formatting branding intake:", error);
    return "";
  }
}

// Format homework assignments and answers for system prompt context
async function formatHomeworkContext(userId: number): Promise<string> {
  try {
    const assignments = await storage.getHomeworkAssignments(userId);
    if (!assignments || assignments.length === 0) {
      return "";
    }

    const assignmentsText = assignments.map((hw, index) => {
      const answerText = hw.answerText
        ? `  Answer: ${hw.answerText}`
        : "  Answer: Not yet answered";
      return `  ${index + 1}. Question: ${hw.questionText}\n${answerText}`;
    }).join("\n\n");

    return `
═══════════════════════════════════════════════════════════════
HOMEWORK ASSIGNMENTS & ANSWERS
═══════════════════════════════════════════════════════════════

${assignmentsText}

CRITICAL: The user has been assigned homework by their coach. Reference their answers naturally in coaching to show continuity and build upon their reflections.
═══════════════════════════════════════════════════════════════
`;
  } catch (error) {
    console.error("Error formatting homework context:", error);
    return "";
  }
}

// Format LinkedIn optimization data for system prompt context
async function formatLinkedinOptimizationContext(userId: number): Promise<string> {
  try {
    const optimization = await storage.getLatestLinkedinOptimization(userId);
    if (!optimization) {
      return "";
    }

    const headline = optimization.headlineOptimization as any || {};
    const aboutSection = optimization.aboutSection as any || {};
    const profileEnhancements = optimization.profileEnhancements as any || {};
    const contentStrategy = optimization.contentStrategy as any || {};

    return `
═══════════════════════════════════════════════════════════════
LINKEDIN OPTIMIZATION RECOMMENDATIONS
═══════════════════════════════════════════════════════════════

Alignment Assessment: ${optimization.alignmentAssessment ?? "Not assessed"}

Headline Optimization:
  Current Headline: ${headline.currentHeadline ?? "Not provided"}
  Recommended Headline: ${headline.recommendedHeadline ?? "Not provided"}
  Rationale: ${headline.rationale ?? "Not provided"}

About Section:
  Current Analysis: ${aboutSection.currentAnalysis ?? "Not analyzed"}
  Recommendations: ${aboutSection.recommendations ?? "Not provided"}
  Suggested Structure: ${aboutSection.suggestedStructure ?? "Not provided"}
  Key Elements: ${aboutSection.keyElements ?? "Not provided"}
  Draft Content: ${aboutSection.draftContent ?? "Not provided"}

Profile Enhancements:
  Experience Section: ${profileEnhancements.experienceSection ?? "Not assessed"}
  Skills & Endorsements: ${profileEnhancements.skillsEndorsements ?? "Not assessed"}
  Activity & Engagement: ${profileEnhancements.activityEngagement ?? "Not assessed"}
  Visual Improvements: ${profileEnhancements.visualImprovements ?? "Not assessed"}

Content Strategy:
  Themes: ${contentStrategy.themes ?? "Not specified"}
  Post Ideas: ${contentStrategy.postIdeas ?? "Not specified"}
  Engagement Tips: ${contentStrategy.engagementTips ?? "Not specified"}

Implementation Priorities: ${optimization.implementationPriorities ?? "Not specified"}

CRITICAL: LinkedIn optimization recommendations have already been generated. Reference these when discussing profile improvements and content strategy. Do not repeat the full analysis.
═══════════════════════════════════════════════════════════════
`;
  } catch (error) {
    console.error("Error formatting LinkedIn optimization context:", error);
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

      const credibilityGapsText =
        data.credibilityGaps
          ?.map((gap: string) => `• ${gap}`)
          ?.join("\n") ?? "";

      summary += `
SESSION 2: CREDIBILITY & PROOF
Credibility Tier: ${data.credibilityTier ? `Tier ${data.credibilityTier}` : "Not assessed"}
Brand Claim: ${data.brandClaim ?? "Not established"}
${proofBulletsText ? `Top Proof Points:\n${proofBulletsText}` : ""}
${credibilityGapsText ? `Credibility Gaps:\n${credibilityGapsText}` : ""}
${data.credibilityCeiling ? `Credibility Ceiling: ${data.credibilityCeiling}` : ""}
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
  professionalStatus?: string | null,
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

    const modulePromptSet = getModulePromptSet(professionalStatus);
    const analysisPrompt = modulePromptSet.getAnalysisPrompt(
      moduleCode,
      messages,
      questionnaireContext,
      foundationSessionsContext,
      previousModulesContext,
    );


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
          const initialMessage = getModulePromptSet(req.user!.professionalStatus).getInitialGuidanceMessage(moduleCode);
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
            const initialMessage = getModulePromptSet(req.user!.professionalStatus).getInitialGuidanceMessage(moduleCode);
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

        // Fetch all context data in parallel for efficiency
        const questionnaire = await storage.getQuestionnaire(userId);
        const questionnaireSummary = formatQuestionnaireSummary(questionnaire);

        const [
          resumeSummary,
          foundationSessionsSummary,
          sliSummary,
          conversationSummaryContext,
          brandingIntakeContext,
          homeworkContext,
          linkedinOptimizationContext,
        ] = await Promise.all([
          formatResumeSummary(userId),
          formatFoundationSessionsSummary(userId),
          formatSliSummary(userId),
          formatConversationSummariesContext(userId),
          formatBrandingIntakeContext(userId),
          formatHomeworkContext(userId),
          formatLinkedinOptimizationContext(userId),
        ]);

        // Fetch previous module's completion data for chaining
        let previousModuleData = null;
        let moduleAData = null;
        if (moduleCode === "B") {
          const moduleA = await storage.getEnhancementModule(userId, "A");
          if (moduleA?.status === "completed" && moduleA.completionData) {
            previousModuleData = moduleA.completionData;
          }
        } else if (moduleCode === "C") {
          const [moduleA, moduleB] = await Promise.all([
            storage.getEnhancementModule(userId, "A"),
            storage.getEnhancementModule(userId, "B"),
          ]);
          if (moduleB?.status === "completed" && moduleB.completionData) {
            previousModuleData = moduleB.completionData;
          }
          if (moduleA?.status === "completed" && moduleA.completionData) {
            moduleAData = moduleA.completionData;
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


        // Build previous module summaries string for context chaining
        let previousSummaries = "";
        if (moduleCode === "B" && previousModuleData) {
          previousSummaries = formatModuleSummary("A", previousModuleData);
        } else if (moduleCode === "C") {
          if (moduleAData) {
            previousSummaries += formatModuleSummary("A", moduleAData);
          }
          if (previousModuleData) {
            previousSummaries += formatModuleSummary("B", previousModuleData);
          }
        }

        // Generate system prompt based on user's professional status
        const systemPrompt = getModulePromptSet(req.user!.professionalStatus).getSystemPrompt(moduleCode, {
          resumeSummary,
          questionnaireSummary,
          foundationSessionsSummary,
          sliSummary,
          conversationSummaryContext,
          brandingIntakeContext,
          homeworkContext,
          linkedinOptimizationContext,
          previousSummaries,
          userProfile,
        });

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
            req.user!.professionalStatus,
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
          req.user!.professionalStatus,
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

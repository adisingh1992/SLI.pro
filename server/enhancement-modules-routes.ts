import { Express, Request, Response, NextFunction } from "express";
import { parseJsonResponse } from "./json-response";

/**
 * Published completion criteria for a population/module, rendered for the
 * surface that asked.
 *
 * Undefined means nothing published, so the prompt file's own list is used.
 * Module C has no list of its own in the analysis prompt — its criteria are
 * seeded as a DRAFT precisely because publishing them would give the analysis
 * a bar it has never had.
 */
async function resolveModuleCriteria(
  professionalStatus: string | null | undefined,
  moduleCode: string,
  surface: "conversation" | "analysis",
): Promise<string | undefined> {
  try {
    const criteriaStore = await import("./wing/completion-criteria-store");
    const populationTag =
      professionalStatus === "undergraduate_or_recent_grad" ||
      professionalStatus === "early_career"
        ? professionalStatus
        : "mid_career_or_senior";

    const published = await criteriaStore.getPublished(
      populationTag,
      `enhancement_${moduleCode.toLowerCase()}`,
    );
    if (!published) return undefined;

    return surface === "conversation"
      ? criteriaStore.renderForConversation(published.criteria)
      : criteriaStore.renderForAnalysis(published.criteria);
  } catch (error) {
    console.error("[criteria] module resolution failed, using prompt defaults:", error);
    return undefined;
  }
}
import { storage } from "./storage";
import {
  insertEnhancementModuleMessageSchema,
  updateEnhancementModuleSchema,
} from "../shared/schema";
import { getModulePromptSet } from "./enhancement-module-prompts";
import * as orchestrator from "./orchestrator";
import * as moduleStore from "./wing/enhancement-store";
import * as store from "./wing/session-store";
import type { ArtifactType } from "./wing/session-store";
import * as docStore from "./wing/document-store";
import * as intakeStore from "./wing/intake-store";
import * as sliStore from "./wing/sli-store";
import * as profileStore from "./wing/profile-store";
import * as identity from "./wing/identity-store";

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
    const documents = await docStore.getDocuments(userId);
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
    const all = await sliStore.listByUser(userId);
    if (!all.length) return "";

    const active = await sliStore.getActive(userId);
    const candidates = all.filter((s) => s.status === "candidate");

    // The SLI in force is what coaching should build on; candidates are
    // context for how the student got there.
    const activeText = active
      ? `IN FORCE: "${active.title}" — ${active.statement}` +
        (active.rationale ? `\n  Rationale: ${active.rationale}` : "") +
        (active.source === "refined"
          ? `\n  (refinement ${active.refinementCount} of the original)`
          : active.source === "custom"
            ? `\n  (written by the student)`
            : "")
      : "No SLI selected yet";

    const candidateText = candidates.length
      ? "\n\nCandidates considered:\n" +
        candidates
          .map((c, i) => `  Option ${i + 1}: "${c.title}" — ${c.statement}`)
          .join("\n")
      : "";

    return `
═══════════════════════════════════════════════════════════════
USER'S SINGLE LASTING IMPRESSION (SLI)
═══════════════════════════════════════════════════════════════

${activeText}${candidateText}

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
    const intake = await intakeStore.getBrandingIntake(userId);
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

/**
 * Completed Foundation Sessions with their outcome artifacts, read from wing.
 * Returns the shape the summary formatter below expects
 * ({ sessionNumber, completionData }), so only the source changes.
 */
async function foundationOutcomes(
  userId: number,
): Promise<Array<{ sessionNumber: number; completionData: any }>> {
  const user = await identity.getUser(userId);
  if (!user) return [];

  const studentId = await store.studentIdFor(user as any);
  const rows = await store.listSessions(studentId, store.FOUNDATION_TYPES);

  const artifactFor: Record<number, ArtifactType> = {
    1: "functional_identity",
    2: "credibility_assessment",
    3: "signature_story",
  };

  const out: Array<{ sessionNumber: number; completionData: any }> = [];
  for (const row of rows) {
    if (row.status !== "completed") continue;
    const n = store.foundationNumber(row.sessionType);
    const artifact = await store.getArtifact(row.id, artifactFor[n]);
    if (artifact?.content) {
      out.push({ sessionNumber: n, completionData: artifact.content });
    }
  }
  return out;
}

// Format foundation sessions 1, 2, 3 data into a concise combined summary
async function formatFoundationSessionsSummary(
  userId: number,
): Promise<string> {
  try {
    // Foundation Sessions now live in the wing schema, with their outcomes as
    // typed artifacts rather than a completionData column. Reading them here is
    // what closes the gap the feature list flags in A3: Enhancement Modules
    // must have full context from completed Foundation Sessions.
    const sessions = await foundationOutcomes(userId);

    if (!sessions || sessions.length === 0) {
      return "";
    }

    const session1 = sessions.find((s) => s.sessionNumber === 1);
    const session2 = sessions.find((s) => s.sessionNumber === 2);
    const session3 = sessions.find((s) => s.sessionNumber === 3);

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
      const moduleA = await moduleStore.getEnhancementModule(userId, "A");
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
      const moduleA = await moduleStore.getEnhancementModule(userId, "A");
      const moduleB = await moduleStore.getEnhancementModule(userId, "B");

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
export async function checkModuleCompletion(
  userId: number,
  moduleCode: string,
  messages: any[],
  userProfile: any,
  professionalStatus?: string | null,
  /**
   * Draft criteria to evaluate INSTEAD of the published ones.
   *
   * Exported and parameterised for the same reason as the Foundation Session
   * equivalent: replay must exercise the real completion path, not a copy that
   * can drift and reassure you about code nobody runs.
   */
  criteriaOverride?: string,
): Promise<{ shouldComplete: boolean; completionData?: any }> {
  if (!["A", "B", "C"].includes(moduleCode)) {
    return { shouldComplete: false };
  }

  // No turn-count gate: the methodology decides when a module is complete,
  // not an arbitrary message threshold. Modules are also explicitly allowed to
  // end at any natural stopping point (feature list A3).
  // Only guard against analysing an empty transcript.
  if (messages.length === 0) {
    return { shouldComplete: false };
  }

  try {
    // Fetch context for analysis
    const questionnaire = await intakeStore.getQuestionnaire(userId);
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
      criteriaOverride ??
        (await resolveModuleCriteria(professionalStatus, moduleCode, "analysis")),
    );


    // Module completion analysis -> mid tier.
    const { text: responseText } = await orchestrator.complete({
      tier: "mid",
      maxTokens: 2000,
      messages: [
        {
          role: "user",
          content: analysisPrompt,
        },
      ],
    });

    // parseJsonResponse, not a hand-rolled parser. The previous version
    // stripped fences itself and called bare JSON.parse inside a catch that
    // returned { shouldComplete: false } — so a malformed or EMPTY response
    // was indistinguishable from "the module is not finished yet". That is
    // exactly the failure that made a Foundation Session look stuck for a day.
    //
    // An unparseable analysis is now a loud, specific error. The module still
    // does not complete, but the log says why.
    const analysisResult = parseJsonResponse<{
      shouldComplete?: boolean;
      completionData?: any;
    }>(responseText, `Module ${moduleCode} completion analysis`);

    console.log(
      `[Module ${moduleCode}] Completion check - shouldComplete: ${analysisResult.shouldComplete}, ` +
        `confidence: ${analysisResult.completionData?.confidence ?? "N/A"}`,
    );

    if (!analysisResult.shouldComplete && analysisResult.completionData?.reasoning) {
      // Say WHY, as the Foundation Session path does. "Not complete" with no
      // reason is unactionable for whoever has to work out if it is correct.
      console.log(
        `[Module ${moduleCode}] not complete - reasoning: ${analysisResult.completionData.reasoning}`,
      );
    }

    return {
      shouldComplete: Boolean(analysisResult.shouldComplete),
      completionData: analysisResult.completionData,
    };
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
        const modules = await moduleStore.getEnhancementModulesForUser(
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

        const moduleData = await moduleStore.getEnhancementModuleWithMessages(
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
        let module = await moduleStore.getEnhancementModule(
          req.user!.id,
          moduleCode,
        );

        if (!module) {
          // Create new module
          module = await moduleStore.createEnhancementModule({
            userId: req.user!.id,
            moduleCode: moduleCode as "A" | "B" | "C",
            status: "in_progress",
            startedAt: new Date(),
          });

          // Add initial guidance message
          const initialMessage = getModulePromptSet(req.user!.professionalStatus).getInitialGuidanceMessage(moduleCode);
          if (initialMessage) {
            await moduleStore.createEnhancementModuleMessage({
              moduleId: module.id,
              role: "assistant",
              content: initialMessage,
            });
          }
        } else if (module.status === "available") {
          // Update status to in_progress if it was available
          await moduleStore.updateEnhancementModule(module.id, {
            status: "in_progress",
            startedAt: new Date(),
          });

          // Check if module has any messages, if not add initial guidance message
          const existingMessages = await moduleStore.getEnhancementModuleMessages(
            module.id,
          );
          if (existingMessages.length === 0) {
            const initialMessage = getModulePromptSet(req.user!.professionalStatus).getInitialGuidanceMessage(moduleCode);
            if (initialMessage) {
              await moduleStore.createEnhancementModuleMessage({
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

        const module = await moduleStore.getEnhancementModule(userId, moduleCode);
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
        const userMessage = await moduleStore.createEnhancementModuleMessage({
          moduleId: module.id,
          role: "user",
          content: content.trim(),
        });

        // Get all messages from this module for context
        const messages = await moduleStore.getEnhancementModuleMessages(module.id);

        // Format messages for Claude API
        const formattedMessages = messages.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        }));

        // Get user profile data for context
        const userProfile = await profileStore.getUserProfile(userId);

        // Fetch all context data in parallel for efficiency
        const questionnaire = await intakeStore.getQuestionnaire(userId);
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
          const moduleA = await moduleStore.getEnhancementModule(userId, "A");
          if (moduleA?.status === "completed" && moduleA.completionData) {
            previousModuleData = moduleA.completionData;
          }
        } else if (moduleCode === "C") {
          const [moduleA, moduleB] = await Promise.all([
            moduleStore.getEnhancementModule(userId, "A"),
            moduleStore.getEnhancementModule(userId, "B"),
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
          // Same row the analysis reads — one definition, two renderings.
          completionCriteria: await resolveModuleCriteria(
            req.user!.professionalStatus,
            moduleCode,
            "conversation",
          ),
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
          // Enhancement Module coaching conversation -> flagship tier.
          const stream = orchestrator.completeStream({
            tier: "flagship",
            maxTokens: 1500,
            system: systemPrompt,
            messages: formattedMessages,
          });

          for await (const text of stream) {
            assistantContent += text;
            res.write(
              `data: ${JSON.stringify({ type: "chunk", content: text })}\n\n`,
            );
          }

          // Save assistant response
          const assistantMessage = await moduleStore.createEnhancementModuleMessage(
            {
              moduleId: module.id,
              role: "assistant",
              content: assistantContent,
            },
          );

          // Check for automatic completion
          const allMessages = await moduleStore.getEnhancementModuleMessages(
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
            await moduleStore.updateEnhancementModule(module.id, {
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
        const module = await moduleStore.getEnhancementModule(
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
        await moduleStore.createEnhancementModuleMessage({
          moduleId: module.id,
          role: "user",
          content,
        });

        // Get all messages for context
        const messages = await moduleStore.getEnhancementModuleMessages(module.id);

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

        // Non-streaming fallback for the same coaching surface -> flagship.
        const { text: completionText } = await orchestrator.complete({
          tier: "flagship",
          maxTokens: 1000,
          system: systemPrompt,
          messages: userMessages,
        });

        const assistantResponse =
          completionText ||
          "I apologize, but I encountered an error generating a response.";

        // Save assistant message
        await moduleStore.createEnhancementModuleMessage({
          moduleId: module.id,
          role: "assistant",
          content: assistantResponse,
        });

        // Check for completion
        const userProfile = await profileStore.getUserProfile(req.user!.id);
        const allMessages = await moduleStore.getEnhancementModuleMessages(
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
          await moduleStore.updateEnhancementModule(module.id, {
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

        const module = await moduleStore.getEnhancementModule(
          req.user!.id,
          moduleCode,
        );
        if (!module) {
          return res.status(404).json({ error: "Module not found" });
        }

        await moduleStore.updateEnhancementModule(module.id, updateData);

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

        const modules = await moduleStore.getEnhancementModulesForUser(userId);
        res.json(modules);
      } catch (error) {
        console.error("Error fetching enhancement modules for user:", error);
        res.status(500).json({ error: "Failed to fetch enhancement modules" });
      }
    },
  );
}

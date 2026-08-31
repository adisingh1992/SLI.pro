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
import { z } from "zod";
import {
  insertEnhancementModuleMessageSchema,
} from "../shared/schema";
import { getModulePromptSet } from "./enhancement-module-prompts";
import * as orchestrator from "./orchestrator";
import * as moduleStore from "./wing/enhancement-store";
import * as store from "./wing/session-store";
import type { ArtifactType } from "./wing/session-store";
import * as docStore from "./wing/document-store";
import { buildStudentContext } from "./wing/student-context";
import * as intakeStore from "./wing/intake-store";
import * as sliStore from "./wing/sli-store";
import * as profileStore from "./wing/profile-store";
import * as identity from "./wing/identity-store";
import { isAdmin, isStudent } from "./admin-guards";


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

/**
 * Everything Wing already knows about this student (Feature List A2).
 *
 * Was a local copy that filtered documents on type === "resume", identical to
 * the one in foundation-sessions-routes.ts and carrying the same defect: the
 * LinkedIn PDF, the supplementary uploads and every intake answer were invisible
 * to the module conversation, so it asked for them again.
 *
 * Delegates now, so the two surfaces cannot drift apart again — and so a fix to
 * what Wing knows lands in both places at once.
 */
async function formatResumeSummary(userId: number): Promise<string> {
  const context = await buildStudentContext(userId);
  return context.text;
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
    // artifactStore (wing), not legacy storage. This feeds Module A's prompt
    // context, so reading the legacy table meant the module ran as though the
    // student had never had an optimisation done.
    const artifactStore = await import("./wing/artifact-store");
    const optimization = await artifactStore.getLatestLinkedinOptimization(userId);
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
    /*
     * `ended_early` counts. The Foundation early-exit route writes the session's
     * artifact BEFORE it records the end state, so a student who left Session 1 at a
     * natural point has a real `functional_identity` — and skipping it here meant no
     * module ever saw it. That is A3's "modules operate in isolation from the
     * functional identity map" reappearing for exactly the students most likely to
     * need the continuity.
     */
    if (row.status !== "completed" && row.status !== "ended_early") continue;
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
/**
 * The other modules' outcomes, for the analysis prompt.
 *
 * Same defect as the conversation path had, in a second copy: B read A, C read A and
 * B, and A read nothing — so the ordering A3 removed from access was still hard-coded
 * into what each module knows. One loop over every OTHER module now, in whatever
 * order the student did them.
 *
 * `ended_early` is included for the same reason it is on the conversation path: the
 * early-exit route writes a real `module_outcome` artifact, and skipping it would
 * treat a student who stopped at a natural point as having done nothing.
 */
async function formatPreviousModulesAnalysisContext(
  userId: number,
  currentModuleCode: string,
): Promise<string> {
  try {
    const others = (await moduleStore.getEnhancementModulesForUser(userId))
      .filter((m) => m.moduleCode !== currentModuleCode)
      .filter((m) => m.status === "completed" || m.status === "ended_early")
      .filter((m) => m.completionData)
      .sort((a, b) => a.moduleCode.localeCompare(b.moduleCode));

    let context = "";
    for (const m of others) {
      const data = m.completionData as any;

      if (m.moduleCode === "A") {
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
      } else if (m.moduleCode === "B") {
        context += `
═══════════════════════════════════════════════════════════════
BACKGROUND CONTEXT: MODULE B (Network Position Mapping)
═══════════════════════════════════════════════════════════════

Functional Identity: ${data.functionalIdentity ?? "Not established"}
Value Proposition: ${data.valueProposition ?? "Not articulated"}

NOTE: User completed Module B. Conversation may reference prior work without repeating it.
═══════════════════════════════════════════════════════════════
`;
      } else {
        /*
         * Module C has no renderer, here or in `formatModuleSummary`, and inventing
         * one would mean guessing at the shape of its `completionData`. Logged rather
         * than dropped in silence: a student who finished C and then opened A gets
         * nothing from it, and that should be visible to whoever reads the log rather
         * than discovered from a conversation that felt oddly ignorant.
         */
        console.warn(
          `[modules] no summary renderer for module ${m.moduleCode}; its outcome is not in the prompt`,
        );
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
    isStudent,
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
    isStudent,
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
    isStudent,
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
        } else if (module.status === "available" || module.status === "ended_early") {
          /*
           * `ended_early` is here because without it the exit was a one-way door.
           * Only `available` was promoted, so a module a student stopped stayed at
           * `ended_early`; `/start` returned success and the stream route then
           * refused every message with "Module must be in progress or completed".
           * A3 asks for exit "at any natural stopping point", which is only a
           * stopping point if they can pick it up again.
           *
           * `startedAt` is not reset on a resume — the module started when it
           * started, and the reporting reads that column as first contact.
           */
          await moduleStore.updateEnhancementModule(module.id, {
            status: "in_progress",
            ...(module.status === "available" ? { startedAt: new Date() } : {}),
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
    isStudent,
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

        // Format messages for the model
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

        /*
         * ── EVERY OTHER MODULE, IN WHATEVER ORDER THEY WERE DONE ──────────────
         * A3: "students can complete them in any order or skip entirely" and "Wing
         * must have full context from all completed Foundation Sessions AND any
         * previously completed Enhancement Modules".
         *
         * This was three hand-written branches: B read A, C read A and B, and A read
         * NOTHING. So the ordering the spec removed from access was still hard-coded
         * into context — a student who did C, then B, then A had a Module A
         * conversation that knew nothing about either of the modules they had just
         * finished, which is the isolation A3 was written to close, surviving in the
         * one place nobody looked.
         *
         * One read of every module, minus this one. `ended_early` counts: the early
         * exit writes a real `module_outcome` artifact, and dropping it would mean a
         * student who stopped at a natural point had done nothing at all.
         */
        const otherModules = (await moduleStore.getEnhancementModulesForUser(userId))
          .filter((m) => m.moduleCode !== moduleCode)
          .filter((m) => m.status === "completed" || m.status === "ended_early")
          .filter((m) => m.completionData)
          /* Stable order, so the same history renders the same prompt twice running. */
          .sort((a, b) => a.moduleCode.localeCompare(b.moduleCode));

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


        const previousSummaries = otherModules
          .map((m) => formatModuleSummary(m.moduleCode, m.completionData))
          .join("");

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

          /*
           * ── THE TURN IS OVER HERE ──────────────────────────────────────────
           * Same change as the Foundation Session stream, for the same reason.
           * `complete` is what releases the composer, and it used to sit AFTER
           * `checkModuleCompletion` — a model call over the whole transcript,
           * run on every single turn. The student watched a finished reply with
           * the input still disabled for several more seconds.
           *
           * The connection stays open so `module_completed` can still be
           * delivered if this turn happened to finish the module.
           */
          res.write(
            `data: ${JSON.stringify({ type: "complete", messageId: assistantMessage.id })}\n\n`,
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

          // `complete` was sent above, before the analysis. Nothing left to
          // announce.
          res.end();
        } catch (streamError) {
          console.error("Error in model streaming:", streamError);
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

  /*
   * There is no non-streaming `POST /message`.
   *
   * One existed — a second, older copy of the turn handler kept beside
   * `messages/stream`. Nothing called it: the client streams. It had drifted into a
   * different function from the route it shadowed, and the difference was not cosmetic.
   * It assembled no cross-module context, so Wing answered on that module alone; and it
   * still ran the completion check, so a request to it could mark a module COMPLETED
   * from a conversation the analysis prompt had never seen in full.
   *
   * A duplicate write path that decides less and commits the same thing is not dead
   * weight, it is a second answer to a question that should have one. Removed.
   */

  /**
   * Ends a module early — a distinct status, not a completion (Feature List A3).
   *
   * "No option to end modules early (unlike Foundation Sessions, which allow
   * early exit). Modules should allow exit at any natural stopping point."
   *
   * Mirrors the Foundation Session route deliberately, including the part that
   * matters most: the analysis still runs and whatever the conversation
   * produced is still saved. A student who stops at a sensible point keeps
   * their work — the module is marked `ended_early` rather than `completed`, so
   * the record stays honest about how it finished without punishing them for
   * finishing it that way.
   */
  app.post(
    "/api/enhancement-modules/:moduleCode/end-early",
    isStudent,
    async (req: Request, res: Response) => {
      try {
        const { moduleCode } = req.params;
        if (!["A", "B", "C"].includes(moduleCode)) {
          return res.status(400).json({ error: "Invalid module code" });
        }

        const module = await moduleStore.getEnhancementModule(req.user!.id, moduleCode);
        if (!module) return res.status(404).json({ error: "Module not found" });

        const userProfile = await profileStore.getUserProfile(req.user!.id);
        const allMessages = await moduleStore.getEnhancementModuleMessages(module.id);

        const completionCheck = await checkModuleCompletion(
          req.user!.id,
          moduleCode,
          allMessages,
          userProfile,
          req.user!.professionalStatus,
        );

        await moduleStore.updateEnhancementModule(module.id, {
          status: "ended_early",
          completedAt: new Date(),
          // Saved whether or not the methodology thought it was finished, with
          // the truncation recorded on the artifact itself — that provenance
          // matters when the outcome is scored later.
          ...(completionCheck.completionData
            ? {
                completionData: {
                  ...completionCheck.completionData,
                  endedEarly: true,
                  complete: completionCheck.shouldComplete,
                },
              }
            : {}),
        });

        console.log(
          `[modules] ${moduleCode} ended early for user ${req.user!.id} ` +
            `(methodologyComplete=${completionCheck.shouldComplete})`,
        );

        res.json({
          endedEarly: true,
          outcomeSaved: !!completionCheck.completionData,
          methodologyComplete: completionCheck.shouldComplete,
        });
      } catch (error) {
        console.error("Error ending module early:", error);
        res.status(500).json({ error: "Failed to end module" });
      }
    },
  );

  /*
   * PATCH /api/enhancement-modules/:moduleCode — the timer, and nothing else.
   *
   * This took `updateEnhancementModuleSchema`, which is the insert schema minus
   * two columns and `.partial()` — so behind `isAuthenticated` it accepted
   * `status`, `startedAt`, `completedAt` and `completionData` from the body and
   * handed them to the store, which completes the session on
   * `status === "completed"` and writes a `module_outcome` artifact from
   * `completionData`.
   *
   * The route resolves the module from `req.user`, so it was never a way into
   * anybody else's record. It was a way for a student to mark their own module
   * complete without doing it — and, worse, to supply the outcome artifact
   * themselves, which is the thing an advisor reads as the student's work.
   *
   * Completion is decided by `checkModuleCompletion` over the transcript, and the
   * server writes the status and the artifact together where it agrees. Starting
   * and ending have their own routes. The only field a client has ever sent here
   * is `timerElapsed`, so that is the whole schema now, declared inline where it
   * can be read rather than derived from an insert schema that grows whenever
   * the table does.
   *
   * The same shape and the same fix as PATCH /api/foundation-sessions/:n, which
   * was removed outright because nothing called it at all. `api-contracts`
   * check 23 holds both.
   */
  const patchModuleSchema = z.object({
    timerElapsed: z.number().int().nonnegative().optional(),
  });

  app.patch(
    "/api/enhancement-modules/:moduleCode",
    isStudent,
    async (req: Request, res: Response) => {
      try {
        const { moduleCode } = req.params;

        if (!["A", "B", "C"].includes(moduleCode)) {
          return res.status(400).json({ error: "Invalid module code" });
        }

        const updateData = patchModuleSchema.parse(req.body);

        const module = await moduleStore.getEnhancementModule(
          req.user!.id,
          moduleCode,
        );
        if (!module) {
          return res.status(404).json({ error: "Module not found" });
        }

        /*
         * Spelled out at the call site rather than spread. The store dispatches on
         * whatever keys it is given, so passing a parsed body wholesale makes the
         * set of writable columns a property of a schema in another file.
         */
        await moduleStore.updateEnhancementModule(module.id, {
          timerElapsed: updateData.timerElapsed,
        });

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

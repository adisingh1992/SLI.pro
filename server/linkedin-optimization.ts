import type { Document, FreshnessReport, Sli } from "@shared/schema";
import { storage } from "./storage";
import * as wingStore from "./wing/session-store";
import * as orchestrator from "./orchestrator";
import * as identity from "./wing/identity-store";

// Helper function to safely call the model with retries
async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialBackoff = 60000
): Promise<T> {
  let attempts = 0;
  let backoff = initialBackoff;

  while (attempts < maxRetries) {
    try {
      attempts++;
      console.log(`[linkedin-optimization] Requesting LinkedIn optimization (Attempt ${attempts}/${maxRetries})`);
      return await fn();
    } catch (error: any) {
      if (error.status === 429) {
        console.log(`[linkedin-optimization] Rate limit exceeded. Retrying in ${backoff / 60000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        backoff *= 2; // Exponential backoff
        continue;
      }
      
      console.error(`[linkedin-optimization] Model call failed (Attempt ${attempts}/${maxRetries}):`, error);
      
      if (attempts >= maxRetries) {
        throw error;
      }
      
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  throw new Error('Max retries exceeded');
}

/**
 * Generate LinkedIn optimization recommendations based on resume, LinkedIn, SLI, freshness report, and foundation sessions
 */
/** Only the analysis text is used from documents, so accept any doc shape
 *  (wing DocumentView or a legacy row) rather than binding to one table. */
type AnalysedDocument = { analysisContent?: string | null };

export async function generateLinkedInOptimization(
  userId: number,
  resumeDocument: AnalysedDocument,
  linkedinDocument: AnalysedDocument,
  sli: { statement: string; title?: string },
  freshnessReport: FreshnessReport
): Promise<{
  alignmentAssessment: string;
  headlineOptimization: {
    currentHeadline?: string;
    recommendedHeadline?: string;
    rationale?: string;
  };
  aboutSection: {
    currentAnalysis?: string;
    recommendations?: string;
    suggestedStructure?: string;
    keyElements?: string;
    draftContent?: string;
  };
  profileEnhancements: {
    experienceSection?: string;
    skillsEndorsements?: string;
    activityEngagement?: string;
    visualImprovements?: string;
  };
  contentStrategy: {
    themes?: string;
    postIdeas?: string;
    engagementTips?: string;
  };
  implementationPriorities: string;
  /**
   * A4: the integrated read of the whole profile.
   *
   * "The current approach chunks out different parts of the profile in a
   * fragmented way. The optimization should present a holistic, integrated view
   * of the full profile with changes shown in context, not as disconnected
   * pieces."
   *
   * The six fields above ARE the fragmented view. They are kept — they hold
   * real detail and migrated records already have them — but they become the
   * detail behind this rather than the product itself.
   */
  holisticReview: {
    /** The single claim the whole profile should make. */
    throughLine?: string;
    /** What someone scanning it top to bottom concludes today. */
    readsAsToday?: string;
    /** What it would say once the changes land. */
    readsAsAfter?: string;
    /** Each change in context, including what it depends on. */
    changes?: {
      section?: string;
      current?: string;
      proposed?: string;
      why?: string;
      dependsOn?: string;
    }[];
    /** What to change first, and why that order. */
    sequence?: string;
  };
}> {
  // One row, one statement — no reconstruction from packed columns.
  const sliText = sli.statement;

  // Foundation Sessions now live in the wing schema; outcomes come from
  // typed artifacts rather than a completionData column.
  const luser = await identity.getUser(userId);
  const session1 = luser ? await wingStore.getFoundationSessionForUser(luser, 1) : null;
  const session2 = luser ? await wingStore.getFoundationSessionForUser(luser, 2) : null;
  const session1Data = session1?.completionData;
  const session2Data = session2?.completionData;

  // Building system prompt
  const systemPrompt = `You are a professional branding expert for SLI.pro, providing specific recommendations to optimize a client's LinkedIn profile based on their finalized Single Lasting Impression (SLI). Create actionable profile enhancement recommendations that will strengthen their professional narrative.

You need to respond with structured data that I can parse programmatically. Your response must be valid JSON.

Structure your response in the following format:
{
  "alignmentAssessment": "Comprehensive evaluation of LinkedIn profile SLI alignment that spans 2-3 paragraphs",
  "headlineOptimization": {
    "currentHeadline": "The client's current headline from LinkedIn",
    "recommendedHeadline": "Your optimized headline recommendation",
    "rationale": "Concise explanation of why this headline better aligns with their SLI"
  },
  "aboutSection": {
    "currentAnalysis": "Analysis of strengths and weaknesses in current About section (2 paragraphs)",
    "recommendations": "Strategic recommendations for improving the About section",
    "suggestedStructure": "Paragraph-by-paragraph structure recommendation",
    "keyElements": "Key elements and phrases that should be included to reinforce SLI",
    "draftContent": "A complete draft of the new About section (3-4 paragraphs)"
  },
  "profileEnhancements": {
    "experienceSection": "Specific recommendations to enhance job descriptions with action verbs, metrics, and SLI keywords",
    "skillsEndorsements": "Detailed assessment of skills to add, remove, or prioritize with explanation",
    "activityEngagement": "Guidance on engagement strategy to build thought leadership",
    "visualImprovements": "Recommendations for profile photo, background image, and other visual elements"
  },
  "contentStrategy": {
    "themes": "3-5 content themes that align with the client's SLI and industry positioning",
    "postIdeas": "5-7 specific post ideas including suggested structure and topics",
    "engagementTips": "Specific strategies to increase meaningful engagement and grow professional network"
  },
  "implementationPriorities": "Prioritized roadmap of changes in order of impact, with timeframes",
  "holisticReview": {
    "throughLine": "The single claim the whole profile should make, in one sentence",
    "readsAsToday": "What someone scanning this profile top to bottom concludes about them right now — the honest version, including where it contradicts itself",
    "readsAsAfter": "What it would say once these changes land",
    "changes": [
      {
        "section": "Headline | About | Experience | Skills | Visuals | Activity",
        "current": "The exact current text, quoted",
        "proposed": "The exact replacement text",
        "why": "What this fixes about the profile as a whole",
        "dependsOn": "Which other change this needs in order to work, or empty if it stands alone"
      }
    ],
    "sequence": "What to change first and why that order — usually the change everything else hangs off"
  }
}

CRITICAL — holisticReview IS THE PRODUCT. The six sections above are detail.

A profile is read top to bottom by one person in about nine seconds.
Recommendations that treat the headline, the About and the experience as
separate problems produce a profile that says three different things well, which
is worse than one thing adequately.

So: find the through-line first. Say honestly what the profile communicates as a
whole today, INCLUDING where it contradicts itself. Then show each change as
before and after, with the reason it matters to the whole rather than to its own
section. Where one change only works if another lands too, say so in dependsOn —
that dependency is precisely what the fragmented version loses.`;

  // Preparing user prompt
  let userPrompt = `I need comprehensive LinkedIn optimization recommendations for a client based on their finalized Single Lasting Impression (SLI).

Resume content:
${resumeDocument.analysisContent || "(no analysis available for this resume)"}

LinkedIn content:
${linkedinDocument.analysisContent || "(no analysis available for this LinkedIn profile)"}
`;

  // Add foundation session 1 context if available
  if (session1Data) {
    userPrompt += `
Foundation Session 1 - Functional Focus:
`;
    if (session1Data.primaryFunction) {
      userPrompt += `Primary Function: ${session1Data.primaryFunction}\n`;
    }
    if (session1Data.secondaryFunction) {
      userPrompt += `Secondary Function: ${session1Data.secondaryFunction}\n`;
    }
    if (session1Data.functionalSplit && typeof session1Data.functionalSplit.primary === 'number' && typeof session1Data.functionalSplit.secondary === 'number') {
      userPrompt += `Functional Split: ${session1Data.functionalSplit.primary}% primary, ${session1Data.functionalSplit.secondary}% secondary\n`;
    }
    if (session1Data.antiGeneralistCommitment !== undefined) {
      userPrompt += `Anti-Generalist Commitment: ${session1Data.antiGeneralistCommitment ? 'Yes' : 'No'}\n`;
    }
    if (session1Data.commitmentStatement) {
      userPrompt += `Commitment Statement: ${session1Data.commitmentStatement}\n`;
    }
    if (Array.isArray(session1Data.functionalLanguageExamples) && session1Data.functionalLanguageExamples.length > 0) {
      userPrompt += `Functional Language Examples:\n${session1Data.functionalLanguageExamples.map((ex: string) => `- ${ex}`).join('\n')}\n`;
    }
    if (Array.isArray(session1Data.keyInsights) && session1Data.keyInsights.length > 0) {
      userPrompt += `Key Insights:\n${session1Data.keyInsights.map((insight: string) => `- ${insight}`).join('\n')}\n`;
    }
    userPrompt += '\n';
  }

  // Add foundation session 2 context if available
  if (session2Data) {
    userPrompt += `
Foundation Session 2 - Credibility Framework:
`;
    if (session2Data.credibilityTier) {
      userPrompt += `Credibility Tier: ${session2Data.credibilityTier} out of 5\n`;
    }
    if (session2Data.brandClaim) {
      userPrompt += `Brand Claim: ${session2Data.brandClaim}\n`;
    }
    if (Array.isArray(session2Data.proofBullets) && session2Data.proofBullets.length > 0) {
      userPrompt += `Proof Points:\n${session2Data.proofBullets.map((bullet: string) => `- ${bullet}`).join('\n')}\n`;
    }
    if (session2Data.checkWorthyReason) {
      userPrompt += `Check-Worthy Reason: ${session2Data.checkWorthyReason}\n`;
    }
    if (Array.isArray(session2Data.nextSteps) && session2Data.nextSteps.length > 0) {
      userPrompt += `Next Steps:\n${session2Data.nextSteps.map((step: string) => `- ${step}`).join('\n')}\n`;
    }
    userPrompt += '\n';
  }

  userPrompt += `
SLI:
${sliText}

Freshness Report Highlights:
Profile Content Quality: ${freshnessReport.finalSynthesis?.detailedMetrics?.profileContentQuality?.grade || 'N/A'} 
${freshnessReport.finalSynthesis?.detailedMetrics?.profileContentQuality?.explanation || ''}

Narrative Consistency: ${freshnessReport.finalSynthesis?.detailedMetrics?.narrativeConsistency?.grade || 'N/A'}
${freshnessReport.finalSynthesis?.detailedMetrics?.narrativeConsistency?.explanation || ''}

Current Brand Strength: ${freshnessReport.finalSynthesis?.brandAudit?.currentBrandStrength || 'N/A'}

Core Strengths:
${freshnessReport.finalSynthesis?.brandAudit?.coreStrengths?.join('\n') || 'N/A'}

Critical Gaps:
${freshnessReport.finalSynthesis?.brandAudit?.criticalGaps?.join('\n') || 'N/A'}

LinkedIn Enhancements from Freshness Report:
${freshnessReport.finalSynthesis?.contentRecommendations?.linkedInEnhancements?.join('\n') || 'N/A'}

Please analyze this information and provide detailed, actionable recommendations to optimize the client's LinkedIn profile to align with and reinforce their SLI.`;

  return await callWithRetry(async () => {
    try {
      // LinkedIn profile optimization -> mid tier.
      const response = await orchestrator.complete({
        tier: "mid",
        maxTokens: 4000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      console.log("[orchestrator] LinkedIn optimization response:",
        JSON.stringify({
          provider: response.provider,
          model: response.model,
          usage: response.usage
        })
      );

      let content = response.text || '';
      console.log("[linkedin-optimization] Extracted text content:", content.substring(0, 200) + "...");
      
      // Clean up the response if it's wrapped in markdown code blocks
      if (content.startsWith("```json") || content.startsWith("```")) {
        console.log("[linkedin-optimization] Detected markdown code block, removing delimiters");
        content = content.replace(/^```json\s*\n|\n```$/g, "");  // Remove ```json and ``` markers
        content = content.replace(/^```\s*\n|\n```$/g, "");      // In case there's no "json" specified
      }
      
      // Further cleanup - sometimes the model adds spaces or newlines
      content = content.trim();
      
      console.log("[linkedin-optimization] Cleaned response for parsing:", content.substring(0, 100) + "...");
      
      try {
        const parsedContent = JSON.parse(content);
        console.log("[linkedin-optimization] Successfully parsed JSON response");
        return parsedContent;
      } catch (parseError) {
        console.error("[linkedin-optimization] JSON parse error after cleanup:", parseError);
        console.error("[linkedin-optimization] First 500 chars of content:", content.substring(0, 500));
        throw parseError;
      }
    } catch (error) {
      console.error("[linkedin-optimization] Error in LinkedIn optimization function:", error);
      if (error instanceof SyntaxError) {
        console.error("[linkedin-optimization] JSON parse error - likely invalid response format");
      }
      throw error;
    }
  });
}

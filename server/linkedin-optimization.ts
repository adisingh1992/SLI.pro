import Anthropic from "@anthropic-ai/sdk";
import type { Document, FreshnessReport, Sli } from "@shared/schema";
import { storage } from "./storage";

// Initialize Anthropic client
const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = new Anthropic({
  apiKey,
});

// Helper function to safely call Claude with retries
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
      console.log(`[claude] Sending request to Claude for LinkedIn optimization (Attempt ${attempts}/${maxRetries})`);
      return await fn();
    } catch (error: any) {
      if (error.status === 429) {
        console.log(`[claude] Rate limit exceeded. Retrying in ${backoff / 60000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        backoff *= 2; // Exponential backoff
        continue;
      }
      
      console.error(`[claude] Error calling Claude API (Attempt ${attempts}/${maxRetries}):`, error);
      
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
export async function generateLinkedInOptimization(
  userId: number,
  resumeDocument: Document, 
  linkedinDocument: Document,
  sli: Sli,
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
}> {
  // Prepare SLI text (either refined or selected)
  const sliText = sli.refinedSliText || 
    (sli.selectedSliIndex === 1 ? sli.statement1 : 
     sli.selectedSliIndex === 2 ? sli.statement2 : 
     sli.selectedSliIndex === 3 ? sli.statement3 : 
     sli.customSliText);

  // Fetch foundation sessions 1 & 2
  const session1 = await storage.getFoundationSession(userId, 1);
  const session2 = await storage.getFoundationSession(userId, 2);
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
  "implementationPriorities": "Prioritized roadmap of changes in order of impact, with timeframes"
}`;

  // Preparing user prompt
  const userPrompt = `I need comprehensive LinkedIn optimization recommendations for a client based on their finalized Single Lasting Impression (SLI).

Resume content:
${resumeDocument.analysisContent || resumeDocument.fileData}

LinkedIn content:
${linkedinDocument.analysisContent || linkedinDocument.fileData}

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
    console.log("[claude] Calling Anthropic API with model:", process.env.CLAUDE_MODEL || "claude-3-7-sonnet-20250219");
    
    try {
      const response = await anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || "claude-3-7-sonnet-20250219", // the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      console.log("[claude] Received response from Anthropic API:", 
        JSON.stringify({
          id: response.id,
          model: response.model,
          contentTypes: response.content.map(c => c.type),
          usage: response.usage
        })
      );

      // Get the text content from Claude's response
      let content = response.content.find(c => c.type === 'text')?.text || '';
      console.log("[claude] Extracted text content:", content.substring(0, 200) + "...");
      
      // Clean up the response if it's wrapped in markdown code blocks
      if (content.startsWith("```json") || content.startsWith("```")) {
        console.log("[claude] Detected markdown code block, removing delimiters");
        content = content.replace(/^```json\s*\n|\n```$/g, "");  // Remove ```json and ``` markers
        content = content.replace(/^```\s*\n|\n```$/g, "");      // In case there's no "json" specified
      }
      
      // Further cleanup - sometimes Claude adds spaces or newlines
      content = content.trim();
      
      console.log("[claude] Cleaned response for parsing:", content.substring(0, 100) + "...");
      
      try {
        const parsedContent = JSON.parse(content);
        console.log("[claude] Successfully parsed JSON response");
        return parsedContent;
      } catch (parseError) {
        console.error("[claude] JSON parse error after cleanup:", parseError);
        console.error("[claude] First 500 chars of content:", content.substring(0, 500));
        throw parseError;
      }
    } catch (error) {
      console.error("[claude] Error in LinkedIn optimization function:", error);
      if (error instanceof SyntaxError) {
        console.error("[claude] JSON parse error - likely invalid response format");
      }
      throw error;
    }
  });
}
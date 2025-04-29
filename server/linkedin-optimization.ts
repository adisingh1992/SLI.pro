import { Anthropic } from "@anthropic-ai/sdk";
import type { Document, FreshnessReport, Sli } from "@shared/schema";

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
        console.log(`[claude] Rate limit exceeded. Retrying in ${backoff / 1000} seconds...`);
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
 * Generate LinkedIn optimization recommendations based on resume, LinkedIn, SLI, and freshness report
 */
export async function generateLinkedInOptimization(
  resumeDocument: Document, 
  linkedinDocument: Document,
  sli: Sli,
  freshnessReport: FreshnessReport
): Promise<any> {
  // Prepare SLI text (either refined or selected)
  const sliText = sli.refinedSliText || 
    (sli.selectedSliIndex === 1 ? sli.statement1 : 
     sli.selectedSliIndex === 2 ? sli.statement2 : 
     sli.selectedSliIndex === 3 ? sli.statement3 : 
     sli.customSliText);

  // Building system prompt
  const systemPrompt = `You are a professional branding expert for SLI.pro, providing specific recommendations to optimize a client's LinkedIn profile based on their finalized Single Lasting Impression (SLI). Create actionable profile enhancement recommendations that will strengthen their professional narrative.

You need to respond with structured data that I can parse programmatically. Your response must be valid JSON.

Structure your response in the following format:
{
  "alignmentAssessment": "Comprehensive evaluation of LinkedIn profile SLI alignment",
  "headlineOptimization": {
    "currentHeadline": "The client's current headline from LinkedIn",
    "recommendedHeadline": "Your optimized headline recommendation",
    "rationale": "Concise explanation of optimization"
  },
  "aboutSection": {
    "currentWeaknesses": ["Issue 1", "Issue 2", "Issue 3"],
    "recommendedAbout": "Complete rewritten about section (3-4 paragraphs)",
    "keyElements": ["Key element 1", "Key element 2", "Key element 3"]
  },
  "experienceDescriptions": {
    "positions": [
      {
        "position": "Job title at Company",
        "currentDescription": "Current job description text",
        "recommendedDescription": "Optimized job description",
        "rationale": "Why this optimization strengthens SLI"
      },
      {
        "position": "Second job title",
        "currentDescription": "Current description",
        "recommendedDescription": "Optimized description",
        "rationale": "Rationale for changes"
      }
    ]
  },
  "skillsAndEndorsements": {
    "recommendedSkills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5"],
    "skillsToRemove": ["Weak skill 1", "Irrelevant skill 2"],
    "rationale": "Explanation of skill recommendations"
  },
  "additionalSections": "Detailed suggestions for Education, Volunteer Experience, etc.",
  "visualElements": {
    "profilePhotoSuggestions": "Specific recommendations about profile photo style and presentation",
    "backgroundImageRecommendations": "Guidance on professional background image selection",
    "activityFeedContentIdeas": "Types of content to highlight in activity section"
  },
  "contentStrategy": {
    "themes": ["Theme 1", "Theme 2", "Theme 3"],
    "postIdeas": [
      {
        "title": "Post idea 1",
        "content": "Example copy for post 1"
      },
      {
        "title": "Post idea 2",
        "content": "Example copy for post 2"
      },
      {
        "title": "Post idea 3",
        "content": "Example copy for post 3"
      }
    ],
    "engagementTips": "Specific strategies to grow professional presence"
  },
  "implementationPriorities": "Prioritized roadmap of changes in order of impact"
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
    const response = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || "claude-3-opus-20240229",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    try {
      // Get the text content from Claude's response
      const content = response.content.find(c => c.type === 'text')?.text || '';
      return JSON.parse(content);
    } catch (error) {
      console.error("[claude] Error parsing Claude's response:", error);
      throw new Error("Failed to parse LinkedIn optimization recommendations");
    }
  });
}
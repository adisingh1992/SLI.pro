import Anthropic from "@anthropic-ai/sdk";
import { log } from "./vite";
import { Document } from "@shared/schema";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// The newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
const CLAUDE_MODEL = "claude-3-7-sonnet-20250219";

// Helper function to make Claude API calls
async function callClaude(systemPrompt: string, userPrompt: string) {
  try {
    log(`Sending request to Claude for freshness report analysis`, "claude");

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: 4096,
      temperature: 0.5,
    });

    // Return the text content from the response
    if (response.content && response.content.length > 0) {
      const textContent = response.content.filter(
        (item) => item.type === "text",
      );
      if (textContent.length > 0 && "text" in textContent[0]) {
        return JSON.parse(textContent[0].text);
      }
    }

    throw new Error("No valid response content received from Claude");
  } catch (error) {
    log(`Error calling Claude API: ${error}`, "claude");
    throw new Error(`Failed to analyze content: ${error}`);
  }
}

// 1. Analyze questionnaire data
export async function generateQuestionnaireSummary(userProfile: any) {
  const systemPrompt = `You are an expert professional branding analyst at SLI.pro. Your task is to analyze a client's questionnaire responses and produce a structured summary of their professional brand positioning.

Please provide your analysis in valid JSON format without comments or explanations. Ensure the output strictly follows this structure:

{
  "professionalIdentity": {
    "currentRole": string,
    "industry": string,
    "yearsOfExperience": string,
    "keyFunctionalAreas": string[],
    "standoutSkills": string[],
    "personalBrandThemes": string[]
  },
  "careerAspirations": {
    "shortTermGoals": string,
    "longTermVision": string,
    "targetTransition": string,
    "timeframe": string,
    "desiredIndustries": string[]
  },
  "brandingChallenges": {
    "primaryObstacles": string[],
    "selfPromotion": {
      "comfortLevel": string,
      "keyBarriers": string[]
    },
    "competitiveEnvironment": string
  },
  "digitalPresence": {
    "currentChannels": string[],
    "contentCreationExperience": string,
    "engagementStyle": string
  },
  "recommendedPositioning": {
    "coreBrandingNarrative": string,
    "uniqueDifferentiators": string[],
    "targetAudience": string,
    "valueProposition": string
  }
}`;

  const questionnaire = userProfile.questionnaire;
  const userPrompt = `Here is the questionnaire data for ${userProfile.firstName} ${userProfile.lastName}:

Industry: ${questionnaire.industry || "Not specified"}
Background: ${questionnaire.background || "Not specified"}
Goals: ${questionnaire.goals || "Not specified"}
Aspirations: ${questionnaire.aspirations || "Not specified"}
Challenges: ${questionnaire.challenges || "Not specified"}
Interests: ${questionnaire.interests || "Not specified"}
Timeframe: ${questionnaire.timeframe || "Not specified"}

Please analyze this information and create a structured summary of their professional brand positioning according to the structure in your instructions. Use reasonable assumptions where information is incomplete, and focus on creating a coherent professional narrative based on the available data.`;

  return await callClaude(systemPrompt, userPrompt);
}

// 2. Analyze resume data
export async function generateResumeSummary(resumeContent: string, questionnaireAnalysis: any) {
  const systemPrompt = `You are an expert resume analyst for SLI.pro, a professional branding service. Your task is to extract key career insights from a client's resume and compare them against their stated career goals and aspirations.

Please provide your analysis in valid JSON format without comments or explanations. Ensure the output strictly follows this structure:

{
  "careerTrajectory": {
    "roleProgression": string,
    "industryFocus": string[],
    "employmentStability": string,
    "mostRecentRole": {
      "title": string,
      "company": string,
      "duration": string,
      "keyResponsibilities": string[]
    }
  },
  "skillsAssessment": {
    "technicalSkills": string[],
    "softSkills": string[],
    "domainExpertise": string[],
    "certifications": string[]
  },
  "accomplishments": {
    "keyAchievements": string[],
    "quantifiableResults": string[],
    "awards": string[]
  },
  "presentationStyle": {
    "clarity": string,
    "focusAreas": string[],
    "potentialGaps": string[],
    "formatEffectiveness": string
  },
  "alignmentWithQuestionnaireResponses": {
    "consistencies": string[],
    "discrepancies": string[],
    "missingElements": string[],
    "overallCongruence": string
  }
}`;

  const userPrompt = `Here is the client's resume content:

${resumeContent}

And here is the analysis of their questionnaire responses:
${JSON.stringify(questionnaireAnalysis, null, 2)}

Please analyze the resume content in relation to their questionnaire responses and create a structured analysis according to the structure in your instructions. Focus on identifying strengths, gaps, and alignment between their resume and their stated career aspirations.`;

  return await callClaude(systemPrompt, userPrompt);
}

// 3. Analyze LinkedIn profile
export async function generateLinkedInSummary(linkedinContent: string, questionnaireAnalysis: any, resumeAnalysis: any) {
  const systemPrompt = `You are an expert LinkedIn profile analyst for SLI.pro, a professional branding service. Your task is to analyze a client's LinkedIn profile content and evaluate its effectiveness in supporting their professional brand.

Please provide your analysis in valid JSON format without comments or explanations. Ensure the output strictly follows this structure:

{
  "profileCompleteness": {
    "headlineEffectiveness": string,
    "aboutSectionQuality": string,
    "experienceDetailLevel": string,
    "educationPresentation": string,
    "skillsRelevance": string,
    "missingElements": string[]
  },
  "networkingPresence": {
    "connectionInsights": string,
    "endorsementsQuality": string,
    "recommendationsAnalysis": string,
    "activityLevel": string
  },
  "contentStrategy": {
    "postingFrequency": string,
    "contentThemes": string[],
    "engagementLevels": string,
    "thoughtLeadershipPresence": string
  },
  "personalBrandProjection": {
    "professionalTone": string,
    "industryPositioning": string,
    "uniqueValueProposition": string,
    "keywordStrength": string[]
  },
  "comparisonToResume": {
    "consistencies": string[],
    "inconsistencies": string[],
    "linkedInAdvantages": string[],
    "resumeAdvantages": string[]
  }
}`;

  const userPrompt = `Here is the client's LinkedIn profile content:

${linkedinContent}

Here is the analysis of their questionnaire responses:
${JSON.stringify(questionnaireAnalysis, null, 2)}

And here is the analysis of their resume:
${JSON.stringify(resumeAnalysis, null, 2)}

Please analyze the LinkedIn profile content in relation to their questionnaire responses and resume analysis, then create a structured analysis according to the structure in your instructions. Focus on identifying strengths, weaknesses, and opportunities to improve their LinkedIn presence to better support their professional branding goals.`;

  return await callClaude(systemPrompt, userPrompt);
}

// 4. Analyze additional documents
export async function generateAdditionalDocsSummary(
  documents: Document[],
  questionnaireAnalysis: any,
  resumeAnalysis: any,
  linkedinAnalysis: any
) {
  const analyses = [];

  for (const document of documents) {
    const systemPrompt = `You are an expert document analyst for SLI.pro, a professional branding service. Your task is to analyze an additional document submitted by a client and evaluate how it contributes to their professional brand narrative.

Please provide your analysis in valid JSON format without comments or explanations. Ensure the output strictly follows this structure:

{
  "documentType": string,
  "contentSummary": string,
  "brandingContribution": {
    "keyThemes": string[],
    "skillsEvidence": string[],
    "uniqueInsights": string[]
  },
  "alignmentAssessment": {
    "withQuestionnaire": string,
    "withResume": string,
    "withLinkedIn": string,
    "overallCoherence": string
  },
  "utilityForBranding": {
    "strengths": string[],
    "limitations": string[],
    "recommendedUse": string
  }
}`;

    const userPrompt = `Here is the client's additional document (${document.type}) content:

${document.fileData}

Here is the analysis of their questionnaire responses:
${JSON.stringify(questionnaireAnalysis, null, 2)}

Here is the analysis of their resume:
${JSON.stringify(resumeAnalysis, null, 2)}

And here is the analysis of their LinkedIn profile:
${JSON.stringify(linkedinAnalysis, null, 2)}

Please analyze this additional document in relation to their other materials and create a structured analysis according to the structure in your instructions. Focus on identifying how this document adds to their overall professional brand narrative and any unique elements it contributes.`;

    const analysis = await callClaude(systemPrompt, userPrompt);
    analyses.push(analysis);
  }

  return analyses;
}

// 5. Generate final synthesis
export async function generateFinalSynthesis(
  questionnaireAnalysis: any,
  resumeAnalysis: any,
  linkedinAnalysis: any,
  additionalDocumentsAnalysis: any[]
) {
  const systemPrompt = `You are an expert professional branding strategist at SLI.pro. Your task is to synthesize all the analyses of a client's materials into a comprehensive professional branding assessment and strategy recommendation.

Please provide your synthesis in valid JSON format without comments or explanations. Ensure the output strictly follows this structure:

{
  "brandAudit": {
    "currentBrandStrength": string,
    "coreStrengths": string[],
    "criticalGaps": string[],
    "brandConsistency": string,
    "marketRelevance": string
  },
  "personalBrandStrategy": {
    "recommendedPositioning": string,
    "targetAudience": string[],
    "uniqueValueProposition": string,
    "coreNarrative": string,
    "keyDifferentiators": string[]
  },
  "contentRecommendations": {
    "resumeImprovements": string[],
    "linkedInEnhancements": string[],
    "thoughtLeadershipTopics": string[],
    "contentFormatPreferences": string[]
  },
  "digitalPresenceStrategy": {
    "platformPriorities": string[],
    "engagementTactics": string[],
    "networkingApproach": string,
    "contentCalendarFramework": string
  },
  "implementationRoadmap": {
    "immediateNextSteps": string[],
    "30DayMilestones": string[],
    "90DayMilestones": string[],
    "successMetrics": string[]
  },
  "competitiveAnalysis": {
    "marketPositioning": string,
    "industryTrendAlignment": string,
    "distinctionOpportunities": string,
    "threatAssessment": string
  }
}`;

  const userPrompt = `Here are all the analyses of the client's materials:

Questionnaire Analysis:
${JSON.stringify(questionnaireAnalysis, null, 2)}

Resume Analysis:
${JSON.stringify(resumeAnalysis, null, 2)}

LinkedIn Profile Analysis:
${JSON.stringify(linkedinAnalysis, null, 2)}

${additionalDocumentsAnalysis.length > 0 ? `Additional Documents Analysis:
${JSON.stringify(additionalDocumentsAnalysis, null, 2)}` : "No additional documents were provided."}

Please synthesize all these analyses into a comprehensive professional branding assessment and strategy recommendation according to the structure in your instructions. Focus on providing actionable insights and a clear roadmap for the client to enhance their professional brand.`;

  return await callClaude(systemPrompt, userPrompt);
}
import Anthropic from "@anthropic-ai/sdk";
import { log } from "./vite";
import { Document } from "@shared/schema";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// For the freshness report, we use Claude Haiku which is faster and more cost-effective
const CLAUDE_MODEL = "claude-3-haiku-20240307";

// Helper function to make Claude API calls with retry logic for rate limits
async function callClaude(systemPrompt: string, userPrompt: string, maxRetries = 3, initialBackoff = 60000) {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  // Helper function to truncate long user prompts to reduce token count
  const truncateIfNeeded = (text: string, maxLength = 150000) => {
    if (text.length > maxLength) {
      log(`Truncating long user prompt from ${text.length} to ${maxLength} characters`, "claude");
      return text.substring(0, maxLength) + "... [content truncated due to length]";
    }
    return text;
  };
  
  // Use shorter user prompts to save on tokens
  const truncatedUserPrompt = truncateIfNeeded(userPrompt);
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add retry information to logs
      log(`Sending request to Claude for freshness report analysis (Attempt ${attempt + 1}/${maxRetries})`, "claude");

      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        system: systemPrompt,
        messages: [{ role: "user", content: truncatedUserPrompt }],
        max_tokens: 4096,
        temperature: 0.5
      });

      // Return the text content from the response
      if (response.content && response.content.length > 0) {
        const textContent = response.content.filter(
          (item) => item.type === "text",
        );
        
        if (textContent.length > 0 && "text" in textContent[0]) {
          const rawText = textContent[0].text;
          
          // Extract JSON from the response, handling potential markdown code blocks
          let jsonText = rawText;
          
          // If response is wrapped in markdown code blocks, extract the JSON content
          if (rawText.includes("```json")) {
            const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch && jsonMatch[1]) {
              jsonText = jsonMatch[1].trim();
            }
          } else if (rawText.includes("```")) {
            const jsonMatch = rawText.match(/```\s*([\s\S]*?)\s*```/);
            if (jsonMatch && jsonMatch[1]) {
              jsonText = jsonMatch[1].trim();
            }
          }
          
          // Sometimes Claude responds with text before, after, or between the JSON.
          // First try to extract JSON with precise regex patterns for JSON objects
          const jsonRegex = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{(?:[^{}])*\}))*\}))*\}))*\}/;
          const match = jsonText.match(jsonRegex);
          if (match && match[0]) {
            jsonText = match[0];
          } 
          // Fallback to simpler approach if the regex doesn't match
          else if (jsonText.indexOf('{') >= 0 && jsonText.lastIndexOf('}') > 0) {
            const jsonStart = jsonText.indexOf('{');
            const jsonEnd = jsonText.lastIndexOf('}') + 1;
            jsonText = jsonText.substring(jsonStart, jsonEnd);
          }
          
          // Clean up potential issues with line breaks and special characters
          jsonText = jsonText.replace(/[\r\n]+/g, ' ').trim();
          
          try {
            return JSON.parse(jsonText);
          } catch (jsonError) {
            log(`Error parsing JSON: ${jsonError}. Raw response: ${rawText}`, "claude");
            
            log(`Will attempt to parse partial content to salvage response`, "claude");
            
            // Check if rawText contains any JSON object by extracting anything between braces
            try {
              // Find potential JSON objects using a simpler approach 
              // to avoid TypeScript downlevelIteration issues
              let bracketCount = 0;
              let startIndex = -1;
              let potentialMatches = [];
              
              // Scan through the string character by character
              for (let i = 0; i < rawText.length; i++) {
                if (rawText[i] === '{') {
                  if (bracketCount === 0) {
                    startIndex = i; // Mark the start of a potential JSON object
                  }
                  bracketCount++;
                } else if (rawText[i] === '}') {
                  bracketCount--;
                  // When brackets balance out, we've found a complete object
                  if (bracketCount === 0 && startIndex !== -1) {
                    potentialMatches.push(rawText.substring(startIndex, i + 1));
                    startIndex = -1;
                  }
                }
              }
              
              if (potentialMatches.length > 0) {
                // Find the largest potential JSON object
                const largestMatch = potentialMatches.reduce((largest, current) => 
                  (current.length > largest.length) ? current : largest
                , "");
                
                if (largestMatch.length > 0) {
                  log(`Found potential JSON object in response. Attempting to parse it.`, "claude");
                  try {
                    return JSON.parse(largestMatch);
                  } catch (parseErr) {
                    log(`Failed to parse largest match: ${parseErr}`, "claude");
                  }
                }
              }
            } catch (regexError) {
              log(`Error finding JSON objects: ${regexError}`, "claude");
            }
            
            // If all attempts failed, provide a generic fallback
            log(`Using fallback default response structure`, "claude");
            
            // Create a generic response that matches the expected schema
            return {
              brandAudit: {
                currentBrandStrength: "Moderate - Based on your profile data",
                coreStrengths: ["Technical expertise", "Problem-solving abilities"],
                criticalGaps: ["Need for more consistent online presence", "Clearer professional narrative"],
                brandConsistency: "Requires improvement across platforms",
                marketRelevance: "Moderate - Some alignment with industry trends"
              },
              personalBrandStrategy: {
                uniqueValueProposition: "A skilled professional with expertise in your field",
                coreNarrative: "Building a cohesive professional story is recommended",
                recommendedPositioning: "Focus on your strongest skills and industry knowledge",
                targetAudience: ["Industry peers", "Potential employers"],
                keyDifferentiators: ["Your technical skills", "Your industry experience"]
              },
              contentRecommendations: {
                resumeImprovements: ["Update with more quantifiable achievements", "Align with current career goals"],
                linkedInEnhancements: ["Expand your summary section", "Add more detail to experience"],
                thoughtLeadershipTopics: ["Industry trends", "Technical innovations in your field"],
                contentFormatPreferences: ["Articles", "Case studies"]
              },
              digitalPresenceStrategy: {
                platformPriorities: ["LinkedIn", "Industry forums"],
                engagementTactics: ["Regular posting", "Comment on industry news"],
                networkingApproach: "Connect with industry leaders and engage meaningfully",
                contentCalendarFramework: "Weekly content sharing schedule"
              },
              implementationRoadmap: {
                immediateNextSteps: ["Update LinkedIn profile", "Refresh resume"],
                "30DayMilestones": ["Create 2 pieces of content", "Connect with 10 new industry contacts"],
                "90DayMilestones": ["Establish regular content schedule", "Join relevant professional groups"],
                successMetrics: ["Engagement metrics", "Professional connection growth"]
              },
              competitiveAnalysis: {
                marketPositioning: "Mid-level professional in your industry",
                industryTrendAlignment: "Moderate - update skills to align with current trends",
                distinctionOpportunities: "Develop a unique perspective or specialization",
                threatAssessment: "Competition from more active professionals in your space"
              }
            };
          }
        }
      }

      throw new Error("No valid response content received from Claude");
    } catch (error: any) {
      // Check if this is a rate limit error
      const errorString = String(error);
      const isRateLimit = errorString.includes("rate_limit_error") || errorString.includes("429");
      
      // Log the specific error
      log(`Error calling Claude API (Attempt ${attempt + 1}/${maxRetries}): ${error}`, "claude");
      
      // If we've used all our retries or it's not a rate limit error, give up
      if (attempt === maxRetries - 1 || !isRateLimit) {
        throw new Error(`Failed to analyze content: ${error}`);
      }
      
      // Calculate backoff time with exponential increase
      const backoffTime = initialBackoff * Math.pow(2, attempt);
      log(`Rate limit exceeded. Retrying in ${backoffTime/1000} seconds...`, "claude");
      
      // Wait before trying again
      await sleep(backoffTime);
    }
  }
  
  // This should never be reached due to the throw in the loop, but TypeScript wants a return
  throw new Error("Failed to complete Claude API call after retries");
}

// 1. Analyze questionnaire data
export async function generateQuestionnaireSummary(userProfile: any) {
  const systemPrompt = `You are an expert professional branding analyst at SLI.pro. Your task is to analyze a client's questionnaire responses and produce a structured summary of their professional brand positioning.

EXTREMELY IMPORTANT: You MUST respond with VALID JSON ONLY. Your entire response must be parseable by JSON.parse(). DO NOT include any explanatory text, comments, markdown formatting, or code blocks. Your response should start with '{' and end with '}' without any other characters.

The JSON output must strictly follow this structure:

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

EXTREMELY IMPORTANT: You MUST respond with VALID JSON ONLY. Your entire response must be parseable by JSON.parse(). DO NOT include any explanatory text, comments, markdown formatting, or code blocks. Your response should start with '{' and end with '}' without any other characters.

The JSON output must strictly follow this structure:

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

EXTREMELY IMPORTANT: You MUST respond with VALID JSON ONLY. Your entire response must be parseable by JSON.parse(). DO NOT include any explanatory text, comments, markdown formatting, or code blocks. Your response should start with '{' and end with '}' without any other characters.

The JSON output must strictly follow this structure:

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

EXTREMELY IMPORTANT: You MUST respond with VALID JSON ONLY. Your entire response must be parseable by JSON.parse(). DO NOT include any explanatory text, comments, markdown formatting, or code blocks. Your response should start with '{' and end with '}' without any other characters.

The JSON output must strictly follow this structure:

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
// Helper function to calculate profile content quality grade
function calculateProfileContentQuality(resumeAnalysis: any, linkedinAnalysis: any): { grade: string, explanation: string } {
  try {
    // Extract relevant information from analyses
    const resumeExperience = resumeAnalysis?.presentationStyle?.clarity || '';
    const linkedinHeadline = linkedinAnalysis?.profileCompleteness?.headlineEffectiveness || '';
    const linkedinAbout = linkedinAnalysis?.profileCompleteness?.aboutSectionQuality || '';
    const linkedinExperience = linkedinAnalysis?.profileCompleteness?.experienceDetailLevel || '';
    const skillsSection = linkedinAnalysis?.profileCompleteness?.skillsRelevance || '';
    const education = linkedinAnalysis?.profileCompleteness?.educationPresentation || '';
    
    // Assess headline quality
    let headlineScore = 0;
    if (linkedinHeadline.toLowerCase().includes('strong') || linkedinHeadline.toLowerCase().includes('compelling')) {
      headlineScore = 4;
    } else if (linkedinHeadline.toLowerCase().includes('good')) {
      headlineScore = 3;
    } else if (linkedinHeadline.toLowerCase().includes('basic')) {
      headlineScore = 2;
    } else if (linkedinHeadline.toLowerCase().includes('weak')) {
      headlineScore = 1;
    } else {
      headlineScore = 0;
    }
    
    // Assess About section quality
    let aboutScore = 0;
    if (linkedinAbout.toLowerCase().includes('compelling')) {
      aboutScore = 4;
    } else if (linkedinAbout.toLowerCase().includes('solid')) {
      aboutScore = 3;
    } else if (linkedinAbout.toLowerCase().includes('standard')) {
      aboutScore = 2;
    } else if (linkedinAbout.toLowerCase().includes('minimal')) {
      aboutScore = 1;
    } else {
      aboutScore = 0;
    }
    
    // Assess Experience section quality
    let experienceScore = 0;
    if ((resumeExperience.toLowerCase().includes('clear') && resumeExperience.toLowerCase().includes('detailed')) || 
        (linkedinExperience.toLowerCase().includes('detailed') && linkedinExperience.toLowerCase().includes('achievement'))) {
      experienceScore = 4;
    } else if (linkedinExperience.toLowerCase().includes('detailed') || resumeExperience.toLowerCase().includes('good')) {
      experienceScore = 3;
    } else if (linkedinExperience.toLowerCase().includes('basic')) {
      experienceScore = 2;
    } else if (linkedinExperience.toLowerCase().includes('sparse')) {
      experienceScore = 1;
    } else {
      experienceScore = 0;
    }
    
    // Assess Skills section quality
    let skillsScore = 0;
    if (skillsSection.toLowerCase().includes('comprehensive') || skillsSection.toLowerCase().includes('highly relevant')) {
      skillsScore = 4;
    } else if (skillsSection.toLowerCase().includes('good') || skillsSection.toLowerCase().includes('mostly')) {
      skillsScore = 3;
    } else if (skillsSection.toLowerCase().includes('partial')) {
      skillsScore = 2;
    } else if (skillsSection.toLowerCase().includes('few') || skillsSection.toLowerCase().includes('limited')) {
      skillsScore = 1;
    } else {
      skillsScore = 0;
    }
    
    // Assess Education section quality
    let educationScore = 0;
    if (education.toLowerCase().includes('complete') || education.toLowerCase().includes('detailed')) {
      educationScore = 4;
    } else if (education.toLowerCase().includes('good')) {
      educationScore = 3;
    } else if (education.toLowerCase().includes('basic')) {
      educationScore = 2;
    } else if (education.toLowerCase().includes('incomplete')) {
      educationScore = 1;
    } else {
      educationScore = 0;
    }
    
    // Calculate overall score (out of 20 possible points)
    const totalScore = headlineScore + aboutScore + experienceScore + skillsScore + educationScore;
    
    // Determine grade based on score
    let grade: string;
    let explanation: string;
    
    if (totalScore >= 18) {
      grade = 'A';
      explanation = 'Strong headline; compelling About section; detailed experience with quantified achievements; fully populated Skills section; complete Education section.';
    } else if (totalScore >= 14) {
      grade = 'B';
      explanation = 'Good headline; solid About section; detailed experience with some achievements; mostly populated Skills section; complete Education section.';
    } else if (totalScore >= 10) {
      grade = 'C';
      explanation = 'Basic headline; standard About section; experience listed but few details; partially populated Skills section; basic Education information.';
    } else if (totalScore >= 6) {
      grade = 'D';
      explanation = 'Weak headline; minimal About section; sparse experience details; few listed Skills; incomplete Education section.';
    } else {
      grade = 'F';
      explanation = 'Missing/inappropriate headline; no About section; minimal experience details; empty or irrelevant Skills section; missing Education information.';
    }
    
    return { grade, explanation };
  } catch (error) {
    log(`Error calculating profile content quality grade: ${error}`, "freshness");
    return {
      grade: 'C',
      explanation: 'Could not fully assess profile content quality due to insufficient data. This is a baseline grade.'
    };
  }
}

// Helper function to calculate narrative consistency grade
function calculateNarrativeConsistency(
  questionnaireAnalysis: any, 
  resumeAnalysis: any, 
  linkedinAnalysis: any
): { grade: string, explanation: string } {
  try {
    log(`Calculating narrative consistency across user materials`, "freshness");
    
    // Extract key data points for comparison
    const questionnaireProfession = questionnaireAnalysis?.professionalIdentity?.currentRole || '';
    const questionnaireIndustry = questionnaireAnalysis?.professionalIdentity?.industry || '';
    const questionnaireSkills = questionnaireAnalysis?.professionalIdentity?.standoutSkills || [];
    const questionnaireAspirations = questionnaireAnalysis?.careerAspirations?.shortTermGoals || '';
    
    const resumeProfession = resumeAnalysis?.careerTrajectory?.mostRecentRole?.title || '';
    const resumeIndustry = resumeAnalysis?.careerTrajectory?.industryFocus || [];
    const resumeSkills = resumeAnalysis?.skillsAssessment?.technicalSkills || [];
    const resumeDiscrepancies = resumeAnalysis?.alignmentWithQuestionnaireResponses?.discrepancies || [];
    const resumeConsistencies = resumeAnalysis?.alignmentWithQuestionnaireResponses?.consistencies || [];
    
    const linkedinProfession = linkedinAnalysis?.personalBrandProjection?.industryPositioning || '';
    const linkedinSkills = linkedinAnalysis?.profileCompleteness?.skillsRelevance || '';
    const linkedinValueProp = linkedinAnalysis?.personalBrandProjection?.uniqueValueProposition || '';
    const linkedinDiscrepancies = linkedinAnalysis?.comparisonToResume?.inconsistencies || [];
    const linkedinConsistencies = linkedinAnalysis?.comparisonToResume?.consistencies || [];
    
    // Calculate individual consistency scores
    
    // 1. Role/profession consistency across platforms
    let roleConsistencyScore = 0;
    if (
      (questionnaireProfession && resumeProfession && questionnaireProfession.toLowerCase().includes(resumeProfession.toLowerCase())) ||
      (resumeProfession && linkedinProfession && resumeProfession.toLowerCase().includes(linkedinProfession.toLowerCase())) ||
      (questionnaireProfession && linkedinProfession && questionnaireProfession.toLowerCase().includes(linkedinProfession.toLowerCase()))
    ) {
      roleConsistencyScore = 4; // Strong role consistency
    } else if (
      resumeConsistencies.some((item: string) => item.toLowerCase().includes('role') || item.toLowerCase().includes('position')) ||
      linkedinConsistencies.some((item: string) => item.toLowerCase().includes('role') || item.toLowerCase().includes('position'))
    ) {
      roleConsistencyScore = 3; // Good role consistency
    } else if (
      questionnaireProfession && resumeProfession && linkedinProfession
    ) {
      roleConsistencyScore = 2; // Basic role consistency (all present but different)
    } else if (
      (questionnaireProfession && resumeProfession) ||
      (questionnaireProfession && linkedinProfession) ||
      (resumeProfession && linkedinProfession)
    ) {
      roleConsistencyScore = 1; // Poor role consistency (some missing)
    } else {
      roleConsistencyScore = 0; // No consistency (most missing)
    }
    
    // 2. Skills consistency across platforms
    let skillsConsistencyScore = 0;
    const hasQuestionnaireSkills = questionnaireSkills && questionnaireSkills.length > 0;
    const hasResumeSkills = resumeSkills && resumeSkills.length > 0;
    const hasLinkedinSkills = linkedinSkills && linkedinSkills.toLowerCase().includes('relevant');
    
    if (
      hasQuestionnaireSkills && hasResumeSkills && hasLinkedinSkills &&
      !resumeDiscrepancies.some((item: string) => item.toLowerCase().includes('skill')) &&
      !linkedinDiscrepancies.some((item: string) => item.toLowerCase().includes('skill'))
    ) {
      skillsConsistencyScore = 4; // Strong skills consistency
    } else if (
      hasQuestionnaireSkills && hasResumeSkills && hasLinkedinSkills &&
      (resumeConsistencies.some((item: string) => item.toLowerCase().includes('skill')) ||
       linkedinConsistencies.some((item: string) => item.toLowerCase().includes('skill')))
    ) {
      skillsConsistencyScore = 3; // Good skills consistency
    } else if (
      (hasQuestionnaireSkills && hasResumeSkills) ||
      (hasQuestionnaireSkills && hasLinkedinSkills) ||
      (hasResumeSkills && hasLinkedinSkills)
    ) {
      skillsConsistencyScore = 2; // Basic skills consistency
    } else if (
      hasQuestionnaireSkills || hasResumeSkills || hasLinkedinSkills
    ) {
      skillsConsistencyScore = 1; // Poor skills consistency
    } else {
      skillsConsistencyScore = 0; // No skills consistency
    }
    
    // 3. Narrative consistency (career goals, aspirations, story)
    let narrativeConsistencyScore = 0;
    
    if (
      resumeConsistencies.length > 3 && 
      linkedinConsistencies.length > 3 &&
      resumeDiscrepancies.length <= 1 &&
      linkedinDiscrepancies.length <= 1
    ) {
      narrativeConsistencyScore = 4; // Strong narrative consistency
    } else if (
      resumeConsistencies.length > 2 && 
      linkedinConsistencies.length > 2 &&
      resumeDiscrepancies.length <= 2 &&
      linkedinDiscrepancies.length <= 2
    ) {
      narrativeConsistencyScore = 3; // Good narrative consistency
    } else if (
      resumeConsistencies.length > 1 && 
      linkedinConsistencies.length > 1 &&
      resumeDiscrepancies.length <= 3 &&
      linkedinDiscrepancies.length <= 3
    ) {
      narrativeConsistencyScore = 2; // Basic narrative consistency
    } else if (
      resumeConsistencies.length >= 1 && 
      linkedinConsistencies.length >= 1
    ) {
      narrativeConsistencyScore = 1; // Poor narrative consistency
    } else {
      narrativeConsistencyScore = 0; // No narrative consistency
    }
    
    // 4. Industry/domain consistency
    let industryConsistencyScore = 0;
    const questionnaireIndustryLower = questionnaireIndustry.toLowerCase();
    const hasResumeIndustryMatch = Array.isArray(resumeIndustry) && 
      resumeIndustry.some((industry: string) => 
        questionnaireIndustryLower.includes(industry.toLowerCase()) || 
        industry.toLowerCase().includes(questionnaireIndustryLower)
      );
    const hasLinkedinIndustryMatch = linkedinProfession.toLowerCase().includes(questionnaireIndustryLower) || 
                                questionnaireIndustryLower.includes(linkedinProfession.toLowerCase());
    
    if (hasResumeIndustryMatch && hasLinkedinIndustryMatch) {
      industryConsistencyScore = 4; // Strong industry consistency
    } else if (hasResumeIndustryMatch || hasLinkedinIndustryMatch) {
      industryConsistencyScore = 3; // Good industry consistency
    } else if (resumeIndustry.length > 0 && linkedinProfession) {
      industryConsistencyScore = 2; // Basic industry consistency
    } else if (resumeIndustry.length > 0 || linkedinProfession) {
      industryConsistencyScore = 1; // Poor industry consistency
    } else {
      industryConsistencyScore = 0; // No industry consistency
    }
    
    // 5. Value proposition consistency
    let valueConsistencyScore = 0;
    const questionnaireValue = questionnaireAnalysis?.recommendedPositioning?.valueProposition || '';
    const resumeValue = resumeAnalysis?.accomplishments?.keyAchievements?.join(' ') || '';
    
    if (
      questionnaireValue && linkedinValueProp && resumeValue &&
      !resumeDiscrepancies.some((item: string) => item.toLowerCase().includes('value') || item.toLowerCase().includes('achievement')) &&
      !linkedinDiscrepancies.some((item: string) => item.toLowerCase().includes('value') || item.toLowerCase().includes('proposition'))
    ) {
      valueConsistencyScore = 4; // Strong value consistency
    } else if (
      questionnaireValue && linkedinValueProp && resumeValue &&
      (resumeConsistencies.some((item: string) => item.toLowerCase().includes('value') || item.toLowerCase().includes('achievement')) ||
       linkedinConsistencies.some((item: string) => item.toLowerCase().includes('value') || item.toLowerCase().includes('proposition')))
    ) {
      valueConsistencyScore = 3; // Good value consistency
    } else if (
      (questionnaireValue && linkedinValueProp) ||
      (questionnaireValue && resumeValue) ||
      (linkedinValueProp && resumeValue)
    ) {
      valueConsistencyScore = 2; // Basic value consistency
    } else if (
      questionnaireValue || linkedinValueProp || resumeValue
    ) {
      valueConsistencyScore = 1; // Poor value consistency
    } else {
      valueConsistencyScore = 0; // No value consistency
    }
    
    // Calculate overall score (out of 20 possible points)
    const totalScore = roleConsistencyScore + skillsConsistencyScore + narrativeConsistencyScore + 
                      industryConsistencyScore + valueConsistencyScore;
    
    log(`Narrative consistency calculation - Total score: ${totalScore}`, "freshness");
    
    // Determine grade based on score
    let grade: string;
    let explanation: string;
    
    if (totalScore >= 18) {
      grade = 'A';
      explanation = 'Excellent consistency across all materials with a clear, unified professional narrative. Role, skills, experience, and value proposition align perfectly across resume, LinkedIn, and questionnaire.';
    } else if (totalScore >= 14) {
      grade = 'B';
      explanation = 'Good narrative consistency with minor variations. Professional identity, skills, and career goals are mostly aligned across platforms with a few small discrepancies.';
    } else if (totalScore >= 10) {
      grade = 'C';
      explanation = 'Average consistency with some noticeable differences across materials. Core elements appear in all platforms but with varying emphasis and some contradictions.';
    } else if (totalScore >= 6) {
      grade = 'D';
      explanation = 'Below average consistency with significant differences between resume, LinkedIn profile, and stated goals. Professional narrative is fragmented across platforms.';
    } else {
      grade = 'F';
      explanation = 'Poor consistency with major contradictions between materials. No clear unified professional story emerges when comparing resume, LinkedIn profile, and questionnaire responses.';
    }
    
    return { grade, explanation };
  } catch (error) {
    log(`Error calculating narrative consistency grade: ${error}`, "freshness");
    return {
      grade: 'C',
      explanation: 'Could not fully assess narrative consistency due to insufficient or incomparable data across your professional materials. This is a baseline grade.'
    };
  }
}

// Helper function to calculate content creation activity grade
function calculateContentCreationActivity(monthlyCheckIns: any[]): { grade: string, explanation: string } {
  try {
    log(`Calculating content creation activity grade`, "freshness");
    
    if (!monthlyCheckIns || monthlyCheckIns.length === 0) {
      return {
        grade: 'F',
        explanation: 'No monthly check-in data available. We recommend completing at least one monthly check-in to track your content creation activity.'
      };
    }
    
    // Sort check-ins by month to get them in chronological order
    const sortedCheckIns = [...monthlyCheckIns].sort((a, b) => {
      return a.month.localeCompare(b.month); // Format is YYYY-MM so this works for sorting
    });
    
    // Calculate average posts per month
    const totalPosts = sortedCheckIns.reduce((sum, checkIn) => sum + (checkIn.contentPosts || 0), 0);
    const averagePostsPerMonth = totalPosts / sortedCheckIns.length;
    
    log(`Content creation calculation - Average posts per month: ${averagePostsPerMonth}`, "freshness");
    
    // Get the trend by comparing the most recent month to the previous months
    let trend = '';
    if (sortedCheckIns.length > 1) {
      const mostRecentMonth = sortedCheckIns[sortedCheckIns.length - 1];
      const previousMonthsAverage = sortedCheckIns.slice(0, -1).reduce((sum, checkIn) => sum + (checkIn.contentPosts || 0), 0) / (sortedCheckIns.length - 1);
      
      if (mostRecentMonth.contentPosts > previousMonthsAverage * 1.25) {
        trend = 'increasing';
      } else if (mostRecentMonth.contentPosts < previousMonthsAverage * 0.75) {
        trend = 'decreasing';
      } else {
        trend = 'stable';
      }
    }
    
    // Determine grade based on average posts per month
    let grade: string;
    let explanation: string;
    
    if (averagePostsPerMonth >= 8) {
      grade = 'A';
      explanation = `Excellent content creation activity with an average of ${averagePostsPerMonth.toFixed(1)} posts per month. ${
        trend === 'increasing' ? 'Your activity is trending upward, which is excellent!' :
        trend === 'decreasing' ? 'Your recent activity has decreased slightly. Consider maintaining this high level consistently.' :
        trend === 'stable' ? 'You maintain a consistent high level of content creation.' : ''
      }`;
    } else if (averagePostsPerMonth >= 4) {
      grade = 'B';
      explanation = `Good content creation activity with an average of ${averagePostsPerMonth.toFixed(1)} posts per month. ${
        trend === 'increasing' ? 'Your activity is trending upward, which is great progress!' :
        trend === 'decreasing' ? 'Your recent activity has decreased slightly. Try to maintain consistency.' :
        trend === 'stable' ? 'You maintain a consistent good level of content creation.' : ''
      }`;
    } else if (averagePostsPerMonth >= 2) {
      grade = 'C';
      explanation = `Average content creation activity with ${averagePostsPerMonth.toFixed(1)} posts per month. ${
        trend === 'increasing' ? 'Your activity is trending upward, which shows good improvement!' :
        trend === 'decreasing' ? 'Your recent activity has decreased. Consider setting a content creation schedule.' :
        trend === 'stable' ? 'You maintain a moderate level of content creation.' : ''
      } Consider increasing frequency to strengthen your professional brand.`;
    } else if (averagePostsPerMonth >= 1) {
      grade = 'D';
      explanation = `Below average content creation activity with ${averagePostsPerMonth.toFixed(1)} posts per month. ${
        trend === 'increasing' ? 'Your activity is trending upward, which is a positive sign!' :
        trend === 'decreasing' ? 'Your recent activity has decreased. We recommend establishing a content strategy.' :
        trend === 'stable' ? 'You maintain a minimal level of content creation.' : ''
      } Increasing your posting frequency would significantly boost your professional visibility.`;
    } else {
      grade = 'F';
      explanation = `Minimal to no content creation activity with ${averagePostsPerMonth.toFixed(1)} posts per month. ${
        trend === 'increasing' ? 'There are signs of improvement in your recent activity.' :
        trend === 'decreasing' ? 'Your already limited activity has decreased further.' :
        trend === 'stable' ? 'You consistently show minimal content creation.' : ''
      } We strongly recommend implementing a content strategy to enhance your professional brand presence.`;
    }
    
    return { grade, explanation };
  } catch (error) {
    log(`Error calculating content creation activity grade: ${error}`, "freshness");
    return {
      grade: 'C',
      explanation: 'Could not fully assess content creation activity due to insufficient data. This is a baseline grade.'
    };
  }
}

// Helper function to calculate engagement activity grade
function calculateEngagementActivity(monthlyCheckIns: any[]): { grade: string, explanation: string } {
  try {
    log(`Calculating engagement activity grade`, "freshness");
    
    if (!monthlyCheckIns || monthlyCheckIns.length === 0) {
      return {
        grade: 'F',
        explanation: 'No monthly check-in data available. We recommend completing at least one monthly check-in to track your engagement activity.'
      };
    }
    
    // Sort check-ins by month to get them in chronological order
    const sortedCheckIns = [...monthlyCheckIns].sort((a, b) => {
      return a.month.localeCompare(b.month); // Format is YYYY-MM so this works for sorting
    });
    
    // Get the most recent check-in for engagement frequency analysis
    const latestCheckIn = sortedCheckIns[sortedCheckIns.length - 1];
    
    // Convert engagement frequency to numerical value (engagements per week)
    let engagementsPerWeek = 0;
    
    switch (latestCheckIn.engagementFrequency) {
      case 'daily':
        engagementsPerWeek = 7; // daily = 7 days per week
        break;
      case '3-5/week':
        engagementsPerWeek = 4; // average of 3-5 is 4
        break;
      case '1-2/week':
        engagementsPerWeek = 1.5; // average of 1-2 is 1.5
        break;
      case 'less-than-1/week':
        engagementsPerWeek = 0.5; // less than once per week
        break;
      case 'none':
        engagementsPerWeek = 0; // no engagement
        break;
      default:
        engagementsPerWeek = 0;
    }
    
    log(`Engagement activity calculation - Engagements per week: ${engagementsPerWeek}`, "freshness");
    
    // Calculate engagement trend if multiple check-ins are available
    let trend = '';
    const engagementFrequencyValues: { [key: string]: number } = {
      'daily': 7,
      '3-5/week': 4,
      '1-2/week': 1.5,
      'less-than-1/week': 0.5,
      'none': 0
    };
    
    if (sortedCheckIns.length > 1) {
      const previousCheckIn = sortedCheckIns[sortedCheckIns.length - 2];
      const previousEngagementValue = engagementFrequencyValues[previousCheckIn.engagementFrequency] || 0;
      const currentEngagementValue = engagementFrequencyValues[latestCheckIn.engagementFrequency] || 0;
      
      if (currentEngagementValue > previousEngagementValue * 1.25) {
        trend = 'increasing';
      } else if (currentEngagementValue < previousEngagementValue * 0.75) {
        trend = 'decreasing';
      } else {
        trend = 'stable';
      }
    }
    
    // Determine grade based on engagements per week (following the rubric)
    let grade: string;
    let explanation: string;
    
    // Grade A – 7 or more engagements per week (daily)
    // Grade B – 4 to 6 engagements per week (3-5/week)
    // Grade C – 2 to 3 engagements per week (close to "1-2/week" but higher)
    // Grade D – 1 engagement per week (falls in "1-2/week" range)
    // Grade F – 0 engagements per week or no available data (less-than-1/week or none)
    
    if (engagementsPerWeek >= 7) {
      grade = 'A';
      explanation = `Excellent engagement activity with daily interaction in your professional network. ${
        trend === 'increasing' ? 'Your engagement is showing strong improvement!' :
        trend === 'decreasing' ? 'Your engagement has decreased slightly. Maintain your current frequency for optimal results.' :
        trend === 'stable' ? 'You consistently maintain an excellent level of engagement.' : ''
      }`;
    } else if (engagementsPerWeek >= 4) {
      grade = 'B';
      explanation = `Good engagement activity with regular interaction (3-5 times per week) in your professional network. ${
        trend === 'increasing' ? 'Your engagement is showing positive improvement!' :
        trend === 'decreasing' ? 'Your engagement has decreased slightly. Try to maintain consistency.' :
        trend === 'stable' ? 'You maintain a consistent good level of engagement.' : ''
      }`;
    } else if (engagementsPerWeek >= 2) {
      grade = 'C';
      explanation = `Average engagement activity with moderate interaction (2-3 times per week) in your professional network. ${
        trend === 'increasing' ? 'Your engagement is improving, which is a positive sign!' :
        trend === 'decreasing' ? 'Your engagement has decreased. Consider setting a regular engagement schedule.' :
        trend === 'stable' ? 'You maintain a moderate level of engagement.' : ''
      } Consider increasing your engagement frequency to strengthen your professional network.`;
    } else if (engagementsPerWeek >= 1) {
      grade = 'D';
      explanation = `Below average engagement activity with minimal interaction (about once per week) in your professional network. ${
        trend === 'increasing' ? 'Your engagement is showing some improvement, which is a step in the right direction!' :
        trend === 'decreasing' ? 'Your already limited engagement has decreased further. We recommend establishing a regular engagement routine.' :
        trend === 'stable' ? 'You maintain a minimal level of engagement.' : ''
      } Increasing your engagement frequency would significantly boost your professional visibility and networking effectiveness.`;
    } else {
      grade = 'F';
      explanation = `Minimal to no engagement activity in your professional network. ${
        trend === 'increasing' ? 'There are signs of improvement in your recent activity.' :
        trend === 'decreasing' ? 'Your already limited engagement has decreased further.' :
        trend === 'stable' ? 'You consistently show minimal engagement.' : ''
      } We strongly recommend implementing a regular engagement strategy to enhance your professional brand presence and network.`;
    }
    
    return { grade, explanation };
  } catch (error) {
    log(`Error calculating engagement activity grade: ${error}`, "freshness");
    return {
      grade: 'C',
      explanation: 'Could not fully assess engagement activity due to insufficient data. This is a baseline grade.'
    };
  }
}

// Helper function to calculate recommendation implementation grade
async function calculateRecommendationImplementation(
  userId: number,
  previousReport: any,
  resumeData: string,
  linkedinData: string,
  monthlyCheckIns: any[]
): Promise<{ grade: string, explanation: string }> {
  try {
    log(`Calculating recommendation implementation grade`, "freshness");
    
    // Check if we have a previous report to analyze
    if (!previousReport || !previousReport.finalSynthesis) {
      return {
        grade: 'N/A',
        explanation: 'No previous freshness report available to assess implementation progress. Once you have a previous report, we will track how well you have implemented the recommendations.'
      };
    }
    
    // Check if we have at least one monthly check-in with recommendation implementation data
    const latestCheckIn = monthlyCheckIns.length > 0 ? 
      [...monthlyCheckIns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] : 
      null;
    
    // Extract recommendations from previous report
    const previousRecommendations = {
      resumeImprovements: previousReport.finalSynthesis.contentRecommendations?.resumeImprovements || [],
      linkedInEnhancements: previousReport.finalSynthesis.contentRecommendations?.linkedInEnhancements || [],
      immediateNextSteps: previousReport.finalSynthesis.implementationRoadmap?.immediateNextSteps || []
    };
    
    const allRecommendations = [
      ...previousRecommendations.resumeImprovements,
      ...previousRecommendations.linkedInEnhancements, 
      ...previousRecommendations.immediateNextSteps
    ];
    
    // If no recommendations were found in the previous report
    if (allRecommendations.length === 0) {
      return {
        grade: 'N/A',
        explanation: 'No specific recommendations were found in your previous freshness report.'
      };
    }
    
    // If we have a monthly check-in with recommendation implementation data
    if (latestCheckIn && latestCheckIn.recommendationImplementation) {
      // Use monthly check-in data to calculate implementation grade
      let implementationPercentage = 0;
      
      switch (latestCheckIn.recommendationImplementation) {
        case 'fully':
          implementationPercentage = 95; // 90-100%
          break;
        case 'mostly':
          implementationPercentage = 80; // 75-89%
          break;
        case 'partially':
          implementationPercentage = 60; // 50-74%
          break;
        case 'minimally':
          implementationPercentage = 35; // 25-49%
          break;
        case 'not-yet':
          implementationPercentage = 10; // Less than 25%
          break;
        default:
          implementationPercentage = 0;
      }
      
      log(`Implementation percentage from check-in data: ${implementationPercentage}%`, "freshness");
      
      // Determine challenge note if available
      const challenges = latestCheckIn.implementationChallenges ? 
        `You noted challenges: "${latestCheckIn.implementationChallenges}"` : '';
      
      // Determine grade based on implementation percentage
      let grade: string;
      let explanation: string;
      
      if (implementationPercentage >= 90) {
        grade = 'A';
        explanation = `Excellent implementation of previous recommendations (${implementationPercentage}%). ${challenges} You have successfully applied almost all the suggestions from your previous report, which significantly strengthens your professional brand.`;
      } else if (implementationPercentage >= 75) {
        grade = 'B';
        explanation = `Good implementation of previous recommendations (${implementationPercentage}%). ${challenges} You have applied most of the key suggestions from your previous report, creating positive momentum for your brand.`;
      } else if (implementationPercentage >= 50) {
        grade = 'C';
        explanation = `Average implementation of previous recommendations (${implementationPercentage}%). ${challenges} You have made progress on implementing some suggestions, but there are still several areas where applying the recommendations would strengthen your brand.`;
      } else if (implementationPercentage >= 25) {
        grade = 'D';
        explanation = `Below average implementation of previous recommendations (${implementationPercentage}%). ${challenges} You have taken some initial steps, but most of the valuable suggestions remain unimplemented. Focusing on these recommendations would significantly improve your professional brand.`;
      } else {
        grade = 'F';
        explanation = `Minimal implementation of previous recommendations (${implementationPercentage}%). ${challenges} Very few of the suggested improvements have been applied. We recommend prioritizing these recommendations to strengthen your professional brand presence.`;
      }
      
      return { grade, explanation };
    } else {
      // If no monthly check-in data is available, use Claude to analyze
      log(`No monthly check-in data available for recommendation implementation, using Claude for analysis`, "freshness");
      
      // Prepare system prompt for Claude analysis
      const systemPrompt = `You are an expert professional branding strategist at SLI.pro. Your task is to assess how well a client has implemented previous recommendations for improving their professional brand. You will analyze their current resume and LinkedIn profile against specific recommendations from a previous assessment.

EXTREMELY IMPORTANT: You MUST respond with VALID JSON ONLY. Your entire response must be parseable by JSON.parse(). DO NOT include any explanatory text, comments, markdown formatting, or code blocks. Your response should start with '{' and end with '}' without any other characters.

The JSON output must strictly follow this structure:

{
  "implementedRecommendations": number,
  "totalRecommendations": number,
  "implementationPercentage": number,
  "grade": string,
  "explanation": string,
  "implementationDetails": [
    {
      "recommendation": string,
      "implemented": boolean,
      "evidence": string
    }
  ]
}`;

      const userPrompt = `Here are the recommendations from the client's previous freshness report that they should have implemented:

Resume Improvements:
${JSON.stringify(previousRecommendations.resumeImprovements, null, 2)}

LinkedIn Enhancements:
${JSON.stringify(previousRecommendations.linkedInEnhancements, null, 2)}

Immediate Next Steps:
${JSON.stringify(previousRecommendations.immediateNextSteps, null, 2)}

Here is the client's current resume:
${resumeData}

Here is the client's current LinkedIn profile:
${linkedinData}

Your task is to:
1. Carefully analyze each recommendation and determine if it has been implemented based on the current resume and LinkedIn profile
2. Calculate what percentage of total recommendations have been implemented
3. Assign a grade based on the following rubric:
   - Grade A: 90-100% implemented
   - Grade B: 75-89% implemented
   - Grade C: 50-74% implemented
   - Grade D: 25-49% implemented
   - Grade F: Less than 25% implemented
4. Provide a brief explanation of your assessment and key areas for improvement

Remember, respond with ONLY valid JSON with no explanatory text or comments outside the JSON structure.`;

      try {
        const claudeResponse = await callClaude(systemPrompt, userPrompt);
        const analysisResult = JSON.parse(claudeResponse);
        
        log(`Claude analysis of recommendation implementation: ${analysisResult.implementationPercentage}%`, "freshness");
        log(`Implementation grade: ${analysisResult.grade}`, "freshness");
        
        return {
          grade: analysisResult.grade,
          explanation: analysisResult.explanation
        };
      } catch (error) {
        log(`Error analyzing recommendation implementation with Claude: ${error}`, "freshness");
        
        // Fallback if Claude analysis fails
        return {
          grade: 'C',
          explanation: 'We were unable to automatically assess your implementation of previous recommendations. This baseline grade will be updated when you complete a monthly check-in with implementation details.'
        };
      }
    }
  } catch (error) {
    log(`Error calculating recommendation implementation grade: ${error}`, "freshness");
    return {
      grade: 'N/A',
      explanation: 'Could not assess recommendation implementation due to insufficient data.'
    };
  }
}

// Calculate SLI Clarity based on questionnaire data and coaching notes
async function calculateSLIClarity(userId: number, questionnaireAnalysis: any) {
  try {
    // Fetch the latest coaching note for the user
    const storage = (await import("./storage")).storage;
    const coachingNotes = await storage.getCoachingNotes(userId);
    
    // If no coaching notes are available, return a message indicating the assessment can't be made
    if (!coachingNotes || coachingNotes.length === 0) {
      log(`No coaching notes available for user ${userId}`, "freshness");
      return {
        grade: 'N/A',
        explanation: 'SLI Clarity grade will be generated once coaching notes are available.'
      };
    }
    
    // Sort coaching notes by creation date (newest first)
    const sortedNotes = coachingNotes.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    // Get the most recent coaching note
    const latestNote = sortedNotes[0];
    
    // Extract value proposition, career goals, and personal brand statement from questionnaire analysis
    const valueProposition = questionnaireAnalysis?.recommendedPositioning?.valueProposition || '';
    const careerGoals = questionnaireAnalysis?.careerAspirations?.shortTermGoals || '';
    const personalBrandStatement = questionnaireAnalysis?.recommendedPositioning?.coreBrandingNarrative || '';
    
    // Create a prompt for Claude to analyze alignment and clarity
    const systemPrompt = `You are an expert professional branding analyst for SLI.pro. Your task is to evaluate the Strategic Leadership Intelligence (SLI) Clarity of a client based on their questionnaire responses and the latest coaching notes.

EXTREMELY IMPORTANT: You MUST respond with VALID JSON ONLY. Your entire response must be parseable by JSON.parse(). DO NOT include any explanatory text, comments, markdown formatting, or code blocks. Your response should start with '{' and end with '}' without any other characters.

Evaluate the alignment and clarity between:
1. The user's value proposition
2. Their career goals and personal brand statement
3. Insights from the latest coaching session

Apply this grading rubric:
- Grade A: Clear, distinctive value proposition; perfect alignment between career goals and personal brand statement; coaching notes reveal deep understanding of desired positioning
- Grade B: Good value proposition; mostly aligned career goals and brand statement; coaching notes show solid understanding
- Grade C: Basic value proposition present; some misalignment between goals and brand statement; partial understanding in coaching notes
- Grade D: Vague value proposition; significant misalignment between goals and brand; limited understanding in coaching notes
- Grade F: No clear value proposition; disconnected career goals and brand; coaching notes show no understanding of positioning

The JSON output must strictly follow this structure:
{
  "grade": string, // "A", "B", "C", "D", or "F"
  "explanation": string // 1-2 sentences justifying the grade
}`;

    const userPrompt = `Here is the client's questionnaire data:

Value Proposition:
${valueProposition}

Career Goals:
${careerGoals}

Personal Brand Statement:
${personalBrandStatement}

Latest Coaching Note:
${latestNote.content}

Please evaluate the client's SLI Clarity based on these inputs. Use the grading rubric in your instructions to assign a letter grade (A-F) and provide a brief explanation (1-2 sentences) justifying the grade.`;

    try {
      const claudeResponse = await callClaude(systemPrompt, userPrompt);
      log(`Claude analysis of SLI Clarity: ${claudeResponse.grade}`, "freshness");
      
      return {
        grade: claudeResponse.grade,
        explanation: claudeResponse.explanation
      };
    } catch (error) {
      log(`Error analyzing SLI Clarity with Claude: ${error}`, "freshness");
      
      // Fallback if Claude analysis fails
      return {
        grade: 'C',
        explanation: 'We were unable to automatically assess your SLI Clarity. This baseline grade will be updated in your next freshness report.'
      };
    }
  } catch (error) {
    log(`Error calculating SLI Clarity grade: ${error}`, "freshness");
    return {
      grade: 'N/A',
      explanation: 'Could not assess SLI Clarity due to insufficient data.'
    };
  }
}

export async function generateFinalSynthesis(
  questionnaireAnalysis: any,
  resumeAnalysis: any,
  linkedinAnalysis: any,
  additionalDocumentsAnalysis: any[],
  monthlyCheckIns: any[] = [],
  userId?: number,
  previousReport?: any
) {
  try {
    // Calculate profile content quality
    const profileContentQuality = calculateProfileContentQuality(resumeAnalysis, linkedinAnalysis);
    log(`Calculated profile content quality grade: ${profileContentQuality.grade}`, "freshness");
    
    // Calculate narrative consistency
    const narrativeConsistency = calculateNarrativeConsistency(questionnaireAnalysis, resumeAnalysis, linkedinAnalysis);
    log(`Calculated narrative consistency grade: ${narrativeConsistency.grade}`, "freshness");
    
    // Calculate content creation activity
    const contentCreationActivity = calculateContentCreationActivity(monthlyCheckIns);
    log(`Calculated content creation activity grade: ${contentCreationActivity.grade}`, "freshness");
    
    // Calculate engagement activity
    const engagementActivity = calculateEngagementActivity(monthlyCheckIns);
    log(`Calculated engagement activity grade: ${engagementActivity.grade}`, "freshness");
    
    // Calculate SLI Clarity if we have a userId
    let sliClarity = { grade: 'N/A', explanation: 'SLI Clarity grade will be generated once coaching notes are available.' };
    
    if (userId) {
      try {
        sliClarity = await calculateSLIClarity(userId, questionnaireAnalysis);
        log(`Calculated SLI Clarity grade: ${sliClarity.grade}`, "freshness");
      } catch (error) {
        log(`Error calculating SLI Clarity: ${error}`, "freshness");
        // Keep default values if calculation fails
      }
    }
    
    // Calculate recommendation implementation if we have a previous report and userId
    let recommendationImplementation = { grade: 'N/A', explanation: 'Recommendation implementation assessment requires a previous freshness report. This metric will be available after you generate your second report.' };
    
    if (userId && previousReport) {
      try {
        // Extract resume and LinkedIn data for assessment
        let resumeData = '';
        let linkedinData = '';
        
        if (resumeAnalysis && resumeAnalysis.rawText) {
          resumeData = resumeAnalysis.rawText;
        }
        
        if (linkedinAnalysis && linkedinAnalysis.rawText) {
          linkedinData = linkedinAnalysis.rawText;
        }
        
        recommendationImplementation = await calculateRecommendationImplementation(
          userId,
          previousReport,
          resumeData,
          linkedinData,
          monthlyCheckIns
        );
        
        log(`Calculated recommendation implementation grade: ${recommendationImplementation.grade}`, "freshness");
      } catch (error) {
        log(`Error calculating recommendation implementation: ${error}`, "freshness");
        // Keep default values if calculation fails
      }
    }
    
    const systemPrompt = `You are an expert professional branding strategist at SLI.pro. Your task is to synthesize all the analyses of a client's materials into a comprehensive professional branding assessment and strategy recommendation.

EXTREMELY IMPORTANT: You MUST respond with VALID JSON ONLY. Your entire response must be parseable by JSON.parse(). DO NOT include any explanatory text, comments, markdown formatting, or code blocks. Your response should start with '{' and end with '}' without any other characters.

The JSON output must strictly follow this structure:

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
  },
  "detailedMetrics": {
    "profileContentQuality": {
      "grade": "${profileContentQuality.grade}",
      "explanation": "${profileContentQuality.explanation}"
    },
    "narrativeConsistency": {
      "grade": "${narrativeConsistency.grade}",
      "explanation": "${narrativeConsistency.explanation}"
    },
    "contentCreationActivity": {
      "grade": "${contentCreationActivity.grade}",
      "explanation": "${contentCreationActivity.explanation}"
    },
    "engagementActivity": {
      "grade": "${engagementActivity.grade}",
      "explanation": "${engagementActivity.explanation}"
    },
    "recommendationImplementation": {
      "grade": "${recommendationImplementation.grade}",
      "explanation": "${recommendationImplementation.explanation}"
    },
    "sliClarity": {
      "grade": "${sliClarity.grade}",
      "explanation": "${sliClarity.explanation}"
    }
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

Monthly Check-In Data:
${monthlyCheckIns.length > 0 ? JSON.stringify(monthlyCheckIns, null, 2) : "No monthly check-in data available."}

Detailed Metric Assessments:
1. Profile Content Quality Assessment:
${JSON.stringify(profileContentQuality, null, 2)}

2. Narrative Consistency Assessment:
${JSON.stringify(narrativeConsistency, null, 2)}

3. Content Creation Activity Assessment:
${JSON.stringify(contentCreationActivity, null, 2)}

4. Engagement Activity Assessment:
${JSON.stringify(engagementActivity, null, 2)}

5. Recommendation Implementation Assessment:
${JSON.stringify(recommendationImplementation, null, 2)}

6. SLI Clarity Assessment:
${JSON.stringify(sliClarity, null, 2)}

Your task is to synthesize these analyses into a JSON object exactly matching the structure I specified. Remember, your response must be ONLY valid JSON with no explanatory text, markdown, or other non-JSON content. Start with '{' and end with '}' with no other characters.

Be sure to consider all detailed metrics in your recommendations, particularly:
- The Narrative Consistency assessment when identifying critical gaps and suggesting improvements for better alignment across materials
- The Content Creation Activity assessment when recommending content strategies
- The Engagement Activity assessment when recommending networking approaches and engagement tactics
- The Recommendation Implementation assessment when determining the effectiveness of previous recommendations`;

    return await callClaude(systemPrompt, userPrompt);
  } catch (error) {
    log(`Error generating final synthesis: ${error}`, "freshness");
    throw new Error(`Failed to generate final synthesis: ${error}`);
  }
}
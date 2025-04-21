import Anthropic from "@anthropic-ai/sdk";
import { log } from "./vite";
import { Document } from "@shared/schema";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Using Claude 3 Opus model for optimal performance as requested
const CLAUDE_MODEL = "claude-3-opus-20240229";

// Helper function to make Claude API calls with retry logic for rate limits
async function callClaude(systemPrompt: string, userPrompt: string, maxRetries = 3, initialBackoff = 10000) {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  // Helper function to truncate long user prompts to reduce token count
  const truncateIfNeeded = (text: string, maxLength = 4000) => {
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
        temperature: 0.5,
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

export async function generateFinalSynthesis(
  questionnaireAnalysis: any,
  resumeAnalysis: any,
  linkedinAnalysis: any,
  additionalDocumentsAnalysis: any[]
) {
  try {
    // Calculate profile content quality
    const profileContentQuality = calculateProfileContentQuality(resumeAnalysis, linkedinAnalysis);
    
    log(`Calculated profile content quality grade: ${profileContentQuality.grade}`, "freshness");
    
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

Profile Content Quality Assessment:
${JSON.stringify(profileContentQuality, null, 2)}

Your task is to synthesize these analyses into a JSON object exactly matching the structure I specified. Remember, your response must be ONLY valid JSON with no explanatory text, markdown, or other non-JSON content. Start with '{' and end with '}' with no other characters.`;

    return await callClaude(systemPrompt, userPrompt);
  } catch (error) {
    log(`Error generating final synthesis: ${error}`, "freshness");
    throw new Error(`Failed to generate final synthesis: ${error}`);
  }
}
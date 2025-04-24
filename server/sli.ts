import { Anthropic } from '@anthropic-ai/sdk';
import { InsertSli, Sli, UserProfile } from '@shared/schema';
import { log } from './vite';
import { storage } from './storage';
import { analyzeDocument } from './claude';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-7-sonnet-20250219';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY!,
});

// Helper function for exponential backoff retries
async function callWithRetry<T>(
  apiCall: () => Promise<T>, 
  maxRetries = 5, 
  initialBackoff = 60000, // 60 seconds initial backoff
  identifier = "API Call"
): Promise<T> {
  let retries = 0;
  
  while (true) {
    try {
      return await apiCall();
    } catch (error: any) {
      // Check if it's a rate limit error
      const isRateLimit = error?.toString().includes('rate_limit_error');
      
      if (!isRateLimit || retries >= maxRetries) {
        // If it's not a rate limit error or we've used all retries, rethrow
        throw error;
      }
      
      // Calculate exponential backoff time
      const backoffTime = initialBackoff * Math.pow(2, retries);
      retries++;
      
      log(`Rate limit exceeded for ${identifier}. Retrying in ${backoffTime/1000} seconds (retry ${retries}/${maxRetries})`, "claude");
      
      // Wait for the backoff period
      await new Promise(resolve => setTimeout(resolve, backoffTime));
      
      log(`Resuming ${identifier} after backoff`, "claude");
    }
  }
}

/**
 * Extracts and summarizes user information from their questionnaire
 */
async function summarizeQuestionnaire(questionnaire: any): Promise<string> {
  if (!questionnaire) return "No questionnaire data available";

  return `
Industry: ${questionnaire.industry || "Not specified"}
Background: ${questionnaire.background || "Not specified"}
Goals: ${questionnaire.goals || "Not specified"}
Aspirations: ${questionnaire.aspirations || "Not specified"}
Challenges: ${questionnaire.challenges || "Not specified"}
Interests: ${questionnaire.interests || "Not specified"}
Timeframe: ${questionnaire.timeframe || "Not specified"}
  `;
}

/**
 * Analyzes and summarizes user information from their resume
 */
async function summarizeResume(document: any): Promise<string> {
  if (!document) return "No resume available";
  
  try {
    // Check if we already have an analysis saved
    if (document.analysisContent) {
      log(`Using existing resume analysis for document: ${document.name}`, "claude");
      return `Resume Analysis (${document.fileName}):\n${document.analysisContent}`;
    }
    
    // If the fileData is available, analyze it with Claude
    if (document.fileData) {
      log(`Analyzing resume content for document: ${document.name}`, "claude");
      
      // Use the shared document analysis function
      const summary = await analyzeDocument(document);
      
      if (summary) {
        return `Resume Analysis (${document.fileName}):\n${summary}`;
      } else {
        return `Resume filename: ${document.fileName}\nNote: The resume content is not available for detailed analysis.`;
      }
    } else {
      return `Resume filename: ${document.fileName}\nNote: The resume content is not available for detailed analysis.`;
    }
  } catch (error) {
    log(`Error analyzing resume: ${error}`, "claude");
    return `Resume filename: ${document.fileName}\nNote: Could not analyze the resume content due to an error.`;
  }
}

/**
 * Analyzes and summarizes user information from their LinkedIn profile
 */
async function summarizeLinkedIn(document: any): Promise<string> {
  if (!document) return "No LinkedIn profile available";
  
  try {
    // Check if we already have an analysis saved
    if (document.analysisContent) {
      log(`Using existing LinkedIn analysis for document: ${document.name}`, "claude");
      return `LinkedIn Profile Analysis (${document.fileName}):\n${document.analysisContent}`;
    }
    
    // If the fileData is available, analyze it with Claude
    if (document.fileData) {
      log(`Analyzing LinkedIn profile content for document: ${document.name}`, "claude");
      
      // Use the shared document analysis function
      const summary = await analyzeDocument(document);
      
      if (summary) {
        return `LinkedIn Profile Analysis (${document.fileName}):\n${summary}`;
      } else {
        return `LinkedIn profile filename: ${document.fileName}\nNote: The profile content is not available for detailed analysis.`;
      }
    } else {
      return `LinkedIn profile filename: ${document.fileName}\nNote: The profile content is not available for detailed analysis.`;
    }
  } catch (error) {
    log(`Error analyzing LinkedIn profile: ${error}`, "claude");
    return `LinkedIn profile filename: ${document.fileName}\nNote: Could not analyze the profile content due to an error.`;
  }
}

/**
 * Analyzes and summarizes user information from additional documents
 */
async function summarizeAdditionalDocs(documents: any[]): Promise<string> {
  if (!documents || documents.length === 0) return "No additional documents available";
  
  const summaries = [];
  
  // Process each document
  for (const doc of documents) {
    try {
      // Check if we already have an analysis saved
      if (doc.analysisContent) {
        log(`Using existing analysis for document: ${doc.name}`, "claude");
        summaries.push(`Document: ${doc.name} (${doc.fileName})\nSummary: ${doc.analysisContent}`);
        continue;
      }
      
      // If the fileData is available, analyze it with Claude
      if (doc.fileData) {
        log(`Analyzing additional document content for: ${doc.name}`, "claude");
        
        // Use the shared document analysis function
        const summary = await analyzeDocument(doc);
        
        if (summary) {
          summaries.push(`Document: ${doc.name} (${doc.fileName})\nSummary: ${summary}`);
        } else {
          summaries.push(`Document: ${doc.name} (${doc.fileName})\nNote: Content not available for analysis.`);
        }
      } else {
        summaries.push(`Document: ${doc.name} (${doc.fileName})\nNote: Content not available for analysis.`);
      }
    } catch (error) {
      log(`Error analyzing additional document ${doc.name}: ${error}`, "claude");
      summaries.push(`Document: ${doc.name} (${doc.fileName})\nNote: Could not analyze the document content due to an error.`);
    }
  }
  
  return `Additional Documents Analysis:\n\n${summaries.join('\n\n')}`;
}

/**
 * Gets the latest conversation summary for a user
 */
async function getLatestConversationSummary(conversationSummaries: any[]): Promise<string> {
  if (!conversationSummaries || conversationSummaries.length === 0) {
    return "No conversation summaries available";
  }
  
  // Sort by creation date (newest first)
  const sortedSummaries = [...conversationSummaries].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  const latest = sortedSummaries[0];
  
  let summaryText = "Latest Conversation Summary:\n";
  
  // Basic Info
  if (latest.basicInfo) {
    summaryText += `\nBasic Info:\n`;
    if (latest.basicInfo.currentRole) summaryText += `Current Role: ${latest.basicInfo.currentRole}\n`;
    if (latest.basicInfo.industry) summaryText += `Industry: ${latest.basicInfo.industry}\n`;
    if (latest.basicInfo.yearsOfExperience) summaryText += `Years of Experience: ${latest.basicInfo.yearsOfExperience}\n`;
    if (latest.basicInfo.targetTimeline) summaryText += `Target Timeline: ${latest.basicInfo.targetTimeline}\n`;
  }
  
  // Functional Categorization
  if (latest.functionalCategorization) {
    summaryText += `\nFunctional Categorization:\n`;
    if (latest.functionalCategorization.primaryFunction) summaryText += `Primary Function: ${latest.functionalCategorization.primaryFunction}\n`;
    if (latest.functionalCategorization.secondaryFunction) summaryText += `Secondary Function: ${latest.functionalCategorization.secondaryFunction}\n`;
    if (latest.functionalCategorization.keyStrengths && latest.functionalCategorization.keyStrengths.length > 0) {
      summaryText += `Key Strengths: ${latest.functionalCategorization.keyStrengths.join(', ')}\n`;
    }
  }
  
  // Career Transition
  if (latest.careerTransition) {
    summaryText += `\nCareer Transition:\n`;
    if (latest.careerTransition.currentState) summaryText += `Current State: ${latest.careerTransition.currentState}\n`;
    if (latest.careerTransition.desiredState) summaryText += `Desired State: ${latest.careerTransition.desiredState}\n`;
    if (latest.careerTransition.transitionType) summaryText += `Transition Type: ${latest.careerTransition.transitionType}\n`;
    if (latest.careerTransition.primaryMotivation) summaryText += `Primary Motivation: ${latest.careerTransition.primaryMotivation}\n`;
  }
  
  // Strengths and Positioning
  if (latest.strengthsAndPositioning) {
    summaryText += `\nStrengths and Positioning:\n`;
    if (latest.strengthsAndPositioning.keyStrengths && latest.strengthsAndPositioning.keyStrengths.length > 0) {
      summaryText += `Key Strengths: ${latest.strengthsAndPositioning.keyStrengths.join(', ')}\n`;
    }
    if (latest.strengthsAndPositioning.areasForDevelopment && latest.strengthsAndPositioning.areasForDevelopment.length > 0) {
      summaryText += `Areas for Development: ${latest.strengthsAndPositioning.areasForDevelopment.join(', ')}\n`;
    }
    if (latest.strengthsAndPositioning.valueProposition) summaryText += `Value Proposition: ${latest.strengthsAndPositioning.valueProposition}\n`;
    if (latest.strengthsAndPositioning.achievementExamples && latest.strengthsAndPositioning.achievementExamples.length > 0) {
      summaryText += `Achievement Examples: ${latest.strengthsAndPositioning.achievementExamples.join(', ')}\n`;
    }
  }
  
  // Recommendations
  if (latest.recommendations) {
    summaryText += `\nRecommendations:\n`;
    if (latest.recommendations.sliDirections && latest.recommendations.sliDirections.length > 0) {
      summaryText += `SLI Directions: ${latest.recommendations.sliDirections.join(', ')}\n`;
    }
    if (latest.recommendations.contentStrategyDirections && latest.recommendations.contentStrategyDirections.length > 0) {
      summaryText += `Content Strategy Directions: ${latest.recommendations.contentStrategyDirections.join(', ')}\n`;
    }
    if (latest.recommendations.specialConsiderations) summaryText += `Special Considerations: ${latest.recommendations.specialConsiderations}\n`;
  }
  
  return summaryText;
}

/**
 * Gets the latest coaching notes for a user
 */
async function getLatestCoachingNotes(coachingNotes: any[]): Promise<string> {
  if (!coachingNotes || coachingNotes.length === 0) {
    return "No coaching notes available";
  }
  
  // Sort by creation date (newest first)
  const sortedNotes = [...coachingNotes].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  // Get the latest note
  const latestNote = sortedNotes[0];
  
  return `Latest Coaching Note (${new Date(latestNote.createdAt).toLocaleDateString()}):\n${latestNote.content}`;
}

/**
 * Generate SLIs for a user
 */
export async function generateSLIs(userProfile: UserProfile): Promise<InsertSli | null> {
  try {
    log(`Generating SLIs for user: ${userProfile.id}`, "claude");
    
    // Extract questionnaire data
    const questionnaireSummary = await summarizeQuestionnaire(userProfile.questionnaire);
    
    // Extract resume data
    const resumeDocument = userProfile.documents?.find(doc => doc.type === 'resume');
    const resumeSummary = await summarizeResume(resumeDocument);
    
    // Extract LinkedIn data
    const linkedInDocument = userProfile.documents?.find(doc => doc.type === 'linkedin');
    const linkedInSummary = await summarizeLinkedIn(linkedInDocument);
    
    // Extract additional documents
    const additionalDocs = userProfile.documents?.filter(doc => doc.type !== 'resume' && doc.type !== 'linkedin') || [];
    const additionalDocsSummary = await summarizeAdditionalDocs(additionalDocs);
    
    // Get conversation summary
    const conversationSummary = await getLatestConversationSummary(userProfile.conversationSummaries || []);
    
    // Get coaching notes
    const coachingNotesSummary = await getLatestCoachingNotes(userProfile.coachingNotes || []);
    
    // System prompt for Claude
    const systemPrompt = `You are a professional branding strategist working with SLI.pro to craft three powerful, distinct SLIs (Single Lasting Impressions) for a client. Each SLI should balance authenticity and aspiration, serving as a conversationally shareable brand statement.

An SLI is a clear, conversational sentence that expresses the user's unique value proposition—ideal for networking and casual introductions. It connects their authentic experience with their aspirational direction and reflects their natural communication style.

For each SLI, provide:
1. A descriptive title
2. The SLI statement itself (one sentence that passes the "Starbucks line test" - can be conversationally shared)
3. A detailed rationale (3-4 paragraphs) explaining:
   - How it draws from the user's unique strengths and experiences
   - How it bridges past experience with future aspirations
   - How it differentiates the user from peers
   - How it aligns with insights from their personality assessments
   - How it positions them for their desired role/industry

The three SLIs should be meaningfully distinct, highlighting different aspects of:
- Background
- Personality
- Industry focus
- Skills or aspirations

Avoid vague, overly general, or interchangeable phrases. Each SLI should be specific and memorable.

Respond with an EXACT JSON structure as follows:
{
  "title1": "SLI Option 1: [Descriptive Title]",
  "statement1": "The conversational SLI statement for option 1",
  "rationale1": "Detailed rationale for option 1...",
  "title2": "SLI Option 2: [Descriptive Title]",
  "statement2": "The conversational SLI statement for option 2",
  "rationale2": "Detailed rationale for option 2...",
  "title3": "SLI Option 3: [Descriptive Title]",
  "statement3": "The conversational SLI statement for option 3",
  "rationale3": "Detailed rationale for option 3..."
}

Each rationale section should be 3-4 paragraphs of rich, detailed content. Be sure to format the JSON correctly.`;

    // User message
    const userMessage = `Please generate three distinct SLI options for ${userProfile.firstName} ${userProfile.lastName} based on the following information:

QUESTIONNAIRE:
${questionnaireSummary}

RESUME:
${resumeSummary}

LINKEDIN PROFILE:
${linkedInSummary}

ADDITIONAL DOCUMENTS:
${additionalDocsSummary}

CONVERSATION SUMMARY:
${conversationSummary}

COACHING NOTES:
${coachingNotesSummary}

Please generate three distinct, compelling SLI options that this person can use in professional settings.`;

    // Call Claude API with retry mechanism
    log(`Calling Claude API to generate SLIs`, "claude");
    const response = await callWithRetry(
      () => anthropic.messages.create({
        model: CLAUDE_MODEL,
        system: systemPrompt,
        max_tokens: 4096,
        temperature: 0.5,
        messages: [
          { role: "user", content: userMessage }
        ]
      }),
      5,  // max retries
      60000,  // initial backoff of 60 seconds
      "SLI generation"
    );

    // Parse the response content to extract the JSON
    const responseContent = response.content.find(item => item.type === 'text')?.text || '';
    
    // Extract JSON from the response (it might be wrapped in code blocks)
    let jsonStr = responseContent;
    const jsonMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonStr = jsonMatch[1];
    }
    
    // Parse the JSON
    try {
      const sliData = JSON.parse(jsonStr);
      
      // Create the SLI object
      const sli: InsertSli = {
        userId: userProfile.id,
        adminId: 0, // This will be set by the caller
        title1: sliData.title1,
        statement1: sliData.statement1,
        rationale1: sliData.rationale1,
        title2: sliData.title2,
        statement2: sliData.statement2,
        rationale2: sliData.rationale2,
        title3: sliData.title3,
        statement3: sliData.statement3,
        rationale3: sliData.rationale3,
        selectedSliIndex: null
      };
      
      return sli;
    } catch (error) {
      log(`Error parsing Claude's SLI response: ${error}`, "claude");
      return null;
    }
  } catch (error) {
    log(`Error generating SLIs: ${error}`, "claude");
    return null;
  }
}
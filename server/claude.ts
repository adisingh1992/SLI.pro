import { log } from "./logger";
import { storage } from "./storage";
import { InsertConversationSummary, Document } from "@shared/schema";
import { extractDocumentText, validateExtractedText } from "./document-extractor";
import { getDocumentBase64, hasContent } from "./document-data";
import * as orchestrator from "./orchestrator";
import * as docStore from "./wing/document-store";
import * as profileStore from "./wing/profile-store";
import * as identity from "./wing/identity-store";

log(`LLM provider: ${orchestrator.activeProvider()}`, "orchestrator");

// Define the system prompt template to be used with each conversation
const getSystemPrompt = (userData: {
  firstName: string;
  lastName: string;
  questionnaire?: {
    industry?: string;
    background?: string;
    goals?: string;
    aspirations?: string;
    challenges?: string;
    interests?: string;
    timeframe?: string;
  };
}) => {
  // Extract relevant information
  const fullName = `${userData.firstName} ${userData.lastName}`;

  // Extract questionnaire data or use placeholders
  const industry = userData.questionnaire?.industry || "Not specified";
  const role = userData.questionnaire?.background
    ? extractRoleFromBackground(userData.questionnaire.background)
    : "Not specified";
  const challenges = userData.questionnaire?.challenges || "Not specified";
  const digitalPresence = userData.questionnaire?.aspirations
    ? extractDigitalPresence(userData.questionnaire.aspirations)
    : "Not specified";
  const contentCreation = userData.questionnaire?.aspirations
    ? extractContentCreation(userData.questionnaire.aspirations)
    : "Not specified";
  const targetInterests = userData.questionnaire?.interests || "Not specified";

  return `You are an AI assistant for SLI.pro, a professional branding service. Your purpose is to build upon the client's initial questionnaire responses to gather deeper insights before they meet with their coach, Danielle.

  IMPORTANT INSTRUCTION: You must follow a specific sequential process for the conversation. Start with Phase 1 and ONLY move to the next phase after completing the current one. Do not skip phases or jump ahead in the conversation. Ask questions from one phase at a time, waiting for the user to respond before moving on.

  The client has already submitted an initial assessment questionnaire with the following information:
  - Name: ${fullName}
  - Current/Recent Role: ${role}
  - Industry: ${industry}
  - Function: Extracted from role context
  - LinkedIn URL: Not available
  - Top professional branding challenges: ${challenges}
  - Digital presence details: ${digitalPresence}
  - Content creation experience: ${contentCreation}
  - Target industry/role interests: ${targetInterests}

  Phase 1: Basic Info Gathering
  Begin by introducing yourself and referencing their questionnaire submission. Confirm key information is accurate and explain the purpose of this follow-up conversation. Make sure to communicate:
  1. That you've reviewed their initial assessment
  2. The purpose of this conversation (diving deeper into specific areas)
  3. The time commitment (approximately 30-40 minutes)
  4. How the information will be used in their coaching session
  Wait for confirmation before moving to Phase 2.

  Phase 2: Assessment Status Check (2-3 minutes)
  Check whether the client has already submitted specific assessments that are typically part of the SLI.pro process:
  "Before we begin, I'd like to confirm which assessments you've already completed:
  1. Have you already submitted an Enneagram assessment as part of your SLI.pro process? (Yes/No)
  2. Have you submitted any other personality or strengths assessments like Myers-Briggs, StrengthsFinder, or VIA? (Yes/No, and if yes, which ones)"
  If they haven't completed the Enneagram assessment, explain its importance and guide them to: https://www.truity.com/test/enneagram-personality-test (don't show the full URL instead show a hyperlink)
  Wait for the client's response before moving to Phase 3.

  Phase 3: Career Aspirations Deep Dive (7-10 minutes)
  Building on the career interests they indicated in their questionnaire, explore their aspirations more deeply. Ask specifically (Ask these questions 2 at a time):
  1. What specifically attracts them to their mentioned industry/role?
  2. How does this direction build on their current expertise?
  3. What timeline are they considering for this move?
  4. Are they primarily looking to advance within current function, pivot to a new function, change industries, or relocate?
  Wait for complete responses before moving to Phase 4.

  Phase 4: Functional Clarity Assessment (5-7 minutes)
  Help the client gain clarity on their functional identity. Explain:
  "For positioning purposes, it's helpful to think about five primary business functions: Finance, Operations, Sales, Marketing, and Product. While many roles blend these areas, identifying your primary functional identity helps create a clearer professional brand."
  Ask them to identify their primary functional home, providing details about each function as needed.
  Wait for their identification before moving to Phase 5.

  Phase 5: Strengths & Differentiation Exploration (7-10 minutes)
  Explore what makes them unique professionally by asking (Ask these questions 2 at a time):
  1. What specific achievements or contributions are they most proud of in their career?
  2. What do people consistently come to them for help with?
  3. What problems do they solve that others in their organization struggle with?
  4. What unique combination of skills or experiences gives them an edge?
  Wait for thorough responses before moving to Phase 6.

  Phase 6: Aspirational Image Exercise (10 minutes)
  Guide them to describe their ideal professional self in detail, then ask them to find 3-5 images that represent aspects of this aspirational self (not business leaders but images that capture qualities, feelings).
  Ask them to explain why they chose each image and what it represents about their aspirational self.
  Wait for them to complete this exercise before moving to Phase 7.

  Phase 7: Forced Ranking Exercise (7-10 minutes)
  Help identify their true priorities by:
  1. Having them list at least 10 elements they want in their ideal job
  2. Systematically comparing each item against every other item (e.g., "Between compensation and work-life balance, which is more important to you?") (Show all the options at once and ask them to rank them)
  3. Presenting the final ranking based on the number of "wins" per item
  Wait for the complete exercise to be finished before moving to Phase 8.

  Phase 8: Content Creation Potential (5-7 minutes)
  Explore their potential for developing thought leadership content by asking (Ask these questions 2 at a time):
  1. What topics do they feel most confident discussing professionally?
  2. What format feels most natural for them to share ideas (writing, speaking, visual content)?
  3. What's the primary factor that has held them back from creating more professional content?
  Wait for their answers before moving to Phase 9.

  Phase 9: Summary & Next Steps (3-5 minutes)
  Wrap up by:
  1. Summarizing key insights from both their questionnaire and your conversation
  2. Explaining how these insights will inform their coaching session
  3. Setting expectations for next steps
  4. Asking if they have any final questions

  Remember: You must complete each phase thoroughly before moving to the next one. Do not skip or combine phases.

  At the end of Phase 9, thank them for their time and tell them to schdeule their coaching session via Calendly: https://calendly.com/dcara-sli/haas with Danielle.`;
};

// Helper functions to extract information from questionnaire
function extractRoleFromBackground(background: string): string {
  // Simple extraction logic - advanced implementations might use more sophisticated parsing
  const lines = background.split("\n");
  // Get the first two sentences as they likely contain the role info
  return lines[0]?.slice(0, 100) + "..." || "Not specified";
}

function extractDigitalPresence(aspirations: string): string {
  // Look for digital presence related information
  if (aspirations.toLowerCase().includes("linkedin")) {
    return "Has LinkedIn presence";
  }
  return "Details not provided";
}

function extractContentCreation(aspirations: string): string {
  // Check for content creation experience
  if (aspirations.toLowerCase().includes("published content")) {
    const startIndex = aspirations.toLowerCase().indexOf("published content");
    const endIndex = aspirations.indexOf("\n", startIndex);
    if (endIndex > startIndex) {
      return aspirations.substring(startIndex, endIndex);
    }
    return aspirations.substring(startIndex);
  }
  return "Experience details not provided";
}

/*
 * REMOVED: generateClaudeResponse, generateConversationSummary and
 * generateStreamingClaudeResponse.
 *
 * All three served the MVP's general "coaching conversation" feature, which
 * Foundation Sessions replaced. Its server routes were dropped in the Wing
 * cutover, so nothing had called these in some time — generateConversationSummary
 * still read `storage.getMessages(conversationId)` against a legacy id space
 * that no longer exists, which is how they were found.
 *
 * analyzeDocument below is still live (four callers) and stays.
 */


// Function to analyze document content
// Helper function for exponential backoff retries
async function callWithRetry<T>(
  apiCall: () => Promise<T>, 
  maxRetries = 5, 
  initialBackoff = 60000, // 60 seconds initial backoff as requested
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

export async function analyzeDocument(document: Document): Promise<string | null> {
  try {
    // Skip analysis if the document has no retrievable content (inline or Blob)
    if (!hasContent(document)) {
      log(`No file data available for document ${document.id}`, "claude");
      return null;
    }

    // Get document type and check if we already have an analysis
    const documentType = document.type.toLowerCase();
    if (document.analysisContent) {
      log(`Document ${document.id} already has analysis content`, "claude");
      return document.analysisContent;
    }

    log(`Analyzing document ${document.id} of type ${documentType}`, "claude");

    // Create prompt based on document type
    let analysisPrompt = "";
    switch (documentType) {
      case "resume":
        analysisPrompt = `Analyze this resume deeply and extract all relevant professional information. 
        Include details about:
        - Career trajectory and progression
        - Key roles and responsibilities
        - Technical and soft skills
        - Educational background
        - Notable achievements and results
        - Industry specializations
        - Leadership experience
        - Project highlights
        
        Format your analysis as a detailed but concise summary that captures the essence of this person's professional profile.`;
        break;
      case "linkedin":
        analysisPrompt = `Provide a thorough analysis of this LinkedIn profile. 
        Include details about:
        - Professional summary and headline
        - Career progression and roles
        - Skills and endorsements
        - Network size and relationships
        - Content creation activity
        - Engagement patterns and interests
        - Educational background
        - Certifications and credentials

        Format your analysis as a comprehensive professional assessment that highlights key strengths, patterns, and opportunities from the profile.`;
        break;
      case "certificate":
        analysisPrompt = `Analyze this certificate or credential document. 
        Include details about:
        - The type of certification and issuing organization
        - Skills or knowledge validated
        - Level of achievement or specialization
        - Industry relevance and value
        - Date issued and expiration (if applicable)
        
        Format your analysis as a concise summary that explains the significance of this credential to the person's professional profile.`;
        break;
      case "assessment":
        analysisPrompt = `Analyze this assessment document thoroughly. 
        Include details about:
        - Type of assessment (personality, skills, strengths, etc.)
        - Key findings and results
        - Strengths and potential areas for development
        - Career implications and applications
        - Unique insights or patterns
        
        Format your analysis as a concise professional interpretation that highlights the most significant insights for career development.`;
        break;
      default:
        analysisPrompt = `Analyze this document thoroughly. Extract the main points, key information, and any insights relevant to professional branding and career development. Format your analysis as a detailed but concise summary.`;
    }

    // Extract readable text from the document using proper parsing libraries
    log(`Extracting text from document: ${document.fileName}`, "claude");
    const extractedText = await extractDocumentText(await getDocumentBase64(document), document.fileName);
    const cleanedText = validateExtractedText(extractedText);
    
    log(`Successfully extracted ${cleanedText.length} characters of text`, "claude");
    const fullPrompt = `${analysisPrompt}\n\nDocument content:\n${cleanedText}`;

    // Use callWithRetry for API calls with exponential backoff
    const response = await callWithRetry(
      () => orchestrator.complete({
        tier: "mid", // document analysis
        messages: [
          {
            role: "user",
            content: fullPrompt
          }
        ],
        maxTokens: 4096,
        temperature: 0.5,
      }),
      5,  // max retries
      60000,  // initial backoff of 60 seconds
      `document analysis for ${document.name} (${document.id})`
    );

    // Extract the analysis text from the response
    if (response.text) {
      {
        const textContent = response.text;

        // Save the analysis to the database
        if (textContent) {
          try {
            await docStore.updateDocument(document.id, { analysisContent: textContent });
            log(`Saved analysis for document: ${document.name}`, "claude");
          } catch (saveError) {
            log(`Error saving document analysis: ${saveError}`, "claude");
          }
        }
        
        return textContent;
      }
    }

    return null;
  } catch (error) {
    log(`Error analyzing document ${document.id}: ${error}`, "claude");
    return null;
  }
}



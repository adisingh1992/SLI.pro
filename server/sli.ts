import { InsertSli, UserProfile } from '@shared/schema';
import { log } from './vite';
import { analyzeDocument } from './claude';
import { hasContent } from './document-data';
import * as orchestrator from "./orchestrator";

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
    if (hasContent(document)) {
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
    if (hasContent(document)) {
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
      if (hasContent(doc)) {
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
 * Generate a concise foundation sessions summary using Claude
 */
async function generateFoundationSessionsSummary(foundationSessions: any[]): Promise<string> {
  log(`Processing ${foundationSessions?.length || 0} total foundation sessions`, "claude");
  
  if (!foundationSessions || foundationSessions.length === 0) {
    log(`No foundation sessions provided`, "claude");
    return "No foundation sessions completed";
  }
  
  // Filter only completed sessions and sort by session number
  const completedSessions = foundationSessions
    .filter(session => session.status === 'completed' && session.completionData)
    .sort((a, b) => a.sessionNumber - b.sessionNumber);
  
  const sessionNumbers = completedSessions.map(s => s.sessionNumber);
  log(`Found ${completedSessions.length} completed sessions: [${sessionNumbers.join(',')}]`, "claude");
  
  if (completedSessions.length === 0) {
    log(`No completed sessions found`, "claude");
    return "No foundation sessions completed";
  }
  
  // Prepare clean data for Claude
  const sessionsData = completedSessions.map(session => ({
    sessionNumber: session.sessionNumber,
    completionData: session.completionData,
    completedAt: session.completedAt
  }));
  
  try {
    log(`Sending foundation sessions data to Claude for summarization`, "claude");
    
    const systemPrompt = `You are a professional branding strategist assistant. Create a concise, well-structured summary of foundation sessions completion data that will be used for SLI generation. Focus on key insights, functional positioning, credibility factors, and positioning stories. Keep the summary professional and avoid special characters that could break JSON parsing.`;
    
    const userMessage = `Please create a concise professional summary of these foundation sessions completion data for SLI generation:\n\n${JSON.stringify(sessionsData, null, 2)}\n\nProvide a clean, structured summary without special formatting characters.`;
    
    const response = await callWithRetry(
      () => orchestrator.complete({
        tier: "mid", // summarisation
        system: systemPrompt,
        maxTokens: 1000,
        temperature: 0.3,
        messages: [{ role: "user", content: userMessage }]
      }),
      3,  // max retries
      30000,  // initial backoff of 30 seconds
      "foundation sessions summarization"
    );

    const summaryContent = response.text || 'Foundation sessions summary not available';
    
    log(`Generated foundation sessions summary: ${summaryContent.length} characters`, "claude");
    return summaryContent;
    
  } catch (error) {
    log(`Error generating foundation sessions summary: ${error}`, "claude");
    return "Foundation sessions data available but summary generation failed";
  }
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
 * Sanitize JSON string to remove control characters
 */
function sanitizeJsonString(str: string): string {
  return str
    .replace(/[\x00-\x1F\x7F]/g, '')  // Remove control characters
    .replace(/\\n/g, '\\\\n')        // Escape newlines in strings
    .replace(/\\r/g, '\\\\r')        // Escape carriage returns
    .replace(/\\t/g, '\\\\t')        // Escape tabs
    .trim();
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
    
    // Get foundation sessions summary using Claude
    const foundationSessionsSummary = await generateFoundationSessionsSummary(userProfile.foundationSessions || []);
    
    // Log foundation sessions data being sent to Claude
    const completedCount = userProfile.foundationSessions?.filter(s => s.status === 'completed').length || 0;
    log(`Foundation sessions: ${userProfile.foundationSessions?.length || 0} total, ${completedCount} completed, summary: ${foundationSessionsSummary.length} chars`, "claude");
    
    // Log full content only in debug mode to avoid PII exposure
    if (process.env.DEBUG_SLI === 'true') {
      const truncatedSummary = foundationSessionsSummary.length > 500 
        ? foundationSessionsSummary.substring(0, 500) + '...[truncated]'
        : foundationSessionsSummary;
      log(`Foundation sessions summary: ${truncatedSummary}`, "claude");
    }
    
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

FOUNDATION SESSIONS SUMMARY:
${foundationSessionsSummary}

COACHING NOTES:
${coachingNotesSummary}

Please generate three distinct, compelling SLI options that this person can use in professional settings.`;

    // Call Claude API with retry mechanism
    log(`Calling Claude API to generate SLIs`, "claude");
    
    // Log payload verification before Claude API call
    const hasFoundationSections = userMessage.includes('FOUNDATION SESSIONS SUMMARY');
    const startIdx = userMessage.indexOf('FOUNDATION SESSIONS SUMMARY');
    const endIdx = userMessage.indexOf('COACHING NOTES');
    const sectionLength = (startIdx >= 0 && endIdx >= 0) ? endIdx - startIdx : -1;
    
    log(`Sending to Claude API - contains foundation sessions: ${hasFoundationSections}, section length: ${sectionLength} chars`, "claude");
    const response = await callWithRetry(
      () => orchestrator.complete({
        tier: "flagship", // SLI generation is quality-critical
        system: systemPrompt + "\n\nIMPORTANT: Return ONLY valid JSON. No additional text or explanations. Ensure all strings are properly escaped.",
        maxTokens: 4096,
        temperature: 0.1,  // Very low temperature for reliable JSON
        messages: [
          { role: "user", content: userMessage + "\n\nReturn only the JSON object with no additional text." }
        ]
      }),
      5,  // max retries
      60000,  // initial backoff of 60 seconds
      "SLI generation"
    );

    // Parse the response content to extract and sanitize JSON
    const responseContent = response.text || '';
    
    // Extract JSON from the response (it might be wrapped in code blocks)
    let jsonStr = responseContent;
    const jsonMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonStr = jsonMatch[1];
    }
    
    // Use the sanitizeJsonString function to clean the JSON
    
    // Parse the JSON with error recovery
    let sliData;
    try {
      const sanitizedJson = sanitizeJsonString(jsonStr);
      sliData = JSON.parse(sanitizedJson);
      log(`Successfully parsed SLI JSON response`, "claude");
    } catch (firstError) {
      log(`First JSON parse failed: ${firstError}`, "claude");
      
      // Try to fix common JSON issues and retry
      try {
        let fixedJson = jsonStr
          .replace(/[\x00-\x1F\x7F]/g, ' ')  // Replace control chars with spaces
          .replace(/"([^"]*?)\n([^"]*?)"/g, '"$1\\n$2"')  // Fix unescaped newlines in quotes
          .replace(/"([^"]*?)\r([^"]*?)"/g, '"$1\\r$2"')  // Fix unescaped returns in quotes
          .replace(/"([^"]*?)\t([^"]*?)"/g, '"$1\\t$2"')  // Fix unescaped tabs in quotes
          .trim();
        
        sliData = JSON.parse(fixedJson);
        log(`Successfully parsed SLI JSON after sanitization`, "claude");
      } catch (secondError) {
        log(`JSON parsing failed after sanitization. Raw response length: ${responseContent.length}`, "claude");
        log(`Error location: ${secondError}`, "claude");
        
        // Log a snippet around the error for debugging
        if (process.env.DEBUG_SLI === 'true') {
          log(`Raw response snippet: ${responseContent.substring(0, 200)}...`, "claude");
        }
        return null;
      }
    }
    
    // Create the SLI object
    try {
      const sli: InsertSli = {
        userId: userProfile.id,
        adminId: 0, // This will be set by the caller
        title1: sliData.title1 || 'SLI Option 1',
        statement1: sliData.statement1 || 'Statement not generated',
        rationale1: sliData.rationale1 || 'Rationale not generated',
        title2: sliData.title2 || 'SLI Option 2',
        statement2: sliData.statement2 || 'Statement not generated',
        rationale2: sliData.rationale2 || 'Rationale not generated',
        title3: sliData.title3 || 'SLI Option 3',
        statement3: sliData.statement3 || 'Statement not generated',
        rationale3: sliData.rationale3 || 'Rationale not generated',
        selectedSliIndex: null
      };
      
      return sli;
    } catch (error) {
      log(`Error creating SLI object from parsed data: ${error}`, "claude");
      return null;
    }
  } catch (error) {
    log(`Error generating SLIs: ${error}`, "claude");
    return null;
  }
}

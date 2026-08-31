import { InsertSli, UserProfile } from '@shared/schema';
import { log } from './logger';
import { analyzeDocument } from './document-analysis';
import { hasContent } from './document-data';
import * as orchestrator from "./orchestrator";
import * as sliStore from "./wing/sli-store";
import * as profileStore from "./wing/profile-store";

/** `generateSLIs`'s output, plus the auto-activation pick — same shape callers already use. */
export type GeneratedSli = InsertSli & {
  recommendedIndex: 1 | 2 | 3 | null;
  recommendationReason: string | null;
};

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
      
      log(`Rate limit exceeded for ${identifier}. Retrying in ${backoffTime/1000} seconds (retry ${retries}/${maxRetries})`, "sli");
      
      // Wait for the backoff period
      await new Promise(resolve => setTimeout(resolve, backoffTime));
      
      log(`Resuming ${identifier} after backoff`, "sli");
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
      log(`Using existing resume analysis for document: ${document.name}`, "sli");
      return `Resume Analysis (${document.fileName}):\n${document.analysisContent}`;
    }
    
    // If the fileData is available, analyze it with the model
    if (hasContent(document)) {
      log(`Analyzing resume content for document: ${document.name}`, "sli");
      
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
    log(`Error analyzing resume: ${error}`, "sli");
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
      log(`Using existing LinkedIn analysis for document: ${document.name}`, "sli");
      return `LinkedIn Profile Analysis (${document.fileName}):\n${document.analysisContent}`;
    }
    
    // If the fileData is available, analyze it with the model
    if (hasContent(document)) {
      log(`Analyzing LinkedIn profile content for document: ${document.name}`, "sli");
      
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
    log(`Error analyzing LinkedIn profile: ${error}`, "sli");
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
        log(`Using existing analysis for document: ${doc.name}`, "sli");
        summaries.push(`Document: ${doc.name} (${doc.fileName})\nSummary: ${doc.analysisContent}`);
        continue;
      }
      
      // If the fileData is available, analyze it with the model
      if (hasContent(doc)) {
        log(`Analyzing additional document content for: ${doc.name}`, "sli");
        
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
      log(`Error analyzing additional document ${doc.name}: ${error}`, "sli");
      summaries.push(`Document: ${doc.name} (${doc.fileName})\nNote: Could not analyze the document content due to an error.`);
    }
  }
  
  return `Additional Documents Analysis:\n\n${summaries.join('\n\n')}`;
}

/**
 * Generate a concise foundation sessions summary using the model
 */
async function generateFoundationSessionsSummary(foundationSessions: any[]): Promise<string> {
  log(`Processing ${foundationSessions?.length || 0} total foundation sessions`, "sli");
  
  if (!foundationSessions || foundationSessions.length === 0) {
    log(`No foundation sessions provided`, "sli");
    return "No foundation sessions completed";
  }
  
  // Filter only completed sessions and sort by session number
  const completedSessions = foundationSessions
    .filter(session => session.status === 'completed' && session.completionData)
    .sort((a, b) => a.sessionNumber - b.sessionNumber);
  
  const sessionNumbers = completedSessions.map(s => s.sessionNumber);
  log(`Found ${completedSessions.length} completed sessions: [${sessionNumbers.join(',')}]`, "sli");
  
  if (completedSessions.length === 0) {
    log(`No completed sessions found`, "sli");
    return "No foundation sessions completed";
  }
  
  // Prepare clean data for the model
  const sessionsData = completedSessions.map(session => ({
    sessionNumber: session.sessionNumber,
    completionData: session.completionData,
    completedAt: session.completedAt
  }));
  
  try {
    log(`Summarising foundation sessions data`, "sli");
    
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
    
    log(`Generated foundation sessions summary: ${summaryContent.length} characters`, "sli");
    return summaryContent;
    
  } catch (error) {
    log(`Error generating foundation sessions summary: ${error}`, "sli");
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
export async function generateSLIs(userProfile: any): Promise<GeneratedSli | null> {
  try {
    log(`Generating SLIs for user: ${userProfile.id}`, "sli");
    
    // Extract questionnaire data
    const questionnaireSummary = await summarizeQuestionnaire(userProfile.questionnaire);
    
    // Extract resume data
    const resumeDocument = userProfile.documents?.find((doc: any) => doc.type === 'resume');
    const resumeSummary = await summarizeResume(resumeDocument);
    
    // Extract LinkedIn data
    const linkedInDocument = userProfile.documents?.find((doc: any) => doc.type === 'linkedin');
    const linkedInSummary = await summarizeLinkedIn(linkedInDocument);
    
    // Extract additional documents
    const additionalDocs = userProfile.documents?.filter((doc: any) => doc.type !== 'resume' && doc.type !== 'linkedin') || [];
    const additionalDocsSummary = await summarizeAdditionalDocs(additionalDocs);
    
    // Get foundation sessions summary using the model
    const foundationSessionsSummary = await generateFoundationSessionsSummary(userProfile.foundationSessions || []);
    
    // Log foundation sessions data being sent to the model
    const completedCount = userProfile.foundationSessions?.filter((s: any) => s.status === 'completed').length || 0;
    log(`Foundation sessions: ${userProfile.foundationSessions?.length || 0} total, ${completedCount} completed, summary: ${foundationSessionsSummary.length} chars`, "sli");
    
    // Log full content only in debug mode to avoid PII exposure
    if (process.env.DEBUG_SLI === 'true') {
      const truncatedSummary = foundationSessionsSummary.length > 500 
        ? foundationSessionsSummary.substring(0, 500) + '...[truncated]'
        : foundationSessionsSummary;
      log(`Foundation sessions summary: ${truncatedSummary}`, "sli");
    }
    
    // Get coaching notes
    const coachingNotesSummary = await getLatestCoachingNotes(userProfile.coachingNotes || []);
    
    // System prompt for the model
    const systemPrompt = `You are a professional branding strategist working with MyWing to craft three powerful, distinct SLIs (Single Lasting Impressions) for a client. Each SLI should balance authenticity and aspiration, serving as a conversationally shareable brand statement.

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

After drafting the three options, decide which one you would lead with if the client could only walk away with one — the strongest, most immediately usable statement of the three. This is not a tie-breaker; weigh them as you would if recommending one to a colleague.

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
  "rationale3": "Detailed rationale for option 3...",
  "recommendedIndex": 1,
  "recommendationReason": "One or two sentences on why this option is the strongest one to lead with."
}

"recommendedIndex" must be the number 1, 2, or 3 — whichever option corresponds to your recommendation above. Each rationale section should be 3-4 paragraphs of rich, detailed content. Be sure to format the JSON correctly.`;

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

    // Call the model with retry
    log(`Generating SLIs`, "sli");
    
    // Log payload verification before the model call
    const hasFoundationSections = userMessage.includes('FOUNDATION SESSIONS SUMMARY');
    const startIdx = userMessage.indexOf('FOUNDATION SESSIONS SUMMARY');
    const endIdx = userMessage.indexOf('COACHING NOTES');
    const sectionLength = (startIdx >= 0 && endIdx >= 0) ? endIdx - startIdx : -1;
    
    log(`Sending to the model — contains foundation sessions: ${hasFoundationSections}, section length: ${sectionLength} chars`, "sli");
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
      log(`Successfully parsed SLI JSON response`, "sli");
    } catch (firstError) {
      log(`First JSON parse failed: ${firstError}`, "sli");
      
      // Try to fix common JSON issues and retry
      try {
        let fixedJson = jsonStr
          .replace(/[\x00-\x1F\x7F]/g, ' ')  // Replace control chars with spaces
          .replace(/"([^"]*?)\n([^"]*?)"/g, '"$1\\n$2"')  // Fix unescaped newlines in quotes
          .replace(/"([^"]*?)\r([^"]*?)"/g, '"$1\\r$2"')  // Fix unescaped returns in quotes
          .replace(/"([^"]*?)\t([^"]*?)"/g, '"$1\\t$2"')  // Fix unescaped tabs in quotes
          .trim();
        
        sliData = JSON.parse(fixedJson);
        log(`Successfully parsed SLI JSON after sanitization`, "sli");
      } catch (secondError) {
        log(`JSON parsing failed after sanitization. Raw response length: ${responseContent.length}`, "sli");
        log(`Error location: ${secondError}`, "sli");
        
        // Log a snippet around the error for debugging
        if (process.env.DEBUG_SLI === 'true') {
          log(`Raw response snippet: ${responseContent.substring(0, 200)}...`, "sli");
        }
        return null;
      }
    }
    
    // Create the SLI object
    try {
      // Guard the value, not just its presence — an out-of-range or non-numeric
      // recommendation should fall back to "no recommendation" rather than being
      // trusted, the same reasoning `sli-routes.ts`'s refinement parsing already
      // applies to the model's output.
      const recommendedIndexRaw = Number(sliData.recommendedIndex);
      const recommendedIndex: 1 | 2 | 3 | null =
        recommendedIndexRaw === 1 || recommendedIndexRaw === 2 || recommendedIndexRaw === 3
          ? recommendedIndexRaw
          : null;
      const recommendationReason =
        typeof sliData.recommendationReason === "string" && sliData.recommendationReason.trim()
          ? sliData.recommendationReason.trim()
          : null;

      const sli: GeneratedSli = {
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
        selectedSliIndex: null,
        recommendedIndex,
        recommendationReason,
      };

      return sli;
    } catch (error) {
      log(`Error creating SLI object from parsed data: ${error}`, "sli");
      return null;
    }
  } catch (error) {
    log(`Error generating SLIs: ${error}`, "sli");
    return null;
  }
}

/**
 * First-time SLI creation for a student, triggered when Foundation Session 3
 * completes (Feature List §E5: "SLI Completion Celebration — When: Foundation
 * Session 3 complete"). Nothing else on the platform ever created this row —
 * `generateSLIs` above was reachable only through the admin-only
 * `POST /api/admin/users/:userId/slis/generate` route, so a student who
 * finished Foundation had no SLI, no dashboard statement, and nothing for
 * Positioning Refresh to refresh.
 *
 * Generates the same three candidates the admin flow does, then activates one
 * automatically rather than presenting a picker — the platform has no
 * documented student-facing selection UI post-Foundation (the old
 * `/sli-selection` page is dead-redirected), and the dashboard/completion-email
 * copy both assume a single resolved SLI statement exists the moment Session 3
 * ends, not a pending choice. The model's own `recommendedIndex` picks which
 * candidate to activate; the other two are kept as `candidate` rows rather
 * than discarded, so a future "here were your other options" surface has real
 * data to work with.
 *
 * Idempotent: a student who already has a live SLI (prior admin generation,
 * a re-run of Session 3, re-entry) is left alone rather than getting a second,
 * competing one activated out from under them.
 *
 * Never throws — this runs fire-and-forget after the Session 3 stream has
 * already closed, alongside `classifySession`/`scoreSession`, and a failure
 * here must not take those down or surface as an unhandled rejection.
 */
export async function ensureSliGenerated(
  userId: number,
  generatedInSessionId: number | null,
): Promise<void> {
  try {
    const existing = await sliStore.getActive(userId);
    if (existing) {
      log(`User ${userId} already has a live SLI (${existing.status}) — skipping auto-generation`, "sli");
      return;
    }

    const userProfile = await profileStore.getUserProfile(userId);
    if (!userProfile) {
      log(`ensureSliGenerated: no profile for user ${userId}`, "sli");
      return;
    }

    const generated = await generateSLIs(userProfile);
    if (!generated) {
      log(`ensureSliGenerated: generateSLIs returned nothing for user ${userId}`, "sli");
      return;
    }

    const candidates = await sliStore.createCandidates(userId, generated as unknown as Record<string, any>, {
      generatedInSessionId,
    });
    if (!candidates.length) {
      log(`ensureSliGenerated: no candidates persisted for user ${userId}`, "sli");
      return;
    }

    const chosen =
      (generated.recommendedIndex && candidates[generated.recommendedIndex - 1]) || candidates[0];

    await sliStore.markActive(chosen.id);
    log(
      `Auto-activated SLI ${chosen.id} for user ${userId} from session ${generatedInSessionId ?? "n/a"}` +
        (generated.recommendedIndex ? " (model recommendation)" : " (fallback: first candidate)"),
      "sli",
    );
  } catch (error) {
    log(`ensureSliGenerated failed for user ${userId}: ${error}`, "sli");
  }
}

import { Anthropic } from '@anthropic-ai/sdk';
import { InsertSli, UserProfile } from '@shared/schema';
import { log } from './vite';
import { analyzeDocument } from './claude';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-opus-20240229';

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
 * Gets foundation sessions completion data formatted as conversation summary
 */
async function getFoundationSessionsSummary(foundationSessions: any[]): Promise<string> {
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
  
  let summaryText = "Foundation Sessions Summary:\n";
  
  completedSessions.forEach(session => {
    const data = session.completionData;
    
    if (session.sessionNumber === 1) {
      summaryText += `\n=== Session 1: Functional Identity Mapping ===\n`;
      if (data.primaryFunction) summaryText += `Primary Function: ${data.primaryFunction}\n`;
      if (data.secondaryFunction) summaryText += `Secondary Function: ${data.secondaryFunction}\n`;
      if (data.functionalSplit) {
        summaryText += `Functional Split: ${data.functionalSplit.primary}% primary, ${data.functionalSplit.secondary}% secondary\n`;
      }
      summaryText += `Anti-Generalist Commitment: ${data.antiGeneralistCommitment ? 'Yes' : 'No'}\n`;
      if (data.commitmentStatement) summaryText += `Commitment: ${data.commitmentStatement}\n`;
      if (data.functionalLanguageExamples && data.functionalLanguageExamples.length > 0) {
        summaryText += `Functional Language Examples: ${data.functionalLanguageExamples.join(', ')}\n`;
      }
      if (data.keyInsights && data.keyInsights.length > 0) {
        summaryText += `Key Insights: ${data.keyInsights.join(', ')}\n`;
      }
      if (data.confidence) summaryText += `Confidence Level: ${data.confidence}/10\n`;
      if (data.reasoning) summaryText += `Reasoning: ${data.reasoning}\n`;
    }
    
    if (session.sessionNumber === 2) {
      summaryText += `\n=== Session 2: Credibility Assessment ===\n`;
      if (data.credibilityTier) summaryText += `Credibility Tier: ${data.credibilityTier}/5\n`;
      if (data.brandClaim) summaryText += `Brand Claim: ${data.brandClaim}\n`;
      if (data.checkWorthyReason) summaryText += `Check-Worthy Reason: ${data.checkWorthyReason}\n`;
      if (data.proofBullets && data.proofBullets.length > 0) {
        summaryText += `Proof Points:\n`;
        data.proofBullets.forEach((bullet: string, index: number) => {
          summaryText += `  ${index + 1}. ${bullet}\n`;
        });
      }
      if (data.nextSteps && data.nextSteps.length > 0) {
        summaryText += `Next Steps: ${data.nextSteps.join(', ')}\n`;
      }
    }
    
    if (session.sessionNumber === 3) {
      summaryText += `\n=== Session 3: Positioning Story Development ===\n`;
      if (data.signatureStory) {
        const story = data.signatureStory;
        summaryText += `Signature Story: ${story.title}\n`;
        summaryText += `Context: ${story.context}\n`;
        summaryText += `Challenge: ${story.challenge}\n`;
        summaryText += `Approach: ${story.approach}\n`;
        summaryText += `Tension: ${story.tension}\n`;
        summaryText += `Outcome: ${story.outcome}\n`;
        summaryText += `Repeatability: ${story.repeatability}\n`;
      }
      if (data.contentAngles && data.contentAngles.length > 0) {
        summaryText += `Content Angles: ${data.contentAngles.join(', ')}\n`;
      }
      if (data.methodology) summaryText += `Methodology: ${data.methodology}\n`;
    }
    
    if (session.completedAt) {
      summaryText += `Completed: ${new Date(session.completedAt).toLocaleDateString()}\n`;
    }
  });
  
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
    
    // Get foundation sessions summary
    const foundationSessionsSummary = await getFoundationSessionsSummary(userProfile.foundationSessions || []);
    
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
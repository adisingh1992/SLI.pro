import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import {
  insertFoundationSessionMessageSchema,
  updateFoundationSessionSchema,
} from "../shared/schema";
import Anthropic from "@anthropic-ai/sdk";
import { getPromptSet } from "./prompts";

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
};


// Format resume documents into a summary for system prompt context
async function formatResumeSummary(userId: number): Promise<string> {
  try {
    const documents = await storage.getDocuments(userId);
    const resumeDocuments = documents.filter((doc) => doc.type === "resume");

    if (!resumeDocuments || resumeDocuments.length === 0) {
      return "";
    }

    // Use the most recent resume (last uploaded)
    const resume = resumeDocuments[resumeDocuments.length - 1];

    if (!resume.analysisContent && !resume.name) {
      return "";
    }

    return `
═══════════════════════════════════════════════════════════════
USER RESUME SUMMARY
═══════════════════════════════════════════════════════════════

Document Name: ${resume.name}
${resume.analysisContent ? `\nResume Content Analysis:\n${resume.analysisContent}` : ""}

CRITICAL: The user has already uploaded their resume. Use this information to provide personalized coaching based on their actual experience and background. Reference specific details from their resume naturally in your guidance.
═══════════════════════════════════════════════════════════════
`;
  } catch (error) {
    console.error("Error formatting resume summary:", error);
    return "";
  }
}

// Format questionnaire data into analysis context
function formatQuestionnaireContext(questionnaire: any): string {
  if (!questionnaire) {
    return "";
  }

  return `
═══════════════════════════════════════════════════════════════
BACKGROUND CONTEXT: USER QUESTIONNAIRE
═══════════════════════════════════════════════════════════════

Industry: ${questionnaire.industry ?? "Not specified"}
Professional Background: ${questionnaire.background ?? "Not provided"}
Career Goals: ${questionnaire.goals ?? "Not specified"}
Aspirations: ${questionnaire.aspirations ?? "Not provided"}
Challenges: ${questionnaire.challenges ?? "Not specified"}
Interests: ${questionnaire.interests ?? "Not provided"}
Timeframe: ${questionnaire.timeframe ?? "Not specified"}

NOTE: This context was provided by the user in their initial questionnaire. The conversation transcript may reference this information without repeating it explicitly. Do not expect these details to be re-stated in the current conversation.
═══════════════════════════════════════════════════════════════
`;
}

// Format previous session context for analysis
async function formatPreviousSessionsContext(
  userId: number,
  currentSessionNumber: number,
): Promise<string> {
  try {
    const sessions = await storage.getFoundationSessions(userId);

    if (!sessions || sessions.length === 0) {
      return "";
    }

    let context = "";

    // For Session 2, include Session 1 summary
    if (currentSessionNumber === 2) {
      const session1 = sessions.find(
        (s) => s.sessionNumber === 1 && s.status === "completed",
      );
      if (session1?.completionData) {
        const data = session1.completionData;
        context += `
═══════════════════════════════════════════════════════════════
BACKGROUND CONTEXT: SESSION 1 (Functional Identity)
═══════════════════════════════════════════════════════════════

Primary Function: ${data.primaryFunction ?? "Not determined"}
Secondary Function: ${data.secondaryFunction ?? "None"}
Functional Split: ${data.functionalSplit ? `${data.functionalSplit.primary}% primary / ${data.functionalSplit.secondary}% secondary` : "Not specified"}
Commitment: ${data.commitmentStatement ?? "Not made"}

NOTE: The user has already established their functional identity in Session 1. The conversation may reference this without repeating the full exercise.
═══════════════════════════════════════════════════════════════
`;
      }
    }

    // For Session 3, include Session 1 and 2 summaries
    if (currentSessionNumber === 3) {
      const session1 = sessions.find(
        (s) => s.sessionNumber === 1 && s.status === "completed",
      );
      const session2 = sessions.find(
        (s) => s.sessionNumber === 2 && s.status === "completed",
      );

      if (session1?.completionData) {
        const data = session1.completionData;
        context += `
═══════════════════════════════════════════════════════════════
BACKGROUND CONTEXT: SESSION 1 (Functional Identity)
═══════════════════════════════════════════════════════════════

Primary Function: ${data.primaryFunction ?? "Not determined"}
Commitment: ${data.commitmentStatement ?? "Not made"}
`;
      }

      if (session2?.completionData) {
        const data = session2.completionData;
        const proofBulletsText =
          data.proofBullets
            ?.slice(0, 3)
            ?.map((bullet: string) => `• ${bullet}`)
            ?.join("\n") ?? "";

        context += `
SESSION 2 (Credibility & Proof)
═══════════════════════════════════════════════════════════════

Credibility Tier: ${data.credibilityTier ? `Tier ${data.credibilityTier}` : "Not assessed"}
Brand Claim: ${data.brandClaim ?? "Not established"}
${proofBulletsText ? `Top Proof Points:\n${proofBulletsText}` : ""}

NOTE: The user has completed Sessions 1 & 2 covering functional identity and credibility proof. The conversation may build upon this foundation without repeating prior work.
═══════════════════════════════════════════════════════════════
`;
      }
    }

    return context;
  } catch (error) {
    console.error("Error formatting previous sessions context:", error);
    return "";
  }
}


// Check if a foundation session should be automatically completed
async function checkSessionCompletion(
  userId: number,
  sessionNumber: number,
  messages: any[],
  userProfile: any,
): Promise<{ shouldComplete: boolean; completionData?: any }> {
  if (sessionNumber !== 1 && sessionNumber !== 2 && sessionNumber !== 3) {
    return { shouldComplete: false };
  }

  // Check if we have enough conversation for meaningful analysis
  if (messages.length < 10) {
    // Need at least 5 back-and-forth exchanges for a complete conversation
    return { shouldComplete: false };
  }

  try {
    // Fetch questionnaire and previous sessions context for analysis
    const questionnaire = await storage.getQuestionnaire(userId);
    const questionnaireContext = formatQuestionnaireContext(questionnaire);
    const previousSessionsContext = await formatPreviousSessionsContext(
      userId,
      sessionNumber,
    );

    const promptSet = getPromptSet(userProfile?.professionalStatus);
    const analysisPrompt = promptSet.getAnalysisPrompt(
      sessionNumber,
      messages,
      questionnaireContext,
      previousSessionsContext,
    );


    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      system:
        "You are an expert at analyzing coaching conversations. Always respond with valid JSON only.",
      messages: [{ role: "user", content: analysisPrompt }],
      max_tokens: 1000,
      temperature: 0.1,
    });

    const analysisContent =
      response.content[0].type === "text" ? response.content[0].text : "";
    const analysis = JSON.parse(analysisContent);

    if (analysis.isComplete && analysis.primaryFunction) {
      let completionData: any = {
        primaryFunction: analysis.primaryFunction,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        completedAt: new Date().toISOString(),
      };

      if (sessionNumber === 1) {
        // Session 1 specific data
        completionData.secondaryFunction = analysis.secondaryFunction;
        completionData.functionalSplit = analysis.functionalSplit;
        completionData.keyInsights = analysis.keyInsights;
      } else if (sessionNumber === 2) {
        // Session 2 specific data
        completionData.credibilityTier = analysis.credibilityTier;
        completionData.proofBullets = analysis.proofBullets;
        completionData.brandClaim = analysis.brandClaim;
        completionData.checkWorthyReason = analysis.checkWorthyReason;
        completionData.nextSteps = analysis.nextSteps;
      } else if (sessionNumber === 3) {
        // Session 3 specific data
        completionData.signatureStory = analysis.signatureStory;
        completionData.brandClaim = analysis.brandClaim;
        completionData.contentAngles = analysis.contentAngles;
        completionData.methodology = analysis.methodology;
        completionData.nextSteps = analysis.nextSteps;
      }

      return {
        shouldComplete: true,
        completionData,
      };
    }

    return { shouldComplete: false };
  } catch (error) {
    console.error("Error checking session completion:", error);
    return { shouldComplete: false };
  }
}

export function registerFoundationSessionsRoutes(app: Express) {
  // Get all foundation sessions for the current user
  app.get(
    "/api/foundation-sessions",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.user!.id;

        // Initialize foundation sessions for the user if they don't exist
        await initializeFoundationSessions(userId);

        const sessions = await storage.getFoundationSessions(userId);
        res.json(sessions);
      } catch (error) {
        console.error("Error fetching foundation sessions:", error);
        next(error);
      }
    },
  );

  // Get a specific foundation session with messages
  app.get(
    "/api/foundation-sessions/:sessionNumber",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseInt(req.params.sessionNumber);
        const userId = req.user!.id;

        if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
          return res
            .status(400)
            .json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        // Initialize foundation sessions for the user if they don't exist
        await initializeFoundationSessions(userId);

        const session = await storage.getFoundationSession(
          userId,
          sessionNumber,
        );
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        const messages = await storage.getFoundationSessionMessages(session.id);

        res.json({
          session,
          messages,
        });
      } catch (error) {
        console.error("Error fetching foundation session:", error);
        next(error);
      }
    },
  );

  // Start a foundation session
  app.post(
    "/api/foundation-sessions/:sessionNumber/start",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseInt(req.params.sessionNumber);
        const userId = req.user!.id;

        if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
          return res
            .status(400)
            .json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        // Initialize foundation sessions for the user if they don't exist
        await initializeFoundationSessions(userId);

        const session = await storage.getFoundationSession(
          userId,
          sessionNumber,
        );
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Check if session can be started
        if (session.status === "locked") {
          return res.status(403).json({
            error: "Session is locked. Complete previous sessions first",
          });
        }

        if (session.status === "completed") {
          return res
            .status(400)
            .json({ error: "Session is already completed" });
        }

        // Update session status to in_progress and set startedAt
        const updatedSession = await storage.updateFoundationSession(
          session.id,
          {
            status: "in_progress" as const,
            startedAt: new Date(),
          },
        );

        // Create initial guidance message for the session (only if no messages exist)
        const existingMessages = await storage.getFoundationSessionMessages(
          session.id,
        );
        if (existingMessages.length === 0) {
          const startUserProfile = await storage.getUserProfile(userId);
          const startPromptSet = getPromptSet(startUserProfile?.professionalStatus);
          const initialMessage = startPromptSet.getInitialGuidanceMessage(sessionNumber);
          if (initialMessage) {
            await storage.createFoundationSessionMessage({
              sessionId: session.id,
              role: "assistant",
              content: initialMessage,
            });
          }
        }

        res.json(updatedSession);
      } catch (error) {
        console.error("Error starting foundation session:", error);
        next(error);
      }
    },
  );

  // Add a message to a foundation session
  app.post(
    "/api/foundation-sessions/:sessionNumber/messages",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseInt(req.params.sessionNumber);
        const userId = req.user!.id;

        if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
          return res
            .status(400)
            .json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        const session = await storage.getFoundationSession(
          userId,
          sessionNumber,
        );
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        if (
          session.status !== "in_progress" &&
          session.status !== "completed"
        ) {
          return res.status(400).json({
            error: "Session must be in progress or completed to add messages",
          });
        }

        // Validate message data
        const messageValidation =
          insertFoundationSessionMessageSchema.safeParse({
            ...req.body,
            sessionId: session.id,
          });

        if (!messageValidation.success) {
          return res.status(400).json({
            error: "Validation failed",
            details: messageValidation.error.errors,
          });
        }

        const message = await storage.createFoundationSessionMessage(
          messageValidation.data,
        );
        res.status(201).json(message);
      } catch (error) {
        console.error("Error adding foundation session message:", error);
        next(error);
      }
    },
  );

  // End a foundation session early - mirrors normal auto-completion flow
  app.post(
    "/api/foundation-sessions/:sessionNumber/end-early",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseInt(req.params.sessionNumber);
        const userId = req.user!.id;

        if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
          return res
            .status(400)
            .json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        const session = await storage.getFoundationSession(
          userId,
          sessionNumber,
        );
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        if (session.status !== "in_progress") {
          return res.status(400).json({
            error: "Session must be in progress to end early",
          });
        }

        // Run the same Claude analysis used by normal auto-completion
        const messages = await storage.getFoundationSessionMessages(session.id);
        const userProfile = await storage.getUserProfile(userId);
        const completionCheck = await checkSessionCompletion(
          userId,
          sessionNumber,
          messages,
          userProfile,
        );

        // Use analyzer's completionData when available; otherwise fall back to a
        // minimal stub so the session is still marked completed.
        const completionData = completionCheck.completionData ?? {
          endedEarly: true,
          completedAt: new Date().toISOString(),
        };

        const updatedSession = await storage.updateFoundationSession(
          session.id,
          {
            status: "completed",
            completedAt: new Date(),
            completionData,
          },
        );

        // Unlock next session if it exists (mirrors auto-completion branch)
        if (sessionNumber < 3) {
          const nextSession = await storage.getFoundationSession(
            userId,
            sessionNumber + 1,
          );
          if (nextSession && nextSession.status === "locked") {
            await storage.updateFoundationSession(nextSession.id, {
              status: "available",
            });
          }
        }

        res.json({
          session: updatedSession,
          sessionNumber,
          completionData,
        });
      } catch (error) {
        console.error("Error ending foundation session early:", error);
        next(error);
      }
    },
  );

  // Update foundation session (for completion and progress tracking)
  app.patch(
    "/api/foundation-sessions/:sessionNumber",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseInt(req.params.sessionNumber);
        const userId = req.user!.id;

        if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
          return res
            .status(400)
            .json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        const session = await storage.getFoundationSession(
          userId,
          sessionNumber,
        );
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Validate update data
        const updateValidation = updateFoundationSessionSchema.safeParse(
          req.body,
        );
        if (!updateValidation.success) {
          return res.status(400).json({
            error: "Validation failed",
            details: updateValidation.error.errors,
          });
        }

        const updateData = updateValidation.data;

        // Enforce valid state transitions - prevent bypassing sequential unlocking
        // Locked sessions cannot be updated at all
        if (session.status === "locked") {
          return res.status(403).json({
            error:
              "Cannot update locked session. Complete previous sessions first",
          });
        }

        if (updateData.status) {
          // Only allow specific status transitions
          if (updateData.status === "completed") {
            // Only sessions that are in_progress can be marked as completed
            if (session.status !== "in_progress") {
              return res.status(400).json({
                error: "Session must be in progress to mark as completed",
              });
            }
          } else if (updateData.status === "in_progress") {
            // Only available sessions can be started
            if (session.status !== "available") {
              return res.status(400).json({
                error: "Session must be available to start",
              });
            }
          } else {
            // Disallow other arbitrary status changes
            return res.status(400).json({
              error:
                "Invalid status transition. Use the appropriate endpoints to start or complete sessions",
            });
          }
        }

        // If marking as completed, set completedAt and unlock next session
        if (updateData.status === "completed") {
          updateData.completedAt = new Date();

          // Unlock next session if it exists (atomic operation would be better)
          if (sessionNumber < 3) {
            const nextSession = await storage.getFoundationSession(
              userId,
              sessionNumber + 1,
            );
            if (nextSession && nextSession.status === "locked") {
              await storage.updateFoundationSession(nextSession.id, {
                status: "available",
              });
            }
          }
        }

        const updatedSession = await storage.updateFoundationSession(
          session.id,
          updateData,
        );
        res.json(updatedSession);
      } catch (error) {
        console.error("Error updating foundation session:", error);
        next(error);
      }
    },
  );

  // Streaming chat endpoint for Foundation Sessions with Claude integration
  app.post(
    "/api/foundation-sessions/:sessionNumber/messages/stream",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseInt(req.params.sessionNumber);
        const userId = req.user!.id;

        if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
          return res
            .status(400)
            .json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        const session = await storage.getFoundationSession(
          userId,
          sessionNumber,
        );
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        if (
          session.status !== "in_progress" &&
          session.status !== "completed"
        ) {
          return res.status(400).json({
            error: "Session must be in progress or completed to send messages",
          });
        }

        const { content } = req.body;
        if (!content || typeof content !== "string") {
          return res.status(400).json({ error: "Message content is required" });
        }

        // Save user message
        const userMessage = await storage.createFoundationSessionMessage({
          sessionId: session.id,
          role: "user",
          content: content.trim(),
        });

        // Get all messages from this session for context
        const messages = await storage.getFoundationSessionMessages(session.id);

        // Format messages for Claude API
        const formattedMessages = messages.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        }));

        // Get user profile data for context
        const userProfile = await storage.getUserProfile(userId);

        // Get resume summary for context
        const resumeSummary = await formatResumeSummary(userId);

        // Get ALL prior sessions' completion data and conversation transcripts
        let allPriorSessionsContext: Array<{
          sessionNumber: number;
          completionData: any;
          conversationTranscript: string;
        }> = [];
        if (sessionNumber > 1) {
          for (let i = 1; i < sessionNumber; i++) {
            const priorSession = await storage.getFoundationSession(userId, i);
            if (
              priorSession?.status === "completed" &&
              priorSession.completionData
            ) {
              const priorMessages = await storage.getFoundationSessionMessages(
                priorSession.id,
              );
              const maxTranscriptChars = 8000;
              let transcript = priorMessages
                .map(
                  (msg) =>
                    `${msg.role === "user" ? "USER" : "COACH"}: ${msg.content}`,
                )
                .join("\n\n");
              if (transcript.length > maxTranscriptChars) {
                transcript =
                  transcript.slice(0, maxTranscriptChars) +
                  "\n\n[... transcript trimmed for brevity — key details captured in session summary above]";
              }
              allPriorSessionsContext.push({
                sessionNumber: i,
                completionData: priorSession.completionData,
                conversationTranscript: transcript,
              });
            }
          }
        }

        // Set up SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // Send user message ID first
        res.write(
          `data: ${JSON.stringify({ type: "user_message", id: userMessage.id })}\n\n`,
        );

        // Initialize empty assistant content for accumulation
        let assistantContent = "";

        // Generate Foundation Session-specific system prompt using profile-aware prompt set
        const promptSet = getPromptSet(userProfile?.professionalStatus);
        const systemPrompt = promptSet.getSystemPrompt({
          sessionNumber,
          resumeSummary,
          priorSessions: allPriorSessionsContext.length > 0 ? allPriorSessionsContext : undefined,
        });


        const response = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          system: systemPrompt,
          messages: formattedMessages,
          max_tokens: 4096,
          temperature: 0.7,
          stream: true,
        });

        for await (const chunk of response) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            const content = chunk.delta.text;
            assistantContent += content;

            // Send the chunk to the client
            res.write(
              `data: ${JSON.stringify({ type: "chunk", content })}\n\n`,
            );
          }
        }

        // Save complete assistant message
        const assistantMessage = await storage.createFoundationSessionMessage({
          sessionId: session.id,
          role: "assistant",
          content: assistantContent,
        });

        // Check if session should be automatically completed
        const allMessages = await storage.getFoundationSessionMessages(
          session.id,
        );
        const completionCheck = await checkSessionCompletion(
          userId,
          sessionNumber,
          allMessages,
          userProfile,
        );

        if (completionCheck.shouldComplete) {
          // Automatically complete the session with the extracted data
          await storage.updateFoundationSession(session.id, {
            status: "completed",
            completedAt: new Date(),
            completionData: completionCheck.completionData,
          });

          // Unlock next session if it exists
          if (sessionNumber < 3) {
            const nextSession = await storage.getFoundationSession(
              userId,
              sessionNumber + 1,
            );
            if (nextSession && nextSession.status === "locked") {
              await storage.updateFoundationSession(nextSession.id, {
                status: "available",
              });
            }
          }

          // Send completion notification
          res.write(
            `data: ${JSON.stringify({
              type: "session_completed",
              sessionNumber,
              completionData: completionCheck.completionData,
            })}\n\n`,
          );
        }

        // Send final message with assistant message ID
        res.write(
          `data: ${JSON.stringify({
            type: "complete",
            id: assistantMessage.id,
            content: assistantContent,
          })}\n\n`,
        );

        res.end();
      } catch (error) {
        console.error("Error in Foundation Session streaming chat:", error);
        res.write(
          `data: ${JSON.stringify({ type: "error", message: "Failed to generate response" })}\n\n`,
        );
        res.end();
      }
    },
  );

  // Update timer elapsed time for a foundation session
  app.patch(
    "/api/foundation-sessions/:sessionNumber/timer",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseInt(req.params.sessionNumber);
        const userId = req.user!.id;
        const { timerElapsed } = req.body;

        if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
          return res
            .status(400)
            .json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        if (typeof timerElapsed !== "number" || timerElapsed < 0) {
          return res
            .status(400)
            .json({ error: "timerElapsed must be a non-negative number" });
        }

        const session = await storage.getFoundationSession(
          userId,
          sessionNumber,
        );
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Only update timer for in-progress sessions
        if (session.status !== "in_progress") {
          return res.status(400).json({
            error: "Timer can only be updated for in-progress sessions",
          });
        }

        // Update the timer elapsed time
        const updatedSession = await storage.updateFoundationSession(
          session.id,
          {
            timerElapsed,
          },
        );

        res.json({
          timerElapsed: updatedSession?.timerElapsed || timerElapsed,
        });
      } catch (error) {
        console.error("Error updating foundation session timer:", error);
        next(error);
      }
    },
  );
}

// Helper function to initialize foundation sessions for a user
async function initializeFoundationSessions(userId: number) {
  try {
    const existingSessions = await storage.getFoundationSessions(userId);

    // If user already has sessions, no need to initialize
    if (existingSessions.length > 0) {
      return;
    }

    // Create the three foundation sessions
    const sessionsToCreate = [
      {
        userId,
        sessionNumber: 1,
        status: "available" as const, // Session 1 is available by default
      },
      {
        userId,
        sessionNumber: 2,
        status: "locked" as const, // Sessions 2 and 3 are locked initially
      },
      {
        userId,
        sessionNumber: 3,
        status: "locked" as const,
      },
    ];

    for (const sessionData of sessionsToCreate) {
      await storage.createFoundationSession(sessionData);
    }
  } catch (error) {
    console.error("Error initializing foundation sessions:", error);
    throw error;
  }
}

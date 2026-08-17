import { Express, Request, Response, NextFunction } from "express";
import { parseJsonResponse } from "./json-response";
import { storage } from "./storage";
import { getPromptSet } from "./prompts";
import { buildStudentContext } from "./wing/student-context";
import * as orchestrator from "./orchestrator";
import * as store from "./wing/session-store";
import type { WingSessionType, ArtifactType } from "./wing/session-store";
import { isAiTurn } from "./wing/turn-type";
import * as objectiveRuntime from "./wing/objective-runtime";
import * as engagement from "./wing/engagement";
import type { PriorSessionContext } from "./prompts/types";
import * as docStore from "./wing/document-store";
import * as intakeStore from "./wing/intake-store";
import * as profileStore from "./wing/profile-store";
import * as engine from "./wing/engine";
import * as voice from "./wing/voice";
import * as scoring from "./wing/scoring";
import * as classifier from "./wing/classifier";

/**
 * Foundation Sessions — running natively on the Wing schema.
 *
 * Sessions, transcripts, turns and artifacts all live in `wing`; the MVP's
 * foundation_sessions / foundation_session_messages tables are no longer used.
 *
 * API SHAPE (follows the new model):
 *   GET  /api/foundation-sessions            -> WingSession[]
 *   GET  /api/foundation-sessions/:n         -> { session, turns, artifacts }
 *   POST /api/foundation-sessions/:n/start
 *   POST /api/foundation-sessions/:n/messages
 *   POST /api/foundation-sessions/:n/messages/stream   (SSE)
 *   POST /api/foundation-sessions/:n/end-early
 *   PATCH /api/foundation-sessions/:n
 *   PATCH /api/foundation-sessions/:n/timer
 *
 * `:n` remains 1|2|3 in the URL — it is the product's language for the arc —
 * and maps to session_type foundation_1..3 internally.
 *
 * Turns carry provenance assigned at capture; there is no separate mirroring
 * step any more. Forward-locking is engine logic here in the route layer, per
 * spec §8 ("prerequisites are engine logic, not schema").
 */

const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Not authenticated" });
};

/**
 * The published completion criteria for a population/session, rendered for the
 * surface that asked.
 *
 * Returns undefined when nothing is published, which makes the prompt file fall
 * back to its own hardcoded list — so this is adoptable one session at a time
 * and an empty table changes nothing.
 *
 * `professionalStatus` maps to the prompt set via getPromptSet; the default
 * there is mid_career_or_senior, and this must agree with it or a student
 * would get one set's criteria inside another set's prompt.
 */
async function resolveCompletionCriteria(
  professionalStatus: string | null | undefined,
  sessionNumber: number,
  surface: "conversation" | "analysis",
): Promise<string | undefined> {
  try {
    const criteriaStore = await import("./wing/completion-criteria-store");
    const populationTag =
      professionalStatus === "undergraduate_or_recent_grad" ||
      professionalStatus === "early_career"
        ? professionalStatus
        : "mid_career_or_senior";

    const published = await criteriaStore.getPublished(
      populationTag,
      sessionTypeFor(sessionNumber),
    );
    if (!published) return undefined;

    return surface === "conversation"
      ? criteriaStore.renderForConversation(published.criteria)
      : criteriaStore.renderForAnalysis(published.criteria);
  } catch (error) {
    // Never break a session over this — the prompt file's own list is the
    // safe fallback, and it is what ran before the table existed.
    console.error("[criteria] resolution failed, using prompt defaults:", error);
    return undefined;
  }
}

/**
 * Published analysis methodology for this population/session, or undefined.
 *
 * Analysis only — unlike completion criteria, there is no conversation-side
 * counterpart. Methodology describes how to read a FINISHED transcript, which
 * is not something the live conversation needs to be told.
 */
async function resolveAnalysisMethodology(
  professionalStatus: string | null | undefined,
  sessionNumber: number,
): Promise<string | undefined> {
  try {
    const store = await import("./wing/analysis-methodology-store");
    const populationTag =
      professionalStatus === "undergraduate_or_recent_grad" ||
      professionalStatus === "early_career"
        ? professionalStatus
        : "mid_career_or_senior";

    const published = await store.getPublished(
      populationTag,
      sessionTypeFor(sessionNumber),
    );
    if (!published) return undefined;

    return store.renderForAnalysis(published.sections);
  } catch (error) {
    console.error("[methodology] resolution failed, using prompt defaults:", error);
    return undefined;
  }
}

/** Artifact type produced by each Foundation Session (spec §8). */
const ARTIFACT_FOR_SESSION: Record<number, ArtifactType> = {
  1: "functional_identity",
  2: "credibility_assessment",
  3: "signature_story",
};

function sessionTypeFor(n: number): WingSessionType {
  return `foundation_${n}` as WingSessionType;
}

function parseSessionNumber(raw: string): number | null {
  const n = parseInt(raw);
  return Number.isNaN(n) || n < 1 || n > 3 ? null : n;
}

/** Presentation shape for the client — session plus its arc position. */
function toApiSession(row: any) {
  return {
    id: row.id,
    sessionType: row.sessionType,
    sessionNumber: store.foundationNumber(row.sessionType),
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    timerElapsedSeconds: row.timerElapsedSeconds,
    createdAt: row.createdAt,
  };
}

/**
 * The `buildStudentContext` sections that come from a file the student uploaded.
 *
 * IG-U03, the user-uploaded data handling gate, only applies when Wing is working
 * from uploaded data — it must confirm what it found and disclose what it infers.
 * `intake` and `pathway:*` are answers the student typed into a form, so they are
 * deliberately not in this list: they are the student's words already, not a file
 * Wing read on their behalf and is now interpreting.
 */
const UPLOADED_SECTIONS: readonly string[] = ["linkedin", "resume", "supplementary"];

/* ── Context builders (unchanged behaviour, wing-backed) ────────────────── */

async function formatResumeSummary(userId: number): Promise<string> {
  try {
    // Documents remain on the legacy table until the documents/intake slice.
    const documents = await docStore.getDocuments(userId);
    const resumeDocuments = documents.filter((doc) => doc.type === "resume");
    if (!resumeDocuments.length) return "";

    const resume = resumeDocuments[resumeDocuments.length - 1];
    if (!resume.analysisContent && !resume.name) return "";

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

function formatQuestionnaireContext(questionnaire: any): string {
  if (!questionnaire) return "";
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

/**
 * Prior-session context, now read from typed artifacts rather than the MVP's
 * completionData blob.
 */
async function formatPreviousSessionsContext(
  studentId: number,
  currentSessionNumber: number,
): Promise<string> {
  try {
    let context = "";

    const priorNumbers = currentSessionNumber === 2 ? [1]
      : currentSessionNumber === 3 ? [1, 2]
      : [];

    for (const n of priorNumbers) {
      const prior = await store.getSession(studentId, sessionTypeFor(n));
      if (!prior || prior.status !== "completed") continue;

      const artifact = await store.getArtifact(prior.id, ARTIFACT_FOR_SESSION[n]);
      const data: any = artifact?.content;
      if (!data) continue;

      if (n === 1) {
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
      } else if (n === 2) {
        context += `
═══════════════════════════════════════════════════════════════
BACKGROUND CONTEXT: SESSION 2 (Professional Credibility)
═══════════════════════════════════════════════════════════════

Credibility Tier: ${data.credibilityTier ?? "Not determined"}
Brand Claim: ${data.brandClaim ?? "Not established"}
Proof Points: ${Array.isArray(data.proofBullets) ? data.proofBullets.join("; ") : "Not provided"}

NOTE: The user has already established their credibility position in Session 2.
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

/**
 * Structured prior-session context for prompt assembly.
 *
 * The prompt sets expect `PriorSessionContext[]` — the artifact payload plus
 * the prior conversation — rather than a pre-rendered string, so the prompt
 * layer decides how to present it.
 */
async function buildPriorSessionContexts(
  studentId: number,
  currentSessionNumber: number,
): Promise<PriorSessionContext[]> {
  const priorNumbers = [1, 2, 3].filter((n) => n < currentSessionNumber);
  const contexts: PriorSessionContext[] = [];

  for (const n of priorNumbers) {
    const prior = await store.getSession(studentId, sessionTypeFor(n));
    if (!prior || prior.status !== "completed") continue;

    const artifact = await store.getArtifact(prior.id, ARTIFACT_FOR_SESSION[n]);
    const turns = await store.getTurns(prior.id);

    contexts.push({
      sessionNumber: n,
      completionData: artifact?.content ?? null,
      // turn_type, not provenance_tag. Migrated turns are all
      // provenance_unknown by design, so keying on provenance labelled every
      // line of a migrated prior session "Student:" — including Wing's own —
      // and fed that to the next session as its memory of what happened.
      conversationTranscript: turns
        .map((t) => `${isAiTurn(t.turnType) ? "Wing" : "Student"}: ${t.content}`)
        .join("\n\n"),
    });
  }

  return contexts;
}

/**
 * Parses the analysis response into JSON.
 *
 * Models frequently wrap JSON in markdown fences or add a sentence of prose
 * around it, and a bare JSON.parse then throws — which previously surfaced as
 * "session never completes" rather than as an error, because the caller's
 * catch swallowed it. Strip fences, then fall back to the first {...} block.
 */

/** Decides whether the session is complete, and returns the artifact payload. */
export async function checkSessionCompletion(
  legacyUserId: number,
  studentId: number,
  sessionNumber: number,
  messages: any[],
  /**
   * The student's population, which selects the prompt set and criteria.
   *
   * Was `userProfile: any` — the whole composed profile, of which this was the
   * only field ever read. Passing the profile meant every caller had to build
   * one, and building one costs six queries including every document's full
   * extracted text. Narrowing the parameter is what makes it possible to stop
   * fetching that on the turn path.
   */
  professionalStatus: string | null | undefined,
  /**
   * Draft criteria to evaluate INSTEAD of the published ones.
   *
   * Used by replay testing: run a proposed edit against sessions that already
   * completed and see whether they still would. Exported and parameterised
   * rather than reimplemented so the replay exercises the real completion
   * path — a separate copy would drift and reassure you about the wrong code.
   */
  criteriaOverride?: string,
  /** Draft methodology to evaluate INSTEAD of the published sections. */
  methodologyOverride?: string,
): Promise<{ shouldComplete: boolean; completionData?: any }> {
  if (![1, 2, 3].includes(sessionNumber)) return { shouldComplete: false };

  // No turn-count gate: the methodology decides when a session is complete,
  // not an arbitrary message threshold. The analysis prompt returns
  // isComplete, and that is the decision.
  //
  // One guard remains: an empty transcript has nothing to analyse, and calling
  // the model on it just burns a request to be told "no".
  if (messages.length === 0) return { shouldComplete: false };

  try {
    const questionnaire = await intakeStore.getQuestionnaire(legacyUserId);
    const questionnaireContext = formatQuestionnaireContext(questionnaire);
    const previousSessionsContext = await formatPreviousSessionsContext(
      studentId,
      sessionNumber,
    );

    const promptSet = getPromptSet(professionalStatus);

    // The SAME criteria the conversation was given. When these were written
    // separately they drifted, and a session could satisfy everything it was
    // told to achieve while the analysis judged it incomplete.
    const criteria =
      criteriaOverride ??
      (await resolveCompletionCriteria(
        professionalStatus,
        sessionNumber,
        "analysis",
      ));

    // How to read the transcript, as opposed to what counts as done.
    const methodology =
      methodologyOverride ??
      (await resolveAnalysisMethodology(professionalStatus, sessionNumber));

    const analysisPrompt = promptSet.getAnalysisPrompt(
      sessionNumber,
      messages,
      questionnaireContext,
      previousSessionsContext,
      criteria,
      methodology,
    );

    // Structured analysis of the transcript -> mid tier.
    //
    // 4000, not 1000: the mid deployment is a reasoning model, and
    // max_completion_tokens covers its thinking as well as its output.
    // Analysing a full transcript exhausted a 1000-token budget on reasoning
    // and returned nothing at all, which surfaced only as "not JSON".
    const { text: analysisContent } = await orchestrator.complete({
      tier: "mid",
      system:
        "You are an expert at analyzing coaching conversations. Always respond with valid JSON only.",
      messages: [{ role: "user", content: analysisPrompt }],
      maxTokens: 4000,
      temperature: 0.1,
    });

    const analysis = parseJsonResponse(analysisContent, "Session analysis");

    if (!analysis.isComplete || !analysis.primaryFunction) {
      // Log WHY, not just that. The analysis model returns a `reasoning` field
      // explaining its verdict and per-session fields showing what it found;
      // printing only the two booleans made "the conversation is obviously
      // finished but the session won't close" impossible to diagnose without
      // re-running by hand.
      const detail: string[] = [
        `isComplete=${analysis.isComplete}`,
        `primaryFunction=${analysis.primaryFunction ?? "none"}`,
        `confidence=${analysis.confidence ?? "n/a"}`,
      ];

      if (sessionNumber === 2) {
        detail.push(
          `credibilityTier=${analysis.credibilityTier ?? "n/a"}`,
          `proofBullets=${Array.isArray(analysis.proofBullets) ? analysis.proofBullets.length : 0}`,
        );
        if (Array.isArray(analysis.credibilityGaps) && analysis.credibilityGaps.length) {
          detail.push(`gaps=[${analysis.credibilityGaps.join("; ")}]`);
        }
      }

      if (sessionNumber === 3 && Array.isArray(analysis.stories)) {
        detail.push(`stories=${analysis.stories.length}`);
      }

      console.log(
        `[foundation] session ${sessionNumber}: NOT COMPLETE — ${detail.join(", ")}`,
      );
      if (analysis.reasoning) {
        console.log(`[foundation] session ${sessionNumber}: reasoning — ${analysis.reasoning}`);
      }

      return { shouldComplete: false };
    }

    console.log(
      `[foundation] session ${sessionNumber}: COMPLETE — ${analysis.primaryFunction} ` +
        `(confidence ${analysis.confidence ?? "n/a"})`,
    );

    const completionData: any = {
      primaryFunction: analysis.primaryFunction,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      completedAt: new Date().toISOString(),
    };

    if (sessionNumber === 1) {
      completionData.secondaryFunction = analysis.secondaryFunction;
      completionData.functionalSplit = analysis.functionalSplit;
      completionData.keyInsights = analysis.keyInsights;
    } else if (sessionNumber === 2) {
      completionData.credibilityTier = analysis.credibilityTier;
      completionData.proofBullets = analysis.proofBullets;
      completionData.brandClaim = analysis.brandClaim;
      completionData.checkWorthyReason = analysis.checkWorthyReason;
      completionData.nextSteps = analysis.nextSteps;
    } else if (sessionNumber === 3) {
      completionData.signatureStory = analysis.signatureStory;
      completionData.brandClaim = analysis.brandClaim;
      completionData.contentAngles = analysis.contentAngles;
      completionData.methodology = analysis.methodology;
      completionData.nextSteps = analysis.nextSteps;
    }

    return { shouldComplete: true, completionData };
  } catch (error) {
    // Loud: a swallowed failure here looks like "the session never completes",
    // which is far harder to diagnose than an error.
    console.error(
      `[foundation] session ${sessionNumber}: completion check FAILED —`,
      error,
    );
    return { shouldComplete: false };
  }
}

/**
 * Creates the three Foundation Session rows on first access.
 * Session 1 is available; 2 and 3 are locked until prerequisites complete.
 */
async function initializeFoundationSessions(studentId: number) {
  const existing = await store.listSessions(studentId, store.FOUNDATION_TYPES);
  if (existing.length >= 3) return;

  const present = new Set(existing.map((s) => s.sessionType));
  for (const n of [1, 2, 3]) {
    const type = sessionTypeFor(n);
    if (present.has(type)) continue;
    await store.ensureSession(studentId, type, n === 1 ? "available" : "locked");
  }
}

/** Unlocks the next session in the arc once its prerequisite completes. */
async function unlockNextSession(studentId: number, completedNumber: number) {
  if (completedNumber >= 3) return;
  const next = await store.getSession(studentId, sessionTypeFor(completedNumber + 1));
  if (next && next.status === "locked") {
    await store.updateSessionStatus(next.id, "available");
  }
}

/* ── Routes ────────────────────────────────────────────────────────────── */

export function registerFoundationSessionsRoutes(app: Express) {
  /** All Foundation Sessions for the current student. */
  app.get(
    "/api/foundation-sessions",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const studentId = await store.studentIdFor(req.user as any);
        await initializeFoundationSessions(studentId);

        const rows = await store.listSessions(studentId, store.FOUNDATION_TYPES);
        res.json(rows.map(toApiSession));
      } catch (error) {
        console.error("Error fetching foundation sessions:", error);
        next(error);
      }
    },
  );

  /** One session with its turns and artifacts. */
  app.get(
    "/api/foundation-sessions/:sessionNumber",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseSessionNumber(req.params.sessionNumber);
        if (!sessionNumber) {
          return res.status(400).json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        const studentId = await store.studentIdFor(req.user as any);
        await initializeFoundationSessions(studentId);

        const session = await store.getSession(studentId, sessionTypeFor(sessionNumber));
        if (!session) return res.status(404).json({ error: "Session not found" });

        const [turns, artifacts] = await Promise.all([
          store.getTurns(session.id),
          store.getArtifacts(session.id),
        ]);

        res.json({ session: toApiSession(session), turns, artifacts });
      } catch (error) {
        console.error("Error fetching foundation session:", error);
        next(error);
      }
    },
  );

  /** Starts a session and seeds the opening guidance turn. */
  app.post(
    "/api/foundation-sessions/:sessionNumber/start",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseSessionNumber(req.params.sessionNumber);
        if (!sessionNumber) {
          return res.status(400).json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        const legacyUserId = req.user!.id;
        const studentId = await store.studentIdFor(req.user as any);
        await initializeFoundationSessions(studentId);

        const session = await store.getSession(studentId, sessionTypeFor(sessionNumber));
        if (!session) return res.status(404).json({ error: "Session not found" });

        if (session.status === "locked") {
          return res.status(403).json({ error: "Complete the previous session first" });
        }

        const updated = await store.startSession(session.id);

        // Opening guidance is Wing's first turn — captured as ai_prompt.
        if ((await store.countTurns(session.id)) === 0) {
          const promptSet = getPromptSet(
            await profileStore.getProfessionalStatus(legacyUserId),
          );
          const initialMessage = promptSet.getInitialGuidanceMessage(sessionNumber);
          if (initialMessage) {
            await store.addAiTurn(session.id, initialMessage);
          }
        }

        res.json(toApiSession(updated));
      } catch (error) {
        console.error("Error starting foundation session:", error);
        next(error);
      }
    },
  );

  /** Appends a single turn without invoking the model (used by tooling/tests). */
  app.post(
    "/api/foundation-sessions/:sessionNumber/messages",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseSessionNumber(req.params.sessionNumber);
        if (!sessionNumber) {
          return res.status(400).json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        const { content, role } = req.body ?? {};
        if (!content || typeof content !== "string") {
          return res.status(400).json({ error: "Message content is required" });
        }

        const studentId = await store.studentIdFor(req.user as any);
        const session = await store.getSession(studentId, sessionTypeFor(sessionNumber));
        if (!session) return res.status(404).json({ error: "Session not found" });

        const turn =
          role === "assistant"
            ? await store.addAiTurn(session.id, content.trim())
            : await store.addHumanTurn(session.id, content.trim());

        res.status(201).json(turn);
      } catch (error) {
        console.error("Error adding foundation session turn:", error);
        next(error);
      }
    },
  );

  /** Ends a session early — a distinct status, not a completion. */
  app.post(
    "/api/foundation-sessions/:sessionNumber/end-early",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseSessionNumber(req.params.sessionNumber);
        if (!sessionNumber) {
          return res.status(400).json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        const legacyUserId = req.user!.id;
        const studentId = await store.studentIdFor(req.user as any);
        const session = await store.getSession(studentId, sessionTypeFor(sessionNumber));
        if (!session) return res.status(404).json({ error: "Session not found" });

        // Ending early is a legitimate stopping point (feature list A3), so we
        // still run the analysis and capture whatever outcome the conversation
        // produced. A student who exits at a natural point should not lose the
        // work — the session is simply marked ended_early rather than completed.
        const messages = await store.getTurnsAsMessages(session.id);
        const professionalStatus = await profileStore.getProfessionalStatus(legacyUserId);

        const analysis = await checkSessionCompletion(
          legacyUserId,
          studentId,
          sessionNumber,
          messages,
          professionalStatus,
        );

        let artifactWritten = false;
        if (analysis.completionData) {
          await store.putArtifact({
            sessionId: session.id,
            artifactType: ARTIFACT_FOR_SESSION[sessionNumber],
            content: {
              ...analysis.completionData,
              // Mark provenance of the outcome itself: this came from a
              // truncated conversation, which matters when scoring later.
              endedEarly: true,
              complete: analysis.shouldComplete,
            },
            sourceType: "ai_generated",
          });
          artifactWritten = true;
        }

        // Seal the transcript, then record the distinct end state.
        await store.completeSession(session.id);
        const updated = await store.updateSessionStatus(session.id, "ended_early");

        // Only unlock the next session if the methodology considered this one
        // genuinely complete — ending early should not skip prerequisites.
        if (analysis.shouldComplete) {
          await unlockNextSession(studentId, sessionNumber);
        }

        console.log(
          `[foundation] session ${sessionNumber}: ended early ` +
            `(artifact=${artifactWritten}, methodologyComplete=${analysis.shouldComplete})`,
        );

        res.json({
          ...toApiSession(updated),
          artifactType: artifactWritten ? ARTIFACT_FOR_SESSION[sessionNumber] : null,
          content: analysis.completionData ?? null,
          methodologyComplete: analysis.shouldComplete,
        });

        // Ended-early sessions are classified and scored too: the heuristics
        // that fired before the student stopped still applied to them, and
        // excluding truncated sessions would bias the evidence toward sessions
        // that happened to run long. Classification precedes scoring.
        void classifier
          .classifySession(session.id)
          .then(() => scoring.scoreSession(session.id));
      } catch (error) {
        console.error("Error ending foundation session early:", error);
        next(error);
      }
    },
  );

  /** Streaming chat — the main conversational surface. */
  app.post(
    "/api/foundation-sessions/:sessionNumber/messages/stream",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseSessionNumber(req.params.sessionNumber);
        if (!sessionNumber) {
          return res.status(400).json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        const legacyUserId = req.user!.id;

        /*
         * Per-phase timing, logged once per turn.
         *
         * "The chat is slow" is not actionable, and every guess at it so far
         * has been wrong in an interesting way — the wait turned out to be
         * post-stream analysis, then a profile fetch nobody needed, then plain
         * network latency to a remote database. Printing the split means the
         * next person does not have to guess either.
         *
         * Four numbers, one line, no dependency.
         */
        const t0 = Date.now();
        const marks: Record<string, number> = {};
        const mark = (name: string) => {
          marks[name] = Date.now() - t0;
        };

        // One query, not two. See getSessionForUser — the pair was ~1.5s of
        // pure latency per turn against a remote database.
        const found = await store.getSessionForUser(
          legacyUserId,
          sessionTypeFor(sessionNumber),
        );
        const studentId = found?.studentId;
        const session = found?.session;
        if (!studentId || !session) {
          return res.status(404).json({ error: "Session not found" });
        }

        if (session.status !== "in_progress" && session.status !== "completed") {
          return res.status(400).json({
            error: "Session must be in progress or completed to send messages",
          });
        }

        const { content } = req.body ?? {};
        if (!content || typeof content !== "string") {
          return res.status(400).json({ error: "Message content is required" });
        }

        mark("session");

        /*
         * ── THE CONTEXT READS START HERE TOO ─────────────────────────────────
         * Same rule as the engine call below, applied one level further up, and
         * found by the same measurement.
         *
         * These three reads need `legacyUserId`, `studentId` and the session
         * number — all of which the session lookup has already returned. They
         * need nothing from the turn write or the transcript read, and yet they
         * sat behind both:
         *
         *   turns 3.0s | context 7.2s        two phases, strictly sequential
         *
         * Started here they run alongside the write and the read instead of
         * after them. The turn cannot proceed until both are done either way,
         * so the cost becomes the slower of the two rather than their sum.
         *
         * `buildStudentContext` is the expensive one — it reads the documents
         * and the intake record — and it stays on the critical path because
         * Wing genuinely needs it in the prompt. That is the A2 fix; dropping
         * it would take the coaching backwards to asking for things already in
         * the database. Overlapping it is the available win, not removing it.
         */
        const contextPromise = Promise.all([
          profileStore.getProfessionalStatus(legacyUserId),
          buildPriorSessionContexts(studentId, sessionNumber),
          /*
           * A2: everything Wing already knows, in the CONVERSATION prompt.
           *
           * This used to be `formatResumeSummary`, which filtered on
           * type === "resume" — so the LinkedIn PDF was uploaded, extracted,
           * stored, and never shown to Wing. Sessions then asked for the
           * headline that was sitting in the database, which is the exact
           * complaint A2 names.
           *
           * Worse, the intake answers reached only the ANALYSIS prompt. Live,
           * Wing knew nothing the student had already said, so it asked again.
           */
          buildStudentContext(legacyUserId),
        ]);

        /*
         * Marked handled the moment it is created. If `addHumanTurn` throws on
         * the next line, nothing would ever await this promise, and an
         * unhandled rejection terminates the process under Node's default
         * policy — a database blip on one turn taking down every session on the
         * replica. The `await` below still sees the rejection; this only tells
         * Node someone is listening.
         */
        contextPromise.catch(() => {});

        // Human turn — provenance assigned at capture by the deterministic rule.
        const humanTurn = await store.addHumanTurn(session.id, content.trim());

        const conversation = await store.getTurnsAsMessages(session.id);
        mark("turns");

        /*
         * ── THE ENGINE STARTS HERE, AS EARLY AS IT POSSIBLY CAN ──────────────
         * `evaluateTurn` makes a nano-tier model call to decide whether a
         * coaching signal fired. Its arguments are the four lines below and
         * nothing else — all of them are in hand the moment the transcript
         * read returns.
         *
         * This used to start after the context reads, one line below a comment
         * of mine asserting it depended only on things "already in hand".
         * Which was true, and it was still started three seconds later than it
         * needed to be. The timing line is what caught it:
         *
         *   turns 2.9s | context 6.0s | prompt 11.2s | first token 14.1s
         *
         * The 5.2s "prompt" phase was not prompt assembly. Completion criteria
         * are cached and the objective renderer is off for this population, so
         * almost all of that was this one model call, which had only been
         * running since 6.0s. Started here it overlaps the context reads as
         * well, and the phase collapses to whatever is left over.
         *
         * A promise created and awaited later is only a win if it is created
         * at the earliest point its inputs exist. Otherwise it is a serial
         * call wearing a parallel shape — and it reads as parallel in review,
         * which is why the measurement mattered.
         *
         * Never rejects: it returns null on any failure by design, so a
         * detection problem cannot take down a live session and this promise
         * cannot go unhandled.
         */
        const guidancePromise = engine.evaluateTurn({
          studentId,
          sessionId: session.id,
          content: content.trim(),
          turnId: humanTurn?.id ?? null,
          recentTurns: conversation,
        });

        /*
         * The integrity gates for this session, started alongside the detector so
         * the two DB reads overlap rather than queue.
         *
         * Separate from `guidancePromise` deliberately: gates govern every reply
         * Wing makes, and `evaluateTurn` returns null on the majority of turns
         * because most turns contain no signal. Attaching the rules to its result
         * would drop them on exactly those turns.
         *
         * Also never rejects — null on any failure, logged inside.
         */
        const gatesPromise = engine.loadTurnGates({
          studentId,
          sessionId: session.id,
        });

        /*
         * The voice section (T5), started here for the same reason as the gates:
         * its inputs are the student and the transcript, both already in hand.
         *
         * Its doorway choice reads the student's own turns and nothing else — no
         * persisted personality estimate, deliberately, so a bad early read
         * cannot follow somebody through every future session.
         *
         * Never rejects. A cohort with no published voice profile, or a failure
         * reading one, yields null and the prompt is exactly what it was before
         * this existed.
         */
        const voicePromise = voice.voiceSectionFor({
          studentId,
          sessionType: sessionTypeFor(sessionNumber),
          studentTurns: conversation
            .filter((m: { role: string }) => m.role === "user")
            .map((m: { content: string }) => m.content),
        });

        /*
         * Collected, not started, here.
         *
         * `professionalStatus` is one column. It was `getUserProfile()`, which
         * returns every document with its full extracted text and every session
         * with its artifact jsonb — and the only field ever read from it, here
         * and everywhere below, is this one enum.
         */
        const [professionalStatus, priorSessions, studentContext] = await contextPromise;

        mark("context");

        const promptSet = getPromptSet(professionalStatus);
        const resumeSummary = studentContext.text;

        if (studentContext.included.length) {
          console.log(
            `[foundation] session ${sessionNumber}: context — ` +
              `${studentContext.included.join(", ")} (${studentContext.chars} chars)`,
          );
        }

        const conversationCriteria = await resolveCompletionCriteria(
          professionalStatus,
          sessionNumber,
          "conversation",
        );

        /*
         * EXPERIMENT — assemble the prompt from objectives instead of the
         * prompt file, for allowlisted populations only.
         *
         * Off unless OBJECTIVE_RENDERER_POPULATIONS names this student's
         * population. Returns null on anything unexpected — flag off, no
         * published objective set, or an error — and the legacy prompt runs
         * exactly as before. A student mid-session must never see this break.
         *
         * The comparison this exists to make: a focused ~1,500-character
         * prompt carrying one objective and its cards, against the 22,000-
         * character file that carries everything at once. Which produces better
         * coaching is a question no amount of design settles.
         */
        const objectivePrompt = await objectiveRuntime.buildObjectivePrompt({
          sessionId: session.id,
          sessionType: sessionTypeFor(sessionNumber),
          sessionTitle: `Foundation Session ${sessionNumber}`,
          professionalStatus,
          identity: promptSet.getSystemPrompt({ sessionNumber }).slice(0, 600),
          studentContext: [resumeSummary, ...priorSessions.map((p) => p.conversationTranscript)]
            .filter(Boolean)
            .join("\n\n"),
          completionCriteria: conversationCriteria,
        });

        const basePrompt =
          objectivePrompt?.prompt ??
          promptSet.getSystemPrompt({
            sessionNumber,
            resumeSummary,
            priorSessions: priorSessions.length > 0 ? priorSessions : undefined,
            // Same row the analysis reads, rendered for the conversation. This
            // pairing is the whole point: one definition, two renderings.
            completionCriteria: conversationCriteria,
          });

        // Everything up to here is prompt assembly proper. Marked separately
        // from the engine wait below so the two are never confused again — the
        // last round of this work attributed five seconds of model call to
        // "prompt", and optimised the wrong thing as a result.
        mark("assembled");

        /*
         * The real-time engine loop (spec §6): the turn is evaluated against
         * the student's active heuristic sequence before Wing replies, so an
         * intervention lands on the turn that triggered it. Started as early as
         * its inputs allow — see above the context reads — and collected here,
         * the first point the answer is actually needed.
         *
         * If `engine wait` is consistently near zero, the overlap is doing its
         * job. If it is not, this call is the critical path and the next move
         * is to make the intervention arrive on the following turn rather than
         * to hold this one.
         */
        const guidance = await guidancePromise;
        mark("engine wait");

        /*
         * Gates first, then the base prompt, then this turn's coaching guidance.
         *
         * Order is deliberate. The gates are constraints on every reply and the
         * guidance is an instruction for this one, so the guidance must be the
         * last thing the model reads — a constraint stated after the instruction
         * it constrains reads as an afterthought.
         *
         * Today this is a no-op: no cycle points at a sequence containing the v2
         * cards, so `gateSection` is null and the prompt is byte-identical to what
         * it was. It becomes live the moment a sequence is published, which is the
         * intended risk profile — the wiring lands and is exercised before the
         * methodology behind it does.
         */
        /*
         * Compiled here rather than inside the load because two gates only apply
         * when a fact about this turn holds, and one of those facts — whether
         * anything the student uploaded is in this turn's context — is not known
         * until `studentContext` returns above. The database read still overlaps
         * the detector; only the rendering waits.
         */
        const gateContext = engine.compileTurnGates(await gatesPromise, {
          hasUploadedDocument: studentContext.included.some(
            (name) => UPLOADED_SECTIONS.indexOf(name) >= 0,
          ),
        });
        const gateSection = gateContext?.section ?? null;

        const voiceContext = await voicePromise;
        if (voiceContext.section) {
          console.log(
            `[foundation] voice profile #${voiceContext.profileId}` +
              ` (${voiceContext.tokens} tokens, ` +
              /*
               * The register that is in the prompt — not the population that was
               * resolved. When a population resolves and the profile carries no
               * register for it, that is worth saying out loud rather than
               * printing a register nobody was given.
               */
              (voiceContext.register
                ? `${voiceContext.register} register`
                : voiceContext.audience
                  ? `${voiceContext.audience} resolved but this profile has no register for it`
                  : "no register") +
              `${voiceContext.doorway ? `, doorway ${voiceContext.doorway}` : ", no doorway"})`,
          );
        }

        /*
         * Identity, then constraints, then the task, then this turn.
         *
         * The voice section goes FIRST, ahead of the gates, on the personality
         * directive's own reasoning: "The personality directive is the SYSTEM
         * PROMPT. The gates are the QUALITY CHECKS... If the directive is strong,
         * the gates fire rarely. If the directive is weak, the gates fire
         * constantly — they're doing the personality's job, which they're not
         * designed for." A model told what it must never say before it is told
         * who it is will produce careful, characterless coaching.
         */
        const systemPrompt = [
          voiceContext.section,
          gateSection,
          basePrompt,
          guidance?.systemPromptFragment,
        ]
          .filter(Boolean)
          .join("\n\n");

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        mark("prompt");
        let assistantContent = "";

        // Foundation Session conversation — quality-critical -> flagship tier.
        const stream = orchestrator.completeStream({
          tier: "flagship",
          system: systemPrompt,
          messages: conversation,
          maxTokens: 4096,
          temperature: 0.7,
        });

        let firstToken = 0;
        for await (const chunk of stream) {
          if (!firstToken) {
            firstToken = Date.now() - t0;
            marks["first token"] = firstToken;
          }
          assistantContent += chunk;
          res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
        }
        mark("stream done");

        // Wing's turn: ai_prompt, or ai_adapted if it follows a correction.
        const aiTurn = await store.addAiTurn(session.id, assistantContent);

        /*
         * ── THE TURN IS OVER HERE ────────────────────────────────────────────
         * Wing has finished speaking and the reply is durable. Everything below
         * this line is measurement and bookkeeping, and none of it changes what
         * the student is looking at.
         *
         * It used to run BEFORE the client was told the turn had ended, which
         * meant two further model calls — objective evidence, then a
         * full-transcript completion analysis — sat between the last token
         * appearing on screen and the input becoming usable again. The reply
         * was visibly complete and the composer stayed disabled for several
         * more seconds, every single turn. That is the "takes super long"
         * complaint, and it was never the conversation being slow.
         *
         * `turn_complete` releases the UI. The connection stays open because a
         * session that finishes on this turn still needs to say so, and that
         * verdict is not known yet.
         */
        res.write(
          `data: ${JSON.stringify({
            type: "turn_complete",
            assistantTurnId: aiTurn?.id ?? null,
            humanTurnId: humanTurn?.id ?? null,
          })}\n\n`,
        );

        /*
         * The gate audit — deliberately here, after `turn_complete` has released
         * the UI.
         *
         * Thirteen gates ask to inspect Wing's output BEFORE delivery, and this
         * path streams, so the choice was between not streaming and measuring
         * afterwards. Measuring afterwards is what makes "did the rule hold?"
         * answerable at all, and it is the evidence that decides whether any gate
         * earns the latency of buffering the stream. Placed after the release so
         * it cannot cost the student a millisecond either way.
         *
         * Not awaited for its result and never throws — findings are written to
         * gate_audit_findings for review, and a failure costs a log line.
         */
        void engine.auditDeliveredReply({
          studentId,
          sessionId: session.id,
          turnId: aiTurn?.id ?? null,
          reply: assistantContent,
          gates: gateContext,
        });

        /*
         * The full turn list, assembled rather than re-queried.
         *
         * `conversation` was read before Wing replied and already contains the
         * human turn; appending the reply gives the same list the database
         * would return, without a second full-transcript read on the turn path.
         */
        mark("TURN RELEASED");

        /*
         * Everything past this point is off the student's clock. It is still
         * timed, because it is what the server spends most of its time on and
         * that is worth knowing even when nobody is waiting for it.
         */
        const allMessages = [
          ...conversation,
          { role: "assistant" as const, content: assistantContent },
        ];

        /*
         * Which objectives this turn satisfied — the measurement half of the
         * experiment, and the reason it is worth running at all.
         *
         * Attributed to the HUMAN turn, not Wing's reply: the student is who
         * satisfies an objective. Costs one mid-tier call per turn, which is
         * why it is gated to allowlisted populations. Never throws — losing a
         * data point is acceptable, losing the session is not.
         */
        await objectiveRuntime.recordObjectiveEvidence({
          sessionId: session.id,
          sessionType: sessionTypeFor(sessionNumber),
          professionalStatus,
          turnId: humanTurn.id,
          transcript: allMessages
            .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
            .join("\n\n"),
        });

        const completionCheck = await checkSessionCompletion(
          legacyUserId,
          studentId,
          sessionNumber,
          allMessages,
          professionalStatus,
        );

        if (completionCheck.shouldComplete) {
          // completionData becomes a typed artifact, not a JSON blob column.
          await store.putArtifact({
            sessionId: session.id,
            artifactType: ARTIFACT_FOR_SESSION[sessionNumber],
            content: completionCheck.completionData,
            sourceType: "ai_generated",
          });

          await store.completeSession(session.id);
          await unlockNextSession(studentId, sessionNumber);

          res.write(
            `data: ${JSON.stringify({
              type: "session_completed",
              artifactType: ARTIFACT_FOR_SESSION[sessionNumber],
              content: completionCheck.completionData,
            })}\n\n`,
          );
        }

        mark("analysis");
        console.log(
          `[foundation] session ${sessionNumber} turn timing — ` +
            Object.entries(marks)
              .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`)
              .join("  |  "),
        );

        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();

        // Post-session scoring (spec §6) — deliberately AFTER res.end(). It
        // makes several LLM calls, and the student has finished; making them
        // wait for bookkeeping would be indefensible. scoreSession never
        // throws, so a floating promise here cannot produce an unhandled
        // rejection.
        if (completionCheck.shouldComplete) {
          // Classify BEFORE scoring: scoring's deterministic correction branch
          // reads turn types, and human_correction only exists after the
          // classifier has run. Reversed, corrections would never be scored.
          void classifier
            .classifySession(session.id)
            .then(() => scoring.scoreSession(session.id));

          // S2 — completion email within the hour (Feature List B3). Also
          // after res.end(): the student has finished and should not wait on
          // an email. Never throws, so a floating promise is safe here.
          void engagement.onSessionCompleted({
            studentId,
            sessionId: session.id,
            sessionNumber,
          });
        }
      } catch (error) {
        console.error("Error in foundation session stream:", error);
        if (!res.headersSent) return next(error);
        res.write(
          `data: ${JSON.stringify({ type: "error", message: "Stream failed" })}\n\n`,
        );
        res.end();
      }
    },
  );

  /** Status updates (e.g. manual completion from admin tooling). */
  app.patch(
    "/api/foundation-sessions/:sessionNumber",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseSessionNumber(req.params.sessionNumber);
        if (!sessionNumber) {
          return res.status(400).json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        const studentId = await store.studentIdFor(req.user as any);
        const session = await store.getSession(studentId, sessionTypeFor(sessionNumber));
        if (!session) return res.status(404).json({ error: "Session not found" });

        const { status } = req.body ?? {};
        const allowed = ["locked", "available", "in_progress", "completed", "ended_early"];
        if (status && !allowed.includes(status)) {
          return res.status(400).json({ error: `status must be one of ${allowed.join(", ")}` });
        }

        let updated = session;
        if (status === "completed") {
          updated = await store.completeSession(session.id);
          await unlockNextSession(studentId, sessionNumber);
        } else if (status) {
          updated = await store.updateSessionStatus(session.id, status);
        }

        res.json(toApiSession(updated));
      } catch (error) {
        console.error("Error updating foundation session:", error);
        next(error);
      }
    },
  );

  /*
   * Session timer.
   *
   * Registered for PATCH and POST on the same path. PATCH is the honest verb
   * and what the app uses; POST exists because `navigator.sendBeacon` — the
   * only thing a browser reliably delivers while a tab is closing — can issue
   * nothing else. Without the alias the closing flush would 404 silently,
   * which is precisely the kind of failure that looks like working code.
   */
  app.all(
    "/api/foundation-sessions/:sessionNumber/timer",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseSessionNumber(req.params.sessionNumber);
        if (!sessionNumber) {
          return res.status(400).json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        if (req.method !== "PATCH" && req.method !== "POST") {
          return res.status(405).json({ error: "Use PATCH, or POST from sendBeacon" });
        }

        const { timerElapsedSeconds, timerElapsed } = req.body ?? {};
        const seconds = timerElapsedSeconds ?? timerElapsed;
        if (typeof seconds !== "number" || seconds < 0) {
          return res.status(400).json({ error: "timerElapsedSeconds must be a non-negative number" });
        }

        /*
         * The timer fires every few seconds for the whole session, so its cost
         * is paid continuously rather than once. It was three sequential
         * queries — student, session, update — which measured six seconds
         * against the stage database from a laptop. Two now, and the first is
         * a single indexed join.
         */
        const found = await store.getSessionForUser(
          req.user!.id,
          sessionTypeFor(sessionNumber),
        );
        if (!found?.session) return res.status(404).json({ error: "Session not found" });

        const updated = await store.addElapsedSeconds(found.session.id, seconds);
        res.json({ timerElapsedSeconds: updated.timerElapsedSeconds });
      } catch (error) {
        console.error("Error updating session timer:", error);
        next(error);
      }
    },
  );
}

import { Express, Request, Response, NextFunction } from "express";
import { parseJsonResponse } from "./json-response";
import { storage } from "./storage";
import { getPromptSet } from "./prompts";
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
  userProfile: any,
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

    const promptSet = getPromptSet(userProfile?.professionalStatus);

    // The SAME criteria the conversation was given. When these were written
    // separately they drifted, and a session could satisfy everything it was
    // told to achieve while the analysis judged it incomplete.
    const criteria =
      criteriaOverride ??
      (await resolveCompletionCriteria(
        userProfile?.professionalStatus,
        sessionNumber,
        "analysis",
      ));

    // How to read the transcript, as opposed to what counts as done.
    const methodology =
      methodologyOverride ??
      (await resolveAnalysisMethodology(
        userProfile?.professionalStatus,
        sessionNumber,
      ));

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
          const profile = await profileStore.getUserProfile(legacyUserId);
          const promptSet = getPromptSet(profile?.professionalStatus);
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
        const userProfile = await profileStore.getUserProfile(legacyUserId);

        const analysis = await checkSessionCompletion(
          legacyUserId,
          studentId,
          sessionNumber,
          messages,
          userProfile,
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
        const studentId = await store.studentIdFor(req.user as any);

        const session = await store.getSession(studentId, sessionTypeFor(sessionNumber));
        if (!session) return res.status(404).json({ error: "Session not found" });

        if (session.status !== "in_progress" && session.status !== "completed") {
          return res.status(400).json({
            error: "Session must be in progress or completed to send messages",
          });
        }

        const { content } = req.body ?? {};
        if (!content || typeof content !== "string") {
          return res.status(400).json({ error: "Message content is required" });
        }

        // Human turn — provenance assigned at capture by the deterministic rule.
        const humanTurn = await store.addHumanTurn(session.id, content.trim());

        const conversation = await store.getTurnsAsMessages(session.id);

        const userProfile = await profileStore.getUserProfile(legacyUserId);
        const promptSet = getPromptSet(userProfile?.professionalStatus);
        const resumeSummary = await formatResumeSummary(legacyUserId);
        const priorSessions = await buildPriorSessionContexts(studentId, sessionNumber);

        const conversationCriteria = await resolveCompletionCriteria(
          userProfile?.professionalStatus,
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
          professionalStatus: userProfile?.professionalStatus,
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

        // The real-time engine loop (spec §6): evaluate the turn against the
        // student's active heuristic sequence before Wing replies, so an
        // intervention lands on the turn that triggered it. evaluateTurn never
        // throws and returns null when nothing fires, so the conversation is
        // unaffected when no methodology is active or detection fails.
        const guidance = await engine.evaluateTurn({
          studentId,
          sessionId: session.id,
          content: content.trim(),
          turnId: humanTurn?.id ?? null,
          recentTurns: conversation,
        });

        const systemPrompt = guidance
          ? `${basePrompt}\n\n${guidance.systemPromptFragment}`
          : basePrompt;

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        let assistantContent = "";

        // Foundation Session conversation — quality-critical -> flagship tier.
        const stream = orchestrator.completeStream({
          tier: "flagship",
          system: systemPrompt,
          messages: conversation,
          maxTokens: 4096,
          temperature: 0.7,
        });

        for await (const chunk of stream) {
          assistantContent += chunk;
          res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
        }

        // Wing's turn: ai_prompt, or ai_adapted if it follows a correction.
        await store.addAiTurn(session.id, assistantContent);

        // Completion check over the full turn list.
        const allMessages = await store.getTurnsAsMessages(session.id);

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
          professionalStatus: userProfile?.professionalStatus,
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
          userProfile,
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

  /** Session timer. */
  app.patch(
    "/api/foundation-sessions/:sessionNumber/timer",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionNumber = parseSessionNumber(req.params.sessionNumber);
        if (!sessionNumber) {
          return res.status(400).json({ error: "Invalid session number. Must be 1, 2, or 3" });
        }

        const { timerElapsedSeconds, timerElapsed } = req.body ?? {};
        const seconds = timerElapsedSeconds ?? timerElapsed;
        if (typeof seconds !== "number" || seconds < 0) {
          return res.status(400).json({ error: "timerElapsedSeconds must be a non-negative number" });
        }

        const studentId = await store.studentIdFor(req.user as any);
        const session = await store.getSession(studentId, sessionTypeFor(sessionNumber));
        if (!session) return res.status(404).json({ error: "Session not found" });

        const updated = await store.addElapsedSeconds(session.id, seconds);
        res.json({ timerElapsedSeconds: updated.timerElapsedSeconds });
      } catch (error) {
        console.error("Error updating session timer:", error);
        next(error);
      }
    },
  );
}

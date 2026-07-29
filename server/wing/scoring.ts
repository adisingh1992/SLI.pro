import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  transcripts,
  transcriptTurns,
  sessions,
  userHeuristicApplications,
  userHeuristicScores,
} from "@shared/wing-schema";
import * as orchestrator from "../orchestrator";
import { parseJsonResponse } from "../json-response";
import { log } from "../logger";
import * as store from "./heuristics-store";
import { aggregateOutcomes, type OutcomeSignal } from "./engine-rules";

/**
 * Post-session scoring — the "within hours of completion" loop from spec §6.
 *
 * Runs over a completed session's tagged turns, decides what each heuristic
 * application actually achieved, and aggregates the result into
 * user_heuristic_scores. This is what eventually tells the methodology owner
 * which cards work.
 *
 * HOW AN OUTCOME IS DECIDED
 * Two passes, cheapest first:
 *
 *  1. Deterministic. If the student's next turn after the intervention is a
 *     `human_correction`, the outcome is `correction` — the student rejected
 *     the framing. No LLM needed, and it is not a judgement call.
 *
 *  2. Judged. Otherwise the turns following the intervention are compared
 *     against the card's own `outcome` component — the card defines what
 *     success looks like, so nothing about success is hard-coded here. Mid
 *     tier, because this is off the critical path and quality matters more
 *     than latency.
 *
 * WHY `correction` IS NOT `regression`
 * A human correction is the single highest-value turn type in the corpus
 * (spec §5): it is the student redesigning Wing's output because the default
 * did not fit their complexity. It is excellent DATA and a poor result for the
 * HEURISTIC — the card's framing missed. So it counts mildly against the
 * card's composite score while remaining a prized turn. Conflating it with
 * regression would punish exactly the interactions worth having, and would
 * push the methodology toward blandness.
 *
 * IDEMPOTENT
 * Aggregates are recomputed from the full application history rather than
 * incremented, so re-running over a session cannot double-count.
 */

/** Turns following the intervention that the judge is allowed to see. */
const LOOKAHEAD_TURNS = 4;

/* ── Reading the aftermath of an application ────────────────────────────── */

async function turnsAfter(sessionId: number, turnId: number | null) {
  const [transcript] = await db
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId))
    .limit(1);
  if (!transcript) return [];

  let fromPosition = 0;
  if (turnId) {
    const [anchor] = await db
      .select({ position: transcriptTurns.sequencePosition })
      .from(transcriptTurns)
      .where(eq(transcriptTurns.id, turnId))
      .limit(1);
    fromPosition = anchor?.position ?? 0;
  }

  return db
    .select({
      id: transcriptTurns.id,
      turnType: transcriptTurns.turnType,
      content: transcriptTurns.content,
      position: transcriptTurns.sequencePosition,
    })
    .from(transcriptTurns)
    .where(
      and(
        eq(transcriptTurns.transcriptId, transcript.id),
        gt(transcriptTurns.sequencePosition, fromPosition),
      ),
    )
    .orderBy(asc(transcriptTurns.sequencePosition))
    .limit(LOOKAHEAD_TURNS);
}

async function judgeOutcome(params: {
  heuristicName: string;
  outcomeDefinition: string | null;
  interventionText: string | null;
  following: Array<{ turnType: string; content: string }>;
}): Promise<OutcomeSignal> {
  // Nothing happened after the intervention — the session ended, most likely.
  if (!params.following.length) return "neutral";

  // Deterministic pass: an explicit correction needs no judgement.
  if (params.following.some((t) => t.turnType === "human_correction")) {
    return "correction";
  }

  // Without an outcome definition there is no basis for a judgement, and
  // guessing would put noise into the score that validates methodology.
  if (!params.outcomeDefinition) return "neutral";

  const transcript = params.following
    .map((t) => `[${t.turnType}] ${t.content}`)
    .join("\n");

  try {
    const result = await orchestrator.complete({
      tier: "mid",
      system: [
        "You evaluate whether a coaching intervention achieved its intended outcome.",
        "",
        `Heuristic: ${params.heuristicName}`,
        params.interventionText ? `Intervention applied: ${params.interventionText}` : "",
        `Intended outcome: ${params.outcomeDefinition}`,
        "",
        "Classify what the student's subsequent turns show:",
        '- "breakthrough": the intended outcome was reached, with visible shift',
        '- "positive": movement toward the outcome',
        '- "neutral": no discernible movement either way',
        '- "regression": the student moved away from the outcome',
        "",
        "Most interventions are positive or neutral. Reserve breakthrough for a",
        "clear, articulated shift. Judge only what the turns show.",
        "",
        'Reply with JSON only: {"outcome": "<one of the four>", "rationale": "<one sentence>"}',
      ]
        .filter(Boolean)
        .join("\n"),
      messages: [{ role: "user", content: transcript }],
      maxTokens: 200,
      temperature: 0,
    });

    const parsed = parseJsonResponse<{ outcome: string }>(result.text, "Outcome judgement");
    const outcome = parsed.outcome as OutcomeSignal;
    return ["breakthrough", "positive", "neutral", "regression"].includes(outcome)
      ? outcome
      : "neutral";
  } catch (err) {
    // An unscored application is recoverable; a wrongly scored one silently
    // corrupts the evidence base that decides which methodology survives.
    log(`outcome judgement failed: ${(err as Error).message}`, "scoring");
    return "neutral";
  }
}

/* ── Aggregation ────────────────────────────────────────────────────────── */

/**
 * Recomputes the aggregate for one (student, heuristic, cycle) from scratch.
 *
 * Recomputed rather than incremented so that re-running scoring, or scoring a
 * session twice, cannot inflate the counts.
 */
async function recomputeScore(studentId: number, heuristicId: number, cycleId: number) {
  const rows = await db
    .select({
      outcomeSignal: userHeuristicApplications.outcomeSignal,
      sessionId: userHeuristicApplications.sessionId,
    })
    .from(userHeuristicApplications)
    .where(
      and(
        eq(userHeuristicApplications.studentId, studentId),
        eq(userHeuristicApplications.heuristicId, heuristicId),
        eq(userHeuristicApplications.cycleId, cycleId),
      ),
    );

  const { sessionsApplied, positiveSignalCount, regressionCount, compositeScore } =
    aggregateOutcomes(rows as any);

  await db
    .insert(userHeuristicScores)
    .values({
      studentId,
      heuristicId,
      cycleId,
      sessionsApplied,
      positiveSignalCount,
      regressionCount,
      compositeScore: compositeScore.toFixed(2),
    })
    .onConflictDoUpdate({
      target: [
        userHeuristicScores.studentId,
        userHeuristicScores.heuristicId,
        userHeuristicScores.cycleId,
      ],
      set: {
        sessionsApplied,
        positiveSignalCount,
        regressionCount,
        compositeScore: compositeScore.toFixed(2),
        lastUpdated: new Date(),
      },
    });
}

/* ── Entry point ────────────────────────────────────────────────────────── */

/**
 * Scores every heuristic application in a completed session.
 *
 * Safe to call more than once. Never throws: scoring is bookkeeping, and a
 * failure here must not affect the student's session, which has already ended.
 */
export async function scoreSession(sessionId: number): Promise<void> {
  try {
    const applications = await store.listApplicationsForSession(sessionId);
    if (!applications.length) return;

    const [session] = await db
      .select({ studentId: sessions.studentId, cycleId: sessions.cycleId })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (!session) return;

    for (const application of applications) {
      const card = await store.getHeuristic(application.heuristicId);
      const current = (card?.components ?? []).filter((c: any) => c.isCurrent);
      const outcomeDefinition =
        current.find((c: any) => c.componentType === "outcome")?.content ?? null;
      const interventionText =
        current.find((c: any) => c.componentType === "intervention")?.content ?? null;

      const following = await turnsAfter(sessionId, application.turnId);

      const outcome = await judgeOutcome({
        heuristicName: card?.name ?? `heuristic ${application.heuristicId}`,
        outcomeDefinition,
        interventionText,
        following,
      });

      await store.setApplicationOutcome(application.id, outcome);

      // cycle_id is NOT NULL on user_heuristic_scores, so an application with
      // no cycle cannot be aggregated. It keeps its outcome on the application
      // row — the audit trail stays complete — but contributes to no score.
      const cycleId = application.cycleId ?? session.cycleId;
      if (cycleId == null) {
        log(
          `application ${application.id} has no cycle; outcome recorded but not aggregated`,
          "scoring",
        );
        continue;
      }

      await recomputeScore(session.studentId, application.heuristicId, cycleId);
    }

    log(`scored ${applications.length} application(s) for session ${sessionId}`, "scoring");
  } catch (err) {
    log(`scoreSession(${sessionId}) failed: ${(err as Error).stack ?? err}`, "scoring");
  }
}

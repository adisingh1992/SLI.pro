/**
 * Engine decision rules — pure, dependency-free.
 *
 * The engine's judgement calls live here, separated from the LLM call and the
 * database write that surround them, so they can be tested without either.
 * These rules decide what Wing does with a detector's answer and how a card's
 * evidence accumulates, which makes them worth testing directly rather than
 * inferring from an end-to-end run.
 *
 * No imports. Do not add any.
 */

export type DetectionVerdict =
  | { accepted: true; heuristicId: number; confidence: number; rationale: string }
  | { accepted: false; reason: "no_match" | "unknown_heuristic" | "low_confidence" | "malformed" };

/** Below this a detection is discarded — a weak guess is worse than none. */
export const MIN_CONFIDENCE = 0.6;

/**
 * Decides what to do with the detector's raw answer.
 *
 * Two rejections matter and are easy to get wrong:
 *
 *  - `unknown_heuristic`: the model named a card that is not in THIS student's
 *    sequence. Rejected outright rather than snapped to the nearest match —
 *    firing a card the methodology owner did not put in front of this student
 *    applies methodology nobody authorised, and it would be invisible in the
 *    logs because the application record would look perfectly ordinary.
 *
 *  - `low_confidence`: below the threshold, nothing fires. An unfired
 *    heuristic costs one missed coaching moment; a wrongly fired one puts a
 *    bad intervention in front of a student AND a false positive into the
 *    evidence base that decides which methodology gets validated. The second
 *    is much more expensive, so the threshold is deliberately unforgiving.
 */
export function interpretDetection(
  raw: unknown,
  allowedHeuristicIds: readonly number[],
): DetectionVerdict {
  if (!raw || typeof raw !== "object") return { accepted: false, reason: "malformed" };

  const answer = raw as { heuristicId?: unknown; confidence?: unknown; rationale?: unknown };

  if (answer.heuristicId === null || answer.heuristicId === undefined) {
    return { accepted: false, reason: "no_match" };
  }

  const heuristicId = Number(answer.heuristicId);
  if (!Number.isFinite(heuristicId)) return { accepted: false, reason: "malformed" };

  if (!allowedHeuristicIds.includes(heuristicId)) {
    return { accepted: false, reason: "unknown_heuristic" };
  }

  const confidence = Number(answer.confidence);
  if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) {
    return { accepted: false, reason: "low_confidence" };
  }

  return {
    accepted: true,
    heuristicId,
    confidence,
    rationale: typeof answer.rationale === "string" ? answer.rationale : "",
  };
}

/* ── Scoring ────────────────────────────────────────────────────────────── */

export type OutcomeSignal =
  | "breakthrough" | "positive" | "neutral" | "regression" | "correction";

/**
 * Weights turning outcome signals into a composite score.
 *
 * `correction` is NOT `regression`. A human correction is the highest-value
 * turn type in the corpus (spec §5) — the student redesigning Wing's output
 * because the default did not fit. It is excellent data and a poor result for
 * the card, so it counts mildly against the card while the turn itself stays
 * prized. Scoring it as a regression would penalise exactly the interactions
 * worth having and push the methodology toward blandness.
 */
export const OUTCOME_WEIGHTS: Readonly<Record<OutcomeSignal, number>> = {
  breakthrough: 2,
  positive: 1,
  neutral: 0,
  correction: -0.5,
  regression: -1,
};

export type ScoreAggregate = {
  sessionsApplied: number;
  positiveSignalCount: number;
  regressionCount: number;
  compositeScore: number;
};

/**
 * Aggregates a card's applications into its score for one student.
 *
 * Denominated in distinct SESSIONS, not applications: a card firing three
 * times in one conversation is one session's worth of evidence, not three.
 * Without that, a chatty card would out-score an effective one.
 */
export function aggregateOutcomes(
  applications: ReadonlyArray<{ sessionId: number; outcomeSignal?: OutcomeSignal | null }>,
): ScoreAggregate {
  const sessions = new Set<number>();
  let positiveSignalCount = 0;
  let regressionCount = 0;
  let weighted = 0;

  for (const a of applications) {
    sessions.add(a.sessionId);
    const signal = (a.outcomeSignal ?? "neutral") as OutcomeSignal;
    if (signal === "breakthrough" || signal === "positive") positiveSignalCount++;
    if (signal === "regression") regressionCount++;
    weighted += OUTCOME_WEIGHTS[signal] ?? 0;
  }

  const sessionsApplied = sessions.size;
  return {
    sessionsApplied,
    positiveSignalCount,
    regressionCount,
    compositeScore: sessionsApplied ? weighted / sessionsApplied : 0,
  };
}

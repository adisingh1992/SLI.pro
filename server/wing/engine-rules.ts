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

/* ── H-003 · Coaching intensity sequencing ──────────────────────────────── */

/**
 * How hard a coaching interaction lands.
 *
 * H-003's own tiers: HIGH is "confrontation, delta reveal, triage, power
 * confrontation, ice bucket"; MEDIUM is "evidence mining, calibration feedback,
 * Dreyfus staging"; LOW is "micro-journaling, Radar engagement, content seed,
 * general conversation".
 */
export type Intensity = "high" | "medium" | "low";

/**
 * Derives intensity from a card's intervention type.
 *
 * An approximation, and worth being explicit about why. H-003 names specific
 * MOVES — delta reveal, triage, Dreyfus staging — and every one of them belongs
 * to Module 8 or Module 9, which Tier 1 does not have. What Tier 1 does have is
 * `intervention_type` on every card, and it lines up with the tiers closely
 * enough to be useful:
 *
 *   CHALLENGE           → high    confrontation is the word the gate uses
 *   COACH · REDIRECT    → medium  probing and steering, not confronting
 *   REFRAME             → medium  challenges a frame, but does not attack a self-model
 *   AFFIRM              → low     the gate's own example of a recovery move
 *   META · GATE         → low     rules about Wing's output, not coaching delivered
 *
 * A turn where no card fired is LOW: "general conversation" in the gate's list.
 * That matters, because it means an ordinary exchange counts as recovery, which
 * is what makes the rule cheap to satisfy rather than a brake on the session.
 */
export function intensityOf(interventionType: string | null | undefined): Intensity {
  switch (interventionType) {
    case "CHALLENGE":
      return "high";
    case "COACH":
    case "REDIRECT":
    case "REFRAME":
      return "medium";
    default:
      return "low";
  }
}

/**
 * Whether a HIGH interaction must be held back.
 *
 * "No more than two consecutive high-intensity interactions without a recovery
 * interaction between them." So the answer is yes exactly when the two most
 * recent interactions were both HIGH — a third would be the breach.
 *
 * `recent` is most-recent-first. Anything other than two leading HIGHs is fine:
 * the gate is about a run of three, so one HIGH, or a HIGH after any recovery,
 * passes. And the recovery is "one interaction, not a waiting period", which is
 * why nothing here looks at time.
 */
export function shouldDeferHighIntensity(recent: readonly Intensity[]): boolean {
  return recent.length >= 2 && recent[0] === "high" && recent[1] === "high";
}

/**
 * What Wing says instead, taken from H-003's failure path.
 *
 * Kept here rather than built in the engine so the wording is reviewable next to
 * the rule it comes from. It is a recovery move — the gate is explicit that Wing
 * "can return to HIGH on the next interaction".
 */
export const INTENSITY_RECOVERY_GUIDANCE =
  "Two demanding exchanges have just landed in a row, so this turn is a recovery " +
  "turn. Do NOT challenge, confront, or surface another gap now — adaptation " +
  "happens between the hard moments, not during them. Instead, check in on what " +
  "the student is making of what you have already covered: what is landing, and " +
  "what is still settling. Keep it short and let them lead. The harder work " +
  "resumes on the next turn.";

/* ── The detector catalogue ─────────────────────────────────────────────── */

/**
 * A card as the detector prompt sees it.
 *
 * Declared structurally rather than imported so this file keeps its no-imports
 * rule and stays testable without a database. `HeuristicCard` in the store is a
 * superset.
 */
export type CatalogueCard = {
  heuristicId: number;
  name: string;
  /** Sequence weight. 0.5 · 1.0 · 1.5 · 2.0 in the methodology as delivered. */
  weight: number;
  signal: string;
};

/** Weight at or above which a card pre-empts anything else that matched. */
export const PREEMPTING_WEIGHT = 2.0;

/**
 * Renders the signal catalogue, highest weight first.
 *
 * ── WHY THE WEIGHT IS IN THE PROMPT ──────────────────────────────────────
 * `heuristic_sequence_entries.weight` was written by every seed, editable in the
 * admin UI, and read by nothing at runtime. The store's doc comment and the
 * admin label both described tie-breaking that did not happen: the detector
 * returns one id, so ties were resolved by whatever the model felt like.
 *
 * The methodology relies on it. H-309 trust vault protection is weight 2.0
 * specifically so that it pre-empts — it is the rule that stops Wing suggesting
 * a student's most vulnerable disclosure as LinkedIn content. Ordering the
 * catalogue is not enough on its own, because position in a list is a weak
 * signal to a model, so the weight is stated per card and the instruction is
 * explicit.
 */
export function buildSignalCatalogue(cards: readonly CatalogueCard[]): string {
  const ordered = cards
    .slice()
    .sort((a, b) => b.weight - a.weight || a.heuristicId - b.heuristicId);

  return ordered
    .map(
      (c) =>
        `- id: ${c.heuristicId}\n  weight: ${c.weight.toFixed(1)}\n` +
        `  name: ${c.name}\n  signal: ${c.signal}`,
    )
    .join("\n");
}

/**
 * The precedence rules the detector is told, as lines.
 *
 * Separate from the catalogue so a test can assert the instruction exists
 * without matching against 50 cards of prose.
 */
export function catalogueRules(): string[] {
  return [
    "- Judge ONLY the student's latest turn; prior turns are context.",
    "- Match only if the turn genuinely satisfies the signal definition. Not",
    "  every turn contains a signal; most do not. Returning none is normal and",
    "  is strongly preferred over a speculative match.",
    "- If more than one signal genuinely fires, return the one with the HIGHEST",
    `  weight. A card at weight ${PREEMPTING_WEIGHT.toFixed(1)} pre-empts every`,
    "  other match — those are the methodology's non-negotiable rules.",
    "- Never invent a heuristic id that is not in the catalogue.",
  ];
}

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

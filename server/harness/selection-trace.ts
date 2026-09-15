/**
 * Selection trace — reconstruction, pure half.
 *
 * Danielle's requirement, in her words: "seeing which cards were considered,
 * which won, and which were rejected with reasons — that's the visibility I
 * need to evaluate whether my heuristics are working as intended." Sam's
 * Interface 4 calls the same thing `selection_trace`.
 *
 * ── WHY THIS IS A RECONSTRUCTION AND NOT A NEW LOG ───────────────────────
 * The harness is additive: it must not change a single line of the turn path,
 * because the turn path is what students are using. So this module does not
 * instrument the engine. It re-derives the arbitration from what the platform
 * already stores, using the platform's own functions, and is honest about the
 * one part that cannot be re-derived.
 *
 * Every filter the engine applies before the detector is deterministic and
 * re-runnable:
 *   - `card_kind`      — `getActiveSequenceForStudent` asks for coaching cards only
 *   - session scope    — an entry's `applies_to_session` against the session's type
 *   - population tags  — `cardAppliesTo`, imported here rather than reimplemented
 *   - signal component — `detectSignal` drops any card with no `signal`
 * Given the sequence, the session type and the student's tags, this file
 * reproduces exactly which cards reached the detector and which did not, and
 * why. It imports `cardAppliesTo` from the engine's own module on purpose: a
 * second implementation of that predicate would drift, and a trace that
 * disagrees with the engine is worse than no trace.
 *
 * ── WHAT CANNOT BE RECONSTRUCTED, AND MUST NOT BE INVENTED ───────────────
 * Three things. They are returned in `unavailable` on every trace so a reader
 * never mistakes an absence for a finding:
 *
 * 1. PER-CANDIDATE MATCH SCORES DO NOT EXIST. The detector is a single
 *    Nano-tier model call over the whole catalogue that replies
 *    {"heuristicId", "confidence", "rationale"} — one winner, one confidence,
 *    one sentence. It does not score each card. So "which markers the engine
 *    identified and what match scores were assigned" has no answer today at
 *    any level of instrumentation short of changing the detector, which is a
 *    methodology, latency and cost change to the live turn path.
 * 2. WHY NOTHING FIRED IS NOT PERSISTED. `detectSignal` returns null on
 *    no_match, low_confidence, unknown_heuristic, malformed and on any thrown
 *    failure — `MIN_CONFIDENCE` is 0.6 — and writes nothing. A turn with no
 *    application row is therefore "nothing fired, reason not recorded". The
 *    reason needs a hook inside the engine; this file will not guess it.
 * 3. GATES THAT HELD ARE NOT LOGGED. `gate_audit_findings` records breaches
 *    only. "IG-U007 was in force and held" is not in the database.
 *
 * ── WHAT IS RECONSTRUCTABLE AND SURPRISINGLY GOOD ────────────────────────
 * The winner, its confidence and the detector's own rationale ARE persisted:
 * `evaluateTurn` writes them into `user_heuristic_applications.notes` as
 * "confidence 0.83: <rationale>", against the triggering `turn_id`, with the
 * component version actually used. So for every turn where a card fired, the
 * trace is complete. It is the silent turns that are thin, and they are thin
 * in exactly one field.
 */

import { cardAppliesTo } from "../wing/population-tags";

/** Where in the pipeline a card left the running. */
export type DropStage =
  /** Not a coaching card. Gates fire on Wing's output and never enter the detector. */
  | "card_kind"
  /** Scoped to a different session by its sequence entry. */
  | "session_scope"
  /** The student's population tags do not intersect the card's. */
  | "population_tag"
  /** In the catalogue's kind and scope, but carries no `signal` component to match on. */
  | "no_signal_component";

export type CandidateState =
  | { state: "dropped"; stage: DropStage; reason: string }
  | { state: "considered" }
  | { state: "won"; confidence: number | null; rationale: string | null }
  /** Detected and then held back by H-003's intensity sequencing. */
  | { state: "withheld"; reason: string };

export type TraceInputCard = {
  heuristicId: number;
  cardCode: string;
  name: string;
  cardKind: string;
  weight: number;
  position: number;
  appliesToSession: string | null;
  populationTags: string[];
  hasSignalComponent: boolean;
};

export type TracedCard = TraceInputCard & { outcome: CandidateState };

export type TurnTrace = {
  turnId: number | null;
  sequenceId: number;
  /** Null means the session type was unknown, and the engine leaves scope unset. */
  sessionType: string | null;
  studentTags: string[];
  /** Weight desc then position asc — the order `getSequenceCards` returns, so the
   *  trace reads in the order the detector saw. */
  cards: TracedCard[];
  counts: {
    inSequence: number;
    considered: number;
    dropped: Record<DropStage, number>;
  };
  winner: { heuristicId: number; cardCode: string; confidence: number | null } | null;
  /** Set when no card fired. The only honest value today. */
  noFire: "reason_not_recorded" | null;
  unavailable: string[];
};

export const UNAVAILABLE = [
  "per_candidate_match_scores: the detector returns one winner for the whole catalogue, not a score per card",
  "no_fire_reason: detectSignal returns null for no_match, low_confidence, unknown_heuristic, malformed and thrown failures alike, and persists none of them",
  "gates_that_held: gate_audit_findings records breaches only",
] as const;

/**
 * Parses what `evaluateTurn` wrote into `user_heuristic_applications.notes`.
 *
 * Two shapes are written today, and they mean different things:
 *   "confidence 0.83: <rationale>"                     → the card fired
 *   "held back <name> — two consecutive high-intensity" → H-003 withheld it
 * A third value is possible on rows written by anything else, and it is
 * returned as an opaque note rather than forced into either shape.
 */
export function parseApplicationNote(notes: string | null): {
  confidence: number | null;
  rationale: string | null;
  withheld: boolean;
} {
  if (!notes) return { confidence: null, rationale: null, withheld: false };

  if (notes.startsWith("held back ")) {
    return { confidence: null, rationale: notes, withheld: true };
  }

  const m = /^confidence (\d+(?:\.\d+)?)(?::\s*([\s\S]*))?$/.exec(notes.trim());
  if (!m) return { confidence: null, rationale: notes, withheld: false };

  const confidence = Number(m[1]);
  return {
    confidence: Number.isFinite(confidence) ? confidence : null,
    rationale: m[2]?.trim() || null,
    withheld: false,
  };
}

/**
 * Reproduces the pre-detector funnel for one turn.
 *
 * `sequenceCards` must be every non-retired entry in the sequence, all kinds,
 * unscoped — the admin view of the methodology. Narrowing it before calling
 * this would hide the drops, which are the point.
 *
 * `sessionType` null reproduces the engine's fail-open behaviour deliberately:
 * `getActiveSequenceForStudent` leaves the scope filter off when it cannot
 * resolve the session, "because an unscoped catalogue offers a few cards
 * pitched at the wrong session, an empty one silently switches the methodology
 * off". A trace that filtered anyway would report drops the engine never made.
 */
export function traceTurn(params: {
  sequenceId: number;
  sessionType: string | null;
  studentTags: readonly string[];
  sequenceCards: readonly TraceInputCard[];
  requestedKinds?: readonly string[];
  applied: {
    heuristicId: number;
    confidence: number | null;
    rationale: string | null;
    withheld: boolean;
  } | null;
  turnId?: number | null;
}): TurnTrace {
  const kinds = params.requestedKinds ?? ["coaching_card"];
  const tags = [...params.studentTags];

  const cards: TracedCard[] = params.sequenceCards.map((card) => {
    const outcome = ((): CandidateState => {
      if (!kinds.includes(card.cardKind)) {
        return {
          state: "dropped",
          stage: "card_kind",
          reason: `${card.cardKind} — the detector is asked for ${kinds.join(", ")} only`,
        };
      }

      if (
        params.sessionType &&
        card.appliesToSession &&
        card.appliesToSession !== params.sessionType
      ) {
        return {
          state: "dropped",
          stage: "session_scope",
          reason: `scoped to ${card.appliesToSession}, this session is ${params.sessionType}`,
        };
      }

      if (!cardAppliesTo(card.populationTags, tags)) {
        return {
          state: "dropped",
          stage: "population_tag",
          reason: card.populationTags.length
            ? `card targets [${card.populationTags.join(", ")}], student resolves to [${
                tags.join(", ") || "no tags"
              }]`
            : "card carries no population tags and the student resolved none",
        };
      }

      if (!card.hasSignalComponent) {
        return {
          state: "dropped",
          stage: "no_signal_component",
          reason: "no current `signal` component, so detectSignal filters it out",
        };
      }

      if (params.applied && params.applied.heuristicId === card.heuristicId) {
        return params.applied.withheld
          ? { state: "withheld", reason: params.applied.rationale ?? "withheld" }
          : {
              state: "won",
              confidence: params.applied.confidence,
              rationale: params.applied.rationale,
            };
      }

      return { state: "considered" };
    })();

    return { ...card, outcome };
  });

  const dropped: Record<DropStage, number> = {
    card_kind: 0,
    session_scope: 0,
    population_tag: 0,
    no_signal_component: 0,
  };
  let considered = 0;
  for (const c of cards) {
    if (c.outcome.state === "dropped") dropped[c.outcome.stage] += 1;
    else considered += 1;
  }

  const winnerCard = cards.find((c) => c.outcome.state === "won");
  const winner =
    winnerCard && winnerCard.outcome.state === "won"
      ? {
          heuristicId: winnerCard.heuristicId,
          cardCode: winnerCard.cardCode,
          confidence: winnerCard.outcome.confidence,
        }
      : null;

  return {
    turnId: params.turnId ?? null,
    sequenceId: params.sequenceId,
    sessionType: params.sessionType,
    studentTags: tags,
    cards: [...cards].sort(
      (a, b) => b.weight - a.weight || a.position - b.position,
    ),
    counts: { inSequence: cards.length, considered, dropped },
    winner,
    noFire: winner ? null : "reason_not_recorded",
    unavailable: [...UNAVAILABLE],
  };
}

/* ── The Unfired Cards report ────────────────────────────────────────────── */

/**
 * Danielle: "If a card never fires across 20 personas, that's either a card that
 * needs different signal conditions or a card that's dead weight."
 *
 * Both of those are the same bucket below — `eligible_never_won`. The other two
 * buckets are not methodology findings at all, and reporting one number would
 * present them as if they were:
 *
 *   never_eligible      the audience/scope pre-filter dropped it on every turn of
 *                       every run. She needs a persona it applies to, not a new
 *                       card. This is the bucket a naive report would misattribute.
 *   eligible_never_won  reached the detector and lost, every time. HER finding.
 *   never_considered    in kind and scope and population, and still never reached
 *                       the catalogue. That is an engine bug and belongs to us.
 */
export type UnfiredBucket =
  | "never_eligible"
  | "eligible_never_won"
  | "never_considered"
  | "fired";

export function classifyUnfired(
  traces: readonly TurnTrace[],
): Array<{
  heuristicId: number;
  cardCode: string;
  name: string;
  bucket: UnfiredBucket;
  turnsEligible: number;
  turnsConsidered: number;
  timesWon: number;
  dropStages: DropStage[];
}> {
  type Acc = {
    heuristicId: number;
    cardCode: string;
    name: string;
    turnsEligible: number;
    turnsConsidered: number;
    timesWon: number;
    stages: Set<DropStage>;
    turns: number;
  };
  const acc = new Map<number, Acc>();

  for (const trace of traces) {
    for (const card of trace.cards) {
      const row =
        acc.get(card.heuristicId) ??
        ({
          heuristicId: card.heuristicId,
          cardCode: card.cardCode,
          name: card.name,
          turnsEligible: 0,
          turnsConsidered: 0,
          timesWon: 0,
          stages: new Set<DropStage>(),
          turns: 0,
        } satisfies Acc);
      row.turns += 1;

      switch (card.outcome.state) {
        case "dropped":
          row.stages.add(card.outcome.stage);
          break;
        case "considered":
          row.turnsEligible += 1;
          row.turnsConsidered += 1;
          break;
        case "won":
        case "withheld":
          row.turnsEligible += 1;
          row.turnsConsidered += 1;
          if (card.outcome.state === "won") row.timesWon += 1;
          break;
      }
      acc.set(card.heuristicId, row);
    }
  }

  return [...acc.values()].map((r) => ({
    heuristicId: r.heuristicId,
    cardCode: r.cardCode,
    name: r.name,
    bucket: ((): UnfiredBucket => {
      if (r.timesWon > 0) return "fired";
      if (r.turnsEligible === 0) return "never_eligible";
      if (r.turnsConsidered === 0) return "never_considered";
      return "eligible_never_won";
    })(),
    turnsEligible: r.turnsEligible,
    turnsConsidered: r.turnsConsidered,
    timesWon: r.timesWon,
    dropStages: [...r.stages],
  }));
}

import { resolveRunScope, type RunScope } from "./harness-run-scope";

/**
 * P6.3 — cross-persona comparison: one card, side by side across every
 * audience represented in a run set (`TEST_HARNESS_PLAN_SEP9.md` §P6.3).
 * P6.2 answers "does this card ever fire, across everyone"; this answers the
 * question that sits right next to it — "for THIS card, which audiences does
 * it actually reach, and which does it never reach, and why."
 *
 * ── WHY THIS IS A PIVOT, NOT A NEW MEASUREMENT ────────────────────────────
 * Every fact this file reports already exists in the traces `resolveRunScope`
 * (`wing/harness-run-scope.ts`) returns — the same shared gathering P6.2
 * uses, so the two reports can never disagree about which runs are in scope
 * or how a run with no sessions is handled. This file's only job is
 * regrouping one heuristic id's outcomes by persona instead of summing them
 * across everyone, and reading the pre-filter's own drop reason back
 * verbatim — `traceTurn()` (`harness/selection-trace.ts`) already writes a
 * human-readable reason naming the card's population tags against the
 * student's own resolved tags ("card targets [X], student resolves to
 * [Y]"), which is exactly what makes an audience gap legible instead of just
 * a zero.
 */

export type CardComparisonPersonaRow = {
  runId: number;
  personaId: number;
  personaName: string;
  status: string;
  studentTags: string[];
  turnsTraced: number;
  turnsEligible: number;
  turnsConsidered: number;
  timesWon: number;
  outcome: "won" | "eligible_never_won" | "never_considered" | "never_eligible" | "no_turns";
  /** Verbatim, deduplicated reasons from the pre-filter drop this persona hit
   *  for this card — empty unless outcome is "never_eligible". */
  dropReasons: string[];
};

export type CardComparisonReport = {
  sequenceId: number;
  heuristicId: number;
  cardCode: string;
  name: string;
  perPersona: CardComparisonPersonaRow[];
  generatedAt: string;
};

export type BuildCardComparisonReportResult =
  | { ok: true; report: CardComparisonReport }
  | { ok: false; error: "no_runs_for_scope" }
  | { ok: false; error: "runs_span_multiple_sequences"; detail: string }
  | { ok: false; error: "card_not_found_in_scope" };

export async function buildCardComparisonReport(
  scope: RunScope,
  heuristicId: number,
): Promise<BuildCardComparisonReportResult> {
  const resolved = await resolveRunScope(scope);
  if (!resolved.ok) return resolved;

  let cardCode: string | null = null;
  let name: string | null = null;

  const perPersona: CardComparisonPersonaRow[] = resolved.runs.map((run) => {
    if (run.turnsTraced === 0) {
      return {
        runId: run.runId,
        personaId: run.personaId,
        personaName: run.personaName,
        status: run.status,
        studentTags: [],
        turnsTraced: 0,
        turnsEligible: 0,
        turnsConsidered: 0,
        timesWon: 0,
        outcome: "no_turns",
        dropReasons: [],
      };
    }

    const studentTags = run.traces[0]?.studentTags ?? [];
    let turnsEligible = 0;
    let turnsConsidered = 0;
    let timesWon = 0;
    const dropReasons = new Set<string>();

    for (const trace of run.traces) {
      const card = trace.cards.find((c) => c.heuristicId === heuristicId);
      if (!card) continue;
      if (cardCode === null) {
        cardCode = card.cardCode;
        name = card.name;
      }
      switch (card.outcome.state) {
        case "dropped":
          dropReasons.add(card.outcome.reason);
          break;
        case "considered":
          turnsEligible += 1;
          turnsConsidered += 1;
          break;
        case "won":
        case "withheld":
          turnsEligible += 1;
          turnsConsidered += 1;
          if (card.outcome.state === "won") timesWon += 1;
          break;
      }
    }

    const outcome: CardComparisonPersonaRow["outcome"] =
      timesWon > 0
        ? "won"
        : turnsEligible === 0
          ? "never_eligible"
          : turnsConsidered === 0
            ? "never_considered"
            : "eligible_never_won";

    return {
      runId: run.runId,
      personaId: run.personaId,
      personaName: run.personaName,
      status: run.status,
      studentTags,
      turnsTraced: run.turnsTraced,
      turnsEligible,
      turnsConsidered,
      timesWon,
      outcome,
      dropReasons: outcome === "never_eligible" ? [...dropReasons] : [],
    };
  });

  if (cardCode === null || name === null) {
    return { ok: false, error: "card_not_found_in_scope" };
  }

  return {
    ok: true,
    report: {
      sequenceId: resolved.sequenceId,
      heuristicId,
      cardCode,
      name,
      perPersona,
      generatedAt: new Date().toISOString(),
    },
  };
}

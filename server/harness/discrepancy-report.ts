/**
 * P5.4 — the discrepancy report (`TEST_HARNESS_PLAN_SEP9.md` §P5.4,
 * `TEST_HARNESS_EMAIL_SEP9.md` item 5). Danielle's own worked example is the
 * spec: *"persona used 14 hedges, engine fired no hedging card"* (a false
 * negative) or *"engine fired a directive card on a turn whose markers show
 * no reactance"* (an unearned fire) — per turn, with the turn quoted.
 *
 * ── WHY THIS IS SCOPED TO HEDGING ONLY, NOT EVERY MARKER ─────────────────
 * The plan's own example is hedging specifically, and that is also the one
 * marker class this file can honestly cross-reference against a card: a
 * card's purpose is nowhere structured in the schema (no `category` or
 * `targetsMarker` column on `heuristics`), so the only way to ask "is this
 * card about hedging" is to pattern-match its own name — and "hedging" is a
 * word methodology cards are likely to use in their own names when that is
 * what they address, unlike "reactance" or "sustain-talk," which are
 * clinical terms unlikely to appear verbatim in a card's name even when a
 * card addresses exactly that behavior. Generalizing this file to every P5.1
 * counter would mean inventing a marker-to-card-category mapping that does
 * not exist anywhere in the platform today — a methodology decision for
 * Danielle, not an engineering one for this file to guess at. Widening this
 * is a real next step, flagged rather than attempted here.
 *
 * ── PURE, READ-ONLY, ADDITIVE ─────────────────────────────────────────────
 * Takes an already-reconstructed `SessionTrace` (see `trace-store.ts`) and
 * produces findings from it — no database access of its own, no writes,
 * same rules as everything else under `server/harness/`.
 */

import { computeDeterministicMarkers } from "../wing/marker-instrumentation";
import type { SessionTrace } from "./trace-store";

/** Below this many hedging softeners in one turn, "the engine didn't fire a
 *  hedging card" is unremarkable — most turns don't hedge at all. Above it,
 *  a silent turn is worth a human's attention. Adjustable; not derived from
 *  anything in the methodology, since no threshold is specified anywhere. */
const HEDGE_THRESHOLD = 2;

/** A card's purpose is not structured data anywhere in the schema — this is
 *  a name-matching heuristic, not a fact, and every finding produced from it
 *  says so. */
const HEDGE_CARD_NAME_PATTERN = /hedg/i;

export type DiscrepancyFinding = {
  turnId: number;
  turnContent: string;
  hedgingSofteners: number;
  winnerCardCode: string | null;
  winnerCardName: string | null;
  /** false_negative: the persona hedged and no hedging-looking card won.
   *  unearned_fire: a hedging-looking card won on a turn with no hedging at all. */
  type: "false_negative" | "unearned_fire";
};

export function buildDiscrepancyReport(trace: SessionTrace): DiscrepancyFinding[] {
  const findings: DiscrepancyFinding[] = [];

  for (const turnRow of trace.turns) {
    const markers = computeDeterministicMarkers(turnRow.content);
    const winnerCard = turnRow.trace.cards.find((c) => c.outcome.state === "won") ?? null;
    const wonHedgingCard = winnerCard !== null && HEDGE_CARD_NAME_PATTERN.test(winnerCard.name);

    if (markers.hedgingSofteners >= HEDGE_THRESHOLD && !wonHedgingCard) {
      findings.push({
        turnId: turnRow.turnId,
        turnContent: turnRow.content,
        hedgingSofteners: markers.hedgingSofteners,
        winnerCardCode: winnerCard?.cardCode ?? null,
        winnerCardName: winnerCard?.name ?? null,
        type: "false_negative",
      });
    } else if (wonHedgingCard && markers.hedgingSofteners === 0) {
      findings.push({
        turnId: turnRow.turnId,
        turnContent: turnRow.content,
        hedgingSofteners: 0,
        winnerCardCode: winnerCard!.cardCode,
        winnerCardName: winnerCard!.name,
        type: "unearned_fire",
      });
    }
  }

  return findings;
}

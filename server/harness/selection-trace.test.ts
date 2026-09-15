import assert from "node:assert/strict";
import {
  UNAVAILABLE,
  classifyUnfired,
  parseApplicationNote,
  traceTurn,
  type TraceInputCard,
} from "./selection-trace";

/**
 * Tests for the selection-trace reconstruction.
 *
 * Pure, so it runs with no database and no model — which is the point of
 * splitting the funnel logic out of `trace-store.ts`. The thing being tested is
 * whether this file agrees with the engine, and the assertions below pin the
 * four claims that would be silently wrong if it did not:
 *
 *   - a gate never reaches the detector, whatever its signal says
 *   - an unknown session type filters nothing (the engine's fail-open)
 *   - the audience pre-filter is a DROP with a stage, not an absence
 *   - "never fired" splits three ways, and never_eligible is not her finding
 */

let failures = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${(err as Error).message}`);
  }
}

console.log("\nharness/selection-trace\n");

const card = (over: Partial<TraceInputCard> = {}): TraceInputCard => ({
  heuristicId: 1,
  cardCode: "H-201",
  name: "H-201 credibility test",
  cardKind: "coaching_card",
  weight: 1,
  position: 1,
  appliesToSession: null,
  populationTags: [],
  hasSignalComponent: true,
  ...over,
});

const base = {
  sequenceId: 5,
  sessionType: "foundation_2" as string | null,
  studentTags: ["mid_career"],
  applied: null,
};

/* ── the funnel ───────────────────────────────────────────────────────────── */

test("a gate is dropped at card_kind and never considered", () => {
  const t = traceTurn({
    ...base,
    sequenceCards: [card({ cardKind: "integrity_gate", cardCode: "IG-U007" })],
  });
  assert.equal(t.counts.considered, 0);
  assert.equal(t.counts.dropped.card_kind, 1);
  const [only] = t.cards;
  assert.equal(only.outcome.state, "dropped");
  if (only.outcome.state === "dropped") assert.equal(only.outcome.stage, "card_kind");
});

test("an exercise is dropped too — the detector asks for coaching cards only", () => {
  const t = traceTurn({ ...base, sequenceCards: [card({ cardKind: "exercise" })] });
  assert.equal(t.counts.dropped.card_kind, 1);
});

test("a card scoped to another session is dropped at session_scope", () => {
  const t = traceTurn({
    ...base,
    sequenceCards: [card({ appliesToSession: "foundation_1" })],
  });
  assert.equal(t.counts.dropped.session_scope, 1);
});

test("an unscoped card survives any session", () => {
  const t = traceTurn({ ...base, sequenceCards: [card({ appliesToSession: null })] });
  assert.equal(t.counts.considered, 1);
});

test("an unknown session type filters nothing — the engine's fail-open", () => {
  /*
   * getActiveSequenceForStudent leaves the scope unset when it cannot resolve
   * the session, "because an unscoped catalogue offers a few cards pitched at
   * the wrong session, an empty one silently switches the methodology off".
   * A trace that filtered anyway would invent drops the engine never made.
   */
  const t = traceTurn({
    ...base,
    sessionType: null,
    sequenceCards: [card({ appliesToSession: "foundation_1" })],
  });
  assert.equal(t.counts.dropped.session_scope, 0);
  assert.equal(t.counts.considered, 1);
});

test("the audience pre-filter is a drop with a stage and a readable reason", () => {
  // The finding this exists to prevent: four of five audience variants leave
  // before the detector, and a trace blind to that reports them as dead weight.
  const t = traceTurn({
    ...base,
    studentTags: ["mid_career"],
    sequenceCards: [
      card({ heuristicId: 1, cardCode: "H-202-UG", populationTags: ["undergraduate"] }),
      card({ heuristicId: 2, cardCode: "H-202-MC", populationTags: ["mid_career"] }),
    ],
  });
  assert.equal(t.counts.dropped.population_tag, 1);
  assert.equal(t.counts.considered, 1);
  const ug = t.cards.find((c) => c.cardCode === "H-202-UG")!;
  assert.equal(ug.outcome.state, "dropped");
  if (ug.outcome.state === "dropped") {
    assert.equal(ug.outcome.stage, "population_tag");
    assert.match(ug.outcome.reason, /undergraduate/);
    assert.match(ug.outcome.reason, /mid_career/);
  }
});

test("a card with no signal component cannot be matched against", () => {
  const t = traceTurn({ ...base, sequenceCards: [card({ hasSignalComponent: false })] });
  assert.equal(t.counts.dropped.no_signal_component, 1);
});

test("the winner carries its confidence and the detector's own rationale", () => {
  const t = traceTurn({
    ...base,
    sequenceCards: [card({ heuristicId: 7 }), card({ heuristicId: 8, cardCode: "H-205" })],
    applied: { heuristicId: 7, confidence: 0.83, rationale: "hedged the claim", withheld: false },
  });
  assert.deepEqual(t.winner, { heuristicId: 7, cardCode: "H-201", confidence: 0.83 });
  assert.equal(t.noFire, null);
  const loser = t.cards.find((c) => c.heuristicId === 8)!;
  assert.equal(loser.outcome.state, "considered");
});

test("an H-003 withholding is `withheld`, not `won` — Wing did not use it", () => {
  const t = traceTurn({
    ...base,
    sequenceCards: [card({ heuristicId: 7 })],
    applied: {
      heuristicId: 7,
      confidence: null,
      rationale: "held back H-201 — two consecutive high-intensity turns",
      withheld: true,
    },
  });
  assert.equal(t.cards[0].outcome.state, "withheld");
  assert.equal(t.winner, null);
});

test("a silent turn says the reason is not recorded rather than guessing one", () => {
  const t = traceTurn({ ...base, sequenceCards: [card()] });
  assert.equal(t.noFire, "reason_not_recorded");
});

test("every trace carries what it cannot contain", () => {
  const t = traceTurn({ ...base, sequenceCards: [card()] });
  assert.deepEqual(t.unavailable, [...UNAVAILABLE]);
  assert.equal(t.unavailable.length, 3);
  assert.ok(t.unavailable.some((u) => u.startsWith("per_candidate_match_scores")));
});

test("cards read in the order the detector saw them — weight, then position", () => {
  const t = traceTurn({
    ...base,
    sequenceCards: [
      card({ heuristicId: 1, cardCode: "A", weight: 1, position: 1 }),
      card({ heuristicId: 2, cardCode: "B", weight: 2, position: 9 }),
      card({ heuristicId: 3, cardCode: "C", weight: 1, position: 2 }),
    ],
  });
  assert.deepEqual(t.cards.map((c) => c.cardCode), ["B", "A", "C"]);
});

/* ── the application note ─────────────────────────────────────────────────── */

test("the note format evaluateTurn writes parses back to confidence and rationale", () => {
  assert.deepEqual(parseApplicationNote("confidence 0.83: hedged the claim"), {
    confidence: 0.83,
    rationale: "hedged the claim",
    withheld: false,
  });
});

test("a note with no rationale still yields the confidence", () => {
  assert.deepEqual(parseApplicationNote("confidence 0.70"), {
    confidence: 0.7,
    rationale: null,
    withheld: false,
  });
});

test("a withholding note is recognised as one", () => {
  const p = parseApplicationNote("held back H-201 — two consecutive high-intensity turns");
  assert.equal(p.withheld, true);
  assert.equal(p.confidence, null);
});

test("an unrecognised note is returned opaque, never coerced", () => {
  const p = parseApplicationNote("written by something else");
  assert.equal(p.confidence, null);
  assert.equal(p.rationale, "written by something else");
  assert.equal(p.withheld, false);
});

test("a null note does not throw", () => {
  assert.deepEqual(parseApplicationNote(null), {
    confidence: null,
    rationale: null,
    withheld: false,
  });
});

/* ── the Unfired Cards report ─────────────────────────────────────────────── */

test("never_eligible is separated from eligible_never_won", () => {
  /*
   * The whole reason this returns three buckets. A card the audience pre-filter
   * dropped on every turn is a persona-coverage gap; a card that competed and
   * lost is a signal-condition finding. One number would present the first as
   * the second, and Danielle would rewrite a card that was never evaluated.
   */
  const traces = [
    traceTurn({
      ...base,
      studentTags: ["mid_career"],
      sequenceCards: [
        card({ heuristicId: 1, cardCode: "H-UG", populationTags: ["undergraduate"] }),
        card({ heuristicId: 2, cardCode: "H-MC", populationTags: ["mid_career"] }),
        card({ heuristicId: 3, cardCode: "H-WIN", populationTags: ["mid_career"] }),
      ],
      applied: { heuristicId: 3, confidence: 0.9, rationale: null, withheld: false },
    }),
  ];

  const rows = classifyUnfired(traces);
  const by = (code: string) => rows.find((r) => r.cardCode === code)!;

  assert.equal(by("H-UG").bucket, "never_eligible");
  assert.deepEqual(by("H-UG").dropStages, ["population_tag"]);
  assert.equal(by("H-MC").bucket, "eligible_never_won");
  assert.equal(by("H-MC").turnsConsidered, 1);
  assert.equal(by("H-WIN").bucket, "fired");
  assert.equal(by("H-WIN").timesWon, 1);
});

test("a card that won once is `fired` even if it lost every other turn", () => {
  const cards = [card({ heuristicId: 1, cardCode: "H-X" })];
  const rows = classifyUnfired([
    traceTurn({ ...base, sequenceCards: cards }),
    traceTurn({
      ...base,
      sequenceCards: cards,
      applied: { heuristicId: 1, confidence: 0.8, rationale: null, withheld: false },
    }),
    traceTurn({ ...base, sequenceCards: cards }),
  ]);
  assert.equal(rows[0].bucket, "fired");
  assert.equal(rows[0].timesWon, 1);
  assert.equal(rows[0].turnsEligible, 3);
});

test("a gate accumulates card_kind drops and never becomes her finding", () => {
  const rows = classifyUnfired([
    traceTurn({
      ...base,
      sequenceCards: [card({ heuristicId: 9, cardCode: "IG-U007", cardKind: "integrity_gate" })],
    }),
  ]);
  assert.equal(rows[0].bucket, "never_eligible");
  assert.deepEqual(rows[0].dropStages, ["card_kind"]);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

/**
 * coaching-debrief's pure half (coaching-debrief-format.ts) —
 * findMarkerPatterns/collectCardFirings/collectWithheld take RunExport turns
 * and need no database; buildCoachingDebrief itself (test-run-export.ts's
 * buildRunExport importing ../db) is not covered here, same split every
 * other pure/impure pair in this harness already uses.
 *
 * Run: npx tsx server/wing/coaching-debrief.test.ts
 */
import assert from "node:assert/strict";
import { collectCardFirings, collectWithheld, findMarkerPatterns } from "./coaching-debrief-format";
import type { RunExport } from "./run-export-format";
import type { TracedCard, TurnTrace } from "../harness/selection-trace";

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

console.log("\ncoaching-debrief\n");

function markers(overrides: Partial<NonNullable<RunExport["turns"][number]["markerCounts"]>> = {}) {
  return {
    wordCount: 10,
    modalVerbs: { epistemic: 0, deontic: 0, dynamic: 0 },
    pronouns: { firstPersonSingular: 0, collective: 0, depersonalized: 0 },
    causalConnectives: 0,
    repairFalseStarts: 0,
    hedgingSofteners: 0,
    ...overrides,
  };
}

function card(overrides: Partial<TracedCard>): TracedCard {
  return {
    heuristicId: 1,
    cardCode: "H-001",
    name: "Some Card",
    cardKind: "coaching_card",
    weight: 1,
    position: 1,
    appliesToSession: null,
    populationTags: [],
    hasSignalComponent: true,
    outcome: { state: "considered" },
    ...overrides,
  };
}

function trace(cards: TracedCard[]): TurnTrace {
  return {
    turnId: 1,
    sequenceId: 1,
    sessionType: "foundation_1",
    studentTags: [],
    cards,
    counts: {
      inSequence: cards.length,
      considered: cards.length,
      dropped: { card_kind: 0, session_scope: 0, population_tag: 0, no_signal_component: 0 },
    },
    winner: null,
    noFire: null,
    unavailable: [],
  } as unknown as TurnTrace;
}

function turn(overrides: Partial<RunExport["turns"][number]>): RunExport["turns"][number] {
  return {
    turnIndex: 0,
    speaker: "persona",
    content: "text",
    cardApplied: null,
    markerCounts: null,
    gateFindings: [],
    selectionTrace: null,
    deliveryAudience: null,
    deliveryRegister: null,
    ...overrides,
  };
}

test("findMarkerPatterns: a marker appearing once has no second instance and does not meet threshold", () => {
  const patterns = findMarkerPatterns([
    turn({ turnIndex: 0, markerCounts: markers({ hedgingSofteners: 1 }) }),
    turn({ turnIndex: 1, markerCounts: markers() }),
  ]);
  const hedging = patterns.find((p) => p.category === "hedgingSofteners");
  assert.ok(hedging, "expected a hedgingSofteners pattern");
  assert.equal(hedging!.firstTurnIndex, 0);
  assert.equal(hedging!.secondTurnIndex, null);
  assert.equal(hedging!.thresholdMet, false);
});

test("findMarkerPatterns: a marker appearing twice reports both turns and meets threshold", () => {
  const patterns = findMarkerPatterns([
    turn({ turnIndex: 0, markerCounts: markers({ hedgingSofteners: 1 }) }),
    turn({ turnIndex: 1, speaker: "wing", markerCounts: null }),
    turn({ turnIndex: 2, markerCounts: markers({ hedgingSofteners: 2 }) }),
  ]);
  const hedging = patterns.find((p) => p.category === "hedgingSofteners");
  assert.equal(hedging!.firstTurnIndex, 0);
  assert.equal(hedging!.secondTurnIndex, 2);
  assert.equal(hedging!.turnsPresent, 2);
  assert.equal(hedging!.thresholdMet, true);
});

test("findMarkerPatterns: wing turns (null markerCounts) never contribute a pattern", () => {
  const patterns = findMarkerPatterns([
    turn({ turnIndex: 0, speaker: "wing", markerCounts: null }),
  ]);
  assert.deepEqual(patterns, []);
});

test("findMarkerPatterns: a category that never appears is omitted, not reported as zero", () => {
  const patterns = findMarkerPatterns([turn({ turnIndex: 0, markerCounts: markers() })]);
  assert.deepEqual(patterns, []);
});

test("collectCardFirings: reads the winning card's confidence and rationale back off its trace", () => {
  const winCard = card({
    cardCode: "H-014",
    name: "Reflect hedging",
    outcome: { state: "won", confidence: 0.83, rationale: "hedged twice" },
  });
  const firings = collectCardFirings([
    turn({
      turnIndex: 0,
      cardApplied: { cardCode: "H-014", name: "Reflect hedging", componentVersion: 3 },
      selectionTrace: trace([winCard]),
    }),
  ]);
  assert.equal(firings.length, 1);
  assert.equal(firings[0].confidence, 0.83);
  assert.equal(firings[0].rationale, "hedged twice");
  assert.equal(firings[0].componentVersion, 3);
});

test("collectCardFirings: a turn with no winning card contributes nothing", () => {
  const firings = collectCardFirings([turn({ turnIndex: 0, cardApplied: null })]);
  assert.deepEqual(firings, []);
});

test("collectWithheld: surfaces a withheld card's code and reason, not just that something happened", () => {
  const withheldCard = card({
    cardCode: "H-620",
    name: "Intense card",
    outcome: { state: "withheld", reason: "H-003 intensity sequencing" },
  });
  const withheld = collectWithheld([
    turn({ turnIndex: 4, selectionTrace: trace([withheldCard]) }),
  ]);
  assert.equal(withheld.length, 1);
  assert.equal(withheld[0].turnIndex, 4);
  assert.equal(withheld[0].cardCode, "H-620");
  assert.equal(withheld[0].reason, "H-003 intensity sequencing");
});

test("collectWithheld: a won or dropped card is never reported as withheld", () => {
  const wonCard = card({ cardCode: "H-001", outcome: { state: "won", confidence: 0.9, rationale: "x" } });
  const droppedCard = card({ cardCode: "H-002", outcome: { state: "dropped", stage: "card_kind", reason: "not a coaching card" } });
  const withheld = collectWithheld([
    turn({ turnIndex: 0, selectionTrace: trace([wonCard, droppedCard]) }),
  ]);
  assert.deepEqual(withheld, []);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

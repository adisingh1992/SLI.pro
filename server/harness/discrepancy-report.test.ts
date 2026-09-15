import assert from "node:assert/strict";
import { buildDiscrepancyReport } from "./discrepancy-report";
import type { SessionTrace } from "./trace-store";
import type { TracedCard, TurnTrace } from "./selection-trace";

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

console.log("\ndiscrepancy-report\n");

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

function turnTrace(cards: TracedCard[]): TurnTrace {
  const winner = cards.find((c) => c.outcome.state === "won") ?? null;
  return {
    turnId: 1,
    sequenceId: 1,
    sessionType: "foundation_1",
    studentTags: [],
    cards,
    counts: { inSequence: cards.length, considered: cards.length, dropped: { card_kind: 0, session_scope: 0, population_tag: 0, no_signal_component: 0 } },
    winner:
      winner && winner.outcome.state === "won"
        ? { heuristicId: winner.heuristicId, cardCode: winner.cardCode, confidence: winner.outcome.confidence }
        : null,
    noFire: winner ? null : "reason_not_recorded",
    unavailable: [],
  };
}

function trace(turns: { turnId: number; content: string; cards: TracedCard[] }[]): SessionTrace {
  return {
    sessionId: 1,
    studentId: 1,
    sessionType: "foundation_1",
    sequenceId: 1,
    sequenceSource: "application_log",
    populationTags: [],
    populationTagsAsOf: "now",
    turns: turns.map((t) => ({
      turnId: t.turnId,
      sequencePosition: t.turnId,
      turnType: "human_elicited_response",
      content: t.content,
      analysisEligible: true,
      analysisExclusionReason: null,
      trace: turnTrace(t.cards),
      gateFindings: [],
    })),
  };
}

test("flags a false negative: heavy hedging, no hedging card won", () => {
  const s = trace([
    {
      turnId: 1,
      content: "I just think maybe I should try, but I guess I'm not sure, kind of.",
      cards: [card({ outcome: { state: "considered" } })],
    },
  ]);
  const findings = buildDiscrepancyReport(s);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, "false_negative");
  assert.equal(findings[0].winnerCardName, null);
});

test("flags an unearned fire: a hedging-named card won with zero hedging language", () => {
  const s = trace([
    {
      turnId: 2,
      content: "I have decided to leave my job and start the business next month.",
      cards: [
        card({
          cardCode: "H-050",
          name: "Hedging Language Reflection",
          outcome: { state: "won", confidence: 0.8, rationale: "detected hedging" },
        }),
      ],
    },
  ]);
  const findings = buildDiscrepancyReport(s);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, "unearned_fire");
  assert.equal(findings[0].winnerCardName, "Hedging Language Reflection");
});

test("a hedging card that DID win on a hedging-heavy turn is not a discrepancy", () => {
  const s = trace([
    {
      turnId: 3,
      content: "I just think maybe I should try, but I guess I'm not sure, kind of.",
      cards: [
        card({
          cardCode: "H-050",
          name: "Hedging Language Reflection",
          outcome: { state: "won", confidence: 0.9, rationale: "detected hedging" },
        }),
      ],
    },
  ]);
  assert.deepEqual(buildDiscrepancyReport(s), []);
});

test("light hedging below threshold with no card firing is not flagged", () => {
  const s = trace([
    {
      turnId: 4,
      content: "I just want to check one thing before we continue.",
      cards: [card({ outcome: { state: "considered" } })],
    },
  ]);
  assert.deepEqual(buildDiscrepancyReport(s), []);
});

test("a non-hedging card winning on a non-hedging turn is not flagged", () => {
  const s = trace([
    {
      turnId: 5,
      content: "I have decided to leave my job and start the business next month.",
      cards: [
        card({
          cardCode: "H-010",
          name: "Directive Reflection",
          outcome: { state: "won", confidence: 0.7, rationale: "directive" },
        }),
      ],
    },
  ]);
  assert.deepEqual(buildDiscrepancyReport(s), []);
});

test("every finding quotes the turn's own content, per the plan's own requirement", () => {
  const content = "I just think maybe I should try, but I guess I'm not sure, kind of.";
  const s = trace([{ turnId: 6, content, cards: [card({ outcome: { state: "considered" } })] }]);
  const findings = buildDiscrepancyReport(s);
  assert.equal(findings[0].turnContent, content);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

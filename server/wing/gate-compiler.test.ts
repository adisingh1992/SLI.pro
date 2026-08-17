import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DRAFT_PATH_GATES,
  GATE_PRECONDITIONS,
  redactCardCodes,
  redactedFrom,
  NO_TIER1_SURFACE,
  compileGates,
  excludedGates,
  turnPathGates,
  type GateCard,
} from "./gate-compiler";
import { isTier1, parseCompendium } from "./parse-compendium";

/**
 * Tests for gate compilation (methodology v2, T4).
 *
 * Two things are being defended. The first is leakage: no card code and no card
 * name may reach the prompt, because IG-U005 forbids internal methodology
 * vocabulary in user-facing output and IG-V01 forbids anything that sounds like a
 * system — and a phrase in context is a phrase the model can repeat.
 *
 * The second is size. This section goes into EVERY turn of an already-large
 * prompt, so its token cost is pinned. If a revision doubles it, that should be
 * a decision somebody makes, not something discovered from a latency graph.
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

console.log("\ngate-compiler\n");

const gate = (over: Partial<GateCard> = {}): GateCard => ({
  cardCode: "H-001",
  name: "H-001 Pattern vs. Instance Enforcement",
  coachingMove: "Never call something a pattern on fewer than three instances.",
  failurePath: "Downgrade the claim to a single observation.",
  appliesToSession: null,
  ...over,
});

test("no rules means no section, not an empty heading", () => {
  // An empty "rules you must follow" heading reads to a model as though the
  // rules were withheld.
  assert.equal(compileGates([]), "");
  assert.equal(compileGates([gate({ coachingMove: null })]), "");
  assert.equal(compileGates([gate({ coachingMove: "   " })]), "");
});

test("the rule text is rendered", () => {
  const out = compileGates([gate()]);
  assert.ok(out.indexOf("Never call something a pattern") >= 0);
});

test("no card code reaches the prompt", () => {
  const out = compileGates([
    gate({ cardCode: "H-109", name: "H-109 Never Assign a Function" }),
    gate({ cardCode: "IG-U005", name: "IG-U005 Internal methodology language" }),
  ]);
  assert.equal(out.indexOf("H-109"), -1);
  assert.equal(out.indexOf("IG-U005"), -1);
});

test("no card name reaches the prompt", () => {
  const out = compileGates([gate({ name: "H-001 Pattern vs. Instance Enforcement" })]);
  assert.equal(out.indexOf("Pattern vs. Instance Enforcement"), -1);
});

test("the prompt says the rules govern Wing's own output", () => {
  // The single most consequential sentence here. A gate handed to the model as if
  // it described the student turns the rule inside out.
  const out = compileGates([gate()]);
  assert.ok(out.indexOf("what YOU say") >= 0);
  assert.ok(out.indexOf("Never mention them") >= 0);
});

test("session-scoped and universal rules are separated and numbered once", () => {
  const out = compileGates([
    gate({ cardCode: "H-001" }),
    gate({ cardCode: "H-002", coachingMove: "Cite the source of any prior-session reference." }),
    gate({
      cardCode: "H-109",
      coachingMove: "Never declare the student's function for them.",
      appliesToSession: "foundation_1",
    }),
  ]);
  assert.ok(out.indexOf("Always:") >= 0);
  assert.ok(out.indexOf("In this part of the programme:") >= 0);
  // Numbering continues across the two groups rather than restarting, so "rule 3"
  // is unambiguous.
  assert.ok(out.indexOf("3. Never declare the student's function") >= 0);
});

test("failure paths are omitted by default and included on request", () => {
  const without = compileGates([gate()]);
  assert.equal(without.indexOf("Downgrade the claim"), -1);
  const with_ = compileGates([gate()], { includeFailurePath: true });
  assert.ok(with_.indexOf("Downgrade the claim") >= 0);
});

test("draft-path gates are excluded from the turn prompt", () => {
  // IG-V04, IG-V05 and IG-V07 act on a composed artefact, not a streamed turn.
  // authenticity.ts already runs there.
  const gates = DRAFT_PATH_GATES.map((cardCode) => gate({ cardCode }));
  assert.deepEqual(turnPathGates(gates), []);
  assert.equal(compileGates(gates), "");
});

test("a gate with no Tier 1 surface is excluded, and says why", () => {
  const gates = [gate({ cardCode: "H-005" }), gate({ cardCode: "H-001" })];
  assert.deepEqual(turnPathGates(gates).map((g) => g.cardCode), ["H-001"]);
  assert.deepEqual(excludedGates(gates), [
    { cardCode: "H-005", reason: "every stated surface is a Tier 2 module" },
  ]);
});

test("an unlisted gate is INCLUDED by default", () => {
  // The safe direction. A gate Danielle adds later reaches the prompt rather
  // than being silently dropped, which is what you want from a rule about what
  // Wing must never do.
  assert.equal(turnPathGates([gate({ cardCode: "H-999" })]).length, 1);
  assert.equal(NO_TIER1_SURFACE.indexOf("H-999"), -1);
});


/* ── Preconditions ───────────────────────────────────────────────────────── */

test("a precondition gate is dropped when its condition is absent", () => {
  const gates = [
    gate({ cardCode: "IG-U03", coachingMove: "Confirm what you found in the file." }),
    gate({ cardCode: "IG-U05", coachingMove: "Lead with curiosity, not disappointment." }),
    gate({ cardCode: "H-001" }),
  ];
  const none = { hasUploadedDocument: false, openTasks: 0 };
  assert.deepEqual(turnPathGates(gates, none).map((g) => g.cardCode), ["H-001"]);
  assert.equal(compileGates(gates, { conditions: none }).indexOf("Confirm what you found"), -1);
  assert.equal(compileGates(gates, { conditions: none }).indexOf("Lead with curiosity"), -1);
});

test("a precondition gate is kept when its condition holds", () => {
  const gates = [
    gate({ cardCode: "IG-U03", coachingMove: "Confirm what you found in the file." }),
    gate({ cardCode: "IG-U05", coachingMove: "Lead with curiosity, not disappointment." }),
  ];
  const both = { hasUploadedDocument: true, openTasks: 2 };
  assert.deepEqual(turnPathGates(gates, both).map((g) => g.cardCode), ["IG-U03", "IG-U05"]);
  assert.ok(compileGates(gates, { conditions: both }).indexOf("Confirm what you found") >= 0);
});

test("an unsupplied condition counts as satisfied", () => {
  /*
   * The safe direction, and the reason every existing caller is unaffected. Not
   * knowing whether the student uploaded anything must never be the reason a rule
   * about handling their data goes missing.
   */
  const gates = [gate({ cardCode: "IG-U03" }), gate({ cardCode: "IG-U05" })];
  assert.equal(turnPathGates(gates).length, 2);
  assert.equal(turnPathGates(gates, {}).length, 2);
  assert.equal(turnPathGates(gates, { openTasks: 0 }).length, 1);
});

test("an unmet precondition is reported with the reason", () => {
  const gates = [gate({ cardCode: "IG-U05" })];
  assert.deepEqual(excludedGates(gates, { openTasks: 0 }), [
    { cardCode: "IG-U05", reason: "the student has no unanswered tasks to follow up on" },
  ]);
});

test("every precondition quotes the detection method it came from", () => {
  const codes = Object.keys(GATE_PRECONDITIONS);
  assert.deepEqual(codes.sort(), ["IG-U03", "IG-U05"]);
  for (const code of codes) {
    assert.ok(GATE_PRECONDITIONS[code].source.indexOf("Fires") >= 0, code);
    assert.ok(GATE_PRECONDITIONS[code].reason.length > 20, code);
  }
});

/* ── Against the real methodology ────────────────────────────────────────── */

const parsed = parseCompendium(
  readFileSync("methodology/wing-master-module-compendium-v2.md", "utf8"),
);
const tier1Gates: GateCard[] = parsed.cards
  .filter(isTier1)
  .filter((c) => c.cardKind === "integrity_gate")
  .map((c) => ({
    cardCode: c.cardCode,
    name: c.name,
    coachingMove: c.components.coaching_move ?? null,
    failurePath: c.components.failure_path ?? null,
    appliesToSession:
      c.module === "foundation_1" || c.module === "foundation_2" || c.module === "foundation_3"
        ? c.module
        : null,
  }));

test("24 Tier 1 gates, of which 20 reach a conversational turn", () => {
  assert.equal(tier1Gates.length, 24);
  assert.equal(turnPathGates(tier1Gates).length, 20);
  assert.equal(excludedGates(tier1Gates).length, 4);
});

test("two of the 20 are conditional, so a quiet turn compiles 18", () => {
  // No upload in context and no outstanding task is the ordinary case, and it is
  // 18 rules rather than 20 — about 250 tokens, and two rules the model cannot
  // act on out of the way.
  const quiet = { hasUploadedDocument: false, openTasks: 0 };
  assert.equal(turnPathGates(tier1Gates, quiet).length, 18);
  const reasons = excludedGates(tier1Gates, quiet).map((e) => e.cardCode);
  assert.ok(reasons.indexOf("IG-U03") >= 0);
  assert.ok(reasons.indexOf("IG-U05") >= 0);
});

test("the compiled section stays under 3,200 tokens for every session", () => {
  /*
   * Measured, not guessed: this goes into every turn of a prompt that is already
   * 10-13k tokens, so it is a latency and cost decision as much as a methodology
   * one. All 24 gates with failure paths was ~5,000 tokens; the two exclusions and
   * dropping failure paths bring it to ~2,700-2,900.
   *
   * The ceiling is deliberately close to the real figure. A revision that pushes
   * past it should be a decision somebody takes.
   */
  const universal = tier1Gates.filter((g) => g.appliesToSession === null);
  for (const session of ["foundation_1", "foundation_2", "foundation_3"]) {
    const set = universal.concat(
      tier1Gates.filter((g) => g.appliesToSession === session),
    );
    const compiled = compileGates(set);
    const tokens = Math.round(compiled.length / 4);
    assert.ok(tokens > 0, `${session} compiled to nothing`);
    assert.ok(tokens < 3200, `${session} compiles to ~${tokens} tokens`);
  }
});

test("a citation inside rule text is redacted, not passed through", () => {
  // Danielle's rule text cites other cards as editorial asides. The instruction
  // survives without the code; the code cannot survive into the prompt.
  assert.equal(
    redactCardCodes("The elimination exercise (H-103) produces candidates."),
    "The elimination exercise (another of these rules) produces candidates.",
  );
  assert.equal(redactCardCodes("no codes here").indexOf("another of these rules"), -1);
});

test("the two real gates that cite others are reported", () => {
  // Reported rather than silently rewritten, so the source can be tidied. If
  // Danielle removes the asides this drops to an empty list and the test says so.
  assert.deepEqual(redactedFrom(tier1Gates), [
    { cardCode: "H-109", cited: ["H-103"] },
    { cardCode: "IG-U04", cited: ["H-001", "H-807"] },
  ]);
});

test("every rule in the real compiled section is unattributed", () => {
  // The leakage check, run against the actual methodology rather than fixtures.
  const compiled = compileGates(tier1Gates);
  for (const g of tier1Gates) {
    assert.equal(
      compiled.indexOf(g.cardCode),
      -1,
      `${g.cardCode} appears in the compiled prompt`,
    );
  }
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

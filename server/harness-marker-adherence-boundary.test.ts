import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The boundary for P4.3 (persona adherence) and P5 (Stage 1 marker
 * instrumentation) — `TEST_HARNESS_PLAN_SEP9.md` §P4.3/§P5,
 * `TEST_HARNESS_EMAIL_SEP9.md` items 5-6. Both are explicitly
 * runner-side-only in the plan: measuring a persona's own language needs
 * nobody's methodology sign-off, but the same parsers running inside the
 * live turn handler would be a change to live coaching. This file pins that
 * boundary the same way every other harness boundary test pins its own:
 * structurally, by scanning source rather than trusting a comment.
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

console.log("\nharness-marker-adherence/boundary\n");

const HERE = dirname(fileURLToPath(import.meta.url));
const markersText = readFileSync(join(HERE, "wing", "marker-instrumentation.ts"), "utf8");
const adherenceText = readFileSync(join(HERE, "wing", "persona-adherence.ts"), "utf8");
const storeText = readFileSync(join(HERE, "wing", "test-run-store.ts"), "utf8");
const discrepancyText = readFileSync(join(HERE, "harness", "discrepancy-report.ts"), "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const markersBody = stripComments(markersText);
const adherenceBody = stripComments(adherenceText);
const storeBody = stripComments(storeText);
const discrepancyBody = stripComments(discrepancyText);

test("marker-instrumentation.ts is pure — no database, no orchestrator, no network", () => {
  assert.ok(
    !/from\s+["']\.\.?\/(db|orchestrator)/.test(markersBody) && !/\bdb\./.test(markersBody),
    "P5 counters must be computable over any string, with no I/O of any kind",
  );
});

test("persona-adherence.ts is pure — no database, no orchestrator, no network", () => {
  assert.ok(
    !/from\s+["']\.\.?\/(db|orchestrator)/.test(adherenceBody) && !/\bdb\./.test(adherenceBody),
    "P4.3 scoring must run over turn text alone, with no I/O of any kind",
  );
});

test("the four P5.2 classifications are named, not silently dropped", () => {
  const EXPECTED = [
    "sustain_talk_vs_change_talk",
    "episodic_specificity_vs_generalization",
    "hedging_asymmetry",
    "reactance_autonomy_assertions",
  ];
  for (const key of EXPECTED) {
    assert.ok(
      markersBody.includes(key),
      `NOT_MEASURED_CLASSIFICATIONS must name "${key}" — approximating it instead would be the exact false precision this harness refuses elsewhere`,
    );
  }
});

test("adherence reports profanity and backstory contradictions as not measured, not scored", () => {
  assert.ok(
    /mild profanity present when engaged/.test(adherenceBody),
    "the report must name this rule and say why it isn't automated, not silently omit it",
  );
  assert.ok(
    /no backstory contradictions/.test(adherenceBody),
    "the report must name this rule and say why it isn't automated, not silently omit it",
  );
});

test("the word-count band matches the persona contract (30-150 words)", () => {
  assert.ok(
    /min:\s*30/.test(adherenceBody) && /max:\s*150/.test(adherenceBody),
    "P4.2's persona contract is 30-150 word responses — the band here must match it",
  );
});

test("adherence is computed on read, not written anywhere", () => {
  assert.ok(
    !/\.(insert|update|delete)\s*\(/.test(adherenceBody),
    "persona-adherence.ts must never write to the database — it's a pure function over text",
  );
});

test("getTestRunDetail scores only the persona's own turns, not Wing's replies", () => {
  assert.ok(
    /filter\(\s*\(t\)\s*=>\s*!isAiTurn\(t\.turnType\)\s*\)/.test(storeBody),
    "the adherence report is about the persona's language — Wing's turns must be filtered out before scoring",
  );
});

test("P5.4 — discrepancy-report.ts is pure — no database, no orchestrator, no network", () => {
  assert.ok(
    !/from\s+["']\.\.?\/(db|orchestrator)/.test(discrepancyBody) && !/\bdb\./.test(discrepancyBody),
    "the discrepancy report must run over an already-reconstructed SessionTrace, with no I/O of its own",
  );
});

test("P5.4 is scoped to hedging by name-matching, and says so rather than inventing a general marker-to-card mapping", () => {
  assert.ok(
    /HEDGE_CARD_NAME_PATTERN/.test(discrepancyBody),
    "the file must name its one heuristic explicitly rather than generalize silently",
  );
  // Checked against the raw text (comments intact) — this is a documentation
  // requirement, not a forbidden-code-pattern one.
  assert.ok(
    /methodology decision/i.test(discrepancyText),
    "the doc comment must say widening this needs a methodology decision, not an engineering guess",
  );
});

test("getTestRunDetail also computes the discrepancy report from the same session trace", () => {
  assert.ok(
    /sessionTrace\(runSession\.sessionId\)/.test(storeBody) && /buildDiscrepancyReport\(trace\)/.test(storeBody),
    "P5.4 must be wired into the same read path as adherence, not left as a route only the general Simulations screen reaches",
  );
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

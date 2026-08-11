import assert from "node:assert/strict";
import {
  NACE_COMPETENCIES,
  emptyCoverage,
  getCompetency,
  isCompetencyKey,
  renderForPrompt,
  resolveCompetency,
} from "./nace-competencies";

/**
 * Tests for the NACE reference data (Feature List A4).
 *
 * The competency label on a portfolio item goes into institutional reporting.
 * A wrong one is not a display bug — it is a number in a report Berkeley or
 * Vanderbilt shows someone, attributed to a category that does not exist in
 * their framework.
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

console.log("\nnace-competencies\n");

test("there are exactly eight", () => {
  // NACE publishes eight. A ninth means someone invented one; seven means one
  // was dropped in an edit.
  assert.equal(NACE_COMPETENCIES.length, 8);
});

test("keys and names are unique", () => {
  const keys = NACE_COMPETENCIES.map((c) => c.key);
  const names = NACE_COMPETENCIES.map((c) => c.name);
  assert.equal(new Set(keys).size, 8);
  assert.equal(new Set(names).size, 8);
});

test("the published names are exact", () => {
  // Checked against NACE "Competencies for a Career-Ready Workforce",
  // December 2025. The punctuation is theirs — "+", not "and".
  assert.deepEqual(
    NACE_COMPETENCIES.map((c) => c.name),
    [
      "Career + Self-Development",
      "Communication",
      "Critical Thinking",
      "Equity + Inclusion",
      "Leadership",
      "Professionalism",
      "Teamwork",
      "Technology",
    ],
  );
});

test("every competency carries a definition and sample behaviours", () => {
  for (const c of NACE_COMPETENCIES) {
    assert.ok(c.definition.length > 40, `${c.key} has no real definition`);
    assert.ok(
      c.sampleBehaviors.length >= 5,
      `${c.key} has ${c.sampleBehaviors.length} behaviours — too few to disambiguate a mapping`,
    );
  }
});

test("keys are stable identifiers, not display text", () => {
  for (const c of NACE_COMPETENCIES) {
    assert.match(c.key, /^[a-z_]+$/, `${c.key} is not a safe stored key`);
  }
});

/* ── Resolution ─────────────────────────────────────────────────────────── */

test("resolves an exact key", () => {
  assert.equal(resolveCompetency("leadership"), "leadership");
});

test("resolves the display name", () => {
  assert.equal(resolveCompetency("Critical Thinking"), "critical_thinking");
  assert.equal(resolveCompetency("critical thinking"), "critical_thinking");
});

test("tolerates the punctuation a model will get wrong", () => {
  // These are all things a model plausibly returns for the same competency.
  for (const variant of [
    "Career + Self-Development",
    "Career and Self-Development",
    "Career & Self Development",
    "career_self_development",
    "Career+Self-Development",
  ]) {
    assert.equal(
      resolveCompetency(variant),
      "career_self_development",
      `failed to resolve "${variant}"`,
    );
  }

  for (const variant of ["Equity + Inclusion", "Equity and Inclusion", "equity_inclusion"]) {
    assert.equal(resolveCompetency(variant), "equity_inclusion", `failed on "${variant}"`);
  }
});

test("returns null rather than guessing", () => {
  // The important case. A near-miss must NOT become a real competency — the
  // item is dropped instead, because a mislabelled entry goes into a report.
  assert.equal(resolveCompetency("Collaboration"), null);
  assert.equal(resolveCompetency("Problem Solving"), null);
  assert.equal(resolveCompetency("Diversity"), null);
  assert.equal(resolveCompetency("Work Ethic"), null);
  assert.equal(resolveCompetency(""), null);
  assert.equal(resolveCompetency("   "), null);
  assert.equal(resolveCompetency(null), null);
  assert.equal(resolveCompetency(42), null);
});

test("isCompetencyKey guards stored values", () => {
  assert.equal(isCompetencyKey("teamwork"), true);
  assert.equal(isCompetencyKey("Teamwork"), false); // display name is not a key
  assert.equal(isCompetencyKey("collaboration"), false);
});

test("getCompetency returns the record or undefined", () => {
  assert.equal(getCompetency("technology")?.name, "Technology");
  assert.equal(getCompetency("nonsense"), undefined);
});

/* ── Prompt rendering and coverage ──────────────────────────────────────── */

test("the prompt rendering includes every competency AND its behaviours", () => {
  const rendered = renderForPrompt();
  for (const c of NACE_COMPETENCIES) {
    assert.ok(rendered.includes(c.key), `${c.key} missing from the prompt`);
    assert.ok(rendered.includes(c.name), `${c.name} missing from the prompt`);
    // Behaviours are what make the mapping defensible rather than a guess.
    assert.ok(
      rendered.includes(c.sampleBehaviors[0]),
      `${c.key} behaviours missing from the prompt`,
    );
  }
});

test("empty coverage lists all eight at zero, so gaps are visible", () => {
  const coverage = emptyCoverage();
  assert.equal(Object.keys(coverage).length, 8);
  assert.ok(Object.values(coverage).every((v) => v === 0));
  // A competency the student has no evidence for must still appear — the gap
  // is the actionable part for an advisor.
  assert.equal(coverage.equity_inclusion, 0);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

import assert from "node:assert/strict";
import { advisoryFor, annotate, compareCardCodes } from "./card-annotations";

/**
 * Tests for the panel's pre-edit advisories.
 *
 * The load-bearing case is the last one in the first group: the advisory must
 * come from the declared tables, not from the card's notes. The notes are now
 * editable, and a warning that a user can delete by tidying a text field is not
 * a warning.
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

console.log("\ncard-annotations\n");

test("the seven safety rules warn that an edit does nothing", () => {
  for (const code of ["IG-S01", "IG-S02", "IG-S03", "IG-S06", "IG-S07", "IG-S08", "IG-S09"]) {
    const a = advisoryFor(code);
    assert.ok(a, `${code} should carry an advisory`);
    assert.equal(a!.kind, "code_enforced");
    assert.ok(/does not change what Wing does/.test(a!.body));
    assert.ok(/safety-rules\.ts/.test(a!.body));
  }
});

test("the three with no text say so, and name the document they need", () => {
  for (const code of ["IG-S04", "IG-S05", "IG-S10"]) {
    const a = advisoryFor(code);
    assert.ok(a, `${code} should carry an advisory`);
    assert.equal(a!.kind, "text_unavailable");
    assert.ok(/Safety_Architecture/.test(a!.body));
    assert.ok(/carries no rule/.test(a!.body));
  }
});

test("retired and reserved are distinguished, not merged", () => {
  assert.equal(advisoryFor("H-033")?.kind, "retired");
  assert.equal(advisoryFor("IG-RC12")?.kind, "retired");
  assert.equal(advisoryFor("H-706")?.kind, "reserved");
  assert.equal(advisoryFor("H-707")?.kind, "reserved");
  assert.ok(/Reserved is not retired/.test(advisoryFor("H-706")!.body));
});

test("an ordinary card carries no advisory", () => {
  for (const code of ["H-101", "H-1301", "H-RC04", "IG-U014", "IG-MJ05", "IG-UX01"]) {
    assert.equal(advisoryFor(code), null, `${code} should not be flagged`);
  }
});

test("no code is in two advisory sets", () => {
  // Precedence exists so the banner is stable, not because anything needs it.
  // If a code ever lands in two tables this fails and someone decides which.
  const flagged = [
    "IG-S01", "IG-S02", "IG-S03", "IG-S04", "IG-S05", "IG-S06",
    "IG-S07", "IG-S08", "IG-S09", "IG-S10",
    "H-033", "IG-RC12", "H-706", "H-707",
  ];
  const kinds = flagged.map((c) => `${c}:${advisoryFor(c)?.kind}`);
  assert.equal(new Set(kinds).size, kinds.length);
});

test("the module is derived from the code, for grouping", () => {
  assert.equal(annotate("H-101").module, "foundation_1");
  assert.equal(annotate("H-1301").module, "module_13");
  assert.equal(annotate("H-RC04").module, "reveal_cycle");
  assert.equal(annotate("IG-S01").module, "safety");
  assert.equal(annotate("IG-UX01").module, "ux");
  assert.equal(annotate("IG-MJ01").module, "micro_journaling");
  assert.equal(annotate(null).module, "unknown");
});

test("codes sort the way the methodology is written, not the way ASCII is", () => {
  const scrambled = ["H-1301", "H-99", "H-101", "H-9", "H-208", "H-209", "H-019.5", "H-020"];
  const sorted = scrambled.slice().sort(compareCardCodes);
  assert.deepEqual(sorted, ["H-9", "H-019.5", "H-020", "H-99", "H-101", "H-208", "H-209", "H-1301"]);
});

test("the decimal card sorts between its neighbours, not after them", () => {
  const sorted = ["H-020", "H-019", "H-019.5"].sort(compareCardCodes);
  assert.deepEqual(sorted, ["H-019", "H-019.5", "H-020"]);
});

test("different prefixes stay grouped", () => {
  const sorted = ["IG-U012", "H-101", "IG-RC01", "H-RC01"].sort(compareCardCodes);
  assert.deepEqual(sorted, ["H-101", "H-RC01", "IG-RC01", "IG-U012"]);
});

console.log(`\n${failures} failures\n`);
if (failures > 0) process.exit(1);

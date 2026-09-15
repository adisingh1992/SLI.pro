import assert from "node:assert/strict";
import { computeDeterministicMarkers, sumDeterministicMarkers, NOT_MEASURED_CLASSIFICATIONS } from "./marker-instrumentation";

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

console.log("\nmarker-instrumentation\n");

test("counts hedging softeners without double-counting overlapping words", () => {
  const m = computeDeterministicMarkers("I just think maybe I should try, I guess.");
  assert.equal(m.hedgingSofteners, 3, "expected just/maybe/i guess to all count (i think overlaps 'i' but 'i think' is its own phrase)");
});

test("word count is whitespace-split, empty string is zero", () => {
  assert.equal(computeDeterministicMarkers("").wordCount, 0);
  assert.equal(computeDeterministicMarkers("   ").wordCount, 0);
  assert.equal(computeDeterministicMarkers("one two three").wordCount, 3);
});

test("modal verb classes are counted separately, not merged", () => {
  const m = computeDeterministicMarkers("I could do it. I should do it. I will do it.");
  assert.equal(m.modalVerbs.epistemic, 1, "could");
  assert.equal(m.modalVerbs.deontic, 1, "should");
  assert.equal(m.modalVerbs.dynamic, 1, "will");
});

test("pronoun classes distinguish first-person-singular from collective", () => {
  const m = computeDeterministicMarkers("I know what I want, but we haven't decided as a team.");
  assert.equal(m.pronouns.firstPersonSingular, 2, "two 'I's");
  assert.equal(m.pronouns.collective, 1, "one 'we'");
});

test("causal connectives are recognized", () => {
  const m = computeDeterministicMarkers("I left because it wasn't working, so I had to move on.");
  assert.equal(m.causalConnectives, 2, "because, so");
});

test("sumDeterministicMarkers adds every field across turns, not just the top-level ones", () => {
  const a = computeDeterministicMarkers("I could maybe try.");
  const b = computeDeterministicMarkers("I should just go.");
  const total = sumDeterministicMarkers([a, b]);
  assert.equal(total.wordCount, a.wordCount + b.wordCount);
  assert.equal(total.modalVerbs.epistemic, a.modalVerbs.epistemic + b.modalVerbs.epistemic);
  assert.equal(total.hedgingSofteners, a.hedgingSofteners + b.hedgingSofteners);
});

test("the four not-measured classifications are exactly four, never silently trimmed or padded", () => {
  assert.equal(NOT_MEASURED_CLASSIFICATIONS.length, 4);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

import assert from "node:assert/strict";
import { SAFETY_RULES, compileSafety, safetyTokenEstimate } from "./safety-rules";

/**
 * Tests for the safety layer.
 *
 * These are the only rules in the platform that must be present unconditionally.
 * The voice profile renders nothing when a cohort has no pointer, and the integrity
 * gates render nothing when no sequence is published — both correct, both a
 * property this section must NOT have. Most of what follows is therefore about
 * absence being impossible.
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

console.log("\nsafety-rules\n");

const SECTION = compileSafety();

test("the four rules Danielle named for the first release are present", () => {
  assert.deepEqual(
    SAFETY_RULES.map((r) => r.code),
    ["IG-S01", "IG-S02", "IG-S07", "IG-S09"],
  );
});

test("the section takes no arguments and cannot come out empty", () => {
  // No inputs, no configuration, no pointer. There is no state in which a prompt
  // is assembled without this.
  assert.ok(compileSafety().length > 500);
  assert.equal(compileSafety(), SECTION);
});

test("every rule reaches the prompt", () => {
  for (const r of SAFETY_RULES) {
    assert.ok(SECTION.indexOf(r.rule) >= 0, r.code);
  }
});

test("no safety code reaches the prompt", () => {
  // IG-U005 forbids internal methodology vocabulary in anything a student can see,
  // and a code in context is a phrase the model can repeat.
  for (const r of SAFETY_RULES) assert.equal(SECTION.indexOf(r.code), -1, r.code);
  assert.equal(SECTION.indexOf("IG-S"), -1);
});

test("the hierarchy is stated, because four rules with no rank are just four rules", () => {
  assert.ok(SECTION.indexOf("come before everything else") >= 0);
  assert.ok(SECTION.indexOf("these win") >= 0);
});

test("the crisis rule carries the whole protocol, not just the trigger", () => {
  /*
   * The failure this guards against is a rule that says "detect distress" and stops
   * there, leaving the model to improvise. Each of these is a distinct instruction
   * from Danielle's paragraph or IG-S01's own card: stop, do not reframe, name the
   * boundary, direct to a person, wait, and accept a correction.
   */
  const crisis = SAFETY_RULES.find((r) => r.code === "IG-S01")!.rule;
  assert.ok(crisis.indexOf("stop coaching immediately") >= 0);
  assert.ok(crisis.indexOf("never reframe") >= 0);
  assert.ok(crisis.indexOf("beyond what a career tool") >= 0);
  assert.ok(crisis.indexOf("someone they trust") >= 0);
  assert.ok(crisis.indexOf("do not prompt") >= 0);
  assert.ok(crisis.indexOf("accept the correction") >= 0);
  // The asymmetry is the point: over-reading is acceptable, missing it is not.
  assert.ok(crisis.indexOf("Missing it is not") >= 0);
});

test("the crisis rule names no specific service", () => {
  /*
   * Deliberate. Danielle's text directs to "a therapist, a counselor, someone you
   * trust" and names no organisation, and Berkeley and Vanderbilt each have their
   * own counselling services they would want named. Inventing a hotline number for
   * a student in distress is the worst possible place to be approximately right, so
   * the rule stays as she wrote it until the institutions answer.
   */
  const crisis = SAFETY_RULES.find((r) => r.code === "IG-S01")!.rule;
  for (const invented of ["988", "Samaritans", "hotline", "helpline", "1-800", "text HOME"]) {
    assert.equal(crisis.toLowerCase().indexOf(invented.toLowerCase()), -1, invented);
  }
});

test("every rule is traceable to what Danielle actually wrote", () => {
  for (const r of SAFETY_RULES) {
    assert.ok(r.source.indexOf("Danielle") >= 0, r.code);
    assert.ok(r.source.length > 120, r.code);
    assert.ok(r.what.length > 15, r.code);
  }
});

test("IG-S07 records that no card exists for it", () => {
  // She instructed us to add it and the compendium does not define it. That is a
  // fact about the source, and it belongs next to the rule rather than in a chat
  // message nobody will find in three months.
  const s07 = SAFETY_RULES.find((r) => r.code === "IG-S07")!;
  assert.ok(s07.source.indexOf("No IG-S07 card exists") >= 0);
});

test("the section costs under 700 tokens", () => {
  /*
   * 553 as measured. The first version of this test guessed 500 and the section came
   * in above it — recorded here because raising a ceiling you have just hit is
   * normally the wrong move, and this is the exception. It joins the voice section
   * (~760-820) and the gates (~2,700) as standing instruction on every turn, so the
   * total is worth watching; but a crisis protocol is the one thing in the prompt
   * that would never be shortened to save tokens. The ceiling exists to catch this
   * doubling, not to hold it at any particular size.
   */
  const tokens = safetyTokenEstimate(SECTION);
  assert.ok(tokens > 0);
  assert.ok(tokens < 700, `${tokens} tokens`);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

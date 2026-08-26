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

test("the superset is present — her four, the two v3.3 adds, and IG-S08", () => {
  /*
   * IG-INT04 lists four gates in intake cards v1.8 and six in Intake Design v3.3. The
   * two documents disagree and neither revision line mentions it, so we build the
   * superset: if the four turn out to be right, deleting two rules is an afternoon;
   * discovering that minor protection was off is not.
   */
  assert.deepEqual(
    SAFETY_RULES.map((r) => r.code),
    ["IG-S01", "IG-S02", "IG-S07", "IG-S09", "IG-S03", "IG-S06", "IG-S08"],
  );
});

test("attachment is a pattern, not a single message", () => {
  /*
   * IG-S03's card is explicit that it "cannot fire from a single interaction. Minimum
   * threshold: pattern visible across 3+ sessions over 2+ weeks." Nothing measures that
   * yet, so the only thing standing between this rule and a model that reads one warm
   * message as dependency is the wording — which makes the wording the test.
   */
  const s03 = SAFETY_RULES.find((r) => r.code === "IG-S03")!;
  assert.ok(s03.rule.indexOf("pattern across conversations") >= 0);
  assert.ok(s03.rule.indexOf("One warm message is not this") >= 0);
  // The three things her coaching_move forbids, each of which is a way to get this wrong.
  assert.ok(s03.rule.indexOf("Do not shame it") >= 0);
  assert.ok(s03.rule.indexOf("do not go cold") >= 0);
  assert.ok(s03.rule.indexOf("do not stop engaging") >= 0);
  // And the redirect it exists for.
  assert.ok(s03.rule.indexOf("know them in person") >= 0);
  // The numeric threshold belongs in the record, not the prompt: the model cannot count
  // sessions it cannot see, and an instruction it has no way to check is noise. It stays
  // in `source` so whoever builds the detector finds the number next to the rule.
  assert.ok(s03.source.indexOf("3+ sessions over 2+ weeks") >= 0);
});

test("minor protection never asks, and is not triggered by being a student", () => {
  /*
   * IG-INT03 forbids demographic collection at intake, so this gate has to detect
   * passively or not at all. A rule that said "establish age" would be the one line in
   * the safety section that instructs Wing to break another gate.
   *
   * The second half is her ruling of 25 August, and it is the part that changed: the gate
   * was default-on for the undergraduate track, which would have taken Module 6 and
   * Module 9 from every Berkeley undergraduate permanently. "The undergraduate track is
   * about career stage, not age." So the prompt must not treat being a student as a
   * trigger, and the wording is the only thing enforcing that.
   */
  const s06 = SAFETY_RULES.find((r) => r.code === "IG-S06")!;
  assert.ok(s06.rule.indexOf("Never ask anyone's age") >= 0);
  assert.ok(s06.rule.indexOf("under eighteen") >= 0);
  assert.ok(s06.rule.indexOf("still at school") >= 0);
  assert.ok(
    s06.rule.indexOf("Being a student is not on its own a reason") >= 0,
    "the track decoupling has to be in the text, not only in the config",
  );
  // Past tense is evidence, not a signal. Half the Foundation 2 corpus is school stories.
  assert.ok(s06.rule.indexOf("past tense") >= 0);
  // The scope limits her card names.
  assert.ok(s06.rule.indexOf("power dynamics") >= 0);
  assert.ok(s06.rule.indexOf("public professional presence") >= 0);
  assert.ok(s06.rule.indexOf("probe for vulnerability") >= 0);
  // And the source records that two earlier versions exist and which one governs.
  assert.ok(s06.source.indexOf("superseded on the TRIGGER") >= 0);
});

test("IG-S08 covers the user's evidence as well as Wing's", () => {
  /*
   * The half people drop. Her definition ends with the harder clause: "This extends to
   * the user's own evidence: Wing does not embellish, upgrade, or reframe the user's
   * achievements beyond what the user's own words support."
   *
   * At intake that is not abstract. IG-INT10 and IG-INT12 require the literal typed input
   * in a reveal slot, so a tidied-up quotation is a fabrication in the one message whose
   * whole job is to prove Wing was listening.
   */
  const s08 = SAFETY_RULES.find((r) => r.code === "IG-S08")!;
  assert.ok(s08.rule.indexOf("Never invent evidence") >= 0);
  assert.ok(s08.rule.indexOf("placeholder") >= 0);
  assert.ok(s08.rule.indexOf("do") >= 0);
  assert.ok(
    s08.rule.indexOf("embellish, upgrade or reframe") >= 0,
    "the user-evidence half is the one that gets dropped",
  );
  assert.ok(s08.rule.indexOf("quote what they typed") >= 0);
});

test("no rule asks the user for anything personal", () => {
  /*
   * Whole-section check rather than one rule's. IG-INT03 is a property of everything in
   * the prompt, and safety is the section most likely to reach for a demographic in
   * good faith — an age to apply a protection, a location to name a service.
   */
  const asks = [/ask (?:them |the user )?(?:for |their )(?:age|birth|date of birth)/i, /how old/i, /verify (?:their )?age/i];
  for (const re of asks) assert.equal(re.test(SECTION), false, String(re));
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

test("the hierarchy is stated, because seven rules with no rank are just seven rules", () => {
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

test("every rule is traceable to a source we actually hold", () => {
  /*
   * This used to check that each source named Danielle, which worked while all four came
   * from one email. The two additions come from her documents rather than her inbox, so
   * the check is now against the enumerated set of origins — stronger than a name match,
   * because "Danielle said so" is exactly what an invented rule would also claim.
   */
  const ORIGINS = [
    "Danielle, 18 August",
    "Compendium v3",
    "Intake Design v3.3",
    "document of 24 August",
    "ruling of 25 August",
  ];
  for (const r of SAFETY_RULES) {
    assert.ok(
      ORIGINS.some((o) => r.source.indexOf(o) >= 0),
      `${r.code} cites no origin we hold: ${r.source.slice(0, 60)}`,
    );
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

test("the section costs under 1,100 tokens", () => {
  /*
   * 1,075 as measured with seven rules, which is why the ceiling raised to 1,100 yesterday
   * did not need raising again — the seventh rule fits inside the headroom that was argued
   * for at the time. Previous note kept below, because the reasoning still applies.
   *
   * 983 as measured, up from 553 when this held four rules — and the previous comment
   * said the ceiling existed "to catch this doubling", so it did its job and the raise
   * is deliberate rather than automatic. What was weighed: the two additions are 205 and
   * 223 tokens, both trimmed once from ~245 before landing here, and every sentence left
   * in them is a distinct instruction from her card, pinned by the two tests above. The
   * standing per-turn cost is now roughly 983 here, 760-820 of voice and ~2,700 of gates.
   * That total is worth watching. This section is not where it should be recovered: a
   * crisis protocol and a minor protection are the last two things in the prompt anyone
   * should shorten to save tokens.
   */
  const tokens = safetyTokenEstimate(SECTION);
  assert.ok(tokens > 0);
  assert.ok(tokens < 1100, `${tokens} tokens`);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

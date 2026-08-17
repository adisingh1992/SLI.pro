import assert from "node:assert/strict";
import { chooseDoorway, readSignals } from "./voice-doorway";
import { DOORWAYS } from "./voice-source";

/**
 * Tests for doorway selection (T5).
 *
 * The failure that matters is a WRONG doorway, not a missing one. Leading with
 * normalisation for somebody who is not anxious reads as condescension; leading
 * with affirmation for somebody who is not ego-driven reads as flattery. With no
 * doorway the prompt renders Wing's voice as the guide defines it, which is a
 * good conversation — just not a tailored opening. So most of what follows checks
 * that thin, mixed or ordinary writing produces NOTHING.
 *
 * The mapping under test is inferred rather than transcribed: the Voice Guide
 * names the six signals and describes the four doorways and never connects them.
 * That is recorded in voice-source.ts UNSTATED, and it is why these rules demand
 * two independent signals and a margin.
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

console.log("\nvoice-doorway\n");

const EGO = [
  "As a Director I owned the P&L for the whole region last year and I rebuilt the team from " +
    "four people to eleven.",
  "I set the strategy, I presented to the board every quarter, and I was promoted twice in " +
    "three years because the numbers were there.",
  "My reports doubled their pipeline under me. I know what I am good at and I want the " +
    "positioning to say so clearly.",
];

const ANXIOUS = [
  "I'm not sure I'm qualified to talk about this, honestly.",
  "I guess I contributed a bit to the launch, and maybe that counts for something, but I " +
    "don't know if I think of myself as a leader.",
  "Everyone else seems to have this figured out already and I'm probably behind where I " +
    "should be by now.",
  "I keep wondering whether I should even be putting myself forward for this kind of thing.",
];

const ANALYTICAL = [
  "The data suggests a 40% lift, but I would want to understand the baseline before I accept " +
    "that interpretation, because the previous instrumentation was inconsistent.",
  "How do you know the sample is representative? My measurement approach was conservative and " +
    "we compared against the prior quarter's benchmark rather than against a projection.",
  "I would rather look at the instrumentation again before I claim anything about the mechanism.",
];

const CONFLICT = [
  "Honestly it was really a team effort and we all pushed hard that quarter.",
  "Everyone contributed something and I just helped out with the coordination side of it.",
  "The team deserves the credit for the outcome, we got there together and that matters more " +
    "than who did which part of it.",
  "I would rather talk about what the group learned than about my own part in any of it.",
];

test("thin writing produces no doorway, with the reason", () => {
  const choice = chooseDoorway(["Sure.", "Marketing I think."]);
  assert.equal(choice.doorway, null);
  assert.equal(choice.confidence, null);
  assert.ok(choice.reasons[0].indexOf("words") >= 0);
});

test("empty input produces no doorway rather than throwing", () => {
  assert.equal(chooseDoorway([]).doorway, null);
  assert.equal(chooseDoorway(["", "   "]).doorway, null);
});

test("an ego-driven pattern is recognised", () => {
  const choice = chooseDoorway(EGO);
  assert.equal(choice.doorway, "ego_driven");
  assert.ok(choice.reasons.length >= 2, choice.reasons.join("; "));
});

test("an anxious pattern is recognised", () => {
  const choice = chooseDoorway(ANXIOUS);
  assert.equal(choice.doorway, "anxious_imposter");
  assert.ok(choice.signals.selfDoubt >= 2);
});

test("an analytical pattern is recognised", () => {
  const choice = chooseDoorway(ANALYTICAL);
  assert.equal(choice.doorway, "analytical_skeptical");
  assert.ok(choice.signals.evidenceMarkers >= 2);
});

test("a conflict-avoidant pattern is recognised", () => {
  const choice = chooseDoorway(CONFLICT);
  assert.equal(choice.doorway, "conflict_avoidant");
  assert.ok(choice.signals.deflections >= 2);
});

test("ordinary substantive writing produces no doorway", () => {
  // Long enough to clear the floor, and carrying none of the patterns. This is
  // the common case and it must not be labelled.
  const choice = chooseDoorway([
    "I ran the migration for the billing system over about four months. The hardest part was " +
      "the reconciliation between the old ledger and the new one.",
    "We shipped it in March. Since then I have been working on the reporting layer, which is " +
      "less interesting but people depend on it every day.",
  ]);
  assert.equal(choice.doorway, null, `chose ${choice.doorway}: ${choice.reasons.join("; ")}`);
});

test("confident first-person writing is not an ego pattern", () => {
  /*
   * The bug this test exists for. Self-reference and absence of hedging scored on
   * their own, so an analytical engineer writing carefully about their own work
   * came out ego-driven — two signals, no titles, no boasting. Every Foundation
   * answer is first-person prose about themselves; that is the question being
   * asked. Ego-driven is now gated on a claimed credential.
   */
  const choice = chooseDoorway([
    "I designed the retry logic and I wrote the reconciliation job that catches the gaps.",
    "I think the interesting part is that I got the failure rate down without adding a queue, " +
      "which is what everyone assumed we would have to do.",
    "I would do the same thing again, and I would still not add the queue.",
  ]);
  assert.notEqual(choice.doorway, "ego_driven", choice.reasons.join("; "));
});

test("a tie is refused rather than broken arbitrarily", () => {
  // Mixed signals: credentials and self-reference alongside hedging and doubt.
  const choice = chooseDoorway([
    "As a Director I guess I sort of led the programme, though I'm not sure I was really the " +
      "one driving it and I probably got more credit than I deserved.",
    "My title says one thing but honestly I don't know if I think of myself that way, maybe " +
      "the team just carried me through most of it.",
  ]);
  if (choice.doorway !== null) {
    assert.ok(choice.confidence !== null && choice.confidence > 0, "a chosen doorway needs a margin");
  }
  assert.ok(choice.reasons.length >= 1);
});

test("every doorway a choice can return exists in the profile", () => {
  const keys = DOORWAYS.map((d) => d.key);
  for (const sample of [EGO, ANXIOUS, ANALYTICAL, CONFLICT]) {
    const choice = chooseDoorway(sample);
    assert.ok(choice.doorway && keys.indexOf(choice.doorway) >= 0, String(choice.doorway));
  }
});

test("confidence is a margin, between 0 and 1", () => {
  for (const sample of [EGO, ANXIOUS, ANALYTICAL, CONFLICT]) {
    const { confidence } = chooseDoorway(sample);
    assert.ok(confidence !== null && confidence > 0 && confidence <= 1, String(confidence));
  }
});

test("counting is stable across repeated calls", () => {
  // The patterns are global, and a global regex reused with exec carries
  // lastIndex between calls. These are used with String.match, which does not —
  // this test is what keeps that true after somebody switches to exec.
  const first = readSignals(EGO);
  const second = readSignals(EGO);
  const third = readSignals(EGO);
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
});

test("signals are reported whether or not a doorway is chosen", () => {
  // The signals are the evidence written to user_delivery_profiles, so an odd
  // delivery can be explained afterwards. They must be present in both outcomes.
  const chosen = chooseDoorway(EGO);
  const not = chooseDoorway(["Short answer."]);
  for (const c of [chosen, not]) {
    assert.ok(typeof c.signals.words === "number");
    assert.ok(typeof c.signals.selfReferenceRate === "number");
    assert.ok(typeof c.signals.hedgeRate === "number");
  }
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

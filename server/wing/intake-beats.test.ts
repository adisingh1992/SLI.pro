import assert from "node:assert/strict";
import {
  BEATS,
  INSIGHT_MIN_EXCHANGES,
  applicableBeats,
  beatsInPhase,
  followUpFor,
  hasTension,
  insightReady,
  insightWindowClosed,
  isComplete,
  isDeliveryStyle,
  isSatisfied,
  nextBeat,
  phaseOf,
  progress,
  questionOf,
  satisfiedKeys,
} from "./intake-beats";

/**
 * Tests for the intake beat rules (Feature List A1).
 *
 * These are worth testing precisely because the expensive failure is silent.
 * A miscounted beat does not throw — it just means Wing asks a question it
 * already has the answer to, or skips one it needs. And the insight gate
 * firing early produces a fabricated observation in the first five minutes of
 * the student's relationship with Wing, which is the exact opposite of what
 * that moment is for.
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

console.log("\nintake-beats\n");

/* ── Beat set integrity ─────────────────────────────────────────────────── */

test("beat keys are unique", () => {
  const keys = BEATS.map((b) => b.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("every beat captures at least one field", () => {
  for (const b of BEATS) {
    assert.ok(b.captures.length > 0, `${b.key} captures nothing, so it can never be satisfied`);
  }
});

test("why_here is first — Q1 opens the intake", () => {
  /*
   * The old order opened on `situation` so that the population gate was set before
   * any later beat ran. Her order opens on Q1, because the first data point has to be
   * the user's unprompted language before one of our questions has shaped it.
   */
  assert.equal(BEATS[0].key, "why_here");
  assert.equal(BEATS[0].question, "Q1");
  assert.equal(BEATS[1].key, "situation");
  assert.equal(BEATS[1].question, "Q2");
});

test("every beat declares a phase and a question, and the phases run in order", () => {
  const phases = BEATS.map((b) => b.phase);
  for (const b of BEATS) {
    assert.ok(b.question, `${b.key} implements no question`);
    assert.ok(b.answer === "text" || b.answer === "scale_1_5", `${b.key} has no answer kind`);
  }
  // Never go backwards: Phase 1, then 2, then 3.5. Phase 3 is the reveal, not a beat.
  for (let i = 1; i < phases.length; i++) {
    assert.ok(phases[i] >= phases[i - 1], `phase order breaks at ${BEATS[i].key}`);
  }
  assert.deepEqual(
    beatsInPhase(1).map((b) => b.question),
    ["Q1", "Q2", "Q3", "Q4"],
  );
  assert.deepEqual(
    beatsInPhase(2).map((b) => b.question),
    ["Q5", "Q5.5", "Q6", "Q7"],
  );
  assert.deepEqual(
    beatsInPhase(3.5).map((b) => b.question),
    ["B1", "B2", "B3"],
  );
});

test("Q6 is required — a reveal cannot be grounded without it", () => {
  /*
   * Its predecessor `proud_of` was optional. The Q5/Q6 gap is where most reveal
   * templates fire and RT-06 must cross-reference Q5 against Q6, so an intake that
   * skips Q6 has to defer per IG-INT06 rather than reach for a reveal it cannot
   * ground. Making it required is what forces that path.
   */
  const q6 = BEATS.find((b) => b.question === "Q6")!;
  assert.equal(q6.key, "proud_of");
  assert.ok(q6.required);
  assert.ok(q6.insightMaterial);
});

test("the baselines are scales with banded follow-ups, and a 3 gets nothing", () => {
  const b1 = BEATS.find((b) => b.question === "B1")!;
  assert.equal(b1.answer, "scale_1_5");
  assert.equal(followUpFor(b1, 1)?.on, "low");
  assert.equal(followUpFor(b1, 2)?.on, "low");
  assert.equal(followUpFor(b1, 3), null, "a 3 must earn no follow-up");
  assert.equal(followUpFor(b1, 4)?.on, "high");
  assert.equal(followUpFor(b1, 5)?.on, "high");

  // B3 is free text with a category-triggered follow-up, so the scale bands do not apply.
  const b3 = BEATS.find((b) => b.question === "B3")!;
  assert.equal(b3.answer, "text");
  assert.equal(followUpFor(b3, 1), null);
  assert.equal(b3.followUps?.[0].on, "fear");
});

test("phaseOf and questionOf tolerate a retired beat key", () => {
  // Historical session state still names beats that no longer exist.
  assert.equal(phaseOf("what_you_do"), null);
  assert.equal(questionOf("industry"), null);
  assert.equal(questionOf("proud_of"), "Q6");
  assert.equal(phaseOf("positioning_clarity"), 3.5);
});

test("all insight material is gathered before the window closes", () => {
  // The spec puts the reveal at question 8-10. If a beat carrying insight
  // material sat after that, the material could not be there in time.
  const lastMaterialIndex = BEATS.reduce(
    (last, b, i) => (b.insightMaterial ? i : last),
    -1,
  );
  assert.ok(
    lastMaterialIndex < 9,
    `last insight-material beat is at index ${lastMaterialIndex}, too late for a question 8-10 reveal`,
  );
});

/* ── Satisfaction ───────────────────────────────────────────────────────── */

test("a beat needs only ONE of its fields", () => {
  const beat = BEATS.find((b) => b.key === "institution")!;
  // A student fills academic_programs; an independent user fills user_source. Neither
  // will ever fill both, so requiring all of them would stall the conversation.
  assert.equal(isSatisfied(beat, { academic_programs: ["MBA"] }), true);
  assert.equal(isSatisfied(beat, { user_source: "independent" }), true);
  assert.equal(isSatisfied(beat, {}), false);
});

test("empty strings and empty arrays do not satisfy", () => {
  const beat = BEATS.find((b) => b.key === "institution")!;
  assert.equal(isSatisfied(beat, { university_name: "" }), false);
  assert.equal(isSatisfied(beat, { university_name: "   " }), false);
  assert.equal(isSatisfied(beat, { academic_programs: [] }), false);
  assert.equal(isSatisfied(beat, { academic_programs: ["MBA"] }), true);
});

test("false and 0 DO satisfy — they are answers", () => {
  const beat = BEATS.find((b) => b.key === "visibility_now")!;
  assert.equal(isSatisfied(beat, { activity_level: 0 }), true);
  assert.equal(isSatisfied(beat, { activity_level: false }), true);
});

/* ── Sequencing ─────────────────────────────────────────────────────────── */

test("nextBeat returns the first unsatisfied beat", () => {
  assert.equal(nextBeat(null, {})!.key, "why_here");
  // Q1 answered, so the sequence steps to Q2 — and Q3 is skipped for a user whose
  // institutional context arrived earlier, which is her conditional-skip rule.
  assert.equal(nextBeat(null, { goals: "be more visible" })!.key, "situation");
  assert.equal(
    nextBeat(null, {
      goals: "be more visible",
      professional_status: "early_career",
      user_source: "independent",
    })!.key,
    "where_going",
  );
});

test("nextBeat is null once everything applicable is satisfied", () => {
  const captured: Record<string, unknown> = {};
  for (const b of applicableBeats("mid_career_or_senior")) captured[b.captures[0]] = "x";
  assert.equal(nextBeat("mid_career_or_senior", captured), null);
});

test("no beat is population-gated any more, and that is deliberate", () => {
  /*
   * The old set gated `where_studying` to students and `experience_length` to everyone
   * else. Every one of her nine questions is universal — all the audience variation
   * lives in delivery rather than in whether the question fires — so the gate has
   * nothing left to filter. `appliesTo` stays on the type because the mechanism is
   * sound and a later module may want it.
   */
  for (const b of BEATS) {
    assert.equal(b.appliesTo, undefined, `${b.key} is population-gated; her questions are universal`);
  }
  assert.equal(applicableBeats("undergraduate_or_recent_grad").length, BEATS.length);
  assert.equal(applicableBeats("mid_career_or_senior").length, BEATS.length);
});

test("unknown population keeps every beat available", () => {
  assert.equal(applicableBeats(null).length, BEATS.length);
});

test("the baselines are optional — a user may decline them", () => {
  /*
   * Her B1–B3 failure path is explicit: "If user still resists → skip and move to
   * document upload. Store baselines as 'declined'." Q1–Q7 have no such path — their
   * failure paths re-ask differently rather than skipping — so the required/optional
   * split now runs exactly along the phase boundary.
   */
  for (const b of BEATS) {
    if (b.phase === 3.5) assert.equal(b.required, false, `${b.question} must be declinable`);
    else assert.equal(b.required, true, `${b.question} has no skip path in the spec`);
  }
});

test("isComplete ignores optional beats", () => {
  const captured: Record<string, unknown> = {};
  for (const b of applicableBeats("early_career").filter((b) => b.required)) {
    captured[b.captures[0]] = "x";
  }
  assert.equal(isComplete("early_career", captured), true);
  // …but there is still an optional beat left to pursue.
  assert.ok(nextBeat("early_career", captured) !== null);
});

test("progress counts the whole set, because nothing is gated now", () => {
  /*
   * This test used to prove that a population filter shrank the denominator. No beat
   * is population-gated any more, so the applicable set IS the whole set — and that
   * is the assertion worth keeping: if a gate ever comes back, the denominator moves
   * and this fails, which is the moment to check it was intended.
   */
  const p = progress("early_career", { goals: "be more visible" });
  assert.equal(p.total, BEATS.length);
  assert.equal(p.satisfied, 1);
});

test("satisfiedKeys reports only applicable beats", () => {
  const keys = satisfiedKeys("undergraduate_or_recent_grad", {
    professional_status: "x",
    years_experience: "9", // belongs to a beat undergrads never see
  });
  assert.deepEqual(keys, ["situation"]);
});

test("pathway is no longer asked — track detection owes it as a derived field", () => {
  /*
   * ⚠ A LIVE DEPENDENCY, NOT A CLEAN DELETION.
   *
   * The old `pathway` beat asked outright whether the user was aiming at a job,
   * something of their own, or freelancing, and A2's founder/freelancer branch reads
   * the captured `pathway` field to choose its session language.
   *
   * Her spec has no such question — the three entrepreneur sub-tracks are inferred
   * from Q2 and Q4. So the FIELD still has consumers while the QUESTION is gone, and
   * audience-track detection has to populate it. Until it does, A2's branch has
   * nothing to switch on.
   */
  assert.equal(BEATS.find((b) => b.key === "pathway"), undefined);
  assert.ok(
    !BEATS.some((b) => b.captures.includes("pathway")),
    "no beat captures pathway any more — it must be derived from the audience track",
  );
});

/* ── The insight gate ───────────────────────────────────────────────────── */

/*
 * A goal set against how they describe themselves — the two sides her reveal
 * templates compare. Deliberately NOT the old goal-versus-fear pairing: `fears` and
 * `activity_level` are Phase 3.5 fields now, captured after the reveal has already
 * fired, so a fixture built on them tests a state that cannot occur.
 */
const goalAndSelfDescription = {
  professional_status: "early_career",
  goals: "be more visible in my industry",
  self_presentation_style: "title_led",
  notable_work: "I'm the one who rewrites the messy briefs so they make sense",
};

test("tension needs BOTH a want and something holding them back", () => {
  assert.equal(hasTension({ goals: "be more visible" }), false);
  assert.equal(hasTension({ fears: "worried about judgement" }), false);
  assert.equal(hasTension(goalAndSelfDescription), true);
});

test("insight does not fire before the minimum number of exchanges", () => {
  assert.equal(
    insightReady({
      exchanges: INSIGHT_MIN_EXCHANGES - 1,
      population: "early_career",
      captured: goalAndSelfDescription,
      alreadyDelivered: false,
    }),
    false,
  );
});

test("insight fires when exchanges, material and tension all line up", () => {
  assert.equal(
    insightReady({
      exchanges: INSIGHT_MIN_EXCHANGES,
      population: "early_career",
      captured: goalAndSelfDescription,
      alreadyDelivered: false,
    }),
    true,
  );
});

test("insight never fires twice", () => {
  assert.equal(
    insightReady({
      exchanges: 9,
      population: "early_career",
      captured: goalAndSelfDescription,
      alreadyDelivered: true,
    }),
    false,
  );
});

test("no tension, no insight — however many exchanges have passed", () => {
  // Someone who answers everything factually and reveals no conflict. Wing
  // carries on asking rather than inventing something to notice.
  const flat = {
    professional_status: "mid_career_or_senior",
    goals: "a promotion",
    career_focus: "operations",
    target_functions: ["Operations"],
  };
  assert.equal(
    insightReady({
      exchanges: 20,
      population: "mid_career_or_senior",
      captured: flat,
      alreadyDelivered: false,
    }),
    false,
  );
});

test("insight needs enough material beats, not just any two fields", () => {
  // Tension exists but only two insight-material beats are satisfied.
  const thin = { goals: "more visible", fears: "judgement" };
  assert.equal(
    insightReady({
      exchanges: 10,
      population: "early_career",
      captured: thin,
      alreadyDelivered: false,
    }),
    false,
  );
});

test("the window closes so Wing stops waiting for a tension that never comes", () => {
  assert.equal(insightWindowClosed(11), false);
  assert.equal(insightWindowClosed(12), true);
});

/* ── Delivery style ─────────────────────────────────────────────────────── */

test("delivery style guard rejects anything not in the guide", () => {
  assert.equal(isDeliveryStyle("normalising"), true);
  assert.equal(isDeliveryStyle("affirming"), true);
  assert.equal(isDeliveryStyle("friendly"), false);
  assert.equal(isDeliveryStyle(""), false);
  assert.equal(isDeliveryStyle(undefined), false);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

import assert from "node:assert/strict";
import {
  BEATS,
  applicableBeats,
  hasTension,
  insightReady,
  insightWindowClosed,
  isComplete,
  isDeliveryStyle,
  isSatisfied,
  nextBeat,
  progress,
  satisfiedKeys,
  INSIGHT_MIN_EXCHANGES,
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

test("situation is first — population gates every later beat", () => {
  assert.equal(BEATS[0].key, "situation");
  assert.ok(BEATS[0].captures.includes("professional_status"));
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
  const beat = BEATS.find((b) => b.key === "what_you_do")!;
  // A student fills major and never current_title; a professional the reverse.
  assert.equal(isSatisfied(beat, { major: "Mechanical Engineering" }), true);
  assert.equal(isSatisfied(beat, { current_title: "Ops Analyst" }), true);
  assert.equal(isSatisfied(beat, {}), false);
});

test("empty strings and empty arrays do not satisfy", () => {
  const beat = BEATS.find((b) => b.key === "what_you_do")!;
  assert.equal(isSatisfied(beat, { major: "" }), false);
  assert.equal(isSatisfied(beat, { major: "   " }), false);
  const industry = BEATS.find((b) => b.key === "industry")!;
  assert.equal(isSatisfied(industry, { target_industries: [] }), false);
  assert.equal(isSatisfied(industry, { target_industries: ["Health"] }), true);
});

test("false and 0 DO satisfy — they are answers", () => {
  const beat = BEATS.find((b) => b.key === "visibility_now")!;
  assert.equal(isSatisfied(beat, { activity_level: 0 }), true);
  assert.equal(isSatisfied(beat, { activity_level: false }), true);
});

/* ── Sequencing ─────────────────────────────────────────────────────────── */

test("nextBeat returns the first unsatisfied beat", () => {
  assert.equal(nextBeat(null, {})!.key, "situation");
  assert.equal(
    nextBeat("early_career", { professional_status: "early_career" })!.key,
    "what_you_do",
  );
});

test("nextBeat is null once everything applicable is satisfied", () => {
  const captured: Record<string, unknown> = {};
  for (const b of applicableBeats("mid_career_or_senior")) captured[b.captures[0]] = "x";
  assert.equal(nextBeat("mid_career_or_senior", captured), null);
});

test("population filters beats — undergrads are not asked about leadership level", () => {
  const ug = applicableBeats("undergraduate_or_recent_grad").map((b) => b.key);
  assert.ok(ug.includes("where_studying"));
  assert.ok(!ug.includes("experience_length"));

  const mid = applicableBeats("mid_career_or_senior").map((b) => b.key);
  assert.ok(mid.includes("experience_length"));
  assert.ok(!mid.includes("where_studying"));
});

test("unknown population keeps every beat available", () => {
  assert.equal(applicableBeats(null).length, BEATS.length);
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

test("progress counts against the applicable set, not all beats", () => {
  const p = progress("undergraduate_or_recent_grad", { professional_status: "x" });
  assert.equal(p.satisfied, 1);
  assert.equal(p.total, applicableBeats("undergraduate_or_recent_grad").length);
  assert.ok(p.total < BEATS.length);
});

test("satisfiedKeys reports only applicable beats", () => {
  const keys = satisfiedKeys("undergraduate_or_recent_grad", {
    professional_status: "x",
    years_experience: "9", // belongs to a beat undergrads never see
  });
  assert.deepEqual(keys, ["situation"]);
});

test("pathway is captured and required — A2's founder/freelancer branch", () => {
  const beat = BEATS.find((b) => b.key === "pathway");
  assert.ok(beat, "no pathway beat: the founder/freelancer branch has nothing to switch on");
  assert.ok(beat!.required, "pathway must be required — session language depends on it");
  assert.deepEqual(beat!.captures, ["pathway"]);
});

test("pathway does NOT count as insight material", () => {
  // It is a routing fact, not something to notice about someone. Counting it
  // would let the insight fire on three facts and no tension.
  const beat = BEATS.find((b) => b.key === "pathway")!;
  assert.notEqual(beat.insightMaterial, true);
});

/* ── The insight gate ───────────────────────────────────────────────────── */

const goalAndFear = {
  professional_status: "early_career",
  goals: "be more visible in my industry",
  activity_level: "almost never post",
  fears: "worried colleagues will think I'm showing off",
};

test("tension needs BOTH a want and something holding them back", () => {
  assert.equal(hasTension({ goals: "be more visible" }), false);
  assert.equal(hasTension({ fears: "worried about judgement" }), false);
  assert.equal(hasTension(goalAndFear), true);
});

test("insight does not fire before the minimum number of exchanges", () => {
  assert.equal(
    insightReady({
      exchanges: INSIGHT_MIN_EXCHANGES - 1,
      population: "early_career",
      captured: goalAndFear,
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
      captured: goalAndFear,
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
      captured: goalAndFear,
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

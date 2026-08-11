import assert from "node:assert/strict";
import {
  ENGAGEMENT_BAIT,
  FLAGGED_VOCABULARY,
  HEDGES,
  checkAuthenticity,
  renderStandardForPrompt,
} from "./authenticity";

/**
 * Tests for the 360Brew authenticity standard (Feature List A4).
 *
 * The checker exists because prompt instructions alone do not keep this
 * vocabulary out — so the checker itself has to be right. A false negative
 * means "delve" reaches a student's LinkedIn profile; a false positive means a
 * good post gets flagged and the student loses trust in the tool.
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

console.log("\nauthenticity\n");

/* ── The canonical bad post ─────────────────────────────────────────────── */

const GENERATED_SLOP = `I'm thrilled to announce that I've been on an incredible journey.
In today's fast-paced world, it is crucial to leverage cutting-edge solutions.
I am passionate about empowering teams to unlock their potential.
This role was a testament to the robust synergy we built together.
Thoughts?`;

const REAL_POST = `Six months ago our chart review took seven hours. It's under one now.
The fix wasn't clever. We stopped asking three people to check the same fields and let the system flag only the rows that disagreed.
Two of those people now spend that time on patient follow-up instead.
I'd been told this was a staffing problem for two years. It was a workflow problem.`;

test("catches the canonical generated post", () => {
  const r = checkAuthenticity(GENERATED_SLOP);
  assert.equal(r.passes, false, "generated slop should not pass");
  assert.ok(r.score < 40, `expected a low score, got ${r.score}`);

  const rules = new Set(r.findings.map((f) => f.rule));
  assert.ok(rules.has("vocabulary"), "should flag vocabulary");
  assert.ok(rules.has("engagement_bait"), "should flag 'Thoughts?'");
});

test("passes a real post written by a person", () => {
  const r = checkAuthenticity(REAL_POST);
  assert.equal(
    r.passes,
    true,
    `a genuine post should pass — score ${r.score}, findings: ${r.findings
      .map((f) => `${f.rule}:${f.found}`)
      .join(", ")}`,
  );
});

/* ── Individual rules ───────────────────────────────────────────────────── */

test("flags each vocabulary item it claims to", () => {
  // Every entry in the list must actually be detectable, or the list is
  // decoration.
  for (const { phrase } of FLAGGED_VOCABULARY) {
    const text = `We had a good quarter and decided to ${phrase} the thing properly.`;
    const r = checkAuthenticity(text);
    assert.ok(
      r.findings.some((f) => f.rule === "vocabulary"),
      `"${phrase}" is in the list but was not detected`,
    );
  }
});

test("word-boundary matched — does not fire inside longer words", () => {
  // "elevate" must not trigger on "elevator", or the checker becomes noise.
  const r = checkAuthenticity(
    "I fixed the elevator in our building on Tuesday and it saved 40 minutes a day.",
  );
  assert.ok(
    !r.findings.some((f) => f.rule === "vocabulary"),
    `false positive: ${r.findings.map((f) => f.found).join(", ")}`,
  );
});

test("catches inflected forms", () => {
  // "spearhead" should catch "spearheaded" — prefix matching is intentional.
  const r = checkAuthenticity("I spearheaded the migration across four teams in 2025.");
  assert.ok(r.findings.some((f) => f.found.toLowerCase().startsWith("spearhead")));
});

test("flags every engagement bait phrase", () => {
  for (const bait of ENGAGEMENT_BAIT) {
    const r = checkAuthenticity(`We shipped the thing on Tuesday. ${bait}`);
    assert.ok(
      r.findings.some((f) => f.rule === "engagement_bait"),
      `"${bait}" not detected`,
    );
  }
});

test("flags hedging", () => {
  for (const hedge of HEDGES) {
    const r = checkAuthenticity(`${hedge} the migration was the right call in 2025.`);
    assert.ok(r.findings.some((f) => f.rule === "hedging"), `"${hedge}" not detected`);
  }
});

test("flags monotonous sentence rhythm", () => {
  // Five sentences, all almost exactly the same length.
  const monotone = [
    "We changed the process last year here.",
    "The team adjusted their workflow this quarter.",
    "Results improved across the board somewhat.",
    "Everyone learned something useful from this.",
    "The project finished on time last month.",
  ].join(" ");
  const r = checkAuthenticity(monotone);
  assert.ok(
    r.findings.some((f) => f.rule === "monotony"),
    `variation was ${r.stats.lengthVariation}`,
  );
});

test("does not flag monotony on short content", () => {
  // Two sentences cannot meaningfully be monotonous, and flagging them would
  // annoy anyone writing a short post.
  const r = checkAuthenticity("Shipped it Tuesday. Took four months.");
  assert.ok(!r.findings.some((f) => f.rule === "monotony"));
});

test("flags abstraction — no numbers, names or dates", () => {
  const abstract =
    "I have learned that success comes from consistent effort and a willingness to grow. " +
    "The best teams are the ones that support each other and communicate well. " +
    "When people feel heard, they do better work and everyone benefits from that over time. " +
    "That is something worth remembering as you build your own approach to work.";
  const r = checkAuthenticity(abstract);
  assert.ok(
    r.findings.some((f) => f.rule === "abstraction"),
    `markers found: ${r.stats.concreteMarkers}`,
  );
});

test("counts numbers and proper nouns as specificity", () => {
  const r = checkAuthenticity(
    "At Stripe we cut onboarding from 14 days to 3. Priya rewrote the verification step.",
  );
  assert.ok(r.stats.concreteMarkers >= 3, `only ${r.stats.concreteMarkers} markers`);
  assert.ok(!r.findings.some((f) => f.rule === "abstraction"));
});

/* ── Scoring behaviour ──────────────────────────────────────────────────── */

test("score falls as findings accumulate", () => {
  const clean = checkAuthenticity(REAL_POST).score;
  const one = checkAuthenticity(`${REAL_POST} I'm passionate about this.`).score;
  assert.ok(one < clean, "a flagged phrase should lower the score");
});

test("score never goes below zero", () => {
  const awful = FLAGGED_VOCABULARY.map((f) => f.phrase).join(" ") + " Thoughts? Agree?";
  const r = checkAuthenticity(awful);
  assert.ok(r.score >= 0);
  assert.equal(r.passes, false);
});

test("empty text does not throw", () => {
  const r = checkAuthenticity("");
  assert.equal(r.stats.words, 0);
  assert.equal(r.stats.sentences, 0);
});

test("every finding names the exact text, so it can be found and fixed", () => {
  const r = checkAuthenticity(GENERATED_SLOP);
  for (const f of r.findings) {
    assert.ok(f.found.length > 0, `${f.rule} finding has no 'found' text`);
    assert.ok(f.note.length > 0, `${f.rule} finding has no explanation`);
  }
});

/* ── The prompt rendering ───────────────────────────────────────────────── */

test("the prompt lists every banned word", () => {
  const rendered = renderStandardForPrompt();
  for (const { phrase } of FLAGGED_VOCABULARY) {
    assert.ok(rendered.includes(phrase), `"${phrase}" missing from the prompt`);
  }
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

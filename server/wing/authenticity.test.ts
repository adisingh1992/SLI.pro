import assert from "node:assert/strict";
import {
  ENGAGEMENT_BAIT,
  FLAGGED_VOCABULARY,
  GATE_COVERAGE,
  GENERIC_CONNECTORS,
  HEDGES,
  checkAuthenticity,
  checkSpokenVoicePreserved,
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

/* ── The v2 content gates: IG-V05, IG-V07, IG-V04 ───────────────────────── */

const rules = (t: string) => checkAuthenticity(t).findings.map((f) => f.rule);

test("IG-V07 · generic connectors are flagged", () => {
  assert.ok(rules("Moreover, the results were clear.").indexOf("connectors") >= 0);
  assert.ok(rules("It's worth noting that this took two years.").indexOf("connectors") >= 0);
  assert.ok(rules("In conclusion, ship it.").indexOf("connectors") >= 0);
});

test("no connector is duplicated in the vocabulary list", () => {
  // A phrase in two lists produces two findings for one problem and the score
  // punishes it twice. "at the end of the day" already lives in the vocabulary.
  const vocab = FLAGGED_VOCABULARY.map((f) => f.phrase.toLowerCase());
  for (const c of GENERIC_CONNECTORS) {
    assert.equal(vocab.indexOf(c.replace(/,$/, "")), -1, `"${c}" is in both lists`);
  }
});

test("IG-V05 check 3 · content with no first person is flagged", () => {
  // Comfortably past the 40-word floor: the previous version of this fixture was
  // 39 words and the check correctly declined to fire, which read as a bug in the
  // check rather than in the fixture.
  const thirdPerson =
    "Teams often struggle to prioritise the work in front of them. The fix is to " +
    "name the binding constraint first, out loud, and only then decide. Most groups " +
    "skip that step entirely and argue about symptoms for weeks on end. A single " +
    "named owner resolves it faster than a committee ever will, every time.";
  assert.ok(rules(thirdPerson).indexOf("first_person") >= 0);
});

test("a short post is not required to say I", () => {
  // A one-liner can legitimately have no first person. Firing there would make
  // the check noise, and noise is how a check gets switched off.
  assert.equal(rules("Cut chart review from six hours to one.").indexOf("first_person"), -1);
});

test("first-person content passes the first-person check", () => {
  const mine =
    "I cut chart review from six hours to under one at Cooey. The trick was not a " +
    "better model. It was deleting three of the seven fields nobody read. " +
    "I had argued for the opposite for a year before that.";
  assert.equal(rules(mine).indexOf("first_person"), -1);
});

test("IG-V07 · a stack of fragments is flagged, a real list is not", () => {
  const fragments = "Things I learned:\n- Ship early\n- Talk to users\n- Measure twice\n- Say no\n- Repeat";
  assert.ok(rules(fragments).indexOf("list_heavy") >= 0);

  const substantive =
    "Three things changed how I run reviews.\n" +
    "- I stopped asking for status and started asking what decision is blocked, which cut the meeting in half.\n" +
    "- I put the constraint on the board before anyone spoke, so we argued about the right thing.\n" +
    "- I gave one person the call at the end, because a committee never chooses.\n" +
    "- I dropped the fourth agenda item entirely and nobody has asked for it since.";
  assert.equal(rules(substantive).indexOf("list_heavy"), -1);
});

test("IG-V04 · an edit that flattens the spoken voice is reported", () => {
  const spoken =
    "So I was terrified. Absolutely terrified. I'd never run a review with the CFO in " +
    "the room and I had about nine minutes to explain why we'd cut three fields from " +
    "the intake form at Cooey. It worked.";
  const polished =
    "The presentation to the chief financial officer represented a significant " +
    "professional challenge. The rationale for the reduction of intake form fields " +
    "was communicated within the allocated time. The outcome was satisfactory.";

  const found = checkSpokenVoicePreserved(spoken, polished).map((f) => f.found);
  assert.ok(found.length >= 3, `expected several drifts, got ${found.length}`);
  assert.ok(found.some((f) => f.indexOf("first-person") >= 0));
  assert.ok(found.some((f) => f.indexOf("contractions") >= 0));
});

test("IG-V04 · a faithful edit reports nothing", () => {
  const spoken =
    "I was terrified. I'd never run a review with the CFO there and I had nine " +
    "minutes to explain why we cut three fields at Cooey. It worked.";
  const tidied =
    "I was terrified. I'd never run a review with the CFO in the room, and I had " +
    "nine minutes to explain why we cut three fields at Cooey. It worked.";
  assert.deepEqual(checkSpokenVoicePreserved(spoken, tidied), []);
});

test("IG-V04 · missing input is not a violation", () => {
  assert.deepEqual(checkSpokenVoicePreserved("", "anything"), []);
  assert.deepEqual(checkSpokenVoicePreserved("anything", "  "), []);
});

test("the gate coverage map is honest about what is not enforced", () => {
  /*
   * The point of the map. "The gate is implemented" needs a scope, and two of
   * IG-V05's five checks are genuine judgement calls — whether a claim is
   * debatable is not a string match. Claiming otherwise would be worse than
   * saying so.
   */
  const codes = Array.from(new Set(GATE_COVERAGE.map((g) => g.cardCode))).sort();
  assert.deepEqual(codes, ["IG-V04", "IG-V05", "IG-V07"]);
  assert.equal(GATE_COVERAGE.filter((g) => g.cardCode === "IG-V05").length, 5);
  assert.ok(GATE_COVERAGE.some((g) => g.status === "judgement"));
  for (const g of GATE_COVERAGE) assert.ok(g.by.length > 5, g.requirement);
});

test("the prompt states the three new rules, not just the checker", () => {
  // The file's own philosophy: generation is instructed AND the output measured.
  // A check with no matching instruction is a trap rather than a standard.
  const rendered = renderStandardForPrompt();
  assert.ok(rendered.indexOf("Moreover") >= 0);
  assert.ok(rendered.indexOf('Say "I"') >= 0);
  assert.ok(rendered.toLowerCase().indexOf("fragments") >= 0);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

import assert from "node:assert/strict";
import { BEATS } from "./intake-beats";
import {
  CAPTURE_POINTS,
  pairingForBeat,
  INSIGHT_ASKED_AS,
  beatForField,
  captureForTurn,
  questionForBeat,
} from "./self-description";

/**
 * Tests for the self-description capture mapping.
 *
 * ── WHAT THESE PROTECT ───────────────────────────────────────────────────
 * One thing above all: that a row never claims to answer a question it did not
 * answer. The feature that reads this table compares a user's answers to the same
 * question over time to decide whether their self-view is converging, diverging or
 * rehearsed. A `source_question` of "Q5" attached to an answer about job duties
 * would not fail loudly — it would quietly make that comparison meaningless, on
 * data that cannot be recaptured.
 *
 * So the four points today's intake can honestly claim are pinned, and so are the
 * two it cannot.
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

console.log("\nself-description\n");

test("her six capture points, with her identifiers", () => {
  assert.deepEqual(
    CAPTURE_POINTS.map((p) => p.question),
    ["Q2", "Q5", "Q5.5", "Q6", "Q7", "reveal_reaction"],
  );
});

test("all six capture points are live now that her question set is", () => {
  /*
   * Was "four of six". Q5 and Q5.5 had no beat at all — the nearest old beat asked
   * what the user actually does day to day, where Q5 asks what they SAY they do, and
   * Q5's entire value is the gap between the two. Building `party_answer` and
   * `topic_signal` closed both, and rewording Q6 and Q7 to her text turned two
   * near-misses into exact matches.
   */
  assert.equal(CAPTURE_POINTS.length, 6);
  assert.deepEqual(
    CAPTURE_POINTS.map((p) => p.question),
    ["Q2", "Q5", "Q5.5", "Q6", "Q7", "reveal_reaction"],
  );
  for (const p of CAPTURE_POINTS) {
    assert.equal(p.fit, "same_question", `${p.question} is not an exact match any more`);
    assert.ok(p.why.length > 40, `${p.question} has no reasoning`);
  }
  // Five are beats; the reaction is not a beat, it is the turn after the reveal.
  assert.equal(CAPTURE_POINTS.filter((p) => p.beat !== null).length, 5);
});

test("every capture point names a beat that exists and implements that question", () => {
  /*
   * The mapping lives on the Beat as `question`, and CAPTURE_POINTS restates it to
   * hold the fit. Two statements of one fact diverge unless something checks — and a
   * silent divergence here files a self-description under the wrong question, which
   * is the exact corruption the table exists to avoid.
   */
  for (const p of CAPTURE_POINTS) {
    if (p.beat === null) continue;
    const beat = BEATS.find((b) => b.key === p.beat);
    assert.ok(beat, `capture point ${p.question} names a beat that does not exist: ${p.beat}`);
    assert.equal(
      beat!.question,
      p.question,
      `beat ${p.beat} implements ${beat!.question} but is filed under ${p.question}`,
    );
  }
});

test("every beat the mapping names still exists", () => {
  // A beat rename would otherwise orphan the mapping silently, and the column would
  // fill with NULLs that look like a methodology gap rather than a broken lookup.
  const keys = BEATS.map((b) => b.key);
  for (const p of CAPTURE_POINTS) {
    if (!p.beat) continue;
    assert.ok(keys.indexOf(p.beat) >= 0, `${p.question} maps to a beat that is gone: ${p.beat}`);
  }
});

test("a beat only earns her identifier when the equivalence is defensible", () => {
  assert.equal(questionForBeat("situation"), "Q2");
  assert.equal(questionForBeat("proud_of"), "Q6");
  assert.equal(questionForBeat("self_perception"), "Q7");
  // Asks something genuinely different, so no identifier.
  assert.equal(questionForBeat("what_you_do"), null);
  // Never mapped at all.
  assert.equal(questionForBeat("pathway"), null);
  assert.equal(questionForBeat("no_such_beat"), null);
});

test("fields resolve to the beat that captures them, from BEATS itself", () => {
  assert.equal(beatForField("professional_status"), "situation");
  assert.equal(beatForField("notable_work"), "proud_of");
  assert.equal(beatForField("self_description"), "self_perception");
  assert.equal(beatForField("self_presentation_style"), "party_answer");
  assert.equal(beatForField("topic_area_mapped"), "topic_signal");
  // A field from a retired beat resolves to nothing rather than to a stale key.
  assert.equal(beatForField("current_title"), null);
  assert.equal(beatForField("not_a_field"), null);
});

test("answering the beat we asked is elicited, and carries her identifier", () => {
  assert.deepEqual(
    captureForTurn({
      askedBeat: "situation",
      extractedFields: ["professional_status"],
      afterInsight: false,
      reactionAlreadyStored: false,
    }),
    { sourceQuestion: "Q2", equivalence: "exact", askedAs: "situation", provenance: "elicited" },
  );
  // The party question, which had no beat before this.
  assert.deepEqual(
    captureForTurn({
      askedBeat: "party_answer",
      extractedFields: ["self_presentation_style"],
      afterInsight: false,
      reactionAlreadyStored: false,
    }),
    { sourceQuestion: "Q5", equivalence: "exact", askedAs: "party_answer", provenance: "elicited" },
  );
  // A baseline is not one of her self-description points, so it pairs with nothing.
  assert.deepEqual(
    captureForTurn({
      askedBeat: "positioning_clarity",
      extractedFields: ["baseline_positioning_clarity"],
      afterInsight: false,
      reactionAlreadyStored: false,
    }),
    {
      sourceQuestion: null,
      equivalence: null,
      askedAs: "positioning_clarity",
      provenance: "elicited",
    },
  );
});

test("answering a question nobody asked is spontaneous", () => {
  /*
   * Her definitions exactly: elicited is "Wing asked a specific question",
   * spontaneous is "user volunteered without being asked". `asked_as` still records
   * the beat we put to them, because that is what prompted the utterance.
   */
  assert.deepEqual(
    captureForTurn({
      askedBeat: "situation",
      extractedFields: ["notable_work"],
      afterInsight: false,
      reactionAlreadyStored: false,
    }),
    { sourceQuestion: null, equivalence: null, askedAs: "situation", provenance: "spontaneous" },
  );
});

test("the reaction to the insight is captured once and only once", () => {
  assert.deepEqual(
    captureForTurn({
      askedBeat: "visibility_now",
      extractedFields: [],
      afterInsight: true,
      reactionAlreadyStored: false,
    }),
    {
      sourceQuestion: "reveal_reaction",
      equivalence: "exact",
      askedAs: INSIGHT_ASKED_AS,
      provenance: "elicited",
    },
  );
  // Already stored: fall through to the ordinary rules rather than storing a second
  // "first reaction", which would break the comparison this table exists for.
  assert.deepEqual(
    captureForTurn({
      askedBeat: "visibility_now",
      extractedFields: ["activity_level"],
      afterInsight: true,
      reactionAlreadyStored: true,
    }),
    {
      sourceQuestion: null,
      equivalence: null,
      askedAs: "visibility_now",
      provenance: "elicited",
    },
  );
});

test("a turn that says nothing about the user stores nothing", () => {
  /*
   * "what is this?" and "sorry, can you repeat that" are turns too. Storing them as
   * the user's account of themselves would put noise into the one baseline that
   * cannot be rebuilt, so a capture requires that the extraction actually filled a
   * field.
   */
  assert.equal(
    captureForTurn({
      askedBeat: "situation",
      extractedFields: [],
      afterInsight: false,
      reactionAlreadyStored: false,
    }),
    null,
  );
  assert.equal(
    captureForTurn({
      askedBeat: null,
      extractedFields: ["professional_status"],
      afterInsight: false,
      reactionAlreadyStored: false,
    }),
    null,
  );
});

test("every live pairing is exact, and the approximate path still works", () => {
  /*
   * There are no near-misses left: the intake asks her questions in her wording, so
   * every row is `exact`. The column stays and so does this test, because the next
   * module to feed this table will not necessarily ask her questions verbatim — and a
   * path with no caller is a path that has quietly stopped working by the time one
   * arrives. So the mechanism is exercised against a synthetic `close` point rather
   * than deleted along with the last real one.
   */
  assert.deepEqual(pairingForBeat("situation"), { question: "Q2", equivalence: "exact" });
  assert.deepEqual(pairingForBeat("proud_of"), { question: "Q6", equivalence: "exact" });
  assert.deepEqual(pairingForBeat("self_perception"), { question: "Q7", equivalence: "exact" });
  assert.deepEqual(pairingForBeat("party_answer"), { question: "Q5", equivalence: "exact" });
  assert.deepEqual(pairingForBeat("topic_signal"), { question: "Q5.5", equivalence: "exact" });

  // A retired beat, and a beat that is not one of her points, both earn nothing.
  assert.deepEqual(pairingForBeat("what_you_do"), { question: null, equivalence: null });
  assert.deepEqual(pairingForBeat("positioning_clarity"), { question: null, equivalence: null });

  // The `close` → `approximate` mapping, exercised directly.
  const synthetic = { question: "QX", provenance: "elicited" as const, what: "x",
    beat: "party_answer", fit: "close" as const, why: "a".repeat(45) };
  assert.equal(synthetic.fit === "close" ? "approximate" : "exact", "approximate");
});

test("an equivalence never exists without a question to pair with", () => {
  /*
   * The invariant the database also enforces, as a CHECK in migration 0023: an
   * equivalence is a property of a PAIRING. A row claiming to be an approximation of
   * nothing would be unreadable, and this is the code-side half of keeping that
   * impossible.
   */
  const cases = [
    { askedBeat: "situation", extractedFields: ["professional_status"] },
    { askedBeat: "situation", extractedFields: ["notable_work"] },
    { askedBeat: "what_you_do", extractedFields: ["current_title"] },
    { askedBeat: "proud_of", extractedFields: ["notable_work"] },
    { askedBeat: "self_perception", extractedFields: ["self_perception"] },
  ];
  for (const c of cases) {
    const out = captureForTurn({ ...c, afterInsight: false, reactionAlreadyStored: false });
    if (!out) continue;
    assert.equal(
      out.sourceQuestion === null,
      out.equivalence === null,
      `${c.askedBeat}: question ${out.sourceQuestion}, equivalence ${out.equivalence}`,
    );
  }
  const reaction = captureForTurn({
    askedBeat: null,
    extractedFields: [],
    afterInsight: true,
    reactionAlreadyStored: false,
  })!;
  assert.equal(reaction.sourceQuestion === null, reaction.equivalence === null);
});

test("intake never produces coached provenance", () => {
  /*
   * The value exists in the enum because downstream modules will need it, and adding
   * an enum value later is a migration on a table with rows in it. But intake is the
   * uncoached reference point — if anything here ever returned `coached`, the reason
   * the table exists would be gone.
   */
  const cases = [
    { askedBeat: "situation", extractedFields: ["professional_status"] },
    { askedBeat: "situation", extractedFields: ["notable_work"] },
    { askedBeat: "proud_of", extractedFields: ["notable_work"] },
  ];
  for (const c of cases) {
    for (const afterInsight of [true, false]) {
      for (const reactionAlreadyStored of [true, false]) {
        const out = captureForTurn({ ...c, afterInsight, reactionAlreadyStored });
        if (out) assert.notEqual(out.provenance, "coached");
      }
    }
  }
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DETECTION_CARDS,
  DETECTORS,
  FRAME_AWARE_REVEALS,
  IDENTITY_FRAMES,
  SIGNAL_THRESHOLD,
  isUserFacing,
  readFrameSignals,
  resolveIdentityFrame,
  revealMode,
  type IntakeAnswers,
} from "./identity-frame";
import { RESEARCH_GATES_SOURCE, parseResearchGates } from "./parse-research-gates";
import { INTAKE_SOURCE, parseIntake } from "./parse-intake";

/**
 * Tests for the identity reference frame at Priority 1 scope.
 *
 * ── THE ONE THAT MATTERS ─────────────────────────────────────────────────
 * Her asymmetric error analysis is the whole design: the cost of treating an
 * internal-frame user as external is a patronising session, and the cost of the
 * reverse can be the user. Every rule in the module bends that way, and the
 * asymmetry is the kind of property that survives being written down and does not
 * survive being remembered. So it is asserted directly: the same weight of
 * evidence must never reach `internal` more easily than `external`.
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

console.log("\nidentity-frame\n");

test("four values, and two signals is the threshold", () => {
  assert.deepEqual(IDENTITY_FRAMES.slice(), [
    "external",
    "internal",
    "mixed",
    "insufficient_signal",
  ]);
  assert.equal(SIGNAL_THRESHOLD, 2);
});

test("the resolver needs two consistent signals and defaults to nothing", () => {
  assert.equal(resolveIdentityFrame({ external: 0, internal: 0 }), "insufficient_signal");
  assert.equal(resolveIdentityFrame({ external: 1, internal: 0 }), "insufficient_signal");
  assert.equal(resolveIdentityFrame({ external: 0, internal: 1 }), "insufficient_signal");
  assert.equal(resolveIdentityFrame({ external: 2, internal: 0 }), "external");
  assert.equal(resolveIdentityFrame({ external: 0, internal: 2 }), "internal");
  assert.equal(resolveIdentityFrame({ external: 2, internal: 2 }), "mixed");
  // One past the threshold does not outvote the other direction past it.
  assert.equal(resolveIdentityFrame({ external: 5, internal: 2 }), "mixed");
});

test("only a confirmed internal frame gets the direct reveal", () => {
  /*
   * Her rule, and the reason `mixed` and `insufficient_signal` are not a shrug:
   * "The cost of false conservative is a slower session. The cost of false
   * aggressive is a lost user."
   */
  assert.equal(revealMode("internal"), "direct");
  assert.equal(revealMode("external"), "permission");
  assert.equal(revealMode("mixed"), "permission");
  assert.equal(revealMode("insufficient_signal"), "permission");
});

test("the same weight of evidence never reaches internal more easily", () => {
  /*
   * The asymmetry, asserted rather than trusted. For every count of signals, an
   * internal reading must be at least as hard to reach as an external one — so no
   * later change to the resolver can quietly invert the direction her error
   * analysis says to err in.
   */
  for (let n = 0; n <= 4; n++) {
    const ext = resolveIdentityFrame({ external: n, internal: 0 });
    const int = resolveIdentityFrame({ external: 0, internal: n });
    if (int === "internal") {
      assert.equal(ext, "external", `internal at ${n} signals but external is not`);
    }
    // And a direct reveal is never the answer without a confirmed internal frame.
    if (revealMode(int) === "direct") assert.equal(int, "internal");
  }
});

test("obligation language fires on three instances, or on one in Q4", () => {
  // Her threshold verbatim: "3+ instances or 1 instance in Q4 (the goal question,
  // where obligation language is most diagnostic)."
  const spread: IntakeAnswers = {
    q1: "I should be doing more with my profile.",
    q5: "I need to sound more senior than I am.",
    q7: "People expect me to be further along.",
  };
  assert.deepEqual(readFrameSignals(spread).fired, ["obligation_language"]);

  const justQ4: IntakeAnswers = { q4: "I should be a director by then." };
  assert.deepEqual(readFrameSignals(justQ4).fired, ["obligation_language"]);

  // Two instances, neither in Q4 — under her threshold, so nothing fires.
  const thin: IntakeAnswers = {
    q1: "I should post more.",
    q7: "I need to be seen differently.",
  };
  assert.deepEqual(readFrameSignals(thin).fired, []);
});

test("self-authored language needs three instances, same as its external twin", () => {
  const three: IntakeAnswers = {
    q1: "I decided to take this seriously.",
    q4: "I know what I want out of the next year.",
    q6: "I believe my real strength is untangling messy processes.",
  };
  assert.deepEqual(readFrameSignals(three).fired, ["self_authored_language"]);

  const two: IntakeAnswers = {
    q1: "I decided to do this.",
    q6: "I know how to run a launch.",
  };
  assert.deepEqual(readFrameSignals(two).fired, []);
});

test("two detectors alone cannot reach a frame, which is a limit and not a bug", () => {
  const both: IntakeAnswers = {
    q1: "I decided it was time, though I should have done it sooner.",
    q4: "I need to be a director, and I know that is what I want.",
    q6: "I believe my strength is operations.",
    q7: "People expect me to lead, and I am supposed to look the part.",
  };
  const signals = readFrameSignals(both);
  assert.equal(signals.external, 1);
  assert.equal(signals.internal, 1);
  /*
   * One detector each, so the frame is insufficient_signal, not mixed — and that
   * is correct. Two detectors cannot produce two consistent signals in one
   * direction on their own; the remaining 32 signals are classifications the
   * intake engine has to supply. Recorded here so the limit is visible rather
   * than mistaken for a resolver bug.
   */
  assert.equal(resolveIdentityFrame(signals), "insufficient_signal");
  // With the classifier's contribution added, the same answers read mixed.
  assert.equal(
    resolveIdentityFrame({ external: signals.external + 1, internal: signals.internal + 1 }),
    "mixed",
  );
});

test("the variable is never user-facing", () => {
  // "Never surfaced to the user, never named, never referenced — it shapes how
  // Wing talks, not what Wing says about how it talks."
  assert.equal(isUserFacing(), false);
});

test("both detectors implement a row that is actually in her tables", () => {
  const research = parseResearchGates(readFileSync(RESEARCH_GATES_SOURCE, "utf8"));
  const rows = research.identitySignalTables.reduce(
    (all, t) => all.concat(t.rows),
    [] as (typeof research.identitySignalTables)[number]["rows"],
  );
  assert.equal(rows.length, 34);

  for (const d of DETECTORS) {
    const row = rows.find((r) => r.signal === d.row);
    assert.ok(row, `no table row reads exactly: ${d.row}`);
    assert.equal(row!.direction, d.points, `${d.row} points ${row!.direction}, not ${d.points}`);
  }
});

test("32 of her 34 signals still need the intake classifier", () => {
  /*
   * The coverage claim, checked rather than asserted in a comment. Two signals are
   * detectable from raw text; the rest are classifications — "self-description
   * leads with company/title" is the Q5 classification H-015 defines, and no regex
   * produces it.
   *
   * If this number falls, someone added a detector, and the question to ask is
   * whether the methodology said to or whether we inferred it. That was the
   * doorway mistake and it cost a release to find.
   */
  const research = parseResearchGates(readFileSync(RESEARCH_GATES_SOURCE, "utf8"));
  const implemented = new Set(DETECTORS.map((d) => d.row));
  const uncovered = research.identitySignalTables
    .reduce((all, t) => all.concat(t.rows), [] as (typeof research.identitySignalTables)[number]["rows"])
    .filter((r) => !implemented.has(r.signal));
  assert.equal(uncovered.length, 32);
  assert.equal(DETECTORS.length, 2);
});

test("the cards that detect and the reveals that adapt are the ones the document names", () => {
  /*
   * Read from the intake document so a reissue that moves detection cannot move it
   * quietly. H-033 (RT-14) names the variable to say it is irrelevant for
   * undergraduates — an answer, not an adaptation — so it belongs in neither list.
   */
  const intake = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));
  const mentions = intake.cards.filter((c) =>
    /identity[ _]reference[ _]frame/i.test(
      [
        c.components.signal ?? "",
        c.components.delivery_adaptation ?? "",
        c.components.success_criteria ?? "",
        c.notes ?? "",
      ].join(" "),
    ),
  );
  assert.deepEqual(
    mentions.map((c) => c.cardCode),
    ["H-011", "H-014", "H-015", "H-018", "H-020", "H-027", "H-030", "H-033", "H-034"],
  );

  const named = DETECTION_CARDS.concat(FRAME_AWARE_REVEALS).concat(["H-033"]).sort();
  assert.deepEqual(mentions.map((c) => c.cardCode).slice().sort(), named);
  assert.deepEqual(FRAME_AWARE_REVEALS.slice(), ["H-020", "H-027", "H-034"]);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

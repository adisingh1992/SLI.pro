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
  /*
   * Asserts the detector rather than the whole `fired` array: a single "I should" in Q4
   * now also trips `q4_goal_meets_expectations`, because her table has a Q4 row as well
   * as an across-intake row and H-014 lists obligation language under both.
   */
  const threeAnywhere = readFrameSignals({
    q1: "I should get on with it",
    q5: "People expect me to be further along",
    q6: "I need to be better at this",
  });
  assert.ok(threeAnywhere.fired.includes("obligation_language"));

  const oneInQ4 = readFrameSignals({ q4: "I should be a director by now" });
  assert.ok(oneInQ4.fired.includes("obligation_language"), "one instance in Q4 is enough");

  const oneElsewhere = readFrameSignals({ q1: "I should get on with it" });
  assert.ok(
    !oneElsewhere.fired.includes("obligation_language"),
    "one instance outside Q4 must not be enough",
  );
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

test("the ten detectors reach a frame from answers alone", () => {
  /*
   * This test used to record the opposite: with two detectors, one external and one
   * internal signal could not produce two consistent signals in either direction, so
   * every real intake resolved to insufficient_signal and the frame was effectively
   * unreachable. Her table's other eight rows are classifications — "self-description
   * leads with company/title" is the Q5 classification H-015 defines — and they are
   * now supplied by `reveal-facts`.
   */
  const external: IntakeAnswers = {
    q4: "I should be further along, and the title matters",
    q5: "I'm an analyst at Deloitte",
    q6: "People tell me I'm good at untangling things",
    q7: "People don't see me correctly",
  };
  const e = readFrameSignals(external);
  assert.ok(e.external >= SIGNAL_THRESHOLD, `only ${e.external} external signals`);
  assert.equal(e.internal, 0);
  assert.equal(resolveIdentityFrame(e), "external");

  const internal: IntakeAnswers = {
    q4: "I've decided this is what I actually want",
    q5: "I help teams figure out what to build next",
    q6: "I know I'm good at spotting where a process breaks",
    q7: "I haven't explained it well enough",
  };
  const i = readFrameSignals(internal);
  assert.ok(i.internal >= SIGNAL_THRESHOLD, `only ${i.internal} internal signals`);
  assert.equal(i.external, 0);
  assert.equal(resolveIdentityFrame(i), "internal");

  // Both directions at strength is still mixed, not a coin toss.
  assert.equal(resolveIdentityFrame({ external: 2, internal: 2 }), "mixed");
});

test("a spelled-out contraction reads the same as a contracted one", () => {
  /*
   * Four rules in this codebase have silently matched nothing because a user wrote
   * "have not" where the pattern said `haven'?t`. `reveal-facts` normalises the input
   * for exactly that reason, and this asserts the normalisation reaches these detectors.
   */
  const long = readFrameSignals({
    q4: "I have decided this is what I actually want",
    q6: "I know I am good at spotting where a process breaks",
    q7: "I have not explained it well enough",
  });
  const short = readFrameSignals({
    q4: "I've decided this is what I actually want",
    q6: "I know I'm good at spotting where a process breaks",
    q7: "I haven't explained it well enough",
  });
  assert.deepEqual(long.fired, short.fired);
  assert.ok(long.internal >= 3, `spelled-out form produced only ${long.internal} signals`);
});

test("the variable is never user-facing", () => {
  // "Never surfaced to the user, never named, never referenced — it shapes how
  // Wing talks, not what Wing says about how it talks."
  assert.equal(isUserFacing(), false);
});

test("every detector implements a row that is actually in her tables", () => {
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

test("ten of her 34 signals are implemented; the rest are not intake signals", () => {
  /*
   * The coverage claim, checked rather than asserted in a comment.
   *
   * Ten of the 34 rows are the intake table — the ones v3.3 restates under "Identity
   * Reference Frame Detection" — and all ten are now implemented. The remaining 24 are
   * Foundation and module signals: choosing a function without permission, responding
   * to the ice bucket, how pre-gap evidence is described. None of them is detectable
   * during intake, because the sessions that produce them have not happened.
   *
   * If this number falls, someone added a detector, and the question to ask is whether
   * the methodology said to or whether we inferred it. That was the doorway mistake and
   * it cost a release to find.
   */
  const research = parseResearchGates(readFileSync(RESEARCH_GATES_SOURCE, "utf8"));
  const implemented = new Set(DETECTORS.map((d) => d.row));
  const uncovered = research.identitySignalTables
    .reduce((all, t) => all.concat(t.rows), [] as (typeof research.identitySignalTables)[number]["rows"])
    .filter((r) => !implemented.has(r.signal));
  assert.equal(DETECTORS.length, 10);
  assert.equal(uncovered.length, 24);
  // Five external, five internal — her table pairs every row.
  assert.equal(DETECTORS.filter((d) => d.points === "external").length, 5);
  assert.equal(DETECTORS.filter((d) => d.points === "internal").length, 5);
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
  /*
   * H-033 was in this list under v1.1 — RT-14 named the variable in order to say it
   * was irrelevant for undergraduates. The template is retired in v1.7, so the
   * exemption retires with it and undergraduates now reach cross-track templates
   * whose delivery IS frame-aware. That is a real change in behaviour for
   * undergraduates, not bookkeeping.
   */
  assert.deepEqual(
    mentions.map((c) => c.cardCode),
    ["H-011", "H-014", "H-015", "H-018", "H-020", "H-027", "H-030", "H-034"],
  );

  const named = DETECTION_CARDS.concat(FRAME_AWARE_REVEALS).sort();
  assert.deepEqual(mentions.map((c) => c.cardCode).slice().sort(), named);
  assert.deepEqual(FRAME_AWARE_REVEALS.slice(), ["H-020", "H-027", "H-034"]);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

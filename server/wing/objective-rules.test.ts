/**
 * Objective rules — verification.
 *
 * Run: npx tsx server/wing/objective-rules.test.ts
 *
 * No database, no LLM. These functions decide what every student is actually
 * asked, and their failure mode is a plausible prompt rather than an error.
 */

import {
  nextObjective,
  openObjectives,
  progress,
  resolveForPopulation,
  resolveObjective,
  sharedContentRatio,
  validateObjectiveSet,
  type Objective,
  type ObjectiveContent,
} from "./objective-rules";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(
    `  ${pass ? "✓" : "✗"} ${label}` +
      (pass ? "" : `\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
  );
}

const content = (over: Partial<ObjectiveContent> = {}): ObjectiveContent => ({
  intent: "Do the thing.",
  entryCondition: "From the start.",
  evidenceRequired: "The thing was done.",
  interventions: ["card_a"],
  ...over,
});

const lockPrimary: Objective = {
  key: "lock_primary",
  purpose: "Commit the student to one primary function.",
  artifactContribution: ["primaryFunction"],
  content: {
    mid_career_or_senior: content({ evidenceRequired: "A mechanism an executive would fund." }),
    early_career: content({ evidenceRequired: "A mechanism they personally drove." }),
    undergraduate_or_recent_grad: content({
      evidenceRequired: "A mechanism from coursework or a project.",
      interventions: [],
    }),
  },
};

console.log("\nResolution gives each population its own content");
check(
  "mid-career gets its own bar",
  resolveObjective(lockPrimary, "mid_career_or_senior").evidenceRequired,
  "A mechanism an executive would fund.",
);
check(
  "undergraduate gets a different bar",
  resolveObjective(lockPrimary, "undergraduate_or_recent_grad").evidenceRequired,
  "A mechanism from coursework or a project.",
);
check(
  "★ key is shared, which is what makes measurement comparable",
  resolveObjective(lockPrimary, "early_career").key,
  resolveObjective(lockPrimary, "mid_career_or_senior").key,
);
check(
  "★ purpose is shared, so a rate comparison is of the same question",
  resolveObjective(lockPrimary, "early_career").purpose,
  lockPrimary.purpose,
);
check("applies is true when content exists", resolveObjective(lockPrimary, "early_career").applies, true);

console.log("\nNull content means the beat does not apply");
const shiftBeat: Objective = {
  key: "resolve_shift",
  purpose: "Establish whether the student's function has shifted.",
  artifactContribution: ["functionShifted"],
  content: {
    mid_career_or_senior: content(),
    early_career: content(),
    // No legacy function exists to be anchored to.
    undergraduate_or_recent_grad: null,
  },
};
const ugShift = resolveObjective(shiftBeat, "undergraduate_or_recent_grad");
check("applies is false", ugShift.applies, false);
check("but the beat is still present, so shapes stay comparable", ugShift.key, "resolve_shift");

console.log("\nSelection does not force sequence");
const set = [{ key: "a" }, { key: "b" }, { key: "c" }];
check("first unsatisfied", nextObjective(set, [])?.key, "a");
check(
  "★ answered out of order → later one skipped, not re-asked",
  nextObjective(set, ["a", "c"])?.key,
  "b",
);
check("all satisfied → null", nextObjective(set, ["a", "b", "c"]), null);

console.log("\nInapplicable objectives are skipped, not stalled on");
const withNA = [{ key: "a" }, { key: "shift", applies: false }, { key: "c" }];
check("★ skipped by selection", nextObjective(withNA, ["a"])?.key, "c");
check("★ excluded from open", openObjectives(withNA, []).map((o) => o.key), ["a", "c"]);
check("★ excluded from the progress denominator", progress(withNA, ["a", "c"]), 1);
check("null when only inapplicable remain", nextObjective(withNA, ["a", "c"]), null);
check("progress on empty set is 0, not NaN", progress([], []), 0);

console.log("\nValidation catches what would otherwise ship silently");
check("empty set rejected", validateObjectiveSet([]).length, 1);
check(
  "★ duplicate keys rejected — they would merge two objectives' measurements",
  validateObjectiveSet([lockPrimary, { ...lockPrimary }]).some((i) =>
    i.message.includes("Duplicate"),
  ),
  true,
);

const missingPop = {
  ...lockPrimary,
  key: "m",
  content: { mid_career_or_senior: content(), early_career: content() },
} as unknown as Objective;
check(
  "★ omitted population rejected — omission must not pass for 'does not apply'",
  validateObjectiveSet([missingPop]).some((i) => i.message.includes("missing")),
  true,
);

const noEvidence: Objective = {
  ...lockPrimary,
  key: "n",
  content: {
    ...lockPrimary.content,
    early_career: content({ evidenceRequired: "" }),
  },
};
check(
  "★ missing evidence rejected — the session would stall on it forever",
  validateObjectiveSet([noEvidence]).some((i) => i.message.includes("evidence is required")),
  true,
);

const nobody: Objective = {
  ...lockPrimary,
  key: "p",
  content: {
    mid_career_or_senior: null,
    early_career: null,
    undergraduate_or_recent_grad: null,
  },
};
check(
  "objective applying to nobody rejected",
  validateObjectiveSet([nobody]).some((i) => i.message.includes("no population")),
  true,
);

check("a well-formed set validates clean", validateObjectiveSet([lockPrimary, shiftBeat]).length, 0);

console.log("\nShared-content ratio — the number that falsified the overlay design");
check("differing content → 0 shared", sharedContentRatio([lockPrimary]), 0);
const universal: Objective = {
  key: "confirm",
  purpose: "Get explicit agreement before closing.",
  artifactContribution: ["reasoning"],
  content: {
    mid_career_or_senior: content(),
    early_career: content(),
    undergraduate_or_recent_grad: content(),
  },
};
check("identical content → 1 shared", sharedContentRatio([universal]), 1);
check("mixed set reports the fraction", sharedContentRatio([lockPrimary, universal]), 0.5);

console.log("\nResolution covers the whole set");
check("resolves every objective", resolveForPopulation([lockPrimary, shiftBeat], "early_career").length, 2);

console.log(
  failures === 0 ? "\nAll objective rules verified.\n" : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);

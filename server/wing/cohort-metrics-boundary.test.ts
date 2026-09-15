import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * `claude/HARNESS_GAP_ANALYSIS_SEP15.md` §1b — cohort-metrics.ts (the B4
 * institutional dashboard + CSV export) went two build phases with zero
 * `is_test_user` filtering: flagged in STEP3, silently dropped after STEP5,
 * never fixed until this pass. `activatePersona` (harness-persona-store.ts)
 * has no restriction to a sandbox-only institution — a persona can be
 * activated against any real institution's school cycle — so without a
 * filter, a seeded persona would inflate that institution's own
 * board-reporting numbers and CSV export.
 *
 * The fix lives in one chokepoint, `studentFilter()`, shared by both
 * `cohortMetrics()` and the CSV export `studentRows()` — this file checks
 * that chokepoint by name so a future refactor that bypasses it (e.g. a new
 * query built directly against `students`/`users` rather than through
 * `studentFilter()`) is caught structurally, the same way it was silently
 * lost the first time.
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

console.log("\ncohort-metrics/boundary\n");

const HERE = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(HERE, "cohort-metrics.ts"), "utf8");

function stripComments(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const body = stripComments(text);

test("studentFilter excludes is_test_user unconditionally", () => {
  const start = body.indexOf("function studentFilter(");
  assert.ok(start >= 0, "expected a studentFilter function");
  const end = body.indexOf("\n}", start);
  const fnBody = body.slice(start, end === -1 ? undefined : end);
  assert.ok(
    /isTestUser/.test(fnBody),
    "studentFilter must reference users.isTestUser — claude/HARNESS_GAP_ANALYSIS_SEP15.md §1b",
  );
  // Must not be gated behind a MetricsFilter field — this is a baseline
  // invariant, not something an admin can opt out of by leaving a filter blank.
  const isTestUserLine = fnBody
    .split("\n")
    .find((l) => /isTestUser/.test(l)) ?? "";
  assert.ok(
    !/^\s*if\s*\(/.test(isTestUserLine),
    "the isTestUser exclusion must be unconditional, not behind an `if (f....)` guard",
  );
});

test("the is_test_user exclusion is a self-contained subquery, not eq(users.isTestUser, ...)", () => {
  // Real incident, not a hypothetical: the first version of this fix used
  // eq(users.isTestUser, false) against an outer-joined `users` row. Every
  // query in this file has `students` in its FROM/JOIN, but perStudent,
  // bySession, sli, and appts do NOT join `users` — they never needed its
  // columns before this filter existed. That version broke all four with
  // "missing FROM-clause entry for table users" the first time this ran
  // against a real database (2026-09-15), caught by neither tsc nor the
  // structural test above. A NOT EXISTS subquery against students.userId
  // needs nothing from the outer query, so it can never hit this failure
  // mode regardless of which query studentFilter() feeds.
  const start = body.indexOf("function studentFilter(");
  assert.ok(start >= 0, "expected a studentFilter function");
  const end = body.indexOf("\n}", start);
  const fnBody = body.slice(start, end === -1 ? undefined : end);
  assert.ok(
    /not exists/i.test(fnBody),
    "the is_test_user exclusion must be a NOT EXISTS subquery — a bare " +
      "eq(users.isTestUser, ...) requires every consumer of studentFilter() to " +
      "join users, which not all of them do",
  );
  assert.ok(
    !/eq\(users\.isTestUser/.test(fnBody),
    "must not regress to eq(users.isTestUser, ...) — see the incident note above",
  );
});

test("perStudent, bySession, sli, and appts — the four queries that don't join users — still don't need to", () => {
  // Confirms the fix doesn't get \"repaired\" the other way (adding a join to
  // users everywhere) without anyone updating this test's own premise.
  for (const fn of ["const perStudent = await db", "const bySession = await db", "const [sli] = await db", "const [appts] = await db"]) {
    const start = body.indexOf(fn);
    assert.ok(start >= 0, `expected to find ${fn}`);
    const end = body.indexOf(";\n", start);
    const block = body.slice(start, end === -1 ? start + 800 : end);
    assert.ok(
      !/\.(innerJoin|leftJoin)\(users,/.test(block),
      `${fn} joining users would mean the NOT EXISTS subquery fix is no longer ` +
        "the only thing making this query safe — update this test if that's intentional",
    );
  }
});

test("cohortMetrics() and studentRows() both build their WHERE from studentFilter()", () => {
  for (const fn of ["export async function cohortMetrics(", "export async function studentRows("]) {
    const start = body.indexOf(fn);
    assert.ok(start >= 0, `expected ${fn.trim()}`);
    const end = body.indexOf("\n}", start);
    const fnBody = body.slice(start, end === -1 ? undefined : end);
    assert.ok(
      /studentFilter\(f\)/.test(fnBody),
      `${fn.trim()} must derive its WHERE clause from studentFilter(f), the one place ` +
        "is_test_user exclusion is enforced — not build its own ad hoc filter",
    );
  }
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

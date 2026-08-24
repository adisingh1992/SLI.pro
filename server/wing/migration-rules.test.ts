/**
 * The migration rules, tested against the case that broke.
 *
 * Run:  npx tsx server/wing/migration-rules.test.ts
 *
 * ── WHY THIS SUITE EXISTS ────────────────────────────────────────────────
 * Three failures in a row came from not knowing whether a migration had run:
 *
 *   1. `wing:check-intake` read a column the database did not have.
 *   2. `db:migrate` failed on an enum the database did not have.
 *   3. `wing:check-migrations` then reported the applied migration as pending and
 *      offered to baseline it — which would have inserted a second row for a
 *      migration that had already run, under the hash of a version that never did.
 *
 * The third is the one that matters, because it is the check that was supposed to
 * catch the first two. It was wrong because it asked whether a file's hash was
 * recorded; drizzle asks whether the file's timestamp is newer than the newest
 * recorded one. Editing an applied migration changes the first answer and not the
 * second.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { replaySafe, willApply } from "./migration-rules";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

const MIGRATIONS = join(process.cwd(), "migrations");
const read = (tag: string) => readFileSync(join(MIGRATIONS, `${tag}.sql`), "utf8");

console.log("\nwillApply mirrors drizzle's rule and not the intuitive one");
{
  // The state that produced the wrong report: recorded through 0023, whose journal
  // `when` is 1787113200000, with 0024 at 1787199600000 sitting after it.
  const RECORDED_THROUGH_0023 = 1787113200000;
  const WHEN_0024 = 1787199600000;

  if (willApply(RECORDED_THROUGH_0023, RECORDED_THROUGH_0023)) {
    fail("0023 read as pending — the comparison is <, so an equal timestamp is skipped");
  }
  if (!willApply(RECORDED_THROUGH_0023, WHEN_0024)) {
    fail("0024 read as already applied — its `when` is newer than anything recorded");
  }
  if (!willApply(null, 1)) {
    fail("an empty tracking table must make everything pending");
  }
  if (willApply(WHEN_0024, RECORDED_THROUGH_0023)) {
    fail(
      "a journal entry older than the newest recorded migration must read as skipped — " +
        "drizzle compares one timestamp, so backdating a `when` hides a migration forever",
    );
  }
  if (!failures) ok("recorded-through-0023 makes 0024 pending and 0023 not, as drizzle does");
}

console.log("\nEditing an applied migration cannot make it pending");
{
  const before = failures;
  /*
   * The whole trap, stated as a test. A file is edited after it ran; its hash no
   * longer matches what was recorded. That changes nothing about whether the
   * migrator will open it, because the migrator never looks at the hash.
   */
  const APPLIED_AT = 1787113200000;
  const editedFile = "-- an edit that adds a column\nALTER TABLE x ADD COLUMN y text;\n";
  if (willApply(APPLIED_AT, APPLIED_AT)) {
    fail("an edited-but-applied migration must still read as skipped");
  }
  // And the edit's content is irrelevant to that answer, which is the point.
  if (replaySafe(editedFile).safe !== true) {
    fail("a bare ALTER is replay-safe by this rule; the verdict is about DDL guards only");
  }
  if (failures === before) ok("the hash is not part of the decision, so an edit is invisible");
}

console.log("\nreplaySafe counts DO-guarded statements as guarded");
{
  const before = failures;

  // The exact misreport: 0023 has five CREATEs — two TYPE, one TABLE, two INDEX —
  // guarded three by IF NOT EXISTS and two by duplicate_object. The old arithmetic
  // compared five against three and called it unsafe.
  const m23 = read("0023_self_descriptions");
  const v23 = replaySafe(m23);
  if (!v23.safe) fail(`0023 read as unsafe: ${v23.why}`);

  const naiveCreates = (m23.replace(/--.*$/gm, "").match(/\bcreate (table|type|index|unique)\b/gi) ?? [])
    .length;
  const naiveGuards = (m23.replace(/--.*$/gm, "").match(/if not exists/gi) ?? []).length;
  if (naiveCreates <= naiveGuards) {
    fail(
      "0023 no longer reproduces the arithmetic that misread it — if the file changed, " +
        "this assertion is stale rather than satisfied, and the regression is untested",
    );
  }

  const m24 = read("0024_self_description_equivalence");
  const v24 = replaySafe(m24);
  if (!v24.safe) fail(`0024 read as unsafe: ${v24.why}`);

  if (failures === before) {
    ok(
      `0023 safe (${naiveCreates} CREATEs vs ${naiveGuards} IF NOT EXISTS, the rest ` +
        "guarded by duplicate_object) and 0024 safe",
    );
  }
}

console.log("\nreplaySafe still refuses what is actually unsafe");
{
  const before = failures;

  const cases: Array<[string, string]> = [
    ["CREATE TABLE wing.t (id int);", "a bare CREATE TABLE"],
    ["CREATE TYPE wing.e AS ENUM ('a');", "a bare CREATE TYPE"],
    ['ALTER TABLE wing.t ADD CONSTRAINT "c" CHECK (id > 0);', "a bare ADD CONSTRAINT"],
    [
      "CREATE TABLE IF NOT EXISTS wing.t (id int);\nCREATE INDEX i ON wing.t (id);",
      "one guard covering two CREATEs",
    ],
  ];
  for (const [sql, what] of cases) {
    if (replaySafe(sql).safe) fail(`${what} was accepted as replay-safe`);
  }

  // Comments count for nothing, in either direction.
  if (!replaySafe("-- CREATE TABLE wing.t (id int);\nSELECT 1;").safe) {
    fail("a CREATE inside a comment was read as a statement");
  }
  if (replaySafe("-- if not exists\nCREATE TABLE wing.t (id int);").safe) {
    fail("an IF NOT EXISTS inside a comment was credited as a guard");
  }

  if (failures === before) ok(`${cases.length} unsafe shape(s) refused, comments ignored`);
}

console.log(
  failures ? `\n${failures} failure(s)\n` : "\nall passed\n",
);
process.exit(failures ? 1 : 0);

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * `is_test_user` must keep synthetic data out of what the methodology learns.
 *
 * ── WHY A STATIC TEST AND NOT A DATABASE ONE ─────────────────────────────
 * Nothing sets the flag true yet, so every runtime check passes trivially and
 * proves nothing — a database test here would be green on an empty premise and
 * stay green after somebody removed the guard. What can be checked today is
 * that the guards are present and that a NEW consumer of the corpus cannot be
 * added without one.
 *
 * That last property is the reason this file exists rather than a comment. The
 * flag was written into the schema, honoured on five admin screens, and
 * silently ignored by the two paths that decide what the methodology learns,
 * for months. `analysisEligible` had the identical history — respected in four
 * places, absent from `reveal-evidence.ts` until somebody grepped. Both are the
 * same failure: a rule that lives only in the heads of the people who
 * remembered it.
 *
 * ── WHAT IS DELIBERATELY *NOT* GUARDED ───────────────────────────────────
 * `evidence-portfolio.ts` builds one student's own portfolio from their own
 * turns and aggregates nothing across students, so a persona's portfolio cannot
 * reach anyone else's coaching. Guarding it would remove a feature the harness
 * may legitimately want to exercise, and buy nothing. It is named here so the
 * omission reads as a decision rather than an oversight.
 *
 * `reveal-evidence.ts` is pure and decides nothing about a student; its
 * persistence half, `prompt-log-store.ts`, has two production callers
 * (`engagement.ts`, `life-log-store.ts`) — the project doc dated 2 September
 * recorded one caller and that is now stale. Both callers guard, and the
 * assertion below fails on a third that does not.
 */

const WING = join(process.cwd(), "server", "wing");

const read = (name: string) => readFileSync(join(WING, name), "utf8");

/** Comments quote the names on purpose; the checks must not match prose. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function wingFiles(): { name: string; src: string }[] {
  return readdirSync(WING)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((name) => ({ name, src: code(read(name)) }));
}

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

console.log("\ntest-user scope\n");

/* ── The two entry points ─────────────────────────────────────────────────── */

test("scoreSession refuses a test account before it does any work", () => {
  const src = code(read("scoring.ts"));
  assert.match(src, /from "\.\/test-user"/, "scoring.ts must import the guard");

  const entry = src.slice(src.indexOf("export async function scoreSession"));
  assert.ok(entry, "scoreSession not found");

  const guardAt = entry.indexOf("isTestSession");
  assert.ok(guardAt > 0, "scoreSession must call isTestSession");

  /*
   * Order, not just presence. `setApplicationOutcome` stamps an outcome signal
   * on the application row, so a guard placed after it would leave persona
   * rows already written — the check has to be the first thing that touches
   * anything.
   */
  const firstWrite = Math.min(
    ...["setApplicationOutcome", "recomputeScore", "listApplicationsForSession"]
      .map((n) => entry.indexOf(n))
      .filter((i) => i > 0),
  );
  assert.ok(
    guardAt < firstWrite,
    "the test-account guard must come before any read or write in scoreSession",
  );
});

test("classifySession refuses a test account before its first query", () => {
  const src = code(read("classifier.ts"));
  assert.match(src, /from "\.\/test-user"/, "classifier.ts must import the guard");

  const entry = src.slice(src.indexOf("export async function classifySession"));
  const guardAt = entry.indexOf("isTestSession");
  assert.ok(guardAt > 0, "classifySession must call isTestSession");
  assert.ok(
    guardAt < entry.indexOf("db"),
    "the guard must come before the session lookup, so a skip costs one query",
  );
});

/* ── The one real scan ────────────────────────────────────────────────────── */

test("the backlog sweep filters test accounts in SQL, not in the loop", () => {
  /*
   * classifySession also refuses them, so a filter only there would leave every
   * persona session in the sweep's result set on every hourly run, forever.
   */
  const src = code(read("classify-backlog.ts"));
  assert.match(
    src,
    /eq\(\s*users\.isTestUser\s*,\s*false\s*\)/,
    "classify-backlog must exclude test accounts in its own query",
  );
  assert.match(src, /innerJoin\(\s*users\b/, "…which needs the users join");
});

/* ── The rule a future consumer cannot get round ─────────────────────────── */

test("every writer of user_heuristic_scores accounts for test accounts", () => {
  /*
   * This is the table whose stated purpose is deciding which methodology earns
   * promotion. Any new writer of it is by definition a corpus consumer, and
   * this fails on the day one appears without the guard.
   */
  const offenders = wingFiles()
    .filter(({ src }) => /\.\s*insert\(\s*userHeuristicScores|userHeuristicScores\s*\)\s*\.\s*set|update\(\s*userHeuristicScores/.test(src))
    .filter(({ src }) => !/isTestSession|isTestStudent|isTestUserId|isTestUser/.test(src))
    .map(({ name }) => name);

  assert.deepEqual(
    offenders,
    [],
    `these write user_heuristic_scores without any test-account check: ${offenders.join(", ")}`,
  );
});

test("every writer of pattern_detection_queue accounts for test accounts", () => {
  /*
   * The between-cohort pipeline is not built. This assertion is vacuous today
   * and that is its whole value: it fails the day somebody builds the thing
   * that mines the corpus for candidate cards, which is the single worst place
   * for 600 synthetic utterances to arrive unnoticed.
   */
  const offenders = wingFiles()
    .filter(({ src }) => /insert\(\s*patternDetectionQueue/.test(src))
    .filter(({ src }) => !/isTestSession|isTestStudent|isTestUserId|isTestUser/.test(src))
    .map(({ name }) => name);

  assert.deepEqual(
    offenders,
    [],
    `these write pattern_detection_queue without any test-account check: ${offenders.join(", ")}`,
  );
});

test("every feeder of the Reveal evidence pipeline guards test accounts", () => {
  /*
   * `prompt_log` is the Reveal Cycle's evidence, and IG-RC10's hard filter 0
   * turns on it: an absence claim "dies unless prompts in that signal category
   * were actually delivered". So a persona's rows would not merely sit in a
   * table — once the cycle is wired they would license or refuse a reveal about
   * a real student's silence.
   *
   * ── WHY THE GUARD IS AT THE CALLERS AND NOT IN prompt-log-store ──────────
   * It was written inside `logDelivery`/`logResponse` first, which is the
   * better shape in the abstract and wrong here: that module takes an INJECTED
   * db, and `prompt-log-store.test.ts` asserts the exact statements it emits
   * and that neither function throws on a broken db. An extra query inside it
   * shifts the statement order the test reads by index, and puts a throwing
   * call outside `logResponse`'s try — two existing tests fail. So the module
   * is untouched and its callers guard instead.
   *
   * That trades a can't-forget guarantee for a must-remember one, which is
   * exactly what this test is for: it fails on a new caller with no check.
   * A note on the project doc records that the guard belongs inside the module
   * if its test is ever reworked to match statements by content.
   */
  const feeders = wingFiles()
    .filter(({ name }) => name !== "prompt-log-store.ts")
    .filter(({ src }) => /logDelivery\(|logResponse\(/.test(src));

  assert.ok(
    feeders.length >= 2,
    "expected engagement.ts and life-log-store.ts to feed the prompt log",
  );

  const unguarded = feeders
    .filter(({ src }) => !/isTestSession|isTestStudent|isTestUserId|isTestUser/.test(src))
    .map(({ name }) => name);

  assert.deepEqual(
    unguarded,
    [],
    `these feed the Reveal evidence pipeline with no test-account check: ${unguarded.join(", ")}`,
  );

  // Named explicitly, so deleting a guard from one of them fails here even if
  // the file stops calling the logger by these names.
  for (const name of ["engagement.ts", "life-log-store.ts"]) {
    const f = wingFiles().find((x) => x.name === name);
    assert.ok(f, `${name} not found`);
    assert.match(f!.src, /isTestStudent\(/, `${name} must guard the prompt log`);
  }
});

/* ── The guard module itself ──────────────────────────────────────────────── */

test("the guard module only reads", () => {
  const src = code(read("test-user.ts"));
  assert.ok(
    !/\bdb\s*\.\s*(insert|update|delete)\s*\(/.test(src),
    "test-user.ts must not write",
  );
});

test("a missing user is not treated as a test user", () => {
  /*
   * `row?.isTestUser === true` rather than `!row || row.isTestUser`. A broken
   * foreign key answering `true` would switch analysis off for that student and
   * look exactly like the flag working correctly.
   */
  const src = code(read("test-user.ts"));
  const checks = src.match(/return\s+row\?\.isTestUser\s*===\s*true;/g) ?? [];
  assert.equal(
    checks.length,
    3,
    "each of the three guards must fail open to `not a test user`",
  );
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

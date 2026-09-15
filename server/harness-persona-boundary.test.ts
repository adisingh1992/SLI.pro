import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The boundary for the ONE part of the harness that is allowed to write.
 *
 * `harness-boundary.test.ts` (server/harness/) asserts the trace-reconstruction
 * module writes nothing at all. This surface is different on purpose —
 * Aditya asked for a UI Danielle can add personas from, and adding a persona
 * eventually means creating a real account — so the rule here is narrower,
 * not absent: an exact, closed list of tables, never anything else, and
 * never from the route file directly.
 *
 * The list is wider than it once was. Through step 7 this surface only ever
 * created data (`activatePersona`), so "four tables" was the whole story.
 * Step 9 added the exact mirror — Aditya: "I need a way to completely clean
 * a particular persona's data" — so `deletePersona` now also reaches every
 * table a seeded persona's sessions could have generated, to purge a test
 * account completely rather than refusing to touch it. Bigger list, same
 * rule: closed, named, and asserted here rather than discovered by a grep
 * later.
 *
 *   1. `harness-persona-routes.ts` never imports `./db`. Every write is
 *      forced through `harness-persona-store.ts`, so there is exactly one
 *      file where "what can this surface touch" is answerable by reading it.
 *   2. `harness-persona-store.ts` inserts, updates or deletes ONLY the
 *      tables in `ALLOWED` below — no live methodology, scoring or card
 *      definition table. If a future change needs one more table, this list
 *      is widened deliberately, with the table named in the diff.
 *   3. Every seeded account is `isTestUser: true` at the point it's created —
 *      the same contract `test-user-scope.test.ts` already covers for the
 *      CLI seeder, checked again here because this is a second writer of the
 *      same table.
 *   4. `deletePersona` refuses to cascade unless the account it's about to
 *      erase is `isTestUser` — checked again at delete time, not assumed
 *      from how the account was created, because this is the one place in
 *      the harness that deletes real rows instead of only ever adding them.
 *   5. Every mutating route is `isPlatformAdmin`, same as every other admin
 *      surface in this codebase that can change what a real student sees.
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

console.log("\nharness-persona/boundary\n");

const HERE = dirname(fileURLToPath(import.meta.url));
const routesText = readFileSync(join(HERE, "harness-persona-routes.ts"), "utf8");
const storeText = readFileSync(join(HERE, "wing", "harness-persona-store.ts"), "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const routesBody = stripComments(routesText);
const storeBody = stripComments(storeText);

test("the route file never imports ./db directly", () => {
  assert.ok(
    !/from\s+["']\.\/db["']/.test(routesBody),
    "every write must go through harness-persona-store.ts, not the route file",
  );
});

test("the route file registers only isPlatformAdmin-guarded handlers", () => {
  const handlers =
    routesBody.match(/app\s*\.\s*(get|post|put|patch|delete)\s*\([^;]*?\)/gs) ?? [];
  assert.ok(handlers.length > 0, "no route handlers found");
  const unguarded = handlers.filter((h) => !h.includes("isPlatformAdmin"));
  assert.deepEqual(unguarded.map((h) => h.slice(0, 60)), [], "every route needs isPlatformAdmin");
});

// Exactly the tables named in harness-persona-store.ts's own "WHAT THIS FILE
// IS ALLOWED TO WRITE" doc comment — activatePersona's three, plus every
// table deletePersona's purge can reach. Kept as a literal list, not derived
// from the schema, so widening it is always a deliberate, reviewed edit.
const ALLOWED = new Set([
  "harnessPersonas",
  "classifierPromptComponents",
  "users",
  "students",
  "intakeRecords",
  "sessions",
  "transcripts",
  "transcriptTurns",
  "sessionArtifacts",
  "turnObjectives",
  "userMemoryEmbeddings",
  "userHeuristicApplications",
  "userHeuristicScores",
  "gateAuditFindings",
  "messageEvents",
  "lifeLogEntries",
  "selfDescriptions",
  "sliRecords",
  "evidencePortfolioItems",
  "linkedinOptimizations",
  "contentDrafts",
  "contentActivityLog",
  "engagementSequenceStates",
  "radarSuggestions",
  "freshnessReports",
  "documents",
  "advisorAppointments",
  "userDeliveryProfiles",
  "legacyRecords",
  "passwordResets",
  "userChannelPreferences",
  "entitlements",
  "transactions",
  // Added 2026-09-15 — test_runs/test_run_sessions are P3 tables, added to
  // the schema after this list was first written, and deletePersona didn't
  // reach them until a persona that had actually been run was deleted for
  // the first time and hit "violates foreign key constraint
  // test_run_sessions_session_id_fk".
  "testRuns",
  "testRunSessions",
]);

test("the store writes only to the allowed tables", () => {
  const calls = storeBody.match(/\.(insert|update|delete)\s*\(\s*(\w+)\s*\)/g) ?? [];
  const targets = calls.map((c) => {
    const m = /\.(insert|update|delete)\s*\(\s*(\w+)\s*\)/.exec(c)!;
    return m[2];
  });
  assert.ok(targets.length > 0, "expected at least one insert/update/delete call to check");
  const offenders = targets.filter((t) => !ALLOWED.has(t));
  assert.deepEqual(
    offenders,
    [],
    `store must write only to ${[...ALLOWED].join(", ")}; found: ${offenders.join(", ")}`,
  );
});

test("no platform table outside the allowed list is ever a write target", () => {
  // A stronger, denylist-shaped version of the check above: even a write call
  // this test's regex fails to parse (a helper wrapping .insert, say) should
  // still be caught if it names one of these directly as an insert target.
  // Everything here is either a card/methodology definition table (never
  // instance data) or a table the purge deliberately leaves alone — see
  // patternDetectionQueue's own note in the store's doc comment.
  const FORBIDDEN = [
    "patternDetectionQueue",
    "heuristics",
    "heuristicComponents",
    "heuristicSequences",
    "heuristicSequenceEntries",
    "promptLog",
    "promptLibrary",
    "promptOpeners",
    "voiceProfiles",
    "voiceProfileComponents",
    "classifierPrompts",
    "schoolCycles",
    "institutions",
    "advisors",
  ];
  const offenders = FORBIDDEN.filter((t) =>
    new RegExp(`\\.(insert|update|delete)\\s*\\(\\s*${t}\\s*\\)`).test(storeBody),
  );
  assert.deepEqual(offenders, [], `must never write to: ${offenders.join(", ")}`);
});

test("every activated account is created as a test user", () => {
  assert.ok(
    /isTestUser:\s*true/.test(storeBody),
    "the account this surface creates must carry is_test_user = true",
  );
});

test("activation refuses re-seeding an already-seeded persona", () => {
  assert.ok(
    /already_seeded/.test(storeBody),
    "activatePersona must check existing.status === \"seeded\" before writing again",
  );
});

test("deletion refuses to purge an account that isn't a test user", () => {
  assert.ok(
    /not_test_user/.test(storeBody) && /isTestUser/.test(storeBody),
    "deletePersona must check the seeded account's isTestUser flag before cascading deletes",
  );
});

test("deletion nulls classifier_prompt_components.source_turn_id rather than deleting the row", () => {
  // A training example outlives the turn it was drawn from — this table's
  // FK into transcript_turns must be cleared, not the row removed, and it
  // must happen before transcript_turns are deleted underneath it.
  assert.ok(
    /\.update\s*\(\s*classifierPromptComponents\s*\)/.test(storeBody),
    "deletePersona must UPDATE classifierPromptComponents, not delete it",
  );
  assert.ok(
    !/\.delete\s*\(\s*classifierPromptComponents\s*\)/.test(storeBody),
    "classifierPromptComponents rows must never be deleted by this surface",
  );
  const nullOutIndex = storeBody.indexOf("classifierPromptComponents");
  const turnsDeleteIndex = storeBody.indexOf(".delete(transcriptTurns)");
  assert.ok(
    nullOutIndex !== -1 && turnsDeleteIndex !== -1 && nullOutIndex < turnsDeleteIndex,
    "sourceTurnId must be nulled out before transcriptTurns rows are deleted",
  );
});

test("deletion purges test_runs and test_run_sessions, in dependency order", () => {
  // Real incident, not hypothetical: test_runs/test_run_sessions are P3
  // tables (persona test-run driving), added to the schema after this
  // cascade was first written. deletePersona never reached them, and the
  // first time a persona that had actually been run was deleted, Postgres
  // refused with "update or delete on table sessions violates foreign key
  // constraint test_run_sessions_session_id_fk" (2026-09-15).
  assert.ok(
    /\.delete\s*\(\s*testRunSessions\s*\)/.test(storeBody),
    "deletePersona must delete testRunSessions — it references sessions.id " +
      "and blocks the sessions delete otherwise",
  );
  assert.ok(
    /\.delete\s*\(\s*testRuns\s*\)/.test(storeBody),
    "deletePersona must delete testRuns — it references harnessPersonas.id " +
      "and blocks the harnessPersonas delete otherwise",
  );
  const testRunSessionsIdx = storeBody.indexOf(".delete(testRunSessions)");
  const sessionsIdx = storeBody.indexOf(".delete(sessions)");
  assert.ok(
    testRunSessionsIdx !== -1 && sessionsIdx !== -1 && testRunSessionsIdx < sessionsIdx,
    "testRunSessions must be deleted before sessions",
  );
  // .delete(harnessPersonas) also appears in the two early-return branches
  // (a draft, or an already-gone seeded account) that run before the
  // transaction this test cares about — scope to inside the transaction so
  // those earlier, unrelated occurrences can't make this pass by accident.
  const txStart = storeBody.indexOf("db.transaction(async (tx)");
  assert.ok(txStart !== -1, "expected deletePersona's cascade transaction");
  const testRunsIdx = storeBody.indexOf(".delete(testRuns)", txStart);
  const harnessPersonasDeleteIdx = storeBody.indexOf(".delete(harnessPersonas)", txStart);
  assert.ok(
    testRunsIdx !== -1 &&
      harnessPersonasDeleteIdx !== -1 &&
      testRunsIdx < harnessPersonasDeleteIdx,
    "testRuns must be deleted before harnessPersonas",
  );
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

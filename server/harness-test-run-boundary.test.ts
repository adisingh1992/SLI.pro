import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The boundary for P3.2 (`initializeTestRun` / `POST
 * /api/test/sessions/initialize`) — same idea as the other harness boundary
 * tests, plus one property specific to this surface: it provisions a run,
 * it does not drive one. That line matters because the next piece (P3.1,
 * the turn loop) is real Azure OpenAI spend against a real deployment tier
 * — this test fails loudly if a future edit quietly starts calling the
 * orchestrator or writing turns from here instead of adding that as its own,
 * separately-reviewed piece.
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

console.log("\nharness-test-run/boundary\n");

const HERE = dirname(fileURLToPath(import.meta.url));
const routesText = readFileSync(join(HERE, "harness-test-run-routes.ts"), "utf8");
const storeText = readFileSync(join(HERE, "wing", "test-run-store.ts"), "utf8");

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
    "every write must go through test-run-store.ts, not the route file",
  );
});

test("the route file registers only isPlatformAdmin-guarded handlers", () => {
  const handlers =
    routesBody.match(/app\s*\.\s*(get|post|put|patch|delete)\s*\([^;]*?\)/gs) ?? [];
  assert.ok(handlers.length > 0, "no route handlers found");
  const unguarded = handlers.filter((h) => !h.includes("isPlatformAdmin"));
  assert.deepEqual(unguarded.map((h) => h.slice(0, 60)), [], "every route needs isPlatformAdmin");
});

test("the store writes only test_runs and test_run_sessions, both inserts", () => {
  const calls = storeBody.match(/\.(insert|update|delete)\s*\(\s*(\w+)\s*\)/g) ?? [];
  const targets = calls.map((c) => /\.(insert|update|delete)\s*\(\s*(\w+)\s*\)/.exec(c)![2]);
  assert.ok(targets.length > 0, "expected at least one insert/update/delete call to check");
  const ALLOWED = new Set(["testRuns", "testRunSessions"]);
  const offenders = targets.filter((t) => !ALLOWED.has(t));
  assert.deepEqual(offenders, [], `must write only to testRuns/testRunSessions; found: ${offenders.join(", ")}`);
  const nonInsert = calls.filter((c) => !/^\.insert/.test(c));
  assert.deepEqual(nonInsert, [], "this surface only ever creates a run — no update/delete belongs here yet");
});

test("this surface never calls the orchestrator or writes a turn — provisioning only", () => {
  assert.ok(
    !/orchestrator/.test(storeBody) && !/addAiTurn|addHumanTurn|recordAiTurn|recordHumanTurn/.test(storeBody),
    "P3.1 (the turn loop) is separate, unbuilt scope — this file must not drive turns",
  );
});

test("a run is created at status 'provisioned', never 'running'", () => {
  assert.ok(
    /status:\s*["']provisioned["']/.test(storeBody),
    "initializeTestRun must insert the run at status: \"provisioned\"",
  );
  assert.ok(
    !/status:\s*["']running["']/.test(storeBody),
    "this surface provisions a run; it must not itself mark one running",
  );
});

test("module_6_entry refuses with no_runnable_session rather than silently doing nothing", () => {
  assert.ok(
    /no_runnable_session/.test(storeBody),
    "initializeTestRun must handle nextFoundationSession returning null explicitly",
  );
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

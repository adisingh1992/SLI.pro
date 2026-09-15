import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The boundary for P3.1 (`test-run-engine.ts` — `claimTestRun` /
 * `runTestRunTurns`, the turn loop `test-run-store.ts` deliberately left
 * unbuilt). Same idea as the other harness boundary tests, plus the
 * properties specific to a surface that actually spends real Azure OpenAI
 * money and writes synthetic turns into the same tables real sessions use:
 *
 *   - Wing's own reply is always "flagship" — literally, not through a
 *     variable that a future edit could quietly wire up to the run's
 *     configurable (persona-only) tier.
 *   - every turn this file writes is `analysisEligible: false` with a
 *     stated reason — belt-and-suspenders alongside the account-level
 *     `is_test_user` check, which this file also re-verifies rather than
 *     trusting from provisioning time.
 *   - none of the streaming route's post-completion, real-student-only side
 *     effects (pattern classification, scoring, SLI generation, the
 *     completion email) are ever reachable from here.
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

console.log("\nharness-test-run-engine/boundary\n");

const HERE = dirname(fileURLToPath(import.meta.url));
const engineText = readFileSync(join(HERE, "wing", "test-run-engine.ts"), "utf8");
const routesText = readFileSync(join(HERE, "harness-test-run-routes.ts"), "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const engineBody = stripComments(engineText);
const routesBody = stripComments(routesText);

test("Wing's own reply is always tier: \"flagship\", literally", () => {
  assert.ok(
    /tier:\s*["']flagship["']/.test(engineBody),
    "Wing's reply must be generated at a literal flagship tier, same as the real streaming route",
  );
});

test("the persona's tier is a variable, never hardcoded to something other than the default", () => {
  const orchestratorCalls = engineBody.match(/orchestrator\.complete\(\{[\s\S]*?\}\)/g) ?? [];
  assert.ok(orchestratorCalls.length >= 2, "expected two orchestrator.complete calls (persona, Wing)");
  const personaCall = orchestratorCalls.find((c) => !/tier:\s*["']flagship["']/.test(c));
  assert.ok(personaCall, "no non-flagship orchestrator.complete call found for the persona side");
  assert.ok(
    /tier:\s*modelDeployment/.test(personaCall!),
    "the persona's completion call must pass the run's modelDeployment, not a literal tier",
  );
});

test("this file never reaches the real-student-only post-completion side effects", () => {
  const FORBIDDEN = [
    /classifier/i,
    /scoreSession/,
    /ensureSliGenerated/,
    /onSessionCompleted/,
  ];
  const offenders = FORBIDDEN.filter((re) => re.test(engineBody));
  assert.deepEqual(
    offenders.map(String),
    [],
    "a synthetic run must never trigger classification, scoring, SLI generation or the completion email",
  );
});

test("every synthetic turn is marked analysisEligible: false with a stated reason", () => {
  const occurrences = engineBody.match(/analysisEligible:\s*false/g) ?? [];
  assert.ok(occurrences.length >= 2, "expected both the persona turn and Wing's reply to be marked");
  assert.ok(
    /analysisExclusionReason:\s*SYNTHETIC_TURN_REASON/.test(engineBody),
    "the exclusion reason must be a named, stated constant — not left implicit",
  );
});

test("is_test_user is re-verified here, not just trusted from provisioning time", () => {
  assert.ok(
    /isTestUser/.test(engineBody),
    "claimTestRun must re-check is_test_user before any turn is driven",
  );
});

test("the run is claimed atomically — the update is conditioned on its own prior status", () => {
  assert.ok(
    /status,\s*["']provisioned["']/.test(engineBody) || /eq\(testRuns\.status,\s*["']provisioned["']\)/.test(engineBody),
    "the claiming update must be WHERE-guarded on status: provisioned, so a doubled request can't drive a run twice",
  );
});

test("the drive route answers before the turn loop runs, not after", () => {
  const at = routesBody.indexOf("void runTestRunTurns");
  assert.ok(at >= 0, "the route must call runTestRunTurns as a detached (void) task");
  const resAt = routesBody.lastIndexOf("res.status(202)", at);
  assert.ok(
    resAt >= 0 && resAt < at,
    "res.status(202)... must be written before runTestRunTurns is invoked, and the call must be detached (void), " +
      "not awaited — a full run is real model latency times the turn ceiling",
  );
  assert.ok(
    /void runTestRunTurns/.test(routesBody),
    "runTestRunTurns must be called as a detached (void) background task, never awaited by the route",
  );
});

test("modelDeployment from the request body is validated before use", () => {
  assert.ok(
    /isModelTier\(req\.body\.modelDeployment\)/.test(routesBody),
    "an unvalidated tier string must never reach claimTestRun",
  );
});

test("the loop checks the kill switch, the wall clock, and the token budget every turn", () => {
  assert.ok(
    /current\.status !== ["']running["']/.test(engineBody),
    "runTestRunTurns must re-read status from the database before each turn and stop if it's no longer running",
  );
  assert.ok(
    /Date\.now\(\) - runStartedAt > maxWallClockSeconds \* 1000/.test(engineBody),
    "the loop must check elapsed wall-clock time against maxWallClockSeconds every turn",
  );
  assert.ok(
    /tokensUsed >= tokenBudget/.test(engineBody),
    "the loop must check cumulative token usage against tokenBudget every turn",
  );
});

test("token usage is accumulated from both the persona's and Wing's completions", () => {
  const usageReads = engineBody.match(/tokensUsed \+= \([^;]*usage[^;]*;/g) ?? [];
  assert.equal(usageReads.length, 2, `expected exactly two tokensUsed accumulations (persona, Wing); found ${usageReads.length}`);
});

test("the kill switch (requestAbort) is atomic and can't un-finish a completed or already-aborted run", () => {
  assert.ok(
    /inArray\(testRuns\.status,\s*\[["']provisioned["'],\s*["']running["']\]\)/.test(engineBody),
    "requestAbort's update must be WHERE-guarded to provisioned/running only",
  );
});

test("a mid-loop exception still reports how many turns actually landed", () => {
  const declaredAt = engineBody.indexOf("let turnsRun = 0;");
  const tryAt = engineBody.indexOf("try {");
  assert.ok(declaredAt >= 0, "expected a `let turnsRun = 0;` declaration in runTestRunTurns");
  assert.ok(tryAt >= 0, "expected a try block in runTestRunTurns");
  assert.ok(
    declaredAt < tryAt,
    "turnsRun must be declared before the try block, not inside it, so the catch clause can still read it",
  );
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

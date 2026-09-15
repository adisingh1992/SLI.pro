import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The boundary for the checkpoint surface (`claude/TEST_HARNESS_PLAN_SEP9.md`,
 * P2) — the same idea as `harness-persona-boundary.test.ts`, shaped
 * differently because this surface writes nothing of its own: every mutation
 * goes through `server/wing/session-store.ts`'s existing, already-used
 * functions (`ensureSession`, `startSession`, `completeSession`,
 * `putArtifact`) rather than a raw `.insert`/`.update`/`.delete` here. That is
 * the property this file checks for by name, plus the two checks that guard
 * against the two ways this surface could otherwise do real damage: writing
 * fabricated completions onto an account that isn't a test account, and a
 * route that isn't admin-guarded.
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

console.log("\nharness-checkpoint/boundary\n");

const HERE = dirname(fileURLToPath(import.meta.url));
const routesText = readFileSync(join(HERE, "harness-checkpoint-routes.ts"), "utf8");
const storeText = readFileSync(join(HERE, "wing", "checkpoint-store.ts"), "utf8");

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
    "every write must go through checkpoint-store.ts, not the route file",
  );
});

test("the route file registers only isPlatformAdmin-guarded handlers", () => {
  const handlers =
    routesBody.match(/app\s*\.\s*(get|post|put|patch|delete)\s*\([^;]*?\)/gs) ?? [];
  assert.ok(handlers.length > 0, "no route handlers found");
  const unguarded = handlers.filter((h) => !h.includes("isPlatformAdmin"));
  assert.deepEqual(unguarded.map((h) => h.slice(0, 60)), [], "every route needs isPlatformAdmin");
});

test("applyCheckpoint itself never writes to a table directly — only through session-store's functions", () => {
  // Scoped to applyCheckpoint's own body, not the whole file — setAllowManualCheckpoints
  // (checked below) is a second, deliberately separate function with its own narrow
  // direct-write exception, and must not loosen this check for applyCheckpoint.
  const start = storeBody.indexOf("export async function applyCheckpoint(");
  assert.ok(start >= 0, "expected an applyCheckpoint export");
  const end = storeBody.indexOf("\nexport ", start + 1);
  const fnBody = storeBody.slice(start, end === -1 ? undefined : end);
  const rawWrites = fnBody.match(/\.(insert|update|delete)\s*\(\s*\w+\s*\)/g) ?? [];
  assert.deepEqual(
    rawWrites,
    [],
    `applyCheckpoint must not write directly; found: ${rawWrites.join(", ")} — route the ` +
      `change through ensureSession/startSession/completeSession/putArtifact instead`,
  );
  for (const fn of ["ensureSession", "startSession", "completeSession", "putArtifact"]) {
    assert.ok(fnBody.includes(fn), `expected applyCheckpoint to use session-store's ${fn}`);
  }
});

test("applyCheckpoint refuses an account that is neither is_test_user nor allow_manual_checkpoints", () => {
  assert.ok(
    /not_test_user/.test(storeBody) &&
      /isTestUser/.test(storeBody) &&
      /allowManualCheckpoints/.test(storeBody),
    "applyCheckpoint must check both the account's isTestUser and allowManualCheckpoints flags " +
      "before writing anything — claude/HARNESS_GAP_ANALYSIS_SEP15.md §1a",
  );
});

test("setAllowManualCheckpoints is the one narrowly-scoped direct write, touching only users", () => {
  const start = storeBody.indexOf("export async function setAllowManualCheckpoints(");
  assert.ok(start >= 0, "expected a setAllowManualCheckpoints export");
  const fnBody = storeBody.slice(start);
  assert.ok(
    /\.update\s*\(\s*users\s*\)/.test(fnBody),
    "setAllowManualCheckpoints must write to users directly — that's its whole job",
  );
  assert.ok(
    !/\.(insert|delete)\s*\(/.test(fnBody) && !/\.update\s*\(\s*(?!users)\w+\s*\)/.test(fnBody),
    "setAllowManualCheckpoints must touch only users — never sessions, students, or anything else",
  );
});

test("the allow-manual route is isPlatformAdmin-guarded and requires a boolean allow", () => {
  const start = routesBody.indexOf('"/api/admin/harness/checkpoints/:studentId/allow-manual"');
  assert.ok(start >= 0, "expected a POST .../allow-manual route");
  const nextRoute = routesBody.indexOf("app.post(", start + 1);
  const end = nextRoute === -1 ? routesBody.length : nextRoute;
  const routeSlice = routesBody.slice(start, end);
  assert.ok(routeSlice.includes("isPlatformAdmin"), "the allow-manual route must be isPlatformAdmin-guarded");
  assert.ok(routeSlice.includes("boolean"), "must validate allow as a boolean");
});

test("every synthetic artifact is tagged synthetic, not left indistinguishable from a real one", () => {
  assert.ok(
    /synthetic:\s*true/.test(storeBody),
    "synthetic content must carry synthetic: true so a future export can say a run was fabricated",
  );
});

test("module_6_entry requires all three Foundation sessions, not just the first two", () => {
  const match = /module_6_entry:\s*\[([^\]]*)\]/.exec(storeBody);
  assert.ok(match, "expected a module_6_entry entry in CHECKPOINT_SESSIONS");
  for (const t of ["foundation_1", "foundation_2", "foundation_3"]) {
    assert.ok(match![1].includes(t), `module_6_entry must include "${t}"`);
  }
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * The boundary for the coaching debrief surface (this session, 15 Sep 2026
 * -- claude/HARNESS_GAP_ANALYSIS_DANIELLE_OUTPUT_REQS_SEP15.md #5). Same
 * shape as harness-test-run-export-boundary.test.ts: the pure/impure split
 * is real (coaching-debrief-format.ts imports nothing that touches a
 * database), the route never writes, and it delegates to
 * wing/coaching-debrief.ts rather than reimplementing anything.
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

console.log("\nharness-coaching-debrief/boundary\n");

const HERE = fileURLToPath(new URL(".", import.meta.url));
const formatText = readFileSync(join(HERE, "wing", "coaching-debrief-format.ts"), "utf8");
const debriefText = readFileSync(join(HERE, "wing", "coaching-debrief.ts"), "utf8");
const routesText = readFileSync(join(HERE, "harness-test-run-routes.ts"), "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const formatBody = stripComments(formatText);
const debriefBody = stripComments(debriefText);
const routesBody = stripComments(routesText);

test("coaching-debrief-format.ts is pure — no database, no orchestrator, no network", () => {
  assert.ok(
    !/from\s+["']\.\.?\/(db|orchestrator)["']/.test(formatBody) && !/\bdb\./.test(formatBody),
    "the debrief's assembly functions must be computable with no I/O of any kind",
  );
});

test("coaching-debrief.ts never writes — this is a read-only synthesis surface", () => {
  assert.ok(
    !/\.(insert|update|delete)\s*\(/.test(debriefBody),
    "a debrief must never mutate the database it's reading from",
  );
});

test("buildCoachingDebrief delegates to buildRunExport, not a second reconstruction of a run", () => {
  assert.ok(
    /buildRunExport\s*\(/.test(debriefBody),
    "the debrief must read from test-run-export.ts's buildRunExport, not re-derive a run's data",
  );
});

test("the debrief route is isPlatformAdmin-guarded", () => {
  const routeMatch = /app\s*\.\s*get\s*\(\s*["']\/api\/test\/runs\/:runId\/debrief["'][\s\S]*?\);/.exec(routesBody);
  assert.ok(routeMatch, "expected a GET /api/test/runs/:runId/debrief route");
  assert.ok(routeMatch![0].includes("isPlatformAdmin"), "the debrief route must be isPlatformAdmin-guarded");
});

test("withholding scope and assessment-avoidance are documented, not silently narrowed", () => {
  assert.ok(
    /withheld/i.test(debriefBody) && /per-candidate/i.test(debriefText),
    "the file must explain that 'withheld' is the narrow, reconstructable case, not the general one",
  );
  assert.ok(
    !/verdict|worked|succeeded|failed persona|coaching succeeded/i.test(
      debriefBody.replace(/does not generate a verdict[\s\S]*?themselves, and stops there\./, ""),
    ),
    "buildCoachingDebrief must not compute or claim a pass/fail verdict on coaching itself",
  );
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

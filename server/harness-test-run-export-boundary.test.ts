import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The boundary for P6.1 (the export endpoint — `TEST_HARNESS_PLAN_SEP9.md`
 * §P6.1, `claude/HARNESS_BUILD_STEP17_SEP11.md`). Same shape as every other
 * harness boundary test: structural checks against the source text, not
 * trust in a comment, plus the one property specific to an export surface —
 * it must never write, and its CSV rendering must not fork into a second
 * implementation of what `run-export-format.ts` already does.
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

console.log("\nharness-test-run-export/boundary\n");

const HERE = dirname(fileURLToPath(import.meta.url));
const formatText = readFileSync(join(HERE, "wing", "run-export-format.ts"), "utf8");
const exportText = readFileSync(join(HERE, "wing", "test-run-export.ts"), "utf8");
const routesText = readFileSync(join(HERE, "harness-test-run-routes.ts"), "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const formatBody = stripComments(formatText);
const exportBody = stripComments(exportText);
const routesBody = stripComments(routesText);

test("run-export-format.ts is pure — no database, no orchestrator, no network", () => {
  assert.ok(
    !/from\s+["']\.\.?\/(db|orchestrator)["']/.test(formatBody) && !/\bdb\./.test(formatBody),
    "the export's types and its CSV rendering must be computable with no I/O of any kind",
  );
});

test("test-run-export.ts never writes — this is a read-only surface", () => {
  assert.ok(
    !/\.(insert|update|delete)\s*\(/.test(exportBody),
    "an export endpoint must never mutate the database it's reading from",
  );
});

test("the CSV renderer is imported from run-export-format.ts, not reimplemented here", () => {
  assert.ok(
    /export\s*\{\s*runExportToCsv/.test(exportBody) || /import\s*\{[^}]*runExportToCsv/.test(exportBody),
    "test-run-export.ts must delegate CSV rendering to the pure module, not fork a second implementation",
  );
  assert.ok(
    !/function\s+runExportToCsv/.test(exportBody),
    "runExportToCsv must be defined exactly once, in run-export-format.ts",
  );
});

test("component version is resolved via heuristic_components, not left unjoined", () => {
  assert.ok(
    /heuristicComponentId/.test(exportBody) && /versionNumber/.test(exportBody),
    "the export must join user_heuristic_applications to heuristic_components for the component version P6.1 asks for",
  );
});

test("audience adaptation is read from real per-turn history, not reconstructed from today's config", () => {
  assert.ok(
    /deliveryAudience:\s*t\.deliveryAudience/.test(exportBody) &&
      /deliveryRegister:\s*t\.deliveryRegister/.test(exportBody),
    "since migration 0048, delivery_audience/delivery_register are real per-turn columns -- " +
      "the export must read them back, not report today's voice config as if it were history",
  );
});

test("notReconstructed stays an honest mechanism, but names nothing today", () => {
  assert.ok(
    !/notReconstructed:\s*\[\s*["']audience_adaptation["']\s*\]/.test(exportBody),
    "audience_adaptation is now captured -- notReconstructed must not still claim it isn't",
  );
});

test("the export route is isPlatformAdmin-guarded and supports both json and csv", () => {
  const routeMatch = /app\s*\.\s*get\s*\(\s*["']\/api\/test\/runs\/:runId\/export["'][\s\S]*?\);/.exec(routesBody);
  assert.ok(routeMatch, "expected a GET /api/test/runs/:runId/export route");
  assert.ok(routeMatch![0].includes("isPlatformAdmin"), "the export route must be isPlatformAdmin-guarded");
  assert.ok(/format\s*===\s*["']csv["']/.test(routesBody), "the route must branch on ?format=csv");
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

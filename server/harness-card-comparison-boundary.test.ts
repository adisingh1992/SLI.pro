import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The boundary for P6.3 (the cross-persona card comparison —
 * `TEST_HARNESS_PLAN_SEP9.md` §P6.3). Same shape as the other harness
 * boundary tests: read-only, delegates scope resolution to
 * `harness-run-scope.ts` rather than a second reconstruction, and — the one
 * property specific to this surface — never invents a drop reason instead of
 * reading back the one the pre-filter already wrote.
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

console.log("\nharness-card-comparison/boundary\n");

const HERE = dirname(fileURLToPath(import.meta.url));
const reportText = readFileSync(join(HERE, "wing", "card-comparison-report.ts"), "utf8");
const routesText = readFileSync(join(HERE, "harness-test-run-routes.ts"), "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const reportBody = stripComments(reportText);
const routesBody = stripComments(routesText);

test("card-comparison-report.ts never writes — this is a read-only surface", () => {
  assert.ok(
    !/\.(insert|update|delete)\s*\(/.test(reportBody),
    "a report over runs already driven must never mutate them",
  );
});

test("scope and traces come from harness-run-scope.ts, not a second reconstruction", () => {
  assert.ok(
    /import\s*\{[^}]*resolveRunScope/.test(reportBody),
    "must reuse wing/harness-run-scope.ts's resolveRunScope rather than querying test_runs directly",
  );
  assert.ok(
    !/from\s+["']\.\.\/harness\/trace-store["']/.test(reportBody),
    "sessionTrace must be reached only through resolveRunScope",
  );
});

test("a drop reason is read back from the trace, never synthesized here", () => {
  assert.ok(
    /card\.outcome\.reason/.test(reportBody),
    "dropReasons must come from traceTurn()'s own reason string, not a new message composed in this file",
  );
});

test("a card never found in scope is a distinct, named result, not an empty report", () => {
  assert.ok(
    /card_not_found_in_scope/.test(reportBody),
    "a typo'd heuristicId must be distinguishable from a real card with nothing to show",
  );
});

test("the route is isPlatformAdmin-guarded and requires heuristicId plus a scope", () => {
  const start = routesBody.indexOf('"/api/test/card-comparison"');
  assert.ok(start >= 0, "expected a GET /api/test/card-comparison route");
  const nextRoute = routesBody.indexOf("app.get(", start + 1);
  const end = nextRoute === -1 ? routesBody.length : nextRoute;
  const routeSlice = routesBody.slice(start, end);
  assert.ok(routeSlice.includes("isPlatformAdmin"), "the route must be isPlatformAdmin-guarded");
  assert.ok(routeSlice.includes("heuristicId"), "must require a heuristicId");
  assert.ok(
    routeSlice.includes("sequenceId") && routeSlice.includes("runIds"),
    "must accept both scope shapes, same as /unfired-cards",
  );
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

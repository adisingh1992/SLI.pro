import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The boundary for P6.2 (the cross-persona Unfired Cards report —
 * `TEST_HARNESS_PLAN_SEP9.md` §P6.2, `claude/HARNESS_BUILD_STEP19_SEP11.md`).
 * Same shape as the other harness boundary tests: structural checks against
 * the source text, plus the two properties specific to this surface — it
 * must delegate the four-way classification to `classifyUnfired` rather
 * than forking a second copy of it (the simulations panel already forks one
 * deliberately, in the browser, and says in its own comment that the
 * server's copy is the one this report has to use), and it must delegate
 * scope resolution to `harness-run-scope.ts` rather than re-querying the
 * platform a second way — that module's own boundary test
 * (`harness-run-scope-boundary.test.ts`) covers the multi-sequence refusal
 * and the no-writes property directly.
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

console.log("\nharness-unfired-cards/boundary\n");

const HERE = dirname(fileURLToPath(import.meta.url));
const reportText = readFileSync(join(HERE, "wing", "unfired-cards-report.ts"), "utf8");
const routesText = readFileSync(join(HERE, "harness-test-run-routes.ts"), "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const reportBody = stripComments(reportText);
const routesBody = stripComments(routesText);

test("unfired-cards-report.ts never writes — this is a read-only surface", () => {
  assert.ok(
    !/\.(insert|update|delete)\s*\(/.test(reportBody),
    "a report over runs already driven must never mutate them",
  );
});

test("the four-way classification is imported from selection-trace.ts, not reimplemented", () => {
  assert.ok(
    /import\s*\{[^}]*classifyUnfired/.test(reportBody),
    "must import classifyUnfired from harness/selection-trace.ts",
  );
  assert.ok(
    !/function\s+classifyUnfired/.test(reportBody) && !/function\s+bucketFor/.test(reportBody),
    "the bucket split must be defined exactly once, in selection-trace.ts — not re-derived here",
  );
});

test("scope and traces come from harness-run-scope.ts, not a second reconstruction", () => {
  assert.ok(
    /import\s*\{[^}]*resolveRunScope/.test(reportBody),
    "must reuse wing/harness-run-scope.ts's resolveRunScope rather than querying test_runs directly",
  );
  assert.ok(
    !/from\s+["']\.\.\/harness\/trace-store["']/.test(reportBody),
    "sessionTrace must be reached only through resolveRunScope, so P6.2 and P6.3 can't disagree about scope",
  );
});

test("every run in scope is reported, including its status — nothing in scope is hidden", () => {
  assert.ok(
    /status/.test(reportBody) && /runsIncluded/.test(reportBody),
    "the report must say which runs (and what state they're in) produced its counts",
  );
});

test("the route is isPlatformAdmin-guarded and accepts either sequenceId or runIds", () => {
  const start = routesBody.indexOf('"/api/test/unfired-cards"');
  assert.ok(start >= 0, "expected a GET /api/test/unfired-cards route");
  const nextRoute = routesBody.indexOf("app.get(", start + 1);
  const end = nextRoute === -1 ? routesBody.length : nextRoute;
  const routeSlice = routesBody.slice(start, end);
  assert.ok(routeSlice.includes("isPlatformAdmin"), "the report route must be isPlatformAdmin-guarded");
  assert.ok(
    routeSlice.includes("sequenceId") && routeSlice.includes("runIds"),
    "must accept both scope shapes",
  );
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

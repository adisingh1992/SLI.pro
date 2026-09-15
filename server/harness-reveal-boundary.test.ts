import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * The boundary for the Reveal Cycle harness surface (this session, 15 Sep
 * 2026 -- claude/HARNESS_GAP_ANALYSIS_DANIELLE_OUTPUT_REQS_SEP15.md #11).
 * Same idea as harness-checkpoint-boundary.test.ts: this route file writes
 * nothing of its own -- both mutation (evaluateRevealCycle) and history
 * reads (revealCycleHistory) go through wing/reveal-cycle.ts. What this
 * file guards against: a raw write sneaking into the route file itself, a
 * route left unguarded, and a persona with no seeded student being handed
 * to reveal-cycle.ts anyway.
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

console.log("\nharness-reveal/boundary\n");

const HERE = fileURLToPath(new URL(".", import.meta.url));
const routesText = readFileSync(join(HERE, "harness-reveal-routes.ts"), "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const routesBody = stripComments(routesText);

test("the route file never imports ./db directly", () => {
  assert.ok(
    !/from\s+["']\.\/db["']/.test(routesBody),
    "every read or write must go through wing/reveal-cycle.ts, not the route file",
  );
});

test("the route file never writes directly — no raw insert/update/delete", () => {
  assert.ok(
    !/\.(insert|update|delete)\s*\(/.test(routesBody),
    "evaluateRevealCycle (reveal-cycle.ts) is the only thing allowed to write a reveal_cycles row",
  );
});

test("both routes are isPlatformAdmin-guarded", () => {
  const handlers = routesBody.match(/app\s*\.\s*(get|post)\s*\([^;]*?\)/gs) ?? [];
  assert.equal(handlers.length, 2, "expected exactly the GET history route and the POST evaluate route");
  const unguarded = handlers.filter((h) => !h.includes("isPlatformAdmin"));
  assert.deepEqual(unguarded.map((h) => h.slice(0, 60)), [], "every route needs isPlatformAdmin");
});

test("both routes refuse a persona with no seeded student before calling reveal-cycle.ts", () => {
  const matches = routesBody.match(/seededStudentId/g) ?? [];
  // One check per route (GET, POST), each reading persona.seededStudentId
  // twice — once in the guard, once passed to reveal-cycle.ts.
  assert.ok(matches.length >= 4, "expected each route to guard on, then pass, seededStudentId");
});

test("history is read via revealCycleHistory, evaluation via evaluateRevealCycle — no reimplementation", () => {
  assert.ok(
    /import\s*\{[^}]*evaluateRevealCycle[^}]*revealCycleHistory[^}]*\}\s*from\s*["']\.\/wing\/reveal-cycle["']/.test(
      routesText,
    ) ||
      /import\s*\{[^}]*revealCycleHistory[^}]*evaluateRevealCycle[^}]*\}\s*from\s*["']\.\/wing\/reveal-cycle["']/.test(
        routesText,
      ),
    "both functions must come from wing/reveal-cycle.ts, not be redefined here",
  );
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

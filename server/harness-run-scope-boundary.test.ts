import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The boundary for `wing/harness-run-scope.ts` — the scope-resolution module
 * shared by P6.2 (`unfired-cards-report.ts`) and P6.3
 * (`card-comparison-report.ts`). Both reports delegate their own boundary
 * tests' "did this reuse the reconstruction, not reimplement it" checks to
 * this file existing and behaving correctly; this test is where that
 * correctness is actually checked.
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

console.log("\nharness-run-scope/boundary\n");

const HERE = dirname(fileURLToPath(import.meta.url));
const scopeText = readFileSync(join(HERE, "wing", "harness-run-scope.ts"), "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const scopeBody = stripComments(scopeText);

test("harness-run-scope.ts never writes — this is a read-only surface", () => {
  assert.ok(
    !/\.(insert|update|delete)\s*\(/.test(scopeBody),
    "resolving which runs are in scope must never mutate them",
  );
});

test("traces come from sessionTrace, not a second reconstruction of the engine's funnel", () => {
  assert.ok(
    /import\s*\{[^}]*sessionTrace/.test(scopeBody),
    "must reuse trace-store.ts's sessionTrace rather than re-querying the platform directly",
  );
});

test("runs spanning more than one sequence are refused, not silently merged", () => {
  assert.ok(
    /runs_span_multiple_sequences/.test(scopeBody),
    "a card's eligibility is only comparable within one sequence's own catalogue",
  );
});

test("scope with no matching runs is refused explicitly, not returned as an empty report", () => {
  assert.ok(
    /no_runs_for_scope/.test(scopeBody),
    "callers need to distinguish 'nothing ran yet' from 'ran and found nothing'",
  );
});

test("traces are kept per run, not flattened here — that choice belongs to each caller", () => {
  assert.ok(
    /traces\s*:\s*TurnTrace\[\]/.test(scopeBody) || /traces:\s*traces/.test(scopeBody),
    "P6.3 needs per-run traces; flattening them in the shared module would take that choice away from it",
  );
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

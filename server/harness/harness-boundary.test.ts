import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The harness boundary, enforced rather than promised.
 *
 * Aditya's constraint, and it is the right one: the test harness is an
 * ADDITIVE module. It must not change platform behaviour, and it must not
 * write to platform tables. Students are using the turn path this reconstructs
 * from; a harness that mutates it to observe it is not a harness.
 *
 * A convention holds until someone in a hurry breaks it, and the failure would
 * be silent — a `db.update` added here to "fix" a stale trace would corrupt the
 * audit log Danielle reviews methodology from. So the rule is a test:
 *
 *   1. No writes. No `db.insert`, `db.update` or `db.delete` under this
 *      directory. When the harness eventually needs its own tables they go in
 *      their own schema behind their own migration, and this test is amended
 *      deliberately with the allowed table named — not quietly deleted.
 *   2. No importing the turn path. Reconstruction reads stores; it never calls
 *      `evaluateTurn`, `detectSignal` or the session routes, because calling
 *      the engine to observe it would spend tokens and write applications.
 *
 * Both of these are cheap to check and expensive to discover.
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

console.log("\nharness/boundary\n");

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Every harness source, including the route file.
 *
 * `harness-routes.ts` lives at server/ root because that is where every route
 * file lives, but it is harness code and it is the file most likely to grow a
 * "just mark it reviewed" PATCH later, so it is scanned with the rest. Review
 * writes belong to the Integrity panel, which owns the table they touch.
 */
const sources = [
  ...readdirSync(HERE)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({ file: f, text: readFileSync(join(HERE, f), "utf8") })),
  {
    file: "../harness-routes.ts",
    text: readFileSync(join(HERE, "..", "harness-routes.ts"), "utf8"),
  },
];

test("there is something to check", () => {
  assert.ok(sources.length > 0, "no harness sources found — did the directory move?");
});

test("no harness source writes to the database", () => {
  const WRITES = /\bdb\s*\.\s*(insert|update|delete)\s*\(/;
  const offenders = sources
    .filter(({ text }) => WRITES.test(stripComments(text)))
    .map(({ file }) => file);
  assert.deepEqual(
    offenders,
    [],
    `harness files must not write to platform tables: ${offenders.join(", ")}`,
  );
});

test("no harness source calls the live turn path", () => {
  /*
   * Importing the engine's read-side stores is correct and deliberate —
   * `heuristics-store` and `population-tags` are how the reconstruction stays
   * identical to the engine. What must not appear is the turn path itself.
   */
  const FORBIDDEN = ["evaluateTurn", "detectSignal", "loadTurnGates", "compileTurnGates"];
  const offenders: string[] = [];
  for (const { file, text } of sources) {
    const body = stripComments(text);
    for (const name of FORBIDDEN) {
      if (new RegExp(`\\b${name}\\s*\\(`).test(body)) offenders.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(offenders, [], `harness must not invoke the turn path: ${offenders.join(", ")}`);
});

test("the harness route file registers no mutating verb", () => {
  const routes = sources.find((s) => s.file === "../harness-routes.ts")!;
  const body = stripComments(routes.text);
  for (const verb of ["post", "put", "patch", "delete"]) {
    assert.ok(
      !new RegExp(`app\\s*\\.\\s*${verb}\\s*\\(`).test(body),
      `harness routes must be read-only; found app.${verb}(`,
    );
  }
  assert.ok(/app\s*\.\s*get\s*\(/.test(body), "expected at least one GET");
});

test("every harness route is guarded by isPlatformAdmin", () => {
  const routes = sources.find((s) => s.file === "../harness-routes.ts")!;
  const gets = stripComments(routes.text).match(/app\s*\.\s*get\s*\([^;]*?\)/gs) ?? [];
  assert.ok(gets.length > 0, "no GET handlers found");
  const unguarded = gets.filter((g) => !g.includes("isPlatformAdmin"));
  assert.deepEqual(
    unguarded.map((g) => g.slice(0, 60)),
    [],
    "the trace carries transcript content — every route needs isPlatformAdmin",
  );
});

test("every harness source file is where this test expects it", () => {
  // Guards against the module growing a file somewhere the two rules above
  // would not see it.
  assert.ok(HERE.endsWith(join("server", "harness")), `unexpected location: ${HERE}`);
  assert.equal(sources.filter((s) => s.file === "../harness-routes.ts").length, 1);
});

/**
 * Comments in this module quote the forbidden names on purpose — the whole
 * point of the header above is to say what is not allowed and why. Checking the
 * raw text would make the documentation fail the test.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

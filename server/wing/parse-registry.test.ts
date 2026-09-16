import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REGISTRY_SOURCE, expandCodesCell, parseRegistry } from "./parse-registry";

/**
 * Tests for the Doc 2 element registry parser.
 *
 * Same discipline as parse-compendium.test.ts: assertions against the real
 * document, not fixtures. The point of this parser is that the checklist is
 * derived rather than transcribed, and a derivation nobody checks is a
 * transcription with extra steps.
 *
 * The cell-grammar cases below are the ones that actually occur in Appendix B
 * and each one broke a naive implementation: a prefix containing its own digit
 * (IG-M6-01–05), an endpoint that repeats the prefix letter (IG-U006–U011), a
 * range with prose attached (H-411–416 exercises), an exclusion inside a range
 * (H-301–310 excl 308), and a cell whose left half is a count rather than a
 * code (16 cards + H-900).
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

console.log("\nparse-registry\n");

/* ── Cell grammar ────────────────────────────────────────────────────────── */

test("plain numeric range", () => {
  assert.deepEqual(expandCodesCell("H-101–110").codes, [
    "H-101", "H-102", "H-103", "H-104", "H-105",
    "H-106", "H-107", "H-108", "H-109", "H-110",
  ]);
});

test("range whose endpoint repeats the prefix letter", () => {
  assert.deepEqual(expandCodesCell("IG-U006–U011").codes, [
    "IG-U006", "IG-U007", "IG-U008", "IG-U009", "IG-U010", "IG-U011",
  ]);
});

test("range whose prefix contains a digit — IG-M6-01–05 is not IG-M 6..0", () => {
  assert.deepEqual(expandCodesCell("IG-M6-01–05").codes, [
    "IG-M6-01", "IG-M6-02", "IG-M6-03", "IG-M6-04", "IG-M6-05",
  ]);
});

test("zero-padding follows the start endpoint", () => {
  assert.deepEqual(expandCodesCell("H-010–012").codes, ["H-010", "H-011", "H-012"]);
  assert.deepEqual(expandCodesCell("IG-S01–S03").codes, ["IG-S01", "IG-S02", "IG-S03"]);
});

test("prose attached to a range is ignored, the range is not", () => {
  assert.deepEqual(expandCodesCell("H-411–416 exercises").codes, [
    "H-411", "H-412", "H-413", "H-414", "H-415", "H-416",
  ]);
  assert.deepEqual(expandCodesCell("H-412 gate").codes, ["H-412"]);
});

test("an exclusion removes the code from its own range, not from the document", () => {
  const r = expandCodesCell("H-301–310 (excl 308→007)");
  assert.ok(!r.codes.includes("H-308"), "H-308 should be excluded");
  assert.deepEqual(r.excluded, ["H-308"]);
  assert.equal(r.codes.length, 9);
});

test("a fragment naming a count but no code is reported, never invented", () => {
  const r = expandCodesCell("16 cards + H-900");
  assert.deepEqual(r.codes, ["H-900"]);
  assert.deepEqual(r.unexpressed, ["16 cards"]);
});

test("a cell of pure prose yields no codes and one hole", () => {
  const r = expandCodesCell("3 rules");
  assert.deepEqual(r.codes, []);
  assert.deepEqual(r.unexpressed, ["3 rules"]);
});

/* ── The real document ───────────────────────────────────────────────────── */

const result = parseRegistry(readFileSync(REGISTRY_SOURCE, "utf8"));

test("Appendix B is found and every row parses", () => {
  assert.equal(result.rows.length, 27);
  assert.ok(result.rows.every((r) => r.component.length > 0));
});

test("the document's own stated total is read, not assumed", () => {
  assert.equal(result.statedTotal, 329);
});

test("the naive row sum is higher than the stated total — this is the finding", () => {
  assert.equal(result.summedStatedCounts, 362);
  assert.ok(
    result.summedStatedCounts > (result.statedTotal ?? 0),
    "if these ever agree, the document was fixed and this test should be updated deliberately",
  );
});

test("the distinct checklist is smaller than both, and is what a seeder may use", () => {
  assert.equal(result.elements.length, 324);
  assert.ok(result.elements.length < result.summedStatedCounts);
});

test("the Content System's 17 are the largest double-count", () => {
  const contentSystem = result.duplicates.filter((d) =>
    d.claimants.includes("Content System") && d.claimants.includes("Module 6 content system"),
  );
  assert.equal(contentSystem.length, 16);
});

test("H-111 and H-923 are each claimed twice", () => {
  const codes = result.duplicates.map((d) => d.code);
  assert.ok(codes.includes("H-111"));
  assert.ok(codes.includes("H-923"));
});

test("both uncoded cells are reported as holes rather than rounded into the total", () => {
  const holes = result.rows.flatMap((r) => r.unexpressed);
  assert.deepEqual(holes.sort(), ["16 cards", "3 rules"]);
});

test("Section 1's module registry parses, and its own parts-vs-total splits are surfaced", () => {
  assert.equal(result.moduleRegistry.length, 18);
  const m6 = result.moduleRegistry.find((m) => m.key === "M6");
  assert.ok(m6);
  assert.equal(m6?.total, 33);
  // 11 cards + 3 exercises stated, total 33 — the gates cell is prose, not a
  // number, and the 17 content-system elements are folded into the total.
  assert.equal(m6?.gates, null);
});

test("no element is silently dropped: every row's codes appear in the checklist", () => {
  const checklist = new Set(result.elements.map((e) => e.code));
  for (const row of result.rows) {
    for (const code of row.codes) {
      assert.ok(checklist.has(code), `${code} from "${row.component}" is missing from the checklist`);
    }
  }
});

console.log(
  `\n${result.elements.length} distinct elements, ${result.duplicates.length} double-claimed, ` +
    `${failures} failures\n`,
);
if (failures > 0) process.exit(1);

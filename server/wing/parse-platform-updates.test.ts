import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLATFORM_UPDATES_SOURCE, parsePlatformUpdates } from "./parse-platform-updates";

/**
 * Tests for the platform updates memo parser (IG-U012–U017 and IG-RC13).
 *
 * The load-bearing case is the last one: RULE_LABEL must throw for a gate it
 * does not name. Every gate in this revision states its rule under "What it
 * enforces", which is exactly the condition under which someone would delete
 * the table as redundant — and the next gate to arrive under a different label
 * would then seed with an empty rule and no complaint.
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

console.log("\nparse-platform-updates\n");

const text = readFileSync(PLATFORM_UPDATES_SOURCE, "utf8");
const result = parsePlatformUpdates(text);
const codes = result.gates.map((g) => g.cardCode);

test("all seven gates are found, in document order", () => {
  assert.equal(result.gates.length, 7);
  assert.deepEqual(codes, [
    "IG-U012", "IG-U013", "IG-RC13", "IG-U014", "IG-U015", "IG-U016", "IG-U017",
  ]);
});

test("nothing is missing, ruleless or duplicated", () => {
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.ruleless, []);
  assert.deepEqual(result.collisions, []);
});

test("IG-RC13 is filed under the Reveal Cycle even though it is defined here", () => {
  const rc13 = result.gates.find((g) => g.cardCode === "IG-RC13");
  assert.equal(rc13?.module, "reveal_cycle");
  assert.equal(rc13?.name, "Unsourced Population Claims");
});

test("the six universal gates derive to the universal module", () => {
  for (const g of result.gates.filter((x) => x.cardCode.startsWith("IG-U"))) {
    assert.equal(g.module, "universal", `${g.cardCode} should be universal`);
  }
});

test("every gate carries a non-empty rule and a scope", () => {
  for (const g of result.gates) {
    assert.ok(g.rule.length > 50, `${g.cardCode} rule is too short to be the rule`);
    assert.ok(g.scope, `${g.cardCode} has no Scope paragraph`);
  }
});

test("a multi-line rule arrives whole rather than truncated at the first newline", () => {
  const u012 = result.gates.find((g) => g.cardCode === "IG-U012");
  assert.ok(u012);
  // IG-U012's rule runs on into the three-tier table below it.
  assert.ok(u012!.rule.includes("Tier 1"), "the evidence tiers should be inside the rule");
  assert.ok(u012!.rule.includes("\n"), "the rule should span more than one line");
});

test("provenance falls back through the three labels the memo actually uses", () => {
  assert.ok(result.gates.find((g) => g.cardCode === "IG-U012")?.provenance?.includes("Reveal Cycle"));
  assert.ok(result.gates.find((g) => g.cardCode === "IG-U014")?.provenance?.includes("Kruger"));
  assert.ok(result.gates.find((g) => g.cardCode === "IG-RC13")?.provenance?.includes("v4"));
});

test("every labelled block in a section is kept, not just the rule", () => {
  const u016 = result.gates.find((g) => g.cardCode === "IG-U016");
  const labels = u016?.fields.map((f) => f.label) ?? [];
  assert.ok(labels.includes("The design pattern"));
  assert.ok(labels.includes("What this does NOT apply to"));
  assert.ok(labels.includes("Implementation note for Aditya"));
});

test("a gate with no RULE_LABEL entry throws rather than seeding an empty rule", () => {
  const forged = text.replace(
    "## New Universal Gate: IG-U012 — Evidence Grade Classification",
    "## New Universal Gate: IG-U099 — Invented For This Test",
  );
  assert.throws(() => parsePlatformUpdates(forged), /IG-U099 has no entry in RULE_LABEL/);
});

console.log(`\n${result.gates.length} gates, ${failures} failures\n`);
if (failures > 0) process.exit(1);

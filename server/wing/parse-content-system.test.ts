import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TIER1_INCLUDED, moduleFromCode } from "./parse-compendium";
import {
  CONTENT_SYSTEM_TIER1_INCLUDED,
  parseContentSystem,
  type ContentSystemParseResult,
} from "./parse-content-system";

/**
 * Tests for the Content Trigger Layer parser (Wing_Content_System_v1 ingest).
 *
 * Same discipline as parse-compendium.test.ts, for the same reason: these are
 * count and content assertions against the real document, not synthetic
 * fixtures, so a revision to the source file that silently drops a card or
 * breaks a field extraction fails loudly here instead of shipping quietly.
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

console.log("\nparse-content-system\n");

const SOURCE = "methodology/wing-content-system-v1.md";
const text = readFileSync(SOURCE, "utf8");
const result: ContentSystemParseResult = parseContentSystem(text);

test("finds all 9 content-trigger/cadence/progression/integration/radar cards", () => {
  assert.equal(result.cards.length, 9);
  assert.deepEqual(
    result.cards.map((c) => c.cardCode),
    ["H-620", "H-621", "H-622", "H-623", "H-624", "H-625", "H-626", "H-627", "H-701"],
  );
});

test("finds all 8 gates (IG-M6-01..05, IG-IMG-01..03)", () => {
  assert.equal(result.gates.length, 8);
  assert.deepEqual(
    result.gates.map((g) => g.cardCode),
    [
      "IG-M6-01", "IG-M6-02", "IG-M6-03", "IG-M6-04", "IG-M6-05",
      "IG-IMG-01", "IG-IMG-02", "IG-IMG-03",
    ],
  );
});

test("no card is missing any of the 7 components", () => {
  const missing = result.warnings.filter((w) => w.includes("missing component"));
  assert.deepEqual(missing, []);
});

test("no gate is missing gate_type or Rule", () => {
  for (const g of result.gates) {
    assert.ok(g.gateType.length > 0, `${g.cardCode} has no gate_type`);
    assert.ok(g.rule.length > 0, `${g.cardCode} has no rule`);
  }
});

test("parser reports zero warnings against the current document", () => {
  assert.deepEqual(result.warnings, []);
});

test("every code found here is one moduleFromCode recognizes", () => {
  // Pinned to empty: this is the check that would have caught the original
  // IG-M6-*/IG-IMG-* gap before it shipped, and should stay empty as long as
  // parse-compendium.ts's prefix fix and this parser agree on what a valid
  // code looks like.
  assert.deepEqual(result.unrecognizedByCompendium, []);
  for (const c of [...result.cards, ...result.gates]) {
    assert.notEqual(
      moduleFromCode(c.cardCode),
      "unknown",
      `${c.cardCode} → moduleFromCode returned "unknown"`,
    );
  }
});

test("H-620..627 and H-701 derive to module_6 / module_7 respectively", () => {
  for (const code of ["H-620", "H-621", "H-622", "H-623", "H-624", "H-625", "H-626", "H-627"]) {
    assert.equal(moduleFromCode(code), "module_6", code);
  }
  assert.equal(moduleFromCode("H-701"), "module_7");
});

test("IG-M6-* gates derive to module_6, IG-IMG-* to image_generation", () => {
  for (const code of ["IG-M6-01", "IG-M6-02", "IG-M6-03", "IG-M6-04", "IG-M6-05"]) {
    assert.equal(moduleFromCode(code), "module_6", code);
  }
  for (const code of ["IG-IMG-01", "IG-IMG-02", "IG-IMG-03"]) {
    assert.equal(moduleFromCode(code), "image_generation", code);
  }
});

test("finds all 6 governing-gate references (○ bullets)", () => {
  assert.deepEqual(result.referencedGates, [
    "H-615", "IG-RC13", "IG-U006", "IG-U015", "IG-U017", "IG-V07",
  ]);
});

test("H-622 (Article Trigger) is scoped to 5 population tags, not all 8", () => {
  const h622 = result.cards.find((c) => c.cardCode === "H-622");
  assert.ok(h622);
  assert.deepEqual(h622!.populationTags, [
    "mid_career", "executive", "entrepreneur_early", "entrepreneur_fundraising", "entrepreneur_scaling",
  ]);
});

test("H-701 (Baby Radar) has no populationTags or module_mapping — the document has none", () => {
  const h701 = result.cards.find((c) => c.cardCode === "H-701");
  assert.ok(h701);
  assert.deepEqual(h701!.populationTags, []);
  assert.equal(h701!.moduleMapping, null);
});

test("IG-IMG-01's rule captures the bullet list and the trailing Implementation paragraph", () => {
  const gate = result.gates.find((g) => g.cardCode === "IG-IMG-01");
  assert.ok(gate);
  assert.ok(gate!.rule.includes("No sexual, suggestive, or phallic imagery"));
  assert.ok(gate!.rule.includes("Professional aesthetic only"));
  assert.ok(gate!.rule.includes("Implementation:"));
  assert.ok(gate!.rule.includes("After 2 failed generations"));
});

test("field values are unescaped and quote-preserving (spot check H-620's failure_path)", () => {
  const h620 = result.cards.find((c) => c.cardCode === "H-620");
  assert.ok(h620);
  assert.ok(h620!.components.failure_path?.includes('"This matches what I\'ve seen'));
  assert.ok(h620!.components.failure_path?.includes("route to H-602"));
});

test("meta header fields are read from the document's own front matter", () => {
  assert.equal(result.meta.for, "Aditya (build), Sneha (UX), Sam (architecture)");
  assert.ok(result.meta.status?.includes("v1.0 MERGED"));
});

test("Baby Radar's Tier 1 status is recorded here, and only here — never back in the compendium's own table", () => {
  // Regression guard for the collision `npm test` caught as "54 !== 53": an
  // earlier version of this decision lived in parse-compendium.ts's
  // TIER1_INCLUDED, keyed by the bare code "H-701" — which also matches the
  // master compendium's own, unrelated "H-701 Radar weekly brief generation"
  // card and silently promoted it to Tier 1 too. The decision belongs here,
  // scoped to cards this parser actually produces, and must never migrate
  // back to the document-agnostic table.
  assert.ok("H-701" in CONTENT_SYSTEM_TIER1_INCLUDED, "Baby Radar's Tier 1 status should be recorded");
  assert.ok(
    !("H-701" in TIER1_INCLUDED),
    "H-701 must stay out of parse-compendium.ts's TIER1_INCLUDED — it collides with the master compendium's own H-701",
  );
});

console.log(`\n${result.cards.length} cards, ${result.gates.length} gates, ${failures} failures\n`);
if (failures > 0) process.exit(1);

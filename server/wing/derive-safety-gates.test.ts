import assert from "node:assert/strict";
import { SAFETY_RULES } from "./safety-rules";
import {
  CODE_ENFORCED_NOTE,
  SAFETY_GATES_WITHOUT_SOURCE,
  deriveSafetyGates,
} from "./derive-safety-gates";

/**
 * Tests for the safety gate derivation.
 *
 * The one that matters is the last: every derived row must carry the marker
 * saying an edit to it changes nothing. These rows exist so Danielle can SEE
 * the safety gates in the panel, and the moment one of them looks editable
 * without saying so, the panel is lying about a crisis-detection rule.
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

console.log("\nderive-safety-gates\n");

const gates = deriveSafetyGates();

test("one row per constant, in the constants' own order", () => {
  assert.equal(gates.length, SAFETY_RULES.length);
  assert.deepEqual(gates.map((g) => g.cardCode), SAFETY_RULES.map((r) => r.code));
});

test("the seven in the system prompt are exactly these", () => {
  assert.deepEqual(
    gates.map((g) => g.cardCode).sort(),
    ["IG-S01", "IG-S02", "IG-S03", "IG-S06", "IG-S07", "IG-S08", "IG-S09"],
  );
});

test("the three Doc 2 lists and this repo cannot supply are declared, with reasons", () => {
  assert.deepEqual(Object.keys(SAFETY_GATES_WITHOUT_SOURCE).sort(), ["IG-S04", "IG-S05", "IG-S10"]);
  for (const [code, why] of Object.entries(SAFETY_GATES_WITHOUT_SOURCE)) {
    assert.ok(why.length > 40, `${code}'s reason is too short to be a reason`);
    assert.ok(/Safety_Architecture/.test(why), `${code} should name the document it needs`);
  }
});

test("the ten of Doc 2 §5 are fully accounted for, with no overlap", () => {
  const derived = new Set(gates.map((g) => g.cardCode));
  const absent = new Set(Object.keys(SAFETY_GATES_WITHOUT_SOURCE));
  assert.equal(derived.size + absent.size, 10);
  for (const code of Array.from(absent)) {
    assert.ok(!derived.has(code), `${code} cannot be both derived and known-absent`);
  }
});

test("every row carries a name, a description and the rule verbatim", () => {
  for (const g of gates) {
    const constant = SAFETY_RULES.find((r) => r.code === g.cardCode);
    assert.ok(constant);
    assert.equal(g.rule, constant!.rule, `${g.cardCode}'s rule is not the constant's text`);
    assert.equal(g.description, constant!.what);
    assert.ok(g.name.startsWith(g.cardCode));
    assert.ok(g.provenance.length > 0, `${g.cardCode} has no provenance`);
  }
});

test("every row derives to the safety module", () => {
  assert.ok(gates.every((g) => g.module === "safety"), gates.map((g) => g.module).join(","));
});

test("every row says an edit to it changes nothing", () => {
  for (const g of gates) {
    assert.equal(g.enforcement, CODE_ENFORCED_NOTE);
  }
  assert.ok(/does not change what Wing does/.test(CODE_ENFORCED_NOTE));
  assert.ok(/safety-rules\.ts/.test(CODE_ENFORCED_NOTE));
});

console.log(`\n${gates.length} derived, ${Object.keys(SAFETY_GATES_WITHOUT_SOURCE).length} declared absent, ${failures} failures\n`);
if (failures > 0) process.exit(1);

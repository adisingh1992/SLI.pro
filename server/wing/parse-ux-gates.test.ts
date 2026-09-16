import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMPONENT_KEYS } from "./parse-compendium";
import {
  UX_ADDENDUM_SOURCE,
  UX_RECOMMENDATION_SOURCE,
  parseUxGates,
} from "./parse-ux-gates";

/**
 * Tests for the two UX gate families.
 *
 * The asymmetry between them is the thing under test. IG-UX01–06 are written as
 * full cards and must arrive complete; IG-MJ01–06 are written as three table
 * columns and must arrive as rule-only gates with nothing invented to fill the
 * other six components. A future change that "helpfully" normalised the second
 * into the first would be authoring methodology, and these cases are what
 * should stop it.
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

console.log("\nparse-ux-gates\n");

const result = parseUxGates(
  readFileSync(UX_RECOMMENDATION_SOURCE, "utf8"),
  readFileSync(UX_ADDENDUM_SOURCE, "utf8"),
);

test("all twelve are found and nothing is missing", () => {
  assert.deepEqual(result.missing, []);
  assert.equal(result.uxGates.cards.length, 6);
  assert.equal(result.mjGates.length, 6);
});

test("IG-UX01–06 arrive as full seven-component cards", () => {
  assert.deepEqual(result.uxGates.incomplete, []);
  assert.deepEqual(result.uxGates.specified, []);
  assert.deepEqual(result.uxGates.collisions, []);
  for (const card of result.uxGates.cards) {
    for (const key of COMPONENT_KEYS) {
      assert.ok(card.components[key], `${card.cardCode} is missing ${key}`);
    }
  }
});

test("every UX gate is an integrity gate — none may enter the detector", () => {
  assert.ok(result.uxGates.cards.every((c) => c.cardKind === "integrity_gate"));
  assert.deepEqual(result.uxGates.interventionTypes, { META: 6 });
});

test("UX gates derive to the ux module, and carry the title from their heading", () => {
  assert.deepEqual(result.uxGates.misfiled, []);
  assert.ok(result.uxGates.cards.every((c) => c.module === "ux"));
  assert.ok(result.uxGates.cards.every((c) => c.descriptionFromHeading));
  const ux03 = result.uxGates.cards.find((c) => c.cardCode === "IG-UX03");
  assert.equal(ux03?.name, 'IG-UX03 Progress Language: "Built" Not "Completed"');
});

test("IG-MJ01–06 are rule-only, and the six absent components stay absent", () => {
  assert.deepEqual(result.mjGates.map((g) => g.cardCode), [
    "IG-MJ01", "IG-MJ02", "IG-MJ03", "IG-MJ04", "IG-MJ05", "IG-MJ06",
  ]);
  for (const g of result.mjGates) {
    assert.ok(g.rule.length > 40, `${g.cardCode}'s rule is too short to be the rule`);
    assert.ok(/^Section A\d$/.test(g.source), `${g.cardCode} should cite its addendum section`);
    assert.equal(g.module, "micro_journaling");
    assert.ok(!("components" in g), `${g.cardCode} must not acquire a component table`);
  }
});

test("neither family is named by the parser", () => {
  for (const g of result.mjGates) {
    assert.equal(g.name, g.cardCode, "the parser must not summarise a rule into a title");
    assert.equal(g.nameFromDocument, false);
  }
});

test("the rules are the document's words, not a paraphrase", () => {
  const mj05 = result.mjGates.find((g) => g.cardCode === "IG-MJ05");
  assert.equal(
    mj05?.rule,
    "Maximum 1 prompt per day for any user, regardless of population or engagement level.",
  );
  const mj04 = result.mjGates.find((g) => g.cardCode === "IG-MJ04");
  assert.ok(mj04?.rule.startsWith("When a prompt response contains crisis-level language"));
});

test("a repeated table produces one record per gate, not two", () => {
  const addendum = readFileSync(UX_ADDENDUM_SOURCE, "utf8");
  const doubled = parseUxGates(readFileSync(UX_RECOMMENDATION_SOURCE, "utf8"), addendum + addendum);
  assert.equal(doubled.mjGates.length, 6);
});

console.log(
  `\n${result.uxGates.cards.length} UX cards, ${result.mjGates.length} MJ gates, ${failures} failures\n`,
);
if (failures > 0) process.exit(1);

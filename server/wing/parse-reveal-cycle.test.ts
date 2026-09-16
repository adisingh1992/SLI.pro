import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMPONENT_KEYS } from "./parse-compendium";
import { REVEAL_CYCLE_SOURCE, parseRevealCycle } from "./parse-reveal-cycle";

/**
 * Tests for the Reveal Cycle v4 parser.
 *
 * Assertions against the real document, per parse-compendium.test.ts. The two
 * that matter most are the negative ones: IG-RC11 and IG-RC12 must come back as
 * codes with no components rather than as gates with six invented ones, and
 * IG-RC13 must NOT appear here at all — it is defined in the platform updates
 * memo, and a parser that quietly produced it would give the seeder two records
 * for one gate.
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

console.log("\nparse-reveal-cycle\n");

const result = parseRevealCycle(readFileSync(REVEAL_CYCLE_SOURCE, "utf8"));
const codes = result.cards.map((c) => c.cardCode);

test("thirteen H-RC cards and ten IG-RC gates carry a full component table", () => {
  assert.equal(result.cards.length, 23);
  assert.equal(codes.filter((c) => c.startsWith("H-RC")).length, 13);
  assert.equal(codes.filter((c) => c.startsWith("IG-RC")).length, 10);
});

test("every card that has a table has all seven components — nothing incomplete", () => {
  assert.deepEqual(result.incomplete, []);
  for (const card of result.cards) {
    for (const key of COMPONENT_KEYS) {
      assert.ok(card.components[key], `${card.cardCode} is missing ${key}`);
    }
  }
});

test("IG-RC11 and IG-RC12 have no table, and are reported rather than filled in", () => {
  assert.deepEqual(result.specified.sort(), ["IG-RC11", "IG-RC12"]);
  assert.ok(!codes.includes("IG-RC11"));
  assert.ok(!codes.includes("IG-RC12"));
});

test("IG-RC13 is not in this document — the platform updates memo owns it", () => {
  assert.ok(!codes.includes("IG-RC13"));
  assert.ok(!result.specified.includes("IG-RC13"));
});

test("no collisions, nothing misfiled out of the reveal_cycle module", () => {
  assert.deepEqual(result.collisions, []);
  assert.deepEqual(result.misfiled, []);
  assert.ok(result.cards.every((c) => c.module === "reveal_cycle"));
});

test("the two stated weights are read off the headings, and only those two", () => {
  const weighted = result.cards.filter((c) => c.weight !== null);
  assert.deepEqual(
    weighted.map((c) => [c.cardCode, c.weight]),
    [["IG-RC01", 3], ["IG-RC10", 2]],
  );
});

test("a weight suffix never leaks into the card's name", () => {
  const rc01 = result.cards.find((c) => c.cardCode === "IG-RC01");
  assert.ok(rc01);
  assert.ok(!/weight/i.test(rc01!.name), `name still carries the weight: ${rc01!.name}`);
  assert.equal(rc01!.name, "IG-RC01 Safety Pre-Pass Precedence");
});

test("SAFETY OVERRIDE is recorded verbatim, not folded into GATE", () => {
  assert.equal(result.interventionTypes["SAFETY OVERRIDE"], 1);
  const rc01 = result.cards.find((c) => c.cardCode === "IG-RC01");
  assert.equal(rc01?.interventionType, "SAFETY OVERRIDE");
});

test("a parenthetical qualifier is stripped from the type but kept in the component", () => {
  const rc02 = result.cards.find((c) => c.cardCode === "H-RC02");
  assert.equal(rc02?.interventionType, "META");
  assert.ok(rc02?.components.intervention_type?.includes("no user-facing output"));
});

test("META cards are filed as gates — they cannot enter the detector", () => {
  for (const code of ["H-RC01", "H-RC02", "H-RC03"]) {
    const card = result.cards.find((c) => c.cardCode === code);
    assert.equal(card?.cardKind, "integrity_gate", `${code} should not be detector-eligible`);
  }
  // And the ones a student's turn genuinely drives stay coaching cards.
  assert.equal(result.cards.find((c) => c.cardCode === "H-RC04")?.cardKind, "coaching_card");
});

test("DOCUMENT CONFLICT — H-RC09's type differs between Doc 1 and v4 canonical", () => {
  /*
   * Doc 1's Reveal Cycle card table files H-RC09 (Null Reveal) as META. The v4
   * canonical document's own intervention_type row says OBSERVE, and v4 is the
   * source this parser reads, so OBSERVE is what comes out.
   *
   * The difference is not cosmetic: META files a card as an integrity gate and
   * keeps it out of the detector catalogue entirely, OBSERVE leaves it a
   * coaching card that a student's turn can fire. A null Reveal is described in
   * §6.11 as "a successful cycle, not a failure" with its own delivered
   * register — which reads like OBSERVE — but the card is also plainly a system
   * decision about whether to deliver anything at all, which reads like META.
   *
   * Pinned here rather than resolved. Whichever way Danielle rules, this test
   * changes with her answer and not before.
   */
  const rc09 = result.cards.find((c) => c.cardCode === "H-RC09");
  assert.equal(rc09?.interventionType, "OBSERVE");
  assert.equal(rc09?.cardKind, "coaching_card");
});

test("no card claims population tags the document never states", () => {
  assert.ok(result.cards.every((c) => c.populationTags.length === 0));
  assert.ok(result.cards.every((c) => c.descriptionFromHeading));
});

test("the document's own §14 count table is read, and disagrees with the tables it contains", () => {
  assert.deepEqual(result.statedCounts, { cards: 13, gates: 12, total: 25 });
  // 13 + 12 = 25 codes in the document; two of the gates are prose only. The
  // difference is the finding, and it is why `specified` exists.
  assert.equal(result.cards.length + result.specified.length, 25);
});

console.log(
  `\n${result.cards.length} carded, ${result.specified.length} specified-only, ${failures} failures\n`,
);
if (failures > 0) process.exit(1);

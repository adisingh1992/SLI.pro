import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INTAKE_SOURCE, parseIntake } from "./parse-intake";
import {
  COMPONENT_KEYS,
  TIER1_MODULES,
  isTier1,
  moduleFromCode,
  parseCompendium,
} from "./parse-compendium";

/**
 * Tests for the intake-module parser.
 *
 * ── WHY THE COUNTS ARE PINNED AGAINST THE REAL DOCUMENT ──────────────────
 * Same reasoning as parse-compendium.test.ts, with one difference that makes it
 * matter more here. The compendium parser anchors on markdown headings, so a
 * malformed card usually fails loudly. This parser anchors on a bare code line
 * followed by `name:` or `gate_type:`, which is a weaker anchor by construction:
 * a reformat that turns `name:` into `**name:**` would silently drop cards and
 * every other number in the pipeline would still look plausible.
 *
 * So the count is pinned at both ends — 29 cards, 13 gates — and the code list
 * is pinned exactly. When Danielle reissues, these fail, and the new numbers get
 * read by a person before anything is seeded.
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

console.log("\nparse-intake\n");

const result = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));

test("42 elements: 29 cards and 13 integrity gates", () => {
  /*
   * Her header says "Total new cards: 42" and breaks it down as 28 heuristic
   * cards + H-019.5 + 13 intake integrity gates. 28 + 1 = 29 cards here, which
   * is the same 42 counted the same way.
   *
   * The compendium parser finds ZERO of them, which is why this file exists.
   */
  assert.equal(result.cards.length, 29);
  assert.equal(result.gates.length, 13);
  assert.equal(result.cards.length + result.gates.length, 42);
});

test("the codes are exactly the range the document declares", () => {
  const expectedCards: string[] = [];
  for (let n = 10; n <= 19; n++) expectedCards.push(`H-0${n}`);
  expectedCards.push("H-019.5");
  for (let n = 20; n <= 37; n++) expectedCards.push(`H-0${n}`);
  assert.deepEqual(result.cards.map((c) => c.cardCode), expectedCards);

  const expectedGates: string[] = [];
  for (let n = 1; n <= 13; n++) expectedGates.push(`IG-INT${n < 10 ? "0" : ""}${n}`);
  assert.deepEqual(result.gates.map((g) => g.cardCode), expectedGates);
});

test("H-019.5 is a card of its own and does not collide with H-019", () => {
  /*
   * The one code the compendium parser cannot represent. Its pattern stops at the
   * word boundary, so `## H-019.5 …` parses as a second H-019 — a collision
   * report where there is no collision, and the reveal-selection logic lost.
   *
   * She numbered it 019.5 to avoid renumbering the fifteen reveal templates
   * below it, which is a good reason, so the code is kept verbatim rather than
   * rounded to a free integer. `card_code` is unconstrained text.
   */
  assert.deepEqual(result.collisions, []);
  const codes = result.cards.map((c) => c.cardCode);
  assert.ok(codes.indexOf("H-019") >= 0);
  assert.ok(codes.indexOf("H-019.5") >= 0);
  assert.equal(moduleFromCode("H-019.5"), "intake");
});

test("every card carries all seven components", () => {
  // 29 cards x 7 rows = 203, which is exactly how many component rows the
  // document contains. Nothing is half-parsed.
  assert.deepEqual(result.incomplete, []);
  for (const c of result.cards) {
    for (const k of COMPONENT_KEYS) assert.ok(c.components[k], `${c.cardCode} missing ${k}`);
  }
});

test("all 42 file to the intake module, and none to universal", () => {
  /*
   * The consequential one. H-010 through H-037 sit in the same hundred as the
   * universal rules, and a `universal` card carries no session scope — it
   * compiles into every prompt Wing assembles. Before moduleFromCode learned the
   * intake range, all 29 derived to universal, which would have fired the party
   * question inside Foundation 2 and put all fifteen reveal templates into every
   * turn of every session.
   */
  assert.deepEqual(result.misfiled, []);
  for (const c of result.cards) assert.equal(c.module, "intake");
  for (const g of result.gates) assert.equal(moduleFromCode(g.cardCode), "intake");
});

test("the compendium claims none of the 42 intake codes", () => {
  /*
   * H-014 and H-021 are deliberate reuses of numbers she retired (Role Sprawl and
   * Dual-Domain Credibility), and this is the check that the retirement really
   * happened before we seed two different cards under one number. It reads the
   * compendium rather than trusting the note in her document.
   */
  const compendium = parseCompendium(
    readFileSync("methodology/wing-master-module-compendium-v2.md", "utf8"),
  );
  const held = new Set(compendium.cards.map((c) => c.cardCode));
  const clash = result.cards
    .map((c) => c.cardCode)
    .concat(result.gates.map((g) => g.cardCode))
    .filter((code) => held.has(code));
  assert.deepEqual(clash, []);
});

test("every tag the document uses resolves to a platform population", () => {
  /*
   * It did not, when this document arrived. Every intake card is tagged with
   * eight audience tracks and the platform could resolve five: her vocabulary
   * splits `entrepreneur` into early, fundraising and scaling, and the platform
   * had one tag for all three. The consequence was specific — H-029 (RT-10
   * Founder-Identity Blur), tagged with the three stages and nothing else, would
   * have reached no founder, silently, because `cardAppliesTo` intersects the
   * sets and an empty intersection looks exactly like a card that does not apply.
   *
   * Fixed in population-tags.ts, where the mapping lives with its reasoning, not
   * here: a parser that rewrote a tag would hide a methodology change inside a
   * parse. This assert is what keeps the next new tag from arriving unnoticed.
   */
  assert.deepEqual(result.unresolvableTags, []);
  const founderBlur = result.cards.find((c) => c.cardCode === "H-029")!;
  assert.deepEqual(founderBlur.populationTags, [
    "entrepreneur_early",
    "entrepreneur_fundraising",
    "entrepreneur_scaling",
  ]);
});

test("the four gates that restate a universal gate name the one they restate", () => {
  /*
   * IG-INT10 to IG-INT13 are intake wordings of platform-wide gates. Compiling
   * both into one prompt would state the same rule twice in different words,
   * which is how a model learns a rule is negotiable — and it costs tokens in
   * the one place the budget is tightest.
   *
   * Note these name IG-U006, IG-U007, IG-U009 and IG-U010: her research-derived
   * gates, not the Module 11 trio that briefly held IG-U006–IG-U008.
   */
  assert.deepEqual(
    result.gates.filter((g) => g.restates).map((g) => [g.cardCode, g.restates]),
    [
      ["IG-INT10", "IG-U006"],
      ["IG-INT11", "IG-U007"],
      ["IG-INT12", "IG-U010"],
      ["IG-INT13", "IG-U009"],
    ],
  );
  for (const g of result.gates) {
    assert.ok(g.rule.length > 40, `${g.cardCode} has no rule text`);
    assert.equal(g.gateType, "Intake integrity gate");
  }
});

test("every intervention type the document declares exists in the enum", () => {
  /*
   * ELICIT and OBSERVE are not in `heuristic_intervention_type` as originally
   * built — migration 0022 adds them. Checked as text against the schema file
   * because the alternative is a seed that fails at insert time on card 6 of 29,
   * long after the parse said everything was fine.
   *
   * Folding them into COACH was the other option and it is the wrong one: 23 of
   * the 29 intake cards would become indistinguishable from Foundation coaching,
   * and "intake does not coach" is the point of the redesign.
   */
  assert.deepEqual(result.interventionTypes, { META: 6, ELICIT: 8, OBSERVE: 15 });

  const schema = readFileSync("shared/wing-schema.ts", "utf8");
  const block = /wing\.enum\("heuristic_intervention_type",\s*\[([\s\S]*?)\]\)/.exec(schema);
  assert.ok(block, "intervention type enum not found in the schema");
  const declared = (block![1].match(/"([A-Z_]+)"/g) ?? []).map((q) => q.replace(/"/g, ""));
  for (const t of Object.keys(result.interventionTypes)) {
    assert.ok(declared.indexOf(t) >= 0, `${t} is not in heuristic_intervention_type`);
  }

  const migration = readFileSync("migrations/0022_intake_intervention_types.sql", "utf8");
  assert.ok(migration.indexOf("'ELICIT'") >= 0);
  assert.ok(migration.indexOf("'OBSERVE'") >= 0);
});

test("the intake module is Tier 1", () => {
  // A1 conversational intake. It has been an open Tier 1 gap since the gap
  // analysis; it had no cards until 18 August.
  assert.ok(TIER1_MODULES.has("intake"));
  for (const c of result.cards) assert.ok(isTier1(c), `${c.cardCode} is not Tier 1`);
});

test("23 cards fire on the student's turn and 6 are delivery rules", () => {
  /*
   * The six are META: the self-introduction, the between-question reaction
   * pattern, the reveal-selection logic, the baseline delivery, the upload
   * request and the Foundation 1 transition. None is something a student says,
   * so none may enter the detector catalogue — same rule that keeps the
   * compendium's gates out of it.
   */
  const kinds: Record<string, number> = {};
  for (const c of result.cards) kinds[c.cardKind] = (kinds[c.cardKind] ?? 0) + 1;
  assert.deepEqual(kinds, { coaching_card: 23, integrity_gate: 6 });
  assert.deepEqual(
    result.cards.filter((c) => c.cardKind === "integrity_gate").map((c) => c.cardCode),
    ["H-010", "H-019", "H-019.5", "H-035", "H-036", "H-037"],
  );
});

test("fourteen cards state no sequence weight, and the document is uneven about it", () => {
  /*
   * Reported, not defaulted. The unweighted fourteen are mostly reveal templates,
   * and the document does give a weight to four of them — 2.0 for RT-01 and
   * RT-08, 1.5 for RT-03, 2.0 for the selection card — so the omission looks like
   * an oversight rather than a decision. It changes nothing yet: the reveal
   * template is chosen by H-019.5 scoring the templates, not by sequence weight.
   * A question for her, not a number for us to invent.
   */
  assert.deepEqual(result.missingWeight, [
    "H-021", "H-023", "H-024", "H-025", "H-026", "H-028", "H-029",
    "H-030", "H-031", "H-032", "H-033", "H-034", "H-035", "H-036",
  ]);
  assert.equal(result.cards.find((c) => c.cardCode === "H-019.5")!.weight, 2);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

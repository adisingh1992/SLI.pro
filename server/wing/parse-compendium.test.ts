import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMPONENT_KEYS,
  TIER1_INCLUDED,
  isTier1,
  moduleFromCode,
  parseCompendium,
  unescapeMd,
} from "./parse-compendium";

/**
 * Tests for the compendium parser (methodology v2 ingest).
 *
 * ── WHY THESE ARE COUNT ASSERTIONS AGAINST THE REAL DOCUMENT ─────────────
 * Same reasoning as the analysis-methodology seed. A parser that silently
 * drops a card is worse than one that crashes: the seed still succeeds, the
 * card count still looks plausible, and a coaching move the methodology owner
 * wrote never fires for any student — with nothing anywhere to say so.
 *
 * So the numbers are pinned. When Danielle revises the compendium these tests
 * fail, and that is the intent: a revision should be a deliberate act with the
 * new counts reviewed and written down, not a silent change in what the
 * platform coaches. The failure message is the diff.
 *
 * ── THE NUMBERS, AND WHY THEY DISAGREE WITH THE DOCUMENT ─────────────────
 * 182 distinct card codes. The compendium's own master count table says 180,
 * and Danielle's final email says 199. Both are hand-maintained and both are
 * wrong in ways this parser can demonstrate — see `check-compendium.ts` output
 * and WING_METHODOLOGY_V2_PLAN.md §3. 182 codes + 2 collided bodies = 184
 * distinct specifications.
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

console.log("\nparse-compendium\n");

const SOURCE = "methodology/wing-master-module-compendium-v2.md";
const result = parseCompendium(readFileSync(SOURCE, "utf8"));

test("markdown escaping is removed before matching", () => {
  // The document escapes underscores, periods and brackets throughout. An
  // early inventory pass matched on the raw text and missed several population
  // tags entirely, which is why this runs before anything else.
  assert.equal(unescapeMd("population\\_tags"), "population_tags");
  assert.equal(unescapeMd("**1\\. signal**"), "**1. signal**");
  assert.equal(unescapeMd('\\["early\\_career"\\]'), '["early_career"]');
});

test("183 distinct card codes, after the approved renames", () => {
  /*
   * 182 until the H-710 correction landed, and 183 after it. Ruling 6 of 18 August
   * renames the Module 7 *gate* to H-711 and leaves the Radar coaching card on H-710 —
   * two cards that used to collide on one code now occupy two, so the distinct count goes
   * up by exactly one. Nothing was added to the document.
   *
   * This assertion read 182 for a week after that rename shipped, which is a fair warning
   * about a count pinned in a comment: the parser was right, the number was stale, and
   * `npm test` was the only thing that would have said so.
   */
  assert.equal(result.cards.length, 183);
});

test("every card carries all seven v2 components", () => {
  // This is the strongest quality signal in the document and the reason the
  // ingest is a parser rather than an extraction: the format is applied without
  // exception across all 182 cards. If this ever fails, the card named in the
  // message is malformed and must be fixed in the source, not worked around.
  assert.deepEqual(result.incomplete, []);
  assert.equal(COMPONENT_KEYS.length, 7);
});

test("21 byte-identical duplicates, from the six pasted boilerplate blocks", () => {
  // The compendium was assembled from six per-module documents and one
  // "Two Module Gap Gates / Two Extension Gates / Updated Gate Library Summary"
  // block came along each time. H-006 appears seven times. Bodies match, so
  // dropping the repeats is safe — that is exactly what makes them duplicates
  // rather than collisions.
  assert.equal(result.duplicates.length, 21);
});

test("one ID collision left: H-411, because H-710's was fixed", () => {
  /*
   * Two genuinely different cards wearing one number each. Never auto-resolved: only the
   * methodology owner can say which card keeps the ID.
   *
   * H-710 was the second of the two and is no longer a collision, because ruling 6 of 18
   * August renamed the Module 7 gate to H-711 and left the Radar coaching card on H-710.
   * The rename is the fix, so the collision going away is the correction working — which
   * is why both codes are asserted present below rather than the pair simply being
   * dropped from the expectation.
   *
   * H-411 stays, and stays deliberately: her instruction was to move that gate to H-412,
   * which is already the Odyssey planning exercise, so applying it literally would
   * recreate the defect. H-408 is recommended and it is waiting on her word.
   */
  assert.deepEqual(
    result.collisions.map((c) => c.cardCode).sort(),
    ["H-411"],
  );
  const codes = new Set(result.cards.map((c) => c.cardCode));
  assert.ok(codes.has("H-710"), "the Radar coaching card keeps H-710");
  assert.ok(codes.has("H-711"), "the Module 7 gate moved to H-711, which is what ended the clash");
});

test("H-411's exercise twin sits in a contiguous run, so the gate is the interloper", () => {
  // H-411..H-416 are the six Module 4 exercise cards. The integrity gate also
  // numbered H-411 is the one that breaks an otherwise complete run, which is
  // the evidence for renumbering the gate rather than the exercise.
  const m4Exercises = ["H-411", "H-412", "H-413", "H-414", "H-415", "H-416"];
  const present = new Set(result.cards.map((c) => c.cardCode));
  for (const code of m4Exercises) assert.ok(present.has(code), `${code} missing`);
});

test("the six universal IG-U gates are six gates, and the leading-zero hazard is gone", () => {
  /*
   * The master count table asserts "Module 10 and 11 share IG-U003–U005 (3 universal
   * gates counted once)". They do not. They were six different gates with six different
   * bodies, filed as three ID pairs differing only by a leading zero — anyone binding to
   * "IG-U04" had even odds of getting the wrong one.
   *
   * That is what the renumbering fixed, and this test now pins the fix rather than the
   * hazard. Module 11's trio is IG-U018–U020 after her allocation rule of 25 August; the
   * document still says IG-U03–U05 and the corrections layer is what moves them, which is
   * why they are absent under their document codes.
   */
  const byCode = new Map(result.cards.map((c) => [c.cardCode, c]));
  const modules10 = ["IG-U003", "IG-U004", "IG-U005"];
  const module11 = ["IG-U018", "IG-U019", "IG-U020"];
  for (const code of modules10.concat(module11)) {
    assert.ok(byCode.has(code), `${code} missing`);
  }
  // Still six bodies, not three counted twice.
  const hashes = new Set(modules10.concat(module11).map((c) => byCode.get(c)!.bodyHash));
  assert.equal(hashes.size, 6, "six distinct gate bodies");

  // And the pairs that differed by one leading zero no longer exist.
  for (const code of ["IG-U03", "IG-U04", "IG-U05"]) {
    assert.ok(!byCode.has(code), `${code} should have been renumbered away`);
  }
});

test("seven intervention types are in use, including GATE", () => {
  // GATE is the one that matters here. The earlier inventory found six values
  // and an `intervention_type` enum built from that list would reject 19 cards
  // at seed time — every IG-* gate in Modules 10 and 11 plus all six universal
  // IG-U gates.
  assert.deepEqual(
    Object.keys(result.interventionTypes).sort(),
    ["AFFIRM", "CHALLENGE", "COACH", "GATE", "META", "REDIRECT", "REFRAME"],
  );
});

test("weights only ever take four values", () => {
  const values = new Set(
    result.cards.map((c) => c.weight).filter((w): w is number => w !== null),
  );
  assert.deepEqual([...values].sort((a, b) => a - b), [0.5, 1, 1.5, 2]);
  // numeric(5,2) accommodates all four, so no schema change is needed.
});

test("H-309 trust vault protection is weight 2.0", () => {
  // The single most consequential number in the Tier 1 slice. Weight 2.0 is how
  // the trust vault rule pre-empts everything else, and weight is currently read
  // by nothing at runtime — so this assertion guards the input to a mechanism
  // that does not exist yet. See WING_TIER1_SCOPE.md T3.
  assert.equal(result.cards.find((c) => c.cardCode === "H-309")!.weight, 2);
});

test("69 cards state no sequence weight", () => {
  // All six universal gates, all seven voice gates and every exercise-library
  // card. Reported rather than defaulted silently: a weight is a methodology
  // decision about precedence, and 1.0 is a guess.
  assert.equal(result.missingWeight.length, 69);
});

test("eight population tags, and the entrepreneur sub-tags are absent", () => {
  assert.deepEqual(Object.keys(result.populationTags).sort(), [
    "career_returner",
    "early_career",
    "entrepreneur",
    "executive",
    "mid_career",
    "mid_career_advancement",
    "mid_career_pivot",
    "undergraduate",
  ]);
  // Danielle asked whether sub-tags are supported. Three already ship. The
  // three entrepreneur variants she asked about appear only in prose and in
  // delivery_adaptation text — never in a populationTags array.
  for (const absent of ["entrepreneur_early", "entrepreneur_fundraising", "entrepreneur_scaling"]) {
    assert.ok(!(absent in result.populationTags), `${absent} unexpectedly tagged`);
  }
});

test("the numbering gaps are the six known ones", () => {
  assert.deepEqual(result.numberingGaps, [
    "H-210", "H-408", "H-409", "H-410", "H-706", "H-707",
  ]);
});

test("H-900 is the universal warm-up, not a Module 9 card", () => {
  // The one place the numbering scheme lies. Deriving modules from card numbers
  // without this exception files the warm-up under power-and-influence coaching.
  assert.equal(moduleFromCode("H-900"), "universal");
  assert.equal(moduleFromCode("H-901"), "module_9");
  assert.equal(moduleFromCode("H-1001"), "module_10");
  assert.equal(moduleFromCode("H-1101"), "module_11");
  assert.equal(moduleFromCode("EX-1101"), "module_11");
});

test("53 cards are in Tier 1 scope", () => {
  // Feature List (May 2026): Section A and B are Tier 1, C is Tier 2, D is
  // Tier 3, and every item in A5 carries its own Tier 2 / Tier 2/3 label. So
  // Foundation 1-3 and the universal gates are in; Modules 4-11 are out.
  // See WING_TIER1_SCOPE.md §2.
  assert.equal(result.cards.filter(isTier1).length, 53);
});

test("Tier 1 excludes H-006 and includes six voice gates by requirement", () => {
  const tier1 = new Set(result.cards.filter(isTier1).map((c) => c.cardCode));
  // Universal in name, Module 8 in fact.
  assert.ok(!tier1.has("H-006"));
  // Filed under "Module 6 Content Production Gates" in the document, required
  // in Tier 1 by A4's 360Brew standard and by H-307's voice-to-text.
  for (const code of Object.keys(TIER1_INCLUDED)) assert.ok(tier1.has(code), code);
  // Module 6 craft with no Tier 1 surface to bind to.
  assert.ok(!tier1.has("IG-V06"));
});

test("the four Foundation gates that must buffer are all present", () => {
  // H-309 and H-005 are the two Tier 1 gates whose violation is unrecoverable,
  // so they are the two that need inspect-then-release rather than prompt-side
  // compilation. H-916 and IG-1102 are the equivalent pair in Modules 9 and 11
  // and defer with them — asserted here so the deferral stays visible.
  const present = new Set(result.cards.map((c) => c.cardCode));
  for (const code of ["H-309", "H-005", "H-916", "IG-1102"]) {
    assert.ok(present.has(code), `${code} missing`);
  }
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

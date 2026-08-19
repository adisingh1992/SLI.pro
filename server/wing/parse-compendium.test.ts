import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMPONENT_KEYS,
  EXERCISE_LIBRARY,
  cardKindOf,
  TIER1_INCLUDED,
  isTier1,
  moduleFromCode,
  parseCompendium,
  unescapeMd,
  CORRECTIONS,
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

test("183 distinct card codes after corrections", () => {
  /*
   * 182 as delivered, 183 parsed. The extra one is not new methodology: H-710 is two
   * different cards, and correcting the gate to H-711 (Danielle, 18 August) means both
   * bodies now survive the parse. Before the correction the parser kept the first and
   * reported the second as a collision, so one real card was unreachable.
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

test("one ID collision left: H-411, held open on purpose", () => {
  /*
   * There were two. H-710 is resolved — the gate is now H-711 per Danielle's ruling,
   * and both bodies parse.
   *
   * H-411 is NOT resolved, and not for want of a ruling. She approved renumbering the
   * gate to H-412, and H-412 is already the Odyssey planning exercise while the same
   * ruling keeps exercise numbers — so the instruction as written recreates the
   * collision it was meant to remove. H-408 is free and recommended. Until she picks a
   * number this stays a collision rather than a guess, and this test is what keeps it
   * visible. See WING_DECISIONS.md §3.
   */
  assert.deepEqual(result.collisions.map((c) => c.cardCode), ["H-411"]);
});

test("H-411's exercise twin sits in a contiguous run, so the gate is the interloper", () => {
  // H-411..H-416 are the six Module 4 exercise cards. The integrity gate also
  // numbered H-411 is the one that breaks an otherwise complete run, which is
  // the evidence for renumbering the gate rather than the exercise.
  const m4Exercises = ["H-411", "H-412", "H-413", "H-414", "H-415", "H-416"];
  const present = new Set(result.cards.map((c) => c.cardCode));
  for (const code of m4Exercises) assert.ok(present.has(code), `${code} missing`);
});

test("the six universal IG-U gates are six gates, and now six unambiguous codes", () => {
  /*
   * They were IG-U003/004/005 and IG-U03/04/05 — three pairs differing only by a
   * leading zero, so anything binding to "IG-U04" had even odds of resolving the wrong
   * card. Danielle approved renumbering the Module 11 trio, which is IG-U03/04/05: they
   * arrive in Part 4 of the Module 11 section, while IG-U003/004/005 were delivered
   * with Module 10, whose own header lists them. v3's summary line says the opposite
   * and is wrong; the email governs.
   *
   * Then the trio moved a SECOND time, the same afternoon. Her research-derived gates
   * claim IG-U006 through IG-U011 for six brand-new universal gates, so IG-U006/007/008
   * became IG-U012/013/014. Both moves are in CORRECTIONS, each quoting the ruling that
   * authorises it, and the earlier codes survive in `supersededFrom` because the seeded
   * rows still answer to them until the corrections script runs.
   *
   * All six still exist and all six are still different cards. No two codes are now one
   * character apart, which was the whole point.
   */
  const byCode = new Map(result.cards.map((c) => [c.cardCode, c]));
  for (const code of ["IG-U003", "IG-U004", "IG-U005", "IG-U012", "IG-U013", "IG-U014"]) {
    assert.ok(byCode.has(code), `${code} missing`);
  }
  for (const gone of ["IG-U03", "IG-U04", "IG-U05"]) {
    assert.equal(byCode.has(gone), false, `${gone} should have been renumbered`);
  }
  assert.notEqual(byCode.get("IG-U004")!.bodyHash, byCode.get("IG-U013")!.bodyHash);
  assert.notEqual(byCode.get("IG-U005")!.bodyHash, byCode.get("IG-U014")!.bodyHash);
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
  assert.deepEqual(Array.from(values).sort((a, b) => a - b), [0.5, 1, 1.5, 2]);
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

test("183 cards split 108 coaching / 56 gate / 19 exercise", () => {
  // One more gate than before: the H-710 gate body, recovered by renumbering it to
  // H-711 rather than dropping it as a duplicate.
  const kinds: Record<string, number> = {};
  for (const c of result.cards) kinds[c.cardKind] = (kinds[c.cardKind] ?? 0) + 1;
  assert.deepEqual(kinds, { coaching_card: 108, integrity_gate: 56, exercise: 19 });
  assert.equal(EXERCISE_LIBRARY.size, 19);
});

test("Tier 1 is 22 coaching cards, 24 gates and 7 exercises", () => {
  const kinds: Record<string, number> = {};
  for (const c of result.cards.filter(isTier1)) kinds[c.cardKind] = (kinds[c.cardKind] ?? 0) + 1;
  assert.deepEqual(kinds, { coaching_card: 22, integrity_gate: 24, exercise: 7 });
});

test("every correction is applied, and each one cites its authority", () => {
  /*
   * The corrections exist because compendium v3 does not contain them: 182 cards in v2
   * and v3, identical code sets, and not one of the 182 bodies changed between them —
   * while v3 carries a section claiming they were applied. This test is the thing that
   * fails when a reissued compendium finally does carry a change, which is the signal
   * to delete that entry from CORRECTIONS.
   */
  const byCode = new Map(result.cards.map((c) => [c.cardCode, c]));

  assert.ok(byCode.has("H-007"), "H-308 should be H-007");
  assert.equal(byCode.has("H-308"), false);
  assert.equal(byCode.get("H-007")!.module, "universal");
  // The name must not keep the code it was corrected away from.
  assert.equal(byCode.get("H-007")!.name.indexOf("H-308"), -1);

  assert.ok(byCode.has("H-711"));
  assert.equal(byCode.get("H-711")!.cardKind, "integrity_gate");
  // The card that keeps its number is the Radar coaching card.
  assert.equal(byCode.get("H-710")!.cardKind, "coaching_card");

  assert.equal(byCode.get("H-916")!.interventionType, "META");

  for (const c of CORRECTIONS) {
    /*
     * Either the entry quotes her, or it defers to the sibling entry that does.
     * Matched on a pattern rather than one exact phrase: this assert failed the
     * moment the Module 11 trio needed "Same two rulings" instead of "Same
     * ruling", which is the test being brittle, not the correction being wrong.
     */
    assert.ok(/Danielle|Same (?:ruling|two rulings)\b/.test(c.why), c.why);
    assert.ok(c.why.length > 40);
  }
});

test("the compendium claims none of IG-U006 through IG-U011", () => {
  /*
   * Those six belong to Danielle's research-derived gates: Barnum falsifiability,
   * observation precision, competence→gap→fixable, resistance is diagnostic,
   * quote-then-extend, session close consolidation. No card in the compendium may
   * hold one, because two different rules under one number is the exact defect the
   * renumbering existed to remove — and we walked into it once already, taking
   * IG-U006–IG-U008 for the Module 11 trio hours before her document arrived.
   *
   * If this fails, a correction is pointing at a code that is already spoken for.
   */
  const claimed = ["IG-U006", "IG-U007", "IG-U008", "IG-U009", "IG-U010", "IG-U011"];
  assert.deepEqual(
    result.cards.filter((c) => claimed.indexOf(c.cardCode) >= 0).map((c) => c.cardCode),
    [],
  );
});

test("a code we vacated is not reported as a numbering gap", () => {
  // Moving H-308 to H-007 leaves a hole in the Foundation 3 run. Reporting our own
  // approved decision as a defect is how a defect report becomes noise.
  assert.equal(result.numberingGaps.indexOf("H-308"), -1);
  assert.deepEqual(result.numberingGaps, ["H-210", "H-408", "H-409", "H-410", "H-706", "H-707"]);
});

test("no gate is ever classified as a coaching card", () => {
  // The property the whole discriminator exists for. A gate in the detector
  // catalogue asks the model to match a rule about Wing's output against the
  // student's words, which is not a degraded engine but a wrong one.
  for (const c of result.cards) {
    if (c.interventionType === "META" || c.interventionType === "GATE") {
      assert.equal(c.cardKind, "integrity_gate", `${c.cardCode} misclassified`);
    }
  }
});

test("H-916's mistyped intervention_type does not make it a coaching card", () => {
  // H-916 "Experiment Safety Check" sits under "Source Integrity → Codeable
  // Quality Gates" and declares COACH. Module 9 is the only module that tells a
  // user to change their behaviour at work this week, and H-916 is the gate that
  // checks the instruction is safe to give. Deriving kind from intervention_type
  // alone would load it as a student-turn signal. This is a document defect —
  // when Danielle fixes it this test still passes, which is the intent.
  assert.equal(cardKindOf("H-916", "COACH", "Section 1: Source Integrity → Codeable Quality Gates"), "integrity_gate");
  assert.equal(result.cards.find((c) => c.cardCode === "H-916")!.cardKind, "integrity_gate");
});

test("three cards disagree about their own kind, and H-916 no longer does", () => {
  /*
   * It was four. H-916 declared COACH while sitting among Module 9's system rules —
   * a safety check filed as a user-facing coaching move. Danielle confirmed the slip
   * and the correction now sets META before the kind is resolved, which is why it has
   * left this list.
   *
   * The remaining three are cosmetic: H-007, H-703 and H-709 declare META and are
   * classified as gates, correctly. What "disagrees" is the section heading they
   * happen to sit under, which is not a property of the card.
   */
  assert.deepEqual(
    result.kindDisagreements.map((d) => d.cardCode).sort(),
    ["H-007", "H-703", "H-709"],
  );
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

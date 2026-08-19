import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  METHODOLOGY_POPULATIONS,
  cardAppliesTo,
  populationTagsFor,
  type Pathway,
  type ProfessionalStatus,
} from "./population-tags";
import { isTier1, parseCompendium } from "./parse-compendium";

/**
 * Tests for population resolution (methodology v2, T3).
 *
 * The interesting test is the last one. Everything above it checks the mapping
 * says what it means to say; the reachability property checks the mapping is
 * ADEQUATE — that no seeded card is invisible to every student the platform can
 * describe. A card nobody can ever be shown is the failure this table exists to
 * prevent, and it is not detectable by reading either the mapping or the cards
 * on their own.
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

console.log("\npopulation-tags\n");

test("the eleven methodology populations are the ones the cards use", () => {
  // Eight from the compendium, three funding stages from the intake module of
  // 18 August. The union, because neither document uses all eleven.
  assert.equal(METHODOLOGY_POPULATIONS.length, 11);
});

test("the two lossy statuses each yield two tags", () => {
  // The source data conflates populations the methodology separates, so the
  // mapping cannot narrow further than the data does.
  assert.deepEqual(populationTagsFor("undergraduate_or_recent_grad", "employment"), [
    "undergraduate",
    "early_career",
  ]);
  assert.deepEqual(populationTagsFor("mid_career_or_senior", "employment"), [
    "mid_career",
    "executive",
  ]);
});

test("early_career is exact", () => {
  assert.deepEqual(populationTagsFor("early_career", "employment"), ["early_career"]);
});

test("career_break_or_transition yields career_returner and mid_career", () => {
  assert.deepEqual(populationTagsFor("career_break_or_transition", "employment"), [
    "career_returner",
    "mid_career",
  ]);
});

test("a founder reaches the one reveal template written for founders", () => {
  /*
   * H-029 (RT-10 Founder-Identity Blur) is tagged with the three funding stages
   * and nothing else. Before the stages were mapped, this card reached no student
   * at all: the platform emitted `entrepreneur`, the card asked for
   * `entrepreneur_early`, and an empty intersection is indistinguishable from a
   * card that does not apply. The failure would have been silent.
   */
  const founderBlur = ["entrepreneur_early", "entrepreneur_fundraising", "entrepreneur_scaling"];
  for (const pathway of ["venture", "freelance"] as Pathway[]) {
    const statuses: ProfessionalStatus[] = [
      "undergraduate_or_recent_grad",
      "early_career",
      "mid_career_or_senior",
      "career_break_or_transition",
    ];
    for (const status of statuses) {
      assert.equal(cardAppliesTo(founderBlur, populationTagsFor(status, pathway)), true);
    }
  }
  // And still reaches nobody who is not building something.
  assert.equal(
    cardAppliesTo(founderBlur, populationTagsFor("mid_career_or_senior", "employment")),
    false,
  );
});

test("pathway venture and freelance both add entrepreneur", () => {
  // `entrepreneur` is derivable today — this is the tag an earlier read of the
  // schema said was impossible to produce. career_pathway already exists, and
  // the conversational intake already asks for it.
  assert.ok(populationTagsFor("early_career", "venture").indexOf("entrepreneur") >= 0);
  assert.ok(populationTagsFor("early_career", "freelance").indexOf("entrepreneur") >= 0);
  assert.ok(populationTagsFor("early_career", "employment").indexOf("entrepreneur") < 0);
});

test("the entrepreneur sub-tags are deliberately unmapped", () => {
  // Nothing in the platform distinguishes a pivot from an advancement, and no
  // seeded Tier 1 card needs the distinction — the three that carry them also
  // list every other population.
  const every: string[] = [];
  const statuses: ProfessionalStatus[] = [
    "undergraduate_or_recent_grad", "early_career",
    "mid_career_or_senior", "career_break_or_transition",
  ];
  const pathways: Pathway[] = ["employment", "venture", "freelance"];
  for (const s of statuses) {
    for (const p of pathways) every.push(...populationTagsFor(s, p));
  }
  assert.ok(every.indexOf("mid_career_pivot") < 0);
  assert.ok(every.indexOf("mid_career_advancement") < 0);
});

test("nothing known yields no tags", () => {
  assert.deepEqual(populationTagsFor(null, null), []);
  assert.deepEqual(populationTagsFor(undefined, undefined), []);
});

test("an untagged card is universal", () => {
  assert.equal(cardAppliesTo([], ["executive"]), true);
  assert.equal(cardAppliesTo(null, ["executive"]), true);
  assert.equal(cardAppliesTo(undefined, []), true);
});

test("a student with no resolved tags fails OPEN", () => {
  // A student mid-intake has no status yet. Failing closed would leave the
  // students at the very start of Foundation 1 with only the untagged cards,
  // silently. Over-inclusion costs a card in the wrong register; under-inclusion
  // loses coaching that should have happened.
  assert.equal(cardAppliesTo(["executive"], []), true);
});

test("otherwise the tag sets must intersect", () => {
  assert.equal(cardAppliesTo(["executive"], ["mid_career", "executive"]), true);
  assert.equal(cardAppliesTo(["undergraduate"], ["mid_career", "executive"]), false);
  assert.equal(cardAppliesTo(["entrepreneur"], ["early_career"]), false);
});

test("H-105, H-107, H-206, H-108 and H-205 reach exactly who they should", () => {
  // The five single-population cards in the Tier 1 set — the only ones where
  // resolution changes what a student is shown.
  const undergrad = populationTagsFor("undergraduate_or_recent_grad", "employment");
  const founder = populationTagsFor("early_career", "venture");
  const senior = populationTagsFor("mid_career_or_senior", "employment");

  assert.equal(cardAppliesTo(["undergraduate"], undergrad), true);
  assert.equal(cardAppliesTo(["undergraduate"], senior), false);
  assert.equal(cardAppliesTo(["entrepreneur"], founder), true);
  assert.equal(cardAppliesTo(["entrepreneur"], undergrad), false);
  assert.equal(cardAppliesTo(["executive"], senior), true);
  assert.equal(cardAppliesTo(["executive"], undergrad), false);
});

test("every seeded Tier 1 card is reachable by some real student", () => {
  /*
   * The adequacy property. A card the mapping can never surface is worse than a
   * missing card: it is present in the admin editor, it looks published, and it
   * silently never fires. Checked against the actual document rather than a
   * fixture, so a revision that introduces an unreachable tag fails here.
   */
  const parsed = parseCompendium(
    readFileSync("methodology/wing-master-module-compendium-v2.md", "utf8"),
  );
  const tier1 = parsed.cards.filter(isTier1);
  assert.equal(tier1.length, 53);

  const statuses: ProfessionalStatus[] = [
    "undergraduate_or_recent_grad", "early_career",
    "mid_career_or_senior", "career_break_or_transition",
  ];
  const pathways: Pathway[] = ["employment", "venture", "freelance"];

  const profiles: string[][] = [];
  for (const s of statuses) {
    for (const p of pathways) profiles.push(populationTagsFor(s, p));
  }

  const unreachable = tier1.filter(
    (card) => !profiles.some((tags) => cardAppliesTo(card.populationTags, tags)),
  );

  assert.deepEqual(
    unreachable.map((c) => `${c.cardCode} [${c.populationTags.join(",")}]`),
    [],
  );
});

test("no student profile is left with fewer than 40 of the 53 cards", () => {
  /*
   * The other half of adequacy. Reachability alone would be satisfied by a
   * mapping that gave one student 53 cards and another 21; this bounds the
   * narrowest profile. 46 is the observed floor — early_career on the employment
   * path, which is the least-tagged combination — so 40 leaves headroom for a
   * revision without silently tolerating a collapse.
   */
  const parsed = parseCompendium(
    readFileSync("methodology/wing-master-module-compendium-v2.md", "utf8"),
  );
  const tier1 = parsed.cards.filter(isTier1);

  const statuses: ProfessionalStatus[] = [
    "undergraduate_or_recent_grad", "early_career",
    "mid_career_or_senior", "career_break_or_transition",
  ];
  const pathways: Pathway[] = ["employment", "venture", "freelance"];

  for (const s of statuses) {
    for (const p of pathways) {
      const tags = populationTagsFor(s, p);
      const n = tier1.filter((c) => cardAppliesTo(c.populationTags, tags)).length;
      assert.ok(n >= 40, `${s} + ${p} reaches only ${n} card(s)`);
    }
  }
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

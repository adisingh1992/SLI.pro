import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  intakeCardToSeed,
  intakeGateToSeed,
  moduleGateToSeed,
  seedRows,
  universalGateToSeed,
  type SeedCard,
} from "./seed-shared";
import { INTAKE_SOURCE, parseIntake } from "./parse-intake";
import { RESEARCH_GATES_SOURCE, parseResearchGates } from "./parse-research-gates";
import { isTier1, parseCompendium } from "./parse-compendium";
import { missingTypes } from "./seed-preflight";

/**
 * Tests for what the seeders would write.
 *
 * ── WHY THE MAPPING LIVES OUTSIDE THE SEEDERS ────────────────────────────
 * A seeder needs a database and a Key Vault secret, so it cannot run on a
 * developer machine or in CI here — which means without this file the only
 * environment that ever exercises the mapping is production. So the mapping is
 * pure functions in seed-shared.ts and the seeders only do the inserting.
 *
 * What these assertions are protecting is narrow and specific: several of these
 * cards arrive with one component out of seven, and the temptation at insert time
 * is to fill a NOT NULL column with something reasonable. Every fallback that
 * exists is named here, and every absence is asserted as an absence.
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

console.log("\nseed-mappings\n");

const intake = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));
const research = parseResearchGates(readFileSync(RESEARCH_GATES_SOURCE, "utf8"));

// Arrows: both take an optional source-document argument, and `.map` would pass
// the array index into it.
const intakeSeeds: SeedCard[] = intake.cards
  .map((c) => intakeCardToSeed(c))
  .concat(intake.gates.map((g) => intakeGateToSeed(g)));
const gateSeeds: SeedCard[] = research.universalGates
  .map(universalGateToSeed)
  .concat(research.moduleGates.filter(isTier1).map(moduleGateToSeed));
const all = intakeSeeds.concat(gateSeeds);

function componentsOf(seed: SeedCard): string[] {
  return seedRows(seed).components.map((c) => c.componentType);
}

test("50 elements and 311 component rows", () => {
  // 41 intake + 6 universal gates + H-111, H-210, H-315. H-616 and H-923 defer
  // with Modules 6 and 9.
  //
  // 51 and 319 under v1.1. RT-14's retirement removes one card and its eight rows.
  assert.equal(intakeSeeds.length, 41);
  assert.equal(gateSeeds.length, 9);
  assert.equal(all.length, 50);
  assert.equal(all.reduce((n, s) => n + seedRows(s).components.length, 0), 311);
});

test("every element lands as a candidate, in no sequence", () => {
  /*
   * The one property that makes seeding safe to run before anyone has reviewed a
   * word of it. `getSequenceCards` can only return cards a sequence contains, and
   * nothing here joins a sequence — so publishing stays a separate, deliberate act
   * even if this script runs by accident.
   */
  for (const s of all) assert.equal(seedRows(s).heuristic.status, "candidate");
});

test("no card code is claimed twice, across all three documents", () => {
  /*
   * `heuristics.card_code` is UNIQUE, so a duplicate is not a warning — it aborts
   * the insert partway through a run and leaves half a document seeded. Checked
   * against the compendium too, because H-014 and H-021 are numbers she retired
   * and reused.
   */
  const compendium = parseCompendium(
    readFileSync("methodology/wing-master-module-compendium-v2.md", "utf8"),
  );
  const seen = new Set<string>(compendium.cards.map((c) => c.cardCode));
  for (const s of all) {
    assert.equal(seen.has(s.cardCode), false, `${s.cardCode} is claimed twice`);
    seen.add(s.cardCode);
  }
  assert.ok(seen.has("H-019.5"), "the decimal code did not survive into a row");
});

test("intervention_type is null exactly where the document states none", () => {
  /*
   * 19 of the 51: the 13 intake gates and the 6 universal gates, neither of which
   * declares one. The column is nullable precisely for cards that were never
   * classified, and `card_kind` — not the classifier — is what keeps a gate out of
   * the detector catalogue. So a null here costs nothing and a guess would cost
   * the ability to tell her classification from ours.
   */
  const nulls = all.filter((s) => s.interventionType === null).map((s) => s.cardCode);
  assert.equal(nulls.length, 19);
  for (const code of nulls) assert.ok(/^IG-(?:INT|U)/.test(code), `${code} should declare a type`);
  assert.deepEqual(
    all.filter((s) => s.interventionType === "COACH").map((s) => s.cardCode),
    ["H-315"],
  );
});

test("the six universal gates carry the two components the document supplies", () => {
  for (const g of research.universalGates) {
    const seed = universalGateToSeed(g);
    // All six, IG-U010 included: its Part A entry states that no adaptation is
    // needed, and that statement is the field's content.
    assert.deepEqual(
      componentsOf(seed),
      ["coaching_move", "delivery_adaptation", "module_mapping", "notes"],
      g.cardCode,
    );
    assert.ok(
      seed.notes.indexOf("Components the source does not supply: signal, detection_method") >= 0,
      `${g.cardCode} notes do not name the absent components`,
    );
    // The description is her own "What it enforces" paragraph, not the title.
    assert.notEqual(seed.description, seed.name, g.cardCode);
    assert.ok(seed.description.length > 80, g.cardCode);
  }
  // IG-U010's delivery_adaptation is her statement that none is needed, which is
  // an answer — so the field is present rather than absent.
  const u010 = universalGateToSeed(
    research.universalGates.filter((g) => g.cardCode === "IG-U010")[0],
  );
  assert.ok((u010.components.delivery_adaptation ?? "").indexOf("No audience-specific") === 0);
});

test("an intake gate is one rule and six named absences", () => {
  for (const g of intake.gates) {
    const seed = intakeGateToSeed(g);
    assert.deepEqual(componentsOf(seed), ["coaching_move", "module_mapping", "notes"], g.cardCode);
    assert.equal(seed.components.coaching_move, g.rule);
    assert.ok(seed.notes.indexOf("gate_type: Intake integrity gate") >= 0, g.cardCode);
    assert.ok(
      seed.notes.indexOf("does not supply: signal, detection_method, intervention_type, " +
        "delivery_adaptation, success_criteria, failure_path") >= 0,
      g.cardCode,
    );
  }
});

test("the four intake gates that restate a universal gate say so in their notes", () => {
  const restating = intake.gates.filter((g) => g.restates);
  assert.equal(restating.length, 4);
  for (const g of restating) {
    const seed = intakeGateToSeed(g);
    assert.ok(
      seed.notes.indexOf(`Restates ${g.restates} for intake`) >= 0,
      `${g.cardCode} does not name ${g.restates}`,
    );
  }
});

test("every description is non-empty, and the fallbacks are named", () => {
  /*
   * `description` is NOT NULL. Three cards fall back to their own title — H-111,
   * H-210 and H-315, whose Part B entries are a heading and a table with no
   * description line. Their headings describe them accurately, so reusing one
   * invents nothing; the list is asserted so a fourth fallback cannot appear
   * quietly.
   */
  for (const s of all) assert.ok(s.description.length > 0, s.cardCode);
  assert.deepEqual(
    all.filter((s) => s.description === s.name).map((s) => s.cardCode),
    ["H-111", "H-210", "H-315"],
  );
});

test("every notes block cites the document and the line it came from", () => {
  for (const s of all) {
    const cites =
      s.notes.indexOf(`Source: ${INTAKE_SOURCE}, line `) >= 0 ||
      s.notes.indexOf(`Source: ${RESEARCH_GATES_SOURCE}, line `) >= 0;
    assert.ok(cites, `${s.cardCode} notes do not cite a source line`);
    assert.ok(
      s.notes.indexOf("a re-run of the seed will not overwrite an existing card") >= 0,
      `${s.cardCode} notes do not warn about divergence`,
    );
  }
});

test("every intervention type the seeds need is in the schema enum", () => {
  /*
   * `wing:seed-intake` was run once against a database without ELICIT in the enum.
   * It committed H-010, threw on H-011, and reported the failure as an enum error
   * at card 2 of 42 — a partial write caused by a precondition nobody checked.
   * `assertInterventionTypes` now refuses before the first insert.
   *
   * This is the compile-time half of the same guard: if a future document arrives
   * declaring a type the schema does not have, it fails here rather than partway
   * through a seed against a real database.
   */
  const needed: string[] = [];
  for (const seed of all) {
    if (seed.interventionType && needed.indexOf(seed.interventionType) < 0) {
      needed.push(seed.interventionType);
    }
  }
  assert.deepEqual(needed.slice().sort(), ["COACH", "ELICIT", "META", "OBSERVE"]);

  const schema = readFileSync("shared/wing-schema.ts", "utf8");
  const block = /wing\.enum\("heuristic_intervention_type",\s*\[([\s\S]*?)\]\)/.exec(schema);
  assert.ok(block, "intervention type enum not found in the schema");
  const declared = (block![1].match(/"([A-Z_]+)"/g) ?? []).map((q) => q.replace(/"/g, ""));
  assert.deepEqual(missingTypes(declared, needed), []);
});

test("the preflight reports exactly what is missing, once each", () => {
  const have = ["COACH", "META", "GATE"];
  assert.deepEqual(missingTypes(have, ["META", "ELICIT", "OBSERVE"]), ["ELICIT", "OBSERVE"]);
  assert.deepEqual(missingTypes(have, ["ELICIT", "ELICIT"]), ["ELICIT"]);
  assert.deepEqual(missingTypes(have, ["COACH"]), []);
  // An empty enum — the type does not exist — reports everything rather than nothing.
  assert.deepEqual(missingTypes([], ["META"]), ["META"]);
});

test("no component row is empty or whitespace", () => {
  // An empty string in a component row is worse than no row: it renders as a
  // blank section in a prompt and reads as a component that exists and says
  // nothing.
  for (const s of all) {
    for (const row of seedRows(s).components) {
      assert.ok(row.content.trim().length > 0, `${s.cardCode} ${row.componentType} is empty`);
    }
  }
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

import assert from "node:assert/strict";
import { collectLibrary } from "./collect-library";
import { RESERVED_CODES, RETIRED_CODES } from "./parse-registry";

/**
 * Tests for the whole-library collection.
 *
 * This is the last thing that runs before rows reach a database, and the only
 * thing between the documents and an insert, so the cases here are about what
 * must NOT happen: no code seeded twice, no code seeded from the older of two
 * documents that both describe it, no intervention_type that the enum cannot
 * store, and no row invented for an element no document supplies.
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

console.log("\ncollect-library\n");

const result = collectLibrary();
const byCode = new Map(result.elements.map((e) => [e.seed.cardCode, e]));

test("every code appears exactly once", () => {
  const codes = result.elements.map((e) => e.seed.cardCode);
  assert.equal(new Set(codes).size, codes.length);
});

test("the three gates no document supplies are placeholders, with no rule invented", () => {
  assert.deepEqual(result.unsourced, [], "they are seeded, so nothing is unsourced now");
  for (const code of ["IG-S04", "IG-S05", "IG-S10"]) {
    const e = byCode.get(code);
    assert.ok(e, `${code} should be visible in the panel`);
    assert.deepEqual(e!.seed.components, {}, `${code} must carry no rule — we do not have one`);
    assert.equal(e!.seed.cardKind, "integrity_gate");
    assert.ok(/TEXT NOT AVAILABLE/.test(e!.seed.notes));
    assert.ok(/Safety_Architecture/.test(e!.seed.notes));
    // Not retired: Doc 2 §5 marks all three DELIVERED. Empty is honest; withdrawn is not.
    assert.equal(e!.status, "candidate");
  }
});

test("H-019.5 is the only row the registry never names", () => {
  assert.deepEqual(result.surplus, ["H-019.5"]);
  assert.ok(byCode.has("H-019.5"), "it is a real intake card and must still be seeded");
});

test("a newer module document beats the compendium for a shared code", () => {
  // H-701 is the compendium's "Radar weekly brief generation" and the content
  // system's Baby Radar rewrite. The 1 September rewrite is the one that ships.
  assert.equal(byCode.get("H-701")?.source, "content system v1");
  // The intake module owns its whole band, not the compendium.
  assert.equal(byCode.get("H-010")?.source, "intake v1.8");
  assert.equal(byCode.get("H-1301")?.source, "module 13 v1.2");
});

test("a declared decision outranks the document that still carries the old text", () => {
  for (const code of Object.keys(RETIRED_CODES)) {
    assert.equal(byCode.get(code)?.status, "retired", `${code} should be retired`);
  }
  for (const code of Object.keys(RESERVED_CODES)) {
    assert.equal(byCode.get(code)?.status, "retired", `${code} should be inert`);
    assert.ok(
      /Reserved is not retired/.test(byCode.get(code)!.seed.notes),
      `${code} must say in its notes that reserved is not retired`,
    );
  }
});

test("only the codes that hold a number are inert; everything else is candidate", () => {
  const retired = result.elements.filter((e) => e.status === "retired").map((e) => e.seed.cardCode);
  assert.deepEqual(retired.sort(), ["H-033", "H-706", "H-707", "IG-RC11", "IG-RC12"]);
});

test("every intervention_type is storable, and the one normalisation is logged", () => {
  const allowed = new Set([
    "COACH", "CHALLENGE", "REDIRECT", "REFRAME", "AFFIRM", "META", "GATE",
    "ELICIT", "OBSERVE", "EDUCATE", "SAFETY_OVERRIDE",
  ]);
  for (const e of result.elements) {
    const t = e.seed.interventionType;
    if (t !== null) assert.ok(allowed.has(t), `${e.seed.cardCode} declares "${t}"`);
  }
  assert.deepEqual(result.normalisedTypes, [
    { cardCode: "IG-RC01", from: "SAFETY OVERRIDE", to: "SAFETY_OVERRIDE" },
  ]);
});

test("a source that states no description reuses the name, and says how often", () => {
  // seed-compendium.ts's precedent: the compendium gives the name/description
  // metadata line to coaching cards only, so gates arrive with a title and no
  // description. `description` is NOT NULL and a gate's title describes it
  // accurately, so reusing it invents nothing — but 84 rows is too many to
  // reshape silently, which is why the list comes back on the result.
  assert.ok(result.descriptionFromName.length > 0);
  assert.ok(result.descriptionFromName.includes("EX-1101"));
  for (const code of result.descriptionFromName) {
    const e = byCode.get(code);
    assert.ok(e, `${code} is listed as description-from-name but is not in the library`);
    assert.equal(e!.seed.description, e!.seed.name);
  }
});

test("every row has a code, a name, a description and a provenance block", () => {
  for (const e of result.elements) {
    assert.ok(e.seed.cardCode, "missing code");
    assert.ok(e.seed.name, `${e.seed.cardCode} has no name`);
    assert.ok(e.seed.description, `${e.seed.cardCode} has no description`);
    assert.ok(e.seed.notes.length > 80, `${e.seed.cardCode} has no provenance block`);
  }
});

test("no gate is filed as a coaching card, and no card as a gate by accident", () => {
  for (const e of result.elements) {
    if (/^IG-/.test(e.seed.cardCode)) {
      assert.equal(
        e.seed.cardKind,
        "integrity_gate",
        `${e.seed.cardCode} carries an IG- prefix and must never enter the detector`,
      );
    }
  }
});

test("a rule-only gate carries the rule and says which components are absent", () => {
  const mj05 = byCode.get("IG-MJ05");
  assert.ok(mj05);
  assert.ok(mj05!.seed.components.coaching_move?.startsWith("Maximum 1 prompt per day"));
  assert.equal(Object.keys(mj05!.seed.components).length, 1);
  assert.ok(/Components the source does not supply/.test(mj05!.seed.notes));
});

test("a safety row says that editing it changes nothing", () => {
  const s01 = byCode.get("IG-S01");
  assert.ok(s01);
  assert.ok(/does not change what Wing does/.test(s01!.seed.notes));
  assert.ok(s01!.seed.components.coaching_move!.length > 200);
});

console.log(
  `\n${result.elements.length} elements, ${result.unsourced.length} unsourced, ${failures} failures\n`,
);
if (failures > 0) process.exit(1);

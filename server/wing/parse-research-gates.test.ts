import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RESEARCH_GATES_SOURCE,
  UNIVERSAL_GATE_GAPS,
  parseResearchGates,
} from "./parse-research-gates";
import { COMPONENT_KEYS, isTier1, parseCompendium } from "./parse-compendium";
import { INTAKE_SOURCE, parseIntake } from "./parse-intake";

/**
 * Tests for the research-derived gates document.
 *
 * ── WHAT THESE ARE FOR ───────────────────────────────────────────────────
 * Two jobs. The first is the usual one: pin the counts so a reissue is a
 * deliberate act rather than a silent change in what the platform enforces.
 *
 * The second is unusual and matters more. Five of the seven components are
 * missing from all six universal gates, and the temptation is to fill them in
 * from the prose — "where it fires hardest" reads a little like a signal, a
 * failure path could be inferred. These tests hold the gap open. If someone
 * later maps a sixth field, `UNIVERSAL_GATE_GAPS` and this file are what they
 * have to change on purpose, in the open, with a reason.
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

console.log("\nparse-research-gates\n");

const result = parseResearchGates(readFileSync(RESEARCH_GATES_SOURCE, "utf8"));

test("six universal gates, five module gates, six behavioural rules", () => {
  /*
   * Her summary table lists 11 gates and 3 behavioural rules, then Part C adds
   * three more rules without updating the table. Six is what the document
   * contains; the "New platform total if all accepted: 207" line counts three.
   * See WING_DECISIONS.md §2b — the running totals do not reconcile.
   */
  assert.equal(result.universalGates.length, 6);
  assert.equal(result.moduleGates.length, 5);
  assert.equal(result.behaviouralRules.length, 6);
});

test("the codes are IG-U006 to IG-U011 and the five module gates she named", () => {
  assert.deepEqual(
    result.universalGates.map((g) => g.cardCode),
    ["IG-U006", "IG-U007", "IG-U008", "IG-U009", "IG-U010", "IG-U011"],
  );
  assert.deepEqual(
    result.moduleGates.map((g) => g.cardCode),
    ["H-111", "H-210", "H-315", "H-616", "H-923"],
  );
});

test("no other document claims any of the eleven codes", () => {
  /*
   * The check that would have caught the collision the morning of 18 August, when
   * the Module 11 trio was renamed into IG-U006–IG-U008 hours before this document
   * arrived claiming them. It reads all three sources rather than trusting any
   * one of their summaries.
   *
   * H-111 deserves a note: Module 11 uses four-digit codes, so H-111 is a string
   * PREFIX of the existing H-1110 to H-1114. Not a collision — different codes —
   * but any lookup written as `LIKE 'H-111%'` would match five wrong cards.
   */
  const compendium = parseCompendium(
    readFileSync("methodology/wing-master-module-compendium-v2.md", "utf8"),
  );
  const intake = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));
  const held = new Set<string>(
    compendium.cards
      .map((c) => c.cardCode)
      .concat(intake.cards.map((c) => c.cardCode))
      .concat(intake.gates.map((g) => g.cardCode)),
  );
  const ours = result.universalGates
    .map((g) => g.cardCode)
    .concat(result.moduleGates.map((g) => g.cardCode));
  assert.deepEqual(ours.filter((code) => held.has(code)), []);

  // The prefix hazard, asserted so it stays known rather than remembered.
  assert.ok(compendium.cards.some((c) => c.cardCode === "H-1110"));
  assert.equal(compendium.cards.some((c) => c.cardCode === "H-111"), false);
});

test("every universal gate has the rule the label table names", () => {
  // The parser throws if RULE_LABEL names a label the document does not have, so
  // reaching this line at all is half the assertion.
  for (const g of result.universalGates) {
    assert.ok(g.rule.length > 80, `${g.cardCode} rule is too short to be the rule`);
    assert.ok(g.ruleLabel.length > 0);
    assert.ok(
      g.fields.some((f) => f.label === g.ruleLabel),
      `${g.cardCode}: ${g.ruleLabel} not among ${g.fields.map((f) => f.label).join(" / ")}`,
    );
  }
  // Three of the six use a label other than "The rule", which is why the label is
  // named per gate instead of matched by pattern.
  assert.deepEqual(
    result.universalGates.filter((g) => g.ruleLabel !== "The rule").map((g) => [g.cardCode, g.ruleLabel]),
    [
      ["IG-U008", "The sequence"],
      ["IG-U010", "The structural pattern"],
    ],
  );
});

test("five of the seven components are missing from all six universal gates", () => {
  /*
   * The finding this file exists to keep visible. Danielle can supply five rows
   * per gate; nobody can un-invent a failure_path we made up. Until she does,
   * these six cannot be seeded as cards — they have a rule and an audience
   * adaptation and nothing else.
   */
  assert.deepEqual(UNIVERSAL_GATE_GAPS.slice(), [
    "signal",
    "detection_method",
    "intervention_type",
    "success_criteria",
    "failure_path",
  ]);
  assert.equal(UNIVERSAL_GATE_GAPS.length + 2, COMPONENT_KEYS.length);
  for (const g of result.universalGates) {
    assert.deepEqual(g.missingComponents, UNIVERSAL_GATE_GAPS.slice());
  }
});

test("Part A supplies the delivery adaptation, and says so when it does not", () => {
  /*
   * Part A is titled "Audience Delivery Adaptations", which is `delivery_
   * adaptation` by another name — the second of the two components the document
   * does supply. IG-U010 is the exception and states it outright, so an empty
   * note list there is an answer and not a parse failure.
   */
  const withNotes = result.universalGates.filter((g) => g.audienceNotes.length);
  assert.deepEqual(
    withNotes.map((g) => [g.cardCode, g.audienceNotes.length]),
    [["IG-U006", 5], ["IG-U007", 4], ["IG-U008", 6], ["IG-U009", 3], ["IG-U011", 3]],
  );
  const u010 = result.universalGates.find((g) => g.cardCode === "IG-U010")!;
  assert.deepEqual(u010.audienceNotes, []);
  assert.ok((u010.audienceStatement ?? "").indexOf("No audience-specific adaptations") === 0);
});

test("the five module gates are complete cards and file to the right modules", () => {
  assert.deepEqual(result.incomplete, []);
  for (const g of result.moduleGates) {
    for (const k of COMPONENT_KEYS) assert.ok(g.components[k], `${g.cardCode} missing ${k}`);
  }
  assert.deepEqual(
    result.moduleGates.map((g) => [g.cardCode, g.module]),
    [
      ["H-111", "foundation_1"],
      ["H-210", "foundation_2"],
      ["H-315", "foundation_3"],
      ["H-616", "module_6"],
      ["H-923", "module_9"],
    ],
  );
});

test("three of the five module gates are Tier 1", () => {
  // Foundation 1-3 ship; Modules 6 and 9 defer with their modules. H-616 also
  // depends on intake capturing positioning aversion data, which the delivered
  // intake module does not ask for — its own detection method says the gate lies
  // dormant in that case.
  assert.deepEqual(
    result.moduleGates.filter((g) => isTier1(g)).map((g) => g.cardCode),
    ["H-111", "H-210", "H-315"],
  );
});

test("H-315 and H-616 declare COACH though the document files them as gates", () => {
  /*
   * Reported, not resolved. Both detect on the student's turn — H-315 fires when
   * narration goes generic, H-616 when content resistance matches an intake
   * aversion — so `intervention_type` and the section title genuinely disagree,
   * and the section title is not a property of the card. Same treatment as the
   * compendium's four kind disagreements.
   */
  assert.deepEqual(result.kindDisagreements, [
    { cardCode: "H-315", interventionType: "COACH", resolvedAs: "coaching_card" },
    { cardCode: "H-616", interventionType: "COACH", resolvedAs: "coaching_card" },
  ]);
  assert.deepEqual(
    result.moduleGates.filter((g) => g.cardKind === "integrity_gate").map((g) => g.cardCode),
    ["H-111", "H-210", "H-923"],
  );
});

test("the six behavioural rules are rules, not cards", () => {
  /*
   * Her instruction: "These go in the routing behavioural rules section of the
   * compendium, not in the gate library. They're coaching approach adaptations,
   * not hard-stop gates." So they carry no card code and are not seeded as cards.
   *
   * Four give explicit banned and correct framings, which is the part that can be
   * enforced. The executive and entrepreneur rules give a calibration and
   * sub-track variations instead, so there is nothing to match on.
   */
  assert.deepEqual(
    result.behaviouralRules.map((r) => r.track),
    [
      "Career Returner",
      "Undergraduate",
      "Executive",
      "Early Career",
      "Mid-Career",
      "Entrepreneur (All Sub-Tracks)",
    ],
  );
  for (const r of result.behaviouralRules) assert.ok(r.rule.length > 80, r.track);
  assert.deepEqual(
    result.behaviouralRules.filter((r) => r.bannedFramings && r.correctFramings).map((r) => r.track),
    ["Career Returner", "Undergraduate", "Early Career", "Mid-Career"],
  );
});

test("the career returner rule is the one already live in the voice profile", () => {
  // Voice profile v2 carries the career returner register from her morning email.
  // This is the same instruction stated as a coaching rule, so the two must not
  // drift: the gap is the story, and the banned framings are explicit.
  const cr = result.behaviouralRules.find((r) => r.track === "Career Returner")!;
  assert.ok(cr.rule.indexOf("forward") >= 0 || cr.rule.indexOf("orients forward") >= 0);
  assert.ok((cr.bannedFramings ?? "").indexOf("address the gap") >= 0);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

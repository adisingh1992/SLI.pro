/**
 * P6.1 — the export shape's pure half: `runExportToCsv`. `buildRunExport`
 * (`test-run-export.ts`) needs a live database and is not covered here — see
 * that file's own doc comment on the pure/impure split.
 *
 * Run: npx tsx server/wing/run-export-format.test.ts
 */
import assert from "node:assert/strict";
import { runExportToCsv, type RunExport } from "./run-export-format";

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

console.log("\nrun-export-format\n");

function markers(overrides: Partial<NonNullable<RunExport["turns"][number]["markerCounts"]>> = {}) {
  return {
    wordCount: 10,
    modalVerbs: { epistemic: 0, deontic: 0, dynamic: 0 },
    pronouns: { firstPersonSingular: 0, collective: 0, depersonalized: 0 },
    causalConnectives: 0,
    repairFalseStarts: 0,
    hedgingSofteners: 0,
    ...overrides,
  };
}

function baseExport(turns: RunExport["turns"]): RunExport {
  return {
    runId: 1,
    status: "completed",
    provenance: {
      personaId: 1,
      personaVersion: "abc123",
      sequenceId: 1,
      checkpoint: "from_scratch",
      fidelity: "marked_complete",
      completionReason: null,
      modelDeployments: { persona: "nano", wing: "flagship" },
    },
    turns,
    personaAdherence: null,
    discrepancies: null,
    classificationsNotMeasured: [],
    notReconstructed: [],
  };
}

test("one header row plus one row per turn", () => {
  const csv = runExportToCsv(
    baseExport([
      {
        turnIndex: 0,
        speaker: "persona",
        content: "hello there",
        cardApplied: null,
        markerCounts: markers(),
        gateFindings: [],
        selectionTrace: null,
        deliveryAudience: null,
        deliveryRegister: null,
      },
      {
        turnIndex: 1,
        speaker: "wing",
        content: "hi, tell me more",
        cardApplied: null,
        markerCounts: null,
        gateFindings: [],
        selectionTrace: null,
        deliveryAudience: null,
        deliveryRegister: null,
      },
    ]),
  );
  const lines = csv.split("\n");
  assert.equal(lines.length, 3, "expected a header row plus two turn rows");
  assert.ok(lines[0].startsWith("turn_index,speaker,content,"), "expected the documented column order");
});

test("a card win surfaces its code, name and component version", () => {
  const csv = runExportToCsv(
    baseExport([
      {
        turnIndex: 0,
        speaker: "persona",
        content: "I guess I'm not sure",
        cardApplied: { cardCode: "H-014", name: "Reflect hedging", componentVersion: 3 },
        markerCounts: markers({ hedgingSofteners: 2 }),
        gateFindings: [],
        selectionTrace: null,
        deliveryAudience: null,
        deliveryRegister: null,
      },
    ]),
  );
  const row = csv.split("\n")[1];
  assert.ok(row.includes("H-014"), "expected the winning card's code in the row");
  assert.ok(row.includes("Reflect hedging"), "expected the winning card's name in the row");
  assert.ok(/,3,/.test(row) || row.trim().endsWith(",3"), "expected the component version in the row");
});

test("content, card names and gate findings containing commas or quotes are RFC4180-quoted", () => {
  const csv = runExportToCsv(
    baseExport([
      {
        turnIndex: 0,
        speaker: "persona",
        content: 'He said, "I quit."',
        cardApplied: { cardCode: "H-001", name: "Name, with a comma", componentVersion: 1 },
        markerCounts: markers(),
        gateFindings: [{ cardCode: "H-002", mode: "banned_phrase", matched: "as an AI", excerpt: "x" }],
        selectionTrace: null,
        deliveryAudience: null,
        deliveryRegister: null,
      },
    ]),
  );
  const row = csv.split("\n")[1];
  assert.ok(row.includes('"He said, ""I quit."""'), "expected the quote-and-comma content cell RFC4180-escaped");
  assert.ok(row.includes('"Name, with a comma"'), "expected the comma-bearing card name quoted");
});

test("a turn with no winning card leaves the card columns empty, not a placeholder", () => {
  const csv = runExportToCsv(
    baseExport([
      {
        turnIndex: 0,
        speaker: "persona",
        content: "just talking",
        cardApplied: null,
        markerCounts: markers(),
        gateFindings: [],
        selectionTrace: { noFire: "reason_not_recorded" } as any,
        deliveryAudience: null,
        deliveryRegister: null,
      },
    ]),
  );
  const cells = csv.split("\n")[1].split(",");
  const cardCodeIdx = csv.split("\n")[0].split(",").indexOf("card_code");
  assert.equal(cells[cardCodeIdx], "", "no winning card should leave card_code empty");
  assert.ok(csv.includes("reason_not_recorded"), "no_fire reason should still surface for an unfired turn");
});

test("wing turns carry no marker counts — the cells are empty, not zero", () => {
  const csv = runExportToCsv(
    baseExport([
      {
        turnIndex: 0,
        speaker: "wing",
        content: "Wing's reply",
        cardApplied: null,
        markerCounts: null,
        gateFindings: [],
        selectionTrace: null,
        deliveryAudience: null,
        deliveryRegister: null,
      },
    ]),
  );
  const header = csv.split("\n")[0].split(",");
  const row = csv.split("\n")[1].split(",");
  const wordCountIdx = header.indexOf("word_count");
  assert.equal(row[wordCountIdx], "", "Wing's own turn was never measured — an empty cell, not a false zero");
});

test("a wing turn's resolved delivery register surfaces in its own columns", () => {
  const csv = runExportToCsv(
    baseExport([
      {
        turnIndex: 0,
        speaker: "wing",
        content: "What matters most to you here?",
        cardApplied: null,
        markerCounts: null,
        gateFindings: [],
        selectionTrace: null,
        deliveryAudience: "executive",
        deliveryRegister: "executive",
      },
    ]),
  );
  const header = csv.split("\n")[0].split(",");
  const row = csv.split("\n")[1].split(",");
  assert.equal(row[header.indexOf("delivery_audience")], "executive");
  assert.equal(row[header.indexOf("delivery_register")], "executive");
});

test("a persona turn carries no delivery register — the cells are empty, not a stale value", () => {
  const csv = runExportToCsv(
    baseExport([
      {
        turnIndex: 0,
        speaker: "persona",
        content: "I'm not sure what I want here",
        cardApplied: null,
        markerCounts: markers(),
        gateFindings: [],
        selectionTrace: null,
        deliveryAudience: null,
        deliveryRegister: null,
      },
    ]),
  );
  const header = csv.split("\n")[0].split(",");
  const row = csv.split("\n")[1].split(",");
  assert.equal(row[header.indexOf("delivery_audience")], "");
  assert.equal(row[header.indexOf("delivery_register")], "");
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

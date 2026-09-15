import assert from "node:assert/strict";
import { scoreAdherence } from "./persona-adherence";

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

console.log("\npersona-adherence\n");

function words(n: number, filler = "word"): string {
  return new Array(n).fill(filler).join(" ") + ".";
}

test("a clean in-band run is adherent", () => {
  const report = scoreAdherence([words(40), words(60), words(80)], ["hedges heavily"]);
  assert.equal(report.brokeCharacter, false);
  assert.equal(report.lengthAdherence, 1);
  assert.equal(report.adherent, true);
});

test("corporate-AI phrasing flips brokeCharacter and adherent, regardless of length", () => {
  const report = scoreAdherence(
    [words(50), "As an AI, I don't have personal experiences to share here."],
    [],
  );
  assert.equal(report.brokeCharacter, true);
  assert.equal(report.turns[1].corporateAiPhrasingHit, true);
  assert.equal(report.adherent, false);
});

test("meta-feedback phrasing is caught independently of corporate-AI phrasing", () => {
  const report = scoreAdherence([words(50), "(OOC: is this the right tone for the exercise?)"], []);
  assert.equal(report.turns[1].metaFeedbackHit, true);
  assert.equal(report.turns[1].corporateAiPhrasingHit, false);
  assert.equal(report.brokeCharacter, true);
});

test("out-of-band length alone (no character break) can still fail the threshold", () => {
  // 1 of 3 turns in band -> lengthAdherence = 1/3, below the 0.5 threshold
  const report = scoreAdherence([words(5), words(200), words(60)], []);
  assert.equal(report.brokeCharacter, false);
  assert.ok(report.lengthAdherence < 0.5);
  assert.equal(report.adherent, false);
});

test("mild profanity and backstory contradictions are always reported as not measured", () => {
  const report = scoreAdherence([words(40)], []);
  const rules = report.notMeasured.map((n) => n.rule);
  assert.ok(rules.includes("mild profanity present when engaged"));
  assert.ok(rules.includes("no backstory contradictions"));
});

test("expectedMarkers is passed through verbatim, never parsed or scored", () => {
  const report = scoreAdherence([words(40)], ["hedges heavily", "minimizes with 'just'"]);
  assert.deepEqual(report.expectedMarkers, ["hedges heavily", "minimizes with 'just'"]);
});

test("an empty turn list is adherent by default, not a false failure", () => {
  const report = scoreAdherence([], []);
  assert.equal(report.turnCount, 0);
  assert.equal(report.brokeCharacter, false);
  assert.equal(report.lengthAdherence, 1);
  assert.equal(report.adherent, true);
});

console.log("");
if (failures) {
  console.log(`${failures} failure(s)\n`);
  process.exit(1);
}
console.log("all passed\n");

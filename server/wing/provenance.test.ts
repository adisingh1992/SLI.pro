/**
 * Provenance capture rule — verification against the spec's worked example.
 *
 * Run: npx tsx server/wing/provenance.test.ts
 *
 * No database required: the deterministic rule is a pure function, which is
 * why it is isolated in provenance.ts. This is the mechanism the entire
 * behavioural-data asset depends on, so it gets an explicit test.
 */

import {
  deriveTurnType,
  provenanceForTurnType,
  type TurnTypeValue,
} from "./provenance";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = actual === expected;
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "✗"} ${label}${pass ? "" : `\n      expected ${expected}, got ${actual}`}`);
}

console.log("\nDeterministic capture rule (spec §8)");
check("first turn from AI → ai_prompt", deriveTurnType("ai", null), "ai_prompt");
check("human after ai_prompt → human_elicited_response",
  deriveTurnType("human", "ai_prompt"), "human_elicited_response");
check("human after human turn → human_spontaneous",
  deriveTurnType("human", "human_spontaneous"), "human_spontaneous");
check("human opening a session → human_spontaneous",
  deriveTurnType("human", null), "human_spontaneous");
check("★ AI after human_correction → ai_adapted",
  deriveTurnType("ai", "human_correction"), "ai_adapted");
check("AI after a normal human turn → ai_prompt",
  deriveTurnType("ai", "human_spontaneous"), "ai_prompt");

console.log("\nProvenance derivation (spec §4.3 — enumeration unchanged)");
check("ai_prompt → ai_generated", provenanceForTurnType("ai_prompt"), "ai_generated");
check("★ ai_adapted → ai_generated (still excluded from memory)",
  provenanceForTurnType("ai_adapted"), "ai_generated");
check("human_elicited_response → human_elicited",
  provenanceForTurnType("human_elicited_response"), "human_elicited");
check("human_spontaneous → human_spontaneous",
  provenanceForTurnType("human_spontaneous"), "human_spontaneous");
check("human_correction → human_correction",
  provenanceForTurnType("human_correction"), "human_correction");

// The worked example from the Wing Data Architecture spec §5, replayed.
console.log("\nWorked example — Foundation Session 1 (data spec §5)");
const conversation: Array<{ origin: "human" | "ai"; explicit?: TurnTypeValue; expect: TurnTypeValue }> = [
  // 1. Wing: "You listed five target roles. Which one would you bet on...?"
  { origin: "ai", expect: "ai_prompt" },
  // 2. "Probably Chief of Staff, but I feel like I'm giving something up..."
  { origin: "human", expect: "human_elicited_response" },
  // 3. "Actually I keep getting pulled into cross-functional work..."
  { origin: "human", expect: "human_spontaneous" },
  // 4. "That framing doesn't quite fit — my credibility is split..."
  //    Not deterministically detectable at capture; the Nano classifier
  //    settles it, or the UI supplies it explicitly.
  { origin: "human", explicit: "human_correction", expect: "human_correction" },
  // 5. Wing changes course after being corrected.
  { origin: "ai", expect: "ai_adapted" },
];

let previous: TurnTypeValue | null = null;
conversation.forEach((turn, i) => {
  const actual = turn.explicit ?? deriveTurnType(turn.origin, previous);
  check(`turn ${i + 1}: ${actual} / ${provenanceForTurnType(actual)}`, actual, turn.expect);
  previous = actual;
});

// The invariant the whole data asset rests on.
console.log("\nInvariant — only human turns are memory-eligible");
const memoryEligible = (t: TurnTypeValue) => provenanceForTurnType(t) !== "ai_generated";
check("ai_prompt excluded", memoryEligible("ai_prompt"), false);
check("ai_adapted excluded", memoryEligible("ai_adapted"), false);
check("human_spontaneous included", memoryEligible("human_spontaneous"), true);
check("human_elicited_response included", memoryEligible("human_elicited_response"), true);
check("human_correction included", memoryEligible("human_correction"), true);

console.log(
  failures === 0
    ? "\nAll provenance checks passed ✅\n"
    : `\n${failures} check(s) FAILED ❌\n`,
);
process.exit(failures === 0 ? 0 : 1);

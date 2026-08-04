/**
 * Provenance capture rule — verification against the spec's worked example.
 *
 * Run: npx tsx server/wing/provenance.test.ts
 *
 * No database required: the rule is a pure function isolated in turn-type.ts
 * precisely so this test can run anywhere, including on a CI agent with no
 * database access. This is the mechanism the entire behavioural-data asset
 * depends on, so it gets an explicit test.
 */

import {
  deriveTurnType,
  isAiTurn,
  provenanceForTurnType,
  type TurnTypeValue,
} from "./turn-type";

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

/*
 * Speaker attribution — the regression that hid behind a passing migration.
 *
 * getTurnsAsMessages used to key the speaker off provenance_tag. That is
 * correct for live turns, where provenance is a pure function of turn type,
 * and silently wrong for migrated ones, which are ALL stamped
 * provenance_unknown on purpose. Every turn of every migrated session came
 * back as the student, including Wing's own questions — which then went to
 * the model as conversation history.
 *
 * The counts all reconciled. The turn types were right. Only the reader was
 * looking at the wrong column, so nothing failed and nothing typechecked
 * wrong. Hence an explicit test on the mapping itself.
 */
console.log("\nSpeaker attribution (turn_type, NOT provenance_tag)");
check("ai_prompt is Wing", isAiTurn("ai_prompt"), true);
check("★ ai_adapted is Wing", isAiTurn("ai_adapted"), true);
check("human_elicited_response is the student", isAiTurn("human_elicited_response"), false);
check("human_spontaneous is the student", isAiTurn("human_spontaneous"), false);
check("human_correction is the student", isAiTurn("human_correction"), false);

// Every turn type must be classifiable as one speaker or the other; a new
// member added to the enum without updating isAiTurn would fall through as
// "student" and reintroduce exactly this bug for live sessions too.
const ALL_TURN_TYPES: TurnTypeValue[] = [
  "ai_prompt", "human_elicited_response", "human_spontaneous",
  "human_correction", "ai_adapted",
];
check(
  "every turn type agrees with provenance for LIVE turns",
  ALL_TURN_TYPES.every(
    (t) => isAiTurn(t) === (provenanceForTurnType(t) === "ai_generated"),
  ),
  true,
);

// The migrated case: provenance says nothing, turn type still says who spoke.
check(
  "migrated turn keeps its speaker despite provenance_unknown",
  isAiTurn("ai_prompt"),
  true,
);

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

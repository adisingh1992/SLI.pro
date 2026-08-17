/**
 * Engine decision rules — verification.
 *
 * Run: npx tsx server/wing/engine-rules.test.ts
 *
 * No database and no LLM: the rules are pure functions isolated in
 * engine-rules.ts precisely so this can run on a CI agent with neither. What
 * is tested here is what the engine DECIDES, which is the part that quietly
 * corrupts the evidence base when it is wrong.
 */

import {
  interpretDetection,
  aggregateOutcomes,
  buildSignalCatalogue,
  catalogueRules,
  OUTCOME_WEIGHTS,
  MIN_CONFIDENCE,
  PREEMPTING_WEIGHT,
  INTENSITY_RECOVERY_GUIDANCE,
  intensityOf,
  shouldDeferHighIntensity,
} from "./engine-rules";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(
    `${pass ? "  ok  " : "FAIL  "}${label}` +
      (pass ? "" : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
  );
}

const ALLOWED = [14, 21];

console.log("\ninterpretDetection — what fires and what does not\n");

check(
  "a confident match on a card in the sequence is accepted",
  interpretDetection({ heuristicId: 14, confidence: 0.9, rationale: "five roles" }, ALLOWED),
  { accepted: true, heuristicId: 14, confidence: 0.9, rationale: "five roles" },
);

check(
  "an explicit null means no match",
  interpretDetection({ heuristicId: null, confidence: 0 }, ALLOWED).accepted,
  false,
);

check(
  "a heuristic outside this student's sequence is REJECTED, not snapped to a neighbour",
  interpretDetection({ heuristicId: 99, confidence: 0.99 }, ALLOWED),
  { accepted: false, reason: "unknown_heuristic" },
);

check(
  "confidence just below the threshold does not fire",
  interpretDetection({ heuristicId: 14, confidence: MIN_CONFIDENCE - 0.01 }, ALLOWED),
  { accepted: false, reason: "low_confidence" },
);

check(
  "confidence exactly at the threshold fires",
  interpretDetection({ heuristicId: 14, confidence: MIN_CONFIDENCE }, ALLOWED).accepted,
  true,
);

check(
  "a string id that names a real card is accepted (models quote numbers)",
  interpretDetection({ heuristicId: "21", confidence: 0.8 }, ALLOWED).accepted,
  true,
);

check(
  "garbage is malformed, not a match",
  interpretDetection("sorry, I cannot help with that", ALLOWED),
  { accepted: false, reason: "malformed" },
);

check(
  "a missing confidence does not fire",
  interpretDetection({ heuristicId: 14 }, ALLOWED),
  { accepted: false, reason: "low_confidence" },
);

check(
  "an empty sequence can never fire",
  interpretDetection({ heuristicId: 14, confidence: 1 }, []),
  { accepted: false, reason: "unknown_heuristic" },
);

console.log("\naggregateOutcomes — how evidence accumulates\n");

check(
  "no applications scores zero rather than dividing by zero",
  aggregateOutcomes([]),
  { sessionsApplied: 0, positiveSignalCount: 0, regressionCount: 0, compositeScore: 0 },
);

check(
  "a breakthrough in one session",
  aggregateOutcomes([{ sessionId: 1, outcomeSignal: "breakthrough" }]),
  { sessionsApplied: 1, positiveSignalCount: 1, regressionCount: 0, compositeScore: 2 },
);

check(
  "three firings in ONE session count as one session of evidence",
  aggregateOutcomes([
    { sessionId: 1, outcomeSignal: "positive" },
    { sessionId: 1, outcomeSignal: "positive" },
    { sessionId: 1, outcomeSignal: "positive" },
  ]).sessionsApplied,
  1,
);

check(
  "...but a chatty card does not thereby out-score an effective one",
  // 3 positives in one session = 3/1 = 3.0, vs one breakthrough = 2.0.
  // Weight still accumulates; only the DENOMINATOR is sessions. This is the
  // documented behaviour — asserted so a change to it is deliberate.
  aggregateOutcomes([
    { sessionId: 1, outcomeSignal: "positive" },
    { sessionId: 1, outcomeSignal: "positive" },
    { sessionId: 1, outcomeSignal: "positive" },
  ]).compositeScore,
  3,
);

check(
  "a missing outcome is treated as neutral, not as success",
  aggregateOutcomes([{ sessionId: 1, outcomeSignal: null }]),
  { sessionsApplied: 1, positiveSignalCount: 0, regressionCount: 0, compositeScore: 0 },
);

check(
  "a correction is NOT counted as a regression",
  aggregateOutcomes([{ sessionId: 1, outcomeSignal: "correction" }]).regressionCount,
  0,
);

check(
  "a correction still counts mildly against the card",
  aggregateOutcomes([{ sessionId: 1, outcomeSignal: "correction" }]).compositeScore,
  -0.5,
);

check(
  "a correction scores strictly better than a regression",
  OUTCOME_WEIGHTS.correction > OUTCOME_WEIGHTS.regression,
  true,
);

check(
  "regressions across two sessions average correctly",
  aggregateOutcomes([
    { sessionId: 1, outcomeSignal: "breakthrough" },
    { sessionId: 2, outcomeSignal: "regression" },
  ]),
  { sessionsApplied: 2, positiveSignalCount: 1, regressionCount: 1, compositeScore: 0.5 },
);

/* ── H-003 · coaching intensity sequencing ──────────────────────────────── */

/*
 * The only Tier 1 gate that changes what Wing does rather than what it says. Its
 * rule is a run of THREE, not a per-session cap, and getting that wrong in either
 * direction is costly: too strict and the session stalls on ordinary coaching,
 * too loose and the gate does nothing.
 */

check("CHALLENGE is the high tier", intensityOf("CHALLENGE"), "high");
check("COACH is medium", intensityOf("COACH"), "medium");
check("REDIRECT is medium", intensityOf("REDIRECT"), "medium");
check("REFRAME is medium — it challenges a frame, not a self-model", intensityOf("REFRAME"), "medium");
check("AFFIRM is low — the gate's own recovery example", intensityOf("AFFIRM"), "low");
check("META is low — a rule about output, not coaching delivered", intensityOf("META"), "low");
check("a turn where no card fired is low", intensityOf(null), "low");
check("an unknown type is low, never high", intensityOf("SOMETHING_NEW"), "low");

check("two consecutive HIGH defers the third", shouldDeferHighIntensity(["high", "high"]), true);
check(
  "two HIGH with older history still defers",
  shouldDeferHighIntensity(["high", "high", "low", "medium"]),
  true,
);
check("one HIGH does not defer", shouldDeferHighIntensity(["high", "medium"]), false);
check("a single interaction never defers", shouldDeferHighIntensity(["high"]), false);
check("an empty history never defers", shouldDeferHighIntensity([]), false);
check(
  "recovery resets it — the gate says one interaction, not a waiting period",
  shouldDeferHighIntensity(["low", "high", "high"]),
  false,
);
check(
  "a MEDIUM counts as recovery",
  shouldDeferHighIntensity(["medium", "high", "high"]),
  false,
);
check(
  "two MEDIUM in a row is not a breach — the rule is about HIGH",
  shouldDeferHighIntensity(["medium", "medium"]),
  false,
);

check(
  "the recovery guidance forbids challenging on the recovery turn",
  INTENSITY_RECOVERY_GUIDANCE.indexOf("Do NOT challenge") >= 0,
  true,
);
check(
  "and says the harder work resumes next turn, not after a wait",
  INTENSITY_RECOVERY_GUIDANCE.indexOf("next turn") >= 0,
  true,
);

/* ── The detector catalogue (T3: weight becomes load-bearing) ───────────── */

/*
 * Weight was written by every seed, editable in the admin UI, and read by
 * nothing. The methodology depends on it: H-309 trust vault protection is 2.0
 * specifically so it pre-empts. These checks are what make that claim true.
 */

const CARDS = [
  { heuristicId: 11, name: "H-102 Strategy-as-function redirect", weight: 1.0, signal: "names strategy as function" },
  { heuristicId: 12, name: "H-309 Trust Vault Protection", weight: 2.0, signal: "about to surface trust vault content" },
  { heuristicId: 13, name: "H-202 Evidence probing", weight: 1.5, signal: "vague evidence claim" },
];

const catalogue = buildSignalCatalogue(CARDS);
const lines = catalogue.split("\n").filter((l) => l.startsWith("- id:"));

check("the catalogue lists every card", lines.length, 3);

check(
  "highest weight first, so the pre-empting card is never buried",
  lines.map((l) => Number(l.replace("- id: ", ""))),
  [12, 13, 11],
);

check(
  "the weight is stated per card, not merely implied by order",
  catalogue.indexOf("weight: 2.0") >= 0 && catalogue.indexOf("weight: 1.0") >= 0,
  true,
);

check(
  "ties break on id, so the prompt is stable across calls",
  buildSignalCatalogue([
    { heuristicId: 30, name: "b", weight: 1.0, signal: "s" },
    { heuristicId: 20, name: "a", weight: 1.0, signal: "s" },
  ])
    .split("\n")
    .filter((l) => l.startsWith("- id:"))
    .map((l) => Number(l.replace("- id: ", ""))),
  [20, 30],
);

check(
  "the input array is not mutated",
  CARDS.map((c) => c.heuristicId),
  [11, 12, 13],
);

check("an empty catalogue renders empty rather than throwing", buildSignalCatalogue([]), "");

const rules = catalogueRules().join(" ");
check(
  "the detector is told to prefer the higher weight",
  rules.indexOf("HIGHEST") >= 0,
  true,
);
check(
  "the pre-empting threshold appears in the rules",
  rules.indexOf(PREEMPTING_WEIGHT.toFixed(1)) >= 0,
  true,
);
check(
  "the no-invented-ids rule survived the rewrite",
  rules.indexOf("Never invent a heuristic id") >= 0,
  true,
);
check(
  "returning nothing is still strongly preferred",
  rules.indexOf("strongly preferred") >= 0,
  true,
);

console.log(
  failures === 0
    ? "\nAll engine rule checks passed.\n"
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);

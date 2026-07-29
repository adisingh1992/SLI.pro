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
  OUTCOME_WEIGHTS,
  MIN_CONFIDENCE,
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

console.log(
  failures === 0
    ? "\nAll engine rule checks passed.\n"
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);

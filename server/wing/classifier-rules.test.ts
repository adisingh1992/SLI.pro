/**
 * Turn-classification rules — verification.
 *
 * Run: npx tsx server/wing/classifier-rules.test.ts
 *
 * No database, no LLM. These rules govern whether the provenance record — the
 * thing the whole behavioural-data asset rests on — gets overwritten, so the
 * asymmetry between confirming and overturning a label is asserted explicitly.
 */

import {
  interpretClassification,
  RECLASSIFY_CONFIDENCE,
  CONFIRM_CONFIDENCE,
} from "./classifier-rules";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(
    `${pass ? "  ok  " : "FAIL  "}${label}` +
      (pass ? "" : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
  );
}

console.log("\ninterpretClassification — overturning vs confirming\n");

check(
  "overturning the rule requires high confidence",
  interpretClassification(
    { turnType: "human_correction", confidence: RECLASSIFY_CONFIDENCE, rationale: "pushed back" },
    "human_elicited_response",
  ),
  {
    accepted: true,
    turnType: "human_correction",
    confidence: RECLASSIFY_CONFIDENCE,
    rationale: "pushed back",
    changed: true,
  },
);

check(
  "just below the reclassify threshold leaves the label alone",
  interpretClassification(
    { turnType: "human_correction", confidence: RECLASSIFY_CONFIDENCE - 0.01 },
    "human_elicited_response",
  ),
  { accepted: false, reason: "low_confidence" },
);

check(
  "...but that same confidence is enough to CONFIRM an unchanged label",
  interpretClassification(
    { turnType: "human_elicited_response", confidence: RECLASSIFY_CONFIDENCE - 0.01 },
    "human_elicited_response",
  ).accepted,
  true,
);

check(
  "confirming is held to a lower bar than overturning",
  CONFIRM_CONFIDENCE < RECLASSIFY_CONFIDENCE,
  true,
);

check(
  "a confirmation below even the confirm threshold is rejected",
  interpretClassification(
    { turnType: "human_spontaneous", confidence: CONFIRM_CONFIDENCE - 0.01 },
    "human_spontaneous",
  ),
  { accepted: false, reason: "low_confidence" },
);

check(
  "`changed` is false when the classifier agrees with the rule",
  interpretClassification(
    { turnType: "human_spontaneous", confidence: 0.9 },
    "human_spontaneous",
  ).accepted &&
    (interpretClassification(
      { turnType: "human_spontaneous", confidence: 0.9 },
      "human_spontaneous",
    ) as any).changed,
  false,
);

console.log("\ninterpretClassification — what it refuses to do\n");

check(
  "it may not type an AI turn: ai_prompt is not a classifiable type",
  interpretClassification({ turnType: "ai_prompt", confidence: 0.99 }, "human_spontaneous"),
  { accepted: false, reason: "unknown_type" },
);

check(
  "nor ai_adapted — that is derived structurally, never judged",
  interpretClassification({ turnType: "ai_adapted", confidence: 0.99 }, "human_spontaneous"),
  { accepted: false, reason: "unknown_type" },
);

check(
  "an invented type is rejected",
  interpretClassification({ turnType: "human_confused", confidence: 0.99 }, "human_spontaneous"),
  { accepted: false, reason: "unknown_type" },
);

check(
  "prose instead of JSON is malformed",
  interpretClassification("I think this is a correction", "human_spontaneous"),
  { accepted: false, reason: "malformed" },
);

check(
  "a missing confidence is malformed, not assumed certain",
  interpretClassification({ turnType: "human_correction" }, "human_spontaneous"),
  { accepted: false, reason: "malformed" },
);

check(
  "whitespace around a valid type is tolerated",
  interpretClassification({ turnType: "  human_correction  ", confidence: 0.9 }, "human_spontaneous")
    .accepted,
  true,
);

console.log(
  failures === 0
    ? "\nAll classifier rule checks passed.\n"
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);

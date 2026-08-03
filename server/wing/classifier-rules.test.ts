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
  splitTagged,
  RECLASSIFY_CONFIDENCE,
  CONFIRM_CONFIDENCE,
  HOLDOUT_EVERY,
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

console.log("\nsplitTagged — examples must never be the exam\n");

const mk = (id: number, turnType: string) => ({ id, turnType });

{
  const turns = [
    ...Array.from({ length: 9 }, (_, i) => mk(i + 1, "human_elicited_response")),
    ...Array.from({ length: 6 }, (_, i) => mk(i + 100, "human_spontaneous")),
    ...Array.from({ length: 3 }, (_, i) => mk(i + 200, "human_correction")),
  ];
  const { train, holdout } = splitTagged(turns);

  check(
    "no turn appears in both sides",
    train.some((t) => holdout.some((h) => h.id === t.id)),
    false,
  );

  check(
    "every turn lands somewhere",
    train.length + holdout.length,
    turns.length,
  );

  check(
    "the rare class is represented on BOTH sides",
    holdout.some((t) => t.turnType === "human_correction") &&
      train.some((t) => t.turnType === "human_correction"),
    true,
  );

  check(
    "the split is deterministic",
    JSON.stringify(splitTagged(turns).holdout.map((t) => t.id)),
    JSON.stringify(holdout.map((t) => t.id)),
  );

  check(
    "query order does not change the split",
    JSON.stringify(
      splitTagged([...turns].reverse()).holdout.map((t) => t.id).sort((a, b) => a - b),
    ),
    JSON.stringify(holdout.map((t) => t.id).sort((a, b) => a - b)),
  );
}

check(
  "a class too small to measure is spent on examples, not on validation",
  splitTagged([mk(1, "human_correction"), mk(2, "human_correction")]),
  { train: [mk(1, "human_correction"), mk(2, "human_correction")], holdout: [] },
);

check(
  "an empty set splits into two empty sets rather than throwing",
  splitTagged([]),
  { train: [], holdout: [] },
);

check(
  "roughly one in HOLDOUT_EVERY is held out",
  splitTagged(
    Array.from({ length: 30 }, (_, i) => mk(i + 1, "human_elicited_response")),
  ).holdout.length,
  30 / HOLDOUT_EVERY,
);

console.log(
  failures === 0
    ? "\nAll classifier rule checks passed.\n"
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);

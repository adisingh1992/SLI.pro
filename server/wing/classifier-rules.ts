/**
 * Turn-classification decision rules — pure, dependency-free.
 *
 * What the classifier does with the model's answer, separated from the model
 * call so it can be tested without one. No imports. Do not add any.
 */

/** The only types the classifier may assign. It never types AI turns. */
export const CLASSIFIABLE_TYPES = [
  "human_correction",
  "human_elicited_response",
  "human_spontaneous",
] as const;

export type ClassifiedType = (typeof CLASSIFIABLE_TYPES)[number];

/**
 * Confidence required to CHANGE an existing label.
 *
 * Higher than the engine's detection threshold, and deliberately so: the
 * deterministic capture rule is right most of the time, so overturning it
 * needs more than a coin-flip. A wrong reclassification is worse than no
 * reclassification, because it corrupts the provenance record that the
 * memory pipeline and any future training corpus are built on — and unlike a
 * missed coaching moment, nothing downstream reveals it.
 */
export const RECLASSIFY_CONFIDENCE = 0.75;

/**
 * Confidence required to CONFIRM the label the rule already assigned.
 *
 * Lower, because agreeing with the existing label changes nothing about the
 * data; it only records that a second opinion concurred.
 */
export const CONFIRM_CONFIDENCE = 0.5;

export type ClassificationVerdict =
  | { accepted: true; turnType: ClassifiedType; confidence: number; rationale: string; changed: boolean }
  | { accepted: false; reason: "malformed" | "unknown_type" | "low_confidence" };

export function interpretClassification(
  raw: unknown,
  currentType: string,
): ClassificationVerdict {
  if (!raw || typeof raw !== "object") return { accepted: false, reason: "malformed" };

  const answer = raw as { turnType?: unknown; confidence?: unknown; rationale?: unknown };

  const turnType = typeof answer.turnType === "string" ? answer.turnType.trim() : "";
  if (!CLASSIFIABLE_TYPES.includes(turnType as ClassifiedType)) {
    // Includes the case where the model tries to type an AI turn, which is
    // never its job — AI turn types are structural, not interpretive.
    return { accepted: false, reason: "unknown_type" };
  }

  const confidence = Number(answer.confidence);
  if (!Number.isFinite(confidence)) return { accepted: false, reason: "malformed" };

  const changed = turnType !== currentType;
  const required = changed ? RECLASSIFY_CONFIDENCE : CONFIRM_CONFIDENCE;
  if (confidence < required) return { accepted: false, reason: "low_confidence" };

  return {
    accepted: true,
    turnType: turnType as ClassifiedType,
    confidence,
    rationale: typeof answer.rationale === "string" ? answer.rationale : "",
    changed,
  };
}

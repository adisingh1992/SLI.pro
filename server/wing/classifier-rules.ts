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

/** One in every N tagged turns per class is reserved for validation. */
export const HOLDOUT_EVERY = 3;

/**
 * Splits hand-tagged turns into examples-for-the-prompt and turns-to-test-on.
 *
 * WHY THIS EXISTS AT ALL
 * Few-shot examples are drawn from hand-tagged turns, and the classifier is
 * validated against hand-tagged turns. If those are the same turns, the model
 * is shown the answers to its own exam: accuracy rises, real performance does
 * not, and the number becomes actively misleading — worse than no number,
 * because someone will act on it.
 *
 * STRATIFIED, not random. `human_correction` is the rarest class and the one
 * everything downstream depends on. A naive 1-in-3 split across the whole set
 * could put every correction on one side, leaving either no correction
 * examples or no way to measure correction accuracy.
 *
 * DETERMINISTIC. Same input, same split, every time — so scores are comparable
 * across runs, which is the whole point when the question is "did my prompt
 * edit help?".
 */
export function splitTagged<T extends { id: number; turnType: string }>(
  turns: readonly T[],
): { train: T[]; holdout: T[] } {
  const byType = new Map<string, T[]>();
  for (const t of turns) {
    const bucket = byType.get(t.turnType) ?? [];
    bucket.push(t);
    byType.set(t.turnType, bucket);
  }

  const train: T[] = [];
  const holdout: T[] = [];

  for (const bucket of Array.from(byType.values())) {
    // Sorted by id so the split never depends on query order.
    const ordered = [...bucket].sort((a, b) => a.id - b.id);
    ordered.forEach((t, i) => {
      // A class with fewer turns than the stride contributes nothing useful to
      // validation. Better to spend them as examples than to measure a class
      // on a single turn and then quote the percentage.
      if (ordered.length >= HOLDOUT_EVERY && (i + 1) % HOLDOUT_EVERY === 0) {
        holdout.push(t);
      } else {
        train.push(t);
      }
    });
  }

  return { train, holdout };
}

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

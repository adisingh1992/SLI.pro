/**
 * The deterministic capture rule — pure, dependency-free.
 *
 * Spec §8 (Database Structure & Schema Specification) and §5 of the Wing Data
 * Architecture spec. This is the least reversible part of the system: every
 * turn is tagged human-originated or AI-generated at the moment of capture,
 * and only human-originated turns ground longitudinal memory and any future
 * fine-tuning corpus. Retro-tagging is not possible, so the rule has to be
 * right the first time.
 *
 * THE RULE
 *   - prior turn was `ai_prompt`      → human_elicited_response / human_elicited
 *   - otherwise (human turn)           → human_spontaneous     / human_spontaneous
 *   - AI turn after a human_correction → ai_adapted ★          / ai_generated
 *   - any other AI turn                → ai_prompt             / ai_generated
 *
 * `human_correction` is not inferred here — it is not deterministically
 * detectable at capture. The rule assigns a PROVISIONAL tag synchronously with
 * zero added latency, and the Nano classifier refines it asynchronously.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM provenance.ts
 * The rule is a pure function and must be testable — in CI, on any machine —
 * without a database. provenance.ts imports ../db, which opens a connection
 * pool at module load, so importing the rule from there would drag the whole
 * data layer into the test. This module has no imports at all, by design.
 * Do not add any.
 */

export type TurnOrigin = "human" | "ai";

export type TurnTypeValue =
  | "ai_prompt"
  | "human_elicited_response"
  | "human_spontaneous"
  | "human_correction"
  | "ai_adapted";

export type ProvenanceTagValue =
  | "ai_generated"
  | "human_elicited"
  | "human_spontaneous"
  | "human_correction"
  | "provenance_unknown";

export type CaptureChannelValue =
  | "in_app"
  | "voice"
  | "email_reply"
  | "sms_reply"
  | "legacy_import";

/** Provenance is a pure function of turn type — never set independently. */
export function provenanceForTurnType(turnType: TurnTypeValue): ProvenanceTagValue {
  switch (turnType) {
    case "ai_prompt":
    case "ai_adapted": // ★ still ai_generated; still excluded from memory
      return "ai_generated";
    case "human_elicited_response":
      return "human_elicited";
    case "human_spontaneous":
      return "human_spontaneous";
    case "human_correction":
      return "human_correction";
  }
}

/**
 * Did Wing speak this turn?
 *
 * Reads `turn_type`, NOT `provenance_tag`, and the distinction matters.
 *
 * For live turns the two agree — provenance is a pure function of turn type
 * (see above), so `ai_generated` and `ai_prompt`/`ai_adapted` always coincide.
 * For MIGRATED turns they do not: the data migration stamps every imported
 * turn `provenance_unknown` regardless of role, deliberately, because the
 * legacy corpus has no turn-level provenance and pretending otherwise would
 * poison the behavioural data.
 *
 * So provenance cannot answer "who spoke". It answers "how much do we trust
 * the record". `turn_type` is migrated correctly for both, and is the only
 * column that survives the import with the speaker intact.
 *
 * Reading provenance here caused every turn of every migrated session to
 * render — and be sent to the model — as though the student had said it,
 * including Wing's own prior questions.
 */
export function isAiTurn(turnType: string): boolean {
  return turnType === "ai_prompt" || turnType === "ai_adapted";
}

/** The deterministic capture rule. */
export function deriveTurnType(
  origin: TurnOrigin,
  previousTurnType: TurnTypeValue | null,
): TurnTypeValue {
  if (origin === "ai") {
    // The AI turn immediately following a human correction is the moment Wing
    // changes course because a human pushed back — worth marking at capture,
    // because retro-tagging would mean reprocessing the corpus.
    return previousTurnType === "human_correction" ? "ai_adapted" : "ai_prompt";
  }
  return previousTurnType === "ai_prompt"
    ? "human_elicited_response"
    : "human_spontaneous";
}

/**
 * P4.3 — persona-adherence measurement (`TEST_HARNESS_PLAN_SEP9.md` §P4.3,
 * `TEST_HARNESS_EMAIL_SEP9.md` item 6). "An adherence report exists per run
 * and a persona whose adherence falls below a threshold is flagged in
 * Danielle's export, so she never reads a methodology finding off a persona
 * that broke character."
 *
 * ── WHAT THIS CHECKS, AND WHY ONLY THIS ───────────────────────────────────
 * The plan names six checkable rules: hedge count in band, response length
 * in band, mild profanity present when engaged, no meta-feedback, no
 * backstory contradictions, corporate-AI phrasing caught. Of those, three
 * are honestly automatable from the transcript alone:
 *
 *   - response length in band (P4.2's own contract: 30-150 words/turn)
 *   - corporate-AI phrasing (a closed phrase list — the model announcing
 *     itself as an AI, a language model, or "in this simulation")
 *   - meta-feedback (the model stepping outside the persona to comment on
 *     the exercise itself, rather than staying in character)
 *
 * "Mild profanity present when engaged" and "no backstory contradictions"
 * are NOT automatable without judging content, not just counting phrases —
 * the same P5.2 discipline this harness already holds to for the four
 * unmeasurable stylometric classes. Rather than approximate either (a
 * profanity-word-list "hit" says nothing about whether the persona was
 * actually engaged when it fired; a contradiction check needs to understand
 * the backstory, not pattern-match it), both are reported explicitly as
 * `notMeasured` — never silently dropped, never guessed at.
 *
 * Hedge count is measured (via `marker-instrumentation.ts`) but reported as
 * a number, not scored against a band — the plan itself never states what a
 * persona's "correct" hedge count is beyond its own spec's prose
 * (`expectedMarkers`, free text: "hedges heavily"). Comparing a count against
 * free text would be exactly the kind of false-precision this harness
 * refuses to manufacture elsewhere (see identity-frame, and P5.2 above), so
 * expectedMarkers is surfaced verbatim alongside the measured count for a
 * human to read together, not silently scored pass/fail.
 */

import { computeDeterministicMarkers, sumDeterministicMarkers, type DeterministicMarkers } from "./marker-instrumentation";

const WORD_COUNT_BAND = { min: 30, max: 150 } as const;

// Deliberately narrow — each phrase is something a persona playing a human
// student would not plausibly say, so a hit here is a genuine break, not a
// coincidence of ordinary language (unlike, say, "as a matter of fact").
const CORPORATE_AI_PHRASES =
  /\b(as an ai\b|i'?m an ai\b|i am an ai\b|as a language model|i am a language model|as your ai assistant|i don'?t have (personal experiences|feelings|a body)|as a virtual assistant)/i;

const META_FEEDBACK_PHRASES =
  /(\bin character\b|\bout of character\b|\(\s*ooc\b|\bas the persona\b|\bbreaking character\b|\bend of simulation\b|\bas requested\b|\bthis role-?play\b|\bthis simulation\b)/i;

export type TurnAdherence = {
  turnIndex: number;
  content: string;
  markers: DeterministicMarkers;
  inWordCountBand: boolean;
  corporateAiPhrasingHit: boolean;
  metaFeedbackHit: boolean;
};

export type AdherenceReport = {
  turnCount: number;
  turns: TurnAdherence[];
  totals: DeterministicMarkers;
  /** Fraction (0-1) of turns whose word count fell inside 30-150. */
  lengthAdherence: number;
  /** True the moment any turn trips corporate-AI phrasing or meta-feedback —
   *  the two genuine "broke character" signals this report can actually see. */
  brokeCharacter: boolean;
  /** Persona's own declared markers (free text, Danielle's vocabulary),
   *  surfaced for a human to read next to the measured counts above rather
   *  than scored against them — see file doc comment on why. */
  expectedMarkers: string[];
  /** The two P4.3 rules this report does not attempt to score, and why. */
  notMeasured: { rule: string; reason: string }[];
  /** False only when brokeCharacter, or fewer than half the turns are in
   *  the expected length band — the threshold the plan asks for, not a
   *  precise science. Adjustable if it reads as too strict or too loose
   *  once real runs start producing reports. */
  adherent: boolean;
};

/**
 * `personaTurnTexts` should be exactly the persona's own turns from one run,
 * in order — the caller (`test-run-store.ts`) is responsible for filtering
 * to the human/persona side of the transcript, this function does no
 * filtering of its own and has no database access.
 */
export function scoreAdherence(personaTurnTexts: string[], expectedMarkers: string[]): AdherenceReport {
  const turns: TurnAdherence[] = personaTurnTexts.map((content, i) => {
    const markers = computeDeterministicMarkers(content);
    return {
      turnIndex: i + 1,
      content,
      markers,
      inWordCountBand: markers.wordCount >= WORD_COUNT_BAND.min && markers.wordCount <= WORD_COUNT_BAND.max,
      corporateAiPhrasingHit: CORPORATE_AI_PHRASES.test(content),
      metaFeedbackHit: META_FEEDBACK_PHRASES.test(content),
    };
  });

  const turnCount = turns.length;
  const inBandCount = turns.filter((t) => t.inWordCountBand).length;
  const lengthAdherence = turnCount === 0 ? 1 : inBandCount / turnCount;
  const brokeCharacter = turns.some((t) => t.corporateAiPhrasingHit || t.metaFeedbackHit);

  return {
    turnCount,
    turns,
    totals: sumDeterministicMarkers(turns.map((t) => t.markers)),
    lengthAdherence,
    brokeCharacter,
    expectedMarkers,
    notMeasured: [
      {
        rule: "mild profanity present when engaged",
        reason:
          "a profanity-word hit says nothing about whether the persona was actually engaged when it fired — that's a judgement call, not a phrase count",
      },
      {
        rule: "no backstory contradictions",
        reason:
          "checking this means understanding the persona's backstory, not pattern-matching against it — no automated check for this exists",
      },
    ],
    adherent: !brokeCharacter && lengthAdherence >= 0.5,
  };
}

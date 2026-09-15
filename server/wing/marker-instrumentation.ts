/**
 * P5 — Stage 1 marker instrumentation (`TEST_HARNESS_PLAN_SEP9.md` §P5,
 * `TEST_HARNESS_EMAIL_SEP9.md` item 5). Computed here, in the harness, over a
 * persona's own turn text — never inside the live turn handler. That
 * boundary is deliberate and load-bearing, not incidental: measuring a
 * persona's language in the runner needs nobody's methodology sign-off;
 * putting the same parsers inside `foundation-sessions-routes.ts` would make
 * this a change to live coaching, which needs Danielle's thresholds and her
 * approval (§4.4 of the plan, still open). This file is never imported by
 * anything under the live turn path — a boundary test pins that.
 *
 * ── P5.1 — WHAT IS HONESTLY DETERMINISTIC ─────────────────────────────────
 * Closed lexical classes, countable without judgement: modal verbs by class,
 * first-person-singular vs collective vs depersonalised pronoun ratios,
 * causal-connective density, repair/false-start tokens, hedging softeners.
 * These are exactly what the plan names, no more.
 *
 * ── P5.2 — WHAT THESE COUNTERS MUST NEVER CLAIM ───────────────────────────
 * Sustain-talk vs change-talk, episodic specificity vs generalisation,
 * hedging asymmetry, and reactance are classifications, not phrase counts.
 * The identity-frame precedent is the discipline: 2 of Danielle's 34 signals
 * were codeable as literal phrase matches, the other 32 weren't, and a test
 * protects that count from silently drifting. `NOT_MEASURED_CLASSIFICATIONS`
 * below is reported as-is in every export — never approximated, never
 * silently dropped.
 */

export type DeterministicMarkers = {
  wordCount: number;
  modalVerbs: {
    /** can/could/may/might/possibly — epistemic (likelihood, possibility) */
    epistemic: number;
    /** should/must/have to/need to/ought to — deontic (obligation) */
    deontic: number;
    /** will/would/shall — dynamic (intention, prediction) */
    dynamic: number;
  };
  pronouns: {
    /** i/me/my/mine/myself */
    firstPersonSingular: number;
    /** we/us/our/ours/ourselves */
    collective: number;
    /** one/you/your (generic "you", not addressed-to-Wing "you") /people/folks */
    depersonalized: number;
  };
  /** because/since/so/therefore/as a result/due to/which means/that's why */
  causalConnectives: number;
  /** um/uh/i mean/sorry/actually/wait/well/let me rephrase/or rather */
  repairFalseStarts: number;
  /** just/maybe/sort of/kind of/i guess/perhaps/probably/i think/a little/somewhat */
  hedgingSofteners: number;
};

/**
 * The four classifications the plan is explicit the harness must NOT
 * approximate from phrase counts — reported literally as "not measured" in
 * every export, never silently omitted (an omission reads as "found
 * nothing," which is a different and false claim).
 */
export const NOT_MEASURED_CLASSIFICATIONS = [
  {
    key: "sustain_talk_vs_change_talk",
    label: "sustain-talk vs. change-talk",
  },
  {
    key: "episodic_specificity_vs_generalization",
    label: "episodic specificity vs. generalization",
  },
  {
    key: "hedging_asymmetry",
    label: "hedging asymmetry",
  },
  {
    key: "reactance_autonomy_assertions",
    label: "reactance / autonomy assertions",
  },
] as const;

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

// Word-boundary, case-insensitive, global — every pattern below follows the
// same shape so the counts stay comparable to each other.
const EPISTEMIC_MODALS = /\b(can|could|may|might|possibly)\b/gi;
const DEONTIC_MODALS = /\b(should|must|have to|need to|ought to)\b/gi;
const DYNAMIC_MODALS = /\b(will|would|shall)\b/gi;

const FIRST_PERSON_SINGULAR = /\b(i|me|my|mine|myself)\b/gi;
const COLLECTIVE = /\b(we|us|our|ours|ourselves)\b/gi;
const DEPERSONALIZED = /\b(one|you|your|yours|people|folks)\b/gi;

const CAUSAL_CONNECTIVES =
  /\b(because|since|so|therefore|as a result|due to|which means|that'?s why)\b/gi;

const REPAIR_FALSE_STARTS =
  /\b(um+|uh+|i mean|sorry|actually|wait|well|let me rephrase|or rather)\b/gi;

const HEDGING_SOFTENERS =
  /\b(just|maybe|sort of|kind of|i guess|perhaps|probably|i think|a little|somewhat)\b/gi;

/** Pure computation, one turn's text in, one marker snapshot out. No I/O,
 *  no database, no model call — safe to run over any number of turns. */
export function computeDeterministicMarkers(text: string): DeterministicMarkers {
  const wordCount = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  return {
    wordCount,
    modalVerbs: {
      epistemic: countMatches(text, EPISTEMIC_MODALS),
      deontic: countMatches(text, DEONTIC_MODALS),
      dynamic: countMatches(text, DYNAMIC_MODALS),
    },
    pronouns: {
      firstPersonSingular: countMatches(text, FIRST_PERSON_SINGULAR),
      collective: countMatches(text, COLLECTIVE),
      depersonalized: countMatches(text, DEPERSONALIZED),
    },
    causalConnectives: countMatches(text, CAUSAL_CONNECTIVES),
    repairFalseStarts: countMatches(text, REPAIR_FALSE_STARTS),
    hedgingSofteners: countMatches(text, HEDGING_SOFTENERS),
  };
}

/** Sums per-turn snapshots into one run-level total — same shape, so a
 *  caller never has to know whether it's looking at one turn or the whole
 *  run. */
export function sumDeterministicMarkers(snapshots: DeterministicMarkers[]): DeterministicMarkers {
  const total: DeterministicMarkers = {
    wordCount: 0,
    modalVerbs: { epistemic: 0, deontic: 0, dynamic: 0 },
    pronouns: { firstPersonSingular: 0, collective: 0, depersonalized: 0 },
    causalConnectives: 0,
    repairFalseStarts: 0,
    hedgingSofteners: 0,
  };
  for (const s of snapshots) {
    total.wordCount += s.wordCount;
    total.modalVerbs.epistemic += s.modalVerbs.epistemic;
    total.modalVerbs.deontic += s.modalVerbs.deontic;
    total.modalVerbs.dynamic += s.modalVerbs.dynamic;
    total.pronouns.firstPersonSingular += s.pronouns.firstPersonSingular;
    total.pronouns.collective += s.pronouns.collective;
    total.pronouns.depersonalized += s.pronouns.depersonalized;
    total.causalConnectives += s.causalConnectives;
    total.repairFalseStarts += s.repairFalseStarts;
    total.hedgingSofteners += s.hedgingSofteners;
  }
  return total;
}

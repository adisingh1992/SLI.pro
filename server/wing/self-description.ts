import { BEATS } from "./intake-beats";

/**
 * Which of Danielle's six capture points today's intake can honestly claim.
 *
 * ── THE REQUIREMENT ──────────────────────────────────────────────────────
 * "Every time a user describes themselves during intake, store it." Six capture
 * points, five fields each, and it starts now regardless of build order — because
 * intake is the only time Wing sees a user describe themselves before Wing has
 * taught them any language for it, and that reference point cannot be
 * reconstructed afterwards.
 *
 * Her email adds the part that makes this load-bearing rather than analytical:
 * "Wherever a template says 'exact words' — that means the user's literal typed
 * input goes in the slot. Not a summary." A reveal cannot quote what was never
 * stored verbatim, so this table is a prerequisite for the reveals themselves.
 *
 * ── WHY THE MAPPING IS A TABLE AND NOT A LOOKUP ──────────────────────────
 * Her capture points are keyed to HER question set. Today's intake asks thirteen
 * beats that are not those questions, and the fit varies:
 *
 *   Q2  → `situation`      SAME QUESTION. Both ask where the user is in their career.
 *   Q5  → nothing          DIFFERENT. Hers is the party question — what they SAY they
 *                          do, the self-presentation instinct. `what_you_do` asks what
 *                          they actually do day to day, which is the factual answer.
 *                          Her Q5's entire value is the gap between presentation and
 *                          capability, and labelling role facts as a presentation
 *                          instinct would corrupt exactly that comparison.
 *   Q5.5 → nothing         ABSENT. No beat asks for a topic.
 *   Q6  → `proud_of`       CLOSE. Hers is "good at something your resume doesn't show";
 *                          ours is "something you're quietly pleased with", and its
 *                          own stated purpose is surfacing undersold evidence.
 *   Q7  → `self_perception` CLOSE. Hers asks what they would change about how they are
 *                          perceived; ours asks how they think others see them and
 *                          whether it matches. Same territory, different angle.
 *   Q9  → the insight       SAME. The first user message after the early insight IS the
 *                          reaction to it, and the flow already records when the
 *                          insight was delivered.
 *
 * All six are captured as of the v1.8 question set: the intake now asks her questions
 * in her wording, so `party_answer` implements Q5 and `topic_signal` implements Q5.5,
 * both of which were absent before and were deliberately left absent rather than
 * approximated. A row claiming to be Q5 while answering a different question is worse
 * than no row, because the feature that reads this table compares a user's answers to
 * the same question over time — which is also why every row is now `exact` and none is
 * `approximate`. The column stays, because the next module to feed this table will not
 * necessarily ask her questions verbatim.
 */

/** How closely a beat in today's intake matches one of her questions. */
export type CaptureFit = "same_question" | "close" | "different" | "absent";

export type CapturePoint = {
  /** Her identifier: Q2, Q5, Q5.5, Q6, Q7, reveal_reaction. */
  question: string;
  /** Her provenance for this point. */
  provenance: "spontaneous" | "elicited";
  /** What she says it captures. */
  what: string;
  /** The beat that asks it today, or null. */
  beat: string | null;
  fit: CaptureFit;
  why: string;
};

export const CAPTURE_POINTS: readonly CapturePoint[] = [
  {
    question: "Q2",
    provenance: "spontaneous",
    what: "How they describe their career situation unprompted",
    beat: "situation",
    fit: "same_question",
    why: "The beat asks her Q2 verbatim. Her provenance says spontaneous; ours is elicited, because the beat asks the question outright.",
  },
  {
    question: "Q5",
    provenance: "elicited",
    what: "Self-presentation instinct — how they introduce themselves",
    beat: "party_answer",
    fit: "same_question",
    why: "Now a beat in its own right, asking her wording. Previously absent: the nearest old beat asked what they actually do day to day, where Q5 asks what they SAY they do, and Q5's whole value is the gap between the two.",
  },
  {
    question: "Q5.5",
    provenance: "elicited",
    what: "Their primary topic area",
    beat: "topic_signal",
    fit: "same_question",
    why: "Now a beat. The Foundation-1-close question is settled: both locations are correct and do different jobs — intake captures a provisional topic signal, Foundation 1 close captures the full function-anchored identification. This is the provisional one.",
  },
  {
    question: "Q6",
    provenance: "elicited",
    what: "Capability their resume doesn't show",
    beat: "proud_of",
    fit: "same_question",
    why: "The beat now asks her wording — off-resume capability, not the older 'quietly pleased with'. It is also required now, because the Q5/Q6 gap is what the reveal is built from.",
  },
  {
    question: "Q7",
    provenance: "elicited",
    what: "What they'd change about how they're perceived",
    beat: "self_perception",
    fit: "same_question",
    why: "The beat now asks what they would CHANGE. It previously asked how they think others see them, which is adjacent territory but a different measurement — the delta is the diagnostic value.",
  },
  {
    question: "reveal_reaction",
    provenance: "elicited",
    what: "Their response to Wing's observation",
    beat: null,
    fit: "same_question",
    why: "Not a beat. The first user message after the early insight is the reaction, and the flow already records when the insight was delivered.",
  },
];

/** The label stored in `asked_as` for a reaction to the early insight. */
export const INSIGHT_ASKED_AS = "insight";

/** How a stored row is paired to one of her questions, if it is at all. */
export type Pairing = {
  question: string | null;
  equivalence: "exact" | "approximate" | null;
};

/** Nothing to pair with: the prompt matches none of her questions. */
const UNPAIRED: Pairing = { question: null, equivalence: null };

/**
 * Her question identifier for a beat and how well it fits, or neither.
 *
 * Only `same_question` and `close` earn an identifier. `different` and `absent`
 * return null, which is the honest answer and what makes the NULLs in the column
 * mean something.
 *
 * ── WHY THE FIT REACHES THE DATABASE AND NOT JUST THIS FILE ──────────────
 * `close` is not `same_question`, and a row that says "Q6" without saying which of
 * the two it is asks the reader to trust a distinction they cannot see. The feature
 * that consumes this compares a user's answers to the same question over time; it
 * needs to be able to exclude the near-misses, or at least to know it is including
 * them. So the fit is stored: `same_question` becomes `exact`, `close` becomes
 * `approximate`, and once her question set is live every row is exact.
 */
export function pairingForBeat(beat: string): Pairing {
  for (const p of CAPTURE_POINTS) {
    if (p.beat !== beat) continue;
    if (p.fit === "same_question") return { question: p.question, equivalence: "exact" };
    if (p.fit === "close") return { question: p.question, equivalence: "approximate" };
    return UNPAIRED;
  }
  return UNPAIRED;
}

/** Her identifier alone, for callers that do not care how close the fit is. */
export function questionForBeat(beat: string): string | null {
  return pairingForBeat(beat).question;
}

/** Which beat captures a given extracted field. Built from BEATS, not restated. */
const BEAT_BY_FIELD: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const b of BEATS) for (const f of b.captures) if (!(f in out)) out[f] = b.key;
  return out;
})();

export function beatForField(field: string): string | null {
  return BEAT_BY_FIELD[field] ?? null;
}

export type TurnCapture = {
  sourceQuestion: string | null;
  /** Null exactly when `sourceQuestion` is. See `pairingForBeat`. */
  equivalence: "exact" | "approximate" | null;
  askedAs: string;
  provenance: "spontaneous" | "elicited";
};

/**
 * What this turn should store, or null for nothing.
 *
 * ── WHY IT NEEDS EVIDENCE AND NOT JUST A MESSAGE ─────────────────────────
 * Not every user turn is a self-description. "what is this?" and "sorry, can you
 * repeat that" are turns too, and storing them as the user's account of themselves
 * would put noise into the one baseline that cannot be rebuilt. So a capture
 * requires that the turn's extraction actually filled a field: that is the
 * evidence that the user said something about themselves.
 *
 * ── ELICITED VERSUS SPONTANEOUS ──────────────────────────────────────────
 * Her definitions: elicited is "Wing asked a specific question", spontaneous is
 * "user volunteered without being asked". So a turn that fills the beat we asked is
 * elicited, and a turn that fills some OTHER beat's field is spontaneous — the user
 * offered something nobody asked for. `coached` cannot occur here, which is the
 * whole point of intake as a baseline.
 */
export function captureForTurn(params: {
  /** The beat whose answer this turn's message contains, if any. */
  askedBeat: string | null;
  /** Fields the extraction filled on this turn. */
  extractedFields: readonly string[];
  /** The insight had already been delivered before this turn. */
  afterInsight: boolean;
  /** A reaction has already been stored for this student. */
  reactionAlreadyStored: boolean;
}): TurnCapture | null {
  /*
   * The reaction wins. It is the one capture point with a fixed moment rather than
   * a question, it can only happen once, and it is the most valuable of the six:
   * the user's unguarded response to being told what Wing noticed.
   */
  if (params.afterInsight && !params.reactionAlreadyStored) {
    return {
      sourceQuestion: "reveal_reaction",
      // Exact: the moment is hers as specified. There is no near-miss possible in
      // "the user's response to Wing's observation" — either it is that turn or it
      // is not, and the flow knows which.
      equivalence: "exact",
      askedAs: INSIGHT_ASKED_AS,
      provenance: "elicited",
    };
  }

  if (!params.extractedFields.length || !params.askedBeat) return null;

  const filledAsked = params.extractedFields.some((f) => beatForField(f) === params.askedBeat);
  if (filledAsked) {
    const pairing = pairingForBeat(params.askedBeat);
    return {
      sourceQuestion: pairing.question,
      equivalence: pairing.equivalence,
      askedAs: params.askedBeat,
      provenance: "elicited",
    };
  }

  /*
   * Something was captured, but not what was asked. `asked_as` still records the
   * beat we put to them — it is what prompted the utterance — and the provenance
   * records that they answered a different question of their own accord.
   */
  return {
    sourceQuestion: null,
    equivalence: null,
    askedAs: params.askedBeat,
    provenance: "spontaneous",
  };
}

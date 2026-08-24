/**
 * Phase 3.5 — baseline calibration (v3.3, B1–B3).
 *
 * Pure. Parsing, banding, barrier classification, and the IG-U014 layer tag.
 *
 * ── WHY THESE ARE LAYER 1 AND NOTHING READS THEM FOR COACHING ────────────
 * IG-U014, from Kruger & Dunning: "Self-report measures (B1–B3 baselines, confidence
 * ratings, comfort assessments) are valid for institutional reporting — they measure
 * what the user *perceives*… They are not valid as coaching inputs."
 *
 * So every record here is stamped `layer: 1`, and `isCoachingInput()` returns false as
 * a function rather than a comment, because the way a rule like that survives a
 * refactor is by having a test. The gate's own worked example is the one to keep in
 * mind: "A user who rates positioning clarity 5/5 but can't name their function in Q5
 * gets Foundation 1's full diagnostic, not a lighter version." Wing's coaching engine
 * reads Q1–Q7; it does not read these.
 *
 * ── WHY AN UNCLEAR SCALE ANSWER IS NULL RATHER THAN A GUESS ──────────────
 * "I'd say a 2 or a 3" is a real answer and it is not a number. Recording 2 would put
 * a fabricated precision into the metric Berkeley sees at 90 days, so an ambiguous
 * answer parses to null and the conversation asks once more. Same instinct as
 * IG-INT06: a wrong value is worse than an absent one.
 *
 * ── WHY A NUMBER IS NOT ALWAYS A SCORE ───────────────────────────────────
 * "I post about one thing a month" answers B2 without rating anything, and "no one
 * really sees it" contains the word `one`. Both would have scored 1 under a plain
 * number scan, and 1 is a *low* band, which fires a follow-up and lands in the cohort
 * numbers. So a number counts as a score only when nothing is being counted with it,
 * and a spelled-out number needs a rating frame ("a three", "I'd say three") in front
 * of it. Everything else re-asks.
 */
import { contract } from "./reveal-facts";

/** Which baseline. B1 and B2 are scales; B3 is free text plus a category. */
export type BaselineQuestion = "B1" | "B2" | "B3";

/** Her banding. 1–2 low, 4–5 high, and a 3 earns nothing. */
export type Band = "low" | "high";

/**
 * Her B3 categories, verbatim from v3.3: "Primary barrier category (content
 * uncertainty, fear/judgment, time, relevance confusion, voice uncertainty, already
 * active) plus verbatim language."
 */
export type Barrier =
  | "content_uncertainty"
  | "fear_judgment"
  | "time"
  | "relevance_confusion"
  | "voice_uncertainty"
  | "already_active"
  | "unknown";

export type ScaleReading =
  | { score: number; ambiguous: false }
  | { score: null; ambiguous: boolean; candidates: number[] };

const WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

/** "3/5", "3 out of 5", "3 out of five" — the denominator is not a second candidate. */
const DENOMINATOR = /\s*(?:\/|out of|outta)\s*(?:5|five)\b/g;
/** The user quoting the scale back at us: "on a 1-5", "1 to 5". */
const SCALE_REF = /\b1\s*(?:-|–|to)\s*5\b/g;

/**
 * What follows a number when the number is counting something rather than rating.
 * `of` is here for "one of my posts"; it is deliberately absent from the lead list.
 */
const COUNTED_NOUN =
  /^(?:thing|things|post|posts|piece|pieces|article|articles|time|times|person|people|hour|hours|day|days|week|weeks|month|months|year|years|yrs|of|other|others)\b/;

/**
 * What may sit immediately in front of a spelled-out number for it to be a rating.
 * Anchored at the end of the preceding text. `or` and `to` are included so that
 * "one or two" produces two candidates and re-asks, rather than confidently reading
 * the first and dropping the second.
 */
const SCALE_LEAD =
  /(?:^|\b(?:a|an|about|around|maybe|say|solid|honestly|like|probably|roughly|it's|i'm|or|to)\s+)\s*$/;

/**
 * A 1–5 answer from free text.
 *
 * Users do not type "3". They type "about a 2", "solid 4", "3/5", "maybe three",
 * "honestly a 1". They also type "2 or 3", which is not a score.
 *
 * Out-of-range numbers are ignored rather than clamped: "I'd give myself a 7" is a
 * misread scale, and clamping it to 5 would record a confident maximum the user did
 * not give. The conversation re-asks instead.
 */
export function readScale(text: string): ScaleReading {
  const t = contract(text).toLowerCase().replace(DENOMINATOR, " ").replace(SCALE_REF, " ");

  const found: number[] = [];
  const add = (n: number): void => {
    if (n >= 1 && n <= 5 && found.indexOf(n) < 0) found.push(n);
  };

  const digits = /\b([0-9]+)\b/g;
  let d: RegExpExecArray | null = digits.exec(t);
  while (d !== null) {
    const after = t.slice(d.index + d[0].length).replace(/^\s+/, "");
    if (!COUNTED_NOUN.test(after)) add(parseInt(d[1], 10));
    d = digits.exec(t);
  }

  const words = Object.keys(WORDS);
  for (const word of words) {
    const re = new RegExp("\\b" + word + "\\b", "g");
    let w: RegExpExecArray | null = re.exec(t);
    while (w !== null) {
      const before = t.slice(0, w.index);
      const after = t.slice(w.index + word.length).replace(/^\s+/, "");
      if (!COUNTED_NOUN.test(after) && SCALE_LEAD.test(before)) add(WORDS[word]);
      w = re.exec(t);
    }
  }

  if (found.length === 1) return { score: found[0], ambiguous: false };
  return { score: null, ambiguous: found.length > 1, candidates: found };
}

/** 1–2 low, 4–5 high, 3 nothing. Null for anything off the scale. */
export function bandFor(score: number): Band | null {
  if (score >= 1 && score <= 2) return "low";
  if (score >= 4 && score <= 5) return "high";
  return null;
}

/* ── B3's barrier ───────────────────────────────────────────────────────── */

const BARRIERS: ReadonlyArray<{ barrier: Barrier; match: RegExp; why: string }> = [
  /*
   * Ordered, and the order is the point. "I don't have time to work out what to say"
   * is content uncertainty wearing a time excuse — v3.3's B3 asks for "the real thing,
   * not the logistics", so the substantive categories are tested before time.
   *
   * Every pattern is matched against `contract()`ed text, so "does not sound like me"
   * and "doesn't sound like me" are one case rather than two near-misses. That is the
   * bug class that already cost us five silently-dead rules in reveal-facts.
   */
  {
    barrier: "fear_judgment",
    match:
      /\b(?:judge|judged|judges|judging|judgement|judgment|what (?:people|they|everyone) (?:think|thinks|will say)|embarrass\w*|cringe\w*|bragging|brag|showing off|show off|imposter|impostor|exposed|criticis\w+|criticiz\w+|arrogant|self-?promot\w*)\b/i,
    why: "fear of how it lands — routes to the H-602 fear path",
  },
  {
    barrier: "voice_uncertainty",
    match:
      /\b(?:sounds? like me|(?:do|does)n't sound like|my (?:own )?voice|feels? fake|sounds? fake|not (?:authentic|me)|forced|performative|corporate speak|like a robot)\b/i,
    why: "the words exist but do not feel like theirs",
  },
  {
    barrier: "content_uncertainty",
    match:
      /\b(?:what to (?:say|write|post)|(?:no|any|some)thing to (?:say|write|post)|no ideas|(?:do|does)n't know what|don't know where|blank page|where to start|nothing worth)\b/i,
    why: "no content, as distinct from no confidence",
  },
  {
    barrier: "relevance_confusion",
    /*
     * "who would even care" is the phrasing, and `who (?:would|even) care` does not
     * match it — the hedge words stack. Up to two words between `who` and `care(s)`
     * covers "who cares", "who would care", "who would even care", "who really even
     * cares", without reaching a sentence away.
     */
    match:
      /\b(?:who(?:\s+\w+){0,2}\s+cares?|not relevant|no ?body (?:reads|cares)|pointless|why would anyone|is it (?:even )?worth|what(?:'s| is) the point)\b/i,
    why: "doubts the audience exists",
  },
  {
    barrier: "already_active",
    match:
      /\b(?:nothing really|nothing much|no barrier|i already (?:do|post|write)|i post (?:regularly|already)|i'm fine|already active)\b/i,
    why: "no barrier to remove — B2 will usually be a 4 or 5",
  },
  {
    barrier: "time",
    match: /\b(?:time|too busy|no bandwidth|never get (?:round|around)|priorit\w+)\b/i,
    why: "logistics, which her question deliberately asks past",
  },
];

export function classifyBarrier(text: string): Barrier {
  const t = contract(text);
  if (!t.trim()) return "unknown";
  for (const b of BARRIERS) if (b.match.test(t)) return b.barrier;
  return "unknown";
}

/** Why a barrier was chosen, for the report and for a human checking a bad call. */
export function barrierReason(barrier: Barrier): string {
  for (const b of BARRIERS) if (b.barrier === barrier) return b.why;
  return "no category matched";
}

/** The six she named, in her order. `unknown` is ours and is not one of hers. */
export const HER_BARRIERS: readonly Barrier[] = [
  "content_uncertainty",
  "fear_judgment",
  "time",
  "relevance_confusion",
  "voice_uncertainty",
  "already_active",
];

/* ── The record ─────────────────────────────────────────────────────────── */

export type BaselineRecord = {
  question: BaselineQuestion;
  /**
   * Always 1. IG-U014's two layers: Layer 1 is self-report for institutional
   * dashboards, Layer 2 is behavioural evidence for the coaching engine. A baseline is
   * never Layer 2, so the field is a literal rather than a variable.
   */
  layer: 1;
  /** B1 and B2 only. */
  score: number | null;
  /** B3 only. */
  barrier: Barrier | null;
  /** Her exact words, kept for every question including the scales. */
  verbatim: string;
  /** "If user still resists → skip… Store baselines as 'declined'." */
  declined: boolean;
  /** The follow-up this answer earned, or null. */
  followUp: string | null;
};

/**
 * Never true, and a function so it can be asserted.
 *
 * The gate is a rule about what reads this data, which no type can enforce on its own.
 * What a test can do is fail the moment someone writes the line that would make a
 * baseline a coaching input.
 */
export function isCoachingInput(): boolean {
  return false;
}

export type BaselineBeat = {
  question: BaselineQuestion;
  answer: "text" | "scale_1_5";
  followUps?: ReadonlyArray<{ on: "low" | "high" | "fear"; ask: string }>;
};

/**
 * One answered baseline.
 *
 * `declined` covers both an explicit refusal and an answer that could not be read as a
 * score after the conversation has already re-asked. The caller decides which; this
 * records it either way, because a declined baseline is data about the user and an
 * absent one is a hole in the cohort's numbers.
 */
export function recordBaseline(
  beat: BaselineBeat,
  verbatim: string,
  opts?: { declined?: boolean },
): BaselineRecord {
  const declined = opts?.declined === true;
  const followUps: ReadonlyArray<{ on: "low" | "high" | "fear"; ask: string }> =
    beat.followUps ?? [];
  const askFor = (on: "low" | "high" | "fear"): string | null => {
    for (const f of followUps) if (f.on === on) return f.ask;
    return null;
  };

  if (declined) {
    return {
      question: beat.question,
      layer: 1,
      score: null,
      barrier: beat.answer === "text" ? "unknown" : null,
      verbatim,
      declined: true,
      followUp: null,
    };
  }

  if (beat.answer === "scale_1_5") {
    const reading = readScale(verbatim);
    const band = reading.score === null ? null : bandFor(reading.score);
    return {
      question: beat.question,
      layer: 1,
      score: reading.score,
      barrier: null,
      verbatim,
      declined: false,
      followUp: band === null ? null : askFor(band),
    };
  }

  const barrier = classifyBarrier(verbatim);
  return {
    question: beat.question,
    layer: 1,
    score: null,
    barrier,
    verbatim,
    declined: false,
    followUp: barrier === "fear_judgment" ? askFor("fear") : null,
  };
}

/**
 * Her re-measurement cadence. T3 is "the budget defense package number".
 *
 * Days from intake. Here rather than in a scheduler because the cadence is
 * methodology, and the scheduler that reads it does not exist yet.
 */
export const REMEASUREMENT = [
  { at: "T1", afterDays: null, asks: ["B1", "B2"], why: "post-Foundation, first improvement point" },
  { at: "T2", afterDays: 30, asks: ["B1", "B2"], why: "sustained improvement, plus identity adoption" },
  { at: "T3", afterDays: 90, asks: ["B1", "B2", "B3"], why: "the budget defence number" },
] as const;

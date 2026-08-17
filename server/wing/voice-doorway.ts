/**
 * Chooses a delivery doorway from how the student has been writing — pure.
 *
 * ── WHAT A DOORWAY IS, AND WHAT IT IS NOT ────────────────────────────────
 * The Voice Guide: "Wing adapts its delivery style to each user's personality
 * without adapting its conclusions... What changes is the doorway, not the
 * destination." Four doorways: ego-driven, anxious/imposter, analytical/
 * skeptical, conflict-avoidant. A doorway changes how Wing gets in. It never
 * changes what Wing concludes, and the compiled section says so on the same
 * line, because a doorway handed to a model on its own reads as permission to
 * soften — which is how a behavioural intelligence tool becomes a flattery
 * engine, the guide's own words.
 *
 * ── THE MAPPING IS INFERRED, AND THAT IS RECORDED ────────────────────────
 * The guide names the signals Wing observes — "response length, vocabulary
 * complexity, emotional tone, self-reference patterns, resistance to
 * vulnerability, speed of engagement" — and it describes the four doorways. It
 * never connects the two. So the rules below are an inference from the guide,
 * not a transcription of it, and they are listed in voice-source.ts UNSTATED as
 * something Danielle needs to review. They are deliberately conservative: two
 * independent signals and a clear margin, or no doorway at all.
 *
 * ── WHY IT FAILS TO NULL RATHER THAN TO A DEFAULT ────────────────────────
 * A wrong doorway is worse than none. Leading with normalisation for someone who
 * is not anxious reads as condescension; leading with affirmation for someone
 * who is not ego-driven reads as flattery. With no doorway the section renders
 * the universal rules, which is Wing's voice as the guide defines it — a
 * perfectly good conversation, just not a tailored opening.
 *
 * ── IN-SESSION ONLY ──────────────────────────────────────────────────────
 * Everything here is computed from the turns of the session in progress. The
 * persisted six-dimension state estimate is C1 and Tier 2; `user_delivery_
 * profiles` is written as a record of what was chosen, and deliberately never
 * read back as an input, so a bad early read cannot follow a student around.
 */

export type DoorwayKey =
  | "ego_driven"
  | "anxious_imposter"
  | "analytical_skeptical"
  | "conflict_avoidant";

export type DoorwaySignals = {
  /** Words of student text considered. */
  words: number;
  turns: number;
  /** Mean words per student turn — the guide's "response length". */
  meanTurnWords: number;
  /** Share of words of nine characters or more — "vocabulary complexity". */
  longWordRatio: number;
  /** First-person singular per 100 words — "self-reference patterns". */
  selfReferenceRate: number;
  /** First-person plural and team nouns per 100 words. */
  collectiveRate: number;
  /** Emotion words per 100 words — "emotional tone". */
  emotionRate: number;
  /** Hedges and minimisers per 100 words — "resistance to vulnerability". */
  hedgeRate: number;
  /** Explicit self-doubt phrases. */
  selfDoubt: number;
  /** Numbers, metrics and evidence vocabulary. */
  evidenceMarkers: number;
  /** Credit moved off the speaker and onto a group. */
  deflections: number;
  /** Titles, seniority and qualifications the speaker claims. */
  credentialMarkers: number;
};

export type DoorwayChoice = {
  doorway: DoorwayKey | null;
  /** 0-1. Null when no doorway was chosen. */
  confidence: number | null;
  /** Why, in plain words. Logged, and shown in an admin surface later. */
  reasons: string[];
  signals: DoorwaySignals;
};

/**
 * Below this there is not enough text to read anything from.
 *
 * Sixty words is two or three real answers. `authenticity.ts` uses a forty-word
 * floor for the same reason: a rule that fires on a fragment fires on noise.
 */
const MIN_WORDS = 60;

const SELF = /\b(?:i|me|my|mine|myself|i'?m|i'?ve|i'?d|i'?ll)\b/gi;
const COLLECTIVE = /\b(?:we|us|our|ours|the team|my team|everyone|the group)\b/gi;
const EMOTION =
  /\b(?:love|loved|hate|hated|excited|exciting|terrified|scared|afraid|frustrated|frustrating|proud|angry|anxious|nervous|worried|thrilled|exhausted|stressed|happy|sad|hurt|relieved|miserable|furious)\b/gi;
const HEDGE =
  /\b(?:just|kind of|kinda|sort of|sorta|a bit|a little|maybe|perhaps|i guess|i suppose|probably|somewhat|fairly|pretty much|i think|i mean)\b/gi;
const SELF_DOUBT =
  /\b(?:not (?:sure|qualified|good enough|really)|don'?t (?:know if|think i)|i'?m not the|imposter|behind everyone|everyone else (?:is|seems)|out of my depth|no right to|who am i to)\b/gi;
const EVIDENCE =
  /(?:\b\d+(?:[.,]\d+)?\s?%|\$\s?\d|\b\d{2,}\b|\bmetrics?\b|\bdata\b|\bmeasured?\b|\bbaseline\b|\bbenchmark\b|\bevidence\b|\bhow do you know\b|\bbased on what\b|\bwhat'?s the basis\b)/gi;
const DEFLECTION =
  /\b(?:helped out|pitched in|supported the|it was (?:really )?(?:a|the) team|we all|everyone contributed|i just helped|not really me|all i did was)\b/gi;
const CREDENTIAL =
  /\b(?:director|vp|vice president|head of|chief|c-?suite|senior|principal|lead(?:er)?ship role|founder|partner|mba|phd|promoted|my title|reporting to me|my reports|p&l)\b/gi;

function count(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

function per100(n: number, words: number): number {
  return words ? Math.round((n / words) * 10000) / 100 : 0;
}

export function readSignals(studentTurns: readonly string[]): DoorwaySignals {
  const turns = studentTurns.filter((t) => !!t && !!t.trim());
  const text = turns.join("\n");
  const wordList = text.split(/\s+/).filter(Boolean);
  const words = wordList.length;

  return {
    words,
    turns: turns.length,
    meanTurnWords: turns.length ? Math.round(words / turns.length) : 0,
    longWordRatio: words
      ? Math.round((wordList.filter((w) => w.replace(/\W/g, "").length >= 9).length / words) * 100) /
        100
      : 0,
    selfReferenceRate: per100(count(text, SELF), words),
    collectiveRate: per100(count(text, COLLECTIVE), words),
    emotionRate: per100(count(text, EMOTION), words),
    hedgeRate: per100(count(text, HEDGE), words),
    selfDoubt: count(text, SELF_DOUBT),
    evidenceMarkers: count(text, EVIDENCE),
    deflections: count(text, DEFLECTION),
    credentialMarkers: count(text, CREDENTIAL),
  };
}

/**
 * Two independent signals for a doorway, and a clear win over the runner-up.
 *
 * One signal is a coincidence — a single "I guess" is not an imposter pattern and
 * one number is not an analytical thinker. Requiring two, and requiring the
 * winner to lead by one, is what keeps this from labelling everybody.
 */
export function chooseDoorway(studentTurns: readonly string[]): DoorwayChoice {
  const signals = readSignals(studentTurns);

  if (signals.words < MIN_WORDS) {
    return {
      doorway: null,
      confidence: null,
      reasons: [`only ${signals.words} words of the student's own writing so far`],
      signals,
    };
  }

  const scores: Record<DoorwayKey, string[]> = {
    ego_driven: [],
    anxious_imposter: [],
    analytical_skeptical: [],
    conflict_avoidant: [],
  };

  /*
   * Ego-driven, and it is GATED on a claimed credential.
   *
   * The first version of this scored self-reference and absence of hedging on
   * their own, and an analytical engineer writing carefully in the first person
   * came out ego-driven — two signals, no titles, no boasting. Which is correct
   * arithmetic and a wrong answer: high self-reference with no hedging is just
   * confident first-person prose, and every Foundation answer is written in the
   * first person about themselves. That is the question being asked.
   *
   * What the Voice Guide actually describes is somebody LEADING with what makes
   * them impressive — "the thing that makes you impressive isn't what you keep
   * leading with." In text that shows up as titles, seniority, promotions and
   * qualifications. So without at least one of those, the other two signals do
   * not count at all.
   */
  if (signals.credentialMarkers >= 1) {
    if (signals.credentialMarkers >= 2) {
      scores.ego_driven.push(`${signals.credentialMarkers} title or seniority references`);
    }
    if (signals.selfReferenceRate >= 6 && signals.collectiveRate < 2) {
      scores.ego_driven.push(
        `self-reference ${signals.selfReferenceRate}/100 words against collective ${signals.collectiveRate}`,
      );
    }
    if (signals.hedgeRate < 2 && signals.selfDoubt === 0 && signals.selfReferenceRate >= 5) {
      scores.ego_driven.push("states things about themselves without hedging");
    }
  }

  // Anxious / imposter: hedged, self-doubting, and often shorter answers.
  if (signals.selfDoubt >= 1) {
    scores.anxious_imposter.push(`${signals.selfDoubt} explicit self-doubt phrase(s)`);
  }
  if (signals.hedgeRate >= 4) {
    scores.anxious_imposter.push(`hedging ${signals.hedgeRate}/100 words`);
  }
  if (signals.meanTurnWords <= 25 && signals.hedgeRate >= 2.5) {
    scores.anxious_imposter.push(`short hedged answers, mean ${signals.meanTurnWords} words`);
  }

  // Analytical / skeptical: longer words, numbers, method questions, flat affect.
  if (signals.evidenceMarkers >= 2) {
    scores.analytical_skeptical.push(`${signals.evidenceMarkers} data or method references`);
  }
  if (signals.longWordRatio >= 0.14) {
    scores.analytical_skeptical.push(`long-word ratio ${signals.longWordRatio}`);
  }
  if (signals.emotionRate < 0.6 && signals.meanTurnWords >= 40) {
    scores.analytical_skeptical.push("long answers with almost no emotional vocabulary");
  }

  // Conflict-avoidant: credit moved to the group, own contribution minimised.
  if (signals.deflections >= 1) {
    scores.conflict_avoidant.push(`${signals.deflections} credit deflection(s)`);
  }
  if (signals.collectiveRate >= 3 && signals.collectiveRate > signals.selfReferenceRate) {
    scores.conflict_avoidant.push(
      `collective ${signals.collectiveRate}/100 words exceeds self-reference ${signals.selfReferenceRate}`,
    );
  }
  if (signals.hedgeRate >= 3 && signals.deflections >= 1) {
    scores.conflict_avoidant.push("minimising language around their own contribution");
  }

  const ranked = (Object.keys(scores) as DoorwayKey[])
    .map((key) => ({ key, hits: scores[key] }))
    .sort((a, b) => b.hits.length - a.hits.length);

  const winner = ranked[0];
  const runnerUp = ranked[1];

  if (winner.hits.length < 2) {
    return {
      doorway: null,
      confidence: null,
      reasons: ["no doorway had two independent signals"],
      signals,
    };
  }
  if (winner.hits.length - runnerUp.hits.length < 1) {
    return {
      doorway: null,
      confidence: null,
      reasons: [
        `${winner.key} and ${runnerUp.key} scored equally (${winner.hits.length}) — too close to call`,
      ],
      signals,
    };
  }

  return {
    doorway: winner.key,
    confidence:
      Math.round(((winner.hits.length - runnerUp.hits.length) / winner.hits.length) * 100) / 100,
    reasons: winner.hits,
    signals,
  };
}

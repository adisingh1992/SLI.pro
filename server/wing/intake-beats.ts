/**
 * The conversational intake, as data (Feature List A1).
 *
 * Pure — zero imports, so every rule here is unit testable without a database
 * or a model. The orchestration lives in intake-conversation.ts.
 *
 * ── WHAT A1 ACTUALLY ASKS FOR ────────────────────────────────────────────
 * "Replace the form-based intake with a conversational chatbot (Wing's first
 * interaction). Wing should adapt question sequencing based on the student's
 * responses and emotional state." Plus, marked critical:
 *
 *   "By approximately question 8-10 … Wing must surface a preliminary insight
 *    — something it's already noticing … grounded in what the intake actually
 *    captures — goals, fears, activity preferences, self-perception — not job
 *    history or headline analysis, which may not be available at this point."
 *
 * That last clause dictates the ordering below, and it is the single biggest
 * departure from the form. The form opens with academic context and reaches
 * goals in stage 2; specifics like graduation year and employer arrive before
 * anything Wing could form a view about. Ordered that way, there is nothing to
 * notice by question 8 except facts.
 *
 * So the beats are ordered by what the insight needs: situation, then goals,
 * then how visible they currently are, then how they FEEL about being visible,
 * then self-perception. The specifics — institution, employer, graduation year,
 * industry, timeline — come after the reveal, when the student has a reason to
 * keep going. Drop-off was the problem A1 exists to solve; 43% stalled at the
 * old verification screen.
 *
 * ── WHY DEMOGRAPHICS ARE NOT HERE ────────────────────────────────────────
 * Race, gender identity, first-generation status and marketing consent are
 * collected by an explicit form step after the conversation, not by Wing.
 * Asking them conversationally is worse, not better: consent has to be
 * unambiguous and revocable, the analytics need exact enum values rather than
 * an inference from prose, and a chatbot enquiring about someone's ethnicity
 * reads as intrusive in a way a labelled optional field does not. The spec's
 * complaint is that the questions feel clinical and that people stalled at
 * verification — neither is fixed by making the demographic questions chattier.
 */

/** Matches the career_pathway enum. A2's founder/freelancer branch. */
export type Pathway = "employment" | "venture" | "freelance";

export type PopulationTag =
  | "undergraduate_or_recent_grad"
  | "early_career"
  | "mid_career_or_senior"
  | "career_break_or_transition";

/** Her phases. Phase 3 is the reveal, which is not a beat — it is an observation. */
export type Phase = 1 | 2 | 3.5 | 4;

/**
 * How the answer arrives. The baselines are numbers on a 1–5 scale with
 * conditional follow-ups; every question before them is free text.
 */
export type AnswerKind = "text" | "scale_1_5";

/**
 * A follow-up that fires on the shape of the answer rather than on its content.
 *
 * `low` is 1–2 and `high` is 4–5 on a scale; a 3 gets nothing, deliberately — "most
 * users get one follow-up across three questions" is the pacing target. `fear` fires
 * on a barrier category rather than a number.
 */
export type FollowUp = {
  on: "low" | "high" | "fear";
  ask: string;
  why: string;
};

export type Beat = {
  key: string;
  /**
   * Which of the methodology's questions this beat implements — "Q1".."Q7", "B1".."B3".
   *
   * Single-sourced here rather than restated per consumer. `self-description.ts` reads
   * it to decide what to file a captured self-description under, and a beat whose
   * wording no longer matches its question is a bug this field makes visible.
   */
  question: string;
  phase: Phase;
  answer: AnswerKind;
  /** Structured field names this beat is trying to fill. */
  captures: string[];
  /** What Wing is trying to learn. Goes into the prompt. */
  intent: string;
  /** Why it matters — so Wing can answer "why are you asking that?" honestly. */
  why: string;
  /** A natural opening. NOT a script: Wing rephrases to fit the conversation. */
  opening: string;
  /**
   * A beat is satisfied when at least one of these fields has a value. Some
   * beats capture several fields and only need one to move on — pressing for
   * all of them is what made the form feel like an interrogation.
   */
  required: boolean;
  /**
   * Restricts the beat to certain populations. Absent means everyone.
   *
   * Nothing uses this any more, and that is a finding rather than an oversight: every
   * one of her nine questions is universal, and all the audience variation lives in
   * delivery rather than in whether the question fires at all. Kept because the
   * mechanism is sound and a later module may need it.
   */
  appliesTo?: PopulationTag[];
  /** Conditional follow-ups, fired on the shape of the answer. */
  followUps?: FollowUp[];
  /**
   * True if this beat contributes material the early insight can be built
   * from. The insight is only allowed to fire once enough of these are in.
   */
  insightMaterial?: boolean;
};

/* ── The sequence ───────────────────────────────────────────────────────── */

export const BEATS: Beat[] = [
  /* ── Phase 1 · Context (Q1–Q4) ─────────────────────────────────────────
   * "Low-stakes, easy to answer. Wing's tone is welcoming and conversational."
   */
  {
    key: "why_here",
    question: "Q1",
    phase: 1,
    answer: "text",
    captures: ["immediate_priorities", "goals", "motivation_category"],
    intent:
      "What brought them here, in their words. Motivation, urgency, and whether they came on their own initiative or were sent.",
    why: "The first data point is their unprompted language, before any question of ours has shaped it.",
    opening: "Before we get into the good stuff — what brought you to Wing today?",
    required: true,
    insightMaterial: true,
  },
  {
    key: "situation",
    question: "Q2",
    phase: 1,
    answer: "text",
    captures: ["professional_status", "current_situation_category"],
    intent:
      "Where they are right now. The primary audience-track signal, and deliberately open rather than a set of options.",
    why: "Track assignment needs two signals; this is the first one, and forcing a dropdown in conversation loses the language the second signal is read from.",
    opening:
      "What's your situation right now? Are you a student, working full-time, in some kind of transition, building something — what's the deal?",
    required: true,
  },
  {
    key: "institution",
    question: "Q3",
    phase: 1,
    answer: "text",
    captures: ["university_name", "academic_programs", "user_source", "enrollment_status"],
    intent: "Institutional or independent, and which programme. A routing question, not a judgment.",
    why: "Configuration, active modules and reporting all hang off this. Institutional context is a separate dimension from audience track — a Haas MBA is early career, not undergraduate.",
    opening: "Are you connected to a university or program, or are you using Wing on your own?",
    required: true,
  },
  {
    key: "where_going",
    question: "Q4",
    phase: 1,
    answer: "text",
    captures: ["career_focus", "target_functions", "goal_category", "urgency_level"],
    intent:
      "A concrete future state three months out. Goals, urgency, and whether the framing is aspiration or evidence.",
    why: "The three-month frame is load-bearing: close enough to feel real, far enough to allow meaningful change. 'What are you hoping to get out of this' invites the generic answer this question exists to avoid.",
    opening: "If Wing works the way it should, what's different for you in three months?",
    required: true,
    insightMaterial: true,
  },

  /* ── Phase 2 · Lightly revealing (Q5–Q7 + Q5.5) ────────────────────────
   * The tonal shift. Wing notices without coaching. PEACE-model ordering:
   * the full account first, the observation only after they have spoken.
   */
  {
    key: "party_answer",
    question: "Q5",
    phase: 2,
    answer: "text",
    captures: ["self_presentation_style", "function_language_detected"],
    intent:
      "Their self-presentation instinct — title-led, company-led, function-led, impact-led, deflection, or breadth.",
    why: "The richest single question in the intake, and the primary identity-reference-frame detection point. The gap between this and Q6 is where most reveal templates fire.",
    opening: "When someone at a party asks what you do, what do you actually say?",
    required: true,
    insightMaterial: true,
  },
  {
    key: "topic_signal",
    question: "Q5.5",
    phase: 2,
    answer: "text",
    captures: ["topic_area_mapped", "industry_hint", "credibility_signal"],
    intent: "One topic they own well enough to talk about unprepared.",
    why: "One, not three: asking for three produces the same scatter pattern Foundation 1 diagnoses. Feeds Radar search terms, Module 6 content territory, and Module 11 topic targeting.",
    opening: "What's one topic you could talk about for an hour without looking anything up?",
    required: true,
  },
  {
    key: "proud_of",
    question: "Q6",
    phase: 2,
    answer: "text",
    captures: ["notable_work", "hidden_strength_category", "strength_type"],
    intent: "A capability their documented record does not show.",
    why: "Consistently the most emotionally authentic answer in the intake, and half of the Q5/Q6 gap the reveal is built from. Required, unlike its predecessor — a reveal cannot be grounded without it, so an unanswered Q6 routes to IG-INT06 deferral rather than a weak reveal.",
    opening: "What's one thing you're good at that your resume doesn't show?",
    required: true,
    insightMaterial: true,
  },
  {
    key: "self_perception",
    question: "Q7",
    phase: 2,
    answer: "text",
    captures: ["self_description", "perceived_strengths", "perception_gap_type"],
    intent: "The one thing they would change about how they are seen professionally.",
    why: "The delta between current and desired positioning. Note this asks what they would CHANGE — the previous beat asked what the perception IS, and the gap is the entire diagnostic value.",
    opening:
      "If you could change one thing about how people perceive you professionally, what would it be?",
    required: true,
    insightMaterial: true,
  },

  /* ── Phase 3.5 · Baseline calibration (B1–B3) ──────────────────────────
   * After the reveal, deliberately. "Before the reveal, it's performative.
   * After the upload, it's too late." Per IG-U014 these are Layer 1 —
   * institutional reporting only, never a coaching input.
   */
  {
    key: "positioning_clarity",
    question: "B1",
    phase: 3.5,
    answer: "scale_1_5",
    captures: ["baseline_positioning_clarity"],
    intent: "How clearly they can describe what makes them distinctive, 1 to 5.",
    why: "The headline institutional metric, re-asked at T1, 30 days and 90 days. The 90-day number is the budget defence.",
    opening:
      "If you had to rate how clearly you can describe what makes you professionally distinctive — 1 is 'I freeze up every time someone asks' and 5 is 'I nail it in thirty seconds' — what's your number?",
    required: false,
    followUps: [
      {
        on: "low",
        ask: "What trips you up — is it that you don't know, or that you know but can't get it out?",
        why: "Separates a Foundation 1 problem from a Foundation 3 problem.",
      },
      {
        on: "high",
        ask: "Interesting — what makes you confident it's working?",
        why: "Catches over-calibrated users whose open answers reveal vague positioning. Per IG-U014 the behavioural evidence governs when the two disagree.",
      },
    ],
  },
  {
    key: "visibility_now",
    question: "B2",
    phase: 3.5,
    answer: "scale_1_5",
    captures: ["activity_level", "content_activity", "baseline_content_comfort"],
    intent: "Comfort with posting professionally, 1 to 5.",
    why: "Was a free-text beat in the question flow. It is a baseline, so it belongs after the reveal on her scale.",
    opening:
      "Same thing for posting on LinkedIn. 1 is 'I'd rather do anything else,' 5 is 'I'm already active and it's natural.' Where are you?",
    required: false,
    followUps: [
      {
        on: "low",
        ask: "Is that a 'never done it' situation, or a 'tried it and hated it' situation?",
        why: "Inexperience and aversion are different Module 6 entry points.",
      },
      {
        on: "high",
        ask: "What do you usually post about?",
        why: "Captures a content signal for topic architecture and the Module 6 opening.",
      },
    ],
  },
  {
    key: "visibility_feeling",
    question: "B3",
    phase: 3.5,
    answer: "text",
    captures: ["visibility_concerns", "fears", "baseline_barrier_category"],
    intent: "The real barrier to being visible, in their words, plus a barrier category.",
    why: "Nearly her wording already. The verbatim matters as much as the category — H-602's intervention paths branch on which barrier it is.",
    opening:
      "Last one. When it comes to posting or being visible professionally — what's the main thing in your way? Not the logistics — the real thing.",
    required: false,
    insightMaterial: false,
    followUps: [
      {
        on: "fear",
        ask: "Fear of whose judgment specifically — people you know, or strangers?",
        why: "Maps to different H-602 intervention paths.",
      },
    ],
  },
];

/* ── Pure rules ─────────────────────────────────────────────────────────── */

/** Beats that apply to a population. Unknown population means all of them. */
export function applicableBeats(population: PopulationTag | null): Beat[] {
  return BEATS.filter(
    (b) => !b.appliesTo || !population || b.appliesTo.includes(population),
  );
}

/**
 * The code-only fallback field that guarantees a text beat counts as satisfied
 * once it has been answered, even if the model's structured extraction wrote
 * nothing usable to any of `beat.captures`.
 *
 * ── THE BUG THIS EXISTS TO FIX ────────────────────────────────────────────
 * Q4 ("where_going") captures `career_focus`, `target_functions`,
 * `goal_category`, `urgency_level` — all reasonable names, and all of them
 * a near-miss for an answer like "I'd have a bigger LinkedIn following":
 * an outcome, not a function or a title. The model, correctly, would not
 * force that text into any of the four. `isSatisfied` then saw nothing land,
 * `nextBeatAfter` stepped forward past it — Q5, Q5.5, Q6, Q7, the baselines —
 * and once every beat AFTER Q4 was satisfied, its forward walk had nothing
 * left to return, fell back to `nextBeat` (which scans from the START of the
 * list), and landed right back on Q4. From the outside that read as Wing
 * asking the same question five and six times over.
 *
 * The field-naming problem is real and could recur for any beat — a model
 * declining to force an answer into a name it does not fit is the CORRECT
 * behaviour of `sanitiseExtracted`, not a bug to prompt-engineer away. So the
 * fix is not a better field name; it is a guarantee that answering a beat is
 * what satisfies it, independent of whether the model found a home for the
 * content. `<key>_raw` is per-beat (never shared across beats, so answering
 * one never satisfies another), never listed in any beat's `captures` — so
 * it is invisible to `KNOWN_FIELDS`/`FIELD_DICTIONARY` and the model can
 * never target it directly — and only ever written by
 * `intake-conversation.ts`'s own code, from the student's own words, when a
 * turn's answered beat would otherwise still read as unsatisfied.
 */
export function verbatimFallbackField(beat: Beat): string {
  return `${beat.key}_raw`;
}

/**
 * A beat is satisfied when ANY of its captured fields has a non-empty value —
 * or its `verbatimFallbackField` does, the code-only guarantee above.
 *
 * Any, not all: several beats capture alternatives — `what_you_do` fills
 * `major` for a student and `current_title` for a professional, and neither
 * will ever fill both. Requiring all of them would leave every beat
 * permanently unsatisfied, and the conversation would never advance.
 */
export function isSatisfied(beat: Beat, captured: Record<string, unknown>): boolean {
  const hasValue = (v: unknown): boolean => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    return true;
  };
  return (
    beat.captures.some((f) => hasValue(captured[f])) ||
    hasValue(captured[verbatimFallbackField(beat)])
  );
}

/** Beats in one phase, in order. */
export function beatsInPhase(phase: Phase): Beat[] {
  return BEATS.filter((b) => b.phase === phase);
}

/**
 * The phase a beat belongs to, by key. Null for an unknown key rather than a throw —
 * callers are reading historical session state, where a retired beat can still appear.
 */
export function phaseOf(key: string): Phase | null {
  return BEATS.find((b) => b.key === key)?.phase ?? null;
}

/** The question a beat implements, or null for an unknown key. */
export function questionOf(key: string): string | null {
  return BEATS.find((b) => b.key === key)?.question ?? null;
}

/**
 * Which follow-up a scale answer earns, if any. Pure, so the banding is testable.
 *
 * 1–2 is low, 4–5 is high, 3 is nothing.
 */
export function followUpFor(beat: Beat, score: number): FollowUp | null {
  if (beat.answer !== "scale_1_5") return null;
  const band = score <= 2 ? "low" : score >= 4 ? "high" : null;
  if (!band) return null;
  return beat.followUps?.find((f) => f.on === band) ?? null;
}

/** The next beat to pursue, or null when the conversation is done. */
export function nextBeat(
  population: PopulationTag | null,
  captured: Record<string, unknown>,
): Beat | null {
  return applicableBeats(population).find((b) => !isSatisfied(b, captured)) ?? null;
}

/**
 * The next beat to ask, given the one Wing asked last turn.
 *
 * ── WHY `nextBeat` ALONE IS OFF BY ONE IN A ONE-CALL TURN ────────────────
 * The conversation makes a single model call per turn: it hands over the user's latest
 * message and gets back both the extracted fields and the next thing to say. Which
 * means the beat it puts in the prompt is chosen *before* this message's fields have
 * been extracted — so `nextBeat` returns the beat the user has just this moment
 * answered, and the prompt tells the model to go and ask it.
 *
 * `lastAsked` closes the gap without a second call. Wing knows what it asked, so it
 * can look past it. If the answer did not actually land, that beat is still unsatisfied
 * and comes back around on the following turn — one question later rather than
 * immediately, which reads better anyway.
 *
 * Falls back to `nextBeat` when `lastAsked` is unknown (an intake that predates the
 * field, or the first turn) or when everything after it is already satisfied.
 */
export function nextBeatAfter(
  population: PopulationTag | null,
  captured: Record<string, unknown>,
  lastAsked: string | null,
): Beat | null {
  if (lastAsked) {
    const list = applicableBeats(population);
    const from = list.findIndex((b) => b.key === lastAsked);
    if (from >= 0) {
      for (let i = from + 1; i < list.length; i++) {
        if (!isSatisfied(list[i], captured)) return list[i];
      }
    }
  }
  return nextBeat(population, captured);
}

export function satisfiedKeys(
  population: PopulationTag | null,
  captured: Record<string, unknown>,
): string[] {
  return applicableBeats(population)
    .filter((b) => isSatisfied(b, captured))
    .map((b) => b.key);
}

/** Required beats are done. Optional ones may remain. */
export function isComplete(
  population: PopulationTag | null,
  captured: Record<string, unknown>,
): boolean {
  return applicableBeats(population)
    .filter((b) => b.required)
    .every((b) => isSatisfied(b, captured));
}

export function progress(
  population: PopulationTag | null,
  captured: Record<string, unknown>,
): { satisfied: number; total: number } {
  const beats = applicableBeats(population);
  return {
    satisfied: beats.filter((b) => isSatisfied(b, captured)).length,
    total: beats.length,
  };
}

/* ── The early insight gate ─────────────────────────────────────────────── */

/**
 * Whether there is genuinely something to notice yet.
 *
 * ── WHY THIS IS A PREDICATE AND NOT A PROMPT INSTRUCTION ─────────────────
 * The model will happily claim it has spotted something whenever it is told an
 * insight is due. An insight fabricated to hit a turn count is worse than no
 * insight: the entire purpose of the moment is the student thinking "it noticed
 * something real about me", and a generic observation dressed up as a discovery
 * teaches them the opposite in the first five minutes of the relationship.
 *
 * So the code decides, not the model. Three conditions, all required:
 *
 *   1. Enough exchanges have happened that "already noticing" is plausible.
 *      Too early and it reads as a trick regardless of accuracy.
 *   2. At least three insight-material beats are in — the spec names goals,
 *      fears, activity preferences and self-perception as the grounds.
 *   3. There is a TENSION, not just data. The spec's own example is a stated
 *      goal set against a stated worry ("you want to be more active … but
 *      you're worried about how people will perceive you"). Without both sides
 *      there is nothing to reveal, only something to summarise.
 */
export const INSIGHT_MIN_EXCHANGES = 7;
export const INSIGHT_MAX_EXCHANGES = 11;
export const INSIGHT_MIN_MATERIAL_BEATS = 3;

export function insightReady(params: {
  exchanges: number;
  population: PopulationTag | null;
  captured: Record<string, unknown>;
  alreadyDelivered: boolean;
}): boolean {
  if (params.alreadyDelivered) return false;
  if (params.exchanges < INSIGHT_MIN_EXCHANGES) return false;

  const material = applicableBeats(params.population).filter(
    (b) => b.insightMaterial && isSatisfied(b, params.captured),
  );
  if (material.length < INSIGHT_MIN_MATERIAL_BEATS) return false;

  return hasTension(params.captured);
}

/**
 * A goal on one side and a constraint on the other.
 *
 * Kept deliberately simple: presence of both, not an attempt to judge whether
 * they genuinely conflict. Deciding that is the model's job — it can read the
 * words. This function's job is to refuse to ask when one side is missing.
 */
export function hasTension(captured: Record<string, unknown>): boolean {
  const nonEmpty = (f: string) => {
    const v = captured[f];
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    return v !== null && v !== undefined;
  };

  /*
   * ── REWRITTEN FOR THE v1.8 QUESTION SET ────────────────────────────────
   * The old pairing was a stated goal against a stated worry, and both halves of it
   * came from beats that are now baselines — `fears`, `visibility_concerns` and
   * `activity_level` are all captured in Phase 3.5, AFTER the reveal fires. Left
   * alone, this predicate would have gone quietly false for every user, because it
   * was waiting on answers that do not exist yet at Q8.
   *
   * So the second side is now the Phase 2 self-description, which is what her reveal
   * templates actually compare a goal against: RT-05 sets Q4's goal against Q6's
   * evidence, RT-01 sets Q5's presentation against Q6's strength, RT-08 reads the
   * Q5/Q6/Q7 triangle.
   *
   * This stays a coarse gate, and since 30 August it is only the gate. Real tension is
   * a cross-answer comparison per template and belongs to reveal selection (H-019.5) —
   * which now runs: `intake-conversation` calls `selectReveal` on every turn this
   * predicate opens, and a template that cannot quote two of the student's own answers
   * is refused there. What survives here is the cheap pre-filter that avoids building
   * facts and evaluating fourteen triggers on a turn with nothing to compare.
   */
  const wants = ["goals", "immediate_priorities", "career_focus", "target_functions"].some(nonEmpty);
  const describesSelf = [
    "self_presentation_style",
    "hidden_strength_category",
    "notable_work",
    "perception_gap_type",
    "self_description",
    "perceived_strengths",
  ].some(nonEmpty);

  return wants && describesSelf;
}

/**
 * Past the point where the insight should have landed.
 *
 * Used to stop waiting for a tension that is not going to appear — some people
 * answer everything flatly and factually. At that point Wing carries on with
 * the questions rather than forcing a reveal, and the conversation simply does
 * not have that moment. Better than an invented one.
 */
export function insightWindowClosed(exchanges: number): boolean {
  return exchanges > INSIGHT_MAX_EXCHANGES;
}

/* ── Delivery style ─────────────────────────────────────────────────────── */

/**
 * The four doorways from the Voice and Personality Guide.
 *
 * "Wing adapts its delivery style to each user's personality without adapting
 * its conclusions… What changes is the doorway, not the destination." The
 * guide's line that matters most here: "Wing never tells users what they want
 * to hear at the expense of what they need to hear. If Wing starts avoiding
 * difficult truths to maintain engagement, it's no longer a behavioral
 * intelligence tool. It's a flattery engine."
 */
export type DeliveryStyle = "affirming" | "normalising" | "evidential" | "permitting";

export const DELIVERY_STYLES: Record<DeliveryStyle, { signals: string; approach: string }> = {
  affirming: {
    signals: "Confident, leads with accomplishments, uses 'I' a lot, may oversell.",
    approach:
      "Lead with affirmation before challenge. Frame everything as elevation rather than correction — 'the thing that makes you impressive isn't what you keep leading with'.",
  },
  normalising: {
    signals: "Hedges, apologises, downplays, mentions being behind or not ready, imposter language.",
    approach:
      "Normalise before pushing. Give evidence that the pattern is common and that they are not behind. More safety, more permission — then the same conclusion.",
  },
  evidential: {
    signals: "Precise, analytical, asks how it works, sceptical of claims, short factual answers.",
    approach:
      "Lead with the data before the interpretation. Name the specific things they said and count them, then draw the conclusion from the pattern.",
  },
  permitting: {
    signals: "Deflects credit to teams, says 'we' about their own work, reluctant to claim anything.",
    approach:
      "Give explicit permission to claim value. 'This is the part where most people undersell themselves. Let's not do that.'",
  },
};

export function isDeliveryStyle(v: unknown): v is DeliveryStyle {
  return typeof v === "string" && v in DELIVERY_STYLES;
}

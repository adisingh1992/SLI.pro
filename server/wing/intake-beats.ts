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

export type Beat = {
  key: string;
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
  /** Restricts the beat to certain populations. Absent means everyone. */
  appliesTo?: PopulationTag[];
  /**
   * True if this beat contributes material the early insight can be built
   * from. The insight is only allowed to fire once enough of these are in.
   */
  insightMaterial?: boolean;
};

/* ── The sequence ───────────────────────────────────────────────────────── */

export const BEATS: Beat[] = [
  {
    key: "situation",
    captures: ["professional_status"],
    intent:
      "Where they are in their career: still studying or recently graduated, a few years in, well established, or between things.",
    why:
      "It decides which version of every later session they get. Wrong here and the whole arc is pitched at the wrong person.",
    opening: "Before we start — where are you right now? Studying, working, somewhere in between?",
    required: true,
  },
  {
    key: "what_you_do",
    captures: ["current_title", "major", "field_of_study", "current_company"],
    intent:
      "What they actually do day to day — course and subject if studying, role if working. One line is enough.",
    why: "It is the ground everything else is said against.",
    opening: "And what are you working on — course, job, whichever applies?",
    required: true,
  },
  {
    key: "why_here",
    captures: ["immediate_priorities", "goals"],
    intent:
      "What brought them here now. Not their five-year plan — the thing that made them sign up this week.",
    why:
      "The stated reason is the first thing worth testing later, and it is usually not the real reason.",
    opening: "What made you sign up? Something specific, or just a sense that you should be doing more?",
    required: true,
    insightMaterial: true,
  },
  {
    key: "where_going",
    captures: ["career_focus", "target_functions"],
    intent: "Where they want to end up, in their own words. Vagueness here is informative, not a problem.",
    why: "The gap between where they are and where they say they want to be is the positioning problem.",
    opening: "Where do you want this to go? Rough is fine.",
    required: true,
    insightMaterial: true,
  },
  {
    key: "visibility_now",
    captures: ["activity_level", "content_activity"],
    intent:
      "How present they currently are professionally — posting, commenting, going to things, or none of it.",
    why: "The starting point for everything Wing does afterwards.",
    opening: "How visible are you professionally at the moment — posting, commenting, events, any of that?",
    required: true,
    insightMaterial: true,
  },
  {
    key: "visibility_feeling",
    captures: ["visibility_concerns", "fears"],
    intent:
      "What actually stops them. Not 'no time' at face value — what sits underneath it. Worry about judgement, not knowing what to say, feeling unqualified.",
    why:
      "This is the beat the early insight usually turns on. A stated goal paired with an unstated fear is the most common shape.",
    opening: "What stops you? And I mean the real reason, not the diary.",
    required: true,
    insightMaterial: true,
  },
  {
    key: "self_perception",
    captures: ["self_description", "perceived_strengths"],
    intent:
      "How they think others see them professionally, and whether that matches how they see themselves.",
    why: "The mismatch between the two is exactly what Wing exists to show people.",
    opening:
      "If someone you'd worked with described you to a stranger, what do you think they'd say?",
    required: true,
    insightMaterial: true,
  },
  {
    key: "pathway",
    captures: ["pathway"],
    intent:
      "Whether they are aiming at employment, starting something of their own, or working for themselves. Ask it plainly; most people know.",
    why:
      "It changes who the audience is. Positioning for a hiring manager, an investor and a prospective client are three different jobs, and the sessions speak differently for each.",
    opening: "Are you aiming at a job, something of your own, or working for yourself?",
    required: true,
    insightMaterial: false,
  },
  {
    key: "proud_of",
    captures: ["notable_work", "student_experience", "professional_experience"],
    intent:
      "Something they have done that they are quietly pleased with. Deliberately not 'your biggest achievement'.",
    why:
      "It surfaces the evidence they undersell, which is the raw material for Session 2 — and asking small gets a truer answer than asking big.",
    opening:
      "Something you've done that you're quietly pleased with — even if it wouldn't make a CV?",
    required: false,
    insightMaterial: true,
  },

  /* ── The early insight fires around here. Specifics follow. ──────────── */

  {
    key: "where_studying",
    captures: ["university_name", "graduation_year", "enrollment_status", "academic_programs"],
    intent: "Institution, subject and roughly when they finish.",
    why: "Cohort reporting for the partner institution, and it dates their experience.",
    opening: "Quick practical one — where are you studying, and when do you finish?",
    required: false,
    appliesTo: ["undergraduate_or_recent_grad", "early_career"],
  },
  {
    key: "experience_length",
    captures: ["years_experience", "leadership_level", "professional_path"],
    intent: "Roughly how long they have been working, and whether they lead people.",
    why: "It sets the credibility bar Session 2 holds them to.",
    opening: "How long have you been at this, roughly? And are you leading anyone?",
    required: false,
    appliesTo: ["early_career", "mid_career_or_senior", "career_break_or_transition"],
  },
  {
    key: "industry",
    captures: ["primary_industry", "target_industries"],
    intent: "The industry they are in or aiming at.",
    why: "Positioning that ignores the industry's own language does not land in it.",
    opening: "Which industry — now, or the one you're aiming at?",
    required: false,
  },
  {
    key: "timeline",
    captures: ["timeline"],
    intent: "How urgent this is. Graduating in eight weeks is a different conversation from idle curiosity.",
    why: "It sets the pace of everything that follows.",
    opening: "Is there a deadline on any of this, or is it more open-ended?",
    required: false,
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
 * A beat is satisfied when ANY of its captured fields has a non-empty value.
 *
 * Any, not all: several beats capture alternatives — `what_you_do` fills
 * `major` for a student and `current_title` for a professional, and neither
 * will ever fill both. Requiring all of them would leave every beat
 * permanently unsatisfied, and the conversation would never advance.
 */
export function isSatisfied(beat: Beat, captured: Record<string, unknown>): boolean {
  return beat.captures.some((f) => {
    const v = captured[f];
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
}

/** The next beat to pursue, or null when the conversation is done. */
export function nextBeat(
  population: PopulationTag | null,
  captured: Record<string, unknown>,
): Beat | null {
  return applicableBeats(population).find((b) => !isSatisfied(b, captured)) ?? null;
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

  const wants = ["goals", "immediate_priorities", "career_focus", "target_functions"].some(nonEmpty);
  const holdsBack = ["fears", "visibility_concerns", "self_description", "activity_level"].some(nonEmpty);

  return wants && holdsBack;
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

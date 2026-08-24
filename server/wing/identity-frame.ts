/**
 * The identity reference frame — Danielle's third adaptive axis, at Priority 1 scope.
 *
 * ── WHAT SHE SPECIFIED AND WHAT SHE LEFT TO US ───────────────────────────
 * Four values, a two-signal threshold, a default of `external` when uncertain,
 * and a rule that the variable is never surfaced to the user — it shapes how
 * Wing talks, not what Wing says about how it talks. Priority 1 is the intake
 * reveal only; every other module behaves as though the frame were external.
 *
 * She was explicit that the storage decision is ours: "whether this is a field in
 * user_delivery_profiles, a component in voice_profile_components, a signal in the
 * observed_signals jsonb, or something else entirely" is not a methodology
 * question. So this module is pure — a resolver and a detector set, no database,
 * no schema. Persistence arrives with the intake engine that produces the
 * classifications the resolver consumes.
 *
 * ── WHY THE DEFAULT IS NOT A SHRUG ───────────────────────────────────────
 * `mixed` and `insufficient_signal` both behave as external, and that asymmetry
 * is hers, argued rather than assumed: treating an internal-frame user as
 * external costs one patronising session and self-corrects when they push back,
 * while treating an external-frame user as internal can end the relationship —
 * they hear "your identity is wrong" instead of "your positioning needs
 * adjusting", and a user who leaves Foundation 2 feeling attacked may not come
 * back. So the resolver never returns `internal` on thin evidence, and
 * `revealMode` sends everything but a confirmed internal frame to permission.
 *
 * ── WHY ONLY TWO OF HER 34 SIGNALS ARE DETECTORS ─────────────────────────
 * Her tables list 34 signals. Two are detectable from raw text and she supplies
 * the threshold for one of them herself. The other 32 are classifications, not
 * phrases: "self-description leads with company/title" is the Q5 classification
 * H-015 defines — title_led, company_led, function_led, impact_led, deflection,
 * breadth — and no regex produces it. Those wait for the intake engine.
 *
 * This is the one lesson from the doorway mapping in `voice-doorway.ts`, which
 * inferred its signal-to-doorway rules because the Voice Guide never connected
 * them, and then mislabelled confident prose as ego-driven until the rule was
 * tightened. An inferred mapping that looks like methodology and is not costs
 * more than an unbuilt one. `parse-research-gates.test.ts` holds us to exactly
 * two: it reads her tables and fails if the coverage claim drifts.
 */

import type { Answers } from "./audience-track";
import { revealFacts, type RevealFacts } from "./reveal-facts";

export const IDENTITY_FRAMES = ["external", "internal", "mixed", "insufficient_signal"] as const;
export type IdentityFrame = (typeof IDENTITY_FRAMES)[number];

/** Her threshold: "Wing needs at least two consistent signals before assigning". */
export const SIGNAL_THRESHOLD = 2;

/** The intake answers a detector can see. Keys follow her question numbering. */
export type IntakeAnswers = {
  q1?: string;
  q2?: string;
  q3?: string;
  q4?: string;
  q5?: string;
  q55?: string;
  q6?: string;
  q7?: string;
};

export type FrameDirection = "external" | "internal";

export type FrameDetector = {
  key: string;
  points: FrameDirection;
  /**
   * Her table row, verbatim, so the test can match it against the document.
   *
   * The Research-Derived Gates wording, not v3.3's. v3.3 restates the same ten rows
   * more briefly — "Gap = others' misperception" for "Gap described as others'
   * misperception" — and the research document is the one a parser reads, so it is the
   * one these have to match. Transcribing v3.3's shorter form broke that match on five
   * of the ten, which is the whole reason the assertion exists.
   */
  row: string;
  /** The threshold, and where it comes from. */
  threshold: string;
  /**
   * Reads classified facts, never raw text.
   *
   * Eight of these ten rows are classifications rather than keyword hits — "self-
   * description leads with company/title" is the Q5 classification H-015 defines, and
   * no regex produces it. `reveal-facts.ts` does that classification once, for the
   * reveal templates and for this table, so the two cannot disagree about the same
   * answer.
   */
  test: (facts: RevealFacts) => boolean;
};

/** Every answer, in question order. Nothing here depends on which question. */
function allText(a: IntakeAnswers): string {
  return [a.q1, a.q2, a.q3, a.q4, a.q5, a.q55, a.q6, a.q7]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join("\n");
}

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

/*
 * Obligation language. Her words, from two places that agree:
 *
 *   Detection table: '"Should" language (3+ instances in intake)' → External.
 *   H-030 (RT-11): "should/need-to/supposed-to language across Q1–Q7.
 *   Threshold: 3+ instances or 1 instance in Q4 (the goal question, where
 *   obligation language is most diagnostic)."
 *
 * The phrase list is hers too — "I should," "I need to," "I'm supposed to,"
 * "people expect me to" — and nothing has been added to it. "Have to" is a near
 * synonym and is deliberately absent: it is not in her list, and widening a
 * detector she wrote is how a detector stops being hers.
 */
const OBLIGATION =
  /\b(?:should|need to|needed to|supposed to|expects? me to|expected me to|told me to)\b/gi;

/*
 * Self-authored language. Her table row names three phrases — "I believe" / "I
 * decided" / "I know" — and H-011's note adds "I want to" against "I should" and
 * "people told me to" on the external side.
 *
 * Her table gives a count for the external signal (3+) and none for its internal
 * twin. Using the same count is the only choice that cannot make `internal`
 * easier to reach than `external`, which is the direction her own asymmetric
 * error analysis says to err in. Stated here rather than buried, because it is
 * the one number in this file she did not give us.
 */
const SELF_AUTHORED =
  /\bI (?:believe|decided|know|want to)\b|\bI've decided\b|\bmy framework\b/gi;

export const DETECTORS: readonly FrameDetector[] = [
  /* ── Q5 · self-description ─────────────────────────────────────────────── */
  {
    key: "q5_leads_with_title_or_company",
    points: "external",
    row: "Self-description leads with company/title",
    threshold: "Hers: the Q5 classification, no count. H-015 calls Q5 the primary detection point.",
    test: (f) => f.q5Style === "title_led" || f.q5Style === "company_led",
  },
  {
    key: "q5_leads_with_function_or_impact",
    points: "internal",
    row: "Self-description leads with function/impact",
    threshold: "Hers: the Q5 classification, no count.",
    test: (f) => f.q5Style === "function_led" || f.q5Style === "impact_led",
  },

  /* ── Q4 · the goal ─────────────────────────────────────────────────────── */
  {
    key: "q4_goal_meets_expectations",
    points: "external",
    row: "Goal framed as meeting expectations",
    threshold:
      'Hers: no count. Fires on obligation language in Q4 — H-014 lists exactly these ' +
      'signals — or on a goal named by an external marker.',
    test: (f) => f.shouldInQ4 || f.q4ExternalMarkers,
  },
  {
    key: "q4_goal_self_authored",
    points: "internal",
    row: "Goal framed as self-authored aspiration",
    threshold:
      "Hers: no count. Detected positively rather than as the absence of the external " +
      "twin, so a blank Q4 produces neither signal.",
    test: (f) => f.q4SelfAuthored,
  },

  /* ── Across intake · language ──────────────────────────────────────────── */
  {
    key: "obligation_language",
    points: "external",
    row: '"Should" language (3+ instances in intake)',
    threshold:
      'Hers, from H-030: "3+ instances or 1 instance in Q4 (the goal question, where ' +
      'obligation language is most diagnostic)."',
    test: (f) => f.shouldCount >= 3 || f.shouldInQ4,
  },
  {
    key: "self_authored_language",
    points: "internal",
    row: '"I believe" / "I decided" / "I know" language',
    threshold:
      "Ours: the same 3+ count as the external twin, because her table gives no number " +
      "for this row and a lower one would make internal easier to reach than external.",
    test: (f) => f.selfAuthoredCount >= 3,
  },

  /* ── Q6 · the hidden strength ──────────────────────────────────────────── */
  {
    key: "q6_praised_by_others",
    points: "external",
    row: "Hidden strength described as what others praise them for",
    threshold: "Hers: no count.",
    test: (f) => f.q6SourceIsOthers,
  },
  {
    key: "q6_known_about_self",
    points: "internal",
    row: "Hidden strength described as what they know about themselves",
    threshold:
      "Hers: no count. Positive detection again — silence is not self-authorship, and " +
      "reading it as such would invert the asymmetric-error rule.",
    test: (f) => f.q6SelfKnown && !f.q6SourceIsOthers,
  },

  /* ── Q7 · where the gap sits ───────────────────────────────────────────── */
  {
    key: "q7_others_misperception",
    points: "external",
    row: "Gap described as others' misperception",
    threshold: "Hers: no count. H-018 calls Q7 a secondary detection point.",
    test: (f) => f.q7Locus === "others_perception",
  },
  {
    key: "q7_own_communication",
    points: "internal",
    row: "Gap described as own communication failure",
    threshold: "Hers: no count.",
    test: (f) => f.q7Locus === "own_communication",
  },
];

/**
 * The intake cards that produce a frame signal, from their own notes.
 *
 * H-015 calls itself "the primary identity_reference_frame detection point in
 * intake" and H-018 "a secondary detection point"; H-011 says detection "begins
 * here"; H-014 lists the Q4 signals; H-030 (RT-11) is "the strongest intake
 * signal for identity_reference_frame = external. Store as high-confidence."
 *
 * Listed so the classifier work has a scope, and asserted against the document so
 * a reissue that moves detection cannot move it quietly.
 */
export const DETECTION_CARDS: readonly string[] = ["H-011", "H-014", "H-015", "H-018", "H-030"];

/**
 * The reveal templates whose delivery changes with the frame — Priority 1 scope.
 *
 * H-020 (RT-01) needs external users given permission to lead with a strength
 * instead of a title; H-027 (RT-08) is driven by frame rather than audience
 * track; H-034 (RT-15) reads as a strong internal signal. H-033 (RT-14) names the
 * variable to say it is irrelevant for undergraduates, which is an answer, so it
 * is not here.
 */
export const FRAME_AWARE_REVEALS: readonly string[] = ["H-020", "H-027", "H-034"];

/**
 * The frame, from however many signals fired in each direction.
 *
 * Both directions past the threshold is `mixed` rather than a tie-break on count.
 * A user who talks both ways is genuinely both — Kegan's stages are a transition,
 * not a switch — and `mixed` behaves as external anyway, so guessing a winner
 * would add a decision without changing a single delivered sentence.
 */
export function resolveIdentityFrame(evidence: {
  external: number;
  internal: number;
}): IdentityFrame {
  const ext = evidence.external >= SIGNAL_THRESHOLD;
  const int = evidence.internal >= SIGNAL_THRESHOLD;
  if (ext && int) return "mixed";
  if (ext) return "external";
  if (int) return "internal";
  return "insufficient_signal";
}

export type FrameSignals = { external: number; internal: number; fired: string[] };

/** Which detectors fire on already-classified facts. */
export function frameFromFacts(facts: RevealFacts): FrameSignals {
  const fired: string[] = [];
  let external = 0;
  let internal = 0;
  for (const d of DETECTORS) {
    if (!d.test(facts)) continue;
    fired.push(d.key);
    if (d.points === "external") external++;
    else internal++;
  }
  return { external, internal, fired };
}

/**
 * The lowercase-key spelling the intake conversation already passes.
 *
 * Kept so existing callers do not change, and converted rather than duplicated —
 * `Answers` is the shared spelling that `audience-track` and `reveal-facts` use, and
 * two vocabularies for the same eight questions is how they drift.
 */
export function toAnswers(a: IntakeAnswers): Answers {
  return {
    Q1: a.q1,
    Q2: a.q2,
    Q3: a.q3,
    Q4: a.q4,
    Q5: a.q5,
    "Q5.5": a.q55,
    Q6: a.q6,
    Q7: a.q7,
  };
}

/** Which detectors fire on these answers, counted by direction. */
export function readFrameSignals(answers: IntakeAnswers): FrameSignals {
  return frameFromFacts(revealFacts(toAnswers(answers), null));
}

/**
 * How the reveal is framed. The whole of Priority 1.
 *
 * `permission` scaffolds: the gap is something the outside world imposed, and
 * choosing differently is allowed. `direct` challenges: the user knows who they
 * are and needs deployment help, not discovery help.
 */
export function revealMode(frame: IdentityFrame): "permission" | "direct" {
  return frame === "internal" ? "direct" : "permission";
}

/**
 * Never true, and a function rather than a comment so it can be asserted.
 *
 * "The variable is never surfaced to the user, never named, never referenced."
 * Same shape as the rule that no card code reaches a prompt: the way a rule like
 * this survives a refactor is by having a test.
 */
export function isUserFacing(): boolean {
  return false;
}

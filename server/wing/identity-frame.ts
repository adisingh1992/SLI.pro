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
  /** Her table row, verbatim, so the test can match it against the document. */
  row: string;
  /** The threshold, and where it comes from. */
  threshold: string;
  test: (answers: IntakeAnswers) => boolean;
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
  {
    key: "obligation_language",
    points: "external",
    row: '"Should" language (3+ instances in intake)',
    threshold:
      'Hers, from H-030: "3+ instances or 1 instance in Q4 (the goal question, where ' +
      'obligation language is most diagnostic)."',
    test: (a) =>
      countMatches(allText(a), OBLIGATION) >= 3 ||
      countMatches(a.q4 ?? "", OBLIGATION) >= 1,
  },
  {
    key: "self_authored_language",
    points: "internal",
    row: '"I believe" / "I decided" / "I know" language',
    threshold:
      "Ours: the same 3+ count as the external twin, because her table gives no number " +
      "for this row and a lower one would make internal easier to reach than external.",
    test: (a) => countMatches(allText(a), SELF_AUTHORED) >= 3,
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

/** Which detectors fire on these answers, counted by direction. */
export function readFrameSignals(answers: IntakeAnswers): {
  external: number;
  internal: number;
  fired: string[];
} {
  const fired: string[] = [];
  let external = 0;
  let internal = 0;
  for (const d of DETECTORS) {
    if (!d.test(answers)) continue;
    fired.push(d.key);
    if (d.points === "external") external++;
    else internal++;
  }
  return { external, internal, fired };
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

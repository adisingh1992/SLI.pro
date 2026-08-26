/**
 * IG-UX05 — a transition message always has three parts, in one order.
 *
 * Pure. No imports.
 *
 * ── HER GATE, QUOTED ─────────────────────────────────────────────────────
 * "Every transition message must include three elements: (1) **Acknowledgment** of what
 * was just accomplished — specific and concrete, not 'great session.' Name the output:
 * 'Your primary function is Marketing.' (2) **Connection** to the macro goal — how this
 * piece fits the larger puzzle. 'That's the anchor. Everything we build from here starts
 * with this.' (3) **Time estimate** for the next step — 'About 8 minutes.' These three
 * elements, in this order, produce the satisfaction-clarity-motivation sequence."
 *
 * Failure path: "If Wing skips an element → the user feels either unacknowledged (no
 * accomplishment), lost (no connection), or uncertain (no time estimate). All three
 * reduce continuation rate."
 *
 * ── WHY A TYPE AND NOT A CHECKER ─────────────────────────────────────────
 * IG-UX03 got a scanner because its detection is content analysis over every string in
 * the client. This gate's detection is "session state change" — a runtime event — and a
 * static scan cannot reliably tell a transition message from any other paragraph.
 *
 * So the enforcement is structural. `Transition` requires all three fields, and
 * `renderTransition` is the only thing that assembles them, in her order. **You cannot
 * write a transition here that lacks a time estimate**, which is stronger than a test
 * that notices afterwards.
 *
 * ── WHAT WAS WRONG BEFORE ────────────────────────────────────────────────
 * All three Foundation transitions were missing the time estimate, and two were missing
 * the specific output. "Functional identity mapped" is the generic acknowledgment her
 * card rules out by name — the output is a function, and the message should say which
 * one. The durations were never missing data: `foundation-page.tsx` has shown 7-9, 8-10
 * and 9-10 minutes on the session cards all along. They just never reached the moment
 * where the student is deciding whether to continue.
 */

/**
 * How long each Foundation session takes. The single source.
 *
 * These figures are the ones `foundation-page.tsx` has shown on its session cards all
 * along. `new-dashboard.tsx` had its own set — "About 10 minutes", "About 12 minutes",
 * "About 12 minutes" — so the same session was quoted at 12 minutes on one screen and
 * 9-10 on another, and now a third surface (the dashboard recommendation) needed a
 * number too. Three copies of an estimate is three chances to disagree with itself in
 * front of the student who is deciding whether they have time.
 *
 * The ranged figures win because they are the more specific claim and because they are
 * what her transition messages already promise for the NEXT session — the estimate a
 * student is given at the end of session 1 has to be the one they see at the start of
 * session 2.
 */
export const SESSION_MINUTES: Readonly<Record<1 | 2 | 3, string>> = {
  1: "7-9 minutes",
  2: "8-10 minutes",
  3: "9-10 minutes",
};

/**
 * Closes a sentence that ends in a runtime value.
 *
 * Every accomplishment interpolates something the student produced, and those values do
 * not carry their own punctuation. Without this the message ran two sentences together.
 */
function endSentence(text: string): string {
  return /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

/** The audience registers her card adapts for. Everything else takes the neutral form. */
export type TransitionTrack = "undergraduate" | "executive" | "default";

export type Transition = {
  /**
   * (1) What was just produced, naming it.
   *
   * A function rather than a string because her example is a VALUE — "Your primary
   * function is Marketing" — and the value is only known at runtime. A plain string here
   * would have quietly permitted "Great session".
   */
  accomplishment: (outcome: string | null) => string;
  /** (2) How this piece fits the larger puzzle. */
  connection: string;
  /**
   * (3) How long the next step takes, in her words. Null only for the LAST transition,
   * where there is no next step to estimate.
   */
  nextStep: { what: string; minutes: string } | null;
};

/**
 * The three Foundation transitions.
 *
 * Session 3's `nextStep` is null and that is the one legitimate absence: there is no
 * fourth session, so a time estimate would have to be invented. `renderTransition`
 * requires the field to be present and permits it to be null, so the absence is a
 * decision in the data rather than a line someone forgot.
 */
export const FOUNDATION_TRANSITIONS: Readonly<Record<1 | 2 | 3, Transition>> = {
  1: {
    accomplishment: (fn) =>
      fn ? endSentence(`Your primary function is ${fn}`) : "Your primary function is mapped.",
    connection: "That's the anchor. Everything we build from here starts with it.",
    nextStep: { what: "Session 2 identifies the credibility you already have", minutes: SESSION_MINUTES[2] },
  },
  2: {
    accomplishment: (tier) =>
      tier
        ? endSentence(`Your credibility is documented at ${tier}`)
        : "Your measurable expertise is documented.",
    connection:
      "That's the evidence your positioning rests on — claims without it are just assertions.",
    nextStep: { what: "Session 3 turns it into the stories that prove it", minutes: SESSION_MINUTES[3] },
  },
  3: {
    /*
     * The trailing full stop is not cosmetic. The claim is a free-text value, so without
     * it the rendered message read "…makes launches land That's the foundation built" —
     * two sentences run together at exactly the moment the student is being told they
     * finished. `endSentence` is applied to every value-bearing accomplishment for the
     * same reason.
     */
    accomplishment: (claim) =>
      claim ? endSentence(`Your positioning claim: ${claim}`) : "Your positioning stories are captured.",
    connection:
      "That's the foundation built. It is what every module from here reads from.",
    nextStep: null,
  },
};

/**
 * Her two audience adaptations, verbatim in intent.
 *
 * "**Undergraduate:** Slightly warmer acknowledgment… **Executive:** Minimal
 * acknowledgment, heavier on connection."
 *
 * Applied as a prefix and a trim rather than as separate copy per track, so a change to
 * the accomplishment cannot land in one register and miss the other two.
 */
const WARMTH: Readonly<Record<TransitionTrack, string>> = {
  undergraduate: "That's a real piece of work. ",
  executive: "",
  default: "",
};

/**
 * The message, in her order: accomplishment, connection, time estimate.
 *
 * The order is the mechanism, not a formatting preference — "these three elements, in
 * this order, produce the satisfaction-clarity-motivation sequence". Time first would
 * read as a schedule; connection first would read as a lecture.
 */
export function renderTransition(
  t: Transition,
  outcome: string | null,
  track: TransitionTrack = "default",
): string {
  const parts: string[] = [];

  /*
   * Executive gets the acknowledgment and nothing added, per "minimal acknowledgment,
   * heavier on connection". Undergraduate gets the warmer opener. Neither changes what
   * the accomplishment SAYS, which is the part that has to name the output.
   */
  parts.push(`${WARMTH[track]}${t.accomplishment(outcome)}`.trim());
  parts.push(t.connection);
  if (t.nextStep) {
    parts.push(`${t.nextStep.what} — about ${t.nextStep.minutes}.`);
  }

  return parts.join(" ");
}

/**
 * Whether a rendered message has all three elements. For tests, and for anyone adding a
 * transition somewhere this module does not yet reach.
 *
 * Deliberately checks the RENDERED string rather than the record: the failure her card
 * describes is what the student reads, and a record that type-checks can still render to
 * something missing a part if `renderTransition` is changed.
 */
export function transitionParts(rendered: string): {
  hasAccomplishment: boolean;
  hasConnection: boolean;
  hasTimeEstimate: boolean;
  /** True when a time estimate is absent AND that is correct — the final transition. */
  timeEstimateNotApplicable: boolean;
} {
  const time = /\babout\s+[\d–—-]+\s*(?:to\s*\d+\s*)?minutes?\b/i.test(rendered);
  /*
   * "Great session" and friends. Her card names the failure directly — the acknowledgment
   * must be "specific and concrete, not 'great session'" — so a message whose only
   * acknowledgment is praise counts as missing one.
   */
  const generic = /^(?:great|nice|good|well done|awesome|excellent)\b/i.test(rendered.trim());
  return {
    hasAccomplishment: !generic && /\byour\b/i.test(rendered),
    hasConnection: /\bthat's\b|\bthat is\b|\bfrom here\b|\brests on\b|\breads from\b/i.test(rendered),
    hasTimeEstimate: time,
    timeEstimateNotApplicable: !time && /\bfoundation built\b/i.test(rendered),
  };
}

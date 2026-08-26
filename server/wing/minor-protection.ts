/**
 * IG-S06 — who it applies to, after her ruling of 25 August.
 *
 * Pure. Resolves whether minor protection is active; enforces nothing.
 *
 * ── WHAT CHANGED, AND WHY IT HAD TO ──────────────────────────────────────
 * As delivered, IG-S06 was default-on for the undergraduate audience track "until age is
 * established", and Wing never asks age. Read literally that is permanent, and it would
 * have taken Module 6 and Module 9 away from every Berkeley undergraduate for good.
 *
 * Her correction names the category error rather than patching the symptom:
 *
 *   "IG-S06 is triggered by audience track (undergraduate) but it should be triggered by
 *   institutional configuration. Berkeley undergrads are 18+. The undergraduate track is
 *   about career stage, not age."
 *
 * So the trigger moves. Being an undergraduate is not evidence of being a minor, and the
 * two were only ever coupled because one document said so.
 *
 * ── THE TWO WAYS IT TURNS ON ─────────────────────────────────────────────
 * 1. **The institution sets it.** Berkeley off. A future high-school partnership on. This
 *    is configuration, and it is the reason `compileSafety()` cannot own the whole gate.
 * 2. **The user says so.** "If a user in any context explicitly states they're under 18,
 *    full IG-S06 fires regardless of institution setting." Unconditional, and therefore
 *    the half that stays in the prompt constant where no missing pointer can reach it.
 *
 * For Berkeley's 1 September cohort: setting off, all modules open. The lighter tone they
 * get is the undergraduate voice register from profile v2, which is a different thing and
 * was already there. It is not this gate.
 *
 * ── ONE JUDGEMENT, FLAGGED ───────────────────────────────────────────────
 * Her email names one unconditional trigger: an explicit statement of being under 18. Her
 * card also lists high school as current context and parental-permission language as
 * detection signals.
 *
 * We fire on the first two and not the third. "I'm still in high school" is a statement of
 * being school-age and carries the same information as an age; "my mom said I could" is
 * something adults say, and her Berkeley reasoning is exactly that an undergraduate is not
 * a minor. Weak signals are recorded for an admin surface and fire nothing.
 */

/** Institution-level configuration. Off unless an institution turns it on. */
export type MinorProtectionSetting = "off" | "on";

export type MinorProtectionState = {
  /** From the institution's configuration. Absent reads as off. */
  institutionSetting?: MinorProtectionSetting;
  /** The user has said, in their own words, that they are under 18. */
  statedUnder18: boolean;
  /** The user has said they are currently at school. */
  statedInSchool: boolean;
};

export type MinorProtectionVerdict = {
  active: boolean;
  /** Loggable, and never shown to the user. */
  because: string;
  /** True when the user's own statement is what turned it on. */
  overridesInstitution: boolean;
};

export function minorProtectionActive(state: MinorProtectionState): MinorProtectionVerdict {
  if (state.statedUnder18) {
    return {
      active: true,
      because: "the user stated they are under 18 — fires regardless of the institution setting",
      overridesInstitution: true,
    };
  }
  if (state.statedInSchool) {
    return {
      active: true,
      because: "the user stated they are currently at school — same information as an age",
      overridesInstitution: true,
    };
  }
  if ((state.institutionSetting ?? "off") === "on") {
    return {
      active: true,
      because: "the institution has minor protection on for this cohort",
      overridesInstitution: false,
    };
  }
  return {
    active: false,
    because: "institution setting off and nothing stated by the user",
    overridesInstitution: false,
  };
}

/* ── Detection, which never asks ────────────────────────────────────────── */

/**
 * An explicit statement of being under 18.
 *
 * IG-INT03 forbids collecting demographics at intake, so this reads what someone
 * volunteers and nothing else. There is no question anywhere that produces this field.
 *
 * Deliberately narrow. "I'm 17" fires. "I'm turning 18 next month" fires, because they are
 * seventeen now. "I'm 19" does not, and neither does a bare number in a sentence about
 * something else — the scale answers in Phase 3.5 are full of small numbers and none of
 * them is an age.
 *
 * The unit exclusions are not defensive tidying. "I'm 16 years into my career" matched the
 * first version of this pattern, which would have put an experienced professional into a
 * footing that closes Module 6 and Module 9 to them, on the strength of a sentence
 * describing their seniority. The test that caught it is named for it.
 */
const STATED_AGE =
  /\b(?:i(?:'m| am)|im)\s+(?:only\s+)?(1[0-7])\b(?!\s*(?:\/|out of|percent|%|years?|yrs?|months?|weeks?|days?|hours?|hrs?|minutes?|mins?))|\bi(?:'m| am) a minor\b|\bi(?:'m| am) under\s*(?:18|eighteen)\b|\bi turn 18\b|\bi(?:'m| am) turning 18\b/i;

export function statedUnder18(text: string): boolean {
  return STATED_AGE.test(text);
}

/**
 * A statement of being at school now, as distinct from having been.
 *
 * The tense is the whole test. "In high school I ran the yearbook" is an adult telling a
 * story about their evidence, and treating that as a minor signal would put half the
 * Foundation 2 corpus into the protected footing.
 */
const IN_SCHOOL_NOW =
  /\b(?:i(?:'m| am)\s+(?:still\s+)?(?:in|at)\s+(?:high\s*school|secondary\s*school|sixth\s*form)|i(?:'m| am)\s+a\s+(?:high\s*school|secondary\s*school)\s+(?:student|junior|senior|freshman|sophomore)|my\s+high\s*school\b)/i;

const WAS_AT_SCHOOL = /\b(?:in|at|during|back in|when i was (?:in|at))\s+high\s*school\s*,?\s+i\b/i;

export function statedInSchool(text: string): boolean {
  if (WAS_AT_SCHOOL.test(text)) return false;
  return IN_SCHOOL_NOW.test(text);
}

/**
 * Signals her card lists that we deliberately do not fire on.
 *
 * Recorded so an admin surface can show what was seen and a human can override. Firing on
 * these is what her Berkeley ruling argues against: plenty of adults mention a parent.
 */
export type WeakSignal = "parental_permission" | "school_adjacent";

const WEAK: ReadonlyArray<{ signal: WeakSignal; match: RegExp }> = [
  {
    signal: "parental_permission",
    match: /\b(?:my (?:mom|mum|dad|parents?|guardian)\s+(?:said|says|told me|gave me permission|signed)|permission from my (?:mom|mum|dad|parents?))\b/i,
  },
  {
    signal: "school_adjacent",
    match: /\b(?:my (?:teacher|principal|guidance counsel?lor)|home\s*room|before college)\b/i,
  },
];

export function weakSignals(text: string): WeakSignal[] {
  const out: WeakSignal[] = [];
  for (const w of WEAK) if (w.match.test(text)) out.push(w.signal);
  return out;
}

/* ── What being active means ────────────────────────────────────────────── */

/**
 * The restrictions, from her card, in one place.
 *
 * **Nothing enforces these yet.** Module access is a routing decision and the router does
 * not read this. Her card puts it there rather than here — "the institutional
 * configuration should specify which modules are available" — so this is the list whoever
 * builds that reads, and it is deliberately data rather than a check that pretends to run.
 */
export const PROTECTED_SCOPE = {
  /** Compendium v3's card: no Module 9. */
  powerDynamics: false,
  /** Compendium v3's card: no Module 6. Minors are not building a public presence. */
  publicContent: false,
  /** Compendium v3's card: no trust-vault depth. */
  vulnerabilityProbing: false,
  /** Both versions of the gate: career exploration and competency work stay. */
  careerExploration: true,
  competencyAssessment: true,
  /** Her Aug 24 document adds this one. */
  extraPiiCollection: false,
} as const;

/** Modules that close when the gate is active. For the router, when it exists. */
export const CLOSED_MODULES: readonly string[] = ["6", "9"];

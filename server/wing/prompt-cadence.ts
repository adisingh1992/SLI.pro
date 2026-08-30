/**
 * When Wing sends a prompt, and which rhythm it draws from — B2's Triggers 2 and 3.
 *
 * Pure. Takes times as milliseconds so a test can walk a year without waiting.
 *
 * ── THE FEATURE LIST, VERBATIM ───────────────────────────────────────────
 * "Trigger Type: User-Initiated + Prompted (every 5 days for first month, then weekly)"
 *
 *   Trigger 1 (User-initiated): Student writes anytime. Faded prompt rotates.
 *   Trigger 2 (First 30 days): Every 5 days via email or text. Varied question.
 *   Trigger 3 (Ongoing): Weekly after first 30 days.
 *
 * Trigger 1 is the in-app placeholder and needs no schedule — `life-log-store.promptFor`
 * already serves it, and a student writing unprompted is not something to time. This file
 * is Triggers 2 and 3.
 *
 * ── WHICH POOL EACH RHYTHM DRAWS FROM ────────────────────────────────────
 * From the `cadence` column, which already says. Every prompt was classified from her own
 * documents: the 220 micro-journal prompts carry `micro_journal`, and the 71 she marked
 * heartbeat carry `heartbeat`. Part 9.2 names the weekly rhythm explicitly — "Wing should
 * deliver one heartbeat prompt per week to each active user" — so Trigger 3 draws from the
 * heartbeat pool and Trigger 2, whose text names no pool, draws from the micro-journal one.
 *
 * That is reading the data as it is labelled rather than inventing a second mapping. If she
 * wants the first month drawn from heartbeat too, it is a one-line change and the question
 * is in her queue.
 *
 * ── WHY DUE-NESS IS COMPUTED, NOT STORED ─────────────────────────────────
 * The same reason `run-sequences` gives for the other date-driven jobs: each asks the
 * database "who is due today" rather than reading a row written when the last send
 * happened. A day the runner did not execute is then caught up rather than lost — and a
 * scheduler that has not been deployed yet is exactly the case where days get missed.
 *
 * It also means the rule can be tested without a database, which is why it is here and not
 * in a query.
 */

/** Milliseconds in a day. */
const DAY = 24 * 60 * 60 * 1000;

/** Her first month. */
export const FIRST_MONTH_DAYS = 30;
/** Trigger 2. */
export const EARLY_INTERVAL_DAYS = 5;
/** Trigger 3. */
export const ONGOING_INTERVAL_DAYS = 7;

export type CadencePhase = "early" | "ongoing";

/** Which rhythm a phase draws from. See the note above. */
export const POOL_FOR_PHASE: Readonly<Record<CadencePhase, "micro_journal" | "heartbeat">> = {
  early: "micro_journal",
  ongoing: "heartbeat",
};

export type CadenceState = {
  /** When this student joined. The clock Trigger 2's "first month" runs on. */
  enrolledAt: number;
  /** The last prompt Wing sent them, or null if none has gone out. */
  lastSentAt: number | null;
  /**
   * True while a safety hold is open. Suppression already governs sending, and this is
   * here so the answer says WHY nothing is due rather than reporting a date that will not
   * be honoured.
   */
  onHold: boolean;
  /** False for a student who has left, graduated or paused. */
  active: boolean;
};

export type CadenceDecision = {
  due: boolean;
  phase: CadencePhase;
  pool: "micro_journal" | "heartbeat";
  /** When the next prompt is due, in ms. Null when the student gets none at all. */
  nextDueAt: number | null;
  why: string;
};

/**
 * Which side of her first month a moment falls on.
 *
 * Measured from enrolment rather than from the first send, because "first month" is about
 * how long they have been here. A student whose first prompt was late would otherwise get
 * the five-day rhythm for a month starting whenever the scheduler happened to reach them.
 */
export function phaseAt(state: CadenceState, now: number): CadencePhase {
  return now - state.enrolledAt < FIRST_MONTH_DAYS * DAY ? "early" : "ongoing";
}

/** The interval that applies at a moment, in days. */
export function intervalDaysAt(state: CadenceState, now: number): number {
  return phaseAt(state, now) === "early" ? EARLY_INTERVAL_DAYS : ONGOING_INTERVAL_DAYS;
}

/**
 * Whether a prompt is due, and what it should draw from.
 *
 * ── THE FIRST PROMPT ─────────────────────────────────────────────────────
 * Due immediately on enrolment, not five days later. Her Trigger 2 is "every 5 days" for
 * the first month, which is an interval between prompts rather than a delay before the
 * first — and a student who signs up and hears nothing for five days has been onboarded
 * into silence.
 *
 * ── THE INTERVAL IS MEASURED FROM THE LAST SEND ──────────────────────────
 * Not from a fixed grid off the enrolment date. A student who was held for a fortnight
 * comes back to one prompt, not to three that were "missed" arriving at once — which is
 * the failure `suppression.ts` exists to prevent, and it would be undone here by an
 * arithmetic choice.
 */
export function cadenceDecision(state: CadenceState, now: number): CadenceDecision {
  const phase = phaseAt(state, now);
  const pool = POOL_FOR_PHASE[phase];

  if (!state.active) {
    return { due: false, phase, pool, nextDueAt: null, why: "the student is not active" };
  }
  if (state.onHold) {
    /*
     * No date. A hold does not expire on a timer — it lifts when the student comes back,
     * and only then past a seven-day floor — so any date offered here would be fiction.
     */
    return { due: false, phase, pool, nextDueAt: null, why: "a safety hold is open" };
  }

  if (state.lastSentAt === null) {
    return {
      due: true,
      phase,
      pool,
      nextDueAt: now,
      why: "no prompt has been sent yet",
    };
  }

  const nextDueAt = state.lastSentAt + intervalDaysAt(state, now) * DAY;
  const due = now >= nextDueAt;

  return {
    due,
    phase,
    pool,
    nextDueAt,
    why: due
      ? `${intervalDaysAt(state, now)} days since the last prompt`
      : `next due in ${Math.ceil((nextDueAt - now) / DAY)} day(s)`,
  };
}

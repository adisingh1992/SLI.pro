/**
 * The safety hold — what Wing stops doing after IG-S01 fires, and for how long.
 *
 * Pure. Records nothing, schedules nothing; it answers questions about a recorded state.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────
 * If IG-S01 fires, all Wing-initiated contact stops. IG-S01 is the crisis-language gate,
 * the highest-weighted rule in the platform, and the failure this prevents is concrete —
 * a cheerful "here's what I noticed about your patterns this month" arriving three days
 * after someone wrote that they don't see the point of anything anymore. H-RC13 names
 * that as "the worst thing this system can do".
 *
 * ── SEVEN DAYS IS A FLOOR, NOT A DURATION ────────────────────────────────
 * The first version of this module had the hold expire after seven days. That was wrong,
 * and Danielle's correction of 25 August says why in one line:
 *
 *   "Seven days is the minimum hold, not the duration. After seven days, the hold does
 *   not auto-lift — it stays until the user re-engages on their own. Auto-resume is
 *   itself a scheduled re-contact, which is exactly what the hold exists to prevent."
 *
 * That last sentence is the whole argument. A timer that resumes contact on day eight is
 * a scheduled message with extra steps. So the hold lifts on an action by the user and
 * on nothing else.
 *
 * ── THE ONE EXCEPTION, AND ITS EXACT WORDS ───────────────────────────────
 * "If the user hasn't returned after 30 days, Wing sends one soft check-in — not
 * coaching, not a prompt. 'I'm here when you're ready.' That's the only automated
 * contact during a hold."
 *
 * One message, once, at day 30, and it is not one of the outbound kinds below — it is an
 * exception to them. Which is why `softCheckInDue` is a separate question rather than a
 * channel that happens to be unsuppressed.
 *
 * ── RADAR, SETTLED ───────────────────────────────────────────────────────
 * H-RC10's failure_path used to say "Radar continues in the background", which kept an
 * automated channel running for exactly the user the hold is for. Her replacement line,
 * 25 August: "Radar pauses with everything else during a suppression hold. No automated
 * contact of any kind." There is no flag for this any more, because there is no longer a
 * second possibility.
 *
 * ── WHAT IS NOT SUPPRESSED, AND WHY IT IS THE MORE IMPORTANT HALF ────────
 * A hold stops Wing from *reaching out*. It must never stop Wing from answering. Someone
 * in distress who opens the app and types is the person this platform most needs to
 * respond to, and a suppression that silenced them would turn a safety measure into
 * abandonment. `mayRespondToUser()` is a function rather than a comment for the same
 * reason `isCoachingInput()` is: a rule survives a refactor by having a test.
 *
 * IG-S01 already governs *how* Wing answers — stop coaching, name the boundary, direct
 * to a person, wait. This module governs only whether Wing speaks first.
 */

/** Everything Wing can send unprompted. All of it stops. */
export type OutboundKind =
  | "reveal"
  | "radar"
  | "micro_journal"
  | "heartbeat"
  | "check_in"
  | "email"
  | "sms"
  | "push"
  | "in_app_nudge";

export const OUTBOUND_KINDS: readonly OutboundKind[] = [
  "reveal",
  "radar",
  "micro_journal",
  "heartbeat",
  "check_in",
  "email",
  "sms",
  "push",
  "in_app_nudge",
];

/** Days. The floor, below which the hold cannot lift whatever the user does. */
export const HOLD_MINIMUM_DAYS = 7;

/** Days. After this, with no return, the single permitted message. */
export const SOFT_CHECKIN_DAY = 30;

/** Her words, and short on purpose. Not coaching, not a prompt. */
export const SOFT_CHECKIN_TEXT = "I'm here when you're ready.";

const DAY = 24 * 60 * 60 * 1000;

/**
 * One firing of a safety gate.
 *
 * `rule` is recorded but not branched on: only IG-S01 creates a hold today, and a second
 * gate that needed one would need its own duration rather than inheriting this one.
 */
export type SafetyHold = {
  rule: "IG-S01";
  /** Epoch milliseconds. */
  firedAt: number;
  /** Optional, for an admin surface. Never rendered to the user. */
  note?: string;
};

/**
 * Everything the hold decision reads.
 *
 * `lastUserInitiatedAt` means the user came back of their own accord — opened the app,
 * started a session. It must not be set by Wing having sent something and the user
 * replying to it, because then the hold would lift on the strength of the contact it
 * exists to prevent.
 */
export type HoldState = {
  holds: readonly SafetyHold[];
  lastUserInitiatedAt: number | null;
  /** When the single soft check-in went out, if it has. */
  softCheckInSentAt: number | null;
};

export function holdMinimumEndsAt(hold: SafetyHold): number {
  return hold.firedAt + HOLD_MINIMUM_DAYS * DAY;
}

/**
 * Whether the user has done the thing that lifts a hold.
 *
 * ── ONE READING, AND IT IS A READING ─────────────────────────────────────
 * Her sentence is "after seven days, the hold does not auto-lift — it stays until the
 * user re-engages on their own". A user who opened the app on day two and not since has
 * re-engaged, in the plain sense, and under the loose reading their hold lifts by itself
 * on day seven. That is a timer resuming contact, which her own stated reason rules out.
 *
 * So the return has to land at or after the floor. Flagged as our reading rather than
 * her words, and it is one comparison to change if she means the other.
 */
export function hasReturned(state: HoldState, hold: SafetyHold): boolean {
  const at = state.lastUserInitiatedAt;
  return at !== null && at >= holdMinimumEndsAt(hold);
}

/**
 * The hold in force, or null.
 *
 * A second firing restarts the clock rather than extending the first: the floor runs from
 * the last thing the user said, which is the only reading under which it means anything.
 */
export function activeHold(state: HoldState, now: number): SafetyHold | null {
  let latest: SafetyHold | null = null;
  for (const h of state.holds) {
    if (h.firedAt > now) continue;
    if (!latest || h.firedAt > latest.firedAt) latest = h;
  }
  if (!latest) return null;

  if (now < holdMinimumEndsAt(latest)) return latest;
  return hasReturned(state, latest) ? null : latest;
}

export type SuppressionVerdict = {
  suppressed: boolean;
  /** Loggable. Says why, and what would end it. */
  why: string;
  /** Days the hold has been in force, or null when nothing is held. */
  heldForDays: number | null;
};

/** Whether Wing may send this kind of message right now. Nothing is exempt. */
export function isSuppressed(
  kind: OutboundKind,
  state: HoldState,
  now: number,
): SuppressionVerdict {
  const hold = activeHold(state, now);
  if (!hold) {
    return { suppressed: false, why: "no active safety hold", heldForDays: null };
  }

  const days = Math.floor((now - hold.firedAt) / DAY);
  const why =
    days < HOLD_MINIMUM_DAYS
      ? `safety hold, day ${days} of a ${HOLD_MINIMUM_DAYS}-day minimum`
      : `safety hold, day ${days}; lifts when the user comes back on their own`;

  return { suppressed: true, why: `${kind} held — ${why}`, heldForDays: days };
}

/** Every outbound kind currently held. Empty when nothing is. */
export function suppressedKinds(state: HoldState, now: number): OutboundKind[] {
  const out: OutboundKind[] = [];
  for (const k of OUTBOUND_KINDS) if (isSuppressed(k, state, now).suppressed) out.push(k);
  return out;
}

/**
 * The single permitted message.
 *
 * Deliberately not an `OutboundKind`. Everything in that list is suppressed without
 * exception, and modelling the check-in as a tenth kind that happens to be allowed is how
 * it ends up allowed on day three by a caller looping over the list.
 */
export function softCheckInDue(state: HoldState, now: number): boolean {
  const hold = activeHold(state, now);
  if (!hold) return false;
  if (state.softCheckInSentAt !== null) return false;
  if (now - hold.firedAt < SOFT_CHECKIN_DAY * DAY) return false;
  // "If the user hasn't returned after 30 days" — any return at all, not the qualified
  // kind that lifts the hold. Someone who came back on day two is not who this is for.
  const at = state.lastUserInitiatedAt;
  if (at !== null && at >= hold.firedAt) return false;
  return true;
}

/**
 * Never false.
 *
 * A hold stops Wing speaking first. It does not, and must not, stop Wing answering
 * someone who opens the app and types — that person is the one the hold exists for.
 * IG-S01 governs what Wing says to them; nothing here governs whether it says anything.
 */
export function mayRespondToUser(): boolean {
  return true;
}

/**
 * Days since the most recent firing, for the Reveal's Gate 1.
 *
 * ── THE SAME NUMBER, A DIFFERENT QUESTION ────────────────────────────────
 * Gate 1 asks whether IG-S01 fired "within the trailing 7 days" — a window, which closes.
 * The platform hold has no window: it persists until the user returns. They share the
 * number 7 and they are not the same rule, so on day twenty with no return Gate 1 passes
 * and the hold still suppresses the Reveal.
 *
 * The hold outranks Gate 1. Anything scheduling a Reveal has to ask both, which is why
 * this stays a separate function rather than Gate 1 being folded into `isSuppressed`.
 */
export function daysSinceCrisisFlag(state: HoldState, now: number): number | null {
  let latest: number | null = null;
  for (const h of state.holds) {
    if (h.firedAt > now) continue;
    if (latest === null || h.firedAt > latest) latest = h.firedAt;
  }
  if (latest === null) return null;
  return Math.floor((now - latest) / DAY);
}

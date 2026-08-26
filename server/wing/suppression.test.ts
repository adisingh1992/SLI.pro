/**
 * The safety hold.
 *
 * Run:  npx tsx server/wing/suppression.test.ts
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────
 * Three failures, and the first two point in opposite directions:
 *
 *   · Wing reaches out during a hold. A Reveal, a Radar item or a cheerful nudge landing
 *     days after someone wrote something frightening. The failure the rule exists for.
 *   · Wing goes silent on someone who opens the app and types. A suppression covering
 *     inbound as well would turn a safety measure into abandonment, and it is easy to
 *     build by accident — "pause contact with this user" reads as symmetric until you
 *     say it out loud.
 *   · **The hold expires on a timer.** This is the one the first version of this module
 *     got wrong, and the correction names the reason: "Auto-resume is itself a scheduled
 *     re-contact, which is exactly what the hold exists to prevent." A hold that lifts
 *     on day eight has not protected anyone; it has delayed the message by a week.
 */
import {
  HOLD_MINIMUM_DAYS,
  OUTBOUND_KINDS,
  SOFT_CHECKIN_DAY,
  SOFT_CHECKIN_TEXT,
  type HoldState,
  type SafetyHold,
  activeHold,
  daysSinceCrisisFlag,
  isSuppressed,
  mayRespondToUser,
  softCheckInDue,
  suppressedKinds,
} from "./suppression";
import { SAFETY_HOLD_DAYS, gate1 } from "./reveal-gates";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_780_000_000_000;
const fired = (daysAgo: number): SafetyHold => ({ rule: "IG-S01", firedAt: NOW - daysAgo * DAY });

function state(p: Partial<HoldState> & { daysAgo?: number }): HoldState {
  return {
    holds: p.holds ?? (p.daysAgo === undefined ? [] : [fired(p.daysAgo)]),
    lastUserInitiatedAt: p.lastUserInitiatedAt ?? null,
    softCheckInSentAt: p.softCheckInSentAt ?? null,
  };
}

console.log("\nsuppression\n");

console.log("Everything Wing sends unprompted stops");
{
  const before = failures;
  const s = state({ daysAgo: 1 });
  const held = suppressedKinds(s, NOW);
  if (held.length !== OUTBOUND_KINDS.length) {
    const missing: string[] = [];
    for (const k of OUTBOUND_KINDS) if (held.indexOf(k) < 0) missing.push(k);
    fail(`these carried on during a hold: ${missing.join(", ")}`);
  }
  const v = isSuppressed("reveal", s, NOW);
  if (!v.suppressed) fail("the Reveal is the headline case and must be held");
  if (v.heldForDays !== 1) fail(`heldForDays was ${v.heldForDays}`);

  /*
   * Radar is in the list and stays in it. H-RC10 used to say "Radar continues in the
   * background"; her replacement line is "Radar pauses with everything else during a
   * suppression hold. No automated contact of any kind." There is no flag to flip now.
   */
  if (!isSuppressed("radar", s, NOW).suppressed) fail("Radar pauses with everything else");
  if (failures === before) ok(`all ${OUTBOUND_KINDS.length} outbound kinds held, Radar included`);
}

console.log("\nBut Wing still answers someone who types");
{
  const before = failures;
  if (!mayRespondToUser()) fail("a safety hold must never silence a reply");
  for (const k of OUTBOUND_KINDS) {
    if (String(k).indexOf("reply") >= 0 || String(k).indexOf("response") >= 0) {
      fail(`${k} looks inbound — this list is things Wing sends first`);
    }
  }
  if (failures === before) ok("inbound is untouched; the list is only what Wing sends first");
}

console.log("\nThe hold does not lift on a timer");
{
  const before = failures;
  /*
   * The correction, and the reason it is not a detail: "Seven days is the minimum hold,
   * not the duration. After seven days, the hold does not auto-lift — it stays until the
   * user re-engages on their own."
   */
  if (activeHold(state({ daysAgo: HOLD_MINIMUM_DAYS - 1 }), NOW) === null) {
    fail("day 6 is inside the minimum");
  }
  if (activeHold(state({ daysAgo: HOLD_MINIMUM_DAYS + 1 }), NOW) === null) {
    fail("day 8 with no return must STILL be held — this is the bug the correction fixes");
  }
  for (const d of [8, 14, 30, 90, 365]) {
    if (!isSuppressed("email", state({ daysAgo: d }), NOW).suppressed) {
      fail(`day ${d} with no return was not held`);
    }
  }
  if (failures === before) ok("held at 6, 8, 14, 30, 90 and 365 days with no return");
}

console.log("\nIt lifts when the user comes back, and not before the floor");
{
  const before = failures;

  // Came back on day 10, after the floor. Hold lifts.
  const returned = state({ daysAgo: 20, lastUserInitiatedAt: NOW - 10 * DAY });
  if (activeHold(returned, NOW) !== null) fail("a return after the floor lifts the hold");
  if (isSuppressed("radar", returned, NOW).suppressed) fail("nothing is held once it lifts");

  /*
   * Came back on day 2 and not since. Under a loose reading the hold lifts by itself on
   * day 7 — which is a timer resuming contact, the thing her reason rules out. So the
   * return has to land at or after the floor. Our reading, flagged as ours.
   */
  const earlyOnly = state({ daysAgo: 20, lastUserInitiatedAt: NOW - 18 * DAY });
  if (activeHold(earlyOnly, NOW) === null) {
    fail("a visit inside the minimum must not lift the hold — that is an auto-lift on a timer");
  }

  // A return before the floor has elapsed cannot lift it early either.
  const tooEarly = state({ daysAgo: 3, lastUserInitiatedAt: NOW - 1 * DAY });
  if (activeHold(tooEarly, NOW) === null) fail("nothing lifts a hold inside its minimum");

  // A second firing restarts the floor.
  const refired = state({
    holds: [fired(30), fired(1)],
    lastUserInitiatedAt: NOW - 20 * DAY,
  });
  const a = activeHold(refired, NOW);
  if (!a || a.firedAt !== NOW - 1 * DAY) fail("the most recent firing owns the hold");
  if (!isSuppressed("push", refired, NOW).suppressed) {
    fail("a return that predates the newest firing does not lift it");
  }

  if (failures === before) ok("lifts on a return at or after day 7, and on nothing else");
}

console.log("\nOne soft check-in at day 30, and only one");
{
  const before = failures;
  /*
   * "If the user hasn't returned after 30 days, Wing sends one soft check-in — not
   * coaching, not a prompt. 'I'm here when you're ready.' That's the only automated
   * contact during a hold."
   */
  if (softCheckInDue(state({ daysAgo: 29 }), NOW)) fail("day 29 is too early");
  if (!softCheckInDue(state({ daysAgo: SOFT_CHECKIN_DAY }), NOW)) fail("day 30 with no return is due");
  if (!softCheckInDue(state({ daysAgo: 45 }), NOW)) fail("still due if it was never sent");

  // Once only.
  const sent = state({ daysAgo: 45, softCheckInSentAt: NOW - 15 * DAY });
  if (softCheckInDue(sent, NOW)) fail("one means one");

  // Not for someone who came back at all — even a visit that did not lift the hold.
  const visited = state({ daysAgo: 45, lastUserInitiatedAt: NOW - 40 * DAY });
  if (softCheckInDue(visited, NOW)) fail("this is for a user who has not returned");

  // Not when there is no hold.
  if (softCheckInDue(state({}), NOW)) fail("no hold, no check-in");

  // It is not a channel. Everything in the list stays suppressed on the day it is due.
  const due = state({ daysAgo: SOFT_CHECKIN_DAY });
  if (suppressedKinds(due, NOW).length !== OUTBOUND_KINDS.length) {
    fail("the check-in is an exception to the outbound kinds, not one of them");
  }
  if (SOFT_CHECKIN_TEXT !== "I'm here when you're ready.") fail("her wording, verbatim");
  if (SOFT_CHECKIN_TEXT.indexOf("?") >= 0) fail("not a prompt — no question in it");

  if (failures === before) ok(`due at day ${SOFT_CHECKIN_DAY}, once, and never a channel`);
}

console.log("\nThe hold outranks Gate 1, and they are not the same rule");
{
  const before = failures;
  /*
   * They share the number 7 and ask different questions. Gate 1 asks whether IG-S01 fired
   * "within the trailing 7 days" — a window, which closes. The hold has no window.
   *
   * So at day 20 with no return, Gate 1 passes and the hold still suppresses. Anything
   * scheduling a Reveal has to ask both. An implementation that asked only Gate 1 would
   * deliver a monthly Reveal to someone who wrote something frightening three weeks ago
   * and has not come back since.
   */
  const s = state({ daysAgo: 20 });
  const g = gate1({
    foundation1Complete: true,
    daysSinceLastReveal: 40,
    daysSinceCrisisFlag: daysSinceCrisisFlag(s, NOW),
  });
  if (!g.passed) fail("Gate 1's 7-day window has closed by day 20, so it passes");
  if (!isSuppressed("reveal", s, NOW).suppressed) {
    fail("the hold must still suppress the Reveal — this is the gap between the two rules");
  }

  // Inside the window both agree.
  const early = state({ daysAgo: 2 });
  const g2 = gate1({
    foundation1Complete: true,
    daysSinceLastReveal: 40,
    daysSinceCrisisFlag: daysSinceCrisisFlag(early, NOW),
  });
  if (g2.passed) fail("day 2 is inside Gate 1's window and must fail it");
  if (!isSuppressed("reveal", early, NOW).suppressed) fail("and the hold holds too");

  if (HOLD_MINIMUM_DAYS !== SAFETY_HOLD_DAYS) {
    fail(
      `the floor (${HOLD_MINIMUM_DAYS}d) and Gate 1's window (${SAFETY_HOLD_DAYS}d) no longer ` +
        "share a number — check that is deliberate, since they are different rules that " +
        "happen to agree on 7",
    );
  }
  if (daysSinceCrisisFlag(state({}), NOW) !== null) fail("never fired is null, not zero");
  if (daysSinceCrisisFlag(state({ daysAgo: 0 }), NOW) !== 0) fail("fired today is 0 days ago");

  if (failures === before) ok("day 20: Gate 1 passes, the hold suppresses anyway");
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);

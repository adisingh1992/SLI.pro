import { db } from "../db";
import { log } from "../logger";
import * as messaging from "./messaging-store";
import { recordSoftCheckIn, softCheckInCandidates, softCheckInIsDue } from "./safety-hold-store";

/**
 * The one message a safety hold permits.
 *
 * ── HER RULING, VERBATIM ─────────────────────────────────────────────────
 * "If the user hasn't returned after 30 days, Wing sends one soft check-in — not coaching,
 * not a prompt. 'I'm here when you're ready.' That's the only automated contact during a
 * hold."
 *
 * `softCheckInDue` has encoded that since the hold store was written, and nothing called
 * it. A hold opened on 1 September would have gone quiet on 1 October and stayed quiet.
 *
 * ── WHY THIS DOES NOT ASK maySend ────────────────────────────────────────
 * Every other outbound message asks `maySend`, which refuses while a hold is open — the
 * gate lives at the top of `sendTemplated`, so it is asked once rather than at eight call
 * sites. This one is the exception TO that suppression, so asking would refuse the single
 * thing the rule requires; `sendTemplated` recognises it by template key, which is why
 * that key is `messaging.SOFT_CHECK_IN_TEMPLATE` and not a string typed twice.
 *
 * Worth recording that this comment was true of the design and false of the code for the
 * whole time it stood: `maySend` had no caller at all, so this was the exception to
 * nothing.
 *
 * That is also why `suppression.ts` models it as its own question rather than a tenth
 * `OutboundKind` — its own comment says so: "modelling the check-in as a tenth kind that
 * happens to be allowed is how it ends up allowed on day three by a caller looping over
 * the list."
 *
 * ── WHY THE SQL DOES NOT DECIDE ──────────────────────────────────────────
 * `softCheckInCandidates` narrows to holds that could qualify. `softCheckInIsDue` decides,
 * and it is the tested one — including the rule the query cannot express: "any return at
 * all, not the qualified kind that lifts the hold", which reads the student's own turns
 * rather than the holds table. A student who came back on day two and went quiet again is
 * not who this message is for.
 *
 * ── SEND, THEN RECORD ────────────────────────────────────────────────────
 * If the send succeeds and the record fails, the next hourly run sends again. If the order
 * were reversed and the send failed, the student would be marked as checked in and would
 * get nothing, ever — the hold has no other exit but their own return.
 *
 * A second "I'm here when you're ready." a month into someone's silence is gentle and
 * visible in the log. Silence where the rule requires a message is neither.
 */

export type SoftCheckInResult = {
  /** How many open holds were old enough to consider. */
  candidates: number;
  sent: number;
  /** Considered and correctly not sent — came back, or already checked in. */
  skipped: number;
  failed: number;
};

export async function runDueSoftCheckIns(now = Date.now()): Promise<SoftCheckInResult> {
  const result: SoftCheckInResult = { candidates: 0, sent: 0, skipped: 0, failed: 0 };

  const candidates = await softCheckInCandidates(db as any);
  result.candidates = candidates.length;

  for (const studentId of candidates) {
    try {
      if (!(await softCheckInIsDue(db as any, studentId, now))) {
        result.skipped++;
        continue;
      }

      const to = await messaging.recipient(studentId);
      if (!to?.email) {
        /*
         * Not counted as a failure and not recorded as sent. A student with no address on
         * file is a data problem, and marking the check-in done would spend the one
         * message they are owed on nothing.
         */
        log(`soft check-in for student ${studentId}: no email address`, "safety");
        result.skipped++;
        continue;
      }

      const send = await messaging.sendTemplated({
        studentId,
        to: to.email,
        templateKey: messaging.SOFT_CHECK_IN_TEMPLATE,
        vars: { firstName: to.firstName ?? "there" },
      });

      if (!send.sent) {
        /*
         * Left unrecorded on purpose, so the next run tries again. A refused send is the
         * case where "send, then record" earns itself: nothing was delivered, so nothing
         * is marked.
         */
        log(`soft check-in for student ${studentId} not sent: ${send.reason}`, "safety");
        result.failed++;
        continue;
      }

      await recordSoftCheckIn(db as any, studentId);
      result.sent++;
      log(`soft check-in sent to student ${studentId}`, "safety");
    } catch (err) {
      /*
       * Per student, so one broken row cannot cost everybody else their message. The
       * count surfaces in the runner, which exits non-zero when any job reports failures.
       */
      result.failed++;
      log(`soft check-in failed for student ${studentId}: ${(err as Error).message}`, "safety");
    }
  }

  if (result.failed) {
    throw new Error(
      `${result.failed} of ${result.candidates} soft check-in(s) failed — see the safety log`,
    );
  }

  return result;
}

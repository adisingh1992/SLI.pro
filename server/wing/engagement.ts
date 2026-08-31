import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { sessions, sessionArtifacts, sliRecords, students, users } from "@shared/wing-schema";
import { log } from "../logger";
import * as messaging from "./messaging-store";
import { intervalDaysAt } from "./prompt-cadence";
import { populationTagsFor } from "./population-tags";
import { LIVE_SLI_STATUSES } from "./sli-store";
import { renderOpener } from "./opener";

/**
 * Engagement sequences — the triggers behind Feature List B3.
 *
 * Two shapes of trigger, and they are different in an important way:
 *
 *   EVENT     fires now, from the request that caused it (registration,
 *             session completion). Called after res.end() so a student never
 *             waits on an email.
 *   SCHEDULED fires later, from the runner below (welcome 2 and 3, dormancy).
 *             In production this becomes an Azure Function on a timer; the
 *             runner is deliberately transport-agnostic so that swap is
 *             configuration rather than a rewrite.
 *
 * Everything here is best-effort and never throws. A failed email must not
 * fail the registration or the session that triggered it — and the send is
 * logged to message_events either way, so a silent failure is still visible.
 */

/**
 * Foundation session number → the module slug that now addresses it.
 *
 * The chat is addressed by slug, not by session number, so "your next session" in the
 * completion email needs the mapping. Falls back to the first module rather than
 * producing `/chat/undefined`: a student who has just finished Session 3 has no next
 * one, and the link is only rendered when the template asks for it.
 */
const MODULE_SLUG: Readonly<Record<number, string>> = {
  1: "discover_your_function",
  2: "prove_your_credibility",
  3: "tell_your_stories",
};

/*
 * ── THE PATHS BELOW ARE THE NEW STUDENT ROUTES ──────────────────────────
 * Every link in an outbound email used to point at a screen the MyWing rebuild retired:
 * /foundation/session/1, /dashboard, /log, /portfolio, /linkedin-content-drafts. The
 * router redirects all five, so nothing broke — but a redirect is a safety net, not a
 * destination, and the day somebody prunes those routes the emails start landing on a
 * 404 with no test failing. They point at the real thing instead.
 */
const APP_URL = () => process.env.APP_BASE_URL || "http://localhost:5173";

/* ── Event triggers ─────────────────────────────────────────────────────── */

/**
 * S1 — starts the welcome sequence at registration.
 *
 * Sends the first email immediately; steps 2 and 3 are scheduled at +48h and
 * +5 days and delivered by the runner.
 */
export async function onRegistered(studentId: number): Promise<void> {
  try {
    const to = await messaging.recipient(studentId);
    if (!to?.email) return;

    /*
     * ── DORMANCY IS ENROLLED HERE, NOT ON THE FIRST SIGN OF LIFE ──────────
     * `resetDormancy` creates the sequence row, and its only two callers were
     * completing a session and writing a log entry. So the day-14/19/24 sequence
     * could only ever reach a student who had already done something — and the
     * population S3 exists for is the one that registers and then does not.
     * They had no row, so nothing was ever due, and the runner had nothing to
     * find. A re-engagement sequence that cannot reach the disengaged.
     *
     * It sits ABOVE the three early returns below on purpose. Put after them, a
     * student whose welcome mail failed to send would be un-enrolled as well as
     * un-welcomed, which is the same bug with a smaller blast radius.
     */
    await resetDormancy(studentId);

    if (await messaging.alreadySent(studentId, "welcome_1")) return;

    const result = await messaging.sendTemplated({
      studentId,
      to: to.email,
      templateKey: "welcome_1",
      sequenceKey: "welcome",
      sequenceStep: 1,
      vars: {
        firstName: to.firstName ?? "there",
        sessionLink: `${APP_URL()}/chat/discover_your_function`,
      },
    });

    // The sequence does not start on a failed send. Starting it anyway would
    // put the student at step 1 having received nothing, and they would meet
    // Wing for the first time in email 2 — which reads as a follow-up to a
    // message they never got.
    if (!result.sent) {
      log(`welcome_1 not sent to student ${studentId} (${result.reason}) — sequence not started`, "engagement");
      return;
    }

    // Step 1 is done; the runner picks up step 2 in 48 hours.
    await messaging.startSequence(studentId, "welcome", hoursFromNow(48));
    await messaging.advanceSequence({
      studentId,
      sequenceKey: "welcome",
      step: 1,
      nextRunAt: hoursFromNow(48),
    });
  } catch (err) {
    log(`welcome sequence failed for student ${studentId}: ${(err as Error).message}`, "engagement");
  }
}

/**
 * S2 — session completion, within the hour.
 *
 * The insight is pulled from the session artifact rather than composed here.
 * Generic praise would be the hollow-enthusiasm anti-pattern the Voice Guide
 * names; if there is no real insight to report, the email is not sent at all.
 */
export async function onSessionCompleted(params: {
  studentId: number;
  sessionId: number;
  sessionNumber: number;
}): Promise<void> {
  try {
    const to = await messaging.recipient(params.studentId);
    if (!to?.email) return;

    const templateKey = `session_complete_${params.sessionNumber}`;
    if (await messaging.alreadySent(params.studentId, templateKey)) return;

    const [artifact] = await db
      .select({ content: sessionArtifacts.content })
      .from(sessionArtifacts)
      .where(eq(sessionArtifacts.sessionId, params.sessionId))
      .orderBy(desc(sessionArtifacts.createdAt))
      .limit(1);

    const content = (artifact?.content ?? {}) as Record<string, any>;

    // Reasoning is the model's own account of what it saw in the transcript,
    // which is exactly what "What I noticed" should carry. Trimmed to one
    // sentence: an email is not the place for the full analysis.
    const insight = firstSentence(content.reasoning ?? content.commitmentStatement ?? "");

    if (!insight) {
      log(
        `session ${params.sessionId} completed with no usable insight — completion email skipped`,
        "engagement",
      );
      return;
    }

    let sliStatement = "";
    if (params.sessionNumber === 3) {
      const [sli] = await db
        .select({ statement: sliRecords.statement })
        .from(sliRecords)
        .where(
          and(
            eq(sliRecords.studentId, params.studentId),
            inArray(sliRecords.status, LIVE_SLI_STATUSES as any),
          ),
        )
        .orderBy(desc(sliRecords.createdAt))
        .limit(1);
      sliStatement = sli?.statement ?? "";
    }

    const result = await messaging.sendTemplated({
      studentId: params.studentId,
      to: to.email,
      templateKey,
      sequenceKey: "session_completion",
      sequenceStep: params.sessionNumber,
      vars: {
        firstName: to.firstName ?? "there",
        primaryFunction: content.primaryFunction ?? content.lockedFunction ?? null,
        insight,
        sliStatement,
        nextSessionLink: `${APP_URL()}/chat/${MODULE_SLUG[params.sessionNumber + 1] ?? "discover_your_function"}`,
        dashboardLink: `${APP_URL()}/`,
      },
    });

    if (!result.sent) {
      log(
        `${templateKey} not sent to student ${params.studentId}: ${result.reason}`,
        "engagement",
      );
    }

    // Finishing a session is activity, so any dormancy clock restarts.
    await resetDormancy(params.studentId);

    /*
     * The life log nudges begin after Session 1, not at registration.
     *
     * Two reasons. A student who has not yet done a session is already inside
     * the welcome sequence, and stacking a second cadence on top reads as
     * pestering from a platform they have barely used. And the log is a record
     * kept against a position — before Session 1 there is no position to keep
     * it against, so the prompts would land without a reason to answer them.
     *
     * startSequence is a no-op when one already exists, so replaying Session 1
     * does not restart the cadence.
     */
    if (params.sessionNumber === 1) {
      await messaging.startSequence(params.studentId, "life_log", daysFromNow(5));
    }
  } catch (err) {
    log(
      `completion email failed for session ${params.sessionId}: ${(err as Error).message}`,
      "engagement",
    );
  }
}

/** Any meaningful activity restarts the dormancy clock at day 14. */
export async function resetDormancy(studentId: number): Promise<void> {
  try {
    await messaging.startSequence(studentId, "dormancy", daysFromNow(14));
    await messaging.advanceSequence({
      studentId,
      sequenceKey: "dormancy",
      step: 0,
      nextRunAt: daysFromNow(14),
    });
  } catch (err) {
    log(`dormancy reset failed for student ${studentId}: ${(err as Error).message}`, "engagement");
  }
}

/* ── The runner ─────────────────────────────────────────────────────────── */

/**
 * Delivers every sequence step that is due.
 *
 * Called from a timer. In production this is an Azure Function; locally it can
 * be run by hand. Keeping the scheduling decision outside this function is
 * what makes that swap configuration rather than a rewrite.
 */
export async function runDueSequences(now = new Date()): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  const due = await messaging.dueSequences(now);

  for (const item of due) {
    try {
      const to = await messaging.recipient(item.studentId);
      if (!to?.email) {
        skipped++;
        continue;
      }

      const vars = {
        firstName: to.firstName ?? "there",
        sessionLink: `${APP_URL()}/chat/discover_your_function`,
        dashboardLink: `${APP_URL()}/`,
      };

      if (item.sequenceKey === "welcome") {
        const step = item.currentStep + 1;
        if (step > 3) {
          await messaging.advanceSequence({
            studentId: item.studentId,
            sequenceKey: "welcome",
            step: item.currentStep,
            nextRunAt: null,
            done: true,
          });
          continue;
        }

        // Someone who has started working does not need to be told to start.
        if (await hasStartedASession(item.studentId)) {
          await messaging.advanceSequence({
            studentId: item.studentId,
            sequenceKey: "welcome",
            step,
            nextRunAt: null,
            done: true,
          });
          skipped++;
          continue;
        }

        const r = await messaging.sendTemplated({
          studentId: item.studentId,
          to: to.email,
          templateKey: `welcome_${step}`,
          sequenceKey: "welcome",
          sequenceStep: step,
          vars,
        });

        // A refused send does not advance the step. Advancing anyway silently
        // burns that email — the student never receives it and the sequence
        // moves on as though they had. The next run retries the same step.
        if (!r.sent) {
          log(`welcome_${step} not sent to student ${item.studentId}: ${r.reason}`, "engagement");
          skipped++;
          continue;
        }
        sent++;

        // Step 2 at +48h from step 1, step 3 at +5 days from registration.
        await messaging.advanceSequence({
          studentId: item.studentId,
          sequenceKey: "welcome",
          step,
          nextRunAt: step === 2 ? daysFromNow(3) : null,
          done: step >= 3,
        });
        continue;
      }

      if (item.sequenceKey === "dormancy") {
        const step = item.currentStep + 1;

        // Day 14, 19, 24 — then silence, per B3/S3. The silence is the design,
        // not an omission: a fourth nudge reads as nagging and the spec says
        // to stop until the next calendar touchpoint.
        if (step > 3) {
          await messaging.advanceSequence({
            studentId: item.studentId,
            sequenceKey: "dormancy",
            step: item.currentStep,
            nextRunAt: null,
            done: true,
          });
          continue;
        }

        const r = await messaging.sendTemplated({
          studentId: item.studentId,
          to: to.email,
          templateKey: `dormancy_${step}`,
          sequenceKey: "dormancy",
          sequenceStep: step,
          vars,
        });

        // Same rule as the welcome sequence: no send, no step.
        if (!r.sent) {
          log(`dormancy_${step} not sent to student ${item.studentId}: ${r.reason}`, "engagement");
          skipped++;
          continue;
        }
        sent++;

        await messaging.advanceSequence({
          studentId: item.studentId,
          sequenceKey: "dormancy",
          step,
          nextRunAt: step < 3 ? daysFromNow(5) : null,
          done: step >= 3,
        });
        continue;
      }

      /*
       * Life log nudge (B2 Triggers 2 and 3).
       *
       * "Every 5 days for the first month, then weekly." The cadence is derived
       * from how long the sequence has been running rather than from a step
       * counter, so it is correct even if a run is missed — a step counter would
       * drift permanently after one skipped day.
       *
       * Unlike welcome and dormancy this sequence never completes. The log is
       * the ongoing surface; there is no point at which we stop asking.
       */
      if (item.sequenceKey === "life_log") {
        const step = item.currentStep + 1;

        /*
         * Her Triggers 2 and 3: "every 5 days for first month, then weekly".
         *
         * The interval was a ternary here — `daysRunning < 30 ? 5 : 7` — which was
         * correct and untested, and was then written a second time in
         * `prompt-cadence.ts` while B2's cadence was being built out. Two copies of one
         * rule is the drift this codebase keeps producing, so the tested one wins and
         * this reads from it. The SCHEDULE stays here, in the sequence machinery; only
         * the interval moved.
         */
        const enrolledAt = item.startedAt ? new Date(item.startedAt).getTime() : now.getTime();
        const cadenceDays = intervalDaysAt(
          { enrolledAt, lastSentAt: null, onHold: false, active: true },
          now.getTime(),
        );

        /*
         * Danielle's library, not the legacy pool.
         *
         * This called `lifeLog.promptFor`, which routes to `messaging.nextPrompt` — the
         * older selector, over the 28 seeded rows that predate her library, picked
         * uniformly at random with no population filter. So every prompt Wing has ever
         * emailed came from 28 prompts rather than from her 295, and an executive could
         * be sent an undergraduate prompt.
         *
         * `nextLibraryPrompt` applies her rules: audience, cadence, the 2:1 pool ratio,
         * event-sensitivity and IG-MJ05's one-per-day cap.
         */
        /*
         * Both fields come from `recipient()` on the same round trip as the address.
         *
         * An empty tag list is NOT a safe default here: `cardAppliesTo` fails open, so a
         * student the platform cannot classify matches every prompt — including the
         * audience-specific ones. That is the direction that sends an executive-only
         * prompt to an undergraduate, so the values are read rather than defaulted.
         */
        const studentTags = populationTagsFor(to.professionalStatus as any, to.pathway as any);

        const prompt = await messaging.nextLibraryPrompt(item.studentId, {
          cadence: cadenceDays === 7 ? "heartbeat" : "micro_journal",
          studentTags,
        });

        /*
         * Her opener pool, chosen independently of the prompt — "ensuring variety in how
         * prompts feel even when the underlying question repeats at the 14-day minimum
         * interval."
         *
         * `followingUpOn` is null and will be until something detects a theme worth
         * following up on. That is Radar's job and Radar is Tier 2, so the post-response
         * pool is unreachable today. Passed explicitly rather than omitted, so the gap is
         * a stated null instead of a field somebody forgot.
         */
        const [openers, openerState] = await Promise.all([
          messaging.activeOpeners(),
          messaging.openerStateFor(item.studentId),
        ]);

        const opener = renderOpener(
          openers,
          { ...openerState, followingUpOn: null },
          { Name: to.firstName ?? "" },
        );

        const r = await messaging.sendTemplated({
          studentId: item.studentId,
          to: to.email,
          templateKey: "life_log_nudge",
          sequenceKey: "life_log",
          sequenceStep: step,
          // Recorded so the 14-day no-repeat rule can see it — the rule is a
          // query over message_events.prompt_id, so a prompt sent by email
          // counts the same as one shown in the app.
          promptId: prompt?.id ?? null,
          openerId: opener?.id ?? null,
          /*
           * B2 Trigger 2: "Student can reply directly — response logged without
           * opening app."
           *
           * The only send that sets this, and deliberately. A reply address on a
           * welcome email or a session-completion email invites an answer nothing
           * reads; on the soft check-in it would be worse, because that message is
           * the one contact a safety hold permits and is written not to be a
           * question. This one IS a question — it carries her prompt as its subject
           * line — so it is the message a reply belongs to.
           */
          invitesReply: true,
          vars: {
            ...vars,
            /*
             * Never null. {{prompt}} is the SUBJECT LINE of this email, and
             * render() deliberately leaves an unresolved variable visible — so
             * an empty or fully-recently-used prompt library would send a
             * student an email titled "{{prompt}}". That behaviour is correct
             * everywhere else (a visible gap is debuggable) and unacceptable
             * here, because the subject is the part that cannot be walked back.
             *
             * The fallback is written to work as both a subject and an opening
             * line, so the email reads as intended rather than as damaged.
             */
            prompt: prompt?.promptText ?? "What's happened since we last talked?",
            /*
             * Never null, for the same reason `prompt` is not: `render()` leaves an
             * unresolved variable visible, so a student with no name on file would open
             * an email that began "{{opener}}".
             *
             * The fallback is the template's own former greeting. `renderOpener` returns
             * null when it cannot fill the name — deliberately, since "Hey [Name]" is
             * worse than a plain greeting — and this is what that null becomes on the
             * wire.
             */
            opener: opener?.text ?? `Hi ${to.firstName ?? "there"},`,
            logLink: `${APP_URL()}/milestones`,
          },
        });

        if (!r.sent) {
          log(`life_log nudge not sent to student ${item.studentId}: ${r.reason}`, "engagement");
          skipped++;
          continue;
        }
        sent++;

        await messaging.advanceSequence({
          studentId: item.studentId,
          sequenceKey: "life_log",
          step,
          nextRunAt: daysFromNow(cadenceDays),
          done: false,
        });
        continue;
      }

      /*
       * S5 · 90-Day Positioning Launch — twelve weekly steps.
       *
       * The only one of these sequences that keeps state rather than being a
       * "who is due today" query, because it is a twelve-week arc and the step
       * number is the thing being tracked.
       */
      if (item.sequenceKey === "positioning_launch") {
        const step = item.currentStep + 1;
        const launch = await import("./event-sequences");

        const result = await launch.sendLaunchStep(item.studentId, step);

        if (!result.sent && !result.done) {
          log(`launch week ${step} not sent to student ${item.studentId}`, "engagement");
          skipped++;
          continue;
        }
        if (result.sent) sent++;

        await messaging.advanceSequence({
          studentId: item.studentId,
          sequenceKey: "positioning_launch",
          step,
          // A week between steps — it is a content calendar, not a drip.
          nextRunAt: result.done ? null : daysFromNow(7),
          done: result.done,
        });
        continue;
      }

      skipped++;
    } catch (err) {
      log(
        `sequence ${item.sequenceKey} failed for student ${item.studentId}: ${(err as Error).message}`,
        "engagement",
      );
      skipped++;
    }
  }

  if (sent || skipped) {
    log(`sequence run: ${sent} sent, ${skipped} skipped`, "engagement");
  }
  return { sent, skipped };
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

async function hasStartedASession(studentId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.studentId, studentId),
        sql`${sessions.status} <> 'available'`,
      ),
    )
    .limit(1);
  return !!row;
}

/** First sentence, capped — the email carries a line, not a paragraph. */
function firstSentence(text: string): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  // [\s\S] rather than . with the /s flag: the tsconfig target predates it,
  // and the same pattern is already an error elsewhere in this codebase.
  const m = t.match(/^[\s\S]{20,240}?[.!?](\s|$)/);
  return (m ? m[0] : t.slice(0, 240)).trim();
}

const hoursFromNow = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000);
const daysFromNow = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

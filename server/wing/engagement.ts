import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { sessions, sessionArtifacts, sliRecords, students, users } from "@shared/wing-schema";
import { log } from "../logger";
import * as messaging from "./messaging-store";

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

    if (await messaging.alreadySent(studentId, "welcome_1")) return;

    const result = await messaging.sendTemplated({
      studentId,
      to: to.email,
      templateKey: "welcome_1",
      sequenceKey: "welcome",
      sequenceStep: 1,
      vars: {
        firstName: to.firstName ?? "there",
        sessionLink: `${APP_URL()}/foundation/session/1`,
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
            eq(sliRecords.status, "selected" as any),
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
        nextSessionLink: `${APP_URL()}/foundation/session/${params.sessionNumber + 1}`,
        dashboardLink: `${APP_URL()}/dashboard`,
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
        sessionLink: `${APP_URL()}/foundation/session/1`,
        dashboardLink: `${APP_URL()}/dashboard`,
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

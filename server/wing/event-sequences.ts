import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { contentDrafts, lifeLogEntries, students, users } from "@shared/wing-schema";
import { log } from "../logger";
import * as messaging from "./messaging-store";

/**
 * The event-driven message sequences (Feature List B3 / B2).
 *
 *   S5  90-Day Positioning Launch — from the first published SLI-aligned post
 *   E1  Career/life event follow-up — 24 hours after a life log entry
 *   E2  Internship milestones — 30 and 60 days after an internship starts
 *
 * All three run off the same daily runner as the welcome and dormancy
 * sequences, and all three send through messaging-store so every message
 * lands in the same audit trail with the same delivery-failure handling.
 *
 * ── WHY THESE ARE QUERIES, NOT STORED SCHEDULES ──────────────────────────
 * Each one asks the database "who is due today" rather than writing a row when
 * the triggering event happens. That makes them idempotent and repairable: a
 * runner that did not execute for two days catches up on the next run, and a
 * sequence added later works for students whose triggering event already
 * happened.
 *
 * The exception is S5, which is a twelve-week arc and genuinely needs state —
 * it uses engagement_sequence_states like the welcome sequence does.
 */

const APP_URL = () => process.env.APP_BASE_URL || "http://localhost:5173";

/* ── E1 · Career/life event follow-up ───────────────────────────────────── */

/**
 * "E1. Career/Life Event Follow-Up — When: 24 hours after event logged.
 * Content varies by type (interview, rejection, offer, personal)."
 *
 * Fires on life log entries written between 24 and 48 hours ago, once each.
 *
 * ── WHY THE DELAY IS THE POINT ───────────────────────────────────────────
 * Wing already replies immediately when an entry is written. This is a
 * different message with a different job: a day later, when whatever happened
 * has settled, asking what came of it. Sent at the time it would just be a
 * second reply to the same thing.
 */
export async function runEventFollowUps(now = new Date()): Promise<{ sent: number }> {
  const from = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const to = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const entries = await db
    .select({
      id: lifeLogEntries.id,
      studentId: lifeLogEntries.studentId,
      entryType: lifeLogEntries.entryType,
      entryText: lifeLogEntries.entryText,
      createdAt: lifeLogEntries.createdAt,
    })
    .from(lifeLogEntries)
    .where(
      and(
        sql`${lifeLogEntries.createdAt} >= ${from}`,
        sql`${lifeLogEntries.createdAt} < ${to}`,
      ),
    )
    .orderBy(desc(lifeLogEntries.createdAt))
    .limit(200);

  let sent = 0;

  // One follow-up per student per run, not per entry. Someone who logged four
  // things yesterday should hear from Wing once, not four times — which is the
  // difference between a partner and a notification system.
  const seen = new Set<number>();

  for (const entry of entries) {
    if (seen.has(entry.studentId)) continue;
    seen.add(entry.studentId);

    const to_ = await messaging.recipient(entry.studentId);
    if (!to_?.email) continue;

    const templateKey =
      entry.entryType === "personal" ? "event_followup_personal" : "event_followup_career";

    // alreadySent is keyed on template, so a student gets at most one career
    // follow-up ever. That is deliberate for now: a per-entry guard needs a
    // column on message_events, and repeating this weekly would wear thin fast.
    if (await messaging.alreadySent(entry.studentId, templateKey)) continue;

    const result = await messaging.sendTemplated({
      studentId: entry.studentId,
      to: to_.email,
      templateKey,
      sequenceKey: "event_followup",
      vars: {
        firstName: to_.firstName ?? "there",
        // Their own words back, trimmed — the whole value of a follow-up is
        // that it is about the specific thing rather than "your recent entry".
        entryExcerpt: entry.entryText.slice(0, 180).trim(),
        logLink: `${APP_URL()}/log`,
      },
    });

    if (result.sent) sent++;
    else log(`${templateKey} not sent to student ${entry.studentId}: ${result.reason}`, "sequences");
  }

  return { sent };
}

/* ── E2 · Internship milestones ─────────────────────────────────────────── */

/**
 * "E2. Internship Milestones — When: 30 and 60 days after internship start."
 *
 * Reads `students.internship_start_date`, which is set explicitly rather than
 * inferred. A milestone message triggered by a guess about prose would arrive
 * on the wrong day for a real person.
 */
export async function runInternshipMilestones(now = new Date()): Promise<{ sent: number }> {
  let sent = 0;

  for (const days of [30, 60] as const) {
    const target = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const due = await db
      .select({
        studentId: students.id,
        email: users.email,
        firstName: users.firstName,
      })
      .from(students)
      .innerJoin(users, eq(users.id, students.userId))
      .where(
        and(
          isNotNull(students.internshipStartDate),
          eq(students.internshipStartDate, target),
        ),
      );

    for (const student of due) {
      const templateKey = `internship_day_${days}`;
      if (await messaging.alreadySent(student.studentId, templateKey)) continue;

      const result = await messaging.sendTemplated({
        studentId: student.studentId,
        to: student.email,
        templateKey,
        sequenceKey: "internship_milestones",
        sequenceStep: days === 30 ? 1 : 2,
        vars: {
          firstName: student.firstName ?? "there",
          logLink: `${APP_URL()}/log`,
          portfolioLink: `${APP_URL()}/portfolio`,
        },
      });

      if (result.sent) sent++;
    }
  }

  return { sent };
}

/* ── S5 · 90-Day Positioning Launch ─────────────────────────────────────── */

export const LAUNCH_SEQUENCE_KEY = "positioning_launch";
/** Twelve weekly steps. The spec's "12-week content calendar". */
export const LAUNCH_STEPS = 12;

/**
 * "S5. 90-Day Positioning Launch — When: First SLI-aligned LinkedIn post.
 * 12-week content calendar for 360Brew DNA."
 *
 * Starts when a student publishes their first draft. Called from the publish
 * endpoint; `startSequence` is a no-op if it is already running, so a second
 * published post does not restart the clock.
 *
 * ── WHY IT STARTS ON PUBLISHING, NOT ON FINISHING SESSIONS ───────────────
 * The window the spec is about — the period where LinkedIn's model starts
 * associating topics with a person — only opens once there is something to
 * associate. Starting it at session completion would spend three of the twelve
 * weeks on someone who has not posted, which is the opposite of the point.
 */
export async function onFirstPostPublished(studentId: number): Promise<boolean> {
  try {
    const [existing] = await db
      .select({ id: contentDrafts.id })
      .from(contentDrafts)
      .where(
        and(eq(contentDrafts.studentId, studentId), isNotNull(contentDrafts.publishedAt)),
      )
      .limit(2);

    if (!existing) return false;

    // A week between steps: the sequence is a content calendar, not a drip.
    await messaging.startSequence(
      studentId,
      LAUNCH_SEQUENCE_KEY,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    );

    log(`positioning launch started for student ${studentId}`, "sequences");
    return true;
  } catch (err) {
    log(`launch start failed for student ${studentId}: ${(err as Error).message}`, "sequences");
    return false;
  }
}

/**
 * The theme for each week of the launch.
 *
 * Data rather than twelve templates: the copy is one template with a
 * {{weekTheme}} and {{weekPrompt}}, so Danielle can retheme a week in the
 * editor without an engineer, and adding a thirteenth is a line here rather
 * than a new template plus a catalogue entry plus a migration.
 */
export const LAUNCH_WEEKS: { theme: string; prompt: string }[] = [
  { theme: "Say the thing once, plainly", prompt: "Post your positioning as a statement, not a promise. One sentence about what you do and who it is for." },
  { theme: "The proof underneath", prompt: "Take the strongest evidence from your sessions and write the story behind it — what was actually hard about it." },
  { theme: "Something you changed your mind about", prompt: "A view you held and dropped. It signals you are thinking rather than performing." },
  { theme: "Comment before you post", prompt: "No post this week. Leave three substantive comments on people working in your space." },
  { theme: "The problem you keep seeing", prompt: "Name a recurring problem in your field. Do not solve it — naming it well is the post." },
  { theme: "What your work looks like up close", prompt: "The unglamorous detail of what you actually do. Specificity is the differentiator." },
  { theme: "Someone else's good idea", prompt: "Share something worth reading, with your own take on why it matters. Curation is positioning." },
  { theme: "A number", prompt: "One measurable outcome you were part of, with the context that makes it mean something." },
  { theme: "The question you get asked", prompt: "Whatever people come to you for — answer it publicly, once, properly." },
  { theme: "What you were wrong about early", prompt: "Useful to people a step behind you, and it costs you nothing to say." },
  { theme: "Where you are heading", prompt: "The direction, not the destination. It tells people what to bring you." },
  { theme: "Look back at week one", prompt: "Reread your first post. Say what has sharpened since — that arc is the whole point of ninety days." },
];

/**
 * Sends the next launch step for one student. Called by the runner.
 *
 * Returns false when the sequence has finished, so the caller can close it.
 */
export async function sendLaunchStep(
  studentId: number,
  step: number,
): Promise<{ sent: boolean; done: boolean }> {
  if (step > LAUNCH_STEPS) return { sent: false, done: true };

  const to = await messaging.recipient(studentId);
  if (!to?.email) return { sent: false, done: false };

  const week = LAUNCH_WEEKS[step - 1];
  if (!week) return { sent: false, done: true };

  const result = await messaging.sendTemplated({
    studentId,
    to: to.email,
    templateKey: "positioning_launch_week",
    sequenceKey: LAUNCH_SEQUENCE_KEY,
    sequenceStep: step,
    vars: {
      firstName: to.firstName ?? "there",
      weekNumber: step,
      weekTheme: week.theme,
      weekPrompt: week.prompt,
      draftsLink: `${APP_URL()}/linkedin-content-drafts`,
    },
  });

  return { sent: result.sent, done: step >= LAUNCH_STEPS };
}

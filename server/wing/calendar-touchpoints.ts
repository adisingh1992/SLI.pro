import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { institutionCalendarEvents, institutions, sessions, students, users } from "@shared/wing-schema";
import { log } from "../logger";
import * as messaging from "./messaging-store";

/**
 * Academic calendar touchpoints — B3 S4.
 *
 * "S4. Academic Calendar — When: Per-institution config. Adapts to completion
 * status."
 *
 * ── PER-INSTITUTION, WHICH ONLY JUST BECAME POSSIBLE ─────────────────────
 * `institution_calendar_events` has existed unused since the schema was built,
 * and it could not have worked before now: every student was created with a
 * NULL institution_id and nothing ever set it, so "send to Berkeley's students
 * on the first day of recruiting season" would have matched nobody. The email
 * domain assignment added alongside this is what makes the audience real.
 *
 * ── "ADAPTS TO COMPLETION STATUS" IS THE WHOLE DESIGN ────────────────────
 * A recruiting-season message to a student who has finished all three sessions
 * and one who has not started are different messages. The first says "your
 * positioning is ready, here is how to use it this week"; the second says "this
 * is the week it starts mattering, and you have eight minutes of work to do".
 *
 * Sending the same text to both is what makes calendar mail feel like a mailing
 * list. So each event resolves to one of two template keys by completion, and
 * the store falls back to the base key when no variant is published.
 */

export type CalendarEvent = {
  id: number;
  institutionId: number;
  institutionName: string;
  label: string;
  eventDate: string;
  templateKey: string | null;
};

/** Events due today for every active institution. */
export async function dueToday(today = new Date()): Promise<CalendarEvent[]> {
  const iso = today.toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: institutionCalendarEvents.id,
      institutionId: institutionCalendarEvents.institutionId,
      institutionName: institutions.name,
      label: institutionCalendarEvents.label,
      eventDate: institutionCalendarEvents.eventDate,
      templateKey: institutionCalendarEvents.templateKey,
    })
    .from(institutionCalendarEvents)
    .innerJoin(institutions, eq(institutions.id, institutionCalendarEvents.institutionId))
    .where(
      and(
        eq(institutionCalendarEvents.active, true),
        eq(institutionCalendarEvents.eventDate, iso),
      ),
    );

  return rows as CalendarEvent[];
}

/**
 * Students of an institution, with how many sessions they have finished.
 *
 * The count is what selects the message variant, so it is fetched with the
 * audience rather than per student — a Berkeley cohort is hundreds of rows and
 * a query each would make the daily job quadratic for no reason.
 */
async function audienceFor(institutionId: number) {
  return db
    .select({
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
      studentId: students.id,
      completed: sql<number>`(
        select count(distinct s.session_type)
        from wing.sessions s
        where s.student_id = ${students.id}
          and s.status::text = 'completed'
          and s.session_type::text like 'foundation_%'
      )::int`,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(
      and(
        eq(students.institutionId, institutionId),
        eq(students.enrollmentStatus, "active" as any),
      ),
    );
}

/**
 * Sends every calendar touchpoint due today.
 *
 * Called by the same runner as the engagement sequences.
 */
export async function runDueTouchpoints(today = new Date()): Promise<{
  events: number;
  sent: number;
  skipped: number;
}> {
  const events = await dueToday(today);
  let sent = 0;
  let skipped = 0;

  for (const event of events) {
    const base = event.templateKey?.trim();
    if (!base) {
      log(`calendar event ${event.id} "${event.label}" has no template — skipped`, "calendar");
      continue;
    }

    /*
     * Resolve both variants once, not once per student. There are exactly two
     * possible answers for an event and a Berkeley cohort is hundreds of rows —
     * doing this inside the loop was a query per student for a constant.
     *
     * Falls back to the base key when a variant is not published: an event
     * configured with a template that has no variants should still send
     * something rather than silently reaching nobody.
     */
    const resolved: Record<"complete" | "incomplete", string> = {
      complete: (await messaging.getTemplate(`${base}_complete`, "email")) ? `${base}_complete` : base,
      incomplete: (await messaging.getTemplate(`${base}_incomplete`, "email"))
        ? `${base}_incomplete`
        : base,
    };

    const audience = await audienceFor(event.institutionId);
    log(
      `calendar "${event.label}" (${event.institutionName}): ${audience.length} student(s)`,
      "calendar",
    );

    // Unique per event, so two touchpoints sharing a template key do not
    // suppress each other — and a runner that executes twice in a day does not
    // send the same thing twice.
    const sequenceKey = `calendar:${event.id}`;

    for (const student of audience) {
      // Completion decides which version they get. See the note at the top.
      const templateKey = resolved[student.completed >= 3 ? "complete" : "incomplete"];

      if (await messaging.alreadySentForSequence(student.studentId, sequenceKey)) {
        skipped++;
        continue;
      }

      const result = await messaging.sendTemplated({
        studentId: student.studentId,
        to: student.email,
        templateKey,
        sequenceKey,
        vars: {
          firstName: student.firstName ?? "there",
          eventLabel: event.label,
          institutionName: event.institutionName,
          sessionsCompleted: student.completed,
          sessionLink: `${process.env.APP_BASE_URL || "http://localhost:5173"}/foundation/session/${Math.min(student.completed + 1, 3)}`,
          dashboardLink: `${process.env.APP_BASE_URL || "http://localhost:5173"}/dashboard`,
        },
      });

      if (result.sent) sent++;
      else skipped++;
    }
  }

  return { events: events.length, sent, skipped };
}

/* ── Admin management ───────────────────────────────────────────────────── */

export async function listEvents(institutionId?: number) {
  const q = db
    .select({
      id: institutionCalendarEvents.id,
      institutionId: institutionCalendarEvents.institutionId,
      institutionName: institutions.name,
      label: institutionCalendarEvents.label,
      eventDate: institutionCalendarEvents.eventDate,
      templateKey: institutionCalendarEvents.templateKey,
      active: institutionCalendarEvents.active,
    })
    .from(institutionCalendarEvents)
    .innerJoin(institutions, eq(institutions.id, institutionCalendarEvents.institutionId))
    .orderBy(institutionCalendarEvents.eventDate);

  return institutionId
    ? q.where(eq(institutionCalendarEvents.institutionId, institutionId))
    : q;
}

export async function createEvent(params: {
  institutionId: number;
  label: string;
  eventDate: string;
  templateKey: string | null;
}) {
  const [row] = await db.insert(institutionCalendarEvents).values(params).returning();
  return row;
}

export async function setEventActive(id: number, active: boolean) {
  const [row] = await db
    .update(institutionCalendarEvents)
    .set({ active })
    .where(eq(institutionCalendarEvents.id, id))
    .returning();
  return row ?? null;
}

export async function deleteEvent(id: number) {
  await db.delete(institutionCalendarEvents).where(eq(institutionCalendarEvents.id, id));
}

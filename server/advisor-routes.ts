import { Express, Request, Response, NextFunction } from "express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import {
  advisorAppointments,
  advisors,
  institutions,
  sessions,
  students,
  users,
} from "@shared/wing-schema";
import * as snapshot from "./wing/advisor-snapshot";
import { log } from "./logger";
import { isAdmin } from "./admin-guards";

/**
 * Advisor appointments and pre-meeting snapshots (Feature List B1).
 *
 * ── SCOPE: MANUAL ENTRY ONLY ─────────────────────────────────────────────
 * The spec lists calendar/scheduling integration OR a manual admin trigger as
 * the infrastructure for this feature. The decision for August is manual, and
 * this file is the whole of it. Auto-scheduling gets built when a partner tells
 * us which system to integrate with.
 *
 * That decision has a boundary worth stating, because the tables here look like
 * the start of something they are not: MyWing does not own scheduling. We
 * accept an appointment time and act on it. We do not manage availability,
 * booking, rescheduling, cancellation policy or reminders about the meeting
 * itself — Berkeley and Vanderbilt already have systems that do. Anything in
 * that list appearing on this surface means we have started building a calendar
 * product nobody asked for.
 *
 * So an appointment row here is an INPUT, not a booking. The three triggers the
 * spec names all reduce to it:
 *
 *   1. TIMED      appointment registered, snapshot goes 24h before.
 *   2. ON DEMAND  admin asks for it now (`sendNow`, or the snapshot endpoint).
 *   3. COMPLETION the SLI is finished, so a snapshot exists to be read.
 */

export function registerAdvisorRoutes(app: Express) {
  /** Institutions — the required field when adding an advisor. */
  app.get("/api/admin/institutions", isAdmin, async (_req, res, next) => {
    try {
      res.json(
        await db
          .select({ id: institutions.id, name: institutions.name })
          .from(institutions)
          .orderBy(institutions.name),
      );
    } catch (error) {
      next(error);
    }
  });

  /**
   * Students, for the appointment picker.
   *
   * Carries the completed-session count because that is the one thing the
   * person registering the appointment needs to see at the moment they pick:
   * it decides which prep email the student gets, and it tells them whether the
   * snapshot will say anything worth reading.
   *
   * Note this is students, not users — /api/admin/users is keyed by user id and
   * appointments are keyed by student id. Passing the wrong one would resolve
   * to a real but different person, which is the kind of bug that gets found
   * by an advisor reading a stranger's positioning.
   */
  app.get("/api/admin/advisees", isAdmin, async (_req, res, next) => {
    try {
      const completed = db
        .select({
          studentId: sessions.studentId,
          completed: count().as("completed"),
        })
        .from(sessions)
        .where(eq(sessions.status, "completed" as any))
        .groupBy(sessions.studentId)
        .as("completed_sessions");

      const rows = await db
        .select({
          id: students.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          // ::int is not decoration. count() is bigint, and node-postgres hands
          // bigint back as a STRING to avoid precision loss — so without the
          // cast this field arrives as "0", every numeric comparison in the
          // client silently fails, and a student who has done nothing is
          // presented as though they were partway through.
          completedSessions: sql<number>`coalesce(${completed.completed}, 0)::int`,
        })
        .from(students)
        .innerJoin(users, eq(users.id, students.userId))
        .leftJoin(completed, eq(completed.studentId, students.id))
        // No role filter: having a `students` row IS the definition of an
        // advisee. Filtering on users.role as well would silently drop anyone
        // whose identity row says something else, and the picker going quiet
        // for one person is harder to notice than it being wrong for all.
        .orderBy(users.firstName, users.lastName);

      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  /** Advisors for an institution — the picker when registering an appointment. */
  app.get("/api/admin/advisors", isAdmin, async (_req, res, next) => {
    try {
      res.json(
        await db
          .select()
          .from(advisors)
          .where(eq(advisors.active, true))
          .orderBy(advisors.name),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/advisors", isAdmin, async (req, res, next) => {
    try {
      const { institutionId, name, email } = req.body ?? {};
      if (!institutionId || !name || !email) {
        return res.status(400).json({ error: "institutionId, name and email are required" });
      }
      const [created] = await db
        .insert(advisors)
        .values({ institutionId, name, email: String(email).toLowerCase() })
        .returning();
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  /** Appointments, newest first, with student and advisor names for the list. */
  app.get("/api/admin/appointments", isAdmin, async (_req, res, next) => {
    try {
      const rows = await db
        .select({
          id: advisorAppointments.id,
          scheduledAt: advisorAppointments.scheduledAt,
          status: advisorAppointments.status,
          snapshotSentAt: advisorAppointments.snapshotSentAt,
          studentPromptSentAt: advisorAppointments.studentPromptSentAt,
          studentName: users.firstName,
          studentLastName: users.lastName,
          advisorName: advisors.name,
          advisorEmail: advisors.email,
        })
        .from(advisorAppointments)
        .innerJoin(students, eq(students.id, advisorAppointments.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .innerJoin(advisors, eq(advisors.id, advisorAppointments.advisorId))
        .orderBy(desc(advisorAppointments.scheduledAt))
        .limit(200);

      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Registering an appointment — the only way appointment data enters the
   * system until a partner names a scheduling system to integrate with.
   *
   * The student prep prompt fires immediately. The advisor snapshot normally
   * waits for the T-24h runner, but `sendNow` sends it with the registration,
   * which is the case where an advisor has asked for one directly and the
   * meeting may be sooner than 24 hours away. Both sends are recorded on the
   * appointment row, so neither can go twice.
   */
  app.post("/api/admin/appointments", isAdmin, async (req, res, next) => {
    try {
      const { studentId, advisorId, scheduledAt, sendNow } = req.body ?? {};
      if (!studentId || !advisorId || !scheduledAt) {
        return res
          .status(400)
          .json({ error: "studentId, advisorId and scheduledAt are required" });
      }

      const when = new Date(scheduledAt);
      if (Number.isNaN(when.getTime())) {
        return res.status(400).json({ error: "scheduledAt is not a valid date" });
      }

      const [created] = await db
        .insert(advisorAppointments)
        .values({ studentId, advisorId, scheduledAt: when })
        .returning();

      // Awaited, unlike the student prep below, because the caller ticked a box
      // asking for it and needs to know whether it went. A background send
      // would report success for something that silently failed.
      let snapshotSent = false;
      let snapshotReason: string | undefined;
      if (sendNow === true) {
        const result = await snapshot.sendSnapshot(created.id);
        snapshotSent = result.sent;
        snapshotReason = result.reason;
      }

      res.status(201).json({ ...created, snapshotSent, snapshotReason });

      // After the response: the prompt is for the student, and the admin
      // registering the appointment should not wait on SendGrid.
      void snapshot.sendStudentPrep(created.id);
    } catch (error) {
      next(error);
    }
  });

  /**
   * On demand — send the snapshot for an appointment already registered.
   *
   * `force` re-sends one already sent, which an advisor will want when a
   * student does more work between the automatic send and the meeting.
   */
  app.post("/api/admin/appointments/:id/snapshot", isAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid appointment id" });

      const force = req.body?.force === true;
      const result = await snapshot.sendSnapshot(id, force);

      if (!result.sent) {
        return res.status(409).json({
          error: "Snapshot not sent",
          // The specific reason, not a list of things it might have been. The
          // generic version of this message is what made a SendGrid refusal
          // look identical to an already-sent no-op.
          detail: result.reason ?? "The send did not complete.",
        });
      }

      log(`advisor snapshot sent on demand for appointment ${id}`, "advisor");
      res.json({ sent: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * The stored snapshot, or a preview if none was sent.
   *
   * A preview is explicitly marked as such: what the advisor received is the
   * stored copy, and showing a fresh composition as though it were the sent
   * one would misrepresent the record.
   */
  app.get("/api/admin/appointments/:id/snapshot", isAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid appointment id" });

      const [appt] = await db
        .select({
          studentId: advisorAppointments.studentId,
          snapshot: advisorAppointments.snapshot,
          snapshotSentAt: advisorAppointments.snapshotSentAt,
        })
        .from(advisorAppointments)
        .where(eq(advisorAppointments.id, id))
        .limit(1);

      if (!appt) return res.status(404).json({ error: "Appointment not found" });

      if (appt.snapshot) {
        // Normalised, not returned raw. The stored blob may have been written
        // by an older version of compose() — the record is immutable by design,
        // so every shape this type has ever had is still out there and the
        // client cannot be asked to know them all.
        return res.json({
          sent: true,
          sentAt: appt.snapshotSentAt,
          snapshot: snapshot.normalizeSnapshot(appt.snapshot),
        });
      }

      const preview = await snapshot.compose(appt.studentId);
      res.json({ sent: false, preview: true, snapshot: preview });
    } catch (error) {
      next(error);
    }
  });
}

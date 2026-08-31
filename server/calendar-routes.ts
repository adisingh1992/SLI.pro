import { Express, Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { students } from "@shared/wing-schema";
import * as calendar from "./wing/calendar-touchpoints";
import { log } from "./logger";
import { isAdmin, isStudent } from "./admin-guards";

/**
 * Academic calendar configuration (B3 S4) and internship dates (B3 E2).
 *
 * Both are admin-configured rather than inferred. The calendar is
 * per-institution and only Danielle knows the real dates; the internship start
 * is a fact about a student that the platform has no reliable way to detect.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function registerCalendarRoutes(app: Express) {
  app.get("/api/admin/calendar-events", isAdmin, async (req, res, next) => {
    try {
      const institutionId = parseInt(String(req.query.institutionId ?? ""), 10);
      res.json(await calendar.listEvents(Number.isNaN(institutionId) ? undefined : institutionId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/calendar-events", isAdmin, async (req, res, next) => {
    try {
      const institutionId = parseInt(String(req.body?.institutionId ?? ""), 10);
      const label = String(req.body?.label ?? "").trim();
      const eventDate = String(req.body?.eventDate ?? "").trim();
      const templateKey = String(req.body?.templateKey ?? "").trim() || null;

      if (Number.isNaN(institutionId)) {
        return res.status(400).json({ error: "institutionId is required" });
      }
      if (!label) return res.status(400).json({ error: "label is required" });
      if (!ISO_DATE.test(eventDate)) {
        return res.status(400).json({ error: "eventDate must be YYYY-MM-DD" });
      }

      const created = await calendar.createEvent({ institutionId, label, eventDate, templateKey });
      log(`calendar event "${label}" created for institution ${institutionId}`, "calendar");
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/calendar-events/:id", isAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid event id" });
      if (typeof req.body?.active !== "boolean") {
        return res.status(400).json({ error: "active must be true or false" });
      }

      const updated = await calendar.setEventActive(id, req.body.active);
      if (!updated) return res.status(404).json({ error: "Calendar event not found" });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/calendar-events/:id", isAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid event id" });

      await calendar.deleteEvent(id);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  /**
   * The student sets their own internship start date (B3 E2).
   *
   * Self-service rather than admin-set: the student is the one who knows, and
   * making an advisor enter it means it never gets entered. Clearable, because
   * an internship that fell through should stop the milestone messages rather
   * than deliver two reminders about a job nobody started.
   */
  app.put("/api/user/internship", isStudent, async (req, res, next) => {
    try {
      const raw = req.body?.startDate;
      const startDate = raw === null || raw === "" ? null : String(raw).trim();

      if (startDate !== null && !ISO_DATE.test(startDate)) {
        return res.status(400).json({ error: "startDate must be YYYY-MM-DD, or null to clear" });
      }

      const [updated] = await db
        .update(students)
        .set({ internshipStartDate: startDate, updatedAt: new Date() })
        .where(eq(students.userId, req.user!.id))
        .returning({ id: students.id, startDate: students.internshipStartDate });

      if (!updated) return res.status(404).json({ error: "No student record for this account" });

      res.json({ startDate: updated.startDate });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/user/internship", isStudent, async (req, res, next) => {
    try {
      const [row] = await db
        .select({ startDate: students.internshipStartDate })
        .from(students)
        .where(eq(students.userId, req.user!.id))
        .limit(1);

      res.json({ startDate: row?.startDate ?? null });
    } catch (error) {
      next(error);
    }
  });
}

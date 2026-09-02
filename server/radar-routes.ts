import { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { students, radarSuggestions } from "@shared/wing-schema";
import { log } from "./logger";
import { isStudent } from "./admin-guards";
import { currentRadarSuggestions, radarEligibility, recordRadarEngagement } from "./wing/baby-radar";

/**
 * The two student-facing Baby Radar routes: listing a student's current
 * batch of suggestions (for the dashboard card / `/radar` page), and
 * recording that they engaged with one, per the card's own success_criteria
 * ("engages with at least one topic suggestion per month"). Generating the
 * batch itself has no route — that's `runDueRadarSuggestions`, on a weekly
 * cron, per `baby-radar.ts`'s own header.
 *
 * Student-facing, same shape as `life-log-routes.ts`: `isStudent` guards
 * both routes, and the student id is resolved from the session rather than
 * trusted from the request. For the engage route specifically,
 * `recordRadarEngagement`'s own SQL
 * (`UPDATE ... WHERE id = $suggestionId AND engaged_at IS NULL`) has no
 * student_id predicate, so without an ownership check here, any signed-in
 * student could mark another student's suggestion engaged just by guessing
 * an id.
 */

async function requireStudent(req: Request, res: Response): Promise<number | null> {
  const userId = (req.user as any)?.id;
  const [row] = userId
    ? await db.select({ id: students.id }).from(students).where(eq(students.userId, userId)).limit(1)
    : [];
  const studentId = row?.id ?? null;
  if (!studentId) {
    res.status(404).json({ error: "No student record for this account" });
    return null;
  }
  return studentId;
}

export function registerRadarRoutes(app: Express) {
  app.get("/api/radar-suggestions", isStudent, async (req, res, next) => {
    try {
      const studentId = await requireStudent(req, res);
      if (!studentId) return;

      const [suggestions, eligibility] = await Promise.all([
        currentRadarSuggestions(db as any, studentId),
        radarEligibility(db as any, studentId),
      ]);

      res.json({ suggestions, eligible: eligibility.eligible, reason: eligibility.reason });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/radar-suggestions/:id/engage", isStudent, async (req, res, next) => {
    try {
      const studentId = await requireStudent(req, res);
      if (!studentId) return;

      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid suggestion id" });

      const [row] = await db
        .select({ studentId: radarSuggestions.studentId })
        .from(radarSuggestions)
        .where(eq(radarSuggestions.id, id))
        .limit(1);

      // Not found and not-yours both read as 404, same as life-log-routes.ts's
      // equivalent check — neither should tell a student which one it was.
      if (!row || row.studentId !== studentId) {
        return res.status(404).json({ error: "Suggestion not found" });
      }

      // Idempotent: recordRadarEngagement's WHERE includes engaged_at IS NULL,
      // so calling this twice on an already-engaged suggestion is a no-op, not
      // an error — the student doesn't need to know or care which one it was.
      await recordRadarEngagement(db as any, id);

      log(`radar suggestion ${id} engaged by student ${studentId}`, "radar");
      res.json({ engaged: true });
    } catch (error) {
      next(error);
    }
  });
}

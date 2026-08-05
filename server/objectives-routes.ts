import { Express, Request, Response, NextFunction } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { turnObjectives, sessions, students, users } from "@shared/wing-schema";
import * as store from "./wing/objectives-store";
import { validateObjectiveSet, POPULATIONS } from "./wing/objective-rules";
import { log } from "./logger";

/**
 * Objective sets API — what a session is trying to achieve, in order.
 *
 * NO REPLAY HERE, DELIBERATELY.
 * Criteria and methodology can be replayed because their input is a finished
 * transcript: change the rule, re-judge the same conversation, compare. Change
 * an objective and Wing says something different, so the student says something
 * different, and there is no history to re-run against.
 *
 * What replaces it is measurement. `turn_objectives` records which objective
 * every turn was pursuing, so per-objective satisfaction rates are comparable
 * across cohorts — a real experiment rather than a simulated one. The stats
 * endpoint below is that feedback loop, and it is the honest substitute.
 *
 * Publishing is still gated on structural validation, which catches the errors
 * that would otherwise reach students as a subtly wrong prompt: a duplicate
 * key, a missing evidence rule, an omitted population.
 */

const SESSION_TYPES = [
  "foundation_1", "foundation_2", "foundation_3",
  "enhancement_a", "enhancement_b", "enhancement_c",
];

const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user?.isAdmin) return next();
  res.status(403).json({ error: "Admin access required" });
};

export function registerObjectiveRoutes(app: Express) {
  app.get("/api/admin/objectives", isAdmin, async (_req, res, next) => {
    try {
      res.json({
        sessionTypes: SESSION_TYPES,
        populations: POPULATIONS,
        published: await store.listAll(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/objectives/:sessionType", isAdmin, async (req, res, next) => {
    try {
      const { sessionType } = req.params;
      if (!SESSION_TYPES.includes(sessionType)) {
        return res.status(400).json({ error: "Unknown session type" });
      }
      res.json({
        published: await store.getPublished(sessionType),
        versions: await store.listVersions(sessionType),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Per-objective satisfaction rates, split by population.
   *
   * The number the whole design exists to produce. "Undergraduates stall at
   * validate_function_evidence three times as often as mid-career" is
   * answerable here and is answerable nowhere in the prompt-file world.
   *
   * Denominator is sessions that reached the objective's beat at all, not all
   * sessions — otherwise a session abandoned at turn two would count as a
   * failure of every later objective and drown the signal.
   */
  app.get("/api/admin/objectives/:sessionType/stats", isAdmin, async (req, res, next) => {
    try {
      const { sessionType } = req.params;
      if (!SESSION_TYPES.includes(sessionType)) {
        return res.status(400).json({ error: "Unknown session type" });
      }

      const rows = await db
        .select({
          population: users.professionalStatus,
          objectiveKey: turnObjectives.objectiveKey,
          satisfiedSessions: sql<number>`count(distinct ${turnObjectives.sessionId})::int`,
        })
        .from(turnObjectives)
        .innerJoin(sessions, eq(sessions.id, turnObjectives.sessionId))
        .innerJoin(students, eq(students.id, sessions.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .where(
          and(
            eq(sessions.sessionType, sessionType as any),
            eq(turnObjectives.satisfiedHere, true),
          ),
        )
        .groupBy(users.professionalStatus, turnObjectives.objectiveKey);

      const sessionCounts = await db
        .select({
          population: users.professionalStatus,
          total: sql<number>`count(distinct ${sessions.id})::int`,
        })
        .from(sessions)
        .innerJoin(students, eq(students.id, sessions.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .innerJoin(turnObjectives, eq(turnObjectives.sessionId, sessions.id))
        .where(eq(sessions.sessionType, sessionType as any))
        .groupBy(users.professionalStatus);

      res.json({
        sessionType,
        // Small numbers early on. Reported raw rather than as percentages so a
        // 1-of-1 rate is not mistaken for 100% confidence in anything.
        sessionsWithObjectiveData: sessionCounts,
        satisfiedByObjective: rows,
      });
    } catch (error) {
      next(error);
    }
  });

  /** Validates without publishing — the pre-flight the editor calls on edit. */
  app.post("/api/admin/objectives/:sessionType/validate", isAdmin, async (req, res, next) => {
    try {
      const { objectives } = req.body ?? {};
      if (!Array.isArray(objectives)) {
        return res.status(400).json({ error: "objectives must be an array" });
      }
      res.json({ issues: validateObjectiveSet(objectives) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/objectives/:sessionType", isAdmin, async (req, res, next) => {
    try {
      const { sessionType } = req.params;
      if (!SESSION_TYPES.includes(sessionType)) {
        return res.status(400).json({ error: "Unknown session type" });
      }

      const { objectives, changeNote } = req.body ?? {};
      if (!Array.isArray(objectives) || !objectives.length) {
        return res.status(400).json({ error: "At least one objective is required" });
      }

      // Structural validation is a hard gate, not a warning. Every check
      // corresponds to something that would otherwise reach a student as a
      // prompt that looks fine and behaves wrongly.
      const issues = validateObjectiveSet(objectives);
      if (issues.length) {
        return res.status(400).json({
          error: "Objective set does not validate",
          detail: issues.map((i) => `${i.objectiveKey ?? "(set)"}: ${i.message}`).join("; "),
          issues,
        });
      }

      const created = await store.publish({
        sessionType,
        objectives,
        changeNote: changeNote ?? null,
        userId: req.user!.id,
      });

      log(
        `objective set ${sessionType} v${created.versionNumber} published by user ${req.user!.id}`,
        "objectives",
      );
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/objectives/revert/:versionId", isAdmin, async (req, res, next) => {
    try {
      const versionId = parseInt(req.params.versionId, 10);
      if (Number.isNaN(versionId)) {
        return res.status(400).json({ error: "Invalid version id" });
      }
      const reverted = await store.revertTo(versionId, req.user!.id);
      if (!reverted) return res.status(404).json({ error: "Version not found" });

      log(`objective set reverted to version ${versionId}`, "objectives");
      res.json(reverted);
    } catch (error) {
      next(error);
    }
  });
}

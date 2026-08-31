import { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as homework from './wing/homework-store';
import { isAdmin, isStudent } from "./admin-guards";

/**
 * Homework routes — on wing.
 *
 * These used to go through `storage`, which writes `public.homework_assignments`
 * whose user_id is a foreign key to `public.users`. Registration creates a
 * `wing.users` row and no public one, so both assigning and answering threw a
 * constraint violation for every student who registered after the cutover.
 *
 * Third instance of that defect (registration, questionnaire, this), so the
 * rule is worth stating plainly: a route that reads wing must write wing. There
 * is no correct reason to mix them.
 */

export function registerHomeworkRoutes(app: Express) {
  /** Admin: homework for one student. :userId is a wing.users id. */
  app.get("/api/admin/users/:userId/homework", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

      res.json(await homework.listForUser(userId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/users/:userId/homework", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

      const { questionText } = z
        .object({ questionText: z.string().min(1, "Question text is required") })
        .parse(req.body);

      const created = await homework.create({
        userId,
        assignedByUserId: req.user!.id,
        questionText,
      });

      // Null means the account has no student record — a staff or admin user.
      // 404 rather than a foreign-key error surfacing as a 500, which is how
      // this failed before.
      if (!created) {
        return res.status(404).json({ error: "That account has no student record" });
      }

      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      next(error);
    }
  });

  app.patch("/api/admin/homework/:id", isAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid homework ID" });

      const { questionText } = z
        .object({ questionText: z.string().min(1) })
        .parse(req.body);

      const updated = await homework.updateQuestion(id, questionText);
      if (!updated) return res.status(404).json({ error: "Homework assignment not found" });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      next(error);
    }
  });

  app.delete("/api/admin/homework/:id", isAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid homework ID" });

      await homework.remove(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  /** Student: their own homework. */
  app.get("/api/user/homework", isStudent, async (req, res, next) => {
    try {
      res.json(await homework.listForUser(req.user!.id));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/user/homework/:id/answer", isStudent, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid homework ID" });

      const { answerText } = z
        .object({ answerText: z.string().min(1, "Answer is required") })
        .parse(req.body);

      // Ownership is enforced inside the update's WHERE clause, not by a
      // fetch-then-compare. A student answering someone else's homework
      // updates nothing and gets a 404.
      const updated = await homework.answer({ id, userId: req.user!.id, answerText });
      if (!updated) return res.status(404).json({ error: "Homework assignment not found" });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      next(error);
    }
  });
}

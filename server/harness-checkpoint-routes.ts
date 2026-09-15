import { Express } from "express";
import { isPlatformAdmin } from "./admin-guards";
import {
  applyCheckpoint,
  CHECKPOINTS,
  setAllowManualCheckpoints,
  type Checkpoint,
} from "./wing/checkpoint-store";

/**
 * "Set checkpoint" — the admin action `claude/TEST_HARNESS_PLAN_SEP9.md`'s P2
 * describes, against a student record directly (not scoped to a persona,
 * because Danielle's own use case is her own account, not only a seeded
 * one). Same shape as `harness-persona-routes.ts`: no import of `./db` here
 * — every write goes through `server/wing/checkpoint-store.ts`, so what this
 * surface can touch is answerable from one file, which is what
 * `harness-checkpoint-boundary.test.ts` checks for by name.
 */

function isCheckpoint(v: unknown): v is Checkpoint {
  return typeof v === "string" && (CHECKPOINTS as string[]).includes(v);
}

export function registerHarnessCheckpointRoutes(app: Express) {
  app.get("/api/admin/harness/checkpoints/vocabulary", isPlatformAdmin, (_req, res) => {
    res.json({ checkpoints: CHECKPOINTS });
  });

  app.post("/api/admin/harness/checkpoints/:studentId", isPlatformAdmin, async (req, res, next) => {
    try {
      const studentId = Number(req.params.studentId);
      if (!Number.isInteger(studentId) || studentId <= 0) {
        return res.status(400).json({ error: "Invalid student id" });
      }

      const checkpoint = req.body?.checkpoint;
      if (!isCheckpoint(checkpoint)) {
        return res.status(400).json({ error: "checkpoint must be one of: " + CHECKPOINTS.join(", ") });
      }

      const result = await applyCheckpoint(studentId, checkpoint);
      if (!result.ok) {
        const status = result.error === "student_not_found" ? 404 : 409;
        return res.status(status).json({ error: result.error });
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Grants or revokes a real (non-test-user) account's access to
   * `applyCheckpoint` on itself — `claude/HARNESS_GAP_ANALYSIS_SEP15.md` §1a.
   * Deliberately separate from persona activation/seeding: this is for a
   * real staff account (Danielle's own), not a seeded persona, which already
   * qualifies via `is_test_user` and never needs this route touched.
   */
  app.post(
    "/api/admin/harness/checkpoints/:studentId/allow-manual",
    isPlatformAdmin,
    async (req, res, next) => {
      try {
        const studentId = Number(req.params.studentId);
        if (!Number.isInteger(studentId) || studentId <= 0) {
          return res.status(400).json({ error: "Invalid student id" });
        }

        const allow = req.body?.allow;
        if (typeof allow !== "boolean") {
          return res.status(400).json({ error: "allow must be a boolean" });
        }

        const result = await setAllowManualCheckpoints(studentId, allow);
        if (!result.ok) {
          return res.status(404).json({ error: result.error });
        }

        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );
}

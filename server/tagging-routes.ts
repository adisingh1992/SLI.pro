import { Express, Request, Response, NextFunction } from "express";
import * as store from "./wing/tagging-store";
import { CLASSIFIABLE_TYPES } from "./wing/classifier-rules";
import { log } from "./logger";
import { isPlatformAdmin } from "./admin-guards";

/**
 * Turn-tagging API — building the gold standard (spec §14).
 *
 * A human labels turns; those labels become the validation set the classifier
 * is measured against, and the seed examples for its prompt.
 *
 * ADMIN ONLY. A hand tag is authoritative and permanent as far as the
 * classifier is concerned, so it must not be settable by a student.
 */

/**
 * Types a human may assign.
 *
 * The five-value enum includes `ai_prompt` and `ai_adapted`, but those are
 * structural — derived from position and the preceding turn, never judged. A
 * human tagging an AI turn as `human_spontaneous` would produce a row the
 * engine could never generate, so only the three human types are offered.
 */
const TAGGABLE = CLASSIFIABLE_TYPES;

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) || n < 1 ? null : n;
}

export function registerTaggingRoutes(app: Express) {
  /** Sessions available to tag, with progress on each. */
  app.get("/api/admin/tagging/sessions", isPlatformAdmin, async (_req, res, next) => {
    try {
      res.json(await store.listTaggableSessions());
    } catch (error) {
      next(error);
    }
  });

  /** One session's turns, in order, with the current label on each. */
  app.get("/api/admin/tagging/sessions/:id", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid session id" });

      const result = await store.getSessionTurns(id);
      if (!result) return res.status(404).json({ error: "No transcript for that session" });

      res.json({ ...result, taggableTypes: TAGGABLE });
    } catch (error) {
      next(error);
    }
  });

  /** Records a human judgement on one turn. */
  app.put("/api/admin/tagging/turns/:id", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid turn id" });

      const { turnType } = req.body ?? {};
      if (!TAGGABLE.includes(turnType)) {
        return res.status(400).json({
          error: `turnType must be one of: ${TAGGABLE.join(", ")}`,
          note:
            "AI turn types are structural, not judged — they are derived from " +
            "position and the preceding turn, so they cannot be hand-tagged.",
        });
      }

      const result = await store.handTagTurn({
        turnId: id,
        turnType,
        taggedByUserId: req.user!.id,
      });
      if (!result) return res.status(404).json({ error: "Turn not found" });

      // Disagreements are the interesting events — they are what tells the
      // methodology owner the classifier prompt needs work.
      if (result.changed && result.wasMachineLabelled) {
        log(
          `turn ${id} OVERTURNED by user ${req.user!.id}: ` +
            `nano said ${result.previousType}, human says ${turnType}`,
          "tagging",
        );
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /** Removes a hand tag, returning the turn to the classifier. */
  app.delete("/api/admin/tagging/turns/:id", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid turn id" });

      const cleared = await store.clearHandTag(id);
      if (!cleared) {
        return res.status(404).json({ error: "Turn not found, or not hand-tagged" });
      }
      res.json(cleared);
    } catch (error) {
      next(error);
    }
  });

  /** How much of the corpus is labelled. */
  app.get("/api/admin/tagging/coverage", isPlatformAdmin, async (_req, res, next) => {
    try {
      res.json(await store.taggingCoverage());
    } catch (error) {
      next(error);
    }
  });

  /* ── Classifier prompt (the feedback loop) ─────────────────────────────── */

  /** The built-in rules, so the editor starts from what is actually running. */
  app.get("/api/admin/classifier/default-rules", isPlatformAdmin, async (_req, res, next) => {
    try {
      const { DEFAULT_RULES } = await import("./wing/classifier");
      res.json({ rules: DEFAULT_RULES });
    } catch (error) {
      next(error);
    }
  });

  /** The published prompt in force, with its rules and examples. */
  app.get("/api/admin/classifier/prompt", isPlatformAdmin, async (_req, res, next) => {
    try {
      const training = await import("./wing/classifier-training");
      res.json(await training.currentPrompt());
    } catch (error) {
      next(error);
    }
  });

  /** What publishing would produce — examples, split sizes — without writing. */
  app.get("/api/admin/classifier/preview", isPlatformAdmin, async (_req, res, next) => {
    try {
      const training = await import("./wing/classifier-training");
      res.json(await training.previewExamples());
    } catch (error) {
      next(error);
    }
  });

  /**
   * Publishes a new classifier prompt built from the tagged corpus.
   *
   * This is what makes tagging compound: labels become worked examples that
   * every future classification sees, for every student, without a deploy.
   */
  app.post("/api/admin/classifier/publish", isPlatformAdmin, async (req, res, next) => {
    try {
      const { rules, cycleId, name } = req.body ?? {};
      if (typeof rules !== "string" || rules.trim().length < 50) {
        return res.status(400).json({
          error: "rules is required and must be a substantial instruction block",
        });
      }

      const training = await import("./wing/classifier-training");
      const result = await training.publishClassifierPrompt({
        rules: rules.trim(),
        cycleId: cycleId ?? null,
        name,
      });

      log(
        `classifier prompt v${result.versionNumber} published by user ${req.user!.id}`,
        "tagging",
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Measures the classifier against the hand-tagged set.
   *
   * Makes one Nano call per tagged turn and writes nothing. Deliberately a POST
   * despite being read-only: it costs real money and time, so it should not be
   * triggered by a page load, a prefetch, or a refresh.
   */
  app.post("/api/admin/tagging/validate", isPlatformAdmin, async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.body?.limit ?? 200), 500);
      const result = await store.runValidation(limit);

      log(
        `classifier validation: ${result.agreed}/${result.evaluated} agreed` +
          (result.accuracy != null ? ` (${(result.accuracy * 100).toFixed(1)}%)` : "") +
          (result.unresolved ? `, ${result.unresolved} unresolved` : ""),
        "tagging",
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}

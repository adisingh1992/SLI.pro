import { Express, Request, Response, NextFunction } from "express";
import * as store from "./wing/analysis-methodology-store";
import { log } from "./logger";

/**
 * Analysis methodology API — how the analysis reads a transcript, editable
 * without a deploy.
 *
 * Sibling of criteria-routes. The difference in stakes is worth stating: a bad
 * criterion can make a session impossible to complete, which a student
 * experiences as being stuck. A bad methodology section produces a worse
 * judgement — real, but recoverable, and visible in the reasoning rather than
 * as a dead end. Both are live on publish, so both get replay.
 */

const POPULATIONS = [
  "undergraduate_or_recent_grad",
  "early_career",
  "mid_career_or_senior",
];

/**
 * Foundation Sessions only.
 *
 * Enhancement Module analysis prompts have not been parameterised for
 * methodology, so their `getAnalysisPrompt` would ignore anything published
 * here. Listing them would offer an editor that silently does nothing.
 */
const SESSION_TYPES = ["foundation_1", "foundation_2", "foundation_3"];

const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user?.isAdmin) return next();
  res.status(403).json({ error: "Admin access required" });
};

function validSelector(populationTag: string, sessionType: string) {
  return POPULATIONS.includes(populationTag) && SESSION_TYPES.includes(sessionType);
}

export function registerMethodologyRoutes(app: Express) {
  app.get("/api/admin/methodology", isAdmin, async (_req, res, next) => {
    try {
      res.json({
        populations: POPULATIONS,
        sessionTypes: SESSION_TYPES,
        published: await store.listAll(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/api/admin/methodology/:populationTag/:sessionType",
    isAdmin,
    async (req, res, next) => {
      try {
        const { populationTag, sessionType } = req.params;
        if (!validSelector(populationTag, sessionType)) {
          return res.status(400).json({ error: "Unknown population or session type" });
        }

        res.json({
          published: await store.getPublished(populationTag, sessionType),
          versions: await store.listVersions(populationTag, sessionType),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Replays draft methodology against completed sessions.
   *
   * POST because it costs a model call per session. Writes nothing.
   */
  app.post(
    "/api/admin/methodology/:populationTag/:sessionType/replay",
    isAdmin,
    async (req, res, next) => {
      try {
        const { populationTag, sessionType } = req.params;
        if (!validSelector(populationTag, sessionType)) {
          return res.status(400).json({ error: "Unknown population or session type" });
        }

        const { sections } = req.body ?? {};
        if (!Array.isArray(sections) || !sections.length) {
          return res.status(400).json({ error: "sections must be a non-empty array" });
        }

        const replay = await import("./wing/criteria-replay");
        // criteria omitted: this replays the METHODOLOGY change against
        // whatever criteria are currently published, so any difference in the
        // result is attributable to the edit under test.
        const result = await replay.replay({
          populationTag,
          sessionType,
          sections,
          limit: Number(req.body?.limit ?? 10),
        });

        log(
          `methodology replay ${populationTag}/${sessionType}: ` +
            `${result.stillCompletes} still complete, ${result.wouldNowFail} would now fail, ` +
            `${result.wouldNowPass} would newly pass`,
          "methodology",
        );

        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  /** Publishes new sections, retiring the current version. */
  app.post(
    "/api/admin/methodology/:populationTag/:sessionType",
    isAdmin,
    async (req, res, next) => {
      try {
        const { populationTag, sessionType } = req.params;
        if (!validSelector(populationTag, sessionType)) {
          return res.status(400).json({ error: "Unknown population or session type" });
        }

        const { sections, changeNote } = req.body ?? {};
        if (!Array.isArray(sections) || !sections.length) {
          return res.status(400).json({
            error: "At least one section is required",
            detail:
              "An empty methodology would leave the analysis with no instructions " +
              "for reading the transcript.",
          });
        }

        const bad = sections.find(
          (s: any) => typeof s?.title !== "string" || !s.title.trim(),
        );
        if (bad) {
          return res.status(400).json({ error: "Every section needs a title" });
        }

        const created = await store.publish({
          populationTag,
          sessionType,
          sections,
          changeNote: changeNote ?? null,
          userId: req.user!.id,
        });

        log(
          `methodology ${populationTag}/${sessionType} v${created.versionNumber} ` +
            `published by user ${req.user!.id}`,
          "methodology",
        );
        res.status(201).json(created);
      } catch (error) {
        next(error);
      }
    },
  );

  /** Republishes an earlier version — the rollback. */
  app.post("/api/admin/methodology/revert/:versionId", isAdmin, async (req, res, next) => {
    try {
      const versionId = parseInt(req.params.versionId, 10);
      if (Number.isNaN(versionId)) {
        return res.status(400).json({ error: "Invalid version id" });
      }

      const reverted = await store.revertTo(versionId, req.user!.id);
      if (!reverted) return res.status(404).json({ error: "Version not found" });

      log(`methodology reverted to version ${versionId} by user ${req.user!.id}`, "methodology");
      res.json(reverted);
    } catch (error) {
      next(error);
    }
  });
}

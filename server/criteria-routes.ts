import { Express, Request, Response, NextFunction } from "express";
import * as store from "./wing/completion-criteria-store";
import { log } from "./logger";

/**
 * Completion criteria API — methodology the owner can change without a deploy.
 *
 * Publishing changes when every future session of that population/type is
 * judged complete. There is no gate between an edit and every student, which
 * is why replay exists: run a draft against sessions that already finished and
 * see whether they still would.
 */

const POPULATIONS = [
  "undergraduate_or_recent_grad",
  "early_career",
  "mid_career_or_senior",
];
const SESSION_TYPES = [
  "foundation_1", "foundation_2", "foundation_3",
  // Modules live in the same table — enhancement_a/b/c were already in the
  // session_type enum, so no schema change was needed.
  "enhancement_a", "enhancement_b", "enhancement_c",
];

const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user?.isAdmin) return next();
  res.status(403).json({ error: "Admin access required" });
};

function validSelector(populationTag: string, sessionType: string) {
  return POPULATIONS.includes(populationTag) && SESSION_TYPES.includes(sessionType);
}

export function registerCriteriaRoutes(app: Express) {
  /** Everything published, for the index. */
  app.get("/api/admin/criteria", isAdmin, async (_req, res, next) => {
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

  /** One population/session: what is live, plus its version history. */
  app.get(
    "/api/admin/criteria/:populationTag/:sessionType",
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
   * Replays draft criteria against completed sessions.
   *
   * POST because it costs a model call per session, so it must not fire on a
   * page load or a refresh. Writes nothing.
   */
  app.post(
    "/api/admin/criteria/:populationTag/:sessionType/replay",
    isAdmin,
    async (req, res, next) => {
      try {
        const { populationTag, sessionType } = req.params;
        if (!validSelector(populationTag, sessionType)) {
          return res.status(400).json({ error: "Unknown population or session type" });
        }

        const { criteria } = req.body ?? {};
        if (!Array.isArray(criteria) || !criteria.length) {
          return res.status(400).json({ error: "criteria must be a non-empty array" });
        }

        const replay = await import("./wing/criteria-replay");
        const result = await replay.replay({
          populationTag,
          sessionType,
          criteria,
          limit: Number(req.body?.limit ?? 10),
        });

        log(
          `criteria replay ${populationTag}/${sessionType}: ` +
            `${result.stillCompletes} still complete, ${result.wouldNowFail} would now fail, ` +
            `${result.wouldNowPass} would newly pass`,
          "criteria",
        );

        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  /** Publishes new criteria, retiring the current version. */
  app.post(
    "/api/admin/criteria/:populationTag/:sessionType",
    isAdmin,
    async (req, res, next) => {
      try {
        const { populationTag, sessionType } = req.params;
        if (!validSelector(populationTag, sessionType)) {
          return res.status(400).json({ error: "Unknown population or session type" });
        }

        const { criteria, changeNote } = req.body ?? {};
        if (!Array.isArray(criteria) || !criteria.length) {
          return res.status(400).json({
            error: "At least one criterion is required",
            detail:
              "An empty list would mark every session complete on its first turn.",
          });
        }

        const bad = criteria.find(
          (c: any) => typeof c?.text !== "string" || !c.text.trim(),
        );
        if (bad) {
          return res.status(400).json({ error: "Every criterion needs text" });
        }

        const created = await store.publish({
          populationTag,
          sessionType,
          criteria,
          changeNote: changeNote ?? null,
          userId: req.user!.id,
        });

        log(
          `criteria ${populationTag}/${sessionType} v${created.versionNumber} ` +
            `published by user ${req.user!.id}`,
          "criteria",
        );
        res.status(201).json(created);
      } catch (error) {
        next(error);
      }
    },
  );

  /** Republishes an earlier version — the rollback. */
  app.post("/api/admin/criteria/revert/:versionId", isAdmin, async (req, res, next) => {
    try {
      const versionId = parseInt(req.params.versionId, 10);
      if (Number.isNaN(versionId)) {
        return res.status(400).json({ error: "Invalid version id" });
      }

      const reverted = await store.revertTo(versionId, req.user!.id);
      if (!reverted) return res.status(404).json({ error: "Version not found" });

      log(`criteria reverted to version ${versionId} by user ${req.user!.id}`, "criteria");
      res.json(reverted);
    } catch (error) {
      next(error);
    }
  });
}

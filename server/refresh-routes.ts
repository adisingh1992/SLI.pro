import { Express, Request, Response, NextFunction } from "express";
import * as refresh from "./wing/positioning-refresh";
import * as sliStore from "./wing/sli-store";
import { log } from "./logger";

/**
 * Positioning Refresh — career-evolution re-entry (Feature List A2).
 *
 * Available to anyone with an active SLI, at any time. The spec is explicit
 * that this is "not just after years, and not just for career pivots" — a
 * promotion, a move into founding something, an industry change, or simply a
 * sense that the statement no longer fits all qualify, and none of them are
 * things the platform can reliably detect on the student's behalf.
 *
 * So there is no eligibility window and no cooldown. Gating re-entry on elapsed
 * time would mean telling someone promoted six weeks after finishing that their
 * positioning is not allowed to have changed yet.
 */

const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Not signed in" });
};

export function registerRefreshRoutes(app: Express) {
  /** Whether a refresh is offered, plus the conversation so far. */
  app.get("/api/positioning-refresh", isAuthenticated, async (req, res, next) => {
    try {
      const state = await refresh.getState(req.user!.id);
      if (!state) return res.status(404).json({ error: "No student record for this account" });

      res.json({
        available: !!state.currentSli,
        currentSli: state.currentSli,
        priorCount: state.priorCount,
        messages: state.messages,
        complete: state.complete,
      });
    } catch (error) {
      next(error);
    }
  });

  /** The full lineage — every SLI this student has had, oldest first. */
  app.get("/api/positioning-refresh/history", isAuthenticated, async (req, res, next) => {
    try {
      const history = await sliStore.lineage(req.user!.id);
      res.json(
        history.map((s) => ({
          id: s.id,
          statement: s.statement,
          source: s.source,
          status: s.status,
          createdAt: s.createdAt,
          supersededAt: s.supersededAt,
        })),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/positioning-refresh/begin", isAuthenticated, async (req, res, next) => {
    try {
      const state = await refresh.begin(req.user!.id);
      if (!state) {
        return res.status(409).json({
          error: "There's no positioning to refresh yet — finish the foundation sessions first.",
        });
      }
      res.json({ messages: state.messages, currentSli: state.currentSli });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/positioning-refresh/message", isAuthenticated, async (req, res, next) => {
    try {
      const message = String(req.body?.message ?? "").trim();
      if (!message) return res.status(400).json({ error: "Say something first." });

      const result = await refresh.respond(req.user!.id, message);
      if (!result) {
        // Their message is already in the transcript — only the reply is lost.
        return res.status(503).json({
          error: "Wing didn't manage a reply just then. Your message was saved — try again.",
        });
      }

      res.json({
        reply: result.reply,
        proposal: result.proposal,
        unchanged: result.unchanged,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Accepts the proposed statement.
   *
   * Explicit and separate from the conversation. Replacing the sentence a
   * person's professional identity is pinned to should not be a side effect of
   * having chatted — they say yes to it.
   */
  app.post("/api/positioning-refresh/accept", isAuthenticated, async (req, res, next) => {
    try {
      const statement = String(req.body?.statement ?? "").trim();
      const rationale = String(req.body?.rationale ?? "").trim();

      if (!statement) return res.status(400).json({ error: "No statement to accept." });
      if (statement.length > 400 || statement.includes("\n")) {
        return res.status(400).json({ error: "That doesn't look like an SLI." });
      }

      const created = await refresh.accept(req.user!.id, { statement, rationale });
      if (!created) {
        return res.status(409).json({ error: "There's no active SLI to refresh." });
      }

      log(`positioning refresh accepted by user ${req.user!.id}`, "refresh");
      res.json({ sli: created });
    } catch (error) {
      next(error);
    }
  });

  /** Starts the refresh conversation over. */
  app.post("/api/positioning-refresh/reset", isAuthenticated, async (req, res, next) => {
    try {
      await refresh.reset(req.user!.id);
      res.json({ reset: true });
    } catch (error) {
      next(error);
    }
  });
}

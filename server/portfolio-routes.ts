import { Express, Request, Response, NextFunction } from "express";
import * as portfolio from "./wing/evidence-portfolio";
import { log } from "./logger";
import { isAdmin, isAuthenticated } from "./admin-guards";

/**
 * Behavioral Evidence Portfolio API (Feature List A4).
 *
 * Two readers with different needs, served by the same data:
 *
 *   the student   claims they can repeat in an interview, each with the thing
 *                 they said that backs it up.
 *   an advisor    coverage across the NACE competencies, including the gaps —
 *                 which is the part that shapes a conversation.
 */

export function registerPortfolioRoutes(app: Express) {
  app.get("/api/portfolio", isAuthenticated, async (req, res, next) => {
    try {
      const [items, coverage] = await Promise.all([
        portfolio.get(req.user!.id),
        portfolio.coverage(req.user!.id),
      ]);
      res.json({ items, coverage });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Builds or rebuilds the portfolio.
   *
   * A rebuild replaces rather than appends — the items are derived from the
   * transcript, and running it twice should produce the portfolio as it stands
   * rather than two overlapping copies.
   */
  app.post("/api/portfolio/build", isAuthenticated, async (req, res, next) => {
    try {
      const result = await portfolio.build(req.user!.id);

      if (result.created === 0) {
        /*
         * 200, not an error. Zero items is a legitimate outcome — the student
         * may not have said anything yet that survives the evidence bar, and
         * the reasons say which. Returning a failure would push the UI toward
         * "try again", which would just spend another flagship call to reach
         * the same honest answer.
         */
        return res.json({
          created: 0,
          skipped: result.skipped,
          reasons: result.reasons,
          message:
            "Nothing met the evidence bar yet. Finish a session or two and try again — " +
            "the portfolio only holds claims that survive a follow-up question.",
        });
      }

      log(`portfolio built for user ${req.user!.id}: ${result.created} items`, "portfolio");
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /** Admin view of any student's portfolio, for the advisor-facing surfaces. */
  app.get("/api/admin/users/:userId/portfolio", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      if (Number.isNaN(userId)) return res.status(400).json({ error: "Invalid user id" });

      const [items, coverage] = await Promise.all([
        portfolio.get(userId),
        portfolio.coverage(userId),
      ]);
      res.json({ items, coverage });
    } catch (error) {
      next(error);
    }
  });
}

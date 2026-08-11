import { Request, Response, NextFunction } from "express";

/**
 * The two admin guards, in one place.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
 * `isAdmin` was defined independently in nine route files, each an identical
 * three-line copy. That is fine until the definition needs to change — and it
 * does change here, because "admin" turns out to mean two different things:
 *
 *   isAdmin          runs a cohort. Students, advising, messages, metrics.
 *   isPlatformAdmin  runs the engine. Heuristic cards, objectives, completion
 *                    criteria, turn tagging, the classifier prompt.
 *
 * The second is a strictly higher bar. A completion criterion saved in the
 * admin UI applies to every student immediately, with no review gate between
 * the edit and the cohort — so an institutional partner having the button is a
 * real risk, not a tidiness concern.
 *
 * The client hides the methodology navigation for non-platform admins. That is
 * presentation. This is the boundary: hiding a link does not stop a request.
 */

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Not signed in" });
};

/** Either admin role. Cohort operations. */
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user?.isAdmin) return next();
  res.status(403).json({ error: "Admin access required" });
};

/**
 * SLIpro internal staff only. The methodology engine.
 *
 * Returns 403 rather than 404: the caller is a legitimate admin who reached a
 * surface above their level, and telling them so is more useful than pretending
 * the route does not exist.
 */
export const isPlatformAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user?.role === "platform_admin") return next();
  res.status(403).json({
    error: "This area is limited to SLIpro platform staff.",
  });
};

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

/* ── Scope ────────────────────────────────────────────────────────────────
 *
 * `isAdmin` answers "may this person use an admin route". It does not answer
 * "whose data", and until now nothing did — so every admin route served the
 * whole platform to whoever passed the guard.
 *
 * That is fine while every administrator is SLIpro staff, which today they are:
 * nothing in the codebase creates an `institution_admin`, so the only role
 * writes anywhere set `platform_admin` or `student`. It stops being fine the
 * moment a Berkeley or Vanderbilt account is created, and at that point the
 * failure is not subtle — `/api/admin/metrics/export` reads `institutionId`
 * straight off the query string, so one partner could request another's cohort
 * and receive a CSV of student names and email addresses. Omitting the
 * parameter means "no filter", which is every student on the platform.
 *
 * So: a scope is derived from the SESSION, never from the request. A route may
 * narrow within it and may not widen out of it.
 *
 * FAIL CLOSED. An `institution_admin` with no `institution_id` sees nothing.
 * The tempting default — treat an unset scope as unrestricted — turns a
 * half-finished account into a platform-wide one, and a half-finished account
 * is exactly what you get when somebody is created in a hurry before a demo.
 */

export type AdminScope =
  /** SLIpro staff: every institution, including students with no institution. */
  | { kind: "all" }
  /** A partner administrator: exactly one institution. */
  | { kind: "institution"; institutionId: number };

/**
 * The scope this request may read, or null if it may read nothing.
 *
 * Pure — no database, no response. Route handlers should call
 * `resolveInstitutionFilter` or `requireScope`, which handle the refusal.
 */
export function adminScope(req: Request): AdminScope | null {
  if (!req.isAuthenticated() || !req.user) return null;
  const { role, institutionId } = req.user;

  if (role === "platform_admin") return { kind: "all" };
  if (role === "institution_admin") {
    return institutionId == null ? null : { kind: "institution", institutionId };
  }
  return null;
}

/** `adminScope`, refusing with a 403 rather than returning null. */
export function requireScope(req: Request, res: Response): AdminScope | null {
  const scope = adminScope(req);
  if (scope) return scope;

  res.status(403).json({
    error:
      req.user?.role === "institution_admin"
        ? "This account is not linked to an institution yet, so there is no cohort to show. " +
          "Ask SLIpro to finish setting it up."
        : "Admin access required",
  });
  return null;
}

/**
 * Narrows a client-supplied institution filter to what the caller may read.
 *
 * Returns null having already sent a response, so a handler reads:
 *
 *     const filter = resolveInstitutionFilter(req, res, requestedId);
 *     if (!filter) return;
 *
 * A partner administrator asking for somebody else's institution gets a 403,
 * not a silent substitution of their own. Silently rewriting the filter would
 * put a number on screen under the wrong label, and these numbers go into
 * budget defence — a quietly corrected answer is worse than a refusal.
 */
export function resolveInstitutionFilter(
  req: Request,
  res: Response,
  requested: number | null,
): { institutionId: number | null } | null {
  const scope = requireScope(req, res);
  if (!scope) return null;

  if (scope.kind === "all") return { institutionId: requested ?? null };

  if (requested != null && requested !== scope.institutionId) {
    res.status(403).json({
      error: "You can only view your own institution's cohort.",
    });
    return null;
  }
  return { institutionId: scope.institutionId };
}

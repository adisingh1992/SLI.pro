import { Express, Request, Response, NextFunction } from "express";
import * as metrics from "./wing/cohort-metrics";
import { isAdmin, requireScope, resolveInstitutionFilter } from "./admin-guards";

/**
 * Institutional admin dashboard API (Feature List B4).
 *
 * The spec's purpose for these numbers is "budget defense and board
 * reporting", which sets the bar: a career centre director will put them in
 * front of someone who controls their funding. So the API returns counts
 * alongside every rate and never invents a denominator.
 */

/**
 * Query string → filter, narrowed to what the caller may read.
 *
 * `institutionId` used to be taken straight from the query string and never
 * compared to the caller, and an absent one meant "no filter" — every student on
 * the platform. Both are fine while every admin is SLIpro staff and neither
 * survives the first partner account, so the scope comes from the session and
 * the query string may only narrow within it.
 *
 * Returns null having already responded, so a handler reads:
 *
 *     const filter = parseScopedFilter(req, res);
 *     if (!filter) return;
 */
function parseScopedFilter(req: Request, res: Response): metrics.MetricsFilter | null {
  const raw = parseFilter(req);
  const scoped = resolveInstitutionFilter(req, res, raw.institutionId ?? null);
  if (!scoped) return null;
  return { ...raw, institutionId: scoped.institutionId };
}

/** Query string → filter. Absent and unparseable both mean "no filter". */
function parseFilter(req: Request): metrics.MetricsFilter {
  const num = (v: unknown) => {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isNaN(n) ? null : n;
  };
  // Validated as a date rather than passed through: `new Date("banana")` is an
  // Invalid Date, which Drizzle would happily put into the query.
  const date = (v: unknown) => {
    const s = String(v ?? "").trim();
    return s && !Number.isNaN(new Date(s).getTime()) ? s : null;
  };
  // Same reasoning as `date`: an unrecognized value means "no filter", not a query
  // that silently matches nobody because it fell through to a comparison against a
  // string the SQL side was never taught.
  const completionStatus = (v: unknown): metrics.CompletionStatus | null => {
    const s = String(v ?? "").trim();
    return s === "never_started" || s === "in_progress" || s === "completed_all_three"
      ? s
      : null;
  };

  return {
    institutionId: num(req.query.institutionId),
    cycleId: num(req.query.cycleId),
    from: date(req.query.from),
    to: date(req.query.to),
    completionStatus: completionStatus(req.query.completionStatus),
  };
}

export function registerMetricsRoutes(app: Express) {
  /** Institutions and their cycles, for the filter controls. */
  app.get("/api/admin/metrics/options", isAdmin, async (req, res, next) => {
    try {
      const scope = requireScope(req, res);
      if (!scope) return;
      // A partner administrator is offered their own institution and no other.
      res.json(
        await metrics.filterOptions(scope.kind === "all" ? null : scope.institutionId),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/metrics", isAdmin, async (req, res, next) => {
    try {
      const filter = parseScopedFilter(req, res);
      if (!filter) return;
      res.json(await metrics.cohortMetrics(filter));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Per-student CSV for the current filter.
   *
   * CSV rather than XLSX, unlike the older exports on the Reports page: this
   * one is meant to be pivoted, and a plain CSV opens in Excel, Sheets and
   * whatever the institution actually uses without a library on our side.
   */
  app.get("/api/admin/metrics/export", isAdmin, async (req, res, next) => {
    try {
      const filter = parseScopedFilter(req, res);
      if (!filter) return;
      const rows = await metrics.studentRows(filter);

      const csv = metrics.toCsv(
        rows.map((r) => ({
          student_id: r.studentId,
          first_name: r.firstName,
          last_name: r.lastName,
          email: r.email,
          institution: r.institution ?? "",
          registered_at: r.registeredAt ? new Date(r.registeredAt).toISOString() : "",
          last_login_at: r.lastLoginAt ? new Date(r.lastLoginAt).toISOString() : "",
          foundation_sessions_completed: r.sessionsCompleted,
          has_selected_sli: r.hasSelectedSli ? "yes" : "no",
        })),
      );

      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="cohort-${stamp}.csv"`);
      // A BOM, so Excel on Windows reads it as UTF-8 rather than mangling any
      // non-ASCII name in the file.
      res.send("﻿" + csv);
    } catch (error) {
      next(error);
    }
  });
}

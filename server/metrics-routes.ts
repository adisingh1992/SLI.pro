import { Express, Request, Response, NextFunction } from "express";
import * as metrics from "./wing/cohort-metrics";
import { isAdmin } from "./admin-guards";

/**
 * Institutional admin dashboard API (Feature List B4).
 *
 * The spec's purpose for these numbers is "budget defense and board
 * reporting", which sets the bar: a career centre director will put them in
 * front of someone who controls their funding. So the API returns counts
 * alongside every rate and never invents a denominator.
 */

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

  return {
    institutionId: num(req.query.institutionId),
    cycleId: num(req.query.cycleId),
    from: date(req.query.from),
    to: date(req.query.to),
  };
}

export function registerMetricsRoutes(app: Express) {
  /** Institutions and their cycles, for the filter controls. */
  app.get("/api/admin/metrics/options", isAdmin, async (_req, res, next) => {
    try {
      res.json(await metrics.filterOptions());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/metrics", isAdmin, async (req, res, next) => {
    try {
      res.json(await metrics.cohortMetrics(parseFilter(req)));
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
      const filter = parseFilter(req);
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

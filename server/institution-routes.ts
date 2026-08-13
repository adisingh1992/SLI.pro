import type { Express } from "express";
import { z } from "zod";
import { isPlatformAdmin } from "./admin-guards";
import * as assignment from "./wing/institution-assignment";

/**
 * Repairing cohort attribution.
 *
 * Domain matching attaches students to their institution at registration and
 * gets it right for anyone who signs up with a .edu address. The failure it
 * cannot recover from is the common one: a Berkeley student who registers with a
 * personal Gmail address matches nothing, becomes direct/B2C, and disappears
 * from Berkeley's reporting permanently — `backfill()` re-runs the same match
 * and fails identically. Before these two routes, no code path anywhere wrote
 * `students.institution_id`, so there was no repair at all.
 *
 * ── PLATFORM STAFF ONLY, AND NOT FOR WANT OF SCOPING ─────────────────────
 * Both routes are `isPlatformAdmin`, and that is a design decision rather than
 * deferred work:
 *
 *   - an unattached student is in NO institution, so an institution-scoped
 *     caller would correctly see an empty list. The feature cannot exist for a
 *     partner without letting them read students outside their cohort.
 *   - letting a partner claim unattached students invites exactly the race the
 *     scoping work exists to prevent — Berkeley claiming a Vanderbilt student
 *     who happened to use Gmail, in good faith, with nothing to catch it.
 *
 * So SLIpro staff repair attribution. A career centre that spots a missing
 * student asks; that ask is cheap and the alternative is not.
 */

const assignBody = z.object({
  /** Null detaches, returning the student to direct/B2C. */
  institutionId: z.number().int().positive().nullable(),
  /** Omit to use the institution's current active cycle. */
  cycleId: z.number().int().positive().nullable().optional(),
});

export function registerInstitutionRoutes(app: Express) {
  /**
   * Students attached to no institution.
   *
   * `claimsPartnership` is the column to sort by: those students selected
   * "university partnership" at registration and then matched no domain, which
   * is a contradiction they told us about themselves. The rest are ordinary
   * direct students and are not a problem.
   */
  app.get("/api/admin/students/unattached", isPlatformAdmin, async (_req, res, next) => {
    try {
      const { students, excludedTestAccounts } = await assignment.listUnattached();
      res.json({
        students,
        // Derived from the same filtered rows the table renders, so the figure on
        // the screen and the rows beneath it can never disagree.
        total: students.length,
        claimingPartnership: students.filter((r) => r.claimsPartnership).length,
        excludedTestAccounts,
      });
    } catch (error) {
      next(error);
    }
  });

  /** Attach, reattach or detach one student. Audited. */
  app.put("/api/admin/students/:userId/institution", isPlatformAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      if (Number.isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user id" });
      }

      const parsed = assignBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "institutionId must be a positive integer or null",
          detail: parsed.error.flatten(),
        });
      }

      const result = await assignment.assignInstitutionManually({
        userId,
        institutionId: parsed.data.institutionId,
        cycleId: parsed.data.cycleId,
        actorUserId: req.user!.id,
      });

      if (!result.ok) {
        return res
          .status(404)
          .json({ error: result.reason === "student_not_found" ? "Student not found" : "Institution not found" });
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}

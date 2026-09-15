import { Express } from "express";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  sessions,
  students,
  transcripts,
  transcriptTurns,
  userHeuristicApplications,
  users,
} from "@shared/wing-schema";
import { isPlatformAdmin } from "./admin-guards";
import { sessionTrace } from "./harness/trace-store";
import { buildDiscrepancyReport } from "./harness/discrepancy-report";

/**
 * The test harness surface — read only.
 *
 * ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────
 * Danielle does not run commands. `npm run harness:trace` is the same data and
 * it is unreachable to the person the data is for, which makes it worth nothing
 * to her. Her own sentence about why the trace matters — "the selection trace is
 * what makes this a methodology review tool and not just QA… without it I'm
 * just reading transcripts and guessing" — is a statement about a screen, not
 * about a database column.
 *
 * ── WHAT IT IS AND IS NOT ────────────────────────────────────────────────
 * Two GETs. No POST, no PATCH, no DELETE, and nothing here writes: the harness
 * is additive by construction (see server/harness/README.md), and this file is
 * where a "just mark it reviewed" button would first breach that. Reviewing
 * findings already has a home on the Integrity panel, which owns the table it
 * writes to.
 *
 * The persona runner does not exist yet, so there is nothing here to start a
 * run. What this gives Danielle today is the trace on sessions she has run BY
 * HAND, which is the manual-testing path she asked for on Friday and the
 * earliest point any of this changes her working week. When the runner lands it
 * adds routes beside these; it does not change them.
 *
 * ── PLATFORM STAFF ONLY, AND WHY THE TURN TEXT IS HERE ───────────────────
 * `isPlatformAdmin`, the same boundary the rest of the methodology engine sits
 * behind. The trace carries `transcript_turns.content` — the student's own
 * words — which is a deliberate inclusion and the reason the screen is useful:
 * "Tyler hedged four times and no card fired" cannot be read off card codes
 * alone. It is the same sensitivity the Tagging surface already carries, under
 * the same guard.
 *
 * No name, no email, no free-text profile field is returned anywhere in this
 * file. A student id and a session id are enough to reach the transcript
 * through the screens that already guard it, which is the precedent
 * gate-audit-routes.ts set for exactly this reason.
 *
 * ── THE ONE PLACE THIS DELIBERATELY DISAGREES WITH THE OTHER ADMIN SCREENS ──
 * The Students page, Tagging and the analytics counts all filter `is_test_user`
 * OUT. This list leaves test accounts IN and badges them, because a persona run
 * is a test account by definition and a harness that hid them would list
 * everything except the thing it is for. It is the one screen where that flag
 * is a label rather than a filter.
 */

/** Turn types that carry the student's own words. Mirrors trace-store.ts. */
const HUMAN_TURN_TYPES = [
  "human_elicited_response",
  "human_spontaneous",
  "human_correction",
] as const;

const MAX_PAGE = 100;

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function registerHarnessRoutes(app: Express) {
  /**
   * Sessions to trace, newest first.
   *
   * Newest first because the session she wants is almost always the one she
   * just ran. `turns` and `cardsFired` are on the row so a session with
   * nothing to look at is visible as such before she opens it — an empty trace
   * and an untraced session look identical otherwise, which is the same failure
   * the Integrity panel was built to avoid.
   *
   * `cardsFired` counts application rows, so it counts what Wing actually
   * applied. A session showing turns > 0 and cardsFired 0 is the interesting
   * case, not a broken row.
   */
  app.get("/api/admin/harness/sessions", isPlatformAdmin, async (req, res, next) => {
    try {
      const limit = Math.min(MAX_PAGE, Math.max(1, Number(req.query.limit) || 25));
      const offset = Math.max(0, Number(req.query.offset) || 0);

      const studentId =
        typeof req.query.studentId === "string" && req.query.studentId.trim()
          ? parseId(req.query.studentId.trim())
          : null;
      if (req.query.studentId && !studentId) {
        return res.status(400).json({ error: "studentId must be a positive integer" });
      }

      const sessionType =
        typeof req.query.sessionType === "string" && req.query.sessionType.trim()
          ? req.query.sessionType.trim()
          : null;
      const testOnly = req.query.testOnly === "1" || req.query.testOnly === "true";

      const filters = [];
      if (studentId) filters.push(eq(sessions.studentId, studentId));
      if (sessionType) filters.push(eq(sessions.sessionType, sessionType as never));
      if (testOnly) filters.push(eq(users.isTestUser, true));
      const where = filters.length ? and(...filters) : undefined;

      const rows = await db
        .select({
          sessionId: sessions.id,
          studentId: sessions.studentId,
          sessionType: sessions.sessionType,
          status: sessions.status,
          isTestUser: users.isTestUser,
          startedAt: sessions.startedAt,
          createdAt: sessions.createdAt,
          completedAt: sessions.completedAt,
        })
        .from(sessions)
        .innerJoin(students, eq(students.id, sessions.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .where(where)
        .orderBy(desc(sessions.createdAt), desc(sessions.id))
        .limit(limit)
        .offset(offset);

      const [[totalRow], turnCounts, firedCounts] = await Promise.all([
        db
          .select({ n: count() })
          .from(sessions)
          .innerJoin(students, eq(students.id, sessions.studentId))
          .innerJoin(users, eq(users.id, students.userId))
          .where(where),
        /*
         * Counted for the page's rows only, not for the whole table. Two extra
         * grouped queries over ≤100 ids, rather than two correlated subqueries
         * per row.
         */
        rows.length
          ? db
              .select({ sessionId: transcripts.sessionId, n: count() })
              .from(transcriptTurns)
              .innerJoin(transcripts, eq(transcripts.id, transcriptTurns.transcriptId))
              .where(
                and(
                  inArray(
                    transcripts.sessionId,
                    rows.map((r) => r.sessionId),
                  ),
                  inArray(
                    transcriptTurns.turnType,
                    HUMAN_TURN_TYPES as unknown as string[] as never,
                  ),
                ),
              )
              .groupBy(transcripts.sessionId)
          : Promise.resolve([] as Array<{ sessionId: number; n: number }>),
        rows.length
          ? db
              .select({ sessionId: userHeuristicApplications.sessionId, n: count() })
              .from(userHeuristicApplications)
              .where(
                inArray(
                  userHeuristicApplications.sessionId,
                  rows.map((r) => r.sessionId),
                ),
              )
              .groupBy(userHeuristicApplications.sessionId)
          : Promise.resolve([] as Array<{ sessionId: number; n: number }>),
      ]);

      const turnsBySession = new Map(turnCounts.map((r) => [r.sessionId, Number(r.n)]));
      const firedBySession = new Map(firedCounts.map((r) => [r.sessionId, Number(r.n)]));

      res.json({
        sessions: rows.map((r) => ({
          ...r,
          turns: turnsBySession.get(r.sessionId) ?? 0,
          cardsFired: firedBySession.get(r.sessionId) ?? 0,
        })),
        total: Number(totalRow?.n ?? 0),
        limit,
        offset,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * The reconstructed selection trace for one session.
   *
   * The response is `SessionTrace` verbatim from server/harness/trace-store.ts,
   * including its two honesty flags (`sequenceSource`, `populationTagsAsOf`) and
   * the per-turn `unavailable` list. None of that is stripped for the client:
   * the screen has to be able to say what the platform does not record, or a
   * gap reads as a finding.
   */
  app.get("/api/admin/harness/sessions/:id/trace", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid session id" });

      const trace = await sessionTrace(id);
      if (!trace) return res.status(404).json({ error: "Session not found" });

      res.json(trace);
    } catch (error) {
      next(error);
    }
  });

  /**
   * P5.4 — the discrepancy report for one session: turns where the persona's
   * (or student's) own hedging language and the card that actually won
   * disagree, quoted per turn. Built from the same `SessionTrace` the
   * `/trace` route above returns, so this never queries anything the trace
   * itself did not already reconstruct — see `discrepancy-report.ts`'s doc
   * comment for why this is scoped to hedging only and not every P5.1
   * counter.
   */
  app.get("/api/admin/harness/sessions/:id/discrepancies", isPlatformAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid session id" });

      const trace = await sessionTrace(id);
      if (!trace) return res.status(404).json({ error: "Session not found" });

      res.json({ sessionId: id, findings: buildDiscrepancyReport(trace) });
    } catch (error) {
      next(error);
    }
  });

  /**
   * The distinct session types present, for the filter.
   *
   * Read from the data rather than from the enum on purpose: the enum lists
   * every type the schema allows, and offering a filter that can only ever
   * return nothing is worse than a shorter list.
   */
  app.get("/api/admin/harness/session-types", isPlatformAdmin, async (_req, res, next) => {
    try {
      const rows = await db
        .select({ sessionType: sessions.sessionType, n: count() })
        .from(sessions)
        .groupBy(sessions.sessionType)
        .orderBy(sql`count(*) desc`);
      res.json({ sessionTypes: rows.map((r) => ({ ...r, n: Number(r.n) })) });
    } catch (error) {
      next(error);
    }
  });
}

import { eq } from "drizzle-orm";
import { db } from "../db";
import { sessions, students, users } from "@shared/wing-schema";

/**
 * `is_test_user` — one place that answers whether data belongs to a test account.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * The flag has been on `wing.users` since the schema was written and is
 * honoured on five admin surfaces — the Students page, Tagging, the Methodology
 * panels, the student record, and several analytics counts. It is not honoured
 * by the paths that decide what the METHODOLOGY learns. So a seeded persona's
 * turns would be judged by the outcome scorer, aggregated into
 * `user_heuristic_scores` — the table whose stated purpose is deciding which
 * methodology earns promotion — and typed by the Nano classifier into the same
 * corpus the hand-tagged gold standard is validated against.
 *
 * Twenty personas, thirty turns each, is 600 synthetic utterances inside the
 * evidence Danielle derives methodology from. That has to close before the
 * runner exists, not after.
 *
 * ── WHY A GUARD AND NOT A FILTER ─────────────────────────────────────────
 * The obvious shape was a `WHERE is_test_user = false` woven through the
 * analysis queries. Reading the consumers shows that is the wrong shape and a
 * much larger change than the right one: `scoreSession(sessionId)` and
 * `classifySession(sessionId)` are not corpus scans. They are per-session entry
 * points called from two places in `foundation-sessions-routes.ts` when a
 * session completes or is ended early. So the question is not "which rows does
 * this query see" but "should this run at all for this student" — one early
 * return each, at the top, where it is visible.
 *
 * The one genuine scan is `classify-backlog.ts`, which sweeps sessions with
 * provisional turns. That one takes a SQL filter, because a guard inside the
 * loop would still spend a query per persona session on every hourly run and
 * would leave the sweep re-finding them forever.
 *
 * ── WHY THIS IS A NO-OP TODAY, AND WHY THAT IS THE POINT ─────────────────
 * Nothing in the codebase sets `is_test_user` to true. The only assignment is
 * `bootstrap.ts` copying the legacy value during migration. So every one of
 * these guards returns false for every account that exists, and this change
 * alters no behaviour for any real student — by construction, not by care.
 * It becomes load-bearing the moment the seeder creates its first persona,
 * which is exactly the order it has to land in.
 *
 * ── FAILURE POSTURE ──────────────────────────────────────────────────────
 * These functions throw rather than swallow. Both callers already wrap
 * everything in a try/catch that logs loudly and returns, so a lookup failure
 * degrades to "did not analyse this session" rather than to "analysed a test
 * session". Of the two ways to be wrong, skipping one real session's scoring is
 * recoverable — the application rows are still there and it can be re-run — and
 * putting a persona into `user_heuristic_scores` is not, because the aggregate
 * has no provenance to unpick afterwards.
 */

/** Where a skip is logged from, so the reason is greppable. */
export const TEST_USER_SKIP = "skipped: test account (is_test_user)";

/** Whether a `wing.users` row is flagged as a test account. */
export async function isTestUserId(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ isTestUser: users.isTestUser })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  /*
   * A missing user is not a test user. It is a broken foreign key, and
   * answering `true` would silently switch analysis off for it — the failure
   * would look like the flag working.
   */
  return row?.isTestUser === true;
}

/** Whether a student belongs to a test account. */
export async function isTestStudent(studentId: number): Promise<boolean> {
  const [row] = await db
    .select({ isTestUser: users.isTestUser })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(eq(students.id, studentId))
    .limit(1);
  return row?.isTestUser === true;
}

/** Whether a session belongs to a test account. One query, not two. */
export async function isTestSession(sessionId: number): Promise<boolean> {
  const [row] = await db
    .select({ isTestUser: users.isTestUser })
    .from(sessions)
    .innerJoin(students, eq(students.id, sessions.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return row?.isTestUser === true;
}

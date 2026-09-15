import { and, asc, count, eq, gte, inArray, isNotNull, lte, sql, SQL } from "drizzle-orm";
import { db } from "../db";
import { LIVE_SLI_STATUSES } from "./sli-store";
import {
  advisorAppointments,
  institutions,
  schoolCycles,
  sessions,
  sliRecords,
  students,
  users,
} from "@shared/wing-schema";

/**
 * Aggregate cohort metrics for the institutional admin dashboard (B4).
 *
 * The spec's framing is what shapes this: these numbers exist for "budget
 * defense and board reporting". A career centre director is going to put them
 * in front of someone who controls their funding, so the priority is that every
 * figure is defensible and its denominator is obvious — not that there are lots
 * of them.
 *
 * ── EVERY RATE CARRIES ITS DENOMINATOR ───────────────────────────────────
 * A completion rate returned as `0.62` is unusable in a board pack: 62% of
 * whom, out of how many? Each rate below ships with the counts it was computed
 * from, so the dashboard can show "38 of 61" and the reader can check the
 * arithmetic. A percentage nobody can audit is worse than no percentage.
 *
 * ── ZERO AND NULL ARE DIFFERENT ANSWERS ──────────────────────────────────
 * A cohort where nobody has completed a session has a completion rate of 0. A
 * cohort with no students has no completion rate at all, and showing 0% for it
 * would read as failure rather than absence. Rates are null when the
 * denominator is zero.
 */

/**
 * The same three states `neverStarted`/`completedAllThree`/the implicit middle already
 * partition `CohortMetrics` into (see `engagementDistribution` below) — B4's spec asks
 * for these to be selectable, not only reportable, so a director can pull just the
 * "never started" list rather than eyeball it out of the full export.
 */
export type CompletionStatus = "never_started" | "in_progress" | "completed_all_three";

export type MetricsFilter = {
  institutionId?: number | null;
  cycleId?: number | null;
  /** ISO date; students registered on or after this. */
  from?: string | null;
  to?: string | null;
  /** Feature List B4's completion-status dimension. */
  completionStatus?: CompletionStatus | null;
};

export type Rate = {
  numerator: number;
  denominator: number;
  /** Null when the denominator is zero — see the note above. */
  rate: number | null;
};

const rate = (numerator: number, denominator: number): Rate => ({
  numerator,
  denominator,
  rate: denominator === 0 ? null : numerator / denominator,
});

const SESSION_ORDER = ["foundation_1", "foundation_2", "foundation_3"] as const;

/**
 * `completionStatus`'s SQL, as a correlated subquery against `sessions` rather than a
 * join — matching `studentRows`' own pattern below for `sessionsCompleted`/
 * `hasSelectedSli`. A join here would multiply each student's row per session and break
 * every other aggregate `studentFilter` feeds, from registration counts to the appointment
 * totals.
 *
 * DISTINCT session_type, not row count, for the same restart reason `perStudent` counts
 * that way above: a restart adds a `sessions` row without changing how many of the three
 * the student has actually finished, and a raw count would let it look otherwise.
 */
function completionStatusClause(status: CompletionStatus): SQL {
  // Written out per branch rather than composed from shared sub-fragments, so each
  // returned `SQL` is one flat, easily-inspected statement rather than depending on
  // drizzle's fragment-splicing behaving as expected under `and()` — the query this
  // feeds into every other cohort figure, so the extra duplication buys a query that's
  // trivial to read back and confirm by eye.
  if (status === "never_started") {
    return sql`(
      select count(distinct s.session_type) from wing.sessions s
      where s.student_id = ${students.id}
        and s.started_at is not null
        and s.session_type::text like 'foundation_%'
    ) = 0`;
  }
  if (status === "completed_all_three") {
    return sql`(
      select count(distinct s.session_type) from wing.sessions s
      where s.student_id = ${students.id}
        and s.status::text = 'completed'
        and s.session_type::text like 'foundation_%'
    ) >= 3`;
  }
  // in_progress: started at least one, hasn't finished all three — the complement of
  // the other two states, not a third independent condition, so it can never disagree
  // with them about which bucket a student is in.
  return sql`(
    select count(distinct s.session_type) from wing.sessions s
    where s.student_id = ${students.id}
      and s.started_at is not null
      and s.session_type::text like 'foundation_%'
  ) > 0 and (
    select count(distinct s.session_type) from wing.sessions s
    where s.student_id = ${students.id}
      and s.status::text = 'completed'
      and s.session_type::text like 'foundation_%'
  ) < 3`;
}

/** The student-scoped WHERE clause shared by every query below. */
function studentFilter(f: MetricsFilter): SQL | undefined {
  const parts: SQL[] = [
    /*
     * ── SEEDED PERSONAS NEVER COUNT HERE ──────────────────────────────────
     * Unconditional, not gated by any MetricsFilter field: a director does not
     * ask to exclude test accounts, the same way they never ask to exclude
     * deleted rows. `activatePersona` (harness-persona-store.ts) can create a
     * persona against ANY school cycle an admin picks when activating it —
     * there is no sandbox-only restriction — so without this, a persona
     * activated against a real institution's cycle would inflate that
     * institution's own board-reporting numbers and CSV export.
     * claude/HARNESS_GAP_ANALYSIS_SEP15.md §1b.
     *
     * A correlated NOT EXISTS against students.userId, not eq(users.isTestUser,
     * false) against an outer-joined users row: every query below has
     * `students` in its FROM/JOIN, but perStudent, bySession, sli, and appts do
     * NOT join `users` — they never needed its columns before this filter
     * existed. The first version of this fix used eq(users.isTestUser, ...)
     * and broke every one of those four with "missing FROM-clause entry for
     * table users" the first time this actually ran against a real database
     * (2026-09-15) — caught only by that real run, not by tsc or the boundary
     * test, which is exactly the class of gap this whole engagement exists to
     * close. A subquery needs nothing from the outer query but
     * students.userId, which every one of these queries already has.
     */
    sql`not exists (
      select 1 from ${users}
      where ${users.id} = ${students.userId} and ${users.isTestUser} = true
    )`,
  ];
  if (f.institutionId) parts.push(eq(students.institutionId, f.institutionId));
  if (f.cycleId) parts.push(eq(students.cycleId, f.cycleId));
  if (f.from) parts.push(gte(students.createdAt, new Date(f.from)));
  // End of the chosen day, not the start — a "to" of the 14th that excludes
  // everything registered on the 14th is the kind of off-by-one nobody notices
  // until a number is questioned in a meeting.
  if (f.to) parts.push(lte(students.createdAt, new Date(`${f.to}T23:59:59.999Z`)));
  if (f.completionStatus) parts.push(completionStatusClause(f.completionStatus));
  return parts.length ? and(...parts) : undefined;
}

export type CohortMetrics = {
  filter: MetricsFilter;
  totalRegistered: number;
  /** Logged in within 30 days. */
  activeLast30Days: number;
  /** Registered but never started a session — the group worth chasing. */
  neverStarted: number;
  completionBySession: { sessionType: string; started: number; completed: number; rate: Rate }[];
  /** Finished all three foundation sessions. */
  completedAllThree: Rate;
  withSelectedSli: Rate;
  /** Median days from first session start to third session completion. */
  medianDaysToComplete: number | null;
  /** How far students get: 0, 1, 2 or 3 sessions done. */
  engagementDistribution: { sessionsCompleted: number; students: number }[];
  /** Snapshot availability, which is what an advisor cares about. */
  appointments: { total: number; withSnapshotSent: number };
  generatedAt: string;
};

export async function cohortMetrics(f: MetricsFilter): Promise<CohortMetrics> {
  const where = studentFilter(f);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  /* ── Registration and activity ─────────────────────────────────────── */

  const [registered] = await db
    .select({ n: count() })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(where);

  const [active] = await db
    .select({ n: count() })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(
      where
        ? and(where, gte(users.lastLoginAt, thirtyDaysAgo))
        : gte(users.lastLoginAt, thirtyDaysAgo),
    );

  /* ── Per-student session counts ────────────────────────────────────── */

  // One row per student with how many foundation sessions they have completed.
  // Everything below is derived from this rather than from separate COUNT
  // queries, so the totals cannot disagree with each other.
  const perStudent = await db
    .select({
      studentId: students.id,
      // DISTINCT session_type, not row count. A student can have more than one
      // `sessions` row for the same type — a restart creates one — so counting
      // rows would let three completions of Session 1 read as "finished all
      // three". The number would have looked entirely reasonable in a board
      // pack and been wrong.
      completed: sql<number>`count(distinct ${sessions.sessionType}) filter (
        where ${sessions.status}::text = 'completed'
          and ${sessions.sessionType}::text like 'foundation_%'
      )::int`,
      started: sql<number>`count(distinct ${sessions.sessionType}) filter (
        where ${sessions.startedAt} is not null
          and ${sessions.sessionType}::text like 'foundation_%'
      )::int`,
      firstStart: sql<Date | null>`min(${sessions.startedAt})`,
      lastCompletion: sql<Date | null>`max(${sessions.completedAt}) filter (
        where ${sessions.status}::text = 'completed'
      )`,
    })
    .from(students)
    .leftJoin(sessions, eq(sessions.studentId, students.id))
    .where(where)
    .groupBy(students.id);

  const totalRegistered = registered?.n ?? 0;
  const neverStarted = perStudent.filter((s) => s.started === 0).length;
  const completedAllThree = perStudent.filter((s) => s.completed >= 3).length;

  const engagementDistribution = [0, 1, 2, 3].map((n) => ({
    sessionsCompleted: n,
    students: perStudent.filter((s) => Math.min(s.completed, 3) === n).length,
  }));

  /* ── Completion by session ─────────────────────────────────────────── */

  const bySession = await db
    .select({
      sessionType: sessions.sessionType,
      // Distinct students, not rows — same restart problem as above. Here it
      // would inflate both sides of the ratio unevenly, since a restart adds a
      // started row but not necessarily a completed one.
      started: sql<number>`count(distinct ${sessions.studentId}) filter (
        where ${sessions.startedAt} is not null
      )::int`,
      completed: sql<number>`count(distinct ${sessions.studentId}) filter (
        where ${sessions.status}::text = 'completed'
      )::int`,
    })
    .from(sessions)
    .innerJoin(students, eq(students.id, sessions.studentId))
    .where(where)
    .groupBy(sessions.sessionType);

  const sessionMap = new Map(bySession.map((r) => [r.sessionType as string, r]));

  const completionBySession = SESSION_ORDER.map((type) => {
    const row = sessionMap.get(type);
    const started = row?.started ?? 0;
    const completed = row?.completed ?? 0;
    return {
      sessionType: type,
      started,
      completed,
      // Denominator is students who STARTED it, not everyone registered.
      // "62% completed session 2" means something different depending on which
      // one you pick, and started-based is the one that measures the session
      // rather than the funnel above it.
      rate: rate(completed, started),
    };
  });

  /* ── Time to complete ──────────────────────────────────────────────── */

  // Median, not mean. One student who registered in March and finished in
  // August drags a mean far enough to be useless, and the distribution here is
  // always long-tailed because dormant students eventually return.
  const durations = perStudent
    .filter((s) => s.completed >= 3 && s.firstStart && s.lastCompletion)
    .map(
      (s) =>
        (new Date(s.lastCompletion!).getTime() - new Date(s.firstStart!).getTime()) /
        (24 * 60 * 60 * 1000),
    )
    .sort((a, b) => a - b);

  const medianDaysToComplete = durations.length
    ? durations.length % 2
      ? durations[(durations.length - 1) / 2]
      : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2
    : null;

  /* ── SLI and advising ──────────────────────────────────────────────── */

  const [sli] = await db
    .select({ n: sql<number>`count(distinct ${sliRecords.studentId})::int` })
    .from(sliRecords)
    .innerJoin(students, eq(students.id, sliRecords.studentId))
    .where(
      where
        ? and(where, inArray(sliRecords.status, LIVE_SLI_STATUSES as any))
        : inArray(sliRecords.status, LIVE_SLI_STATUSES as any),
    );

  const [appts] = await db
    .select({
      total: count(),
      withSnapshotSent: sql<number>`count(*) filter (
        where ${advisorAppointments.snapshotSentAt} is not null
      )::int`,
    })
    .from(advisorAppointments)
    .innerJoin(students, eq(students.id, advisorAppointments.studentId))
    .where(where);

  return {
    filter: f,
    totalRegistered,
    activeLast30Days: active?.n ?? 0,
    neverStarted,
    completionBySession,
    completedAllThree: rate(completedAllThree, totalRegistered),
    withSelectedSli: rate(sli?.n ?? 0, totalRegistered),
    medianDaysToComplete:
      medianDaysToComplete === null ? null : Math.round(medianDaysToComplete * 10) / 10,
    engagementDistribution,
    appointments: { total: appts?.total ?? 0, withSnapshotSent: appts?.withSnapshotSent ?? 0 },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Institutions and cycles, for the filter controls.
 *
 * Scoped, because this endpoint is how a caller learns which institution ids
 * exist. Returning all of them to a partner administrator both names the other
 * partner and hands over the exact id needed to ask for their cohort — the
 * filter control becoming the reconnaissance step for the export endpoint.
 *
 * `onlyInstitutionId` comes from the session via `adminScope`, never from the
 * request.
 */
export async function filterOptions(onlyInstitutionId?: number | null) {
  const rows = await db
    .select({
      institutionId: institutions.id,
      institutionName: institutions.name,
      cycleId: schoolCycles.id,
      cycleLabel: schoolCycles.label,
      cycleYear: schoolCycles.cycleYear,
    })
    .from(institutions)
    .leftJoin(schoolCycles, eq(schoolCycles.institutionId, institutions.id))
    .where(onlyInstitutionId == null ? undefined : eq(institutions.id, onlyInstitutionId))
    .orderBy(asc(institutions.name), asc(schoolCycles.cycleYear));

  const byInstitution = new Map<number, { id: number; name: string; cycles: any[] }>();
  for (const r of rows) {
    if (!byInstitution.has(r.institutionId)) {
      byInstitution.set(r.institutionId, {
        id: r.institutionId,
        name: r.institutionName,
        cycles: [],
      });
    }
    if (r.cycleId) {
      byInstitution.get(r.institutionId)!.cycles.push({
        id: r.cycleId,
        label: r.cycleLabel ?? `${r.cycleYear}`,
        year: r.cycleYear,
      });
    }
  }

  return Array.from(byInstitution.values());
}

/**
 * Per-student rows for the CSV export.
 *
 * Deliberately one row per student rather than pre-aggregated: an
 * administrator exporting this is going to pivot it in Excel against their own
 * cohort lists, and any summary we impose here is one they cannot undo.
 */
export async function studentRows(f: MetricsFilter) {
  const where = studentFilter(f);

  return db
    .select({
      studentId: students.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      institution: institutions.name,
      registeredAt: students.createdAt,
      lastLoginAt: users.lastLoginAt,
      sessionsCompleted: sql<number>`(
        select count(*) from wing.sessions s
        where s.student_id = ${students.id}
          and s.status::text = 'completed'
          and s.session_type::text like 'foundation_%'
      )::int`,
      /*
       * Named `hasSelectedSli` for the CSV column that already ships under that
       * header. It means "has a live SLI" — see LIVE_SLI_STATUSES; filtering on
       * 'selected' alone reported false for every student ever exported.
       */
      hasSelectedSli: sql<boolean>`exists (
        select 1 from wing.sli_records r
        where r.student_id = ${students.id}
          and r.status::text in ('active', 'selected')
      )`,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(institutions, eq(institutions.id, students.institutionId))
    .where(where)
    .orderBy(asc(users.lastName), asc(users.firstName));
}

/** RFC 4180 escaping. Names contain commas; a naive join corrupts the file. */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(","));
  // CRLF and a trailing newline: Excel is the destination and it is fussy.
  return lines.join("\r\n") + "\r\n";
}

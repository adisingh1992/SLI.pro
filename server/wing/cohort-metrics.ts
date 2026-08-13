import { and, asc, count, eq, gte, isNotNull, lte, sql, SQL } from "drizzle-orm";
import { db } from "../db";
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

export type MetricsFilter = {
  institutionId?: number | null;
  cycleId?: number | null;
  /** ISO date; students registered on or after this. */
  from?: string | null;
  to?: string | null;
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

/** The student-scoped WHERE clause shared by every query below. */
function studentFilter(f: MetricsFilter): SQL | undefined {
  const parts: SQL[] = [];
  if (f.institutionId) parts.push(eq(students.institutionId, f.institutionId));
  if (f.cycleId) parts.push(eq(students.cycleId, f.cycleId));
  if (f.from) parts.push(gte(students.createdAt, new Date(f.from)));
  // End of the chosen day, not the start — a "to" of the 14th that excludes
  // everything registered on the 14th is the kind of off-by-one nobody notices
  // until a number is questioned in a meeting.
  if (f.to) parts.push(lte(students.createdAt, new Date(`${f.to}T23:59:59.999Z`)));
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
        ? and(where, eq(sliRecords.status, "selected" as any))
        : eq(sliRecords.status, "selected" as any),
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
      hasSelectedSli: sql<boolean>`exists (
        select 1 from wing.sli_records r
        where r.student_id = ${students.id} and r.status::text = 'selected'
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

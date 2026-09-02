/**
 * Reading and writing the Reveal Cycle's decision log. The persistence half of
 * `reveal-cycle.ts`, same split as `safety-hold-store.ts` is to `suppression.ts`.
 *
 * ── WHY RAW SQL AND NOT THE DRIZZLE SCHEMA ───────────────────────────────
 * `wing.reveal_cycles` arrives in migration 0038 and is deliberately not in
 * `@shared/wing-schema.ts` — same reasoning as `wing.safety_holds` and
 * `wing.prompt_log`: a system decision log, not a domain table an app surface
 * queries directly, and keeping it out of the typed schema is one fewer place a
 * future schema change has to touch in lockstep with a migration.
 */
import { sql } from "drizzle-orm";
import type { GateVerdict } from "./reveal-gates";

type Db = { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };

/** The student ids Gate 1's `foundation1Complete` could ever be true for. */
export async function eligibleStudentIds(db: Db): Promise<number[]> {
  const r = await db.execute(sql`
    SELECT DISTINCT "student_id"
    FROM "wing"."sli_records"
    WHERE "status" IN ('active', 'selected')
  `);
  return (r.rows ?? [])
    .map((row) => Number(row.student_id))
    .filter((id) => Number.isFinite(id));
}

/** `students.user_id` for a student id — the two stores this orchestrator also reads
 * (`sli-store.ts`, `intake-store.ts`) are keyed by user id, not student id. */
export async function userIdFor(db: Db, studentId: number): Promise<number | null> {
  const r = await db.execute(sql`
    SELECT "user_id" FROM "wing"."students" WHERE "id" = ${studentId} LIMIT 1
  `);
  const id = r.rows?.[0]?.user_id;
  return id === undefined || id === null ? null : Number(id);
}

/**
 * When this student's cycle last fired, in epoch milliseconds — or null if it never has.
 *
 * The cycle's own origin point. `reveal-cycle.ts` falls back to Foundation 1's completion
 * timestamp when this is null; see that file for why the two are the same reference point
 * Gate 1 and Gate 3 both read.
 */
export async function lastFiredAt(db: Db, studentId: number): Promise<number | null> {
  const r = await db.execute(sql`
    SELECT "evaluated_at" FROM "wing"."reveal_cycles"
    WHERE "student_id" = ${studentId} AND "action" = 'fire'
    ORDER BY "evaluated_at" DESC
    LIMIT 1
  `);
  const at = r.rows?.[0]?.evaluated_at;
  return at === undefined || at === null ? null : new Date(at as string).getTime();
}

export type RecordOutcomeParams = {
  studentId: number;
  dayInCycle: number;
  gate1: GateVerdict;
  gate2: GateVerdict;
  why: string;
} & (
  | { action: "fire"; kind: "cadence" | "escalation"; templateCode: string | null; templateBand: number | null }
  | { action: "defer"; nextCheckDay: number }
  | { action: "route"; routedTo: "H-RC10" }
);

/** Records one meaningful outcome. `wait` is never recorded — see the migration's header. */
export async function recordOutcome(db: Db, params: RecordOutcomeParams): Promise<void> {
  const kind = params.action === "fire" ? params.kind : null;
  const templateCode = params.action === "fire" ? params.templateCode : null;
  const templateBand = params.action === "fire" ? params.templateBand : null;
  const nextCheckDay = params.action === "defer" ? params.nextCheckDay : null;
  const routedTo = params.action === "route" ? params.routedTo : null;

  await db.execute(sql`
    INSERT INTO "wing"."reveal_cycles"
      ("student_id", "day_in_cycle", "action", "kind", "why", "gate1", "gate2",
       "template_code", "template_band", "next_check_day", "routed_to")
    VALUES (
      ${params.studentId}, ${params.dayInCycle}, ${params.action}, ${kind}, ${params.why},
      ${JSON.stringify(params.gate1)}::jsonb, ${JSON.stringify(params.gate2)}::jsonb,
      ${templateCode}, ${templateBand}, ${nextCheckDay}, ${routedTo}
    )
  `);
}

/** Recent history for one student — the admin/review surface, newest first. */
export async function historyFor(
  db: Db,
  studentId: number,
  limit = 20,
): Promise<Record<string, unknown>[]> {
  const r = await db.execute(sql`
    SELECT * FROM "wing"."reveal_cycles"
    WHERE "student_id" = ${studentId}
    ORDER BY "evaluated_at" DESC
    LIMIT ${limit}
  `);
  return r.rows ?? [];
}

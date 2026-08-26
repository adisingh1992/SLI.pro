/**
 * Reading and writing safety holds. The persistence half of `suppression.ts`.
 *
 * ── WHY THIS IS SEPARATE FROM suppression.ts ─────────────────────────────
 * `suppression.ts` decides. This fetches. The decision is pure and covered by its own
 * suite; a database in front of it would mean the only environment that ever exercises
 * "may Wing send this" is production. Same split as `seed-shared.ts`.
 *
 * ── WHY RAW SQL AND NOT THE DRIZZLE SCHEMA ───────────────────────────────
 * `wing.safety_holds` arrives in migration 0025 and is not in `@shared/wing-schema`.
 * Adding it there is the tidier end state; doing it in the same change that puts a gate on
 * every outbound message is two risks where one will do. `check-intake.ts` already reads
 * outside the schema this way.
 */
import { sql } from "drizzle-orm";
import type { HoldState, OutboundKind } from "./suppression";
import { isSuppressed, softCheckInDue } from "./suppression";

type Db = { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };

const ms = (v: unknown): number | null =>
  v === null || v === undefined ? null : new Date(v as string).getTime();

/**
 * Everything the suppression rules need for one student.
 *
 * `lastUserInitiatedAt` is the whole lift mechanism, so it comes from the transcript
 * rather than from a flag someone has to remember to set. A hold ends because the person
 * came back and said something, and the record of that is a user turn.
 */
export async function loadHoldState(db: Db, studentId: number): Promise<HoldState> {
  const held = await db.execute(sql`
    SELECT "rule", "fired_at", "returned_at", "soft_check_in_sent_at", "note"
    FROM "wing"."safety_holds"
    WHERE "student_id" = ${studentId}
    ORDER BY "fired_at" DESC
  `);

  /*
   * The three human turn types, not a `role` column — the transcript models WHY a turn
   * happened, not who spoke. `human_elicited_response`, `human_spontaneous` and
   * `human_correction` are all the person choosing to write, which is what "came back on
   * their own" means. `ai_prompt` and `ai_adapted` are Wing talking, and Wing talking can
   * never be the thing that lifts a hold on Wing talking.
   */
  const turns = await db.execute(sql`
    SELECT MAX(t."created_at") AS "at"
    FROM "wing"."transcript_turns" t
    JOIN "wing"."transcripts" tr ON tr."id" = t."transcript_id"
    JOIN "wing"."sessions" s ON s."id" = tr."session_id"
    WHERE s."student_id" = ${studentId}
      AND t."turn_type" IN ('human_elicited_response', 'human_spontaneous', 'human_correction')
  `);

  const rows = held.rows ?? [];
  return {
    holds: rows.map((r) => ({
      rule: "IG-S01" as const,
      firedAt: ms(r.fired_at) ?? 0,
      note: (r.note as string | null) ?? undefined,
    })),
    lastUserInitiatedAt: ms(turns.rows?.[0]?.at),
    /*
     * The newest hold's check-in, because that is the hold any decision is about. A
     * previous hold's sent check-in must not make the current one look already spent.
     */
    softCheckInSentAt: ms(rows[0]?.soft_check_in_sent_at),
  };
}

/**
 * Whether a model's reported `safetyHold` field means a hold should open.
 *
 * A one-line predicate, and named rather than inlined because of what it is guarding. The
 * value arrives from a JSON parse of model output, so `"false"`, `"true"`, `0`, `1`,
 * `null` and `undefined` are all shapes it can really take — and `if (parsed.safetyHold)`
 * opens a hold on the string `"false"` while reading perfectly well to a reviewer.
 *
 * Wrong in the permissive direction is a student held who should not be, which her rule
 * explicitly tolerates. Wrong in the other direction opens holds on noise and would train
 * people to ignore the mechanism. Strict equality, and a test that says so.
 */
export function reportsCrisis(raw: unknown): boolean {
  return raw === true;
}

/**
 * Records that IG-S01 fired. Idempotent within an open hold.
 *
 * A second crisis turn during an active hold is not a second hold: the rule already says
 * to keep saying the same caring thing rather than coaching, and a new row would restart
 * the seven-day minimum every time someone wrote again — which would make the minimum a
 * function of how much they talk, and could hold someone indefinitely.
 */
export async function openHold(db: Db, studentId: number, note?: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO "wing"."safety_holds" ("student_id", "rule", "note")
    SELECT ${studentId}, 'IG-S01', ${note ?? null}
    WHERE NOT EXISTS (
      SELECT 1 FROM "wing"."safety_holds"
      WHERE "student_id" = ${studentId} AND "returned_at" IS NULL
    )
  `);
}

/**
 * Marks that the user came back, which is the only thing that lifts a hold.
 *
 * Not a lift on its own: `activeHold` still refuses to release inside the seven-day
 * minimum, so calling this on day two records the return and changes nothing. That
 * ordering is deliberate — the minimum is a floor, not a countdown.
 */
export async function recordReturn(db: Db, studentId: number, at: Date): Promise<void> {
  await db.execute(sql`
    UPDATE "wing"."safety_holds"
    SET "returned_at" = ${at.toISOString()}
    WHERE "student_id" = ${studentId} AND "returned_at" IS NULL
  `);
}

export async function recordSoftCheckIn(db: Db, studentId: number): Promise<void> {
  await db.execute(sql`
    UPDATE "wing"."safety_holds"
    SET "soft_check_in_sent_at" = now()
    WHERE "student_id" = ${studentId}
      AND "returned_at" IS NULL
      AND "soft_check_in_sent_at" IS NULL
  `);
}

/**
 * The one call an outbound path makes.
 *
 * Fails CLOSED on a database error, and that is the opposite of this codebase's usual
 * default. Everywhere else, not knowing must never drop a rule about what Wing may not
 * say — because the cost of a false positive is a wasted rule in a prompt. Here the cost
 * of a false negative is an automated message to someone who wrote something frightening,
 * which H-RC13 calls the worst thing this system can do. So an unreachable holds table
 * stops outbound contact rather than permitting it.
 */
export async function maySend(
  db: Db,
  studentId: number,
  kind: OutboundKind,
  now = Date.now(),
): Promise<{ allowed: boolean; why: string }> {
  let state: HoldState;
  try {
    state = await loadHoldState(db, studentId);
  } catch (err) {
    return {
      allowed: false,
      why: `could not read safety holds (${(err as Error).message}) — holding, because a
            message sent to someone under a crisis hold is not recoverable`.replace(/\s+/g, " "),
    };
  }

  const verdict = isSuppressed(kind, state, now);
  if (!verdict.suppressed) return { allowed: true, why: verdict.why };
  return { allowed: false, why: verdict.why };
}

/** Students whose single day-30 check-in is due. For the scheduler, when it exists. */
export async function softCheckInIsDue(
  db: Db,
  studentId: number,
  now = Date.now(),
): Promise<boolean> {
  return softCheckInDue(await loadHoldState(db, studentId), now);
}

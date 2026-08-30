import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { sliRecords } from "@shared/wing-schema";
import * as store from "./session-store";
import { studentIdForWingUser } from "./bootstrap";

/**
 * SLI records, backed by the Wing schema.
 *
 * The MVP packed three candidates into a single row (title1/statement1,
 * title2/…, title3/…) plus custom and refinement columns. The spec replaces
 * that with one row per SLI — candidate, custom, refinement or refresh — each
 * carrying lineage back to its parent (§12).
 *
 * This matters beyond tidiness: a previous SLI is never deleted, it is
 * superseded and becomes part of the longitudinal record. That is exactly what
 * the career-evolution re-entry pathway needs ("I remember your original SLI —
 * let's see how things have evolved"), and it is impossible in the old shape.
 *
 * Lifecycle:
 *   candidate  → generated options, none chosen yet
 *   selected   → the student picked this one
 *   active     → in force (selected + confirmed; the one Wing works from)
 *   superseded → replaced by a refinement or refresh, retained forever
 */

export type SliSourceValue = "generated" | "custom" | "refined" | "refresh";
export type SliStatusValue = "candidate" | "selected" | "active" | "superseded";

/**
 * The statuses that mean "this is the student's SLI right now".
 *
 * Both, not one, and the reason is a trap five readers fell into. Every insert of
 * `"selected"` in this file is followed on the next line by `markActive`, which
 * sets `"active"` — see `select`, `refine` and `refresh` below, and both call
 * sites in `sli-routes.ts`. So NO ROW IS EVER LEFT AT `"selected"`, and a reader
 * that filters on it alone finds nothing, for every student, silently.
 *
 * That is what it did: the advisor snapshot had no SLI headline, the cohort
 * dashboard reported zero students with a completed SLI, and Wing's life-log
 * reply could not see the SLI it was written to connect entries to. Each read
 * looked correct in isolation.
 *
 * `"selected"` stays in the list rather than being dropped because it is a real
 * state the schema permits and a future path may leave a row in it — the failure
 * to avoid is a reader that knows about only one of the two, in either
 * direction. `getActive` below has always ranked them correctly; this constant
 * is that ranking, exported so nobody has to rediscover it.
 */
export const LIVE_SLI_STATUSES = ["active", "selected"] as const;

export type SliView = {
  id: number;
  studentId: number;
  title: string;
  statement: string;
  rationale: string | null;
  implementationGuidance: string | null;
  source: SliSourceValue;
  status: SliStatusValue;
  parentSliId: number | null;
  refinementCount: number;
  generatedInSessionId: number | null;
  createdAt: Date;
  activatedAt: Date | null;
  supersededAt: Date | null;
};

/** Refinements are capped, matching the MVP's limit of three. */
export const MAX_REFINEMENTS = 3;

/**
 * `userId` is a WING user id after the identity cutover — the student is
 * resolved directly rather than through the legacy user record.
 */
async function studentFor(userId: number): Promise<number> {
  return studentIdForWingUser(userId);
}

export const studentIdForUser = studentFor;

/* ── Reads ─────────────────────────────────────────────────────────────── */

export async function listByUser(userId: number): Promise<SliView[]> {
  const studentId = await studentFor(userId);
  return db
    .select()
    .from(sliRecords)
    .where(eq(sliRecords.studentId, studentId))
    .orderBy(asc(sliRecords.createdAt)) as Promise<SliView[]>;
}

export async function getById(id: number): Promise<SliView | undefined> {
  const [row] = await db
    .select()
    .from(sliRecords)
    .where(eq(sliRecords.id, id))
    .limit(1);
  return row as SliView | undefined;
}

/**
 * The SLI currently in force. Prefers `active`, falls back to `selected` —
 * everything downstream (LinkedIn optimisation, content drafts, evidence
 * portfolio) should read this rather than reconstructing from candidates.
 */
export async function getActive(userId: number): Promise<SliView | null> {
  const studentId = await studentFor(userId);
  const rows = (await db
    .select()
    .from(sliRecords)
    .where(eq(sliRecords.studentId, studentId))
    .orderBy(desc(sliRecords.createdAt))) as SliView[];

  return (
    rows.find((r) => r.status === "active") ??
    rows.find((r) => r.status === "selected") ??
    null
  );
}

/** Plain text of the SLI in force — what most prompts actually need. */
export async function getActiveStatement(userId: number): Promise<string | null> {
  const active = await getActive(userId);
  return active?.statement ?? null;
}

/* ── Writes ────────────────────────────────────────────────────────────── */

/**
 * Stores a generated set of candidates as individual rows.
 * Accepts the legacy generator output (title1/statement1/rationale1, …) so
 * `generateSLIs` does not have to change.
 */
export async function createCandidates(
  userId: number,
  generated: Record<string, any>,
  opts: { generatedInSessionId?: number | null } = {},
): Promise<SliView[]> {
  const studentId = await studentFor(userId);

  const candidates = [1, 2, 3]
    .map((n) => ({
      title: generated[`title${n}`],
      statement: generated[`statement${n}`],
      rationale: generated[`rationale${n}`] ?? null,
    }))
    .filter((c) => c.title && c.statement);

  if (!candidates.length) {
    throw new Error("No SLI candidates were generated");
  }

  const rows = await db
    .insert(sliRecords)
    .values(
      candidates.map((c) => ({
        studentId,
        title: c.title,
        statement: c.statement,
        rationale: c.rationale,
        source: "generated" as const,
        status: "candidate" as const,
        generatedInSessionId: opts.generatedInSessionId ?? null,
        sourceType: "ai_generated" as const,
      })),
    )
    .returning();

  return rows as SliView[];
}

/** A student-authored SLI — human-originated, so tagged as such. */
export async function createCustom(
  userId: number,
  data: { title?: string; statement: string; rationale?: string | null },
): Promise<SliView> {
  const studentId = await studentFor(userId);

  const [row] = await db
    .insert(sliRecords)
    .values({
      studentId,
      title: data.title || "Custom SLI",
      statement: data.statement,
      rationale: data.rationale ?? null,
      source: "custom",
      status: "selected",
      sourceType: "human_originated", // written by the student, not by Wing
    })
    .returning();

  await markActive(row.id);
  return (await getById(row.id))!;
}

/**
 * Marks one SLI active and supersedes any other active/selected row for the
 * same student. Superseded rows are retained — never deleted.
 */
export async function markActive(sliId: number): Promise<SliView> {
  const target = await getById(sliId);
  if (!target) throw new Error(`SLI ${sliId} not found`);

  await db
    .update(sliRecords)
    .set({ status: "superseded", supersededAt: new Date() })
    .where(
      and(
        eq(sliRecords.studentId, target.studentId),
        ne(sliRecords.id, sliId),
        ne(sliRecords.status, "candidate"),
      ),
    );

  const [row] = await db
    .update(sliRecords)
    .set({ status: "active", activatedAt: new Date() })
    .where(eq(sliRecords.id, sliId))
    .returning();

  return row as SliView;
}

/**
 * Creates a refinement as a NEW row descending from the parent, rather than
 * overwriting it. The parent is superseded but stays queryable.
 */
export async function refine(
  parentId: number,
  data: {
    statement: string;
    rationale?: string | null;
    implementationGuidance?: string | null;
    title?: string;
  },
): Promise<SliView> {
  const parent = await getById(parentId);
  if (!parent) throw new Error(`SLI ${parentId} not found`);

  if (parent.refinementCount >= MAX_REFINEMENTS) {
    throw new Error(
      `This SLI has reached the maximum of ${MAX_REFINEMENTS} refinements`,
    );
  }

  const [row] = await db
    .insert(sliRecords)
    .values({
      studentId: parent.studentId,
      title: data.title || parent.title,
      statement: data.statement,
      rationale: data.rationale ?? null,
      implementationGuidance: data.implementationGuidance ?? null,
      source: "refined",
      status: "selected",
      parentSliId: parent.id,
      refinementCount: parent.refinementCount + 1,
      sourceType: "ai_generated",
    })
    .returning();

  await markActive(row.id);
  return (await getById(row.id))!;
}

/**
 * Career-evolution re-entry — a Positioning Refresh (Feature List A2).
 *
 * "The platform must support re-engagement at any point — not just after
 * years, and not just for career pivots… Wing should acknowledge the prior
 * work, offer a Positioning Refresh that builds on the existing profile rather
 * than starting from zero… The previous SLI is never deleted — it becomes part
 * of the longitudinal record."
 *
 * ── REFRESH IS NOT REFINEMENT ────────────────────────────────────────────
 * They look similar and mean opposite things.
 *
 *   refine   the positioning was not quite right. The student is correcting
 *            a statement that failed to capture what was already true.
 *            Capped at MAX_REFINEMENTS, because a fourth attempt at saying
 *            the same thing is a sign the underlying work needs redoing.
 *
 *   refresh  the positioning WAS right, and the world moved. A promotion, a
 *            shift into founding something, an industry change. Nothing was
 *            wrong; the context changed.
 *
 * So a refresh does NOT consume a refinement, and does not inherit the parent's
 * count — a student returning after a promotion arrives with a full three
 * refinements available on the new statement. Capping refreshes at all would
 * mean telling someone on their fourth career move that they have run out of
 * career, which is the opposite of "a career partner for life".
 *
 * The lineage stays intact: parent_sli_id points back, the parent becomes
 * superseded rather than deleted, and the chain is the longitudinal record the
 * spec asks for.
 */
export async function refresh(
  parentId: number,
  data: {
    statement: string;
    rationale?: string | null;
    implementationGuidance?: string | null;
    title?: string;
    /** The career_event_review session this came out of. */
    sessionId?: number | null;
  },
): Promise<SliView> {
  const parent = await getById(parentId);
  if (!parent) throw new Error(`SLI ${parentId} not found`);

  const [row] = await db
    .insert(sliRecords)
    .values({
      studentId: parent.studentId,
      title: data.title || parent.title,
      statement: data.statement,
      rationale: data.rationale ?? null,
      implementationGuidance: data.implementationGuidance ?? null,
      source: "refresh",
      status: "selected",
      parentSliId: parent.id,
      // Deliberately 0, not parent.refinementCount. See the note above.
      refinementCount: 0,
      generatedInSessionId: data.sessionId ?? null,
      sourceType: "ai_generated",
    })
    .returning();

  await markActive(row.id);
  return (await getById(row.id))!;
}

/**
 * The full lineage for a student, oldest first.
 *
 * The longitudinal record the spec protects. Wing reads this to say "I remember
 * your original SLI" and mean it — and an advisor or the student can see how
 * the positioning actually moved, which is the thing that makes a multi-year
 * relationship visible rather than asserted.
 */
export async function lineage(userId: number): Promise<SliView[]> {
  const all = await listByUser(userId);
  return [...all].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

/**
 * Removes candidate rows only. A selected/active/superseded SLI is part of the
 * longitudinal record and is never deleted (spec §12) — callers wanting to
 * move on should create a refinement or refresh instead.
 */
export async function deleteCandidate(sliId: number): Promise<void> {
  const row = await getById(sliId);
  if (!row) return;
  if (row.status !== "candidate") {
    throw new Error(
      "Only candidate SLIs can be deleted; selected and superseded records are " +
        "retained as part of the longitudinal record",
    );
  }
  await db.delete(sliRecords).where(eq(sliRecords.id, sliId));
}

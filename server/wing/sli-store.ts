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

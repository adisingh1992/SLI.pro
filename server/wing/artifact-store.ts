import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  contentDrafts,
  evidencePortfolioItems,
  freshnessReports,
  linkedinOptimizations,
} from "@shared/wing-schema";
import * as store from "./session-store";
import { studentIdForWingUser } from "./bootstrap";

/**
 * Positioning artifacts, backed by the Wing schema:
 * LinkedIn optimizations, content drafts, freshness reports and the
 * Behavioral Evidence Portfolio.
 *
 * Two shape changes from the MVP (spec §12):
 *
 * 1. LinkedIn optimization becomes ONE holistic review rather than fragmented
 *    per-section chunks (headline / about / enhancements / strategy columns).
 *    The legacy sections are preserved inside `holistic_review` so nothing is
 *    lost, but new generations produce the integrated view the feature list
 *    asks for (A4).
 *
 * 2. Content drafts are one row per post with an `iteration` counter, instead
 *    of two posts jammed into a single row. That is what lets the Tier 2
 *    Feature Article module deepen a draft across turns.
 */

/**
 * `userId` is a WING user id after the identity cutover — the student is
 * resolved directly rather than through the legacy user record.
 */
async function studentFor(userId: number): Promise<number> {
  return studentIdForWingUser(userId);
}

export const studentIdForUser = studentFor;

/* ── LinkedIn optimizations ────────────────────────────────────────────── */

export async function getLinkedinOptimizations(userId: number) {
  const studentId = await studentFor(userId);
  const rows = await db
    .select()
    .from(linkedinOptimizations)
    .where(eq(linkedinOptimizations.studentId, studentId))
    .orderBy(desc(linkedinOptimizations.createdAt));

  // Spread the holistic review so legacy consumers still find their sections.
  return rows.map((r) => ({
    id: r.id,
    userId,
    studentId: r.studentId,
    sliId: r.sliId,
    createdAt: r.createdAt,
    ...((r.holisticReview ?? {}) as Record<string, unknown>),
    holisticReview: r.holisticReview,
  }));
}

export async function getLinkedinOptimization(id: number) {
  const [row] = await db
    .select()
    .from(linkedinOptimizations)
    .where(eq(linkedinOptimizations.id, id))
    .limit(1);
  if (!row) return undefined;
  return {
    id: row.id,
    studentId: row.studentId,
    sliId: row.sliId,
    createdAt: row.createdAt,
    ...((row.holisticReview ?? {}) as Record<string, unknown>),
    holisticReview: row.holisticReview,
  };
}

export async function createLinkedinOptimization(data: {
  userId: number;
  sliId?: number | null;
  [section: string]: unknown;
}) {
  const { userId, sliId, ...sections } = data;
  const studentId = await studentFor(userId);

  const [row] = await db
    .insert(linkedinOptimizations)
    .values({
      studentId,
      sliId: sliId ?? null,
      holisticReview: sections as any,
      sourceType: "ai_generated",
    })
    .returning();

  return { id: row.id, userId, studentId, ...sections, holisticReview: row.holisticReview };
}

/* ── Content drafts ────────────────────────────────────────────────────── */

export async function getContentDrafts(userId: number) {
  const studentId = await studentFor(userId);
  const rows = await db
    .select()
    .from(contentDrafts)
    .where(eq(contentDrafts.studentId, studentId))
    .orderBy(desc(contentDrafts.createdAt));
  return rows.map((r) => ({ ...r, userId }));
}

export async function getContentDraft(id: number) {
  const [row] = await db
    .select()
    .from(contentDrafts)
    .where(eq(contentDrafts.id, id))
    .limit(1);
  return row ?? undefined;
}

export async function createContentDraft(data: {
  userId: number;
  draftType?: "post" | "article";
  content: unknown;
  sliId?: number | null;
  iteration?: number;
}) {
  const studentId = await studentFor(data.userId);
  const [row] = await db
    .insert(contentDrafts)
    .values({
      studentId,
      draftType: data.draftType ?? "post",
      content: data.content as any,
      iteration: data.iteration ?? 1,
      sliId: data.sliId ?? null,
      sourceType: "ai_generated",
    })
    .returning();
  return { ...row, userId: data.userId };
}

/** Records publication — the trigger for the 90-day launch sequence (S5). */
export async function markContentPublished(id: number, publishedUrl: string) {
  const [row] = await db
    .update(contentDrafts)
    .set({
      status: "published",
      publishedUrl,
      publishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(contentDrafts.id, id))
    .returning();
  return row;
}

/* ── Freshness reports ─────────────────────────────────────────────────── */

export async function getFreshnessReports(userId: number) {
  const studentId = await studentFor(userId);
  const rows = await db
    .select()
    .from(freshnessReports)
    .where(eq(freshnessReports.studentId, studentId))
    .orderBy(desc(freshnessReports.createdAt));
  return rows.map((r) => ({ ...r, userId }));
}

export async function getFreshnessReport(id: number) {
  const [row] = await db
    .select()
    .from(freshnessReports)
    .where(eq(freshnessReports.id, id))
    .limit(1);
  return row ?? undefined;
}

export async function createFreshnessReport(data: {
  userId: number;
  questionnaireAnalysis?: unknown;
  resumeAnalysis?: unknown;
  linkedinAnalysis?: unknown;
  additionalDocumentsAnalysis?: unknown;
  finalSynthesis?: unknown;
}) {
  const studentId = await studentFor(data.userId);
  const [row] = await db
    .insert(freshnessReports)
    .values({
      studentId,
      questionnaireAnalysis: (data.questionnaireAnalysis ?? null) as any,
      resumeAnalysis: (data.resumeAnalysis ?? null) as any,
      linkedinAnalysis: (data.linkedinAnalysis ?? null) as any,
      additionalDocumentsAnalysis: (data.additionalDocumentsAnalysis ?? null) as any,
      finalSynthesis: (data.finalSynthesis ?? null) as any,
      sourceType: "ai_generated",
    })
    .returning();
  return { ...row, userId: data.userId };
}

/* ── Behavioral Evidence Portfolio (feature list A4) ───────────────────── */

/**
 * Each item ties a positioning claim to evidence from the student's own
 * stories and a NACE competency. `sourceTurnId` extends provenance into the
 * product's outputs — the claim can cite the exact human turn it came from.
 */
export async function addEvidenceItem(data: {
  userId: number;
  sliId?: number | null;
  positioningClaim: string;
  evidence: string;
  competencyCategory: string;
  sourceSessionId?: number | null;
  sourceTurnId?: number | null;
}) {
  const studentId = await studentFor(data.userId);
  const [row] = await db
    .insert(evidencePortfolioItems)
    .values({
      studentId,
      sliId: data.sliId ?? null,
      positioningClaim: data.positioningClaim,
      evidence: data.evidence,
      competencyCategory: data.competencyCategory,
      sourceSessionId: data.sourceSessionId ?? null,
      sourceTurnId: data.sourceTurnId ?? null,
      sourceType: "ai_generated",
    })
    .returning();
  return row;
}

export async function getEvidencePortfolio(userId: number) {
  const studentId = await studentFor(userId);
  return db
    .select()
    .from(evidencePortfolioItems)
    .where(eq(evidencePortfolioItems.studentId, studentId))
    .orderBy(desc(evidencePortfolioItems.createdAt));
}

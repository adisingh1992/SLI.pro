import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  contentDrafts,
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

/**
 * holisticReview is spread back out into top-level sections at runtime, but
 * that spread is `unknown` to the compiler, so the section keys vanish from
 * the inferred type. The index signature restates what is actually returned —
 * without it, every legacy consumer reading `.headlineOptimization` fails to
 * typecheck against a value that is genuinely there.
 */
export type LinkedinOptimizationView = {
  id: number;
  userId: number;
  studentId: number;
  sliId: number | null;
  createdAt: Date;
  holisticReview: unknown;
} & Record<string, any>;

export async function getLinkedinOptimizations(
  userId: number,
): Promise<LinkedinOptimizationView[]> {
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

/**
 * The analysis columns are jsonb, so Drizzle infers them as `unknown`. Legacy
 * consumers were written against the old row type and index into them
 * directly, so the shape is restated here rather than pushed onto every
 * caller as a cast.
 */
export type FreshnessReportView = {
  id: number;
  userId: number;
  studentId: number;
  createdAt: Date;
  questionnaireAnalysis: Record<string, any> | null;
  resumeAnalysis: Record<string, any> | null;
  linkedinAnalysis: Record<string, any> | null;
  additionalDocumentsAnalysis: Record<string, any>[] | null;
  finalSynthesis: Record<string, any> | null;
  sourceType: "human_originated" | "ai_generated";
};

export async function getFreshnessReports(userId: number): Promise<FreshnessReportView[]> {
  const studentId = await studentFor(userId);
  const rows = await db
    .select()
    .from(freshnessReports)
    .where(eq(freshnessReports.studentId, studentId))
    .orderBy(desc(freshnessReports.createdAt));
  return rows.map((r) => ({ ...r, userId })) as FreshnessReportView[];
}

export async function getFreshnessReport(id: number) {
  const [row] = await db
    .select()
    .from(freshnessReports)
    .where(eq(freshnessReports.id, id))
    .limit(1);
  return row ?? undefined;
}

/**
 * Most recent report for a user, or undefined.
 *
 * Exists because the `/latest` route was still calling the legacy
 * `storage.getLatestFreshnessReport`, which reads `public.freshness_reports`.
 * Reports are written to `wing` now, so that route 404'd on a report the list
 * endpoint — already on Wing — was returning in the same page load.
 */
export async function getLatestFreshnessReport(userId: number) {
  const [latest] = await getFreshnessReports(userId);
  return latest ?? undefined;
}

/** Deletes a report. Callers authorise first via getFreshnessReport. */
export async function deleteFreshnessReport(id: number) {
  await db.delete(freshnessReports).where(eq(freshnessReports.id, id));
}

/**
 * Most recent LinkedIn optimisation for a user, or undefined.
 *
 * Safe drop-in for the legacy `storage.getLatestLinkedinOptimization`:
 * getLinkedinOptimizations already spreads `holisticReview` back out into
 * top-level sections precisely so legacy consumers keep working.
 */
export async function getLatestLinkedinOptimization(userId: number) {
  const [latest] = await getLinkedinOptimizations(userId);
  return latest ?? undefined;
}

/** Most recent content draft for a user, or undefined. */
export async function getLatestContentDraft(userId: number) {
  const [latest] = await getContentDrafts(userId);
  return latest ?? undefined;
}

/**
 * Records a share of a draft to LinkedIn.
 *
 * No post number: in Wing a content_drafts row IS one post, so the draft id
 * identifies it. The MVP needed (draft_id, post_number) only because a legacy
 * row carried two posts.
 *
 * Incremented in SQL rather than read-modify-write so two shares in flight
 * cannot lose one another's count.
 */
export async function recordContentDraftShare(draftId: number) {
  const [row] = await db
    .update(contentDrafts)
    .set({
      shareCount: sql`${contentDrafts.shareCount} + 1`,
      status: "published",
      publishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(contentDrafts.id, draftId))
    .returning({
      shareCount: contentDrafts.shareCount,
      publishedAt: contentDrafts.publishedAt,
    });
  return row;
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

/*
 * The Behavioural Evidence Portfolio (A4) is NOT here.
 *
 * Two functions used to be — `addEvidenceItem` and `getEvidencePortfolio` — a
 * second, unchecked writer into `evidence_portfolio_items` that never acquired a
 * caller. `wing/evidence-portfolio.ts` is the one that did, and it is the one that
 * runs every claim through `authenticity.ts` before it is stored.
 *
 * They are removed rather than left dormant. An insert path that skips the
 * authenticity check is exactly the thing somebody reaches for when the checked one
 * looks like more work, and a claim that entered through it would read in the UI as
 * though it had passed.
 */

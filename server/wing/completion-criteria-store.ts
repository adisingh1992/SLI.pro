import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { sessionCompletionCriteria } from "@shared/wing-schema";
import * as cache from "./published-cache";
import { log } from "../logger";

/**
 * Session completion criteria — one definition, rendered into both prompts.
 *
 * The conversation prompt tells Wing when it may close a session; the analysis
 * prompt decides whether it actually did. Those two lists used to be written
 * separately, and they drifted: a session could satisfy everything it was told
 * to achieve and still be judged incomplete, which is what a student
 * experiences as being stuck.
 *
 * Both now render from the same row. Drift is not "discouraged" — it is
 * structurally impossible.
 *
 * FALLBACK
 * If nothing is published for a population/session, the prompt files' own
 * hardcoded text is used. So this can be adopted one session at a time, and an
 * empty table changes nothing.
 */

export type Criterion = {
  id: string;
  text: string;
  /**
   * Is the conversation actually instructed to achieve this?
   *
   * A criterion the session never pursues can only be satisfied by luck —
   * that is precisely how mid-career Session 2 became impossible to complete.
   * Recorded so the editor can warn rather than leaving it to be rediscovered.
   */
  reachable: boolean;
  /** Why it is unreachable, or any other note for the methodology owner. */
  note?: string;
  /**
   * Weak hint: does similar wording appear in the conversation prompt?
   *
   * Deliberately separate from `reachable`. Text overlap is unreliable — it
   * flagged all eight of mid-career Session 3's criteria, where the audit
   * showed those eight are just the five quality elements the conversation
   * already requires, listed individually. Shown as "worth checking", never
   * as a verdict.
   */
  mirroredInConversation?: boolean;
};

export type CriteriaVersion = {
  id: number;
  populationTag: string;
  sessionType: string;
  versionNumber: number;
  status: "draft" | "published" | "retired";
  criteria: Criterion[];
  changeNote: string | null;
  createdAt: Date;
  publishedAt: Date | null;
};

/* ── Reading ────────────────────────────────────────────────────────────── */

/** The live criteria for a population/session, or null to use the prompt file's. */
export async function getPublished(
  populationTag: string,
  sessionType: string,
): Promise<CriteriaVersion | null> {
  // Cached: this sits on the turn path and the row is immutable once
  // published. See published-cache.ts for why that distinction matters.
  return cache.cached(`criteria:${populationTag}:${sessionType}`, () =>
    getPublishedUncached(populationTag, sessionType),
  );
}

async function getPublishedUncached(
  populationTag: string,
  sessionType: string,
): Promise<CriteriaVersion | null> {
  try {
    const [row] = await db
      .select()
      .from(sessionCompletionCriteria)
      .where(
        and(
          eq(sessionCompletionCriteria.populationTag, populationTag),
          eq(sessionCompletionCriteria.sessionType, sessionType as any),
          eq(sessionCompletionCriteria.status, "published"),
        ),
      )
      .limit(1);

    return (row as CriteriaVersion) ?? null;
  } catch (err) {
    // A lookup failure must not break a session. Falling back to the prompt
    // file's own text is the safe outcome — it is what ran before this table
    // existed.
    log(`completion criteria lookup failed: ${(err as Error).message}`, "criteria");
    return null;
  }
}

export async function listVersions(populationTag: string, sessionType: string) {
  return db
    .select()
    .from(sessionCompletionCriteria)
    .where(
      and(
        eq(sessionCompletionCriteria.populationTag, populationTag),
        eq(sessionCompletionCriteria.sessionType, sessionType as any),
      ),
    )
    .orderBy(desc(sessionCompletionCriteria.versionNumber));
}

export async function listAll() {
  return db
    .select()
    .from(sessionCompletionCriteria)
    .where(eq(sessionCompletionCriteria.status, "published"))
    .orderBy(
      asc(sessionCompletionCriteria.populationTag),
      asc(sessionCompletionCriteria.sessionType),
    );
}

/* ── Rendering ──────────────────────────────────────────────────────────── */

/**
 * The conversation form — numbered, imperative, addressed to Wing.
 *
 * Unreachable criteria are still rendered here. That is the point of a single
 * source: if the analysis is going to require something, the conversation must
 * be told to pursue it, or the session cannot finish.
 */
export function renderForConversation(criteria: Criterion[]): string {
  return criteria.map((c, i) => `${i + 1}. ${c.text}`).join("\n");
}

/** The analysis form — a checklist applied to a finished transcript. */
export function renderForAnalysis(criteria: Criterion[]): string {
  return criteria.map((c) => `- ${c.text}`).join("\n");
}

/* ── Writing ────────────────────────────────────────────────────────────── */

/**
 * Publishes a new version, retiring the current one.
 *
 * Retire-never-edit, as with heuristic components and classifier prompts: a
 * session completed six months ago must stay explicable by the criteria that
 * were live when it ran.
 */
export async function publish(params: {
  populationTag: string;
  sessionType: string;
  criteria: Criterion[];
  changeNote?: string | null;
  userId?: number | null;
}) {
  if (!params.criteria.length) {
    throw new Error("At least one criterion is required — an empty list would complete every session immediately");
  }

  const published = await db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ versionNumber: sessionCompletionCriteria.versionNumber })
      .from(sessionCompletionCriteria)
      .where(
        and(
          eq(sessionCompletionCriteria.populationTag, params.populationTag),
          eq(sessionCompletionCriteria.sessionType, params.sessionType as any),
        ),
      )
      .orderBy(desc(sessionCompletionCriteria.versionNumber))
      .limit(1);

    // Retire first: the unique index allows only one published row per
    // population/session, so this must happen before the insert.
    await tx
      .update(sessionCompletionCriteria)
      .set({ status: "retired" })
      .where(
        and(
          eq(sessionCompletionCriteria.populationTag, params.populationTag),
          eq(sessionCompletionCriteria.sessionType, params.sessionType as any),
          eq(sessionCompletionCriteria.status, "published"),
        ),
      );

    const [created] = await tx
      .insert(sessionCompletionCriteria)
      .values({
        populationTag: params.populationTag,
        sessionType: params.sessionType as any,
        versionNumber: (previous?.versionNumber ?? 0) + 1,
        status: "published",
        criteria: params.criteria as any,
        changeNote: params.changeNote ?? null,
        createdBy: params.userId ?? null,
        publishedAt: new Date(),
      })
      .returning();

    log(
      `completion criteria published: ${params.populationTag}/${params.sessionType} ` +
        `v${created.versionNumber}, ${params.criteria.length} criteria`,
      "criteria",
    );

    return created as CriteriaVersion;
  });

  /*
   * After the transaction commits, not inside it. Clearing inside would
   * repopulate from a read that could still roll back — and a rollback
   * would leave the cache holding a version that never existed.
   */
  cache.invalidate("criteria:");

  return published;
}

/**
 * Republishes an earlier version as a new one.
 *
 * A NEW version rather than reactivating the old row, so the history reads as
 * what actually happened: someone went back, rather than time moving backwards.
 */
export async function revertTo(versionId: number, userId?: number | null) {
  const [target] = await db
    .select()
    .from(sessionCompletionCriteria)
    .where(eq(sessionCompletionCriteria.id, versionId))
    .limit(1);

  if (!target) return null;

  return publish({
    populationTag: target.populationTag,
    sessionType: target.sessionType,
    criteria: target.criteria as Criterion[],
    changeNote: `Reverted to v${target.versionNumber}`,
    userId,
  });
}

/**
 * H-626 (Content Progression Logic) + IG-M6-03 (Comfort-Gated Progression).
 *
 * ── WHERE B2 WOULD HAVE BEEN, AND WHY MORE OF IT IS GONE THAN JUST THE HEADLINE RULE ──
 * Danielle's 2 Sep correction replaced H-626's original gate — self-reported B2 —
 * with `behavioral_content_comfort`, citing IG-U014: self-report governs
 * institutional reporting only, never coaching decisions. That correction named
 * one rule, but B2 appears in H-626 three more times, and IG-U014 doesn't
 * distinguish between them — it's a general principle about self-report and
 * coaching, not a fix scoped to one sentence of one card:
 *
 *  - Stage 3's gate: "published 3+ posts AND (B2 ≥ 4 OR demonstrated comfort
 *    through posting)". The B2≥4 alternative is dropped; only the behavioral
 *    alternative remains, operationalized as `behavioral_content_comfort`
 *    being `established` or `confident`.
 *  - The override "a user who enters with B2 = 5 ... skips to Stage 2
 *    immediately... [and can start] at Stage 3" — an intake self-report
 *    gating a coaching decision, exactly the pattern being corrected.
 *  - The override "an executive with B2 ≥ 3 may skip Stage 1 entirely" — same
 *    pattern, track-conditioned.
 *
 * Both overrides are omitted here rather than ported with `behavioral_content_
 * comfort` substituted in, because at intake there IS no behavioral history to
 * substitute — the whole reason B2 existed at that moment was that nothing
 * behavioral existed yet. There's no honest behavioral stand-in for "skip Stage
 * 1 because the student is new," so this stays Stage 1 for every new student
 * regardless of track or self-report, and lets the counts below move them up
 * as they actually publish. Flagged rather than silently dropped: if Danielle
 * wants new students fast-tracked, that needs a different mechanism than
 * self-report (e.g. an explicit request, which the "user asks for a higher
 * type" override already honors below), not a revived B2 check.
 *
 * The regression rule ("publishes a post and reports a negative experience →
 * no post suggestion for 30 days") is kept — it's behavioral (an event that
 * happened), not a self-report comfort rating, so IG-U014 doesn't touch it.
 * It isn't wired to a real signal yet; see `recentNegativePostExperience`
 * below.
 */

import { sql } from "drizzle-orm";
import { behavioralContentComfort, type BehavioralContentComfort } from "./behavioral-content-comfort";

type Db = { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };

export type ProgressionStage = 1 | 2 | 3;

export type ContentType = "comment" | "post" | "article";

export type ProgressionInput = {
  /** The student explicitly asked to write this type, regardless of stage —
   *  H-626 always honors this ("Wing honors the request but coaches more
   *  heavily on structure"), for post OR article. */
  explicitlyRequestedType?: ContentType;
  /**
   * "If a user publishes a post and reports a negative experience (anxiety,
   * regret, negative feedback), Wing does NOT suggest a post again for 30
   * days." Not wired to a real signal yet — nothing in `content_activity_log`
   * currently records a reported negative reaction to a published item, so
   * this always defaults to `false` unless a caller supplies it. Documented
   * here rather than silently ignored so the gap doesn't get lost; whoever
   * builds the "how did that feel" check-in (if one gets built) is what
   * should populate it.
   */
  recentNegativePostExperience?: boolean;
};

export type ProgressionResult = {
  stage: ProgressionStage;
  /** What Wing may currently suggest, per IG-M6-03 — never above `stage`,
   *  and with `post`/`article` dropped when the regression rule is active. */
  allowedTypes: ContentType[];
  publishedCommentCount: number;
  publishedPostCount: number;
  comfort: BehavioralContentComfort;
  postSuggestionsSuppressedByRegression: boolean;
  /** Human-readable trace of which rule set the stage — for review, same
   *  reason `content-cadence.ts`'s `resolvedBy` exists. */
  reason: string;
};

const STAGE_TYPES: Record<ProgressionStage, ContentType[]> = {
  1: ["comment"],
  2: ["comment", "post"],
  3: ["comment", "post", "article"],
};

/**
 * Computes a student's current progression stage from `content_activity_log`
 * counts and `behavioral_content_comfort`, per H-626 and IG-M6-03.
 */
export async function contentProgressionStage(
  db: Db,
  studentId: number,
  input: ProgressionInput = {},
): Promise<ProgressionResult> {
  const r = await db.execute(sql`
    SELECT "trigger_type", count(*)::int AS n
    FROM "wing"."content_activity_log"
    WHERE "student_id" = ${studentId} AND "event_type" = 'published'
    GROUP BY "trigger_type"
  `);
  const counts = new Map<string, number>();
  for (const row of r.rows ?? []) {
    counts.set(row.trigger_type as string, Number(row.n));
  }
  const publishedCommentCount = counts.get("comment") ?? 0;
  const publishedPostCount = counts.get("post") ?? 0;

  const { level: comfort } = await behavioralContentComfort(db, studentId);
  const comfortDemonstrated = comfort === "established" || comfort === "confident";

  let stage: ProgressionStage = 1;
  let reason = "Stage 1 (default): fewer than 3 published comments and no explicit request";

  if (publishedCommentCount >= 3) {
    stage = 2;
    reason = `Stage 2: ${publishedCommentCount} published comments (≥3)`;
  }
  if (publishedPostCount >= 3 && comfortDemonstrated) {
    stage = 3;
    reason = `Stage 3: ${publishedPostCount} published posts (≥3) and comfort is "${comfort}"`;
  } else if (publishedPostCount >= 3 && !comfortDemonstrated) {
    // Explicitly surfaced rather than silently staying at whatever stage the
    // comment count produced — H-626's Stage 3 gate is an AND, so 3+ posts
    // without demonstrated comfort should read as "close, not yet" rather
    // than looking identical to never having posted.
    reason = `Stage 2 held: ${publishedPostCount} published posts (≥3) but comfort is only "${comfort}" — Stage 3 needs established/confident`;
    if (stage < 2) stage = 2;
  }

  // "A user who asks to write an article regardless of stage → Wing honors
  // the request but coaches more heavily on structure." Same for post.
  if (input.explicitlyRequestedType === "article" && stage < 3) {
    stage = 3;
    reason = "Stage 3: explicit article request honored regardless of computed stage";
  } else if (input.explicitlyRequestedType === "post" && stage < 2) {
    stage = 2;
    reason = "Stage 2: explicit post request honored regardless of computed stage";
  }

  let allowedTypes = STAGE_TYPES[stage];
  const postSuggestionsSuppressedByRegression = Boolean(input.recentNegativePostExperience);
  if (postSuggestionsSuppressedByRegression) {
    // "This is not a punishment — it's comfort-responsive pacing." The
    // computed stage itself is unchanged; only what Wing may currently
    // suggest narrows, and only to comments.
    allowedTypes = allowedTypes.filter((t) => t === "comment");
    reason += "; post/article suggestions suppressed for 30 days by the regression rule";
  }

  return {
    stage,
    allowedTypes,
    publishedCommentCount,
    publishedPostCount,
    comfort,
    postSuggestionsSuppressedByRegression,
    reason,
  };
}

/**
 * IG-M6-03's check in isolation: is this specific content type currently
 * allowed for this student? Split out from `contentProgressionStage` so a
 * trigger detector (H-620–624) can call one cheap boolean check without
 * needing the full result shape, and so the gate has one place a review can
 * point at independent of how the stage was computed.
 */
export function contentTypeAllowed(
  result: Pick<ProgressionResult, "allowedTypes">,
  type: ContentType,
): boolean {
  return result.allowedTypes.includes(type);
}

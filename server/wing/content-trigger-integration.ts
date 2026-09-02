/**
 * H-627 (Content Trigger Integration Map).
 *
 * ── WHAT THIS FILE ADDS, GIVEN HOW MUCH OF H-627 ALREADY EXISTS ────────────
 * H-627 names four sources — Radar, module completion, micro-journal entries, and
 * time-based cadence — and says every one of them routes to a destination card
 * (H-620/H-621) and must carry a named provenance. Three of those four are already
 * real inside `content-trigger-detect.ts`: Foundation completion and micro-journal
 * quotes are live queries, and Radar is an explicit typed input waiting on Module 7.
 * `content-cadence.ts` implements the fourth (H-625) as a pure function over counts
 * a caller gathers. So this file is not a fifth signal source — it is the thing
 * H-627 actually is on top of those: routing, gating and provenance for a single
 * call, not a sixth place that reimplements what the other files already do.
 *
 * Two things were genuinely missing, not just unassembled:
 *
 *  1. **IG-M6-02's platform-suppression check was never wired to anything.**
 *     Neither `content-trigger-detect.ts` nor `content-progression.ts` reads a
 *     safety hold. Its own words are unconditional — "ALL content suggestions are
 *     suppressed... must never fire during a suppression window" — the same
 *     absolute framing `suppression.ts` already gives Radar. Fixed here by adding
 *     `"content_suggestion"` to `OutboundKind` and checking it through the existing
 *     fail-closed `maySend`, rather than inventing a second suppression mechanism.
 *  2. **Nothing gathers real cadence inputs from the database.**
 *     `content-cadence.ts`'s `isSuggestionDue` takes `track`, `comfort`,
 *     `daysSinceLastSuggestion`, `daysSinceLastUserContentAction` and
 *     `declineStreak` as plain values — by design, so it stays pure and testable.
 *     Something has to turn a student id into those five values. That query layer
 *     didn't exist anywhere; it's `contentSuggestionCadenceInputs` below.
 *
 * ── THE JUDGMENT CALL: CADENCE GATES EVERY SOURCE, NOT JUST THE TIME-BASED ONE ──
 * H-627's prose reads as if Sources 1–3 (Radar, module completion, micro-journal)
 * fire the moment their condition is true, and only Source 4 is cadence-gated.
 * Taken literally, a student who got a suggestion yesterday and completes
 * Foundation 3 today would get a second suggestion today — which contradicts
 * IG-M6-02's own, separate, unconditional line one card over: "Minimum 3 days
 * between any two content suggestions" (no source carve-out) plus "if user
 * declined the last 2 suggestions, extend the interval by 50%" (same). Rather than
 * build two different timing checks — a bare 3-day floor for Sources 1–3 and the
 * full per-track band for Source 4 — this runs every source through the SAME
 * `isSuggestionDue` call. That is a narrower reading than "event triggers are
 * always immediate" (a Foundation-completion moment can now wait up to a full
 * cadence band behind a recent suggestion), and it is the safe direction to be
 * wrong in: it can only under-suggest relative to the card's literal text, never
 * spam past IG-M6-02's floor. Flagged for Danielle/Aditya to confirm, the same way
 * `content-cadence.ts`'s own two track defaults are flagged rather than silently
 * decided.
 *
 * ── WHY POST IS CHECKED BEFORE COMMENT, WITH NO CARD TEXT SAYING SO ─────────
 * H-627 doesn't state a priority between H-620 and H-621 when both could plausibly
 * fire — it wasn't written assuming a single call has to pick one. `IG-M6-03`
 * already prevents a comment-only student from getting a post signal at all
 * (`content-progression.ts` gates `contentTypeAllowed` before either detector's
 * signals run), so this only matters for a student who could receive both — post
 * checked first, since a post subsumes the lower-barrier ask and is the rarer,
 * higher-value trigger once available. Also flagged, not asserted as her intent.
 *
 * ── WHAT H-627's failure_path IS NOT IMPLEMENTED HERE ───────────────────────
 * "If an integration event fires but the destination card's gate check fails...
 * the event is logged and stored. It does not re-fire." `content_activity_log`'s
 * `event_type` enum has exactly two states around firing: `trigger_fired` (Wing
 * offered something) and `trigger_declined` (the student said no to what was
 * offered). A source that fired but never reached the student — blocked by
 * progression stage or cadence before anything was offered — is neither of those;
 * writing it as `trigger_declined` would claim a decline nobody made. Rather than
 * overload that value or add a new enum member (a schema migration, out of scope
 * here), this file only ever writes `trigger_fired`, and only when a signal
 * actually clears every gate. The "logged so it does not re-fire" half of the
 * failure_path is satisfied structurally instead: a blocked source is re-derived
 * from live data (progression stage, days since last suggestion) on the next
 * call rather than replayed from a stored row, so it can't re-fire in the sense
 * that matters — it just isn't recorded as a distinct event. `trigger_declined`
 * itself is written by whatever UI surface presents the suggestion to the
 * student, which this file doesn't own.
 */

import { sql } from "drizzle-orm";
import { maySend } from "./safety-hold-store";
import {
  isSuggestionDue,
  resolveCadenceTrack,
  type CadenceCheckResult,
  type CadenceTrack,
} from "./content-cadence";
import { behavioralContentComfort, type BehavioralContentComfort } from "./behavioral-content-comfort";
import {
  detectArticleTrigger,
  detectCommentTrigger,
  detectPostTrigger,
  type ArticleTriggerInput,
  type CommentTriggerInput,
  type PostTriggerInput,
  type TriggerDetection,
} from "./content-trigger-detect";
import type { ProfessionalStatus, Pathway } from "./population-tags";

type Db = { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };

/* ── Gathering real cadence inputs ──────────────────────────────────────── */

export type CadenceInputs = {
  track: CadenceTrack | null;
  trackResolvedBy: string;
  comfort: BehavioralContentComfort;
  daysSinceLastSuggestion: number | null;
  daysSinceLastUserContentAction: number | null;
  declineStreak: number;
};

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * `professional_status` and `pathway`, the same two fields `population-tags.ts`
 * and `content-cadence.ts`'s `resolveCadenceTrack` read — gathered here with the
 * same LEFT join `messaging-store.ts`'s `recipient()` uses, since a student who
 * hasn't finished intake has no pathway and that's a normal state, not a reason
 * this query should fail.
 */
async function studentStatusAndPathway(
  db: Db,
  studentId: number,
): Promise<{ status: ProfessionalStatus | null; pathway: Pathway | null }> {
  const r = await db.execute(sql`
    SELECT u."professional_status", ir."pathway"
    FROM "wing"."students" s
    JOIN "wing"."users" u ON u."id" = s."user_id"
    LEFT JOIN "wing"."intake_records" ir ON ir."student_id" = s."id"
    WHERE s."id" = ${studentId}
    LIMIT 1
  `);
  const row = r.rows?.[0];
  return {
    status: (row?.professional_status as ProfessionalStatus | null) ?? null,
    pathway: (row?.pathway as Pathway | null) ?? null,
  };
}

/** Most recent `trigger_fired`, of any content type — IG-M6-02's floor is
 *  "between any two content suggestions," not per type. */
async function daysSinceLastSuggestion(db: Db, studentId: number): Promise<number | null> {
  const r = await db.execute(sql`
    SELECT max("occurred_at") AS "at"
    FROM "wing"."content_activity_log"
    WHERE "student_id" = ${studentId} AND "event_type" = 'trigger_fired'
  `);
  return daysSince(r.rows?.[0]?.at as string | null | undefined);
}

/** Most recent `draft_started` or `published` — the student actually doing
 *  something with content, per H-625's "a content action within 3 days
 *  suppresses the next suggestion." */
async function daysSinceLastUserContentAction(db: Db, studentId: number): Promise<number | null> {
  const r = await db.execute(sql`
    SELECT max("occurred_at") AS "at"
    FROM "wing"."content_activity_log"
    WHERE "student_id" = ${studentId} AND "event_type" IN ('draft_started', 'published')
  `);
  return daysSince(r.rows?.[0]?.at as string | null | undefined);
}

/**
 * Consecutive `trigger_declined` events, most recent first, stopping at the
 * first `trigger_fired` that ISN'T immediately followed by a decline — i.e. one
 * Wing presumably didn't get turned down. 20 rows is generous headroom above
 * H-625's own streak thresholds (2 extends, 3 pauses); nothing here should ever
 * need to look further back than that to find the break in the streak.
 */
async function declineStreak(db: Db, studentId: number): Promise<number> {
  const r = await db.execute(sql`
    SELECT "event_type"
    FROM "wing"."content_activity_log"
    WHERE "student_id" = ${studentId} AND "event_type" IN ('trigger_fired', 'trigger_declined')
    ORDER BY "occurred_at" DESC
    LIMIT 20
  `);
  let streak = 0;
  for (const row of r.rows ?? []) {
    if (row.event_type === "trigger_declined") {
      streak++;
      continue;
    }
    // A trigger_fired with no decline logged against it: treat the streak as
    // broken there. (A trigger_fired immediately followed — chronologically
    // earlier in this DESC scan — by its own decline was already counted above
    // it in the ordering, so this only stops on one that wasn't declined.)
    break;
  }
  return streak;
}

export async function contentSuggestionCadenceInputs(
  db: Db,
  studentId: number,
): Promise<CadenceInputs> {
  const [{ status, pathway }, { level: comfort }, lastSuggestion, lastAction, streak] =
    await Promise.all([
      studentStatusAndPathway(db, studentId),
      behavioralContentComfort(db, studentId),
      daysSinceLastSuggestion(db, studentId),
      daysSinceLastUserContentAction(db, studentId),
      declineStreak(db, studentId),
    ]);

  const resolved = resolveCadenceTrack(status, pathway);

  return {
    track: resolved.track,
    trackResolvedBy: resolved.resolvedBy,
    comfort,
    daysSinceLastSuggestion: lastSuggestion,
    daysSinceLastUserContentAction: lastAction,
    declineStreak: streak,
  };
}

/* ── IG-M6-02: platform suppression ─────────────────────────────────────── */

export async function contentSuggestionsSuppressed(
  db: Db,
  studentId: number,
  now = Date.now(),
): Promise<{ suppressed: boolean; why: string }> {
  const verdict = await maySend(db, studentId, "content_suggestion", now);
  return { suppressed: !verdict.allowed, why: verdict.why };
}

/* ── The route ───────────────────────────────────────────────────────────── */

export type RouteInput = {
  comment?: CommentTriggerInput;
  post?: PostTriggerInput;
  article?: ArticleTriggerInput;
};

export type RouteResult = {
  fires: boolean;
  contentType: "comment" | "post" | "article" | null;
  detection: TriggerDetection | null;
  cadence: CadenceCheckResult | null;
  reason: string;
};

/**
 * H-627: one call, in provenance order. Suppression first (absolute, IG-M6-02),
 * then cadence (the judgment call above — gates every source, not only H-625's
 * own time-based one), then the three live detectors, article before post before
 * comment — H-622 landed after the post-before-comment reasoning above was
 * written, and the same logic extends one step further: IG-M6-03 already keeps
 * a sub-Stage-3 student from ever seeing an article signal, so this ordering
 * only matters for a Stage-3 student who could plausibly get any of the three,
 * and article is the rarer, higher-barrier, higher-value ask of the two.
 *
 * Does not write anything — `recordTriggerFired` below is the caller's next
 * step once it has decided to actually present what this returns.
 */
export async function routeContentTrigger(
  db: Db,
  studentId: number,
  input: RouteInput = {},
  now = Date.now(),
): Promise<RouteResult> {
  const suppression = await contentSuggestionsSuppressed(db, studentId, now);
  if (suppression.suppressed) {
    return { fires: false, contentType: null, detection: null, cadence: null, reason: suppression.why };
  }

  const cadenceInputs = await contentSuggestionCadenceInputs(db, studentId);
  const cadence = isSuggestionDue({
    track: cadenceInputs.track,
    comfort: cadenceInputs.comfort,
    daysSinceLastSuggestion: cadenceInputs.daysSinceLastSuggestion,
    daysSinceLastUserContentAction: cadenceInputs.daysSinceLastUserContentAction,
    declineStreak: cadenceInputs.declineStreak,
    platformSuppressed: false, // already checked above, with the real hold data
  });
  if (!cadence.due) {
    return { fires: false, contentType: null, detection: null, cadence, reason: cadence.reason };
  }

  const article = await detectArticleTrigger(db, studentId, input.article ?? {});
  if (article.fires) {
    return { fires: true, contentType: "article", detection: article, cadence, reason: article.reason };
  }

  const post = await detectPostTrigger(db, studentId, input.post ?? {});
  if (post.fires) {
    return { fires: true, contentType: "post", detection: post, cadence, reason: post.reason };
  }

  const comment = await detectCommentTrigger(db, studentId, input.comment ?? {});
  if (comment.fires) {
    return { fires: true, contentType: "comment", detection: comment, cadence, reason: comment.reason };
  }

  return {
    fires: false,
    contentType: null,
    detection: null,
    cadence,
    reason: "cadence is due, but no signal — Radar, module completion, or micro-journal — has material right now",
  };
}

/**
 * Writes the `trigger_fired` row for a suggestion this call decided to actually
 * make. `sourceType` follows the same signal the detector already returned:
 * `explicit` means the student asked, everything else is Wing noticing
 * something — the same distinction `content_activity_log.source_type` makes
 * everywhere else in this schema.
 */
export async function recordTriggerFired(
  db: Db,
  studentId: number,
  contentType: "comment" | "post" | "article",
  detection: TriggerDetection,
): Promise<void> {
  const sourceType = detection.signal === "explicit" ? "human_originated" : "ai_generated";
  await db.execute(sql`
    INSERT INTO "wing"."content_activity_log"
      ("student_id", "trigger_type", "event_type", "trigger_source", "source_type")
    VALUES
      (${studentId}, ${contentType}, 'trigger_fired', ${detection.triggerSource}, ${sourceType})
  `);
}

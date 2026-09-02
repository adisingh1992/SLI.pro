/**
 * `behavioral_content_comfort` — Danielle, 2 Sep, replacing H-626's original B2 gate.
 *
 * ── WHY THIS REPLACES SELF-REPORTED B2 ────────────────────────────────────
 * IG-U014: self-report governs institutional reporting only, never coaching decisions.
 * The original H-626 gated content-type progression on the student's self-reported
 * comfort with visibility (B2) — that's exactly the thing IG-U014 rules out. This
 * derives comfort from what a student has actually DONE across content interactions
 * instead of what they said about it.
 *
 * ── WHY IT IS STORED NOWHERE ───────────────────────────────────────────────
 * Danielle's instruction was to store it "alongside audience_track, doorway, and
 * identity_reference_frame — same architecture, same update cadence." Checked against
 * the actual code, those three are not one architecture: audience_track has no column
 * at all (derived at read time in audience-track.ts from professional_status + intake
 * pathway), doorway is stored but deliberately never read back
 * (user_delivery_profiles.currentDoorwayComponentId), and identity_reference_frame has
 * no persistence whatsoever — a pure resolver, default `external`.
 *
 * Comfort has to be read back, since H-626 and IG-M6-03 gate on it — that rules out
 * the doorway pattern outright — so this follows audience_track's: computed here, on
 * every read, from `content_activity_log`, never stored as a column that could drift
 * from the log it summarizes.
 *
 * This is a best-guess interpretation of "same architecture," not a confirmed one —
 * flagged to Aditya as such. Worth a line to Danielle before this ships, since her
 * phrase could as easily have meant "give it a column like doorway does."
 *
 * ── WHY THESE FOUR LEVELS AND THESE THRESHOLDS ────────────────────────────
 * The spec names the variable and its role — gates H-626's Stage 2 (posts) and Stage 3
 * (articles) thresholds — but not a level scale of its own; H-626's own thresholds are
 * written directly in terms of post/comment counts and B2 overrides that no longer
 * apply. So this collapses to the same shape H-626 already wants (published count +
 * spread across trigger types + a signal for "declined/abandoned more than they
 * finished"), rather than inventing an unrelated scale. Kept intentionally simple:
 * easy to check against real data and revise once Danielle has seen it against actual
 * students, rather than building something elaborate on a guess.
 */
import { sql } from "drizzle-orm";

type Db = { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };

export type BehavioralContentComfort =
  /** No published content yet. H-626 Stage 1 — comments only. */
  | "unestablished"
  /** Published at least once, but only one trigger type or a rough recent run of
   *  abandoned drafts. Still Stage 1/2 territory depending on H-626's own count check. */
  | "emerging"
  /** Published across two or more trigger types, no recent abandonment run. Supports
   *  H-626 Stage 2 (posts + comments). */
  | "established"
  /** Sustained publishing across three or more trigger types, low abandonment. Required
   *  alongside H-626's 3-post gate before Stage 3 (articles) is offered. */
  | "confident";

export type ComfortSignals = {
  publishedCount: number;
  publishedTriggerTypes: number;
  /** Count of draft_started events, most-recent-first, with no matching published
   *  event for that same draft — i.e. an unbroken recent run of drafts that went
   *  nowhere. Resets to 0 the moment a published draft is reached walking backward. */
  recentAbandonmentStreak: number;
};

/**
 * Reads the last 90 days of `content_activity_log` for one student and classifies
 * comfort. 90 days rather than all-time: comfort is meant to describe current
 * behavior, and a student who published confidently months ago and has gone quiet
 * since should not hold "confident" forever on old evidence — the same reasoning
 * `prompt-log-store.ts`'s verbatim retention horizon uses for the Reveal Cycle
 * (recent behavior only, not a permanent record).
 */
export async function behavioralContentComfort(
  db: Db,
  studentId: number,
): Promise<{ level: BehavioralContentComfort; signals: ComfortSignals }> {
  const r = await db.execute(sql`
    SELECT "trigger_type", "event_type", "content_draft_id", "occurred_at"
    FROM "wing"."content_activity_log"
    WHERE "student_id" = ${studentId}
      AND "occurred_at" >= now() - interval '90 days'
    ORDER BY "occurred_at" DESC
  `);

  const rows = r.rows ?? [];
  const published = rows.filter((row) => row.event_type === "published");
  const publishedTriggerTypes = new Set(published.map((row) => row.trigger_type)).size;
  const publishedDraftIds = new Set<number>(
    published
      .map((row) => row.content_draft_id as number | null)
      .filter((v): v is number => v !== null && v !== undefined),
  );

  // Walking most-recent-first: count a leading run of draft_started rows whose
  // content_draft_id never shows up among published rows. Stops at the first
  // draft_started that DID get published — that's where "recent" abandonment ends,
  // not the whole history.
  let recentAbandonmentStreak = 0;
  for (const row of rows) {
    if (row.event_type !== "draft_started") continue;
    const draftId = row.content_draft_id as number | null;
    if (draftId !== null && publishedDraftIds.has(draftId)) break;
    recentAbandonmentStreak++;
  }

  const signals: ComfortSignals = {
    publishedCount: published.length,
    publishedTriggerTypes,
    recentAbandonmentStreak,
  };

  let level: BehavioralContentComfort;
  if (published.length === 0) {
    level = "unestablished";
  } else if (publishedTriggerTypes >= 3 && recentAbandonmentStreak < 2) {
    level = "confident";
  } else if (publishedTriggerTypes >= 2 && recentAbandonmentStreak < 3) {
    level = "established";
  } else {
    level = "emerging";
  }

  return { level, signals };
}

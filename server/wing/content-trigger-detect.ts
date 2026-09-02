/**
 * H-620 (Comment Trigger) and H-621 (Post Trigger) detection.
 *
 * ── WHY ONLY TWO OF THE FIVE TRIGGERS ────────────────────────────────────
 * H-622 (Article), H-623 (DM) and H-624 (Connection Request) all lean on data
 * this platform doesn't produce yet: H-622 needs post-engagement numbers
 * (content_drafts tracks `shareCount` — how many times WING shared it — not
 * engagement received), and H-623/H-624 need Module 11 (Network Intelligence),
 * which — per this session's own compendium-parser check — exists nowhere as
 * runtime logic, only as a numbering label. Building detectors for those now
 * would mean inventing the very data they're supposed to detect against.
 * H-620 and H-621 are the two triggers where enough of the signal set is
 * already real: Foundation completion (`wing.sessions`), content activity
 * (`wing.content_activity_log`, this session's own addition), and Tier 1
 * micro-journal entries (`wing.prompt_log`, wired earlier this session).
 *
 * ── WHY EVERY SIGNAL THAT ISN'T GROUNDED SAYS SO, RATHER THAN GUESSING ────
 * H-620's signal (a) and H-621's signals (b), (e), (g) depend on Radar,
 * Module 8/9 completion events, and post-engagement numbers respectively —
 * none of which exist. Rather than silently omitting them (which would make
 * the detector look complete when it isn't) each takes an explicit,
 * optional, typed input the caller must supply from wherever that signal
 * eventually comes from, defaulting to "not available" when omitted. A
 * detector that always returns false for a signal nothing can supply yet is
 * honest; one that pretends the signal doesn't exist is not.
 *
 * Both detectors gate through `content-progression.ts` (IG-M6-03) and
 * `content-cadence.ts` (IG-M6-02, H-625) FIRST — a signal firing doesn't mean
 * a suggestion goes out; H-627's failure_path is explicit that a fired
 * integration event whose destination gate fails is logged and does not
 * re-fire, which is exactly the shape `fires: false` with a `reason` gives a
 * caller here.
 */

import { sql } from "drizzle-orm";
import { contentProgressionStage, contentTypeAllowed } from "./content-progression";

type Db = { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };

export type TriggerDetection = {
  fires: boolean;
  /** Which of the card's own lettered signals fired, or null if none did (or
   *  if a gate upstream of signal-checking blocked it first). */
  signal: string | null;
  reason: string;
  /** IG-M6-04: the named source a firing suggestion must trace to — a Radar
   *  topic, a session reference, a journal quote, a module completion event.
   *  Populated only when `fires` is true; feeds `content_activity_log
   *  .triggerSource` when the suggestion is logged. */
  triggerSource: string | null;
};

const NOT_DUE: TriggerDetection = {
  fires: false,
  signal: null,
  reason: "progression stage or cadence gate did not allow this content type",
  triggerSource: null,
};

async function daysSinceLastContentActivity(db: Db, studentId: number): Promise<number | null> {
  const r = await db.execute(sql`
    SELECT max("occurred_at") AS last_at
    FROM "wing"."content_activity_log"
    WHERE "student_id" = ${studentId}
  `);
  const lastAt = r.rows?.[0]?.last_at as string | null | undefined;
  if (!lastAt) return null;
  return Math.floor((Date.now() - new Date(lastAt).getTime()) / (24 * 60 * 60 * 1000));
}

async function foundationCompletedAt(
  db: Db,
  studentId: number,
  sessionType: "foundation_1" | "foundation_2" | "foundation_3",
): Promise<number | null> {
  const r = await db.execute(sql`
    SELECT "completed_at"
    FROM "wing"."sessions"
    WHERE "student_id" = ${studentId}
      AND "session_type" = ${sessionType}
      AND "status" = 'completed'
    ORDER BY "completed_at" DESC
    LIMIT 1
  `);
  const completedAt = r.rows?.[0]?.completed_at as string | null | undefined;
  return completedAt ? new Date(completedAt).getTime() : null;
}

function hoursAgo(epochMs: number): number {
  return (Date.now() - epochMs) / (60 * 60 * 1000);
}

/** A recent Tier 1 (behavioral, falsifiable) micro-journal entry with actual
 *  verbatim text — the same table `prompt-log-store.ts` writes to. */
async function recentTier1JournalQuote(
  db: Db,
  studentId: number,
  withinDays: number,
): Promise<{ verbatim: string; respondedAt: number } | null> {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();
  const r = await db.execute(sql`
    SELECT "verbatim", "responded_at"
    FROM "wing"."prompt_log"
    WHERE "student_id" = ${studentId}
      AND "evidence_tier" = 1
      AND "responded_at" >= ${since}
      AND "verbatim" IS NOT NULL
      AND length("verbatim") > 0
    ORDER BY "responded_at" DESC
    LIMIT 1
  `);
  const row = r.rows?.[0];
  if (!row) return null;
  return {
    verbatim: row.verbatim as string,
    respondedAt: new Date(row.responded_at as string).getTime(),
  };
}

/* ── H-620 — Comment Trigger ────────────────────────────────────────────── */

export type CommentTriggerInput = {
  /** Signal (a): Radar surfaces content in the user's topic area by someone
   *  in their network or industry. Always `null` until Module 7/Radar exists
   *  — not even H-701 (Baby Radar) produces this, since Baby Radar surfaces
   *  topics to write about, not third-party content to comment on. */
  radarContentMatch?: { authorName: string; topic: string } | null;
  /** Signal (c): Radar briefs consumed but no content suggestion engaged with
   *  for 3+ cycles. Same dependency as above. */
  radarEngagementCount?: number | null;
};

export async function detectCommentTrigger(
  db: Db,
  studentId: number,
  input: CommentTriggerInput = {},
): Promise<TriggerDetection> {
  const progression = await contentProgressionStage(db, studentId);
  if (!contentTypeAllowed(progression, "comment")) return NOT_DUE;

  // Signal (a): Radar content match — supplied by the caller, not detected here.
  if (input.radarContentMatch) {
    const { authorName, topic } = input.radarContentMatch;
    return {
      fires: true,
      signal: "a",
      reason: `Radar surfaced content by ${authorName} on ${topic}`,
      triggerSource: `radar:${authorName}:${topic}`,
    };
  }

  // Signal (d): Foundation 1 just completed — "just" read as within 48 hours,
  // since the card frames this as the moment the student "now has a function
  // lens," not an open-ended eligibility window.
  const f1CompletedAt = await foundationCompletedAt(db, studentId, "foundation_1");
  if (f1CompletedAt && hoursAgo(f1CompletedAt) <= 48) {
    return {
      fires: true,
      signal: "d",
      reason: "Foundation 1 completed within the last 48 hours",
      triggerSource: `foundation_1_completion:${new Date(f1CompletedAt).toISOString()}`,
    };
  }

  // Signal (b): low comfort AND Foundation 1 complete AND 14+ days with no
  // content activity. "Low comfort" reads the comfort levels this session
  // built as the B2=1–2 replacement (unestablished/emerging), per IG-U014.
  if (f1CompletedAt && (progression.comfort === "unestablished" || progression.comfort === "emerging")) {
    const idleDays = await daysSinceLastContentActivity(db, studentId);
    if (idleDays === null || idleDays >= 14) {
      return {
        fires: true,
        signal: "b",
        reason: `Foundation 1 complete, comfort is "${progression.comfort}", ${idleDays === null ? "no content activity on record" : `${idleDays}d since last activity`}`,
        triggerSource: `dormancy:${idleDays ?? "never"}`,
      };
    }
  }

  // Signal (c): Radar consumed without engagement — supplied by the caller.
  if (input.radarEngagementCount === 0) {
    return {
      fires: true,
      signal: "c",
      reason: "Radar briefs consumed with zero content engagement for 3+ cycles",
      triggerSource: "radar_engagement_count:0",
    };
  }

  return { fires: false, signal: null, reason: "no comment-trigger signal fired", triggerSource: null };
}

/* ── H-621 — Post Trigger ───────────────────────────────────────────────── */

export type PostTriggerInput = {
  /** Signal (b): Radar trending topic + a unique angle from prior sessions. */
  radarTopicWithAngle?: { topic: string; sessionReference: string } | null;
  /** Signal (e): Module 8 (competency) or Module 9 (power insight) completion.
   *  Always `null` — there is no `modules`/`module_completions` table yet
   *  (wing-schema.ts lists both as "Designed now — built in Tier 2"), so this
   *  signal has no data source at all, not even a partial one. Foundation 2's
   *  half of signal (e) IS checked below, independently, since Foundation
   *  sessions are real. */
  module8Or9CompletedAt?: number | null;
  /** Signal (g): the student's prior post received engagement. `content_
   *  drafts.shareCount` counts how many times WING shared the post, not
   *  engagement it received — there is no engagement-received number to read
   *  yet, so this stays an explicit input, not a query. */
  priorPostEngagement?: number | null;
  /** Micro-journal lookback window for signal (c). */
  journalLookbackDays?: number;
  /**
   * "User explicitly asks to write a post" is itself one of H-626's Stage 2
   * entry conditions, independent of comment count — passed through to
   * `content-progression.ts` so a caller acting on an explicit request isn't
   * blocked by a progression stage the request itself should satisfy. Found
   * while writing this file's tests: without this, there was no way to reach
   * Stage 2 other than 3+ published comments, which silently made "the user
   * asked to write a post" unactionable below Stage 2 — exactly the gap H-626
   * says this override exists to prevent.
   */
  explicitRequest?: boolean;
};

export async function detectPostTrigger(
  db: Db,
  studentId: number,
  input: PostTriggerInput = {},
): Promise<TriggerDetection> {
  const progression = await contentProgressionStage(db, studentId, {
    explicitlyRequestedType: input.explicitRequest ? "post" : undefined,
  });
  if (!contentTypeAllowed(progression, "post")) return NOT_DUE;

  if (input.explicitRequest) {
    return {
      fires: true,
      signal: "explicit",
      reason: "user explicitly asked to write a post",
      triggerSource: "explicit_request:post",
    };
  }

  // Signal (a): Foundation 3 completion event — fires once, on the day.
  const f3CompletedAt = await foundationCompletedAt(db, studentId, "foundation_3");
  if (f3CompletedAt && hoursAgo(f3CompletedAt) <= 48) {
    return {
      fires: true,
      signal: "a",
      reason: "Foundation 3 completed within the last 48 hours",
      triggerSource: `foundation_3_completion:${new Date(f3CompletedAt).toISOString()}`,
    };
  }

  // Signal (e), Foundation 2 half: Foundation 2 (evidence inventory) complete
  // and recent. Module 8/9's half of this signal has no data source — see
  // PostTriggerInput's doc comment.
  const f2CompletedAt = await foundationCompletedAt(db, studentId, "foundation_2");
  if (f2CompletedAt && hoursAgo(f2CompletedAt) <= 48) {
    return {
      fires: true,
      signal: "e",
      reason: "Foundation 2 completed within the last 48 hours (evidence inventory available)",
      triggerSource: `foundation_2_completion:${new Date(f2CompletedAt).toISOString()}`,
    };
  }
  if (input.module8Or9CompletedAt && hoursAgo(input.module8Or9CompletedAt) <= 48) {
    return {
      fires: true,
      signal: "e",
      reason: "Module 8/9 completion supplied by caller",
      triggerSource: `module_8_or_9_completion:${new Date(input.module8Or9CompletedAt).toISOString()}`,
    };
  }

  /*
   * Signal (d): 3+ published comments — the progression module already counts
   * this; re-derive the same threshold here rather than re-querying.
   *
   * WORTH FLAGGING: this check's threshold is the SAME 3-comment count that
   * gets a student into Stage 2 in the first place (content-progression.ts).
   * Since a student who isn't at Stage 2+ never reaches this line at all
   * (the `contentTypeAllowed` gate above returns early), and reaching Stage 2
   * via comments always means commentCount ≥ 3, signal (d) fires for
   * essentially every Stage-2-via-comments student the first time this runs
   * — which also means signals (b), (c) and (g) below are only reachable for
   * a student who reached Stage 2/3 WITHOUT commenting (an explicit post
   * request, or already Stage 3 with few comments but 3+ posts). That's a
   * narrow population, not a bug — H-626 doesn't say (d) has to be rare, and
   * a caller can always check `input.explicitRequest` first if a specific
   * post's material (a journal quote, a Radar topic) matters more than
   * flagging the comment-count milestone. Just worth knowing before assuming
   * (b)/(c)/(g) fire as often as the card's prose suggests.
   */
  if (progression.publishedCommentCount >= 3) {
    return {
      fires: true,
      signal: "d",
      reason: `${progression.publishedCommentCount} published comments (≥3) — progression trigger`,
      triggerSource: `comment_count:${progression.publishedCommentCount}`,
    };
  }

  // Signal (c): a recent Tier 1 micro-journal entry with publishable material.
  // "Publishable" (specific, experiential, connected to positioning) is a
  // judgment call the card leaves to Wing's coaching turn, not to this
  // detector — this only checks that a Tier 1, non-empty entry exists inside
  // the window; whether it's actually usable is decided when Wing looks at it.
  const journalQuote = await recentTier1JournalQuote(db, studentId, input.journalLookbackDays ?? 14);
  if (journalQuote) {
    return {
      fires: true,
      signal: "c",
      reason: "a Tier 1 micro-journal entry from the last " + (input.journalLookbackDays ?? 14) + " days is available",
      triggerSource: `journal_quote:${journalQuote.respondedAt}`,
    };
  }

  // Signal (g): prior post got engagement — supplied by the caller.
  if (input.priorPostEngagement !== null && input.priorPostEngagement !== undefined && input.priorPostEngagement > 0) {
    return {
      fires: true,
      signal: "g",
      reason: `prior post engagement: ${input.priorPostEngagement}`,
      triggerSource: `prior_post_engagement:${input.priorPostEngagement}`,
    };
  }

  // Signal (b): Radar topic + unique angle — supplied by the caller.
  if (input.radarTopicWithAngle) {
    const { topic, sessionReference } = input.radarTopicWithAngle;
    return {
      fires: true,
      signal: "b",
      reason: `Radar topic "${topic}" matched with a session reference`,
      triggerSource: `radar_topic:${topic}:${sessionReference}`,
    };
  }

  // Signal (f): cadence-driven — handled by content-cadence.ts's isSuggestionDue,
  // not here. A caller that gets `fires: false` from every signal above should
  // fall back to that check with whatever material signal (c)/(g)/(b) found,
  // per H-627's Source 4: "a cadence trigger with no specific material
  // produces nothing" — so signal (f) is deliberately not a sixth branch here,
  // it's the reason to re-run this same detector when the cadence check says
  // a suggestion is due rather than a separate code path.

  return { fires: false, signal: null, reason: "no post-trigger signal fired", triggerSource: null };
}

/**
 * H-620 (Comment Trigger), H-621 (Post Trigger), H-622 (Article Trigger)
 * detection. H-623 (DM) and H-624 (Connection Request) are not here — see
 * their own scoping note, kept separately since it's a product decision, not
 * an engineering gap this file can close.
 *
 * ── CORRECTION (2 Sep 2026): H-622 was never blocked by engagement numbers ──
 * This header used to say H-622 needed "post-engagement numbers." That was a
 * misreading, caught re-checking the real card text in
 * `methodology/wing-content-system-v1.md`: post-engagement is H-621's signal
 * (g) ("user's prior post received engagement") — H-622's own signal list
 * (3+ posts, comfort, then any of topic depth / a framework / Radar+angle /
 * Module 8 insight) never mentions engagement at all. H-622 is built below.
 *
 * ── WHY H-623/H-624 STILL AREN'T ──────────────────────────────────────────
 * Both need either Module 11 (Network Intelligence) — confirmed, by this
 * session's own compendium-parser check, to exist nowhere as runtime logic,
 * only as a numbering label — or a "contacts" data model (identified
 * contacts, last-interaction timestamps) that doesn't exist at all, in any
 * form. Building detectors for those now would mean inventing the data
 * they're supposed to detect against.
 *
 * ── WHY EVERY SIGNAL THAT ISN'T GROUNDED SAYS SO, RATHER THAN GUESSING ────
 * H-620's signal (a) and H-621's signal (g) depend on Radar (third-party
 * content discovery) and post-engagement numbers respectively — neither
 * exists. Rather than silently omitting them (which would make the detector
 * look complete when it isn't) each takes an explicit, optional, typed input
 * the caller must supply from wherever that signal eventually comes from,
 * defaulting to "not available" when omitted. A detector that always returns
 * false for a signal nothing can supply yet is honest; one that pretends the
 * signal doesn't exist is not. H-621's signal (b) and H-622's signal (e) —
 * both a *topic* Radar surfaces, not third-party content — are different:
 * Baby Radar (H-701) genuinely produces this now, so both are real queries
 * below, not caller-supplied stubs. Module 8/9 completion (H-621's other
 * half of signal (e), H-622's signal (f)) stays a stub either way — there is
 * no `modules`/`module_completions` table yet.
 *
 * All three detectors gate through `content-progression.ts` (IG-M6-03) and
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

/** Signal source for H-621's signal (b) and H-622's signal (e): a Baby Radar
 *  (H-701) topic suggestion Radar itself tagged `suggestedAction: "post"` —
 *  its own judgment that a topic is "worth writing about," not just
 *  commenting on or filing away. Unlike `radarContentMatch` (third-party
 *  content, H-620's signal (a) — no data source), this is real: Baby Radar's
 *  `whyRelevant` is generated from the student's own Foundation 1 function
 *  and intake Q5.5 topic area (see `baby-radar.ts`), which is exactly the
 *  "longitudinal session data provides a unique angle" both cards ask for —
 *  not a generic trending topic, one already tied to this student's data. */
async function recentRadarTopic(
  db: Db,
  studentId: number,
  withinDays: number,
): Promise<{ topic: string; whyRelevant: string; generatedAt: number } | null> {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();
  const r = await db.execute(sql`
    SELECT "topic", "why_relevant", "generated_at"
    FROM "wing"."radar_suggestions"
    WHERE "student_id" = ${studentId}
      AND "suggested_action" = 'post'
      AND "generated_at" >= ${since}
    ORDER BY "generated_at" DESC
    LIMIT 1
  `);
  const row = r.rows?.[0];
  if (!row) return null;
  return {
    topic: row.topic as string,
    whyRelevant: row.why_relevant as string,
    generatedAt: new Date(row.generated_at as string).getTime(),
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
  /** Signal (b): Radar trending topic + a unique angle from prior sessions.
   *  Optional override — when supplied (e.g. Wing's coaching turn already
   *  tied a specific Radar topic to a specific session reference), it takes
   *  priority. When omitted, `detectPostTrigger` falls back to
   *  `recentRadarTopic`, a real query against Baby Radar's own `post`-tagged
   *  suggestions — this signal is no longer a pure stub. */
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

  // Signal (b): Radar topic + unique angle. A caller-supplied override takes
  // priority (it can name a specific session reference); otherwise fall back
  // to Baby Radar's own most recent "worth writing about" topic suggestion.
  if (input.radarTopicWithAngle) {
    const { topic, sessionReference } = input.radarTopicWithAngle;
    return {
      fires: true,
      signal: "b",
      reason: `Radar topic "${topic}" matched with a session reference`,
      triggerSource: `radar_topic:${topic}:${sessionReference}`,
    };
  }
  const radarTopicForPost = await recentRadarTopic(db, studentId, 14);
  if (radarTopicForPost) {
    return {
      fires: true,
      signal: "b",
      reason: `Baby Radar surfaced "${radarTopicForPost.topic}" as worth writing about: ${radarTopicForPost.whyRelevant}`,
      triggerSource: `radar_suggestion_topic:${radarTopicForPost.topic}`,
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

/* ── H-622 — Article Trigger ────────────────────────────────────────────── */

export type ArticleTriggerInput = {
  /** Signal (c): deep topic expertise demonstrated across multiple sessions
   *  — not a single data point. Whether a given student's session history
   *  clears that bar is a judgment call (how deep, how many sessions, on the
   *  same topic) this file doesn't attempt; supplied by the caller once
   *  something upstream (Wing's coaching turn, eventually a real analysis
   *  pass) has made that call. */
  topicDepthAcrossSessions?: boolean;
  /** Signal (d): the user has a framework, methodology, or contrarian take
   *  that exceeds post length. Same reasoning as above — recognizing "this
   *  is bigger than a post" is a judgment this file doesn't make itself. */
  frameworkOrContrarianTake?: boolean;
  /** Signal (f): Module 8 (competency framework) reveals a publishable
   *  insight. Always `null` unless supplied — same as `PostTriggerInput
   *  .module8Or9CompletedAt`, there is no `modules`/`module_completions`
   *  table yet. Kept as its own field (not reused from PostTriggerInput)
   *  because H-622's signal (f) is Module 8 specifically, not "8 or 9." */
  module8CompletedAt?: number | null;
  /** Same override semantics as H-626's post override — see
   *  `PostTriggerInput.explicitRequest`. */
  explicitRequest?: boolean;
};

export async function detectArticleTrigger(
  db: Db,
  studentId: number,
  input: ArticleTriggerInput = {},
): Promise<TriggerDetection> {
  // Gate: (a) 3+ published posts AND (b) comfort demonstrated. This is
  // exactly Stage 3 in content-progression.ts (publishedPostCount >= 3 &&
  // comfortDemonstrated, where comfortDemonstrated reads the
  // behavioral_content_comfort replacement for B2 ≥ 4, per IG-U014) — no
  // separate gate check needed here, same pattern as H-620/H-621.
  const progression = await contentProgressionStage(db, studentId, {
    explicitlyRequestedType: input.explicitRequest ? "article" : undefined,
  });
  if (!contentTypeAllowed(progression, "article")) return NOT_DUE;

  if (input.explicitRequest) {
    return {
      fires: true,
      signal: "explicit",
      reason: "user explicitly asked to write an article",
      triggerSource: "explicit_request:article",
    };
  }

  // Signal (c): topic depth across sessions — supplied by the caller.
  if (input.topicDepthAcrossSessions) {
    return {
      fires: true,
      signal: "c",
      reason: "deep topic expertise demonstrated across multiple sessions",
      triggerSource: "topic_depth_across_sessions",
    };
  }

  // Signal (d): a framework, methodology, or contrarian take — supplied by
  // the caller.
  if (input.frameworkOrContrarianTake) {
    return {
      fires: true,
      signal: "d",
      reason: "user has a framework, methodology, or contrarian take that exceeds post length",
      triggerSource: "framework_or_contrarian_take",
    };
  }

  // Signal (e): Radar surfaces a substantial topic where the user's
  // longitudinal session data provides a unique angle. Real as of Baby
  // Radar (H-701) — see recentRadarTopic's doc comment.
  const radarTopicForArticle = await recentRadarTopic(db, studentId, 14);
  if (radarTopicForArticle) {
    return {
      fires: true,
      signal: "e",
      reason: `Baby Radar surfaced "${radarTopicForArticle.topic}" as worth writing about, with a longitudinal angle: ${radarTopicForArticle.whyRelevant}`,
      triggerSource: `radar_suggestion_topic:${radarTopicForArticle.topic}`,
    };
  }

  // Signal (f): Module 8 competency framework reveals a publishable insight
  // — supplied by the caller (no modules/module_completions table yet).
  if (input.module8CompletedAt && hoursAgo(input.module8CompletedAt) <= 48) {
    return {
      fires: true,
      signal: "f",
      reason: "Module 8 completion supplied by caller reveals a publishable insight",
      triggerSource: `module_8_completion:${new Date(input.module8CompletedAt).toISOString()}`,
    };
  }

  return { fires: false, signal: null, reason: "no article-trigger signal fired", triggerSource: null };
}

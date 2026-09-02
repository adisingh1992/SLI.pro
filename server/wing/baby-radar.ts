/**
 * H-701 — Baby Radar Topic Suggestion (Wing_Content_System_v1, Spec 2, 2 Sep 2026).
 * Aditya ruled this card itself Tier 1 on 2 Sep 2026 — see `parse-content-system.ts`'s
 * `CONTENT_SYSTEM_TIER1_INCLUDED` for the scoped record of that decision.
 *
 * ── WHY THIS NEEDED NO SEARCH PROVIDER, CORRECTING THIS SESSION'S OWN EARLIER PLAN ──
 * The build plan this session wrote right after the Tier 1 decision assumed Baby
 * Radar's first engineering decision was "a search provider integration or a
 * web-search-capable model call — neither exists in this codebase." That was wrong,
 * caught only by reading Spec 2 itself in full rather than the summary the first pass
 * worked from: "Baby Radar... does NOT pull from an external feed — it uses Wing's
 * knowledge of the user's positioning to generate relevant topics." H-701's own
 * `detection_method` confirms it: "Cron trigger + user has a function... or topic
 * area... If neither exists, Radar is dormant." One model call over two fields
 * this platform already has — `functional_identity`'s `primaryFunction` from
 * Foundation 1, and Q5.5's answer from intake — is the entire data dependency. Full
 * Radar (real feed integration) is explicitly October scope, not this card.
 *
 * ── WHY EVERY QUERY HERE IS RAW SQL AGAINST AN INJECTABLE Db, NOT session-store.ts ──
 * `session-store.ts` and `intake-store.ts` already have real, presumably-tested
 * helpers for exactly this data (`getSession`/`getArtifact`,
 * `getBrandingIntake`) — but both import the live `db` singleton directly, which
 * is untestable without a real database, and `intake-store.ts`'s functions are
 * keyed on the legacy `userId`, not `studentId`, which is what every other file
 * in this content-trigger layer takes. Re-querying the same two tables with the
 * same `Db`-injection convention `content-trigger-detect.ts` and
 * `content-trigger-integration.ts` already use keeps this module actually
 * unit-testable and consistent with its neighbors, at the cost of one duplicated
 * (simple) query per table rather than reusing the existing helper.
 *
 * ── THE TWO JUDGMENT CALLS, FLAGGED THE SAME WAY THIS SESSION'S OTHERS ARE ────
 *  1. **Delivery-track resolution.** H-701's `delivery_adaptation` names five
 *     buckets (undergraduate, mid-career, executive, entrepreneur, career
 *     returner) — narrower than H-625's eight-track cadence table, and with no
 *     stated mapping from `professional_status`/`pathway`. `early_career` has no
 *     bucket of its own; defaulted to the `undergraduate` framing ("industry
 *     entry, trends in the target field"), the closest fit. `mid_career_or_senior`
 *     defaults to `mid_career`, not `executive` — same direction
 *     `content-cadence.ts`'s `resolveCadenceTrack` already defaults that
 *     ambiguity, for the same reason (executive needs stronger confirmation).
 *     `venture`/`freelance` pathway maps to the single `entrepreneur` bucket —
 *     H-701 doesn't split entrepreneur by stage the way H-625 does. An
 *     unresolved status gets a generic, non-track-specific instruction rather
 *     than a guess.
 *  2. **"Weekly cadence... on a configurable day" is implemented as a plain
 *     7-day interval from the last generation**, not a specific day of week. The
 *     "configurable day" half of H-701's signal is a scheduling concern for
 *     whatever cron job eventually calls `isRadarDueThisWeek` on a schedule, not
 *     something this eligibility check can decide on its own — flagged rather
 *     than inventing a day-of-week setting nothing asked for.
 *
 * ── WHAT THIS FILE DOES NOT BUILD ────────────────────────────────────────────
 * The Radar dashboard card and page itself (`this_weeks_intelligence` in
 * `wing-modules.ts`) are UI surfaces — this file only supplies the data and
 * mutation they need (`currentRadarSuggestions`, `recordRadarEngagement`),
 * wired up in `radar-routes.ts`.
 *
 * ── THE WEEKLY RUNNER (`runDueRadarSuggestions`, added 2 Sep 2026) ──────────
 * Wired into `run-sequences.ts` now, same shape as that file's own
 * `reveal.runDueRevealCycles()` and `soft.runDueSoftCheckIns()`: a candidate
 * list, per-student try/catch so one broken row can't cost anyone else their
 * week, failures collected and thrown at the end so a bad hour shows up as a
 * failed Container Apps execution rather than a silent one. It takes `db` as
 * an explicit argument rather than importing the real one internally — unlike
 * `reveal-cycle.ts`/`soft-check-in.ts`, every function in this file already
 * takes an injectable `Db` (see the header note above), and there was no
 * reason for the one new function to be the exception; `run-sequences.ts`
 * passes the real `db` in the same way `reveal-cycle-store.ts`'s functions
 * already receive it there. Hourly is fine despite the weekly cadence —
 * `isRadarDueThisWeek` asks "who is due now" itself, so an off-cadence hour
 * costs one cheap query per candidate and generates nothing extra, the same
 * reasoning `run-sequences.ts`'s own header gives for every job on it.
 */

import { sql } from "drizzle-orm";
import * as orchestrator from "../orchestrator";
import { parseJsonResponse } from "../json-response";
import { log } from "../logger";
import type { ProfessionalStatus, Pathway } from "./population-tags";

type Db = { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };

/* ── Delivery track (judgment call 1) ───────────────────────────────────── */

export type RadarDeliveryTrack =
  | "undergraduate"
  | "mid_career"
  | "executive"
  | "entrepreneur"
  | "career_returner";

/** Her five delivery_adaptation lines, verbatim from the card. */
export const DELIVERY_ADAPTATION: Record<RadarDeliveryTrack, string> = {
  undergraduate: "Topics oriented toward industry entry, trends in the user's target field.",
  mid_career: "Topics oriented toward thought leadership, industry debates.",
  executive: "Strategic shifts, leadership perspectives.",
  entrepreneur: "Market validation, investor-relevant trends.",
  career_returner: "What changed in the user's field during the gap.",
};

const GENERIC_ADAPTATION =
  "No positioning track is known yet for this user — keep topics generally " +
  "professionally relevant rather than tailored to a career stage.";

export type ResolvedRadarTrack = {
  track: RadarDeliveryTrack | null;
  resolvedBy: string;
};

export function resolveRadarDeliveryTrack(
  status: ProfessionalStatus | null | undefined,
  pathway: Pathway | null | undefined,
): ResolvedRadarTrack {
  if (pathway === "venture" || pathway === "freelance") {
    return { track: "entrepreneur", resolvedBy: "pathway indicates venture/freelance" };
  }
  switch (status) {
    case "undergraduate_or_recent_grad":
      return { track: "undergraduate", resolvedBy: "status" };
    case "early_career":
      return {
        track: "undergraduate",
        resolvedBy: "status=early_career — H-701 has no early_career bucket; defaulted to the closest fit, undergraduate (see file header)",
      };
    case "mid_career_or_senior":
      return {
        track: "mid_career",
        resolvedBy: "status=mid_career_or_senior, defaulted away from executive (see file header, same direction as content-cadence.ts)",
      };
    case "career_break_or_transition":
      return { track: "career_returner", resolvedBy: "status" };
    default:
      return { track: null, resolvedBy: "professional_status not yet captured — using a generic, non-track-specific framing" };
  }
}

function deliveryAdaptationFor(track: RadarDeliveryTrack | null): string {
  return track ? DELIVERY_ADAPTATION[track] : GENERIC_ADAPTATION;
}

/* ── Eligibility: real function or topic area, per H-701's detection_method ─ */

export type RadarEligibility = {
  eligible: boolean;
  primaryFunction: string | null;
  topicArea: string | null;
  reason: string;
};

/** Foundation 1's `functional_identity` artifact — same fallback chain
 *  `engagement.ts` already reads (`primaryFunction ?? lockedFunction`). */
async function primaryFunctionFor(db: Db, studentId: number): Promise<string | null> {
  const r = await db.execute(sql`
    SELECT sa."content"
    FROM "wing"."session_artifacts" sa
    JOIN "wing"."sessions" s ON s."id" = sa."session_id"
    WHERE s."student_id" = ${studentId}
      AND s."session_type" = 'foundation_1'
      AND s."status" = 'completed'
      AND sa."artifact_type" = 'functional_identity'
    ORDER BY sa."version" DESC
    LIMIT 1
  `);
  const content = r.rows?.[0]?.content as Record<string, unknown> | undefined;
  const value = (content?.primaryFunction ?? content?.lockedFunction ?? null) as string | null;
  return value && String(value).trim() ? String(value).trim() : null;
}

/** Intake Q5.5 — "one topic they own well enough to talk about unprepared,"
 *  per `intake-beats.ts`'s own comment naming this as feeding Radar. */
async function topicAreaFor(db: Db, studentId: number): Promise<string | null> {
  const r = await db.execute(sql`
    SELECT "structured_responses"
    FROM "wing"."intake_records"
    WHERE "student_id" = ${studentId}
    LIMIT 1
  `);
  const structured = r.rows?.[0]?.structured_responses as Record<string, any> | undefined;
  const value = structured?.brandingIntake?.responses?.["Q5.5"] as string | undefined;
  return value && value.trim() ? value.trim() : null;
}

export async function radarEligibility(db: Db, studentId: number): Promise<RadarEligibility> {
  const [primaryFunction, topicArea] = await Promise.all([
    primaryFunctionFor(db, studentId),
    topicAreaFor(db, studentId),
  ]);
  const eligible = Boolean(primaryFunction || topicArea);
  return {
    eligible,
    primaryFunction,
    topicArea,
    reason: eligible
      ? `has ${primaryFunction ? "a Foundation 1 function" : ""}${primaryFunction && topicArea ? " and " : ""}${topicArea ? "a Q5.5 topic area" : ""}`
      : "Radar is dormant: no Foundation 1 function and no Q5.5 topic area yet",
  };
}

/* ── Weekly cadence (judgment call 2) ───────────────────────────────────── */

export type RadarDueCheck = { due: boolean; reason: string };

/** `max(generated_at)` per student is the cursor — see the schema doc comment
 *  on why there's no separate `last_run_at` column. */
export async function isRadarDueThisWeek(
  db: Db,
  studentId: number,
  now = Date.now(),
): Promise<RadarDueCheck> {
  const r = await db.execute(sql`
    SELECT max("generated_at") AS "at"
    FROM "wing"."radar_suggestions"
    WHERE "student_id" = ${studentId}
  `);
  const last = r.rows?.[0]?.at as string | null | undefined;
  if (!last) return { due: true, reason: "no Radar generation on record for this student" };

  const days = Math.floor((now - new Date(last).getTime()) / (24 * 60 * 60 * 1000));
  if (days >= 7) return { due: true, reason: `${days}d since the last generation` };
  return { due: false, reason: `${days}d since the last generation — weekly cadence not yet due` };
}

/* ── The model call ──────────────────────────────────────────────────────── */

export type GeneratedTopic = {
  topic: string;
  whyRelevant: string;
  suggestedAction: "comment" | "post" | "save_for_later";
};

const ACTIONS = new Set(["comment", "post", "save_for_later"]);

function systemPrompt(track: RadarDeliveryTrack | null): string {
  return `You are Wing's Baby Radar — a weekly topic-suggestion feature, not a search engine.
You do not have access to real news, feeds, or current events. You generate topic
SUGGESTIONS from what you already know about this user's professional positioning,
framed as things they could plausibly have a perspective on.

DELIVERY ADAPTATION FOR THIS USER:
${deliveryAdaptationFor(track)}

WHAT TO PRODUCE
3 to 5 topic suggestions. Each one:
- names a topic area or theme (not a specific real headline — you cannot verify
  one exists), described generally enough that it stays true regardless of the
  day this runs
- states in one sentence why it's relevant to THIS user's function/positioning
- suggests one action: "comment" (something to engage with), "post" (something
  to write about), or "save_for_later" (worth having in mind, not urgent)

WHAT YOU MUST NOT DO (IG-U006, IG-U017)
Never claim a specific real event, article, or person exists — you cannot verify
this and a fabricated citation is worse than a general topic. Never use
competitive-pressure or fear framing ("everyone else is already talking about
this"). Wing does not write the content — only surfaces the opportunity.

OUTPUT — JSON only, no prose around it:
{ "topics": [ { "topic": string, "whyRelevant": string, "suggestedAction": "comment" | "post" | "save_for_later" } ] }`;
}

function userPrompt(input: { primaryFunction: string | null; topicArea: string | null }): string {
  const lines: string[] = [];
  if (input.primaryFunction) lines.push(`Their function (from Foundation 1): ${input.primaryFunction}`);
  if (input.topicArea) lines.push(`A topic they can speak to unprepared (from intake): ${input.topicArea}`);
  return lines.join("\n");
}

/**
 * Validates and normalizes the model's JSON. Drops individual malformed
 * entries rather than rejecting the whole batch — H-701 asks for "3-5," not
 * "exactly N," so a batch of 4 good entries plus 1 malformed one is still a
 * usable week. Throws only when nothing usable survives.
 */
export function parseRadarResponse(raw: string): GeneratedTopic[] {
  const parsed = parseJsonResponse<{ topics?: unknown }>(raw, "Baby Radar topics");
  const list = Array.isArray(parsed.topics) ? parsed.topics : [];

  const topics: GeneratedTopic[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const topic = typeof e.topic === "string" ? e.topic.trim() : "";
    const whyRelevant = typeof e.whyRelevant === "string" ? e.whyRelevant.trim() : "";
    const suggestedAction = typeof e.suggestedAction === "string" ? e.suggestedAction : "";
    if (!topic || !whyRelevant || !ACTIONS.has(suggestedAction)) continue;
    topics.push({ topic, whyRelevant, suggestedAction: suggestedAction as GeneratedTopic["suggestedAction"] });
    if (topics.length === 5) break; // "3-5" is a ceiling too
  }

  if (topics.length === 0) {
    throw new Error(`Baby Radar produced no usable topics from: ${raw.slice(0, 200)}`);
  }
  return topics;
}

async function writeSuggestions(db: Db, studentId: number, topics: GeneratedTopic[]): Promise<void> {
  for (const t of topics) {
    await db.execute(sql`
      INSERT INTO "wing"."radar_suggestions"
        ("student_id", "topic", "why_relevant", "suggested_action")
      VALUES
        (${studentId}, ${t.topic}, ${t.whyRelevant}, ${t.suggestedAction})
    `);
  }
}

export type RadarGenerationResult =
  | { generated: true; topics: GeneratedTopic[]; track: RadarDeliveryTrack | null }
  | { generated: false; reason: string };

/**
 * The whole card, one call: eligibility (dormant if neither signal exists) →
 * weekly cadence → the model call → validated, stored suggestions.
 *
 * `statusAndPathway` is caller-supplied rather than queried here — every other
 * file in this session's content-trigger layer that needs
 * `professional_status`/`pathway` (`content-trigger-integration.ts`) queries it
 * itself; duplicating that same three-table join a third time bought nothing,
 * so this takes it as an argument instead.
 */
export async function generateRadarSuggestions(
  db: Db,
  studentId: number,
  statusAndPathway: { status: ProfessionalStatus | null; pathway: Pathway | null },
  now = Date.now(),
): Promise<RadarGenerationResult> {
  const eligibility = await radarEligibility(db, studentId);
  if (!eligibility.eligible) {
    return { generated: false, reason: eligibility.reason };
  }

  const due = await isRadarDueThisWeek(db, studentId, now);
  if (!due.due) {
    return { generated: false, reason: due.reason };
  }

  const { track } = resolveRadarDeliveryTrack(statusAndPathway.status, statusAndPathway.pathway);

  const result = await orchestrator.complete({
    tier: "mid", // matches "daily prompts... content drafts" in orchestrator's own tier guidance
    system: systemPrompt(track),
    maxTokens: 800,
    temperature: 0.8,
    messages: [{ role: "user", content: userPrompt(eligibility) }],
  });

  const topics = parseRadarResponse(result.text);
  await writeSuggestions(db, studentId, topics);

  return { generated: true, topics, track };
}

/* ── Engagement (H-701's success_criteria) ──────────────────────────────── */

export async function recordRadarEngagement(
  db: Db,
  suggestionId: number,
  now = Date.now(),
): Promise<void> {
  await db.execute(sql`
    UPDATE "wing"."radar_suggestions"
    SET "engaged_at" = ${new Date(now).toISOString()}
    WHERE "id" = ${suggestionId} AND "engaged_at" IS NULL
  `);
}

/** H-701 success_criteria: at least one engaged suggestion in the last 30 days. */
export async function radarEngagedThisMonth(db: Db, studentId: number, now = Date.now()): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT 1
    FROM "wing"."radar_suggestions"
    WHERE "student_id" = ${studentId}
      AND "engaged_at" IS NOT NULL
      AND "engaged_at" >= ${new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()}
    LIMIT 1
  `);
  return (r.rows?.length ?? 0) > 0;
}

/* ── Listing a student's current batch (the GET route) ──────────────────── */

export type RadarSuggestionRow = {
  id: number;
  topic: string;
  whyRelevant: string;
  suggestedAction: GeneratedTopic["suggestedAction"];
  generatedAt: string;
  engagedAt: string | null;
};

/**
 * A student's current batch of suggestions, for the dashboard card.
 *
 * There's no batch-id column — `writeSuggestions` inserts each topic as its
 * own row with its own `now()` default, so the rows from one generation
 * don't share an exact timestamp and can't be grouped by it. A 7-day rolling
 * window on `generated_at` is used instead, matching `isRadarDueThisWeek`'s
 * own cadence exactly: whatever was generated within the same window that
 * function would call "not due yet" is the batch a student should still be
 * shown.
 *
 * Judgment call: if a run lands late, a student could briefly see two
 * overlapping weeks of suggestions rather than a hard cutoff at N rows —
 * reasonable for a feature with no batch identity, and safer than picking
 * one arbitrary generation to show and silently dropping the rest.
 */
export async function currentRadarSuggestions(
  db: Db,
  studentId: number,
  now = Date.now(),
): Promise<RadarSuggestionRow[]> {
  const since = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const r = await db.execute(sql`
    SELECT "id", "topic", "why_relevant", "suggested_action", "generated_at", "engaged_at"
    FROM "wing"."radar_suggestions"
    WHERE "student_id" = ${studentId} AND "generated_at" >= ${since}
    ORDER BY "generated_at" DESC
  `);
  return (r.rows ?? []).map((row) => ({
    id: Number(row.id),
    topic: String(row.topic),
    whyRelevant: String(row.why_relevant),
    suggestedAction: row.suggested_action as GeneratedTopic["suggestedAction"],
    generatedAt: new Date(row.generated_at as string).toISOString(),
    engagedAt: row.engaged_at ? new Date(row.engaged_at as string).toISOString() : null,
  }));
}

/* ── The weekly runner (H-701's cron entry point) ───────────────────────── */

/** Same join `content-trigger-integration.ts`'s `studentStatusAndPathway` uses —
 *  duplicated rather than imported, per this file's own stated convention of a
 *  small repeated query over a cross-file dependency (see file header). */
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

/**
 * Students worth asking `radarEligibility`/`isRadarDueThisWeek` about at all.
 *
 * Deliberately broad — those two functions do the real, cheap narrowing per
 * student (a Foundation 1 function or a Q5.5 answer; the weekly interval), so
 * this only needs to exclude the one enrollment state where generating more
 * suggestions is clearly wrong: `withdrawn`. `prospective` students are kept
 * in rather than assumed to never have a Q5.5 answer on file — most will
 * simply read as dormant, at the cost of one extra cheap query each. Nothing
 * in H-701 states this filter either way; flagged the same way this file's
 * other two judgment calls are (see header).
 */
async function candidateStudentIds(db: Db): Promise<number[]> {
  const r = await db.execute(sql`
    SELECT "id" FROM "wing"."students" WHERE "enrollment_status" <> 'withdrawn'
  `);
  return (r.rows ?? [])
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id));
}

export type RadarRunResult = {
  candidates: number;
  generated: number;
  /** Considered and correctly not generated — not eligible yet, or not due this week. */
  skipped: number;
  failed: number;
};

/**
 * Runs Baby Radar for every candidate student once. Meant for the hourly
 * `run-sequences.ts` job — see the file header for why this takes `db` rather
 * than importing it, and why hourly is fine for a weekly cadence.
 */
export async function runDueRadarSuggestions(db: Db, now: number = Date.now()): Promise<RadarRunResult> {
  const result: RadarRunResult = { candidates: 0, generated: 0, skipped: 0, failed: 0 };

  const candidates = await candidateStudentIds(db);
  result.candidates = candidates.length;

  for (const studentId of candidates) {
    try {
      const statusAndPathway = await studentStatusAndPathway(db, studentId);
      const outcome = await generateRadarSuggestions(db, studentId, statusAndPathway, now);
      if (outcome.generated) {
        result.generated++;
      } else {
        result.skipped++;
      }
    } catch (err) {
      result.failed++;
      log(`Baby Radar failed for student ${studentId}: ${(err as Error).message}`, "baby-radar");
    }
  }

  if (result.failed) {
    throw new Error(
      `${result.failed} of ${result.candidates} Baby Radar generation(s) failed — see the baby-radar log`,
    );
  }

  return result;
}

/**
 * H-625 (Content Suggestion Cadence) + IG-M6-02 (Content Suggestion Timing).
 *
 * Pure — no imports, no database. Takes the counts and flags a caller has already
 * gathered and returns whether a content suggestion is due, per the timing rules
 * `Wing_Content_System_v1.md` specifies. Mirrors `audience-track.ts`'s own
 * design note: this is a grammar (a table plus a handful of override rules), so
 * it's a function, not a model call.
 *
 * ── WHERE B2 WOULD HAVE BEEN ────────────────────────────────────────────────
 * Two of H-625's eight track rows (undergraduate, career_returner) are split by
 * self-reported B2 in the source document — a low band gets a slower cadence and
 * comments only, a high band gets a faster cadence and posts. That's IG-U014's
 * exact problem one card over from H-626: self-report gating a coaching decision
 * (how OFTEN to coach, here, rather than WHETHER to). So both bands are keyed on
 * `behavioral_content_comfort` (`established`/`confident` = the high band,
 * `unestablished`/`emerging` = the low band) instead — consistent with how
 * `content-progression.ts` reads H-626, not a separate decision.
 */

import type { ProfessionalStatus, Pathway } from "./population-tags";
import type { BehavioralContentComfort } from "./behavioral-content-comfort";

export type CadenceTrack =
  | "undergraduate"
  | "early_career"
  | "mid_career"
  | "executive"
  | "entrepreneur_early"
  | "entrepreneur_fundraising"
  | "entrepreneur_scaling"
  | "career_returner";

export type CadenceBand = { minDays: number; maxDays: number };

/** The most conservative (least frequent) band in the table, used when a
 *  student's track cannot be resolved at all — see `resolveCadenceTrack`. */
export const FALLBACK_BAND: CadenceBand = { minDays: 21, maxDays: 30 };

const SINGLE_BAND: Partial<Record<CadenceTrack, CadenceBand>> = {
  early_career: { minDays: 7, maxDays: 10 },
  mid_career: { minDays: 10, maxDays: 14 },
  executive: { minDays: 21, maxDays: 30 },
  entrepreneur_early: { minDays: 5, maxDays: 7 },
  entrepreneur_fundraising: { minDays: 5, maxDays: 7 },
  entrepreneur_scaling: { minDays: 7, maxDays: 10 },
};

/** The two tracks H-625 splits by comfort (originally B2 — see file header). */
const SPLIT_BAND: Partial<Record<CadenceTrack, { low: CadenceBand; high: CadenceBand }>> = {
  undergraduate: { low: { minDays: 10, maxDays: 14 }, high: { minDays: 7, maxDays: 10 } },
  career_returner: { low: { minDays: 14, maxDays: 21 }, high: { minDays: 10, maxDays: 14 } },
};

function comfortIsHigh(comfort: BehavioralContentComfort): boolean {
  return comfort === "established" || comfort === "confident";
}

export function bandFor(track: CadenceTrack, comfort: BehavioralContentComfort): CadenceBand {
  const split = SPLIT_BAND[track];
  if (split) return comfortIsHigh(comfort) ? split.high : split.low;
  return SINGLE_BAND[track] ?? FALLBACK_BAND;
}

export type ResolvedTrack = {
  track: CadenceTrack | null;
  /** Why this track (or `null`) was chosen — surfaced for review, not just for
   *  debugging, since two of the branches below are judgment calls the
   *  platform's stored data can't actually resolve. Deliberately does NOT
   *  return a band: `undergraduate` and `career_returner` are split by
   *  `behavioral_content_comfort` (see file header), which this function
   *  doesn't receive — call `bandFor(track, comfort)` for that, same as
   *  `isSuggestionDue` does internally. */
  resolvedBy: string;
};

/**
 * Resolves a student's cadence track from the same two stored fields
 * `population-tags.ts` uses for card filtering — `professional_status` and
 * `intake_records.pathway`. Unlike card filtering, cadence needs exactly ONE
 * track (a student can't be suggested content on two different schedules at
 * once), so the two places `population-tags.ts` deliberately returns multiple
 * plausible tags need a tie-break here that it didn't need to make.
 */
export function resolveCadenceTrack(
  status: ProfessionalStatus | null | undefined,
  pathway: Pathway | null | undefined,
): ResolvedTrack {
  // Entrepreneur pathway takes priority — H-625 has no cadence row for someone
  // building a venture that isn't one of the three entrepreneur rows.
  if (pathway === "venture" || pathway === "freelance") {
    /*
     * `population-tags.ts` can't distinguish entrepreneur stage either
     * ("nothing in the platform can distinguish a pivot from an advancement" —
     * same limitation, one level down, for funding stage) — it resolves this by
     * emitting all three stage tags and letting each card's own signal
     * discriminate. Cadence has no signal to discriminate with, so this
     * defaults to entrepreneur_early rather than leaving cadence unresolved.
     *
     * entrepreneur_early is the most common state for a student who has just
     * started Wing, and among the three stage cadences it's tied for the most
     * frequent (5–7 days) rather than the least — which is the safe direction
     * to be wrong in, given H-625's own "the cadence is a ceiling, not a
     * quota... a cadence check that fires with no specific material to offer
     * produces nothing" (IG-M6-04): a too-frequent DUE check costs nothing by
     * itself if a detector then has nothing specific to suggest.
     *
     * Worth Danielle's/Aditya's confirmation once intake captures stage — her
     * Q2 already asks for it, per population-tags.ts — rather than staying a
     * permanent guess.
     */
    return {
      track: "entrepreneur_early",
      resolvedBy: "pathway indicates venture/freelance; stage unknown, defaulted to entrepreneur_early (see comment)",
    };
  }

  switch (status) {
    case "undergraduate_or_recent_grad":
      return { track: "undergraduate", resolvedBy: "status" };
    case "early_career":
      return { track: "early_career", resolvedBy: "status" };
    case "mid_career_or_senior":
      /*
       * Same ambiguity `population-tags.ts` documents for card filtering: the
       * stored value doesn't distinguish mid_career from executive, and that
       * file leans wide (includes both) because a card shown in the wrong
       * register costs little. Cadence can't lean wide — it has to pick one —
       * so this defaults to mid_career, the direction `population-tags.ts`
       * itself treats as the default (executive there requires stronger
       * confirmation: "of the 53 seeded cards only five fire for a single
       * population" and executive is one of the two rare ones).
       */
      return {
        track: "mid_career",
        resolvedBy: "status=mid_career_or_senior, defaulted away from executive (see comment)",
      };
    case "career_break_or_transition":
      return { track: "career_returner", resolvedBy: "status" };
    default:
      return {
        track: null,
        resolvedBy: "professional_status not yet captured — fell back to the most conservative band",
      };
  }
}

export type CadenceCheckInput = {
  track: CadenceTrack | null;
  comfort: BehavioralContentComfort;
  /** Null = no suggestion has ever been made to this student. */
  daysSinceLastSuggestion: number | null;
  /** Null = no content action on record. */
  daysSinceLastUserContentAction: number | null;
  /** Consecutive declines, most recent first. H-625's failure_path triggers at 3. */
  declineStreak: number;
  /** IG-M6-02: a platform-wide suppression state (safety concern, crisis
   *  detection) — checked first and always wins. */
  platformSuppressed: boolean;
  /**
   * "If user just published, wait for engagement data before suggesting next
   * action" (H-625). Not wired to a real signal yet — nothing in
   * `content_activity_log` currently records that engagement data has come
   * back for a published item, so this always defaults to `false` unless a
   * caller supplies it. Documented here rather than silently ignored so the
   * gap doesn't get lost.
   */
  awaitingEngagementData?: boolean;
};

export type CadenceCheckResult = {
  due: boolean;
  reason: string;
  /** True once the decline streak has reached 3 — H-625's failure_path pauses
   *  suggestions for 30 days and re-enters with a meta-question, rather than
   *  simply extending the interval like a streak of 2 does. */
  pausedByDeclineStreak: boolean;
  /** The band actually applied, after the decline-streak extension. */
  effectiveBand: CadenceBand;
};

export function isSuggestionDue(input: CadenceCheckInput): CadenceCheckResult {
  const baseBand = input.track
    ? bandFor(input.track, input.comfort)
    : FALLBACK_BAND;

  if (input.platformSuppressed) {
    return {
      due: false,
      reason: "platform-wide suppression is active (IG-M6-02) — no content suggestion may fire",
      pausedByDeclineStreak: false,
      effectiveBand: baseBand,
    };
  }

  if (input.declineStreak >= 3) {
    return {
      due: false,
      reason: "decline streak reached 3 — H-625 pauses content suggestions for 30 days, then re-enters with a meta-question",
      pausedByDeclineStreak: true,
      effectiveBand: baseBand,
    };
  }

  // "If user declined last 2 suggestions, extend the interval by 50%."
  const extended = input.declineStreak >= 2;
  const effectiveBand: CadenceBand = extended
    ? { minDays: Math.ceil(baseBand.minDays * 1.5), maxDays: Math.ceil(baseBand.maxDays * 1.5) }
    : baseBand;

  // IG-M6-02's absolute floor, regardless of track or extension.
  const minDays = Math.max(effectiveBand.minDays, 3);

  if (input.awaitingEngagementData) {
    return {
      due: false,
      reason: "waiting for engagement data on a just-published item before suggesting the next action",
      pausedByDeclineStreak: false,
      effectiveBand,
    };
  }

  if (
    input.daysSinceLastUserContentAction !== null &&
    input.daysSinceLastUserContentAction < 3
  ) {
    return {
      due: false,
      reason: `last content action was ${input.daysSinceLastUserContentAction}d ago — suppressed, minimum 3 days`,
      pausedByDeclineStreak: false,
      effectiveBand,
    };
  }

  if (input.daysSinceLastSuggestion === null) {
    return {
      due: true,
      reason: "no suggestion has been made to this student yet",
      pausedByDeclineStreak: false,
      effectiveBand,
    };
  }

  if (input.daysSinceLastSuggestion < minDays) {
    return {
      due: false,
      reason: `${input.daysSinceLastSuggestion}d since last suggestion; ${input.track ?? "fallback"} band requires ${minDays}d${extended ? " (extended 50% for a 2-decline streak)" : ""}`,
      pausedByDeclineStreak: false,
      effectiveBand,
    };
  }

  return {
    due: true,
    reason: `${input.daysSinceLastSuggestion}d since last suggestion, meets the ${minDays}d band`,
    pausedByDeclineStreak: false,
    effectiveBand,
  };
}

/**
 * H-625's separate cap for DM and connection-request suggestions: "maximum 1
 * DM + 1 connection request per 14 days," independent of the content cadence
 * above and allowed to co-occur with it.
 */
export type OutreachCheckInput = {
  kind: "dm" | "connection_request";
  /** How many of THIS kind were suggested in the last 14 days. */
  suggestedInLast14Days: number;
  platformSuppressed: boolean;
};

export function isOutreachSuggestionDue(input: OutreachCheckInput): CadenceCheckResult {
  const band: CadenceBand = { minDays: 14, maxDays: 14 };
  if (input.platformSuppressed) {
    return {
      due: false,
      reason: "platform-wide suppression is active (IG-M6-02)",
      pausedByDeclineStreak: false,
      effectiveBand: band,
    };
  }
  if (input.suggestedInLast14Days >= 1) {
    return {
      due: false,
      reason: `already suggested a ${input.kind} in the last 14 days (H-625 cap: 1 per 14 days)`,
      pausedByDeclineStreak: false,
      effectiveBand: band,
    };
  }
  return {
    due: true,
    reason: `no ${input.kind} suggested in the last 14 days`,
    pausedByDeclineStreak: false,
    effectiveBand: band,
  };
}

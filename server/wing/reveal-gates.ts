/**
 * The Reveal Cycle's three gates, as pure functions.
 *
 * ── WHY THESE ARE WRITTEN OUT RATHER THAN SUMMARISED ─────────────────────
 * Gate 2 has five conditions. The Reveal Cycle Amendments describe it as "four Tier 1
 * events, three signal categories" — two of the five — and that summary is the version
 * most likely to be read, because it is shorter and it arrived later. An implementation
 * built from it under-gates: it would fire a Reveal on four Tier 1 events from a single
 * channel in a single week, with nothing quotable in them.
 *
 * That is not a small miss. The whole design rests on scarcity — "a Reveal that fires
 * often stops being an event and becomes a weekly digest" — and on the null Reveal
 * being "permitted and protected", because "a monthly cadence creates structural
 * pressure to produce an insight whether or not one exists. That pressure is the Barnum
 * generator." The gates are the thing standing between the cadence and the pressure.
 *
 * So each condition is named, counted and reported separately, and a verdict says which
 * ones failed rather than returning a boolean. Whoever wires this to a scheduler should
 * be able to read why a month produced nothing.
 *
 * Nothing here schedules, stores or delivers anything. The Reveal Cycle is not built;
 * these are its rules, tested, waiting for it.
 */
import {
  type EvidenceEvent,
  type EvidenceTier,
  type SignalCategory,
  isQuoteProductive,
} from "./reveal-evidence";

const DAY = 24 * 60 * 60 * 1000;

export type Condition = {
  /** Short, stable, loggable. */
  name: string;
  met: boolean;
  /** What was measured against what was required. */
  detail: string;
};

export type GateVerdict = {
  passed: boolean;
  conditions: Condition[];
  /** Names of the conditions that failed, for a log line. */
  failed: string[];
};

function verdict(conditions: Condition[]): GateVerdict {
  const failed: string[] = [];
  for (const c of conditions) if (!c.met) failed.push(c.name);
  return { passed: failed.length === 0, conditions, failed };
}

/* ── Gate 1 — eligibility floor ─────────────────────────────────────────── */

/** v4 §5, Gate 1: "If IG-S01 fired within the trailing 7 days, no Reveal fires." */
export const SAFETY_HOLD_DAYS = 7;
/** "At least 14 days since the last Reveal of any kind, including null and thin." */
export const REVEAL_FLOOR_DAYS = 14;

export type Gate1Input = {
  /** "Foundation 1 complete. A stored SLI must exist for behavior to be read against." */
  foundation1Complete: boolean;
  /** Null when no Reveal has ever fired — which satisfies the floor rather than failing it. */
  daysSinceLastReveal: number | null;
  /** Days since IG-S01 last fired, or null if it never has. */
  daysSinceCrisisFlag: number | null;
};

export function gate1(input: Gate1Input): GateVerdict {
  const since = input.daysSinceLastReveal;
  const crisis = input.daysSinceCrisisFlag;

  return verdict([
    {
      name: "foundation_1_complete",
      met: input.foundation1Complete,
      detail: input.foundation1Complete
        ? "stored SLI exists"
        : "no stored SLI — nothing to read behaviour against",
    },
    {
      name: "reveal_floor",
      met: since === null || since >= REVEAL_FLOOR_DAYS,
      detail:
        since === null
          ? "no previous Reveal"
          : `${since}d since the last Reveal of any kind, floor ${REVEAL_FLOOR_DAYS}d`,
    },
    {
      /*
       * The hold covers null and thin Reveals as well, which is why the input is "days
       * since the last Reveal of any kind" rather than "since the last delivered one".
       * A null Reveal is a successful cycle, and it resets the floor like any other.
       */
      name: "no_safety_hold",
      met: crisis === null || crisis > SAFETY_HOLD_DAYS,
      detail:
        crisis === null
          ? "no crisis flag on record"
          : `crisis language ${crisis}d ago, hold is ${SAFETY_HOLD_DAYS}d`,
    },
  ]);
}

/* ── Gate 2 — data sufficiency ──────────────────────────────────────────── */

/**
 * v4 §5, Gate 2, "measured since the last Reveal. All five required."
 *
 * The Tier 1 minimum carries its own derivation, recorded because it is the only
 * threshold in the document that is argued rather than asserted: "The Tier 1 minimum of
 * 4 derives from H-001, which requires three instances across two contexts before Wing
 * may use pattern language, plus one margin for an instance that fails verification at
 * delivery."
 */
export const GATE2 = {
  tier1Events: 4,
  quoteProductive: 4,
  distinctCategories: 3,
  totalEvents: 8,
  distinctChannels: 3,
  recentEvents: 3,
  recentWindowDays: 14,
} as const;

/**
 * Career returner: v4 §5 is explicit that "thresholds hold at standard level" and that
 * the deferral cap extends instead. There is deliberately no track parameter here — a
 * per-track threshold is the change her sentence forbids, and a function that took a
 * track would invite one.
 */
export function gate2(events: readonly EvidenceEvent[], now: number): GateVerdict {
  let tier1 = 0;
  let quotable = 0;
  const categories: SignalCategory[] = [];
  const channels: string[] = [];
  let recent = 0;
  let recentTier1 = 0;

  const cutoff = now - GATE2.recentWindowDays * DAY;

  for (const e of events) {
    if (e.tier === 1) tier1++;
    if (isQuoteProductive(e.shape)) quotable++;
    if (categories.indexOf(e.category) < 0) categories.push(e.category);
    if (channels.indexOf(e.channel) < 0) channels.push(e.channel);
    if (e.at >= cutoff) {
      recent++;
      if (e.tier === 1) recentTier1++;
    }
  }

  return verdict([
    {
      name: "tier_1_events",
      met: tier1 >= GATE2.tier1Events,
      detail: `${tier1} of ${GATE2.tier1Events} — three instances across two contexts per H-001, plus one margin`,
    },
    {
      name: "quote_productive",
      met: quotable >= GATE2.quoteProductive,
      detail: `${quotable} of ${GATE2.quoteProductive} prose responses`,
    },
    {
      /*
       * "Eight Energy-category responses are a mood log, not cross-module material."
       * The condition exists because four categories are 71% of the universal pool, so
       * uniform sampling produces category-clustered months as a matter of course.
       */
      name: "category_spread",
      met: categories.length >= GATE2.distinctCategories,
      detail: `${categories.length} of ${GATE2.distinctCategories} distinct categories (${categories.join(", ") || "none"})`,
    },
    {
      name: "total_events",
      met: events.length >= GATE2.totalEvents,
      detail: `${events.length} of ${GATE2.totalEvents} events across all tiers`,
    },
    {
      name: "channel_spread",
      met: channels.length >= GATE2.distinctChannels,
      detail: `${channels.length} of ${GATE2.distinctChannels} distinct channels (${channels.join(", ") || "none"})`,
    },
    {
      /*
       * Her fifth condition is one condition with two parts, and both have to hold: at
       * least 3 events in the trailing 14 days, of which at least 1 is Tier 1. Counting
       * only the events would let a fortnight of trait self-report look like currency.
       */
      name: "recent_activity",
      met: recent >= GATE2.recentEvents && recentTier1 >= 1,
      detail: `${recent} of ${GATE2.recentEvents} events in the trailing ${GATE2.recentWindowDays}d, ${recentTier1} of 1 Tier 1`,
    },
  ]);
}

/* ── Gate 3 — firing condition ──────────────────────────────────────────── */

/** "Day 30, Gates 1 and 2 satisfied." */
export const CADENCE_DAY = 30;
/** "Defers in 7-day increments through day 60, then routes to H-RC10." */
export const DEFERRAL_INCREMENT_DAYS = 7;
export const DEFERRAL_LAST_DAY = 60;
/** Escalation "cannot fire before day 14". */
export const ESCALATION_EARLIEST_DAY = 14;
/** "with at least 2 Tier 1 events on each side" */
export const ESCALATION_TIER1_PER_SIDE = 2;
export const ESCALATION_CHANNELS = 3;

export type Escalation = {
  /** Events that contradict the stored SLI. */
  contradicting: readonly EvidenceEvent[];
  /** Events consistent with it. */
  supporting: readonly EvidenceEvent[];
};

export type Gate3Outcome =
  | { action: "fire"; kind: "cadence" | "escalation"; why: string }
  | { action: "defer"; nextCheckDay: number; why: string }
  | { action: "route"; to: "H-RC10"; why: string }
  | { action: "wait"; why: string };

/**
 * What happens on a given day of the cycle.
 *
 * `dayInCycle` is days since the last Reveal of any kind. The escalation path is
 * checked first because it is the only one that can fire before day 30, and it requires
 * Gate 1 but not Gate 2 — v4 §5 states the requirement as "Requires Gate 1" and says
 * nothing about Gate 2, which is consistent with an escalation being the case where the
 * evidence is loud rather than plentiful.
 */
export function gate3(params: {
  dayInCycle: number;
  gate1: GateVerdict;
  gate2: GateVerdict;
  escalation?: Escalation;
}): Gate3Outcome {
  if (!params.gate1.passed) {
    return { action: "wait", why: `eligibility floor not met: ${params.gate1.failed.join(", ")}` };
  }

  if (params.escalation && params.dayInCycle >= ESCALATION_EARLIEST_DAY) {
    const e = escalationReady(params.escalation);
    if (e.ready) return { action: "fire", kind: "escalation", why: e.why };
  }

  if (params.dayInCycle < CADENCE_DAY) {
    return { action: "wait", why: `day ${params.dayInCycle} of ${CADENCE_DAY}` };
  }

  if (params.gate2.passed) {
    return { action: "fire", kind: "cadence", why: "day 30 reached with data sufficiency met" };
  }

  const next = params.dayInCycle + DEFERRAL_INCREMENT_DAYS;
  if (next > DEFERRAL_LAST_DAY) {
    return {
      action: "route",
      to: "H-RC10",
      why: `deferred to day ${params.dayInCycle} without sufficiency; the next check would fall past day ${DEFERRAL_LAST_DAY}`,
    };
  }
  return {
    action: "defer",
    nextCheckDay: next,
    why: `insufficient data (${params.gate2.failed.join(", ")}); re-check day ${next}`,
  };
}

/**
 * "Convergence across 3 or more channels directly contradicting the stored SLI, with at
 * least 2 Tier 1 events on each side."
 *
 * "Each side" is the contradicting evidence and the stored position it contradicts — an
 * escalation is a disagreement, and one side of it having a single anchor makes it a
 * candidate insight rather than an escalation.
 */
export function escalationReady(e: Escalation): { ready: boolean; why: string } {
  const channels: string[] = [];
  for (const ev of e.contradicting) if (channels.indexOf(ev.channel) < 0) channels.push(ev.channel);
  const against = countTier(e.contradicting, 1);
  const forSli = countTier(e.supporting, 1);

  const ready =
    channels.length >= ESCALATION_CHANNELS &&
    against >= ESCALATION_TIER1_PER_SIDE &&
    forSli >= ESCALATION_TIER1_PER_SIDE;

  return {
    ready,
    why:
      `${channels.length} of ${ESCALATION_CHANNELS} contradicting channels, ` +
      `${against} and ${forSli} Tier 1 events per side of ${ESCALATION_TIER1_PER_SIDE}`,
  };
}

function countTier(events: readonly EvidenceEvent[], tier: EvidenceTier): number {
  let n = 0;
  for (const e of events) if (e.tier === tier) n++;
  return n;
}

/* ── The platform floor underneath all of this ──────────────────────────── */

/**
 * IG-U012, Evidence Grade Classification, promoted platform-wide on 19 August:
 * "Any cross-session observation or synthesis requires at least two Tier 1 events.
 * Single-session coaching can reference Tier 2 and Tier 3 data more freely because it's
 * responding to what just happened, not making a trajectory claim."
 *
 * Here because the Reveal is not the only thing that will need it — Module 8's skills
 * observations, Module 11's networking patterns and the Writing Coach's content themes
 * are all cross-session synthesis, and the Reveal's four is the higher threshold sitting
 * on top of this one, not a replacement for it.
 */
export const PLATFORM_MIN_TIER1 = 2;

export function meetsPlatformMinimum(events: readonly EvidenceEvent[]): boolean {
  return countTier(events, 1) >= PLATFORM_MIN_TIER1;
}

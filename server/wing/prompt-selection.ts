/**
 * Choosing which prompt to send — B2's "rotating, varied".
 *
 * Pure, apart from `cardAppliesTo`. The database read and the send live in the caller;
 * everything that decides lives here, so it can be enumerated rather than observed.
 *
 * ── WHAT SELECTION WAS ───────────────────────────────────────────────────
 * `messaging-store.selectPrompt` filtered on `active`, dropped anything sent in the last
 * 14 days, and picked uniformly at random from what was left. No population filter, no
 * weighting, no cadence, no per-day cap. A student on the executive track could be sent an
 * undergraduate-only prompt, and nothing stopped two prompts going out on one day.
 *
 * ── HER RULES, AND WHERE EACH ONE COMES FROM ─────────────────────────────
 *   "No specific prompt should repeat for the same user within 14 days."   Part 9.2
 *   "Rotation weighting: Roughly 2:1 approachable-to-serious in any
 *    given week."                                     micro-journal library, preamble
 *   "Prompts referencing specific events … are only eligible for delivery
 *    if the user has mentioned the event."                    Integration Notes
 *   IG-MJ05 — maximum one prompt per day.                           Tier 1 scope §2
 *   "Prompt selection should rotate across signal categories … so Wing
 *    captures data across the full behavioral spectrum."            Part 9.2
 *
 * ── THE RULE THAT CANNOT RUN YET, AND SAYS SO ────────────────────────────
 * Category rotation is implemented and inert. Not one prompt in the library carries one of
 * her eight signal categories — they are hers to assign — so the rotation has nothing to
 * rotate across and every candidate scores the same.
 *
 * It is written anyway, and `SelectionResult.categoryRotationActive` reports whether it
 * did anything. A rule that silently does nothing is the failure shape this codebase keeps
 * producing: a surface claiming something is in force when the thing it names is absent.
 * The day she assigns categories, this starts working with no further change, and until
 * then the flag is false and `wing:check-journey` can say so.
 *
 * ── NO FALLBACK TO A REPEAT, AND WHY THAT IS SAFE ────────────────────────
 * The old code fell back to the whole pool when everything had been sent recently —
 * "repeating a prompt beats sending nothing and stalling the sequence". That is right for
 * a scripted sequence and wrong here: the 14-day floor is hers, stated as a rule.
 *
 * It is also unreachable. Her smallest per-student pool is 80 universal + 10 adapted + 15
 * specific = 105 micro-journal prompts, and at IG-MJ05's one per day a 14-day window can
 * exhaust at most 14 of them. The heartbeat pool is 8 per track against a weekly cadence,
 * which reaches the floor after two. So exhaustion means something else is wrong — an
 * empty seed, a population that matches nothing — and returning null with a reason is what
 * makes that visible instead of hiding it behind a repeat.
 */
import { cardAppliesTo } from "./population-tags";

/** The row fields selection reads. A subset of `prompt_library`, so tests need no database. */
export type Candidate = {
  id: number;
  active: boolean;
  populationTags: readonly string[] | null;
  cadence: string | null;
  library: string | null;
  signalCategory: string | null;
  eventSensitive: boolean;
};

export type SelectionContext = {
  /** What `populationTagsFor` resolved this student to. Empty means unknown. */
  studentTags: readonly string[];
  /** Which rhythm is being sent now. */
  cadence: "micro_journal" | "heartbeat" | "synthesis_cycle";
  /** Prompt ids delivered to this student inside the no-repeat window. */
  recentPromptIds: readonly number[];
  /** Signal categories delivered recently, newest first. Empty until she assigns them. */
  recentCategories: readonly string[];
  /** True when a prompt has already gone out to this student today — IG-MJ05. */
  sentToday: boolean;
  /**
   * Events Wing already knows this student attended, from a prior response or a calendar
   * signal. Empty is the safe default: an event-sensitive prompt is then never eligible,
   * which is the direction her rule points.
   */
  knownEvents: readonly string[];
};

export type SelectionResult = {
  /** Null when nothing is eligible. `why` always says what happened. */
  promptId: number | null;
  why: string;
  /** How many survived every filter. Zero with a null id is the interesting case. */
  eligible: number;
  /**
   * Whether the category rotation changed anything. False while the library carries no
   * categories — see the note above. Never assume it ran.
   */
  categoryRotationActive: boolean;
};

/** Her 2:1. The approachable library is twice as likely as the reflective one. */
const POOL_WEIGHT: Readonly<Record<string, number>> = {
  approachable: 2,
  reflective: 1,
};

/**
 * Anything with no pool weighs 1 — the neutral value, not zero.
 *
 * Zero would make her heartbeat prompts unselectable, since they carry no pool: they are a
 * different rhythm rather than one side of the approachable-to-serious ratio. A default of
 * 1 means an unclassified prompt competes normally instead of silently disappearing.
 */
const DEFAULT_WEIGHT = 1;

/** How many recent categories count as "recently covered" for the rotation. */
const CATEGORY_WINDOW = 3;

/**
 * Every prompt this student could be sent right now, in id order.
 *
 * Exposed because "nothing was eligible" needs to be diagnosable — which filter emptied
 * the pool is the question, and a caller with the surviving set can answer it.
 */
export function eligible(
  candidates: readonly Candidate[],
  ctx: SelectionContext,
): Candidate[] {
  const recent = new Set(ctx.recentPromptIds);

  return candidates.filter((c) => {
    if (!c.active) return false;
    if (c.cadence !== ctx.cadence) return false;
    /*
     * Fail-open on tags, matching `cardAppliesTo`: an untagged prompt reaches everyone,
     * and a student we cannot classify sees everything. That is the platform's existing
     * rule and this is not the place to diverge from it.
     */
    if (!cardAppliesTo(c.populationTags, ctx.studentTags)) return false;
    /*
     * Her rule is that an event-sensitive prompt is eligible only where the event is
     * known. With no knowledge of any event, none of them is — which is the whole point:
     * "Never assume the user attended an event they haven't mentioned."
     */
    if (c.eventSensitive && ctx.knownEvents.length === 0) return false;
    if (recent.has(c.id)) return false;
    return true;
  });
}

/**
 * The weight a candidate carries, before the draw.
 *
 * Two multiplied factors rather than a score with tuned coefficients, because there are
 * exactly two rules and both are hers: the pool ratio, and category freshness. A scoring
 * function with weights nobody has ruled on would be a third rule invented here.
 */
export function weightOf(
  c: Candidate,
  recentCategories: readonly string[],
): number {
  const pool = POOL_WEIGHT[c.library ?? ""] ?? DEFAULT_WEIGHT;

  /*
   * "Rotate across signal categories … so Wing captures data across the full behavioral
   * spectrum." A category seen in the last few sends is halved rather than excluded:
   * excluding it would make the rotation a hard cycle, and with eight categories and one
   * prompt a day that becomes predictable inside a fortnight.
   */
  const covered = recentCategories.slice(0, CATEGORY_WINDOW);
  const stale = c.signalCategory !== null && covered.indexOf(c.signalCategory) >= 0;

  return stale ? pool / 2 : pool;
}

/**
 * One prompt, or null with a reason.
 *
 * `random` is injected so the draw is testable. A weighted draw tested against a real
 * `Math.random` either flakes or proves nothing, and the property worth proving — that the
 * approachable pool is drawn about twice as often — needs the sequence to be controllable.
 */
export function selectPrompt(
  candidates: readonly Candidate[],
  ctx: SelectionContext,
  random: () => number = Math.random,
): SelectionResult {
  /*
   * IG-MJ05 first, before anything is filtered. The cap is not about which prompt is best;
   * it is about whether Wing speaks at all today, and checking it last would mean doing the
   * work to choose a prompt that must not be sent.
   */
  if (ctx.sentToday) {
    return {
      promptId: null,
      why: "IG-MJ05: one prompt per day, and one has already gone out",
      eligible: 0,
      categoryRotationActive: false,
    };
  }

  const pool = eligible(candidates, ctx);
  if (!pool.length) {
    return {
      promptId: null,
      why:
        `nothing eligible for ${ctx.cadence} — ${candidates.length} candidate(s), ` +
        `${ctx.recentPromptIds.length} sent inside the window`,
      eligible: 0,
      categoryRotationActive: false,
    };
  }

  const weights = pool.map((c) => weightOf(c, ctx.recentCategories));
  const rotationActive = weights.some((w, i) => w !== weightOf(pool[i], []));

  const total = weights.reduce((a, b) => a + b, 0);
  /*
   * `random()` is [0, 1), so `draw` is [0, total) and the running sum reaches `total` at
   * the last candidate — the loop always returns inside it. The line after exists for the
   * case a caller passes a random that violates the contract, and returns the last
   * candidate rather than undefined.
   */
  const draw = random() * total;

  let running = 0;
  for (let i = 0; i < pool.length; i++) {
    running += weights[i];
    if (draw < running) {
      return {
        promptId: pool[i].id,
        why: `${pool.length} eligible, weight ${weights[i]} of ${total}`,
        eligible: pool.length,
        categoryRotationActive: rotationActive,
      };
    }
  }

  return {
    promptId: pool[pool.length - 1].id,
    why: `${pool.length} eligible, drawn at the boundary`,
    eligible: pool.length,
    categoryRotationActive: rotationActive,
  };
}

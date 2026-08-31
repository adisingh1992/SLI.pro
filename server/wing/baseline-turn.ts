/**
 * What a Phase 3.5 turn does — the decision, separated from the orchestration.
 *
 * `intake-conversation.ts` knows how to talk to a model, persist a turn and record
 * provenance. It should not also know that "I'd say a 2 or a 3" is not a score, that a
 * scale question gets exactly one re-ask, or that the answer to a follow-up must never
 * be parsed as the next baseline. Those are rules, they have edge cases, and rules with
 * edge cases belong somewhere a test can reach them without a database.
 *
 * So this module takes what Wing asked last turn plus what the user just wrote, and
 * returns what to store and what to say. The conversation applies it.
 *
 * ── THE BUG THIS SHAPE EXISTS TO PREVENT ─────────────────────────────────
 * B1 low earns a follow-up: "What trips you up — is it that you don't know, or that
 * you know but can't get it out?" That question is asked on the same turn the score is
 * recorded, so by the time the user answers it, `nextBeat` has already moved on to B2.
 * A naive implementation parses that answer — "I know but I can't get it out" — as B2's
 * score. It contains no digits, so B2 gets a re-ask it did not earn; and if the user
 * had happened to write "I freeze one on one", B2 would silently record a 1.
 *
 * The fix is that Wing remembers what it asked. `_asked` carries the beat, whether the
 * question was a follow-up, and which attempt this is. Everything here reads from it.
 */
import {
  BEATS,
  isComplete,
  nextBeat,
  nextBeatAfter,
  type Beat,
  type PopulationTag,
} from "./intake-beats";
import {
  type Barrier,
  type BaselineRecord,
  bandFor,
  classifyBarrier,
  readScale,
  recordBaseline,
} from "./baselines";

/** What Wing's last reply asked for. Stored in the intake responses as `_asked`. */
export type Asked = {
  /** Beat key. */
  beat: string;
  /** True when the question asked was a follow-up rather than the beat itself. */
  followUp: boolean;
  /** 1 on the first ask, 2 after a re-ask. Nothing is asked a third time. */
  attempt: number;
};

/** One re-ask, then the baseline is stored as declined. Her "if user still resists". */
export const MAX_ATTEMPTS = 2;

export type BaselinePlan =
  /** Not a baseline answer. The model's extraction handles it, as before. */
  | { kind: "none" }
  /** Read, banded, stored. `followUpAsk` is non-null when the band earned one. */
  | {
      kind: "recorded";
      beat: string;
      record: BaselineRecord;
      fields: Record<string, unknown>;
      followUpAsk: string | null;
    }
  /** Unreadable, and we have not asked twice yet. */
  | { kind: "reask"; beat: string; attempt: number; ambiguous: boolean; candidates: number[] }
  /** Unreadable twice. Stored as declined so the conversation can move on. */
  | { kind: "declined"; beat: string; record: BaselineRecord; fields: Record<string, unknown> };

/* ── Reading and writing `_asked` ───────────────────────────────────────── */

/**
 * `_asked` out of the stored responses, defensively.
 *
 * Absent for every intake that started before this field existed, and for the first
 * turn of every intake after it. Both are "we do not know what was asked", which is
 * the same as "do not parse this as a baseline".
 */
export function readAsked(captured: Record<string, unknown>): Asked | null {
  const raw = captured._asked;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.beat !== "string" || !o.beat) return null;
  const attempt = typeof o.attempt === "number" && o.attempt >= 1 ? Math.floor(o.attempt) : 1;
  return { beat: o.beat, followUp: o.followUp === true, attempt };
}

/** What to store as `_asked` after this turn, given what the reply went on to ask. */
export function askedFor(beatKey: string | null, opts?: { followUp?: boolean; attempt?: number }): Asked | null {
  if (!beatKey) return null;
  return {
    beat: beatKey,
    followUp: opts?.followUp === true,
    attempt: opts?.attempt ?? 1,
  };
}

/* ── The beats this module owns ─────────────────────────────────────────── */

function beatByKey(key: string): Beat | null {
  for (const b of BEATS) if (b.key === key) return b;
  return null;
}

/** B1, B2, B3 — the baselines. Phase 1 and 2 questions are Q-numbered. */
export function isBaselineBeat(beat: Beat): boolean {
  return beat.question.charAt(0) === "B";
}

/**
 * The field the score or category is written to.
 *
 * Derived from the beat rather than listed here, so adding a baseline does not mean
 * remembering to update a table in a second file. Every baseline beat carries exactly
 * one `baseline_`-prefixed capture field; the others on those beats
 * (`activity_level`, `visibility_concerns`, `fears`) are the free-text fields the
 * model has always been allowed to fill from any answer, and are not code-owned.
 */
export function baselineField(beat: Beat): string | null {
  for (const c of beat.captures) if (c.indexOf("baseline_") === 0) return c;
  return null;
}

/** Where B3's verbatim goes, in addition to the record. Same derivation. */
export function verbatimField(beat: Beat): string | null {
  for (const c of beat.captures) if (c.indexOf("baseline_") !== 0) return c;
  return null;
}

/**
 * Fields the code owns outright, which the model is never allowed to set.
 *
 * The model sees the scale in the beat opening and will happily return
 * `baseline_positioning_clarity: "quite low"` — a string, in a field that carries a
 * number into an institutional metric. `sanitiseExtracted` drops these on the strength
 * of this prefix.
 */
export function isCodeOwnedField(key: string): boolean {
  return key.indexOf("baseline_") === 0;
}

/* ── The plan ───────────────────────────────────────────────────────────── */

/**
 * What this message means, given what was asked.
 *
 * The order of the guards is the whole function:
 *
 *   1. Nothing asked, or the asked beat is not a baseline → not ours.
 *   2. A follow-up was asked → free text, not a score. This is the guard the module
 *      exists for.
 *   3. B3 → classify, always record. Even `unknown` is a record, because her spec
 *      keeps the verbatim and the verbatim is the part H-602 branches on.
 *   4. A scale → read it. Unreadable once re-asks, unreadable twice declines.
 */
export function planBaselineTurn(params: {
  asked: Asked | null;
  text: string;
}): BaselinePlan {
  const asked = params.asked;
  if (!asked) return { kind: "none" };

  const beat = beatByKey(asked.beat);
  if (!beat || !isBaselineBeat(beat)) return { kind: "none" };

  if (asked.followUp) return { kind: "none" };

  const field = baselineField(beat);
  if (!field) return { kind: "none" };

  const text = params.text;

  if (beat.answer === "text") {
    const record = recordBaseline(
      { question: beat.question as "B1" | "B2" | "B3", answer: "text", followUps: beat.followUps },
      text,
    );
    const fields: Record<string, unknown> = {};
    fields[field] = record.barrier as Barrier;
    const vf = verbatimField(beat);
    if (vf) fields[vf] = text;
    return { kind: "recorded", beat: beat.key, record, fields, followUpAsk: record.followUp };
  }

  const reading = readScale(text);

  if (reading.score === null) {
    if (asked.attempt < MAX_ATTEMPTS) {
      return {
        kind: "reask",
        beat: beat.key,
        attempt: asked.attempt + 1,
        ambiguous: reading.ambiguous,
        candidates: reading.candidates,
      };
    }
    /*
     * Asked twice, still no number. Stored as declined rather than left empty: an
     * empty field leaves the beat unsatisfied, so `nextBeat` returns B1 again and Wing
     * asks a third time — which is the loop her "if user still resists → skip" is
     * written to prevent.
     */
    const record = recordBaseline(
      { question: beat.question as "B1" | "B2" | "B3", answer: "scale_1_5", followUps: beat.followUps },
      text,
      { declined: true },
    );
    const fields: Record<string, unknown> = {};
    fields[field] = "declined";
    return { kind: "declined", beat: beat.key, record, fields };
  }

  const record = recordBaseline(
    { question: beat.question as "B1" | "B2" | "B3", answer: "scale_1_5", followUps: beat.followUps },
    text,
  );
  const fields: Record<string, unknown> = {};
  fields[field] = reading.score;
  return { kind: "recorded", beat: beat.key, record, fields, followUpAsk: record.followUp };
}

/**
 * The band a plan landed in, for the log line. Null for B3, declines and re-asks.
 */
export function bandOf(plan: BaselinePlan): "low" | "high" | null {
  if (plan.kind !== "recorded") return null;
  return plan.record.score === null ? null : bandFor(plan.record.score);
}

/* ── What Wing says next ────────────────────────────────────────────────── */

/**
 * The THIS TURN block for a baseline turn, or null when there is nothing special to
 * say and the ordinary next-beat instruction should stand.
 *
 * These are instructions to the model, not copy. The one place copy is quoted — the
 * follow-up — is quoted because it is Danielle's wording and the model is told to
 * rephrase it to fit, exactly as it is for a beat opening.
 */
export function renderBaselineGuidance(plan: BaselinePlan): string | null {
  if (plan.kind === "reask") {
    const which = plan.ambiguous
      ? `They named more than one number (${plan.candidates.join(" and ")}). Ask which one it is.`
      : `They answered, but not with a number.`;
    return `── THIS TURN: ASK FOR THE NUMBER ONCE MORE ──────────────────────────────
${which}

Ask again in one short line. Do not re-explain the scale, do not justify the
question, and do not ask anything else this turn. Make it easy to pass on:
they can say "skip" and you will move straight on.

This is the only time you ask again. If they still don't give a number, that is
a fine answer and you move on without remarking on it.`;
  }

  if (plan.kind === "declined") {
    return `── THIS TURN: THEY'VE PASSED ON THAT ONE ────────────────────────────────
Move straight to the next question. Do not acknowledge the skip, do not
apologise for asking, and do not offer to come back to it.`;
  }

  if (plan.kind === "recorded" && plan.followUpAsk) {
    return `── THIS TURN: ONE FOLLOW-UP, THEN STOP ──────────────────────────────────
Ask this, and only this. Rephrase it to fit what they just said — do not recite
it:

"${plan.followUpAsk}"

Do not ask the next question after it. Do not summarise their rating back at
them. One question, and wait — and this rule holds on the turn AFTER they
answer it, too: once they've answered this follow-up, do not ask a second one
of your own even if their answer raises something interesting. The beat after
this one is a separate turn, not this one.`;
  }

  return null;
}

/* ── The whole turn ─────────────────────────────────────────────────────── */

export type TurnPlan = {
  baseline: BaselinePlan;
  /** `captured` with anything this turn banked folded in, for the prompt and the gates. */
  captured: Record<string, unknown>;
  /** Fields to persist before the model call. Empty on most turns. */
  fields: Record<string, unknown>;
  /** The Layer 1 record to append, with the beat it belongs to. Null on most turns. */
  record: { entry: BaselineRecord; beat: string } | null;
  /** The beat this reply should ask. Null on a follow-up turn and at the close. */
  beat: Beat | null;
  /** The beat the user's message just answered — what the self-description capture means. */
  answeredBeat: string | null;
  /** The THIS TURN block, or null to leave the ordinary beat instruction standing. */
  guidance: string | null;
  /** True when the guidance IS the question, so no beat may be rendered beside it. */
  suppressBeat: boolean;
  wrapUp: boolean;
  /** What to store as `_asked` for the next turn. */
  nextAsked: Asked | null;
};

/**
 * Everything a turn decides, before a model is involved.
 *
 * All of it is derivable from three things — the population, what has been captured,
 * and what the user just wrote — which is why it lives here rather than spread through
 * the orchestration. `intake-conversation.ts` persists what this returns and renders
 * what it says; the sequence itself is tested without a database.
 *
 * ── THE THREE ORDERING RULES ─────────────────────────────────────────────
 * 1. A banked baseline is folded into `captured` before the next beat is chosen.
 *    Otherwise B1's score is stored and Wing asks B1 again.
 * 2. A re-ask must NOT step the sequence forward, so `lastAsked` is withheld in that
 *    case and the ordinary rule returns the same unsatisfied beat.
 * 3. A follow-up is the entire turn. No beat, no wrap-up, one question.
 */
export function planTurn(params: {
  population: PopulationTag | null;
  captured: Record<string, unknown>;
  text: string;
}): TurnPlan {
  const asked = readAsked(params.captured);
  const baseline = planBaselineTurn({ asked, text: params.text });

  const banked = baseline.kind === "recorded" || baseline.kind === "declined";
  const fields = banked ? baseline.fields : {};
  const captured = banked ? { ...params.captured, ...fields } : params.captured;
  const record = banked ? { entry: baseline.record, beat: baseline.beat } : null;

  const followUpPending = baseline.kind === "recorded" && baseline.followUpAsk !== null;
  const lastAsked =
    baseline.kind === "reask" ? null : asked && !asked.followUp ? asked.beat : null;

  const beat = followUpPending ? null : nextBeatAfter(params.population, captured, lastAsked);
  const wrapUp = !followUpPending && !beat && isComplete(params.population, captured);

  /*
   * A follow-up answers no beat. Before `_asked` existed the answered beat was read off
   * `nextBeat` — right only because the beat had not yet been satisfied by this turn's
   * own extraction — so that reading is kept as the fallback for intakes already in
   * flight when this shipped.
   */
  const answeredBeat = asked
    ? asked.followUp
      ? null
      : asked.beat
    : nextBeat(params.population, params.captured)?.key ?? null;

  const nextAsked =
    baseline.kind === "reask"
      ? askedFor(baseline.beat, { attempt: baseline.attempt })
      : followUpPending && baseline.kind === "recorded"
        ? askedFor(baseline.beat, { followUp: true })
        : askedFor(beat?.key ?? null);

  return {
    baseline,
    captured,
    fields,
    record,
    beat,
    answeredBeat,
    guidance: renderBaselineGuidance(baseline),
    suppressBeat: followUpPending,
    wrapUp,
    nextAsked,
  };
}

/** The log line, so a bad reading is visible in the turn log rather than only in a row. */
export function describePlan(plan: BaselinePlan): string {
  if (plan.kind === "none") return "not a baseline turn";
  if (plan.kind === "reask") {
    return `${plan.beat}: unreadable (${plan.ambiguous ? `ambiguous: ${plan.candidates.join("/")}` : "no number"}), re-asking, attempt ${plan.attempt}`;
  }
  if (plan.kind === "declined") return `${plan.beat}: declined after ${MAX_ATTEMPTS} attempts, layer 1`;
  const r = plan.record;
  const what = r.score === null ? `barrier ${r.barrier}` : `score ${r.score}${bandOf(plan) ? ` (${bandOf(plan)})` : " (no band)"}`;
  return `${plan.beat}: ${what}, layer ${r.layer}${plan.followUpAsk ? ", follow-up queued" : ""}`;
}

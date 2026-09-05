/**
 * Evidence classification for the Reveal Cycle — the part that must happen at capture.
 *
 * Pure. No database, no model call.
 *
 * ── WHY THIS EXISTS BEFORE THE REVEAL DOES ───────────────────────────────
 * The Reveal Cycle is not scheduled and its gates are not wired. This module is here
 * anyway, because three of its four pieces are the kind that can only be got right on
 * the way in. Reveal Cycle v4 §13, "For Aditya", says so directly of one of them:
 * "Quote-productivity classification at capture: single word, list, or prose. Cheap at
 * capture, expensive to backfill."
 *
 * Backfilling the other two is worse than expensive. Signal category and evidence tier
 * are properties of the *prompt that was asked*, and a stored response with no record
 * of which prompt produced it cannot be graded later at all — not by a person and not
 * by a model. Gate 2 counts Tier 1 events and distinct categories; a month of responses
 * captured without them is a month the Reveal cannot see.
 *
 * ── THE TWO AXES ARE NOT ONE AXIS ────────────────────────────────────────
 * v4 §3 is emphatic that evidence grade and quote productivity are independent, and
 * gives the case in both directions. Quote-productive and Tier 3: "I'm definitely a
 * gut-then-validate person, always have been, I don't overthink things" — prose, fully
 * quotable, pure trait self-report, and quoting it "produces a Barnum statement wearing
 * quotation marks, which is worse than an unquoted one". Tier 1 and not quote-
 * productive: "Yes" to Universal 30 "names a real event and gives Wing nothing to say."
 *
 * So they are two fields, and nothing here derives one from the other.
 *
 * ── EVIDENCE TIER IS A PROPERTY OF THE PROMPT, NOT THE RESPONSE ──────────
 * Also §13: "Evidence tier is a property of the prompt rather than the response, so it
 * can live in the prompt library as a per-prompt attribute rather than being computed."
 * There is therefore no `classifyTier(text)` in this file, and there should not be one.
 * A hypothetical prompt elicits aspiration whatever the answer looks like — §3: "The
 * eight prompts in the library's Hypotheticals block are Tier 3 by construction, not by
 * phrasing."
 */

/**
 * v4 §3, Axis 1. Verbatim:
 *
 *   1 — Behavioral. "Names a specific, datable action, utterance, or event. Only Tier 1
 *       can anchor a primary insight."
 *   2 — Corroborating. "Real referent, weak or absent time anchor, or a user-observed
 *       pattern. Supporting evidence and trajectory only."
 *   3 — Contextual. "Trait self-report, forced-choice self-classification, hypothetical,
 *       metaphor, or the user's guess at a third party's perception. Never behavioral
 *       evidence."
 */
export type EvidenceTier = 1 | 2 | 3;

/** v4 §3, Axis 2: "What shape the response takes: single word, list, or prose." */
export type QuoteShape = "single_word" | "list" | "prose";

/** v4 §4. The eight, in her order. */
export type SignalCategory =
  | "language"
  | "energy"
  | "decision"
  | "relationship"
  | "industry"
  | "career"
  | "influence"
  | "achievement";

export const SIGNAL_CATEGORIES: readonly SignalCategory[] = [
  "language",
  "energy",
  "decision",
  "relationship",
  "industry",
  "career",
  "influence",
  "achievement",
];

/**
 * The channels H-RC02's detection method enumerates: "micro-journal responses…
 * heartbeat responses; Radar reactions and engagement depth; published content and
 * topic; module completions; competency updates; power behavior data; interview cycle
 * data; network cycle data; career events."
 */
export type Channel =
  | "micro_journal"
  | "heartbeat"
  | "radar"
  | "published_content"
  | "module_completion"
  | "competency_update"
  | "power_behavior"
  | "interview_cycle"
  | "network_cycle"
  | "career_event";

export type EvidenceEvent = {
  channel: Channel;
  /** Epoch milliseconds. Gate 2's trailing-14-day condition reads it. */
  at: number;
  /** From the prompt, never computed from the text. */
  tier: EvidenceTier;
  /**
   * From the prompt. Zero or more since 0041 — a prompt may carry several of her
   * eight, and Gate 2 counts the distinct categories across every event, so each
   * one an event carries counts separately toward that condition.
   *
   * Empty is legitimate and means the prompt had none, not that the event is
   * malformed: it still counts toward the tier, quote-productivity, total and
   * channel conditions, and contributes nothing to the category spread.
   */
  categories: readonly SignalCategory[];
  /** Classified at capture. Null for an event with no user text at all. */
  shape: QuoteShape | null;
  /** The user's words. IG-U010 cannot quote what was never stored. */
  verbatim: string;
};

/* ── Quote productivity ─────────────────────────────────────────────────── */

const BULLET = /^\s*(?:[-*•·]|\d+[.)])\s+/;
const SENTENCE_END = /[.!?]/;

/**
 * Where single-word stops and prose starts. Ours, not hers, and flagged as ours.
 *
 * She writes "single word" literally, and her example is "Yes". But "not really", "no
 * idea" and "same as usual" give Wing exactly as little, and calling them prose would
 * let a month of shrugs satisfy Gate 2's four-quote-productive condition. Three is the
 * boundary that keeps her example on the right side while catching the short refusals;
 * "I don't overthink things" is four words and is genuinely quotable.
 *
 * If she wants it literal, set this to 1 and the tests below say what changes.
 */
export const SINGLE_WORD_MAX_WORDS = 3;

/**
 * A response that opens with a bare yes or no and stops within this many words is the
 * same information as "Yes". Also ours, and flagged with the boundary above.
 */
export const BARE_ANSWER_MAX_WORDS = 5;

const BARE_ANSWER =
  /^\s*(?:yes|yeah|yep|yup|no|nope|nah|not really|not much|maybe|sort of|kind of|same|nothing|none|n\/a)\b/i;

/**
 * The shape of a response, classified at capture.
 *
 * Null for an empty response — that is a fact about the prompt log ("delivered, not
 * answered"), not a shape, and pretending it is a single word would make an ignored
 * prompt indistinguishable from "Yes".
 */
export function classifyShape(text: string): QuoteShape | null {
  const t = text.trim();
  if (!t) return null;

  const lines: string[] = [];
  const raw = t.split("\n");
  for (const l of raw) {
    const s = l.trim();
    if (s) lines.push(s);
  }

  // Bullets or numbering are a list whatever else is true of them.
  for (const l of lines) if (BULLET.test(l)) return "list";

  /*
   * Several short lines with no sentence punctuation. Someone answering "what went well
   * this week" with three fragments on three lines has written a list, and quoting one
   * fragment back at them is not quote-then-extend.
   */
  if (lines.length >= 2) {
    let allShort = true;
    for (const l of lines) {
      if (SENTENCE_END.test(l) || wordCount(l) > 8) allShort = false;
    }
    if (allShort) return "list";
  }

  /*
   * A comma series on one line: "networking, writing, interviews". Three or more
   * fragments, none of them a clause, no sentence punctuation.
   *
   * Checked BEFORE the word count, because a three-item list is also three words and
   * whichever test runs first wins. Answering "what have you been working on" with three
   * nouns is a list; calling it a single word would be wrong in the same direction but
   * for the wrong reason, and the counts feed different things.
   */
  if (lines.length === 1 && !SENTENCE_END.test(t)) {
    const parts = t.split(",");
    if (parts.length >= 3) {
      let allFragments = true;
      for (const p of parts) if (wordCount(p) > 3) allFragments = false;
      if (allFragments) return "list";
    }
  }

  const words = wordCount(t);

  /*
   * A bare yes or no with a few words after it. "no, not this week" is four words and is
   * a shrug; "yes, I ran the retro myself" is six and is an answer. The particle is what
   * separates them — a response that opens with one and then stops is the same
   * information as "Yes", which v4 §3 uses as its example of a Tier 1 event that "gives
   * Wing nothing to say".
   */
  if (BARE_ANSWER.test(t) && words <= BARE_ANSWER_MAX_WORDS) return "single_word";

  if (words <= SINGLE_WORD_MAX_WORDS) return "single_word";

  return "prose";
}

function wordCount(s: string): number {
  const parts = s.trim().split(/\s+/);
  let n = 0;
  for (const p of parts) if (p.replace(/[^A-Za-z0-9']/g, "")) n++;
  return n;
}

/**
 * Gate 2 counts these. v4 §5: "At least 4 quote-productive responses (prose rather
 * than single word or list)." Her parenthetical is the definition, so this is an
 * equality rather than a judgement.
 */
export function isQuoteProductive(shape: QuoteShape | null): boolean {
  return shape === "prose";
}

/* ── The prompt log ─────────────────────────────────────────────────────── */

/**
 * v4 §13: "Prompt log records delivery, signal category, and response substantiveness.
 * IG-RC10 and Gate 2 both query it, and delivery alone is insufficient: the gate must
 * distinguish delivered-and-answered-thinly from delivered-and-ignored."
 *
 * Three states, because that sentence names three.
 */
export type Substantiveness = "no_response" | "thin" | "substantive";

export type PromptDelivery = {
  /** The prompt as it exists in the library — tier and category come from it. */
  promptId: string;
  categories: readonly SignalCategory[];
  tier: EvidenceTier;
  channel: Channel;
  deliveredAt: number;
};

export type PromptLogEntry = PromptDelivery & {
  respondedAt: number | null;
  /** The user's words, kept whole. Empty string when there was no response. */
  verbatim: string;
  shape: QuoteShape | null;
  substantiveness: Substantiveness;
  /**
   * Whether the turn that produced this response may feed longitudinal analysis —
   * `transcript_turns.analysis_eligible`, carried through from whatever read the turn
   * to build this entry. Defaults true so existing callers and tests are unaffected;
   * a caller wiring the Reveal to real turns must pass it explicitly.
   *
   * This is a second gate, not a duplicate of the first. `excludeTurnFromAnalysis` /
   * `analysisEligible` already stop a crisis or scoped-refusal turn from feeding
   * `scoring.ts`, `classifier.ts`, `tagging-store.ts` and `evidence-portfolio.ts` — see
   * provenance.ts. This module has no database access and cannot read that column
   * itself, so it cannot enforce the exclusion; it can only refuse to manufacture a
   * Reveal-facing EvidenceEvent from an entry that says it was excluded. See
   * `eventFrom`.
   */
  analysisEligible: boolean;
};

/**
 * One row of the prompt log.
 *
 * The distinction IG-RC10 turns on is the whole point: a claim that the user never
 * mentions something "dies unless prompts in that signal category were actually
 * delivered" (§6, hard filter 0). Delivered-and-ignored and never-delivered look
 * identical in a log that only records responses, and they mean opposite things.
 */
export function logPrompt(
  delivery: PromptDelivery,
  response?: { at: number; text: string; analysisEligible?: boolean },
): PromptLogEntry {
  const analysisEligible = response?.analysisEligible ?? true;

  if (!response || !response.text.trim()) {
    return {
      ...delivery,
      respondedAt: response ? response.at : null,
      verbatim: response ? response.text : "",
      shape: null,
      substantiveness: "no_response",
      analysisEligible,
    };
  }

  const shape = classifyShape(response.text);
  return {
    ...delivery,
    respondedAt: response.at,
    verbatim: response.text,
    shape,
    substantiveness: isQuoteProductive(shape) ? "substantive" : "thin",
    analysisEligible,
  };
}

/**
 * The evidence event a delivered-and-answered prompt produces, or null.
 *
 * The `analysisEligible` check is the reason this file exists to say anything about
 * exclusion at all — see `PromptLogEntry.analysisEligible`. It is checked here, at the
 * one function every Gate 2 count and the escalation logic actually consumes, rather
 * than in `logPrompt`, so `substantiveness` and `shape` stay an honest classification
 * of what the text looked like even for an excluded turn — a caller with a legitimate
 * reason to look at the raw log (an admin audit surface, say) still sees the truth.
 * Only the Reveal-facing event is withheld.
 */
export function eventFrom(entry: PromptLogEntry): EvidenceEvent | null {
  if (!entry.analysisEligible) return null;
  if (entry.substantiveness === "no_response" || entry.respondedAt === null) return null;
  return {
    channel: entry.channel,
    at: entry.respondedAt,
    tier: entry.tier,
    categories: entry.categories,
    shape: entry.shape,
    verbatim: entry.verbatim,
  };
}

/**
 * Whether a signal category had a fair chance in a window — IG-RC10's delivery audit.
 *
 * "For the signal category in which absence is claimed: were prompts in that category
 * delivered during the window, and did the user have opportunity to respond?"
 */
export function categoryWasDelivered(
  log: readonly PromptLogEntry[],
  category: SignalCategory,
  since: number,
  until: number,
): boolean {
  for (const e of log) {
    if (e.categories.indexOf(category) >= 0 && e.deliveredAt >= since && e.deliveredAt <= until) {
      return true;
    }
  }
  return false;
}

/* ── Verbatim retention ─────────────────────────────────────────────────── */

/**
 * v4 §13: "Verbatim retention across all channels including SMS and email replies, at a
 * 60-day horizon."
 */
export const VERBATIM_HORIZON_DAYS = 60;

/**
 * The exception, and it is the one that makes the first Reveal possible.
 *
 * The Reveal Cycle's first Reveal anchors to the intake self-description — the cleanest
 * baseline the platform holds, because it predates anything Wing has said. A 60-day
 * window would delete it before the second Reveal ever ran. Self-descriptions are
 * therefore stored permanently, in their own table, outside this horizon; the two
 * documents fit together better than either notices.
 */
export const RETAINED_INDEFINITELY: readonly string[] = ["self_descriptions", "baselines"];

/** Whether an event is still inside the general verbatim window. */
export function withinVerbatimHorizon(at: number, now: number): boolean {
  return now - at <= VERBATIM_HORIZON_DAYS * 24 * 60 * 60 * 1000;
}

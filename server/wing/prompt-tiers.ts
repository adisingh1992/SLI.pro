/**
 * Evidence tier as a property of the prompt — a first pass, for her to correct.
 *
 * Pure. Parses her prompt library and proposes a tier for each entry.
 *
 * ── WHY A PROMPT AND NOT A RESPONSE ──────────────────────────────────────
 * Reveal Cycle v4 §13, "For Aditya": "Evidence tier is a property of the prompt rather
 * than the response, so it can live in the prompt library as a per-prompt attribute
 * rather than being computed."
 *
 * That is the whole design and it is a good one. A hypothetical elicits aspiration
 * whatever shape the answer takes, so the tier is decidable before anyone answers —
 * §3: "The eight prompts in the library's Hypotheticals block are Tier 3 by
 * construction, not by phrasing."
 *
 * ── WHY THE ORDER OF THE TESTS IS THE WHOLE CLASSIFIER ───────────────────
 * "If someone shadowed you for a day this week, what would they say you spent the most
 * time on?" contains "this week". Read for a time anchor first, it looks behavioural.
 * It is not: it is a hypothetical asking the user to guess at someone else's
 * perception, which is two of her three Tier 3 categories at once.
 *
 * So every Tier 3 marker is tested before any Tier 1 marker. Getting that backwards
 * would grade the library's most speculative questions as its hardest evidence, and
 * Gate 2 counts Tier 1 events.
 *
 * ── THIS IS A PROPOSAL AND SAYS SO ──────────────────────────────────────
 * Every result carries the marker that decided it, so she can disagree with the reason
 * rather than just the answer. Where nothing matches, the tier is null rather than a
 * guess, and the report lists those separately for her to set by hand.
 */
import type { EvidenceTier } from "./reveal-evidence";

export type TierProposal = {
  tier: EvidenceTier | null;
  /** Her category, in her words. */
  because: string;
  /** The text that decided it, so a wrong call is traceable to a rule. */
  marker: string;
};

type Rule = { tier: EvidenceTier; because: string; match: RegExp };

/**
 * Tier 3 first. Her definition: "Trait self-report, forced-choice self-classification,
 * hypothetical, metaphor, or the user's guess at a third party's perception."
 */
const TIER_3: readonly Rule[] = [
  {
    tier: 3,
    because: "hypothetical",
    match: /\b(?:if you (?:could|had to|were|only)|if your|if someone (?:asked|made|shadowed|opened)|if a |imagine|when you imagine|suppose)\b/i,
  },
  {
    tier: 3,
    because: "the user's guess at a third party's perception",
    match: /\b(?:what would (?:they|he|she|your \w+|someone|people) say|what do you think (?:they|your \w+)(?:'d| would)|how would your \w+ describe|would they agree|what would they be most confused by|do you think they)\b/i,
  },
  {
    tier: 3,
    because: "forced-choice self-classification",
    match: /\b(?:would you rather|are you (?:the kind of person|more)|pick one|are you a |or someone who|which of these|are you in a \w+ chapter)\b/i,
  },
  {
    tier: 3,
    because: "metaphor",
    match: /\b(?:were a (?:cooking style|reality tv|crime scene|documentary)|as a metaphor|what would it be called|is it a thriller|one word for your)\b/i,
  },
  {
    tier: 3,
    because: "trait self-report",
    match: /\b(?:do you (?:feel|consider yourself|think you're)|what are you (?:good|bad) at|what's something you're really good at|what's your (?:most|bar for))\b/i,
  },
];

/**
 * Tier 1. Her definition: "Names a specific, datable action, utterance, or event."
 *
 * The two halves both have to be there. "What did you do?" with no anchor is Tier 2,
 * because there is nothing to date it to. Her own worked example is exactly this fix:
 * appending "walk me through the last time you did it" converts a prompt from Tier 3 to
 * Tier 1 "and from one-word to prose simultaneously".
 */
const TIME_ANCHOR =
  /\b(?:this week|last week|this month|recently|lately|(?:your |the )?last (?:time|thing|decision|conversation|meeting|call|project|week|month)|when(?:'s| is) the last time|today|yesterday|this quarter|this past weekend|since we (?:last )?spoke|in the last \w+)\b/i;

/*
 * "Walk me through" is a Tier 1 marker on its own, without a separate anchor. Her worked
 * example is exactly this: appending "walk me through the last time you did it" to
 * Universal 59 "converts it from Tier 3 to Tier 1". The phrase is a request to recount a
 * particular occasion, which is her definition of behavioural whether or not the sentence
 * also says when.
 */
const RECOUNT = /\b(?:walk me through|tell me about the time|describe the moment|what happened when)\b/i;

const ACTION =
  /\b(?:did you|what did you|who did you|have you|had you|walk me through|what happened|what's a (?:call|decision|conversation|meeting|project)|what was the|did anyone|did anything|what did (?:anyone|someone|your)|you made|you did|you said|you worked|you helped|you learned|you noticed|you changed)\b/i;

/**
 * Tier 2. "Real referent, weak or absent time anchor, or a user-observed pattern."
 *
 * This is the residual, and deliberately so: her definition is the one that describes
 * what is left when a prompt names something real but pins it to no moment.
 */
const PATTERN =
  /\b(?:have you noticed|any patterns|do you tend to|always come to you|keep coming back|what's the thing people|consistently|used to|no longer|these days)\b/i;

/** A block heading that fixes the tier regardless of phrasing. */
const BLOCK_OVERRIDES: ReadonlyArray<{ heading: RegExp; tier: EvidenceTier; because: string }> = [
  {
    // "The eight prompts in the library's Hypotheticals block are Tier 3 by
    // construction, not by phrasing." Her sentence, so it is a rule and not a guess.
    heading: /hypothetical/i,
    tier: 3,
    because: "in the Hypotheticals block, Tier 3 by construction",
  },
];

/**
 * A tier for one prompt.
 *
 * `heading` is the block it sits under, when there is one. A block override wins over
 * the phrasing, because she said so.
 */
export function classifyPromptTier(text: string, heading?: string): TierProposal {
  if (heading) {
    for (const b of BLOCK_OVERRIDES) {
      if (b.heading.test(heading)) {
        return { tier: b.tier, because: b.because, marker: heading.trim() };
      }
    }
  }

  for (const r of TIER_3) {
    const m = text.match(r.match);
    if (m) return { tier: 3, because: r.because, marker: m[0] };
  }

  const recount = text.match(RECOUNT);
  if (recount) {
    return {
      tier: 1,
      because: "asks the user to recount one particular occasion",
      marker: recount[0],
    };
  }

  const anchor = text.match(TIME_ANCHOR);
  const action = text.match(ACTION);
  if (anchor && action) {
    return {
      tier: 1,
      because: "names a specific, datable action or event",
      marker: `${anchor[0]} + ${action[0]}`,
    };
  }

  const pattern = text.match(PATTERN);
  if (pattern) {
    return { tier: 2, because: "a user-observed pattern", marker: pattern[0] };
  }
  if (action) {
    return {
      tier: 2,
      because: "a real referent with no time anchor",
      marker: action[0],
    };
  }
  if (anchor) {
    return { tier: 2, because: "a time anchor with no named action", marker: anchor[0] };
  }

  /*
   * Tier 2 is the residual, and that is her definition rather than a shrug: "Real
   * referent, weak or absent time anchor, or a user-observed pattern." A question about
   * the user's own experience with no hypothetical and no moment attached is precisely
   * that. Null is kept for lines that are not questions about the user at all — a
   * monthly calibration widget, a design note that parsed by accident.
   */
  if (/\byou(?:r|rself)?\b/i.test(text)) {
    return {
      tier: 2,
      because: "a real referent with no time anchor",
      marker: "no Tier 3 marker and no datable event",
    };
  }

  return { tier: null, because: "nothing matched — needs setting by hand", marker: "" };
}

/* ── Parsing her library ────────────────────────────────────────────────── */

export type ParsedPrompt = {
  /** Her id: a bare number in section 1, or a code like U-01. */
  id: string;
  text: string;
  /** Nearest preceding `###` heading. */
  block: string;
  /** Nearest preceding `##` section. */
  section: string;
  /**
   * Nearest preceding `#` heading.
   *
   * Needed because the heartbeat file puts its two SECTIONs at h1 and its populations at
   * h2, the opposite way round from the micro-journal library. Without it, Section 4's
   * heartbeat prompts and Section 5's new-population prompts are indistinguishable — and
   * they have different cadences.
   */
  h1: string;
  /** The `*Signal: …*` line beneath it, when there is one. */
  signal: string | null;
  /**
   * Her trailing parenthetical, verbatim, when there is one.
   *
   * Section 5 marks its prompts inline — `*(heartbeat)*`, `*(synthesis-cycle only)*`,
   * `*(heartbeat — requires event-sensitivity flag)*` — and those markers are the only
   * statement anywhere of which prompts are event-sensitive and which belong to the
   * monthly rhythm rather than the weekly one. Kept as she wrote it rather than parsed
   * into flags here: the interpretation belongs to whatever consumes it, and the raw
   * string is what a reviewer can check against the document.
   */
  deliveryMarker: string | null;
  line: number;
};

/*
 * Two shapes, both from her documents:
 *
 *   1. "How did you introduce yourself…"        section 1, bare numbering
 *   U-01. "How have you been describing…"       sections 2 and 3, coded
 *
 * Anything else is not a prompt, which matters: these files carry tables, design
 * principles and integration notes, and a looser pattern would count those too. The
 * count is the thing she will check first.
 */
const NUMBERED = /^(\d{1,3})\.\s+["“](.+?)["”]\s*$/;
const CODED = /^([A-Z]{1,3}-[A-Z]?\d{2,3})[.:]\s+["“](.+?)["”]/;
/*
 * Two forms, both hers. The micro-journal library wraps the line in asterisks; Section 5
 * of the heartbeat file writes it bare. A pattern that required the asterisks read every
 * Section 5 signal as absent — 28 prompts whose behavioural signal she DID supply, filed
 * as missing.
 */
const SIGNAL = /^\*{0,2}\s*Signal:\s*(.+?)\s*\*{0,2}\s*$/i;
/** Her trailing `*(…)*`, at the end of a prompt line. */
const MARKER = /\*\((.+?)\)\*\s*$/;

export function parsePrompts(text: string): ParsedPrompt[] {
  const lines = text.split("\n");
  const out: ParsedPrompt[] = [];
  let section = "";
  let block = "";
  let h1 = "";

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (line.indexOf("### ") === 0) {
      block = line.slice(4).trim();
      continue;
    }
    if (line.indexOf("## ") === 0) {
      section = line.slice(3).trim();
      block = "";
      continue;
    }
    if (line.indexOf("# ") === 0) {
      h1 = line.slice(2).trim();
      section = "";
      block = "";
      continue;
    }

    const n = line.match(NUMBERED);
    const c = line.match(CODED);
    if (!n && !c) continue;

    const id = n ? n[1] : (c as RegExpMatchArray)[1];
    const body = n ? n[2] : (c as RegExpMatchArray)[2];

    let signal: string | null = null;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const s = lines[j].trim().match(SIGNAL);
      if (s) {
        signal = s[1];
        break;
      }
    }

    const m = line.match(MARKER);
    out.push({
      id,
      text: body,
      block,
      section,
      h1,
      signal,
      deliveryMarker: m ? m[1].trim() : null,
      line: i + 1,
    });
  }

  return out;
}

/**
 * Coded lines that did not parse as a prompt.
 *
 * ES-10 is the one that matters today: "ES-10: Monthly visual overlap measure — 'You' and
 * 'Your Company' as overlapping circles." It is a monthly calibration widget rather than a
 * question, so it correctly has no quoted body and no tier. But a parser that drops it
 * silently means a count that is quietly one short, and the count is the first thing she
 * will check. So they are reported rather than skipped.
 */
export function unparsedCodedLines(text: string): Array<{ id: string; text: string; line: number }> {
  const loose = /^([A-Z]{1,3}-[A-Z]?\d{2,3})[.:]\s+(.*)$/;
  const out: Array<{ id: string; text: string; line: number }> = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const m = l.match(loose);
    if (!m) continue;
    if (CODED.test(l)) continue;
    out.push({ id: m[1], text: m[2], line: i + 1 });
  }
  return out;
}

/** Prompts with a tier attached. */
export type TieredPrompt = ParsedPrompt & { proposal: TierProposal };

export function tierPrompts(prompts: readonly ParsedPrompt[]): TieredPrompt[] {
  const out: TieredPrompt[] = [];
  for (const p of prompts) out.push({ ...p, proposal: classifyPromptTier(p.text, p.block) });
  return out;
}

export function tierCounts(tiered: readonly TieredPrompt[]): Record<string, number> {
  const counts: Record<string, number> = { "1": 0, "2": 0, "3": 0, unset: 0 };
  for (const t of tiered) {
    const k = t.proposal.tier === null ? "unset" : String(t.proposal.tier);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

/**
 * Signal category as a property of the prompt — a first pass, for her to correct.
 *
 * Same shape as `prompt-tiers.ts`, and it exists for the same reason: a category left
 * null forever is honest but useless, and Gate 2 cannot count what was never set. This is
 * not a mechanical rule applied to her own written definitions the way tier is — there is
 * no single sentence of hers that says "a prompt is Energy when X". So this file says
 * plainly what it is: a judgment call against her eight definitions and, wherever one
 * exists, the prompt's own `behavioralSignal` annotation — the "Signal: …" line she wrote
 * by hand for 220 of these prompts, which is analysis, not a category, but is the closest
 * thing to her own reading of what the prompt is for.
 *
 * ── WHERE THE EIGHT DEFINITIONS COME FROM ─────────────────────────────────
 * Seven are quoted, not invented, from `Wing_Comprehensive_UX_Recommendation-2.md` §5.4's
 * routing table ("How Prompt Responses Feed the Platform"):
 *
 *   Language      "Self-presentation language"
 *   Energy        "Energy markers (excitement, frustration, curiosity)"
 *   Decision      "Decision language"
 *   Relationship  "Relationship mentions"
 *   Industry      "Industry observations"
 *   Career        "Career uncertainty"
 *   Achievement   "Achievement descriptions"
 *
 * Influence is not a row in that table. It is inferred from Module 9's own name — "Power &
 * Influence" — and from the Reveal Cycle v4 distribution table's description of what the
 * three Influence-tagged universal prompts do: "Module 9's power behavior data and the
 * Reveal's ability to say anything about how a user exercises influence". So Influence
 * here means the prompt asks about exercising power over, or persuading, or being
 * followed/pushed-back-on by other people — not merely mentioning them, which is
 * Relationship's job.
 *
 * ── WHY BEHAVIORAL_SIGNAL FIRST AND PROMPT TEXT SECOND ────────────────────
 * A prompt's surface wording is a weaker signal than what she already wrote about it. "Who
 * did you spend the most time with this week?" reads like Relationship from the text
 * alone; her own annotation — "who mattered enough to notice, which says something about
 * values" — is closer to Language/identity than to network mapping. Where an annotation
 * exists it is checked first; the prompt text is the fallback for the ~15 prompts (per
 * Reveal Cycle v4 §4) that carry none, and for the heartbeat file's Section 4, which was
 * never annotated at all.
 *
 * ── THIS IS STILL A PROPOSAL ──────────────────────────────────────────────
 * Every result carries the phrase that decided it, exactly like `TierProposal`, so a wrong
 * call is traceable to a rule rather than defended as a vibe. Where nothing in either field
 * supports a category with any confidence, the result is null — a category invented to
 * avoid an empty cell would risk exactly what `prompt-library-source.ts` refuses to risk:
 * manufacturing the distinctness Gate 2 counts, or collapsing distinctness that is real.
 */

export const SIGNAL_CATEGORIES = [
  "language",
  "energy",
  "decision",
  "relationship",
  "industry",
  "career",
  "influence",
  "achievement",
] as const;

export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];

export type CategoryProposal = {
  category: SignalCategory | null;
  /** Which of her definitions decided it, in her words. */
  because: string;
  /** The phrase that matched, and which field it came from. */
  marker: string;
};

type Rule = { category: SignalCategory; because: string; match: RegExp };

/*
 * Order matters exactly as it does in prompt-tiers.ts: the narrowest, least-ambiguous
 * definitions are tested first, so a prompt that could plausibly fit two categories lands
 * on the one its wording most specifically names rather than the first one to happen to
 * match a common word. Influence and Industry are tested before Relationship and Career
 * because "team", "company" and "market" are common enough words that a looser category
 * tested first would absorb prompts that are more precisely about something else.
 */
/*
 * ── WHY NONE OF THESE END IN A TRAILING \b ──────────────────────────────
 * Several alternatives are deliberately prefixes — "persuad", "delegat", "convinc",
 * "competen", "accomplish", "frustrat" — so that "persuading", "delegate", "convinced",
 * "competency", "accomplishment" and "frustrating" all match, not only the one inflected
 * form spelled out. A trailing `\b` on the whole alternation blocks exactly that: the
 * position right after "competen" inside "competency" sits between two word characters
 * ("n" and "c"), which is never a boundary, so `\bcompeten\b` cannot match "competency" at
 * all — caught by this file's own test suite, not a theoretical risk. The leading `\b`
 * still anchors every alternative to a real word start, which is what actually prevents
 * false hits inside unrelated words.
 */
const RULES: readonly Rule[] = [
  {
    category: "influence",
    because: "exercising power over, persuading, or being pushed back on by other people",
    match:
      /\b(?:pushed back|push ?back|persuad|influenc|authorit|delegat|convinc|your team would say|anonymously|stakeholders?|board\b|listened to you|your call carried|led (?:a|the) (?:room|conversation|meeting))/i,
  },
  {
    category: "industry",
    because: "an observation about the industry, market or field rather than the user's own role",
    match: /\b(?:your industry|your field|your market|your sector|competitors?|industr|market\b|what's happening in\b)/i,
  },
  {
    category: "decision",
    because: "the process of deciding, choosing, or changing one's mind",
    match:
      /\b(?:decision|decid|changed your mind|gut\b|weren't sure|60% sure|would you rather|pick one|chose\b|choos)/i,
  },
  {
    category: "achievement",
    because: "something accomplished, done well, or recognised by others as competent",
    match:
      /\b(?:proud of|compliment|good at|nailed it|helped (?:someone|with)|accomplish|credential|competen|surprised (?:you|yourself) with how|figured out|solved\b|handled\b|impress)/i,
  },
  {
    category: "career",
    because: "the user's career trajectory, positioning, or professional identity over time",
    match:
      /\b(?:career|five years|your (?:role|title|trajector)|position|re-?entering the workforce|your major|describing (?:your (?:work|company|role|major)|what you do)|describing yourself)/i,
  },
  {
    category: "relationship",
    because: "a specific other person or the user's connection to them",
    match:
      /\b(?:someone|colleague|friend|famil|team(?:mate)?s?|mentor|who did you|who reached out|catch up with|spent (?:the most )?time with|junior to you|senior to you|reports to you)/i,
  },
  {
    category: "energy",
    because: "excitement, frustration, curiosity, or what energises or drains the user",
    match: /\b(?:excit|frustrat|curio|energi[sz]e|drain|laugh|surprised you|energy\b|zone\b|effortless|lit up|dread)/i,
  },
  {
    category: "language",
    because: "how the user describes or presents themselves or their work",
    match:
      /\b(?:describ|introduc\w* yourself|explain\w* (?:what|why)|talked about|said about|how you (?:talk|write|explain)|vocabulary)/i,
  },
];

/**
 * A category for one prompt. `behavioralSignal` is her "Signal: …" annotation when the
 * prompt has one; `promptText` is the fallback and the only input for prompts that carry
 * no annotation.
 */
export function classifySignalCategory(
  promptText: string,
  behavioralSignal: string | null,
): CategoryProposal {
  if (behavioralSignal && behavioralSignal.trim()) {
    for (const r of RULES) {
      const m = behavioralSignal.match(r.match);
      if (m) {
        return { category: r.category, because: r.because, marker: `signal: "${m[0]}"` };
      }
    }
  }

  for (const r of RULES) {
    const m = promptText.match(r.match);
    if (m) {
      return { category: r.category, because: r.because, marker: `prompt: "${m[0]}"` };
    }
  }

  return {
    category: null,
    because: "neither the signal annotation nor the prompt text matched one of her eight with confidence",
    marker: "",
  };
}

export function categoryCounts(
  proposals: readonly { category: SignalCategory | null }[],
): Record<string, number> {
  const counts: Record<string, number> = { unset: 0 };
  for (const c of SIGNAL_CATEGORIES) counts[c] = 0;
  for (const p of proposals) {
    const k = p.category === null ? "unset" : p.category;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

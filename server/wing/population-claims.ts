/**
 * IG-RC13 — unsourced population claims. A linter over the methodology documents.
 *
 *     npm run wing:check-claims
 *
 * Pure. No database, no filesystem. The script that feeds it does the reading.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * IG-RC13 forbids Wing from asserting how common something is among a population
 * it has no data on. It became platform-wide on 19 August, which means it now
 * governs every user-facing line in 312 elements across eight documents, with more
 * coming.
 *
 * What we had before this was the H-004 rule in `gate-audit.ts`. That rule matches
 * six fixed phrases — "most people at your level", "compared to other", "the average
 * user", "in my experience with others", "other clients have", "you're ahead of
 * most" — and it checks Wing's live output, not the documents. Against v1.8's copy it
 * finds nothing, while a real scan finds thirty-three constructions. A check whose
 * name is broader than its patterns is worse than no check, because it reports
 * "clean" and is believed.
 *
 * ── WHY THE RULES ARE TIERED AND MOSTLY OFF ──────────────────────────────
 * IG-RC13 draws a line that this file cannot draw for itself. It bans "most
 * professionals" and "people at your stage typically", and in the same breath
 * permits "Some people find that…" and "There's a pattern where…" — the distinction
 * is whether prevalence is asserted, and for a good number of real lines that is a
 * judgment call belonging to the methodology author.
 *
 * The tiers existed to hold her answer rather than pre-empt it. She ruled on 24
 * August — yes to both — so all three are on, with one carve-out she drew herself:
 * a prevalence adverb describing a WORD is an observation, not a base rate. See
 * WORD_OBSERVATION. The tiers stay separate anyway, because the next ruling will be
 * a narrowing rather than a rewrite.
 *
 * ── WHAT COUNTS AS COPY ──────────────────────────────────────────────────
 * Three components generate what Wing says: coaching_move, delivery_adaptation,
 * failure_path. `signal` and `detection_method` describe when a card fires and are
 * not spoken; `notes` is addressed to us. A claim in `notes` is a claim about the
 * methodology, not to a user, and is reported separately rather than ignored — the
 * gendered frequency note in H-025 is in `notes`, and it still needs an answer.
 *
 * Within those components, a hit inside quotation marks is a line Wing speaks
 * verbatim. A hit outside them is an instruction that generates one. Both are
 * reported; the quoted ones are what ship.
 */

export type ClaimTier = "unsourced" | "prevalence" | "stage_norm";

/**
 * The tiers currently enforced. All three, as of the author's ruling on 24 August:
 * "both questions: yes" — prevalence adverbs about people count, and "at your stage,
 * X is normal" counts. The one carve-out she drew is WORD_OBSERVATION below.
 */
export const TIERS_ON: readonly ClaimTier[] = ["unsourced", "prevalence", "stage_norm"];

export type ClaimRule = {
  tier: ClaimTier;
  /** What the pattern is looking for, for the report. */
  what: string;
  pattern: RegExp;
};

/*
 * Every pattern is case-insensitive and global; the scanner resets lastIndex, so
 * these are safe to share across documents.
 */
export const CLAIM_RULES: readonly ClaimRule[] = [
  /* ── Tier 1: asserts a base rate outright ─────────────────────────────── */
  {
    tier: "unsourced",
    what: "most / a lot of people",
    pattern: /\b(?:most|a lot of|many|plenty of|the majority of) (?:people|professionals|users|students|founders|executives|investors|men|women|clients)\b/gi,
  },
  {
    tier: "unsourced",
    what: "most people in a named group",
    pattern: /\bmost (?:people|others) (?:in|at|your)\b/gi,
  },
  {
    tier: "unsourced",
    what: "universal quantifier about a population",
    pattern: /\b(?:everyone|everybody|nobody|no one) (?:your|around you|in your|at your|else your|is|are|does|thinks|knows|says)\b/gi,
  },
  {
    tier: "unsourced",
    what: "people your age / your year / at your stage",
    pattern: /\bpeople (?:your age|your year|at your (?:stage|level)|in your position|like you)\b/gi,
  },
  {
    tier: "unsourced",
    what: "first-person base rate",
    pattern: /\bin my experience\b/gi,
  },
  {
    tier: "unsourced",
    what: "explicit rarity or commonness claim",
    pattern: /\bthat'?s (?:actually )?(?:uncommon|unusual|rare|common|normal|typical)\b/gi,
  },
  {
    tier: "unsourced",
    what: "a named group behaves this way",
    /*
     * The verb is allowed up to thirty characters after the group, because the real
     * lines put a qualifier in between — "Investors at your stage don't fund
     * companies" is the claim, and requiring the verb to be adjacent missed it.
     */
    pattern: /\b(?:investors|recruiters|hiring managers|employers|founders|executives)\b[^.?!]{0,30}?\b(?:expect|read|see|want|fund|hire|scan|screen|don'?t|do not|always|never)\b/gi,
  },
  {
    tier: "unsourced",
    what: "bare headcount of a named group",
    pattern: /\b\d{2,5} (?:students|people|candidates|profiles|applicants|founders)\b/gi,
  },
  {
    tier: "unsourced",
    what: "the people who X tend to Y",
    pattern: /\bthe people who\b[^.?!]{0,80}\b(?:tend to|usually|often|are)\b/gi,
  },
  {
    tier: "unsourced",
    what: "percentage of a population",
    pattern: /\b\d{1,3}\s?(?:%|per cent|percent) of\b/gi,
  },
  {
    tier: "unsourced",
    what: "count out of a caseload",
    pattern: /\b\d{1,4}\+? of \d{1,4}\b/gi,
  },
  {
    tier: "unsourced",
    what: "bare population headcount",
    pattern: /\b(?:hundreds|dozens|thousands) of (?:pitches|profiles|summaries|applications|candidates|people)\b/gi,
  },
  {
    tier: "unsourced",
    what: "half of a named group",
    pattern: /\bhalf of (?:them|those|these|the)\b/gi,
  },

  /* ── Tier 2: prevalence adverbs. Decision 5, question 1. ──────────────── */
  {
    tier: "prevalence",
    what: "prevalence adverb",
    pattern: /\b(?:usually|typically|generally|commonly|more often than not)\b/gi,
  },
  {
    tier: "prevalence",
    what: "tends to",
    pattern: /\btend(?:s)? to\b/gi,
  },
  {
    tier: "prevalence",
    what: "often",
    pattern: /\boften\b/gi,
  },

  /* ── Tier 3: stage norms. Decision 5, question 2. ─────────────────────── */
  {
    tier: "stage_norm",
    what: "at your stage / at your level",
    /*
     * `your` only. "At this stage" in a delivery note means this point in the intake
     * — H-010's "No audience-specific variation at this stage" is about the flow, not
     * about the user's career — and flagging it made the report noisy enough to
     * discredit itself.
     */
    pattern: /\bat your (?:stage|level)\b/gi,
  },
  {
    tier: "stage_norm",
    what: "X is normal (at a stage)",
    pattern: /\bis normal\b|\bnormal (?:at|for) (?:your|this)\b/gi,
  },
  {
    tier: "stage_norm",
    what: "after enough years",
    pattern: /\bafter enough years\b/gi,
  },
];

/**
 * Phrases reviewed and cleared, matched exactly against the hit text.
 *
 * Each one is here because the pattern fired on a statement about THIS user rather
 * than about a population — IG-RC13 governs claims about people in general, and
 * "nobody outside your team knows about it" is a claim about one team. Kept as an
 * explicit list rather than by narrowing the patterns, because narrowing to exclude
 * these would also stop them catching the population versions.
 */
export const CLEARED: readonly string[] = [
  "nobody outside",
  "nobody else",
  "everyone down",
];

/**
 * IG-RC13 permits a base rate that names its source: "Wing can reference published
 * research with cited base rates. 'Kegan's research found that 58% of adults
 * construct identity primarily from external sources' is a cited claim, not an
 * unsourced one."
 *
 * So a hit whose surrounding text names a source is not a hit. Matched against the
 * context window rather than the phrase, because the citation sits beside the number
 * rather than inside it.
 */
const CITED = /\b(?:research|study|studies|meta-analysis|literature|arXiv|et al|Kegan|Kruger|Dunning|Ibarra|Kahneman|Rollnick|Johnstone|Rowland|Swann|Sedikides|Wood, Bruner|APA|found that|per the)\b/i;

/**
 * A line that is itself specifying the rule rather than speaking to a user.
 *
 * IG-RC13's own definition quotes every phrase it bans, and IG-U017's quotes the
 * fear framings it bans. A linter that reports those is reporting the rulebook, and
 * the first thing anyone does with a linter that cries wolf on its own specification
 * is stop reading its output.
 */
const SPECIFYING = /(?:^|\s)(?:No |Banned|banned|prohibits|forbids|✗|must not|never (?:says?|uses?|makes?)|retired claims|the specific failure it prevents)/;

/**
 * A prevalence adverb describing a WORD rather than a population.
 *
 * The methodology author's ruling, 24 August: "'Usually' counts when it's a
 * population claim ('it's usually faster than people expect' — cut). 'Usually'
 * doesn't count when it's a linguistic observation about a word ('"should" usually
 * comes from someone else's expectations' — that's about the word, keep it)."
 *
 * Detected structurally rather than by listing the survivors: a short quoted token
 * immediately before the adverb means the sentence's subject is that token. Wing
 * observing what a word tends to indicate is not Wing asserting a base rate about
 * people, and RT-11's whole mechanism is that observation.
 *
 * Deliberately narrow. "That pattern usually means…" has no quoted subject and stays
 * a hit, because whether a pattern's prevalence may be asserted is a separate
 * question that has not been ruled on.
 */
/**
 * A prevalence adverb attached to the second person.
 *
 * "What do you usually post about?" asks this user about their own habit. B2's
 * conditional follow-up is exactly that, and IG-RC13 governs claims about
 * populations, not questions about the person in front of Wing.
 */
const SECOND_PERSON = /\byou(?:'re|r)?\s+(?:\w+\s+){0,1}$/i;

const WORD_OBSERVATION =
  /['\u2018\u2019"\u201c\u201d][A-Za-z][A-Za-z' -]{0,18}['\u2018\u2019"\u201c\u201d](?![A-Za-z])\s*(?:\w+\s+){0,2}$/;
/*
 * The lookahead is load-bearing. Without it the apostrophe in a contraction reads as
 * a closing quote, so "it's usually faster than people expect" saw a quoted word
 * `'it'` and exempted itself — a line the author had explicitly marked for cutting. A
 * closing quote is followed by a space or punctuation, never by a letter.
 */

/** A component name, or a section heading when the document has no component tables. */
export type Locator = {
  /** Nearest preceding card or gate code, when there is one. */
  code: string | null;
  /** Component name for card documents, heading text otherwise. */
  where: string;
  /** True when the component is one Wing speaks from. */
  spoken: boolean;
};

/**
 * `copy` ships to a user as written. `instruction` is delivery guidance that
 * generates copy. `notes` is addressed to us. `analysis` is everything else —
 * prose in a spec, a distribution table, a gate's own definition.
 *
 * Only `copy` and `instruction` are ratcheted. The rest is reported so a person can
 * look, because a linter that fails the build on a sentence in a design rationale
 * gets switched off.
 */
export type ClaimKind = "copy" | "instruction" | "notes" | "analysis";

export type ClaimHit = {
  tier: ClaimTier;
  what: string;
  kind: ClaimKind;
  /** The matched text, verbatim. */
  phrase: string;
  /** Enough surrounding text to judge it, verbatim. */
  context: string;
  /** True when the hit sits inside quotation marks — copy Wing says as written. */
  quoted: boolean;
  locator: Locator;
  line: number;
};

/** The three components that produce what Wing says. */
export const SPOKEN_COMPONENTS: readonly string[] = [
  "coaching_move",
  "delivery_adaptation",
  "failure_path",
];

const CODE_LINE = /\b((?:H|IG|RT|EX)-(?:INT|RC|U|S|V|UX|MJ)?\d{1,4}(?:\.\d)?)\b/;
/*
 * Component rows come in two dialects. The intake documents write `| 4. coaching_move |`.
 * The master compendium escapes the period inside bold — `| **1\. signal** |` — and
 * also has unnumbered rows like `| notes |`.
 *
 * The first version of this pattern only knew the intake dialect, so the compendium's
 * 209 elements parsed with no component at all: every hit landed in `analysis`, none
 * was enforced, and the largest document in the corpus reported a clean zero. That is
 * the same failure as the H-004 rule this file replaced — a check reporting nothing
 * because it was looking for the wrong shape.
 */
const COMPONENT_ROW = /^\|\s*\*{0,2}(?:\d\\?\.\s*)?([a-z\\_]+)\*{0,2}\s*\|/;
const HEADING = /^#{1,4}\s+(.*\S)\s*$/;
const BOLD_LABEL = /^\*\*(Q\d(?:\.\d)?|B\d)\b[^*]*\*\*/;

/**
 * Spans of quoted text within one line.
 *
 * Double quotes, straight and curly, delimit reliably. Single quotes carry most of
 * Wing's speech in the card documents ('Let's go.') and also every apostrophe, so
 * they need a rule: an opening quote is preceded by a non-letter and a closing quote
 * is followed by a non-letter. That admits 'Let's go.' — the apostrophe in "Let's"
 * is followed by `s`, so it is not a closing candidate — and rejects the possessive
 * in "Wing's" for the same reason. It fails on a span that ends in a plural
 * possessive, which does not occur in these documents and would produce one
 * over-long span rather than a wrong verdict if it did.
 */
export function quotedRanges(line: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];

  const pairs: Array<[string, string]> = [
    ["“", "”"],
    ['"', '"'],
  ];
  for (const [open, close] of pairs) {
    let i = 0;
    while (i < line.length) {
      const a = line.indexOf(open, i);
      if (a < 0) break;
      const b = line.indexOf(close, a + 1);
      if (b < 0) break;
      out.push([a, b]);
      i = b + 1;
    }
  }

  const isLetter = (c: string) => /[A-Za-z]/.test(c);
  for (const [open, close] of [
    ["‘", "’"],
    ["'", "'"],
  ] as Array<[string, string]>) {
    let i = 0;
    while (i < line.length) {
      const a = line.indexOf(open, i);
      if (a < 0) break;
      const before = a === 0 ? " " : line.charAt(a - 1);
      if (isLetter(before)) {
        i = a + 1;
        continue;
      }
      let b = -1;
      let j = a + 1;
      while (j < line.length) {
        const c = line.indexOf(close, j);
        if (c < 0) break;
        const after = c + 1 >= line.length ? " " : line.charAt(c + 1);
        if (!isLetter(after)) {
          b = c;
          break;
        }
        j = c + 1;
      }
      if (b < 0) break;
      out.push([a, b]);
      i = b + 1;
    }
  }

  return out;
}

const inRange = (ranges: Array<[number, number]>, at: number) =>
  ranges.some(([a, b]) => at >= a && at <= b);

/** Scans one document. Line-oriented, so a locator is always the nearest one above. */
export function scanDocument(text: string, tiers: readonly ClaimTier[] = TIERS_ON): ClaimHit[] {
  const lines = text.split("\n");
  const hits: ClaimHit[] = [];

  let code: string | null = null;
  let where = "(document head)";
  let spoken = false;

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];

    const comp = COMPONENT_ROW.exec(line);
    if (comp) {
      /*
       * The compendium escapes the underscore as well as the period, so
       * `coaching\_move` arrives with a backslash in it. Stripped rather than matched
       * around: without this only `signal` — the one component with no underscore —
       * ever matched, so every hit in 209 cards inherited the `signal` locator and
       * none of them counted as copy.
       */
      const name = comp[1].replace(/\\/g, "");
      where = name;
      spoken = SPOKEN_COMPONENTS.indexOf(name) >= 0;
    } else if (HEADING.test(line)) {
      const h = HEADING.exec(line);
      where = h ? h[1] : where;
      spoken = false;
      code = null;
    } else if (BOLD_LABEL.test(line)) {
      const b = BOLD_LABEL.exec(line);
      where = b ? b[1] : where;
      /*
       * v3.3 has no component tables. Under a question label its prose alternates
       * between Wing's copy and design rationale, and the quotation marks are the
       * only thing that separates them — so the label counts as spoken and `quoted`
       * carries the distinction.
       */
      spoken = true;
    } else if (/^notes:/.test(line) || /^\|\s*\*{0,2}notes\*{0,2}\s*\|/.test(line)) {
      where = "notes";
      spoken = false;
    } else if (/^\s*Rule:/.test(line)) {
      where = "rule";
      spoken = false;
    }

    const found = CODE_LINE.exec(line);
    if (found && (/^(?:H|IG|RT|EX)-/.test(line.trim()) || /^\|?\s*\*{0,2}(?:H|IG)-/.test(line))) {
      code = found[1];
    }

    /*
     * A line that specifies the rule is skipped, but only where it cannot be copy.
     * Card components stay in scope however they are worded, so a failure_path that
     * happens to contain "must not" is still scanned.
     */
    if (!spoken && SPECIFYING.test(line)) continue;

    const ranges = quotedRanges(line);
    const onThisLine: ClaimHit[] = [];
    const spans: Array<[number, number]> = [];

    for (const rule of CLAIM_RULES) {
      if (tiers.indexOf(rule.tier) < 0) continue;
      rule.pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rule.pattern.exec(line)) !== null) {
        const phrase = m[0];
        const at = m.index;
        if (m.index === rule.pattern.lastIndex) rule.pattern.lastIndex++;
        if (CLEARED.some((c) => phrase.toLowerCase().indexOf(c) >= 0)) continue;

        const from = Math.max(0, at - 90);
        const context = line.slice(from, Math.min(line.length, at + phrase.length + 90)).trim();
        if (CITED.test(context)) continue;

        /*
         * Only the prevalence tier can be exempted this way. A quoted word before
         * "most people" does not make "most people" an observation about the word.
         */
        if (rule.tier === "prevalence") {
          const lead = line.slice(Math.max(0, at - 40), at);
          if (WORD_OBSERVATION.test(lead) || SECOND_PERSON.test(lead)) continue;
        }

        const quoted = inRange(ranges, at);
        const kind: ClaimKind = spoken
          ? quoted
            ? "copy"
            : "instruction"
          : where === "notes"
            ? "notes"
            : "analysis";

        onThisLine.push({
          tier: rule.tier,
          what: rule.what,
          kind,
          phrase,
          context,
          quoted,
          locator: { code, where, spoken },
          line: n + 1,
        });
        spans.push([at, at + phrase.length]);
      }
    }

    /*
     * Several patterns overlap by design — "a lot of people" and "people your age"
     * both fire on the same six words. One phrase is one finding, so a hit whose
     * span sits inside another's is dropped and the longer one survives.
     */
    for (let i = 0; i < onThisLine.length; i++) {
      const [a, b] = spans[i];
      const swallowed = spans.some(
        ([c, d], j) => j !== i && c <= a && d >= b && d - c > b - a,
      );
      if (!swallowed) hits.push(onThisLine[i]);
    }
  }

  return hits;
}

/** Counts for a ratchet: total, and the subset that is copy Wing speaks. */
export function tally(hits: readonly ClaimHit[]): {
  total: number;
  /** The number the ratchet holds: copy plus the instructions that generate it. */
  enforced: number;
  byKind: Record<string, number>;
  byTier: Record<string, number>;
} {
  const byKind: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  let enforced = 0;
  for (const h of hits) {
    byKind[h.kind] = (byKind[h.kind] ?? 0) + 1;
    byTier[h.tier] = (byTier[h.tier] ?? 0) + 1;
    if (h.kind === "copy" || h.kind === "instruction") enforced++;
  }
  return { total: hits.length, enforced, byKind, byTier };
}

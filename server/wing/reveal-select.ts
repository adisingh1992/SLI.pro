/**
 * Reveal template selection — H-019.5, and v3.3's "Reveal Selection Logic".
 *
 * Pure. Fourteen templates, three scoring criteria as a conjunction, her four
 * selection rules, and the IG-INT06 deferral.
 *
 * ── THERE IS NO THRESHOLD NUMBER, AND NONE IS NEEDED ─────────────────────
 * IG-INT06 says "if no reveal template scores above confidence threshold, Wing
 * defers". No document states that number — not v1.8, not v3.3, not IG-INT06 itself;
 * verified by scanning both. What H-019.5 does give is three criteria: "(a) trigger
 * condition match strength, (b) falsifiability per IG-U006 — does the observation
 * contain at least one specific, checkable reference, (c) audience track relevance."
 *
 * All three have to hold. So the threshold is a conjunction, not a cutoff: a template
 * is eligible when its trigger fires, it can quote something specific, and it is
 * allowed for this track. Scoring then only orders the eligible ones. Inventing a
 * numeric cutoff would add a knob nobody specified and make the deferral rate depend
 * on it.
 *
 * ── WHY ELIGIBILITY IS NOT THE SAME AS RANKING ───────────────────────────
 * v3.3 gives a priority order — contradictions first, then identity-frame patterns,
 * then track-specific, then structural, then the versatile fallbacks. That is a
 * ranking over templates that are already eligible. Keeping the two apart is what
 * stops a high-priority template with a weak trigger beating a low-priority one that
 * actually fits, which is the failure the priority order looks like it invites.
 */

import type { AudienceTrack, Question } from "./audience-track";
import type { RevealFacts } from "./reveal-facts";

/** v3.3's priority bands, in order. */
export type Band = 1 | 2 | 3 | 4 | 5;

export const BAND_MEANING: Record<Band, string> = {
  1: "contradiction between two answers — the strongest reveals",
  2: "identity reference frame pattern",
  3: "track-specific",
  4: "structural pattern",
  5: "versatile cross-track fallback",
};

export type RevealTemplate = {
  code: string;
  /** The card that carries the copy. */
  card: string;
  name: string;
  band: Band;
  /** "all" means cross-track. */
  tracks: readonly AudienceTrack[] | "all";
  /**
   * The answers the inference rests on.
   *
   * IG-INT12, v3.3's hardened version: "Where a template quotes an aspiration or
   * self-assessment (Q6, Q7), the inference must rest on the relationship between two
   * statements, never on the content of one." So a template quoting Q6 or Q7 must
   * name at least two answers here, and `assertIgInt12` refuses the table otherwise.
   */
  restsOn: readonly Question[];
  /** Whether the trigger conditions are met. Reads classified facts, never raw text. */
  trigger: (f: RevealFacts) => boolean;
  /**
   * The answers this template must be able to quote for IG-U006 falsifiability — "at
   * least one specific reference that would be demonstrably false for a different
   * user". Empty answers mean nothing to quote, so no falsifiable observation.
   */
  quotes: readonly Question[];
  /** Whether the template may be selected at all. */
  enabled: boolean;
  /** Stated when a template is disabled, so nobody re-enables it by accident. */
  disabledBecause?: string;
};

const nonEmpty = (f: RevealFacts, q: Question) => (f.answers[q] ?? "").trim().length > 0;

export const TEMPLATES: readonly RevealTemplate[] = [
  /* ── Band 1 · contradictions ───────────────────────────────────────────── */
  {
    code: "RT-01",
    card: "H-020",
    name: "Title/Function Split",
    band: 1,
    tracks: ["early_career", "mid_career", "career_returner"],
    restsOn: ["Q5", "Q6"],
    quotes: ["Q5", "Q6"],
    enabled: true,
    trigger: (f) =>
      (f.q5Style === "title_led" || f.q5Style === "company_led") &&
      (f.q5q6Alignment === "contradictory" || f.q5q6Alignment === "complementary"),
  },
  {
    code: "RT-05",
    card: "H-024",
    name: "Aspiration-Evidence Gap",
    band: 1,
    tracks: ["early_career", "mid_career"],
    restsOn: ["Q4", "Q6"],
    quotes: ["Q4", "Q6"],
    enabled: true,
    trigger: (f) => f.q4ExternalMarkers && f.q5q6Alignment !== "aligned" && nonEmpty(f, "Q6"),
  },
  {
    code: "RT-08",
    card: "H-027",
    name: "Perception Contradiction",
    band: 1,
    tracks: "all",
    restsOn: ["Q5", "Q6", "Q7"],
    quotes: ["Q5", "Q6", "Q7"],
    enabled: true,
    trigger: (f) =>
      f.q5q6Alignment === "contradictory" &&
      (f.q7Locus === "others_perception" || f.q7Locus === "own_communication"),
  },

  /* ── Band 2 · identity reference frame ─────────────────────────────────── */
  {
    code: "RT-11",
    card: "H-030",
    name: 'The "I Should" Signal',
    band: 2,
    tracks: ["undergraduate", "early_career", "mid_career"],
    restsOn: ["Q4", "Q6"],
    quotes: ["Q4", "Q6"],
    enabled: true,
    // H-030: "3+ instances or 1 instance in Q4, where obligation language is most diagnostic."
    trigger: (f) => f.shouldCount >= 3 || f.shouldInQ4,
  },
  {
    code: "RT-15",
    card: "H-034",
    name: "Confident-but-Stuck",
    band: 2,
    tracks: ["mid_career", "executive", "entrepreneur_scaling"],
    restsOn: ["Q5", "Q7"],
    quotes: ["Q5", "Q7"],
    enabled: true,
    trigger: (f) =>
      (f.q5Style === "function_led" || f.q5Style === "impact_led") && f.q7Frustration,
  },

  /* ── Band 3 · track-specific ───────────────────────────────────────────── */
  {
    code: "RT-09",
    card: "H-028",
    name: "Gap Narrator",
    band: 3,
    tracks: ["career_returner"],
    restsOn: ["Q5", "Q6"],
    quotes: ["Q5", "Q6"],
    enabled: true,
    trigger: (f) => f.track === "career_returner" && (f.q7GapIsPrimary || f.q5PastTense),
  },
  {
    code: "RT-10",
    card: "H-029",
    name: "Founder-Identity Blur",
    band: 3,
    tracks: ["entrepreneur_early", "entrepreneur_fundraising", "entrepreneur_scaling"],
    restsOn: ["Q5", "Q6"],
    quotes: ["Q5", "Q6"],
    enabled: true,
    trigger: (f) => f.q5DescribesVenture && nonEmpty(f, "Q6"),
  },

  /* ── Band 4 · structural ───────────────────────────────────────────────── */
  {
    code: "RT-03",
    card: "H-022",
    name: "Scatter Pattern",
    band: 4,
    tracks: ["undergraduate", "early_career", "mid_career"],
    restsOn: ["Q4", "Q5"],
    quotes: ["Q4", "Q5"],
    enabled: true,
    // H-022: "3+ distinct function/role/industry mentions in Q4+Q5 without ranking."
    trigger: (f) => f.breadthCount >= 3 || f.q5Style === "breadth",
  },
  {
    code: "RT-04",
    card: "H-023",
    name: "Strategy-as-Function Confusion",
    band: 4,
    tracks: [
      "mid_career",
      "executive",
      "entrepreneur_early",
      "entrepreneur_fundraising",
      "entrepreneur_scaling",
    ],
    restsOn: ["Q5", "Q6"],
    quotes: ["Q5"],
    enabled: true,
    trigger: (f) => f.strategyAsFunction,
  },
  {
    code: "RT-06",
    card: "H-025",
    name: "The Underseller",
    band: 4,
    tracks: ["undergraduate", "early_career", "career_returner"],
    /*
     * Two statements, not one. Her 24 August ruling: "RT-06 needs to cross-reference Q5
     * and Q6 — the underselling pattern is in the gap between how they present (Q5) and
     * what they're actually good at (Q6), not in Q6 alone."
     */
    restsOn: ["Q5", "Q6"],
    quotes: ["Q5", "Q6"],
    /*
     * ── ENABLED 25 AUGUST, WITH HER CORRECTED COPY ─────────────────────────
     * It sat ineligible because the card inferred from Q6 alone, which IG-INT12 forbids.
     * Her correction supplies both halves — the cross-reference and a narrower trigger:
     *
     *   "Collective attribution ('my team built,' 'we shipped') is cultural, not
     *   minimizing — per IG-S09. RT-06 now fires only on self-deprecation: hedging,
     *   diminishing, qualifying one's own capability."
     *
     * The collective-attribution exclusion was already in the fact extractor: Q6 has the
     * collective clause stripped before minimizers are matched, so "my team built the
     * thing" cannot produce a hit. That was built against IG-S09 rather than against this
     * template, and it turns out to be the thing her correction needed.
     *
     * ── WHY Q5 MUST NOT ITSELF BE A DEFLECTION ────────────────────────────
     * Ours, and it follows from her word "gap". Her copy asserts the two answers are
     * "telling two different stories". If Q5 is also a deflection — "hard to explain",
     * "bit of everything" — there is no gap between presentation and capability, there is
     * uniform low confidence, and the assertion would be Wing inventing a contrast.
     * RT-12 is the template for that case and it already requires deflection.
     */
    enabled: true,
    trigger: (f) =>
      f.q6Minimizers.length > 0 && nonEmpty(f, "Q5") && f.q5Style !== "deflection",
  },
  {
    code: "RT-12",
    card: "H-031",
    name: "Quiet Expert",
    band: 4,
    tracks: ["mid_career", "executive", "career_returner"],
    restsOn: ["Q5", "Q6", "Q7"],
    quotes: ["Q5", "Q6"],
    enabled: true,
    trigger: (f) =>
      (f.q5Style === "deflection" || f.q6Minimizers.length > 0) &&
      f.q6IsDeepExpertise &&
      f.q7WantsAuthority,
  },
  {
    code: "RT-13",
    card: "H-032",
    name: "Active-but-Invisible",
    band: 4,
    tracks: [
      "mid_career",
      "executive",
      "entrepreneur_early",
      "entrepreneur_fundraising",
      "entrepreneur_scaling",
    ],
    restsOn: ["Q4", "Q6", "Q5.5"],
    quotes: ["Q6", "Q5.5"],
    enabled: true,
    trigger: (f) => f.q4WantsVisibility && (f.q6IsDeepExpertise || f.topicHasDepth),
  },

  /* ── Band 5 · versatile fallbacks ──────────────────────────────────────── */
  {
    code: "RT-02",
    card: "H-021",
    name: "Visibility Anxiety",
    band: 5,
    tracks: ["early_career", "mid_career", "career_returner"],
    restsOn: ["Q4", "Q7"],
    quotes: ["Q4", "Q7"],
    enabled: true,
    trigger: (f) => f.q4WantsVisibility && f.q7Anxiety,
  },
  {
    code: "RT-07",
    card: "H-026",
    name: "Past Self / Present Self Divergence",
    band: 5,
    tracks: [
      "mid_career",
      "career_returner",
      "entrepreneur_early",
      "entrepreneur_fundraising",
    ],
    restsOn: ["Q5", "Q4"],
    quotes: ["Q5", "Q4"],
    enabled: true,
    trigger: (f) => f.q5PastTense && nonEmpty(f, "Q4"),
  },
];

/* ── The three criteria ─────────────────────────────────────────────────── */

export type Eligibility = {
  template: RevealTemplate;
  /** (a) trigger condition match. */
  triggered: boolean;
  /** (b) IG-U006: something specific to quote. */
  falsifiable: boolean;
  /** (c) audience track relevance. */
  trackRelevant: boolean;
  eligible: boolean;
  /** Why it was refused, for the report. */
  refusedBecause?: string;
};

/**
 * Whether the template can quote a specific the user would recognise.
 *
 * IG-U006 needs "at least one specific reference that would be demonstrably false if
 * applied to a different user's answers", and every template's copy builds that from
 * a quoted answer. An empty answer is nothing to quote, so a template whose quote
 * slots are blank cannot produce a falsifiable observation however well its trigger
 * fires — RT-14 was retired for exactly this, quoting only a topic noun.
 */
export function falsifiable(template: RevealTemplate, facts: RevealFacts): boolean {
  return template.quotes.every((q) => (facts.answers[q] ?? "").trim().length > 0);
}

export function trackRelevant(template: RevealTemplate, track: AudienceTrack | null): boolean {
  if (template.tracks === "all") return true;
  // An unassigned track cannot rule a template out; a tentative hold is not a refusal.
  if (track === null) return true;
  return template.tracks.indexOf(track) >= 0;
}

export function assess(template: RevealTemplate, facts: RevealFacts): Eligibility {
  const triggered = template.enabled && template.trigger(facts);
  const f = falsifiable(template, facts);
  const rel = trackRelevant(template, facts.track);
  const eligible = template.enabled && triggered && f && rel;
  return {
    template,
    triggered,
    falsifiable: f,
    trackRelevant: rel,
    eligible,
    refusedBecause: !template.enabled
      ? template.disabledBecause
      : !triggered
        ? "trigger conditions not met"
        : !f
          ? `nothing to quote in ${template.quotes.filter((q) => !(facts.answers[q] ?? "").trim()).join(", ")} — IG-U006 needs a specific`
          : !rel
            ? `not offered to ${facts.track}`
            : undefined,
  };
}

/* ── Selection ──────────────────────────────────────────────────────────── */

export type Selection =
  | { outcome: "fire"; template: RevealTemplate; because: string; considered: Eligibility[] }
  | { outcome: "defer"; because: string; considered: Eligibility[] };

/**
 * How specific a template's quotable material is, used only to break a tie within a
 * band. H-019.5: "Select the one with the most specific falsifiable observation — the
 * one that uses the user's most distinctive language."
 *
 * Approximated by how much the user actually wrote in the slots the template quotes.
 * Crude, and it only ever chooses between two templates that both already fit.
 */
function specificity(template: RevealTemplate, facts: RevealFacts): number {
  return template.quotes.reduce(
    (n, q) => n + (facts.answers[q] ?? "").trim().split(/\s+/).filter(Boolean).length,
    0,
  );
}

/**
 * One template, or a deferral.
 *
 * H-019.5's four rules, in its order:
 *   · single clear winner → fire it
 *   · a tie → the most specific falsifiable observation
 *   · nothing eligible → IG-INT06 deferral
 *   · several weak matches → never combine them; "Frankenstein reveals lose coherence"
 *
 * The fourth needs no code, only the absence of any: this returns one template or
 * none, so a hybrid is unrepresentable. It is stated because a later reader looking
 * for the rule should find it enforced rather than forgotten.
 */
export function selectReveal(facts: RevealFacts): Selection {
  const considered = TEMPLATES.map((t) => assess(t, facts));
  const eligible = considered.filter((e) => e.eligible);

  if (!eligible.length) {
    return {
      outcome: "defer",
      because:
        "no template met all three criteria, so IG-INT06 applies — a weak reveal is " +
        "worse than none, and the reveal fires at the start of Foundation 1 instead",
      considered,
    };
  }

  const topBand = Math.min.apply(
    null,
    eligible.map((e) => e.template.band),
  ) as Band;
  const inBand = eligible.filter((e) => e.template.band === topBand);

  if (inBand.length === 1) {
    return {
      outcome: "fire",
      template: inBand[0].template,
      because: `sole eligible template in band ${topBand} (${BAND_MEANING[topBand]})`,
      considered,
    };
  }

  const ranked = inBand
    .slice()
    .sort((a, b) => specificity(b.template, facts) - specificity(a.template, facts));
  const winner = ranked[0];
  const runnerUp = ranked[1];

  return {
    outcome: "fire",
    template: winner.template,
    because:
      `${inBand.length} templates tied in band ${topBand}; ${winner.template.code} has the ` +
      `more specific quotable material (${specificity(winner.template, facts)} words against ` +
      `${specificity(runnerUp.template, facts)} for ${runnerUp.template.code})`,
    considered,
  };
}

/* ── Table invariants ───────────────────────────────────────────────────── */

/**
 * IG-INT12, checked over the table rather than trusted.
 *
 * v3.3: "Where a template quotes an aspiration or self-assessment (Q6, Q7), the
 * inference must rest on the relationship between two statements, never on the
 * content of one." So any template quoting Q6 or Q7 must rest on two or more answers.
 *
 * Returns the offenders rather than throwing, so a test can name them.
 */
export function igInt12Violations(): string[] {
  const out: string[] = [];
  for (const t of TEMPLATES) {
    const quotesSelfAssessment = t.quotes.indexOf("Q6") >= 0 || t.quotes.indexOf("Q7") >= 0;
    if (quotesSelfAssessment && t.restsOn.length < 2) {
      out.push(`${t.code} quotes a self-assessment but rests on only ${t.restsOn.join(", ")}`);
    }
  }
  return out;
}

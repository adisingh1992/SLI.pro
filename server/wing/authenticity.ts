/**
 * The 360Brew authenticity standard (Feature List A4).
 *
 * Pure — zero imports, fully testable.
 *
 * "Content generation outputs updated to conform to the 360Brew authenticity
 * standard — no flagged vocabulary, varied sentence structure, specific rather
 * than abstract, position-taking rather than hedging."
 *
 * ── WHAT THIS IS AND IS NOT ──────────────────────────────────────────────
 * This is a WRITING standard, not LinkedIn's scoring API. The Phyllo/360Brew
 * integration that fetches real scores is C5, Tier 2, and the Strategy doc puts
 * third-party scoring explicitly out of scope for this phase. Nothing here
 * talks to LinkedIn or claims to predict what LinkedIn would score.
 *
 * What it does is check the four properties the spec names, which are the
 * observable characteristics of writing that reads as a person rather than a
 * language model.
 *
 * ── WHY A CHECKER AND NOT JUST PROMPT INSTRUCTIONS ───────────────────────
 * Telling a model "avoid AI-sounding vocabulary" produces content containing
 * "leverage", "delve" and "excited to share" at a rate that has to be seen to
 * be believed. The instruction is necessary and nowhere near sufficient — the
 * flagged words are exactly the ones the model reaches for by default.
 *
 * So generation is instructed AND the output is measured. The check runs after
 * the model, names what it found, and lets the caller regenerate. That loop is
 * the only thing that reliably keeps this vocabulary out.
 *
 * ── IT REPORTS, IT DOES NOT REWRITE ──────────────────────────────────────
 * Every finding names the exact phrase and where it is. Silently substituting
 * words would produce sentences the student never wrote and cannot defend, in
 * a product whose entire premise is that the positioning is genuinely theirs.
 * The student decides.
 */

export type Finding = {
  rule: "vocabulary" | "hedging" | "abstraction" | "monotony" | "engagement_bait";
  /** The exact text that triggered it, so the student can find it. */
  found: string;
  note: string;
};

export type AuthenticityReport = {
  /** 0–100. Heuristic, and honest about being one. */
  score: number;
  findings: Finding[];
  stats: {
    words: number;
    sentences: number;
    /** Standard deviation of sentence length — the variety measure. */
    lengthVariation: number;
    /** Numbers, proper nouns, concrete markers. Specificity proxy. */
    concreteMarkers: number;
  };
  passes: boolean;
};

/**
 * Vocabulary that marks text as machine-written.
 *
 * Not a style preference. These are the words that appear at wildly elevated
 * rates in generated LinkedIn content relative to what people actually write,
 * which is what makes them a signal rather than a matter of taste.
 *
 * Kept as data so Danielle can add to it without a deploy when a new one
 * becomes ubiquitous — this list ages fast.
 */
export const FLAGGED_VOCABULARY: { phrase: string; why: string }[] = [
  { phrase: "delve", why: "the single most recognisable generated-text marker" },
  { phrase: "leverage", why: "corporate filler; 'use' is the word" },
  { phrase: "utilize", why: "'use' is the word" },
  { phrase: "spearhead", why: "CV-speak nobody says out loud" },
  { phrase: "passionate about", why: "claims a feeling instead of showing evidence" },
  { phrase: "thrilled to announce", why: "the canonical LinkedIn opener" },
  { phrase: "excited to share", why: "the canonical LinkedIn opener" },
  { phrase: "humbled to", why: "announces humility, which undoes it" },
  { phrase: "game-changer", why: "abstract intensifier carrying no information" },
  { phrase: "game changer", why: "abstract intensifier carrying no information" },
  { phrase: "unlock", why: "metaphor doing the work a specific claim should do" },
  { phrase: "elevate", why: "metaphor doing the work a specific claim should do" },
  { phrase: "synergy", why: "consultancy filler" },
  { phrase: "fast-paced world", why: "opener that says nothing" },
  { phrase: "in today's", why: "opener that says nothing" },
  { phrase: "resonate", why: "vague — say what actually happened" },
  { phrase: "tapestry", why: "unmistakably generated" },
  { phrase: "testament to", why: "unmistakably generated" },
  { phrase: "navigate the", why: "metaphor standing in for a specific action" },
  { phrase: "landscape", why: "abstraction; name the actual thing" },
  { phrase: "robust", why: "sounds technical, means nothing here" },
  { phrase: "seamless", why: "marketing adjective" },
  { phrase: "cutting-edge", why: "marketing adjective" },
  { phrase: "revolutionize", why: "overclaim" },
  { phrase: "empower", why: "abstraction; say what someone can now do" },
  { phrase: "dive deep", why: "filler" },
  { phrase: "deep dive", why: "filler" },
  { phrase: "circle back", why: "meeting-speak" },
  { phrase: "at the end of the day", why: "filler" },
  { phrase: "moving forward", why: "filler" },
  { phrase: "journey", why: "over-used to the point of invisibility" },
  { phrase: "realm", why: "unmistakably generated" },
  { phrase: "underscore", why: "unmistakably generated" },
  { phrase: "myriad", why: "unmistakably generated" },
  { phrase: "pivotal", why: "inflated" },
  { phrase: "meticulous", why: "inflated" },
  { phrase: "crucial", why: "inflated; say why it matters instead" },
];

/** Engagement bait — LinkedIn's own worst habit, and instantly recognisable. */
export const ENGAGEMENT_BAIT: string[] = [
  "thoughts?",
  "agree?",
  "who else",
  "let that sink in",
  "read that again",
  "am i the only one",
  "drop a comment",
  "tag someone",
  "like if you",
  "repost if",
];

/** Hedges. The spec asks for position-taking, and these are its opposite. */
export const HEDGES: string[] = [
  "i think maybe",
  "it could be argued",
  "in my humble opinion",
  "just my two cents",
  "kind of",
  "sort of",
  "somewhat",
  "arguably",
  "perhaps",
  "it seems that",
  "i might be wrong",
  "correct me if",
  "not sure if",
];

/* ── Measurement ────────────────────────────────────────────────────────── */

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Concrete markers — a proxy for "specific rather than abstract".
 *
 * Numbers, percentages, currency, dates, and capitalised words mid-sentence
 * (which are usually names of companies, tools, places or people). Crude, and
 * deliberately so: the alternative is asking a model whether text is specific,
 * which is the thing being checked in the first place.
 */
function countConcreteMarkers(text: string): number {
  let count = 0;
  count += (text.match(/\b\d+(\.\d+)?%?\b/g) ?? []).length;
  count += (text.match(/[$£€]\s?\d/g) ?? []).length;

  // Capitalised words that are not sentence-initial.
  for (const sentence of sentencesOf(text)) {
    const words = sentence.split(/\s+/).slice(1);
    count += words.filter((w) => /^[A-Z][a-z]{2,}/.test(w)).length;
  }

  return count;
}

/**
 * Checks a piece of content against the standard.
 *
 * `passes` is deliberately generous. This is a heuristic, and a false positive
 * that blocks a student's genuinely good post is worse than a borderline one
 * getting through — the report is advisory, and the student is the one who
 * decides what they publish under their own name.
 */
export function checkAuthenticity(text: string): AuthenticityReport {
  const findings: Finding[] = [];
  const lower = text.toLowerCase();

  for (const { phrase, why } of FLAGGED_VOCABULARY) {
    // Word-boundary matched: "underscore" should not fire on "underscored" is
    // wrong — it should. But "elevate" must not fire inside "elevator".
    const pattern = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi");
    const matches = text.match(pattern);
    if (matches) {
      findings.push({
        rule: "vocabulary",
        found: matches[0],
        note: why,
      });
    }
  }

  for (const bait of ENGAGEMENT_BAIT) {
    if (lower.includes(bait)) {
      findings.push({
        rule: "engagement_bait",
        found: bait,
        note: "engagement bait — reads as someone gaming the feed",
      });
    }
  }

  for (const hedge of HEDGES) {
    if (lower.includes(hedge)) {
      findings.push({
        rule: "hedging",
        found: hedge,
        note: "hedging — take the position or cut the sentence",
      });
    }
  }

  const sentences = sentencesOf(text);
  const words = wordsOf(text);
  const lengths = sentences.map((s) => wordsOf(s).length);
  const lengthVariation = stdDev(lengths);
  const concreteMarkers = countConcreteMarkers(text);

  /*
   * Monotony. Generated prose tends toward sentences of near-identical length,
   * which is what produces its distinctive drone. Only checked once there are
   * enough sentences for the measure to mean anything.
   */
  if (sentences.length >= 4 && lengthVariation < 3.5) {
    findings.push({
      rule: "monotony",
      found: `${sentences.length} sentences, variation ${lengthVariation.toFixed(1)}`,
      note: "every sentence is about the same length — vary the rhythm, use a short one",
    });
  }

  // Specificity, scaled to length: a 40-word post needs one concrete detail,
  // a 200-word one needs more.
  const expectedMarkers = Math.max(1, Math.floor(words.length / 60));
  if (words.length >= 40 && concreteMarkers < expectedMarkers) {
    findings.push({
      rule: "abstraction",
      found: `${concreteMarkers} specific detail(s) in ${words.length} words`,
      note: "too abstract — name a number, a company, a tool, a person, a date",
    });
  }

  // Score: each finding costs, vocabulary hits costing most because they are
  // the most recognisable and the easiest to fix.
  const cost = findings.reduce((total, f) => {
    if (f.rule === "vocabulary" || f.rule === "engagement_bait") return total + 12;
    if (f.rule === "hedging") return total + 8;
    return total + 10;
  }, 0);

  const score = Math.max(0, 100 - cost);

  return {
    score,
    findings,
    stats: {
      words: words.length,
      sentences: sentences.length,
      lengthVariation: Math.round(lengthVariation * 10) / 10,
      concreteMarkers,
    },
    passes: score >= 70,
  };
}

/** The standard, rendered for a generation prompt. */
export function renderStandardForPrompt(): string {
  return `── THE 360BREW AUTHENTICITY STANDARD ───────────────────────────────────
Content must read as a person wrote it, because a person is going to publish it
under their own name and be asked about it.

1. BANNED VOCABULARY. Do not use any of these, in any form:
${FLAGGED_VOCABULARY.map((f) => f.phrase).join(", ")}.

2. NO ENGAGEMENT BAIT. Never end with "Thoughts?", "Agree?", "Who else...",
   "Let that sink in", or any variant. It reads as someone gaming the feed.

3. VARY THE SENTENCE LENGTH. Generated text drones because every sentence is
   the same length. Put a four-word sentence next to a twenty-word one. Like
   this.

4. BE SPECIFIC. Every post needs at least one concrete anchor — a number, a
   company, a tool, a date, a named person. "Improved efficiency" is nothing.
   "Cut chart review from six hours to under one" is the post.

5. TAKE A POSITION. No "perhaps", no "arguably", no "in my humble opinion".
   If the claim is not worth stating plainly, it is not worth posting.

6. NO HASHTAG WALLS. Three at most, and only if they are genuinely searched.`;
}

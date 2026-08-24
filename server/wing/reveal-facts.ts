/**
 * The classified answers a reveal template's trigger is written against.
 *
 * Pure. Reads only answer text and the audience track — no database, no model.
 *
 * ── WHY THIS IS A SEPARATE MODULE ────────────────────────────────────────
 * v1.8's `detection_method` components do not test raw text. They test classifications:
 * "Q5 classification = title_led or company_led AND Q6 strength_type ≠ Q5 function
 * implied by title", "Q4 goal_category = visibility", "Tense detection in Q5". Fourteen
 * templates read about a dozen such facts between them, and several read the same one.
 *
 * The identity reference frame reads most of them too — v3.3's signal table is Q5
 * leads with company/title vs function/impact, Q4 goal framing, Q6 others-praise vs
 * self-knowledge, Q7 others' misperception vs own communication. Classifying twice in
 * two modules is how the two quietly disagree about the same answer, so it is
 * classified once here.
 *
 * ── WHAT THESE ARE NOT ───────────────────────────────────────────────────
 * Not a model. Every fact is a keyword or shape test over one answer, and every one of
 * them is wrong sometimes. That is tolerable because of what sits downstream: a
 * template only fires when several facts agree, IG-INT06 defers rather than guessing,
 * and IG-U006 requires a quoted specific the user can recognise or reject. A
 * misclassification produces a deferred reveal or a reveal the user corrects, both of
 * which the methodology treats as acceptable outcomes.
 */

import type { Answers, AudienceTrack, Question } from "./audience-track";

/** Q5's shape. v1.8 H-015 success_criteria names exactly these six. */
export type PresentationStyle =
  | "title_led"
  | "company_led"
  | "function_led"
  | "impact_led"
  | "deflection"
  | "breadth"
  | "unknown";

/** H-017's `q5_q6_alignment`. */
export type Alignment = "aligned" | "complementary" | "contradictory" | "unknown";

/** Where Q7 locates the problem. v3.3's identity-frame table reads this. */
export type GapLocus = "others_perception" | "own_communication" | "none" | "unknown";

export type RevealFacts = {
  answers: Answers;
  track: AudienceTrack | null;

  /* ── Q5 ─────────────────────────────────────────────────────────────── */
  q5Style: PresentationStyle;
  /** RT-07: Q5 describes the self in past tense. */
  q5PastTense: boolean;
  /** RT-10: Q5's subject is the venture rather than the founder. */
  q5DescribesVenture: boolean;
  /** RT-03: distinct functions or industries named across Q4 and Q5. */
  breadthCount: number;

  /* ── Q6 ─────────────────────────────────────────────────────────────── */
  /** RT-06: self-deprecating hedges. Collective attribution is NOT one, per IG-S09. */
  q6Minimizers: string[];
  /** RT-12: a specific domain rather than a trait. */
  q6IsDeepExpertise: boolean;
  /** v3.3 identity table: praised-by-others versus known-about-self. */
  q6SourceIsOthers: boolean;
  /**
   * The other half of that row, detected positively rather than as a complement.
   *
   * "Hidden strength = what they know about themselves" is not simply the absence of
   * praise-by-others: a blank Q6 has neither, and treating the complement as internal
   * evidence would make silence read as self-authorship — the opposite of the
   * asymmetric-error rule, which says to default to external when uncertain.
   */
  q6SelfKnown: boolean;

  /* ── Q4 ─────────────────────────────────────────────────────────────── */
  /** RT-02, RT-13: the goal is visibility. */
  q4WantsVisibility: boolean;
  /** RT-05: driven by salary, title or prestige. */
  q4ExternalMarkers: boolean;
  /** v3.3 identity table: "goal framed as self-authored aspiration" (internal). */
  q4SelfAuthored: boolean;

  /* ── Q7 ─────────────────────────────────────────────────────────────── */
  q7Locus: GapLocus;
  /** RT-02: worry about how being visible will land. */
  q7Anxiety: boolean;
  /** RT-12: wants authority or to be taken seriously. */
  q7WantsAuthority: boolean;
  /** RT-15: dissatisfaction with how clear positioning is landing. */
  q7Frustration: boolean;
  /** RT-09: the gap itself is the stated problem. */
  q7GapIsPrimary: boolean;

  /* ── Across answers ─────────────────────────────────────────────────── */
  /** RT-11. H-030's threshold: 3+ anywhere, or 1 in Q4 where it is most diagnostic. */
  shouldCount: number;
  shouldInQ4: boolean;
  /** v3.3 identity table: "I believe" / "I decided" / "I know" language (internal). */
  selfAuthoredCount: number;
  /** RT-04: "strategy" or "leadership" with no function attached. */
  strategyAsFunction: boolean;
  /** RT-13: Q5.5 shows real depth rather than an aspiration. */
  topicHasDepth: boolean;
  q5q6Alignment: Alignment;
};

/**
 * Collapses spelled-out forms onto the contracted ones the patterns below expect.
 *
 * ── WHY THIS EXISTS RATHER THAN A FIX PER PATTERN ────────────────────────
 * Four separate rules in this codebase have now been written against `haven'?t`,
 * `i'?m` or `isn'?t` and silently matched nothing when a user wrote "have not", "I am"
 * or "is not" — a missing `i` flag on one, a missing "I am" branch on another, and
 * twice here. Each was invisible: the rule did not error, it just never fired, and the
 * signal it was supposed to produce was absent rather than wrong.
 *
 * Normalising the input once ends the class. Contracting rather than expanding, because
 * every pattern already spells its apostrophe optionally — `haven'?t` matches both
 * "havent" and "haven't" — so contracting the input makes them all accept the long
 * form too, with no pattern rewritten.
 */
export function contract(text: string): string {
  return text
    .replace(/\bcannot\b/gi, "can't")
    .replace(/\b(has|have|had|do|does|did|is|are|was|were|would|could|should|will|must|ai)\s+not\b/gi, (_m, v) =>
      v.toLowerCase() === "will" ? "won't" : `${v}n't`,
    )
    .replace(/\b(I|we|they|you)\s+am\b/gi, "$1'm")
    .replace(/\b(I|we|they|you)\s+have\b/gi, "$1've")
    .replace(/\b(we|they|you)\s+are\b/gi, "$1're")
    .replace(/\b(I|we|they|you|he|she|it)\s+will\b/gi, "$1'll");
}

const t = (a: Answers, q: Question) => contract(a[q] ?? "");
const hit = (re: RegExp, s: string) => re.test(s);
const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;

/* ── Q5 shape ───────────────────────────────────────────────────────────── */

const DEFLECTION = /\b(?:kind of|sort of|hard to explain|i hate that question|depends|hmm|i (?:don'?t|never) (?:really )?know what to say)\b/i;
const BREADTH = /\b(?:a (?:little|bit) of everything|all sorts|lots of things|wear (?:a lot of|many) hats|bit of this)\b/i;
/*
 * "I'm a marketing manager at Stripe" is title-led, not function-led. It contains a
 * function word, and reading it as functional ownership inverts the identity-frame
 * signal H-015 draws from this question: title-led means identity anchored to the
 * employer (external), function-led means the user owns the function (internal). The
 * trailing `at <Capital>` is allowed so the title survives its company.
 */
const TITLE_LED = /^\s*(?:i'?m|i am)\s+(?:an?|the)\s+[a-z][a-z ]{2,30}?(?:\s+(?:at|for)\s+[A-Z]|\s*$|[.,])/i;
/** A company with no title attached. */
const COMPANY_LED = /^\s*(?:i work (?:at|for)|i'?m at)\s+[A-Z]/i;
const IMPACT_LED = /\b(?:i help|i make sure|i get|i turn|i stop|i figure out|so that|which means)\b/i;
const FUNCTION_WORDS = /\b(?:finance|marketing|operations|product|sales|engineering|design|data|legal|hr|people|supply chain|logistics|research)\b/gi;

function presentationStyle(q5: string): PresentationStyle {
  if (!q5.trim()) return "unknown";
  if (hit(BREADTH, q5)) return "breadth";
  if (hit(DEFLECTION, q5)) return "deflection";
  /*
   * Order matters, and it is not the obvious one.
   *
   * Impact first: "I help companies figure out where to put their money" is impact-led
   * even though it names no function, and H-015 calls the difference between that and
   * "I work in finance" the whole diagnostic value of the question.
   *
   * Then title, then company, and only then a bare function word. Checking function
   * first — which is what this did originally — classified every job title containing
   * a function as functional ownership, inverting the identity-frame signal for the
   * most common answer shape there is.
   */
  if (hit(IMPACT_LED, q5)) return "impact_led";
  if (hit(TITLE_LED, q5)) return "title_led";
  if (hit(COMPANY_LED, q5)) return "company_led";
  if (count(FUNCTION_WORDS, q5) > 0) return "function_led";
  return "unknown";
}

/* ── The rest ───────────────────────────────────────────────────────────── */

const PAST_TENSE_SELF = /\b(?:i (?:was|used to (?:be|run|work|lead|manage))|i ran|i led|i managed|my last role|before (?:my|the) (?:break|gap))\b/i;
const VENTURE_SUBJECT = /\b(?:we'?re (?:building|a|an)|our (?:startup|company|platform|product)|the company (?:is|does)|we (?:do|make|help))\b/i;

/*
 * IG-S09, and RT-06's own note: "Collective attribution ('people tell me,' 'my team
 * does,' 'we built') is NOT minimizing. Do NOT fire RT-06 on collective attribution."
 * So the minimizer test runs on a string with collective phrases removed first —
 * otherwise "my team says I'm pretty good at this" reads as a hedge when the hedging
 * is cultural rather than self-deprecating.
 */
const COLLECTIVE = /\b(?:people (?:tell|say)|my team|we built|we (?:did|made)|colleagues (?:say|tell))\b[^.,;]*/gi;
const MINIMIZERS = /\b(?:pretty good|kind of good|i guess i'?m|not really that|it'?s not a big deal|just|only|somewhat decent|i suppose)\b/gi;

const DEEP_EXPERTISE = /\b(?:years of|deep|specialis\w+|specializ\w+|niche|technical|domain|regulat\w+|architect\w+)\b/i;
const PRAISED_BY_OTHERS = /\b(?:people (?:tell|say|come to) me|i'?m known for|others (?:say|think)|my (?:team|boss|colleagues) (?:say|think))\b/i;
const SELF_KNOWN = /\b(?:i know (?:i|that i)|i'?ve always been|i can just|i'?m good at|i'?m the one who|what i'?m actually good at|i (?:trust|back) my)\b/i;

const WANTS_VISIBILITY = /\b(?:more visible|visibility|be seen|get noticed|build (?:a|my) (?:profile|presence|following)|put myself out there|post more)\b/i;
const EXTERNAL_MARKERS = /\b(?:salary|comp\b|compensation|title|senior title|promotion to|prestige|big name|brand name|top firm)\b/i;
/*
 * Her row is "goal framed as self-authored aspiration". Decided-by-me language, not
 * merely a goal that happens to lack external markers — same reason as q6SelfKnown.
 */
const SELF_AUTHORED_GOAL = /\b(?:i(?:'?ve)? decided|i want to build|i'?ve chosen|what i actually want|on my own terms|i'?m done (?:with|pretending))\b/i;
const SELF_AUTHORED_ANY = /\bi (?:believe|decided|know|want to)\b|\bi'?ve decided\b|\bmy framework\b/gi;

const GAP_OTHERS = /\b(?:people don'?t (?:see|realise|realize|know)|they think i'?m|i'?m seen as|misunderstood|underestimated|pigeonhole)\b/i;
const GAP_OWN = /\b(?:i haven'?t (?:said|explained|articulated)|i'?m not (?:good at|clear)|i struggle to (?:explain|describe)|my own fault|i need to (?:say|explain))\b/i;
const ANXIETY = /\b(?:bragging|showing off|cringe|cringey|self-?promot\w+|imposter|don'?t know what (?:i'?d|to) say|uncomfortable|awkward)\b/i;
const AUTHORITY = /\b(?:taken seriously|authority|credibility|respected|expert|senior enough|listened to)\b/i;
const FRUSTRATION = /\b(?:(?:not|isn'?t|aren'?t|nothing(?: is)?) (?:landing|working|sticking)|stuck|frustrat\w+|no(?:t getting)? traction|nothing happens|wrong conclusions?|not getting through)\b/i;
const GAP_PRIMARY = /\b(?:the gap|my (?:career )?break|time (?:away|out)|explain(?:ing)? (?:the|my) (?:gap|absence)|why i (?:left|stepped))\b/i;

const SHOULD = /\b(?:i should|i need to|i'?m supposed to|people expect me to|i ought to|expected of me)\b/gi;
const STRATEGY_BARE = /\b(?:i'?m in strategy|my function is (?:strategy|leadership)|i do strategic planning|i'?m a strategy (?:person|guy|lead)|director of strategy|i'?m in leadership)\b/i;
const STRATEGY_ATTACHED = /\b(?:marketing|finance|product|sales|operations|brand|content|supply chain) strategy\b/i;
const TOPIC_DEPTH = /\b(?:in|for|within|across)\b|\bhow\b|—|,/;

/**
 * Distinct function words named across Q4 and Q5 — RT-03's "3+ distinct
 * function/role/industry mentions" threshold.
 *
 * Written with `.match()` and an indexOf dedupe rather than spreading `matchAll` into a
 * Set. The repo compiles with `lib: esnext` and no `target`, which means ES5 output
 * against modern typings: `matchAll` exists, and spreading its iterator is TS2802. The
 * first version of this line did exactly that and added two errors to a ratcheted
 * baseline.
 */
function distinctFunctions(q4: string, q5: string): number {
  // Annotated: `?? []` alone infers never[], and concat then refuses the other side.
  const inQ4: string[] = q4.match(FUNCTION_WORDS) ?? [];
  const inQ5: string[] = q5.match(FUNCTION_WORDS) ?? [];
  const found = inQ4.concat(inQ5).map((w) => w.toLowerCase());
  const distinct: string[] = [];
  for (const w of found) if (distinct.indexOf(w) < 0) distinct.push(w);
  return distinct.length;
}

export function revealFacts(answers: Answers, track: AudienceTrack | null): RevealFacts {
  const q4 = t(answers, "Q4");
  const q5 = t(answers, "Q5");
  const q55 = t(answers, "Q5.5");
  const q6 = t(answers, "Q6");
  const q7 = t(answers, "Q7");
  const all = [t(answers, "Q1"), q4, q5, q6, q7].join(" \n ");  // already normalised by t()

  const q5Style = presentationStyle(q5);
  const q6Clean = q6.replace(COLLECTIVE, "");
  const q6Minimizers = (q6Clean.match(MINIMIZERS) ?? []).map((m) => m.trim());

  const q7Locus: GapLocus = hit(GAP_OTHERS, q7)
    ? "others_perception"
    : hit(GAP_OWN, q7)
      ? "own_communication"
      : /\b(?:nothing|i'?m fine|no complaints)\b/i.test(q7)
        ? "none"
        : q7.trim()
          ? "unknown"
          : "unknown";

  /*
   * Alignment is the one fact that compares two answers rather than reading one, and
   * it is the fact the most templates depend on. Deliberately coarse: a shared
   * function word between Q5 and Q6 is alignment, a title-or-company-led Q5 against
   * any substantive Q6 is a contradiction, and everything else is complementary.
   * H-017 asks for exactly three values and the templates only branch on
   * contradictory-or-complementary versus aligned.
   */
  const q5Functions = (q5.match(FUNCTION_WORDS) ?? []).map((w) => w.toLowerCase());
  const q6Functions = (q6.match(FUNCTION_WORDS) ?? []).map((w) => w.toLowerCase());
  const shared = q5Functions.some((f) => q6Functions.indexOf(f) >= 0);
  const q5q6Alignment: Alignment = !q5.trim() || !q6.trim()
    ? "unknown"
    : shared
      ? "aligned"
      : q5Style === "title_led" || q5Style === "company_led" || q5Style === "deflection"
        ? "contradictory"
        : "complementary";

  return {
    answers,
    track,
    q5Style,
    q5PastTense: hit(PAST_TENSE_SELF, q5),
    q5DescribesVenture: hit(VENTURE_SUBJECT, q5),
    breadthCount: distinctFunctions(q4, q5),
    q6Minimizers,
    q6IsDeepExpertise: hit(DEEP_EXPERTISE, q6),
    q6SourceIsOthers: hit(PRAISED_BY_OTHERS, q6),
    q6SelfKnown: hit(SELF_KNOWN, q6),
    q4WantsVisibility: hit(WANTS_VISIBILITY, q4),
    q4ExternalMarkers: hit(EXTERNAL_MARKERS, q4),
    q4SelfAuthored: hit(SELF_AUTHORED_GOAL, q4),
    q7Locus,
    q7Anxiety: hit(ANXIETY, q7),
    q7WantsAuthority: hit(AUTHORITY, q7),
    q7Frustration: hit(FRUSTRATION, q7),
    q7GapIsPrimary: hit(GAP_PRIMARY, q7),
    shouldCount: count(SHOULD, all),
    shouldInQ4: hit(/\b(?:i should|i need to|i'?m supposed to|people expect me to)\b/i, q4),
    selfAuthoredCount: count(SELF_AUTHORED_ANY, all),
    strategyAsFunction: hit(STRATEGY_BARE, q5 + " " + q6) && !hit(STRATEGY_ATTACHED, q5 + " " + q6),
    topicHasDepth: q55.trim().split(/\s+/).length >= 3 && hit(TOPIC_DEPTH, q55),
    q5q6Alignment,
  };
}

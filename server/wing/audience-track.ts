/**
 * Audience track detection (v3.3, "Audience Track Detection Logic").
 *
 * Pure — no imports, no database, no model. Eight tracks, a two-signal threshold, and
 * her four resolved edge cases.
 *
 * ── WHY THE INPUT IS ONLY ANSWER TEXT ────────────────────────────────────
 * IG-INT03: "Track assignment from answers only. Never from name, gender, age, or
 * institutional profile appearance. A user named 'Maria' is not more likely to be a
 * career returner."
 *
 * A runtime check cannot enforce that — it would have to be told what a name is. So
 * the constraint is structural instead: `Answers` carries the text of her eight
 * questions and nothing else. There is no field a name could arrive in, which makes
 * the violation unwriteable rather than merely forbidden.
 *
 * Institutional context is deliberately absent too, even though Q3 collects it. v3.3
 * is explicit: "Institutional context does not determine audience track. A Haas MBA
 * is 'early career,' not 'undergraduate.' Track comes from Q2; institutional context
 * is a separate routing dimension."
 *
 * ── WHY TWO SIGNALS MEANS TWO QUESTIONS ──────────────────────────────────
 * "Two clear signals before assigning a track. One signal produces a tentative hold."
 * Her table lists them per question — Q2 signals, Q4 signals, confirming signals —
 * so a signal is a question that pointed somewhere, not a keyword that matched.
 *
 * That distinction matters: one discursive answer mentioning a raise, a team and a
 * pivot would otherwise confirm three tracks on its own. Counting distinct questions
 * makes corroboration mean corroboration.
 */

export type AudienceTrack =
  | "undergraduate"
  | "early_career"
  | "mid_career"
  | "executive"
  | "entrepreneur_early"
  | "entrepreneur_fundraising"
  | "entrepreneur_scaling"
  | "career_returner";

/** Her question identifiers. The only thing this module is allowed to read. */
export type Question = "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q5.5" | "Q6" | "Q7";

/** Answer text, keyed by question. No names, no profile, no demographics. */
export type Answers = Partial<Record<Question, string>>;

export type TrackSignal = {
  track: AudienceTrack;
  question: Question;
  /** The words that matched, for the report and for a human checking a bad call. */
  matched: string;
  why: string;
};

export type TrackVerdict = {
  /** Null until two questions agree. A tentative hold still names its candidate. */
  track: AudienceTrack | null;
  confidence: "confirmed" | "tentative" | "none";
  /** The candidate under a tentative hold, or the confirmed track. */
  candidate: AudienceTrack | null;
  signals: TrackSignal[];
  /** Which edge-case rule decided it, when one did. */
  resolvedBy?: string;
};

type Rule = {
  track: AudienceTrack;
  question: Question;
  match: RegExp;
  why: string;
};

/*
 * One rule per cell of her detection table. Ordered by track so the table can be
 * read against the spec side by side.
 */
const RULES: readonly Rule[] = [
  /* ── Undergraduate ─────────────────────────────────────────────────────── */
  { track: "undergraduate", question: "Q2", match: /\b(?:undergrad(?:uate)?|freshman|sophomore|junior year|senior year|i'?m a student|still (?:at|in) (?:uni|college|school))\b/i, why: "Q2 names undergraduate enrolment" },
  { track: "undergraduate", question: "Q4", match: /\b(?:first job|internship|graduat(?:e|ing|ion)|recruiting season|figuring out what i want to do)\b/i, why: "Q4 is pre-first-role" },
  { track: "undergraduate", question: "Q6", match: /\b(?:coursework|class project|group project|my major|society|student (?:society|club))\b/i, why: "Q6 evidence is coursework rather than work" },

  /* ── Early career ──────────────────────────────────────────────────────── */
  { track: "early_career", question: "Q2", match: /\b(?:working full[- ]time|first (?:proper )?job|(?:one|two|three|four|1|2|3|4) years?|mba|grad scheme|analyst|associate)\b/i, why: "Q2 shows a short but real working history" },
  { track: "early_career", question: "Q4", match: /\b(?:next role|promotion|stand(?:ing)? out|get noticed|move (?:up|internally)|change (?:jobs|companies))\b/i, why: "Q4 is a next-step goal" },
  {
    track: "early_career",
    question: "Q5",
    /*
     * Deliberately the only case-sensitive rule: the trailing [A-Z] is the signal, a
     * capitalised employer name after "at". So the pronoun is spelled [Ii] rather than
     * reaching for the /i flag, which would also make the employer test meaningless.
     * Written without it first, this matched nothing at all — every real answer starts
     * with a capital I. "I am" spelled out was missed for the same reason: real users
     * write both, and only "I'm" was accepted.
     */
    match: /\b(?:[Ii]'?m|[Ii] am) (?:an?|the) [a-z ]{2,24} at [A-Z]/,
    why: "Q5 leads with title plus company",
  },

  /* ── Mid-career ────────────────────────────────────────────────────────── */
  { track: "mid_career", question: "Q2", match: /\b(?:manag(?:e|ing|er) a team|(?:eight|nine|ten|twelve|fifteen|[5-9]|1[0-5]) years?|multiple roles|team lead|head of)\b/i, why: "Q2 shows tenure or management" },
  { track: "mid_career", question: "Q4", match: /\b(?:hit a ceiling|plateau|strategic positioning|leadership credibility|taken more seriously|next level)\b/i, why: "Q4 is a ceiling or credibility goal" },
  { track: "mid_career", question: "Q7", match: /\b(?:seen as strategic|not just operational|more than my function|beyond my team)\b/i, why: "Q7 is perception at a professional rather than market scale" },

  /* ── Executive ─────────────────────────────────────────────────────────── */
  { track: "executive", question: "Q2", match: /\b(?:c-?suite|chief [a-z]+ officer|\bceo\b|\bcfo\b|\bcto\b|\bcoo\b|\bcmo\b|\bvp\b|vice president|svp|evp|board member|managing director|partner at)\b/i, why: "Q2 names a senior title" },
  { track: "executive", question: "Q4", match: /\b(?:legacy|board (?:seat|position|role)|advisory|non-?exec|what'?s next after this|portfolio career)\b/i, why: "Q4 is a legacy or board goal" },
  { track: "executive", question: "Q7", match: /\b(?:in (?:my|the) (?:industry|market|sector)|industry-?wide|market perception|thought leader in)\b/i, why: "Q7 is perception at market scale" },

  /* ── Entrepreneur, early ───────────────────────────────────────────────── */
  { track: "entrepreneur_early", question: "Q2", match: /\b(?:building something|pre-?revenue|idea stage|just started|working on my own thing|side project turned)\b/i, why: "Q2 is pre-revenue building" },
  { track: "entrepreneur_early", question: "Q4", match: /\b(?:validat\w+|first customers?|first users?|product[- ]market fit|get it off the ground)\b/i, why: "Q4 is validation or first customers" },
  { track: "entrepreneur_early", question: "Q5", match: /\b(?:we'?re building|we'?re a|our (?:startup|platform|product|company)|the company (?:is|does))\b/i, why: "Q5 describes the venture rather than the founder" },

  /* ── Entrepreneur, fundraising ─────────────────────────────────────────── */
  { track: "entrepreneur_fundraising", question: "Q2", match: /\b(?:rais(?:e|ing)|investors?|\bvc\b|seed round|series [a-d]\b|pitch(?:ing)? deck|term sheet)\b/i, why: "Q2 mentions raising or investors" },
  { track: "entrepreneur_fundraising", question: "Q4", match: /\b(?:clos(?:e|ing) (?:the|our) round|investor positioning|telling our story|in front of investors|fundrais\w+)\b/i, why: "Q4 is investor-facing" },

  /* ── Entrepreneur, scaling ─────────────────────────────────────────────── */
  { track: "entrepreneur_scaling", question: "Q2", match: /\b(?:hiring|we'?re \d+ people|grew the team|post-?revenue|scaling)\b/i, why: "Q2 shows a team past the early stage" },
  { track: "entrepreneur_scaling", question: "Q4", match: /\b(?:founder[- ]to[- ]leader|can'?t do everything|build(?:ing)? the team|step back from|delegate)\b/i, why: "Q4 is the founder-to-leader shift" },
  { track: "entrepreneur_scaling", question: "Q7", match: /\b(?:my team (?:sees|thinks|perceives)|the people i hired|how my (?:team|staff))\b/i, why: "Q7 is about how the team perceives them" },

  /* ── Career returner ───────────────────────────────────────────────────── */
  { track: "career_returner", question: "Q2", match: /\b(?:career break|coming back|been out of|time (?:away|out)|took (?:a|some) (?:break|time)|on a break|stepped away|maternity|paternity|caring for)\b/i, why: "Q2 names a break" },
  { track: "career_returner", question: "Q4", match: /\b(?:re-?entry|get back (?:in|into)|explain the gap|back into the market|returning to work)\b/i, why: "Q4 is a re-entry goal" },
  { track: "career_returner", question: "Q5", match: /\bi (?:was|used to (?:be|run|work|lead)|ran|led)\b/i, why: "Q5 describes the self in past tense" },
  { track: "career_returner", question: "Q7", match: /\b(?:the gap|my (?:career )?break|why i (?:left|stepped)|explain(?:ing)? (?:the|my) (?:gap|time))\b/i, why: "Q7 makes the gap the primary problem" },
];

/** Every rule that fired, at most one per track per question. */
export function signalsFrom(answers: Answers): TrackSignal[] {
  const out: TrackSignal[] = [];
  const seen: Record<string, true> = {};
  for (const rule of RULES) {
    const text = answers[rule.question];
    if (!text) continue;
    const m = rule.match.exec(text);
    if (!m) continue;
    const key = rule.track + "|" + rule.question;
    if (seen[key]) continue;
    seen[key] = true;
    out.push({ track: rule.track, question: rule.question, matched: m[0], why: rule.why });
  }
  return out;
}

/** Distinct questions pointing at each track. */
export function tallyByTrack(signals: readonly TrackSignal[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of signals) counts[s.track] = (counts[s.track] ?? 0) + 1;
  return counts;
}

const has = (signals: readonly TrackSignal[], track: AudienceTrack) =>
  signals.some((s) => s.track === track);

/**
 * Her four resolved edge cases, applied in order, only when the leaders tie.
 *
 * Kept as an explicit ordered list rather than folded into the rule weights: each
 * one is a documented decision with a stated reason, and a reader comparing this to
 * v3.3 should be able to find all four.
 */
function resolveTie(
  leaders: AudienceTrack[],
  signals: readonly TrackSignal[],
  answers: Answers,
): { track: AudienceTrack; why: string } | null {
  const is = (t: AudienceTrack) => leaders.indexOf(t) >= 0;

  // "MBA students working full-time → early career (professional experience is primary)"
  if (is("undergraduate") && is("early_career")) {
    return {
      track: "early_career",
      why: "undergraduate and early career both fired; professional experience is primary",
    };
  }

  // "Undergrads with entrepreneurial experience → entrepreneur (early) if two signals, else hold"
  if (is("undergraduate") && is("entrepreneur_early")) {
    return {
      track: "entrepreneur_early",
      why: "undergraduate and entrepreneur both fired with two signals each; entrepreneur wins",
    };
  }

  /*
   * "Mid-career saying 'starting over' → career returner if prior evidence exists,
   * early career if not (Q5/Q6 disambiguate)."
   *
   * Prior evidence is a past-tense self-description or off-resume capability, which
   * is what the career_returner Q5 rule already detects — so the presence of that
   * specific signal is the disambiguator rather than a second guess at the text.
   */
  if (is("career_returner") && (is("mid_career") || is("early_career"))) {
    const priorEvidence = signals.some(
      (s) => s.track === "career_returner" && (s.question === "Q5" || s.question === "Q7"),
    );
    return priorEvidence
      ? { track: "career_returner", why: "prior evidence present in Q5 or Q7" }
      : {
          track: is("early_career") ? "early_career" : "mid_career",
          why: "a break was mentioned but no prior evidence surfaced in Q5 or Q7",
        };
  }

  // Two entrepreneur sub-tracks: the later stage wins, because it implies the earlier.
  const stages: AudienceTrack[] = [
    "entrepreneur_scaling",
    "entrepreneur_fundraising",
    "entrepreneur_early",
  ];
  const stageHits = stages.filter(is);
  if (stageHits.length > 1) {
    return { track: stageHits[0], why: "several founder stages fired; the later stage subsumes the earlier" };
  }

  void answers;
  return null;
}

/**
 * The track, or a tentative hold.
 *
 * "Users who resist classification → tentative hold, refine in Foundation 1." A
 * tentative verdict still names its candidate, because the delivery layer needs
 * something to adapt towards and holding is not the same as knowing nothing.
 */
export function detectTrack(answers: Answers): TrackVerdict {
  const signals = signalsFrom(answers);
  if (!signals.length) {
    return { track: null, confidence: "none", candidate: null, signals };
  }

  const counts = tallyByTrack(signals);
  const best = Math.max.apply(
    null,
    Object.keys(counts).map((k) => counts[k]),
  );
  const leaders = Object.keys(counts).filter((k) => counts[k] === best) as AudienceTrack[];

  if (best < 2) {
    return { track: null, confidence: "tentative", candidate: leaders[0], signals };
  }

  if (leaders.length === 1) {
    return { track: leaders[0], confidence: "confirmed", candidate: leaders[0], signals };
  }

  const resolved = resolveTie(leaders, signals, answers);
  if (resolved) {
    return {
      track: resolved.track,
      confidence: "confirmed",
      candidate: resolved.track,
      signals,
      resolvedBy: resolved.why,
    };
  }

  /*
   * Two tracks with equal support and no rule to separate them. Holding is the
   * honest answer: assigning one at random is how a user gets coached as an
   * executive because they said "partner at" about a law firm they left.
   */
  return {
    track: null,
    confidence: "tentative",
    candidate: leaders[0],
    signals,
    resolvedBy: `${leaders.join(" and ")} tie with no rule to separate them`,
  };
}

/* ── The pathway A2 still depends on ────────────────────────────────────── */

/** Matches the career_pathway enum. */
export type Pathway = "employment" | "venture" | "freelance";

/**
 * Derives the pathway that the retired `pathway` beat used to ask for outright.
 *
 * A2's founder/freelancer branch reads this to choose its session language, and her
 * question set has no equivalent question — the founder stages are inferred from Q2
 * and Q4. So the field survives as a derivation.
 *
 * Freelance is the case her eight tracks do not cover: none of them is
 * self-employment without a venture. It is detected from language directly, and it
 * outranks the track, because a returner who comes back as a consultant is on the
 * freelance pathway whatever their track says.
 */
const FREELANCE =
  /\b(?:freelanc\w+|self-?employed|contract(?:ing|or)\b|consult(?:ing|ant) (?:on my own|independently)|my own (?:practice|consultancy)|sole trader)\b/i;

export function pathwayFor(track: AudienceTrack | null, answers: Answers): Pathway {
  for (const q of ["Q1", "Q2", "Q4", "Q5"] as Question[]) {
    const text = answers[q];
    if (text && FREELANCE.test(text)) return "freelance";
  }
  if (
    track === "entrepreneur_early" ||
    track === "entrepreneur_fundraising" ||
    track === "entrepreneur_scaling"
  ) {
    return "venture";
  }
  return "employment";
}

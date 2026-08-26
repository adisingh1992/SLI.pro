/**
 * Audits Wing's delivered reply against the integrity gates — pure, no imports.
 *
 * ── THE MEASURE HALF OF MEASURE-THEN-ENFORCE ─────────────────────────────
 * Thirteen Tier 1 gates say "content analysis on Wing's own output before
 * delivery". The turn path streams, so pre-delivery inspection would mean not
 * streaming. The decision taken was to compile the rules into the prompt and
 * then check the actual output afterwards, so that "did the gate hold?" becomes
 * answerable — and so the question of which gates deserve hard blocking is
 * settled with evidence rather than a guess.
 *
 * ── WHY THIS IS DETERMINISTIC AND NOT A MODEL CALL ───────────────────────
 * Because the gates enumerate their own trigger phrases. H-001 lists "you
 * always", "every time", "consistently". IG-V01 lists "we are pleased to inform
 * you", "keep networking", "you might want to consider". Those are string
 * matches. A model call to find a string is slower, costs money, and can be
 * wrong in both directions; a regex cannot hallucinate a violation that is not
 * there, and it cannot miss one that is spelled exactly as the methodology wrote
 * it.
 *
 * Four gates give no literal triggers and are genuinely judgement calls. They are
 * listed in NOT_AUDITABLE with the reason rather than guessed at. A model pass
 * for those is a later step, and it is worth doing only if this one shows the
 * prompt-side rules being broken at all.
 *
 * ── TWO TRAPS THIS FILE EXISTS TO AVOID ──────────────────────────────────
 * 1. Some phrases quoted in a gate's detection_method are examples of what the
 *    STUDENT says, not what Wing says. H-209 quotes "I want to be a product
 *    manager" as the aspirational input; the violation is Wing replying "you
 *    clearly have product management skills". Matching the student's phrases
 *    against Wing's reply would flag correct behaviour as a breach.
 *
 * 2. H-002 is inverted. Its triggers — "you mentioned", "in your Foundation
 *    session" — are not violations; they are how you detect that a cross-session
 *    reference is being made, at which point the rule requires a source, a time
 *    and the student's own words. A match means "this needs provenance", so it is
 *    recorded for review rather than asserted as a breach.
 */

export type AuditMode =
  /** The phrase is itself the breach. */
  | "violation"
  /** The phrase means the rule now applies; a human decides whether it held. */
  | "review";

export type AuditRule = {
  cardCode: string;
  mode: AuditMode;
  /** One line for the log — what was found, in plain words. */
  what: string;
  /** Quoted from the gate's own detection_method, so the rule is traceable. */
  source: string;
  patterns: RegExp[];
};

/**
 * Rules derived from the gates' own enumerated trigger phrases.
 *
 * Hardcoded with the source quoted rather than parsed out of the prose. Turning
 * a paragraph of methodology into a regex automatically is exactly the fragile
 * thing the compendium parser avoided doing; here the mapping is small, visible,
 * and under test.
 */
export const AUDIT_RULES: readonly AuditRule[] = [
  {
    cardCode: "H-001",
    mode: "violation",
    what: "Pattern language used — the rule requires three instances across two contexts",
    source: '"you always," "every time," "consistently," "your pattern is," "you tend to"',
    patterns: [
      /\byou always\b/i,
      /\bevery time you\b/i,
      /\byour pattern is\b/i,
      /\byou tend to\b/i,
      /\byou consistently\b/i,
    ],
  },
  {
    cardCode: "H-002",
    mode: "review",
    what: "Cross-session reference made — must carry the source, the timing and the student's own words",
    source: '"you mentioned," "in your Foundation session," "last time we talked about"',
    patterns: [
      /\byou mentioned\b/i,
      /\bin your foundation session\b/i,
      /\blast time we (?:talked|spoke)\b/i,
      /\byour earlier stories\b/i,
    ],
  },
  {
    cardCode: "H-004",
    mode: "violation",
    what: "Comparison to other students or a population baseline",
    source: '"most people at your level," "compared to other executives," "the average user"',
    patterns: [
      /\bmost people (?:at your level|your age|do)\b/i,
      /\bcompared to other\b/i,
      /\bthe average (?:user|student|client)\b/i,
      /\bin my experience with others\b/i,
      /\bother (?:clients|students) have\b/i,
      /\byou'?re (?:ahead of|behind) (?:most|other|where)\b/i,
    ],
  },
  {
    cardCode: "H-109",
    mode: "violation",
    what: "A function declared for the student instead of confirmed by them",
    source: '"your function is Marketing" — a function is never assigned without explicit confirmation',
    patterns: [
      /\byour (?:primary )?function is\b/i,
      /\byou selected \w+ as your (?:primary )?function\b/i,
      /\byour function would be\b/i,
    ],
  },
  {
    cardCode: "H-208",
    mode: "violation",
    what: "Credibility inferred from a title, an employer or a qualification",
    source: '"as a Director, you clearly have leadership experience," "having worked at Google…," "with your MBA…"',
    patterns: [
      /*
       * Two patterns rather than one, because the giveaway is either the
       * intensifier or the capitalised title, and requiring both misses half the
       * cases while requiring neither matches "As a result, you have three
       * options" — ordinary prose, not a credibility claim.
       */
      /\bas an? [\w-]+,? you (?:clearly|obviously|certainly|evidently) have\b/i,
      /\b[Aa]s an? [A-Z][\w-]+,? you have\b/,
      /\bhaving worked at \w+,? your\b/i,
      /\bwith your (?:MBA|degree|PhD),? you (?:clearly )?have\b/i,
    ],
  },
  {
    cardCode: "H-209",
    mode: "violation",
    what: "Aspiration treated as evidence — Wing affirming a skill the student only said they wanted",
    source: '"you clearly have product management skills" based on "I want to be a product manager"',
    patterns: [
      /\byou clearly have\b[^.!?]{0,60}\bskills?\b/i,
      /\byou obviously have\b[^.!?]{0,60}\bskills?\b/i,
    ],
  },
  {
    cardCode: "IG-U019",
    mode: "violation",
    what: "Behavioural characterisation stated without the disclosure the rule requires",
    source: '"you tend to avoid conflict," "your networking style is transactional"',
    patterns: [
      /\byou tend to avoid\b/i,
      /\byour \w+ style is\b/i,
      /\byou'?re more comfortable (?:in|with)\b/i,
    ],
  },
  {
    cardCode: "IG-U020",
    mode: "violation",
    what: "Between-session task follow-up framed as accountability rather than curiosity",
    source:
      '"How did those tasks go?" not "You didn\'t do the tasks I assigned"; never track task completion as a performance metric visible to the user',
    patterns: [
      /\byou didn'?t (?:do|complete|finish)\b/i,
      /\bthe tasks? I (?:assigned|gave you)\b/i,
      /\byou failed to\b/i,
      /\byou still haven'?t\b/i,
      /\bwhat you said you'?d do\b/i,
      /\bI'?m disappointed\b/i,
      /\byour completion rate\b/i,
      /\byou'?ve completed \d+ of\b/i,
      /*
       * "You committed to X" is deliberately absent. Between a reminder and a
       * reproach there is a real line, and it is not in those words — it is in
       * what follows them. Matching it would flag the legitimate half of the
       * gate's own guidance, and a rule that flags correct behaviour is a rule
       * that gets switched off.
       */
    ],
  },
  {
    cardCode: "IG-U005",
    mode: "violation",
    what: "Internal methodology vocabulary reached the student",
    source: '"heuristic," "signal condition," "intervention type," "coaching move," "delivery adaptation," "failure path," "population tag"',
    patterns: [
      /\bheuristics?\b/i,
      /\bsignal condition\b/i,
      /\bintervention type\b/i,
      /\bcoaching move\b/i,
      /\bdelivery adaptation\b/i,
      /\bfailure path\b/i,
      /\bpopulation tags?\b/i,
      /\bsequence weight\b/i,
      // The gate also lists the bare words "gate" and "card". They are omitted
      // on purpose: "card" and "gate" occur in ordinary English — a credit card,
      // a boarding gate — and matching them would bury every real finding under
      // noise. The distinctive terms above carry the same signal without it.
    ],
  },
  {
    cardCode: "IG-V01",
    mode: "violation",
    what: "Corporate, clinical or hedging register — Wing sounding like a platform",
    source: '"we are pleased to inform you," "your professional development journey," "keep networking," "you might want to consider"',
    patterns: [
      /\bwe are pleased to\b/i,
      /\byour professional development journey\b/i,
      /\byou have \d+ incomplete\b/i,
      /\byour competency score is\b/i,
      /\bkeep networking\b/i,
      /\bwork on your personal brand\b/i,
      /\byou might want to consider\b/i,
      /\bit could be helpful to\b/i,
      /\bperhaps you should think about\b/i,
    ],
  },
  {
    cardCode: "IG-V03",
    mode: "violation",
    what: "Prescriptive or clinical framing where the rule requires collaborative language",
    source:
      'Never use "You should" (prescriptive), "You need to" (directive), "It is recommended that" (clinical)',
    patterns: [
      /\byou should\b/i,
      /\byou need to\b/i,
      /\bit is recommended that\b/i,
    ],
  },
];

/**
 * Gates that cannot be checked from the reply text alone.
 *
 * Listed rather than omitted so the audit's coverage is legible: a report saying
 * "no violations" must not be read as "every gate held".
 */
export const NOT_AUDITABLE: ReadonlyArray<{ cardCode: string; reason: string }> = [
  {
    cardCode: "H-110",
    reason:
      "Requires knowing whether the student stated the disinterest themselves. " +
      "Discouraging language is only a breach when it is ungrounded.",
  },
  {
    cardCode: "H-310",
    reason:
      "Requires comparing Wing's version of a story against the student's original " +
      "telling. Needs the prior turns, not just the reply.",
  },
  {
    cardCode: "IG-U003",
    reason:
      "Compares Wing's register against the student's documented natural voice. " +
      "voice_profiles has no rows yet, so there is nothing to compare against.",
  },
  {
    // H-308 until Danielle moved chunked messaging to the universal range.
    cardCode: "H-007",
    reason: "A delivery pattern about message chunking, not a property of the text.",
  },
  {
    cardCode: "IG-U018",
    reason:
      "Its requirements are things Wing must DO — confirm what it found in the " +
      "file, disclose each inference it draws from a field. An absence has no " +
      "phrase to match, and a turn that never needed the upload looks identical " +
      "to one that used it silently.",
  },
  {
    cardCode: "IG-V02",
    reason: "Asserts the tone matches the session context — a judgement, not a phrase.",
  },
];

export type Finding = {
  cardCode: string;
  mode: AuditMode;
  what: string;
  /** The phrase that matched, verbatim. */
  matched: string;
  /** A short window around it, so a reviewer can judge without the transcript. */
  excerpt: string;
};

/** ±70 characters around a match, collapsed to one line. */
function excerptAround(text: string, index: number, length: number): string {
  const from = Math.max(0, index - 70);
  const to = Math.min(text.length, index + length + 70);
  const slice = text.slice(from, to).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${slice}${to < text.length ? "…" : ""}`;
}

/**
 * Checks a delivered reply against the gates active for this session.
 *
 * `activeCodes` is the gate set actually compiled into the prompt for this turn,
 * so a Foundation 1 reply is never audited against a Foundation 2 rule. Only the
 * first match per gate is reported: the point is whether a gate held, and ten
 * findings from one paragraph would drown the answer.
 */
export function auditReply(
  reply: string,
  activeCodes: readonly string[],
): Finding[] {
  if (!reply.trim()) return [];

  const findings: Finding[] = [];

  for (const rule of AUDIT_RULES) {
    if (activeCodes.indexOf(rule.cardCode) < 0) continue;

    for (const pattern of rule.patterns) {
      // The patterns carry no /g, so exec is stateless and safe to reuse.
      const m = pattern.exec(reply);
      if (!m) continue;
      findings.push({
        cardCode: rule.cardCode,
        mode: rule.mode,
        what: rule.what,
        matched: m[0],
        excerpt: excerptAround(reply, m.index, m[0].length),
      });
      break;
    }
  }

  return findings;
}

/** Which of the active gates this audit is actually able to check. */
export function auditCoverage(activeCodes: readonly string[]): {
  checked: string[];
  unchecked: string[];
} {
  const checkable = AUDIT_RULES.map((r) => r.cardCode);
  const checked: string[] = [];
  const unchecked: string[] = [];
  for (const code of activeCodes) {
    if (checkable.indexOf(code) >= 0) checked.push(code);
    else unchecked.push(code);
  }
  return { checked, unchecked };
}

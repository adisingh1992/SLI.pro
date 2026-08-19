/**
 * Resolving a student to the methodology's population tags — pure, no imports.
 *
 * ── THE PROBLEM ──────────────────────────────────────────────────────────
 * v2 cards carry `population_tags` drawn from an eight-value vocabulary the
 * methodology invented. The platform stores something narrower: `professional_
 * status` has four values and `intake_records.pathway` has three. Nothing
 * anywhere translated between them, and nothing resolved tags at runtime at all
 * — `getSequenceCards` filtered on sequence membership and status, so every card
 * entered the detector catalogue for every student regardless of who they were.
 *
 * The intake module of 18 August 2026 widened the methodology's vocabulary again:
 * it splits `entrepreneur` into three funding stages. That is what the second
 * half of this table now absorbs.
 *
 * ── WHY THIS IS A MAPPING AND NOT A NEW COLUMN ───────────────────────────
 * An earlier read of this said `executive` and `entrepreneur` could not be
 * produced at all and a new `audience_track` field was needed. Both halves were
 * wrong. `career_pathway` already exists, `intake_records.pathway` is already a
 * column, and the conversational intake already asks the question in plain
 * words — "Are you aiming at a job, something of your own, or working for
 * yourself?" So `entrepreneur` is derivable today.
 *
 * That leaves `executive`, and at Tier 1 scope it is a two-card problem: of the
 * 53 seeded cards only five fire for a single population — H-105
 * (undergraduate), H-107 and H-206 (entrepreneur), H-108 and H-205 (executive) —
 * and 20 are untagged, meaning they apply to everyone. A schema change and an
 * intake change to disambiguate two cards is the wrong trade.
 *
 * ── THE RULE: EXCLUDE THE IMPOSSIBLE, NOT THE IMPROBABLE ─────────────────
 * Each stored value maps to the SET of methodology tags it could mean, and the
 * card's own signal does the final discrimination. `mid_career_or_senior`
 * yields both `mid_career` and `executive` because the stored value genuinely
 * does not distinguish them; H-108 then fires only on an executive naming too
 * many functions, not on everyone tagged senior.
 *
 * The asymmetry is deliberate. Over-inclusion costs a slightly larger detector
 * catalogue and, at worst, a card pitched at the wrong register. Under-inclusion
 * silently loses coaching a student should have had — which is the failure mode
 * this whole redesign exists to eliminate. So where the platform's data is
 * coarser than the methodology's vocabulary, this leans wide.
 *
 * Note this is the OPPOSITE default from `admin-guards.ts`, where an
 * unconfigured administrator sees nothing. That is not inconsistency: there the
 * risk of guessing wide is one partner reading another's student data, and here
 * it is a coaching card in a slightly wrong register. Different risk, different
 * default.
 *
 * When a real `executive` signal exists — an intake beat, or the
 * SLI-Recommended Assessment in Tier 2 — the mapping tightens here, in one
 * function, and nothing else changes.
 */

/** `users.professional_status`. Null until intake captures it. */
export type ProfessionalStatus =
  | "undergraduate_or_recent_grad"
  | "early_career"
  | "mid_career_or_senior"
  | "career_break_or_transition";

/** `intake_records.pathway` — A2's founder/freelancer branch. */
export type Pathway = "employment" | "venture" | "freelance";

/**
 * Every tag the methodology puts on a card, verified by parsing both documents.
 *
 * The compendium's eight: undergraduate 65, early_career 84, mid_career 65,
 * mid_career_pivot 31, mid_career_advancement 31, executive 83, entrepreneur 83,
 * career_returner 26.
 *
 * The intake module adds three, on 19 of its 29 cards each: entrepreneur_early,
 * entrepreneur_fundraising, entrepreneur_scaling. It does not use
 * mid_career_pivot or mid_career_advancement at all, so the two vocabularies
 * overlap without matching — which is precisely why this list is the union and
 * not either document's own.
 *
 * A tag that is not here reaches nobody. `parse-intake.ts` reports any it finds,
 * because `cardAppliesTo` intersects sets and an empty intersection looks exactly
 * like a card that legitimately does not apply.
 */
export const METHODOLOGY_POPULATIONS = [
  "undergraduate",
  "early_career",
  "mid_career",
  "mid_career_pivot",
  "mid_career_advancement",
  "executive",
  "entrepreneur",
  "entrepreneur_early",
  "entrepreneur_fundraising",
  "entrepreneur_scaling",
  "career_returner",
] as const;

export type MethodologyPopulation = (typeof METHODOLOGY_POPULATIONS)[number];

/**
 * What each stored status could mean in the methodology's vocabulary.
 *
 * Two of the four are lossy in the source data, not in this table:
 * `undergraduate_or_recent_grad` conflates two populations the methodology
 * separates, and `mid_career_or_senior` does the same. Both therefore yield two
 * tags. `career_break_or_transition` yields `career_returner` and `mid_career`
 * because a returner is usually returning to a mid-career role, and the
 * heartbeat library has a career-returner track while the card set barely does —
 * only three Tier 1 cards mention it, all of which enumerate every population
 * anyway.
 *
 * `mid_career_pivot` and `mid_career_advancement` are deliberately unmapped.
 * They are Danielle's sub-tags and nothing in the platform can distinguish a
 * pivot from an advancement. Leaving them out costs nothing at Tier 1: the only
 * seeded cards carrying them are IG-U003/U004/U005, which also list all seven
 * other populations, so they are reached through `mid_career` regardless.
 */
const BY_STATUS: Record<ProfessionalStatus, readonly MethodologyPopulation[]> = {
  undergraduate_or_recent_grad: ["undergraduate", "early_career"],
  early_career: ["early_career"],
  mid_career_or_senior: ["mid_career", "executive"],
  career_break_or_transition: ["career_returner", "mid_career"],
};

/**
 * What the pathway adds.
 *
 * `venture` → `entrepreneur` is direct. `freelance` → `entrepreneur` is a
 * judgement and worth flagging for Danielle rather than burying: the
 * methodology has no `freelance` tag, and the entrepreneur cards ask "why you,
 * not just why this idea" (H-206) and probe for a default lens (H-107), which is
 * the question a freelancer pitching a client also has to answer. Excluding
 * freelancers would leave them with no card covering it at all. If Danielle
 * would rather freelancers took the employment path, this line is the change.
 *
 * ── WHY ALL THREE FUNDING STAGES ─────────────────────────────────────────
 * The intake module tags cards by stage — early, fundraising, scaling — and the
 * platform stores no stage. `pathway` says a student is building something; it
 * does not say whether they are at idea stage or hiring their fiftieth person.
 * So all three are emitted, and the card's own signal discriminates, exactly as
 * `mid_career_or_senior` emits both mid_career and executive.
 *
 * The alternative was emitting only `entrepreneur`, and it fails concretely:
 * H-029 (RT-10 Founder-Identity Blur) is tagged with the three sub-tracks and
 * nothing else, so a founder would never be shown the one reveal template
 * written for founders — silently, because an empty tag intersection is
 * indistinguishable from a card that does not apply.
 *
 * This tightens the moment intake stores the stage, and her own Q2 asks for it:
 * "How far along — idea stage, first customers, or scaling?" One table, one
 * change, nothing else moves.
 */
const BY_PATHWAY: Partial<Record<Pathway, readonly MethodologyPopulation[]>> = {
  venture: [
    "entrepreneur",
    "entrepreneur_early",
    "entrepreneur_fundraising",
    "entrepreneur_scaling",
  ],
  freelance: [
    "entrepreneur",
    "entrepreneur_early",
    "entrepreneur_fundraising",
    "entrepreneur_scaling",
  ],
};

/**
 * The population tags that may apply to this student.
 *
 * Returns an empty array when nothing is known, which callers must read as
 * "do not filter" rather than "matches nothing" — see `cardAppliesTo`.
 */
export function populationTagsFor(
  status: ProfessionalStatus | null | undefined,
  pathway: Pathway | null | undefined,
): MethodologyPopulation[] {
  const tags = new Set<MethodologyPopulation>();

  if (status && BY_STATUS[status]) {
    for (const t of BY_STATUS[status]) tags.add(t);
  }
  if (pathway && BY_PATHWAY[pathway]) {
    for (const t of BY_PATHWAY[pathway]!) tags.add(t);
  }

  // Array.from, not spread: the tsconfig sets no `target`, so it defaults to
  // ES5 and spreading a Set is TS2802 under the typecheck ratchet.
  return Array.from(tags);
}

/**
 * Whether a card may be offered to this student.
 *
 * Three cases, and the middle one is the one worth being deliberate about:
 *
 *  - a card with NO tags is universal. 20 of the 53 seeded Tier 1 cards are
 *    untagged, including every universal gate.
 *  - a student with NO resolved tags has not finished intake. Fail OPEN. Failing
 *    closed would leave exactly those students — the ones at the very start of
 *    Foundation 1, who need it most — with only the 20 untagged cards, and it
 *    would do so silently.
 *  - otherwise the sets must intersect.
 */
export function cardAppliesTo(
  cardTags: readonly string[] | null | undefined,
  studentTags: readonly string[],
): boolean {
  if (!cardTags || cardTags.length === 0) return true;
  if (studentTags.length === 0) return true;
  return cardTags.some((t) => studentTags.indexOf(t) >= 0);
}

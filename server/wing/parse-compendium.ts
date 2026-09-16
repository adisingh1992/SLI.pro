/**
 * Parses the Wing Master Module Compendium v2 into canonical card records.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * The methodology arrived as a 5,484-line markdown document containing 184
 * card and gate specifications. It will be revised — it has already been
 * revised eleven times by its own version history — and hand-transcribing 184
 * cards even once is a mistake, let alone twice. So the document is committed
 * to the repo alongside this parser, and the seed is generated from it.
 *
 * ── WHY THERE IS NO MODEL CALL HERE ──────────────────────────────────────
 * `extract-heuristics.ts` needed ~29 flagship calls because the MVP prompt
 * files buried the methodology in prose, and reading prose requires judgement.
 * This document does not: every card is a fixed seven-row markdown table under
 * an `H-xxx` heading, with a metadata line above it. That is a grammar, so
 * this is a parser, and a parser is reproducible, free, reviewable, and gives
 * the same answer twice. The moment a card is malformed the parser says so
 * rather than guessing — which is the entire reason to prefer it.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
 *  1. It does not touch the database. It returns records; `check-compendium.ts`
 *     prints them and `seed-compendium.ts` (later, after the schema gains the
 *     four missing component types) writes them.
 *  2. It does not repair the document. Where the compendium contradicts
 *     itself — two cards sharing an ID, a count table that disagrees with the
 *     body, a card with no sequence weight — the parser reports and continues.
 *     Silently picking a winner would launder a methodology decision into a
 *     parsing decision, and the methodology owner would never see it.
 *  3. It does not infer Tier 1 membership from the document. Which cards are
 *     in scope is a client-contract question answered by the Feature List, so
 *     it is an explicit table below with the citation attached.
 */

/* ── The v2 card format ──────────────────────────────────────────────────── */

/**
 * The seven components, in document order.
 *
 * Four of these have no home in `heuristic_component_type` yet — the enum
 * predates v2 and has `signal · intervention · coaching_move · outcome ·
 * module_mapping · population_context · notes`. Mapping happens at seed time,
 * not here: the parser's job is to report what the document says.
 */
export const COMPONENT_KEYS = [
  "signal",
  "detection_method",
  "intervention_type",
  "coaching_move",
  "delivery_adaptation",
  "success_criteria",
  "failure_path",
] as const;

export type ComponentKey = (typeof COMPONENT_KEYS)[number];

export type ParsedCard = {
  /** `H-102`, `IG-V01`, `IG-1107`, `IG-U03`. Verbatim from the heading. */
  cardCode: string;
  name: string;
  description: string;
  populationTags: string[];
  components: Partial<Record<ComponentKey, string>>;
  /** From the `module_mapping` table row, when the card has one. */
  moduleMapping: string | null;
  notes: string | null;
  /**
   * Coaching cards state the weight inside `notes`; gates state it as a
   * `**Sequence weight:**` line after the table. Two formats, one field.
   * Null means the document does not say — see `missingWeight`.
   */
  weight: number | null;
  /** Derived from the card number. See `moduleFromCode`. */
  module: string;
  /** The `#`/`##` heading the card appeared under, for cross-checking. */
  heading: string;
  /** 1-based line of the card's own heading, so a reviewer can find it. */
  line: number;
  /** Hash of the seven components — distinguishes a repeat from a collision. */
  bodyHash: string;
  /** First token of `intervention_type`: COACH, META, CHALLENGE, GATE… */
  interventionType: string | null;
  /** coaching_card · integrity_gate · exercise. See `cardKindOf`. */
  cardKind: CardKind;
};

export type CardKind = "coaching_card" | "integrity_gate" | "exercise";

export type ParseResult = {
  /** One record per distinct card, first occurrence wins. */
  cards: ParsedCard[];
  /**
   * Byte-identical repeats of a card already seen.
   *
   * The compendium was assembled by pasting six per-module documents together,
   * and one boilerplate block ("Two Module Gap Gates / Two Extension Gates /
   * Updated Gate Library Summary") came along six times. `H-006` appears seven
   * times in total. These are a merge artefact, not a conflict — dropping them
   * is safe precisely because the bodies match.
   */
  duplicates: Array<{ cardCode: string; line: number }>;
  /**
   * Same ID, DIFFERENT body. This is the dangerous one and it is never
   * auto-resolved: two distinct cards are wearing one number, and only the
   * methodology owner can say which keeps it.
   */
  collisions: Array<{ cardCode: string; line: number; firstSeenLine: number }>;
  /** Cards missing one or more of the seven components. */
  incomplete: Array<{ cardCode: string; missing: ComponentKey[] }>;
  /** Cards the document gives no sequence weight for. */
  missingWeight: string[];
  /** Card number says one module, enclosing heading says another. */
  moduleMismatches: Array<{ cardCode: string; fromCode: string; heading: string }>;
  /** Gaps in each module's numbering — reserved, or dropped in consolidation? */
  numberingGaps: string[];
  /** Every distinct `intervention_type` token found, with counts. */
  interventionTypes: Record<string, number>;
  /** Every distinct population tag found, with counts. */
  populationTags: Record<string, number>;
  /**
   * Cards whose `intervention_type` and whose filing disagree about kind.
   *
   * Reported rather than silently reconciled, because one of them is a real
   * defect with safety consequences: H-916 "Experiment Safety Check" sits under
   * "Source Integrity → Codeable Quality Gates" and declares `COACH`. Module 9
   * is the only module that tells a user to change their behaviour at work this
   * week, and H-916 is the gate that checks the instruction is safe to give. A
   * kind derived from `intervention_type` alone would load it as a coaching card
   * and offer it to the detector as a student-turn signal.
   */
  kindDisagreements: Array<{
    cardCode: string;
    interventionType: string | null;
    heading: string;
    resolvedAs: CardKind;
  }>;
};

/* ── Tier 1 scope ────────────────────────────────────────────────────────── */

/**
 * Modules whose cards Tier 1 requires.
 *
 * Not a property of the methodology — a property of the contract. From the
 * Feature List (May 2026): Section A and Section B are Tier 1; Section C is
 * Tier 2; Section D is Tier 3; and every item inside A5 "New Modules to Add"
 * carries its own label reading "Tier 2" or "Tier 2/3".
 *
 * So Foundation 1–3 are in via A2 ("Update all behavioral heuristics across
 * Foundation Sessions"), the universal and voice gates are in because they
 * govern every surface that ships, and Modules 4–11 are out because the client
 * document puts them out. See WING_TIER1_SCOPE.md §2.
 *
 * `intake` joined this set on 18 August, when Danielle delivered the intake
 * module as 42 cards. A1 conversational intake is Tier 1 and has been listed as
 * an open Tier 1 gap since the gap analysis; the module simply had no cards
 * until now. No compendium card derives to `intake`, so adding it changes
 * nothing about what the compendium contributes.
 */
export const TIER1_MODULES = new Set([
  "universal",
  "intake",
  "foundation_1",
  "foundation_2",
  "foundation_3",
]);

/**
 * Cards inside a Tier 1 module that Tier 1 nonetheless does not get.
 *
 * One exclusion. H-006 is titled "Universal" and its own body says
 * "Applies to: Module 8, Executive Intelligence Framework" — universal in name,
 * scoped in fact, and Module 8 is not Tier 1.
 */
export const TIER1_EXCLUDED = new Set(["H-006"]);

/**
 * Cards OUTSIDE a Tier 1 module that a Tier 1 client requirement pulls in.
 *
 * This set exists because the document's filing and the contract's scope are
 * two different questions, and the parser found them disagreeing. All seven
 * voice gates derive to module `voice` from their code, but the compendium
 * files IG-V04 through IG-V07 under the heading "Module 6 Content Production
 * Gates" — so by document structure they would defer with Module 6, while by
 * Feature List they are required in Tier 1.
 *
 * Each entry carries the requirement that pulls it in. Anything not listed
 * defers, including IG-V06 (content archetype calibration), which is Module 6
 * craft with no Tier 1 surface to bind to.
 */
export const TIER1_INCLUDED: Record<string, string> = {
  "IG-V01": "Feature List voice section — governs all platform copy",
  "IG-V02": "Feature List voice section — trait hierarchy by session context",
  "IG-V03": "Feature List voice section — collaborative vs observational language",
  "IG-V04": "H-307 encourages voice-to-text in Foundation 3, so voice-originated content exists in Tier 1",
  "IG-V05": "A4 — 360Brew authenticity standard on content output, which ships today",
  "IG-V07": "A4 — 360Brew authenticity standard; this gate IS the AI-speak check",
  /*
   * NOT here, deliberately: "H-701" for Baby Radar.
   *
   * Danielle's Wing_Content_System_v1 (2 Sep) reuses the code H-701 for Baby Radar Topic
   * Suggestion — Aditya ruled that card itself is Tier 1 on 2 Sep 2026. But this table is
   * keyed by bare card code and checked by `isTier1` against ANY ParsedCard with that code,
   * regardless of which document it came from — and H-701 is already taken. The real master
   * compendium has its own, unrelated "H-701 Radar weekly brief generation" (the full
   * Module 7 weekly-brief pipeline, correctly Tier 2). An entry here for "H-701" was tried
   * first and shipped: it silently promoted the master compendium's card too, and
   * `npm test` caught it as "54 !== 53" in the Tier 1 count. Fixed by moving the decision
   * to `CONTENT_SYSTEM_TIER1_INCLUDED` in parse-content-system.ts, which only ever sees
   * cards parsed from Danielle's content-system document — this table stays scoped to the
   * master compendium alone, so a code collision across the two documents can never again
   * cross-contaminate Tier 1 membership. The collision itself (two real, differently-scoped
   * cards both named H-701) is a numbering problem worth raising with Danielle, not
   * something to keep routing around in code.
   */
};

export function isTier1(card: ParsedCard): boolean {
  if (TIER1_EXCLUDED.has(card.cardCode)) return false;
  if (card.cardCode in TIER1_INCLUDED) return true;
  return TIER1_MODULES.has(card.module);
}

/* ── Card kind ───────────────────────────────────────────────────────────── */

/**
 * The exercise library, by code.
 *
 * Explicit rather than derived, because these codes sit inside their module's
 * ordinary numbering — H-211 and H-212 look exactly like Foundation 2 coaching
 * cards. What separates them is behavioural: an exercise is reached by an
 * explicit reference from another card's `coaching_move` (H-302 routes into the
 * Foundation 3 set), never by signal match, which is why all 19 state no
 * sequence weight. They are not in the precedence ordering because they are not
 * competing to fire.
 *
 * H-411 is deliberately ABSENT. It is one of the two ID collisions: the code is
 * shared by a Module 4 exercise and a Module 4 integrity gate, and the parser
 * keeps the first body it meets, which is the gate. Listing H-411 here would
 * label that gate an exercise. The gate check runs first in `cardKindOf` so the
 * ordering is safe either way, but leaving it out keeps the reason visible.
 */
export const EXERCISE_LIBRARY = new Set([
  "H-211", "H-212",
  "H-311", "H-312", "H-313", "H-314",
  "H-412", "H-413", "H-414", "H-415", "H-416",
  "H-611", "H-612", "H-613",
  "H-900",
  "EX-1101", "EX-1102", "EX-1103", "EX-1104",
]);

/** A heading that places its cards on the output-inspection side. */
function headingSuggestsGate(heading: string, cardCode: string): boolean {
  return /gate/i.test(heading) || /^IG-/.test(cardCode);
}

/**
 * Which of the three kinds a card is.
 *
 * The only distinction that changes behaviour is whether a card may enter the
 * detector catalogue, and `intervention_type` answers it for 180 of 182 cards:
 * META and GATE both describe rules about Wing's own output. The structural
 * heading is consulted as well rather than instead, because the two disagree in
 * four places and in one of them — H-916 — the type field is simply wrong.
 *
 * A note on `META`, since the enum value is narrower than what it holds: META
 * covers output-quality gates (IG-V01, "does this sound like Wing"), delivery
 * rules (H-308, "chunk multi-part messages") and system behaviour (H-709,
 * "fade out after silence"). Those are three different things and the
 * methodology does not distinguish them. They share the one property that
 * matters here — none is something a student says — so they share a kind. If a
 * behavioural difference emerges later, a fourth enum value is a one-line
 * migration.
 */
export function cardKindOf(
  cardCode: string,
  interventionType: string | null,
  heading: string,
): CardKind {
  if (interventionType === "META" || interventionType === "GATE") return "integrity_gate";
  if (headingSuggestsGate(heading, cardCode)) return "integrity_gate";
  if (EXERCISE_LIBRARY.has(cardCode)) return "exercise";
  return "coaching_card";
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/**
 * Removes markdown backslash escaping.
 *
 * The document is escaped throughout — `\_` inside `population\_tags`, `\.`
 * inside `**1\. signal**`, `\[` around tag arrays. An early pass at the
 * inventory missed several population tags for exactly this reason, so
 * unescaping happens before any matching, not after.
 */
export function unescapeMd(s: string): string {
  return s.replace(/\\([^A-Za-z0-9\s])/g, "$1");
}

/**
 * Stable, dependency-free hash. Only needs to separate equal from unequal.
 *
 * Exported for `parse-intake.ts`: two parsers that hashed card bodies differently
 * could not report a card as the same card, which is the one comparison a body
 * hash exists to make.
 */
export function hash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (h1 ^ c) * 16777619 >>> 0;
    h2 = (h2 + c * 31 + (h2 << 5)) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/**
 * The module a card belongs to, from its number.
 *
 * The numbering is systematic — H-1xx is Foundation 1, H-9xx is Module 9 — so
 * this is derivation rather than guesswork. It is still cross-checked against
 * the enclosing heading, and disagreements are reported: a card filed under
 * the wrong heading is exactly the kind of consolidation error worth catching,
 * and neither source is authoritative enough to trust alone.
 *
 * H-900 is the documented exception. It is the universal warm-up, not a
 * Module 9 card, and it is the reason this cannot be pure arithmetic.
 */
export function moduleFromCode(code: string): string {
  if (code === "H-900") return "universal";
  if (/^IG-V\d+$/.test(code)) return "voice";
  if (/^IG-INT\d+$/.test(code)) return "intake";
  // The safety gates. Seven of the ten are constants in safety-rules.ts rather
  // than rows, on Danielle's instruction of 18 August; all ten still need a
  // module so the registry and the panel can group them. "IG-S01" is not a
  // digit run, so without this the generic extraction below returns "unknown".
  if (/^IG-S\d+$/.test(code)) return "safety";
  if (/^IG-U0*\d+$/.test(code)) return "universal";
  if (/^IG-UX\d+$/.test(code)) return "ux";
  if (/^IG-MJ\d+$/.test(code)) return "micro_journaling";
  // Wing_Content_System_v1 (2 Sep) — Module 6 content-trigger gates and the image-
  // generation gates that support H-622's article flow. Checked ahead of the generic
  // digit extraction below because neither "M6" nor "IMG" is a digit run, so that
  // path would otherwise return "unknown" for every one of these.
  if (/^IG-M6-\d+$/.test(code)) return "module_6";
  if (/^IG-IMG-\d+$/.test(code)) return "image_generation";

  // Wing_Reveal_Cycle_v4_CANONICAL (18 Aug) — the system event's own namespace.
  // Both prefixes are checked here rather than below because "RC01" is not a
  // digit run, so the generic extraction returns "unknown" for all 26 of them.
  // Cards and gates share the prefix pair; card_kind, not module, tells them
  // apart.
  if (/^(?:H|IG)-RC\d+$/.test(code)) return "reveal_cycle";

  // The decimal suffix is H-019.5's: Danielle numbered a card between H-019 and
  // H-020 rather than renumber the fifteen reveal templates that follow it.
  const m = /^(?:H|IG|EX)-(\d+)(?:\.\d+)?$/.exec(code);
  if (!m) return "unknown";

  const digits = m[1];

  /*
   * The H-0xx range is two ranges now, and conflating them would be expensive.
   *
   * H-001–H-009 are the universal rules that bound every module. H-010–H-037 are
   * the intake module, which Danielle numbered into the same hundred on 18
   * August. A `universal` card carries no session scope — it compiles into every
   * prompt Wing assembles — so filing the intake cards there would fire the party
   * question inside Foundation 2 and put all 15 reveal templates in every turn.
   *
   * Anything else in the H-0xx range returns `unknown` rather than falling
   * through to universal. Unknown is loud and stays out of Tier 1; universal is
   * quiet and goes everywhere.
   */
  if (digits.length === 3 && digits.charAt(0) === "0") {
    const inHundred = Number(digits);
    if (inHundred <= 9) return "universal";
    if (inHundred <= 37) return "intake";
    return "unknown";
  }

  // Four-digit codes are Modules 10 and 11: H-1001, IG-1107.
  const n = digits.length >= 4 ? Number(digits.slice(0, 2)) : Number(digits[0]);

  switch (n) {
    case 0: return "universal";
    case 1: return "foundation_1";
    case 2: return "foundation_2";
    case 3: return "foundation_3";
    case 4: return "module_4";
    case 5: return "module_5";
    case 6: return "module_6";
    case 7: return "module_7";
    case 8: return "module_8";
    case 9: return "module_9";
    case 10: return "module_10";
    case 11: return "module_11";
    // 12 is deliberately absent: reserved and unassigned, the number skipped
    // when Module 13 was named. A code in that range is a mistake, and
    // "unknown" is the loud answer.
    case 13: return "module_13";
    default: return "unknown";
  }
}

/** Loose match of a heading to a module, for the cross-check only. */
function moduleFromHeading(heading: string): string | null {
  const h = heading.toLowerCase();
  if (/foundation\s*1/.test(h)) return "foundation_1";
  if (/foundation\s*2/.test(h)) return "foundation_2";
  if (/foundation\s*3/.test(h)) return "foundation_3";
  const m = /module\s*(\d+)/.exec(h);
  if (m) return `module_${m[1]}`;
  if (/universal|platform-wide/.test(h)) return "universal";
  if (/voice/.test(h)) return "voice";
  if (/exercise/.test(h)) return null; // exercise cards keep their own numbering
  return null;
}

/* ── The parser ──────────────────────────────────────────────────────────── */

/**
 * Corrections applied to the document as delivered.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Danielle approved five changes on 18 August and compendium v3 does not contain
 * them. That was verified rather than assumed: v2 and v3 hold 182 cards each with
 * identical code sets, and hashing all seven components of every card shows not one
 * body changed between them. v3's own summary lists the corrections as applied;
 * they exist only in that list.
 *
 * So the source stays exactly as delivered and the corrections live here, each
 * quoting the decision that authorises it. Editing the committed compendium would
 * have been faster and would have destroyed the one property that makes it useful
 * — that it is the document she sent. When a reissue carries a change itself, its
 * entry is deleted and the test that pins it fails until the entry goes.
 *
 * ── WHY ONE CARD CAN BE RENUMBERED TWICE ─────────────────────────────────
 * The Module 11 universal trio moved to IG-U006–IG-U008 on the morning of 18
 * August and to IG-U012–IG-U014 the same afternoon, because the research-derived
 * gates she sent later claim IG-U006 through IG-U011 for six new universal gates.
 * Her later document governs. The first move is not erased from the record — it
 * lives in `supersededFrom`, because the seeded rows answer to those codes until
 * the corrections script runs, and a correction that cannot find its row is worse
 * than no correction: it reports success and leaves the database disagreeing.
 *
 * ── WHY SOME MATCH ON THE HEADING ────────────────────────────────────────
 * H-710 is two different cards: a Radar coaching card and a Module 7 gate. Only the
 * gate is renumbered, so the entry has to identify which of the two bodies it
 * means. That also fixes the collision rather than hiding it — before this, the
 * parser kept the first body and dropped the second, so one real card was
 * unreachable.
 */
export type Correction =
  | {
      kind: "recode";
      from: string;
      to: string;
      /** Disambiguates when one code carries two bodies. */
      headingContains?: string;
      /**
       * Codes this card already wears in the database from an earlier correction.
       *
       * The parser never reads this — in the document the code is still `from`.
       * `apply-card-corrections` does: a row renamed once no longer answers to
       * `from`, so without this the script would print "not seeded, nothing to
       * rename" and the rename would silently not happen. Most recent first.
       */
      supersededFrom?: readonly string[];
      why: string;
    }
  | { kind: "interventionType"; code: string; to: string; why: string };

export const CORRECTIONS: readonly Correction[] = [
  {
    kind: "recode",
    from: "H-308",
    to: "H-007",
    why:
      'Danielle, 18 August: "Approved. Move chunked messaging to the universal range as ' +
      'H-007. It fires at every module opening and the routing document depends on it ' +
      'everywhere." Also removes the named exception the sequence builder carried to treat ' +
      "an H-3xx code as universal.",
  },
  {
    kind: "recode",
    from: "IG-U03",
    to: "IG-U018",
    supersededFrom: ["IG-U012", "IG-U006"],
    why:
      'Danielle, 18 August, morning: "Renumber the Module 11 universal gates to ' +
      'IG-U006–IG-U008 so no two IDs are one character apart." Superseded that afternoon: ' +
      "Wing_Research_Derived_Gates takes IG-U006 through IG-U011 for six new universal " +
      "gates, IG-U006 being Barnum Falsifiability, so the trio moved to IG-U012–IG-U014 — " +
      "which collided a second time, with the platform-wide gates published 19 August " +
      "(IG-U012 evidence grade, IG-U013 role-aware summarization, IG-U014 evidence over " +
      "self-rating). Her allocation rule of 25 August is the fix and is final: IG-U006–011 " +
      "reserved for universal research-derived gates, IG-U012–017 for platform-wide gates, " +
      'IG-U018–020 for Module 11, future universal gates from IG-U021 — "I own all ' +
      'numbering." See gate-allocation.ts for the authoritative bands and the violation ' +
      "check. IG-U03/04/05 are the Module 11 trio: they arrive in Part 4 of the Module 11 " +
      "section, while IG-U003/004/005 were delivered with Module 10, whose own header lists " +
      "them. Mapped in order.",
  },
  {
    kind: "recode",
    from: "IG-U04",
    to: "IG-U019",
    supersededFrom: ["IG-U013", "IG-U007"],
    why: "Second of the Module 11 trio. Same three rulings — see IG-U03's entry.",
  },
  {
    kind: "recode",
    from: "IG-U05",
    to: "IG-U020",
    supersededFrom: ["IG-U014", "IG-U008"],
    why: "Third of the Module 11 trio. Same three rulings — see IG-U03's entry.",
  },
  {
    kind: "recode",
    from: "H-710",
    to: "H-711",
    headingContains: "Content Seed Alignment",
    why:
      'Danielle, 18 August: "Renumber the gate versions. H-710 gate becomes H-711. The ' +
      'exercise/card versions keep their original numbers." H-711 was unused. Both bodies now ' +
      "survive the parse; before this the gate was dropped as a duplicate.",
  },
  {
    kind: "interventionType",
    code: "H-916",
    to: "META",
    why:
      'Danielle, 18 August: "You\'re right, it\'s mislabeled. Change it to META. It\'s a ' +
      'safety check that runs before Wing speaks, not a user-facing coaching move."',
  },
  /*
   * NOT here, deliberately: H-411 gate → H-412. H-412 is already the Odyssey
   * planning exercise and the same ruling keeps exercise numbers, so applying the
   * instruction literally recreates the collision it was meant to remove. H-408 is
   * free and recommended, and it is waiting on her word. A Module 4 gate, Tier 2,
   * nothing published touches it — see WING_DECISIONS.md §3.
   */
];

/** The code a card is filed under after corrections. */
export function correctedCode(cardCode: string, heading: string): string {
  for (const c of CORRECTIONS) {
    if (c.kind !== "recode" || c.from !== cardCode) continue;
    if (c.headingContains && heading.indexOf(c.headingContains) < 0) continue;
    return c.to;
  }
  return cardCode;
}

/** The intervention type a card carries after corrections, or null for none. */
export function correctedInterventionType(cardCode: string): string | null {
  for (const c of CORRECTIONS) {
    if (c.kind === "interventionType" && c.code === cardCode) return c.to;
  }
  return null;
}

// The `IG-M6-\d+` / `IG-IMG-\d+` alternatives are Wing_Content_System_v1's gate
// codes (IG-M6-01..05, IG-IMG-01..03) — a hyphen-before-digits shape none of the
// other IG prefixes use, so they can't fold into the `(?:V|UX|MJ|U)?\d+` branch.
const CARD_HEADING = /^#{2,3}\s+((?:H|IG|EX)-(?:V|UX|MJ|U)?\d+|IG-M6-\d+|IG-IMG-\d+)\b(.*)$/;
const SECTION_HEADING = /^(#{1,2})\s+(.*)$/;

export function parseCompendium(text: string): ParseResult {
  const lines = text.split("\n");

  const cards: ParsedCard[] = [];
  const duplicates: ParseResult["duplicates"] = [];
  const collisions: ParseResult["collisions"] = [];
  const incomplete: ParseResult["incomplete"] = [];
  const missingWeight: string[] = [];
  const moduleMismatches: ParseResult["moduleMismatches"] = [];
  const interventionTypes: Record<string, number> = {};
  const kindDisagreements: ParseResult["kindDisagreements"] = [];
  const populationTags: Record<string, number> = {};

  /**
   * code → every distinct body seen for it, with the line it first appeared.
   *
   * A set rather than a single entry because the repeated boilerplate block
   * carries H-710-the-gate four times. Comparing each repeat against only the
   * FIRST body ever seen for that code — which is H-710-the-coaching-card,
   * 92 lines earlier — reported four collisions where there is one collision
   * and three duplicates.
   */
  const seen = new Map<string, { hashes: Set<string>; firstLine: number }>();

  let heading = "";

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    const cardMatch = CARD_HEADING.exec(unescapeMd(raw));
    if (!cardMatch) {
      const section = SECTION_HEADING.exec(raw);
      // A card heading is also `##`, so only update the section when the line
      // is a heading that is NOT a card.
      if (section) heading = unescapeMd(section[2]).trim();
      continue;
    }

    const headingRest = unescapeMd(cardMatch[2]).replace(/^[\s—–-]+/, "").trim();
    /*
     * Corrected here, at the moment the code is read, rather than after the cards
     * are built. Everything downstream derives from the code — the module comes from
     * `moduleFromCode`, and Tier 1 membership comes from the module — so correcting
     * it later would leave H-007 filed as a Foundation 3 card.
     */
    const cardCode = correctedCode(cardMatch[1], headingRest);

    // The block runs to the next heading or horizontal rule.
    let end = i + 1;
    while (end < lines.length) {
      const l = lines[end];
      if (/^#{1,3}\s/.test(l) || /^---\s*$/.test(l) || /^={10,}/.test(l)) break;
      end++;
    }
    const block = unescapeMd(lines.slice(i + 1, end).join("\n"));

    /* Metadata line: **name:** X **description:** Y **populationTags:** [...] */
    // [\s\S] rather than the /s dotAll flag: ES5 target, and dotAll is TS1501
    // before ES2018.
    const nameMatch = /\*\*name:\*\*\s*([\s\S]*?)\s*(?=\*\*description:\*\*|$)/.exec(block);
    const descMatch = /\*\*description:\*\*\s*([\s\S]*?)\s*(?=\*\*populationTags:\*\*|\n\n|$)/.exec(block);
    const tagsMatch = /\*\*populationTags:\*\*\s*\[([^\]]*)\]/.exec(block);

    const tags = tagsMatch
      ? tagsMatch[1].split(",").map((t) => t.replace(/["'\s]/g, "")).filter(Boolean)
      : [];
    for (const t of tags) populationTags[t] = (populationTags[t] ?? 0) + 1;

    /* The seven-component table. One row per line. */
    const components: Partial<Record<ComponentKey, string>> = {};
    let moduleMapping: string | null = null;
    let notes: string | null = null;

    for (const line of block.split("\n")) {
      const numbered = /^\|\s*\*\*\s*(\d)\s*\.\s*([a-z_]+)\s*\*\*\s*\|\s*(.*?)\s*\|\s*$/.exec(line);
      if (numbered) {
        const key = numbered[2] as ComponentKey;
        if ((COMPONENT_KEYS as readonly string[]).includes(key)) {
          components[key] = numbered[3].trim();
        }
        continue;
      }
      const plain = /^\|\s*(module_mapping|notes)\s*\|\s*(.*?)\s*\|\s*$/.exec(line);
      if (plain) {
        if (plain[1] === "module_mapping") moduleMapping = plain[2].trim();
        else notes = plain[2].trim();
      }
    }

    /* Weight: the gate form first, then the coaching-card form inside notes. */
    const weightMatch =
      /\*\*Sequence weight:\*\*\s*([0-9]+(?:\.[0-9]+)?)/.exec(block) ??
      /Sequence weight:\s*([0-9]+(?:\.[0-9]+)?)/.exec(block);
    const weight = weightMatch ? Number(weightMatch[1]) : null;

    const declaredInterventionType = components.intervention_type
      ? (/^\s*\*{0,2}([A-Z][A-Z_]+)/.exec(components.intervention_type)?.[1] ?? null)
      : null;
    /*
     * The correction wins over what the card says. H-916 declares COACH while sitting
     * among Module 9's system rules, and Danielle confirmed that is a slip — so
     * `cardKindOf` and the disagreement report below both work from the corrected
     * value, which is what removes H-916 from `kindDisagreements`.
     */
    const interventionType = correctedInterventionType(cardCode) ?? declaredInterventionType;

    const cardKind = cardKindOf(cardCode, interventionType, heading);
    const typeSaysGate = interventionType === "META" || interventionType === "GATE";
    if (typeSaysGate !== headingSuggestsGate(heading, cardCode)) {
      kindDisagreements.push({ cardCode, interventionType, heading, resolvedAs: cardKind });
    }

    const bodyHash = hash(COMPONENT_KEYS.map((k) => components[k] ?? "").join(" "));

    /* Duplicate vs collision. */
    const prior = seen.get(cardCode);
    if (prior) {
      if (prior.hashes.has(bodyHash)) {
        duplicates.push({ cardCode, line: i + 1 });
      } else {
        collisions.push({ cardCode, line: i + 1, firstSeenLine: prior.firstLine });
        prior.hashes.add(bodyHash);
      }
      i = end - 1;
      continue;
    }
    seen.set(cardCode, { hashes: new Set([bodyHash]), firstLine: i + 1 });

    const module = moduleFromCode(cardCode);
    const headingModule = moduleFromHeading(heading);
    // A voice gate under "Universal Voice Gates (Apply to All Modules)" is
    // filed correctly; both readings are true and neither is an error.
    const reconciled =
      headingModule === module ||
      (module === "voice" && headingModule === "universal");
    if (headingModule && !reconciled && module !== "universal") {
      moduleMismatches.push({ cardCode, fromCode: module, heading });
    }

    const missing = COMPONENT_KEYS.filter((k) => !components[k]);
    if (missing.length) incomplete.push({ cardCode, missing });
    if (weight === null) missingWeight.push(cardCode);
    if (interventionType) {
      interventionTypes[interventionType] = (interventionTypes[interventionType] ?? 0) + 1;
    }

    cards.push({
      cardCode,
      /*
       * A corrected card's name must not keep the code it was corrected away from.
       * The metadata line carries the old code — "H-308 Wing chunked messaging" — and
       * the name is what the admin surface shows, so leaving it would put a retired
       * code back in front of the person reading the card.
       */
      name: renameForCode(
        nameMatch ? nameMatch[1].trim() : `${cardCode} ${headingRest}`.trim(),
        cardMatch[1],
        cardCode,
      ),
      description: descMatch ? descMatch[1].trim() : "",
      populationTags: tags,
      components,
      moduleMapping,
      notes,
      weight,
      module,
      heading,
      line: i + 1,
      bodyHash,
      interventionType,
      cardKind,
    });

    i = end - 1;
  }

  return {
    cards,
    duplicates,
    collisions,
    incomplete,
    missingWeight,
    moduleMismatches,
    numberingGaps: findNumberingGaps(cards),
    interventionTypes,
    populationTags,
    kindDisagreements,
  };
}

/**
 * Numbers absent from an otherwise contiguous run.
 *
 * A gap is not automatically a defect — a number may be deliberately reserved.
 * It is reported because the alternative is not noticing: the Module 7 email
 * described eight cards including "response capture and routing", the body has
 * seven, and H-706/H-707 are the missing numbers. That is the difference
 * between a reservation and a card lost during consolidation, and only the
 * methodology owner can say which.
 */
/** Replaces a leading pre-correction code in a name with the corrected one. */
export function renameForCode(name: string, from: string, to: string): string {
  if (from === to) return name;
  return name.indexOf(from) === 0 ? to + name.slice(from.length) : name;
}

/**
 * Codes this file deliberately vacated. Not gaps.
 *
 * Without this, moving H-308 to H-007 reports H-308 as a hole in the Foundation 3
 * run for ever — and a defect report that flags an approved decision as a defect is
 * a report people learn to skip.
 */
const VACATED = CORRECTIONS.filter((c) => c.kind === "recode").map((c) =>
  c.kind === "recode" ? c.from : "",
);

export function findNumberingGaps(cards: ParsedCard[]): string[] {
  const byPrefix = new Map<string, number[]>();

  for (const c of cards) {
    const m = /^H-(\d+)$/.exec(c.cardCode);
    if (!m) continue;
    const digits = m[1];
    const prefix = digits.length >= 4 ? digits.slice(0, 2) : digits[0];
    const n = Number(digits);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix)!.push(n);
  }

  const gaps: string[] = [];
  const vacated = new Set(VACATED);
  // forEach rather than for...of: tsconfig sets no `target`, so it defaults to
  // ES5 and iterating a Map directly is TS2802 under the typecheck ratchet.
  byPrefix.forEach((numbers, prefix) => {
    const sorted = numbers.slice().sort((a, b) => a - b);
    // H-900 is the universal warm-up sitting at the bottom of the H-9xx range;
    // treating it as the start of Module 9's run would invent 12 false gaps.
    const start = prefix === "9" ? sorted.find((n) => n !== 900) ?? sorted[0] : sorted[0];
    const present = new Set(sorted);
    for (let n = start; n < sorted[sorted.length - 1]; n++) {
      const code = `H-${n}`;
      if (!present.has(n) && !vacated.has(code)) gaps.push(code);
    }
  });
  return gaps.sort();
}

/**
 * Compiles integrity gates into a system-prompt section — pure, no imports.
 *
 * ── WHAT A GATE IS, AND WHY IT CANNOT JOIN THE DETECTOR ──────────────────
 * A coaching card fires on the student's turn. A gate fires on WING's OWN
 * OUTPUT, before delivery: its signal describes something Wing is about to say.
 * 24 of the 53 Tier 1 cards are gates — more gates than coaching cards — and
 * before this they had no execution point anywhere in the platform.
 *
 * ── WHY PROMPT-SIDE, AND WHY THAT IS NOT THE WHOLE ANSWER ────────────────
 * Thirteen of them say some variant of "content analysis on Wing's own output
 * before delivery". The turn path streams tokens as they arrive, so the first
 * moment the whole reply exists server-side is after the student has read it —
 * pre-delivery inspection would mean not streaming.
 *
 * The decision taken (Aditya, approved) is measure-then-enforce: compile the
 * rules into the prompt so the model follows them, then audit its actual output
 * afterwards and log violations. Danielle's own framing is that "if the
 * directive is strong, the gates fire rarely", and buffering the stream for a
 * gate that is never violated is cost with no benefit. The audit decides which
 * gates, if any, earn hard enforcement.
 *
 * ── WHY NO CARD CODES OR NAMES REACH THE PROMPT ──────────────────────────
 * IG-U005 forbids internal methodology vocabulary in user-facing output, and
 * IG-V01 forbids anything that sounds like a system. Putting "H-109 Never Assign
 * a Function" into the prompt hands the model a phrase to leak — "as H-109
 * requires…" is exactly the failure those two gates exist to prevent. So the
 * rules are rendered as prose, numbered, unattributed. The audit works from the
 * card list and can attribute a violation without the codes ever being in
 * context.
 */

export type GateCard = {
  cardCode: string;
  name: string;
  coachingMove: string | null;
  failurePath: string | null;
  /** null = applies in every session. */
  appliesToSession: string | null;
};

/**
 * Gates that fire on a content DRAFT, not on a conversational turn.
 *
 * IG-V04 compares an edit against the student's original spoken words, IG-V05 is
 * a pre-publish check on a final draft, IG-V07 scans generated content for
 * AI-generation markers. All three act on an artefact that is composed and then
 * reviewed — which is not streamed, so it has no buffering problem at all, and
 * `authenticity.ts` already runs exactly there.
 *
 * Excluding them is correct on its own merits. It also removes the three largest
 * gates in the set, about 950 tokens off every single turn.
 */
export const DRAFT_PATH_GATES: readonly string[] = ["IG-V04", "IG-V05", "IG-V07"];

/**
 * Session-specific rewordings of a universal gate, and the gate they reword.
 *
 * ── WHY BOTH WORDINGS MUST NOT COMPILE TOGETHER ──────────────────────────
 * Four of the thirteen intake gates are her intake wording of a platform-wide
 * rule, and they say so in their own titles: "IG-INT10 Barnum falsifiability
 * (IG-U006 applied)". Rendering both puts the same rule in one prompt twice, in
 * different words — which is how a model learns a rule is negotiable, and costs
 * 403 tokens at intake for the privilege.
 *
 * The session-specific wording wins where it applies, because it is the more
 * concrete of the two: IG-INT10 says every reveal must fail the substitution
 * test, IG-U006 says every observation in any module must. In a Foundation turn
 * IG-INT10 is not visible at all, so the universal gate renders normally.
 *
 * Kept here rather than read from the document because the runtime builds gates
 * from database rows, which carry no such field. `parse-intake.ts` extracts the
 * mapping from her titles and a test compares the two, so this cannot drift from
 * what she wrote.
 */
export const RESTATES: Readonly<Record<string, string>> = {
  "IG-INT10": "IG-U006",
  "IG-INT11": "IG-U007",
  "IG-INT12": "IG-U010",
  "IG-INT13": "IG-U009",
};

/** The universal gates a restatement in this set makes redundant. */
function restatedIn(gates: readonly GateCard[]): string[] {
  const out: string[] = [];
  for (const g of gates) {
    const twin = RESTATES[g.cardCode];
    if (twin && out.indexOf(twin) < 0) out.push(twin);
  }
  return out;
}

/**
 * Gates whose every stated surface is a module Tier 1 does not have.
 *
 * H-005 (sensitive context containment) detects "Wing drawing on Module 9 power
 * dynamics content for Module 6 content suggestions", Module 8 gaps surfacing in
 * Module 5, Module 4 dissatisfaction resurfacing elsewhere. Every example is
 * cross-module between modules that do not exist yet. Instructing the model
 * about them spends tokens describing a situation it cannot be in.
 *
 * This is not a judgement that the gate is unimportant — it is one of the most
 * important in the set, and it returns the moment Module 6 or 9 ships. It is
 * listed here, not deleted, so that reinstating it is one line.
 */
export const NO_TIER1_SURFACE: readonly string[] = ["H-005"];

/**
 * Gates whose own detection method names a precondition, and the fact that
 * satisfies it.
 *
 * ── WHY A GATE CAN BE WRONG TO INCLUDE ───────────────────────────────────
 * Most gates describe something Wing must never say, and those belong in every
 * turn. Two do not. IG-U012 — IG-U03 as the document still numbers it — says
 * "fires upon file upload in any module context". IG-U014 says "fires at session
 * start or Radar check-in WHEN UNCOMPLETED TASKS EXIST in the task log". Both name
 * a state of the world, and on a turn where that state does not hold the rule is
 * not merely wasted tokens — it is suggestive. IG-U014's rule text is a page of
 * guidance on how to follow up on
 * between-session tasks; handed to a model with no tasks to follow up on, the
 * likeliest effect is that it asks about tasks nobody assigned. A constraint
 * compiled unconditionally can cause the behaviour it was written to shape.
 *
 * Unlisted gates carry no precondition and are always compiled. A condition
 * whose value the caller does not supply counts as SATISFIED: not knowing must
 * never silently drop a rule about what Wing may not do, which is the same
 * safe-direction default `turnPathGates` already takes for unlisted gates.
 */
export type GateConditions = {
  /** This turn's context includes something the student uploaded. */
  hasUploadedDocument?: boolean;
  /** Tasks assigned to the student that they have not answered yet. */
  openTasks?: number;
};

type Precondition = {
  holds: (c: GateConditions) => boolean;
  /** Reads after "excluded: " in the log. */
  reason: string;
  /** Quoted from the gate's own detection_method, so the rule is traceable. */
  source: string;
};

/*
 * Keyed on the corrected codes. Both of these are Module 11 universal gates, and
 * both were renumbered twice on 18 August: IG-U03 → IG-U006 → IG-U012 and
 * IG-U05 → IG-U008 → IG-U014. The second move was forced by her research-derived
 * gates, which claim IG-U006–IG-U011; see CORRECTIONS in parse-compendium.ts.
 *
 * No superseded code appears in this file, deliberately. A stale key here fails
 * OPEN — the gate compiles on every turn regardless of the student's state, and
 * nothing anywhere says why — so the only safe number is the current one.
 */
export const GATE_PRECONDITIONS: Readonly<Record<string, Precondition>> = {
  "IG-U012": {
    holds: (c) => c.hasUploadedDocument !== false,
    reason: "nothing the student uploaded is in this turn's context",
    source: '"Fires upon file upload in any module context"',
  },
  "IG-U014": {
    holds: (c) => c.openTasks === undefined || c.openTasks > 0,
    reason: "the student has no unanswered tasks to follow up on",
    source:
      '"Fires at session start or Radar check-in when uncompleted tasks exist in the task log"',
  },
};

/** Whether a gate's precondition — if it has one — is met. */
function preconditionMet(cardCode: string, conditions: GateConditions): boolean {
  const pre = GATE_PRECONDITIONS[cardCode];
  return pre ? pre.holds(conditions) : true;
}

/**
 * The gates that belong in a conversational turn's prompt.
 *
 * Anything unlisted is INCLUDED. A gate Danielle adds later reaches the prompt
 * by default rather than being silently dropped, which is the safe direction for
 * a rule about what Wing must never do.
 */
export function turnPathGates(
  gates: readonly GateCard[],
  conditions: GateConditions = {},
): GateCard[] {
  const redundant = restatedIn(gates);
  return gates.filter(
    (g) =>
      DRAFT_PATH_GATES.indexOf(g.cardCode) < 0 &&
      NO_TIER1_SURFACE.indexOf(g.cardCode) < 0 &&
      redundant.indexOf(g.cardCode) < 0 &&
      preconditionMet(g.cardCode, conditions),
  );
}

/** Gates excluded from the turn path, for logging what was left out. */
export function excludedGates(
  gates: readonly GateCard[],
  conditions: GateConditions = {},
): Array<{ cardCode: string; reason: string }> {
  const out: Array<{ cardCode: string; reason: string }> = [];
  for (const g of gates) {
    if (DRAFT_PATH_GATES.indexOf(g.cardCode) >= 0) {
      out.push({ cardCode: g.cardCode, reason: "fires on a content draft, not a turn" });
    } else if (NO_TIER1_SURFACE.indexOf(g.cardCode) >= 0) {
      out.push({ cardCode: g.cardCode, reason: "every stated surface is a Tier 2 module" });
    } else if (restatedIn(gates).indexOf(g.cardCode) >= 0) {
      const by = Object.keys(RESTATES).filter((k) => RESTATES[k] === g.cardCode);
      out.push({
        cardCode: g.cardCode,
        reason: `restated for this session by ${by.join(", ")}, which is the more concrete wording`,
      });
    } else if (!preconditionMet(g.cardCode, conditions)) {
      out.push({ cardCode: g.cardCode, reason: GATE_PRECONDITIONS[g.cardCode].reason });
    }
  }
  return out;
}

/**
 * A card code in any family the methodology uses — `H-109`, `IG-U04`, `IG-V01`,
 * `IG-S01`, `IG-INT06`, `H-019.5`, `RT-01`.
 *
 * Deliberately the DOCUMENT's numbering as well as ours: this pattern reads rule
 * text that came out of the compendium, where the Module 11 trio is still
 * IG-U03/04/05. It matches both, which is what makes it safe for a renumbering to
 * happen underneath it.
 *
 * ── WHY THE FAMILY LIST GREW ON 18 AUGUST ────────────────────────────────
 * It was `(?:V|UX|MJ|U)?` and two-to-four digits, which was every family that
 * existed. Then the intake module arrived with `IG-INT01`–`IG-INT13`, a decimal
 * code in `H-019.5`, and fifteen reveal templates referred to as `RT-01`–`RT-15`;
 * and the safety architecture is cited as `IG-S01` and friends. Five real leaks
 * followed, all of them measured rather than imagined: IG-INT04's rule names
 * IG-S01, IG-S02, IG-S07 and IG-S09, and H-019.5's coaching move cites IG-INT06.
 * Every one would have reached a student as written.
 *
 * `\d{1,4}` rather than `\d{2,4}` because RT-1 and H-7 are one bad edit away, and
 * a redaction pattern that is too narrow fails silently in the one direction that
 * matters.
 *
 * Used to redact, not to parse. See `redactCardCodes`.
 */
const CARD_CODE =
  /\b(?:H|IG|EX|RT)-(?:V|UX|MJ|U|S|INT)?\d{1,4}(?:\.\d)?\b/g;

/** What a redacted citation is replaced with. */
const REDACTION = "another of these rules";

/**
 * Removes card codes from rule text before it reaches the model.
 *
 * Two of the twenty turn-path gates cite other cards inside their own rule text:
 * H-109 says "the elimination exercise (H-103) produces candidates", and IG-U04
 * says "this is related to H-001 (Pattern-vs-Instance) and H-807". Both are
 * editorial asides for a human reader — the instruction is intact without them.
 *
 * They cannot go into the prompt as written. IG-U005 forbids internal methodology
 * vocabulary in user-facing output and IG-V01 forbids sounding like a system, and
 * a code sitting in context is a phrase the model can repeat: "as H-103 requires"
 * is precisely the failure those two gates exist to prevent.
 *
 * The substitution is deliberately clumsy rather than clever. Rewriting the
 * sentence would mean editing the methodology owner's words inside a compiler,
 * where nobody would ever see the edit. Slightly awkward instruction prose is a
 * much smaller cost than a leaked identifier, and `redactedFrom` reports every
 * substitution so the source can be tidied properly.
 */
export function redactCardCodes(text: string): string {
  return text.replace(CARD_CODE, REDACTION);
}

/**
 * A card's human label: its name with the methodology's identifiers stripped.
 *
 * `buildGuidance` puts the matched card's NAME into the system prompt — "A
 * coaching signal has been detected: H-308 Wing chunked messaging" — and every
 * one of the 46 Tier 1 coaching card names begins with its code. The intake cards
 * carry two: "H-020 RT-01 Title/Function Split".
 *
 * Redacting a name is the wrong move: "another of these rules Title/Function
 * Split" is worse than the leak. Stripping the leading identifiers leaves the part
 * that was always meant for a human reader.
 */
export function cardLabel(name: string): string {
  const stripped = name
    .replace(/^(?:(?:H|IG|EX|RT)-(?:V|UX|MJ|U|S|INT)?\d{1,4}(?:\.\d)?[\s—–:.-]*)+/, "")
    .trim();
  // Never return nothing. A card whose whole name is its code is a data problem,
  // and an empty signal label would read to the model as a missing instruction.
  return stripped || name;
}

/** Which gates needed a citation redacted, and which codes they cited. */
export function redactedFrom(
  gates: readonly GateCard[],
): Array<{ cardCode: string; cited: string[] }> {
  const out: Array<{ cardCode: string; cited: string[] }> = [];
  for (const g of turnPathGates(gates)) {
    const found = (g.coachingMove ?? "").match(CARD_CODE) ?? [];
    const cited: string[] = [];
    for (const c of found) {
      if (c !== g.cardCode && cited.indexOf(c) < 0) cited.push(c);
    }
    if (cited.length) out.push({ cardCode: g.cardCode, cited });
  }
  return out;
}

export type CompileOptions = {
  /**
   * The state of the world this turn, for the two gates that name one.
   *
   * Omitted means "not known", which counts as satisfied — see
   * GATE_PRECONDITIONS. Every existing caller therefore compiles exactly what it
   * compiled before this option existed.
   */
  conditions?: GateConditions;
  /**
   * Include each gate's failure path — its self-correction guidance.
   *
   * Off by default. It adds roughly 800 tokens to every turn to describe what to
   * do after a violation the model is being told not to commit, and the audit
   * will show whether violations actually happen. Turn it on for a gate class
   * the audit shows being violated.
   */
  includeFailurePath?: boolean;
};

/**
 * Renders the gate section, or "" when there is nothing to say.
 *
 * Returns the empty string rather than a heading with no rules under it: an
 * empty "rules you must follow" section reads to a model as though the rules
 * were withheld.
 */
export function compileGates(
  gates: readonly GateCard[],
  opts: CompileOptions = {},
): string {
  const usable = turnPathGates(gates, opts.conditions ?? {}).filter(
    (g) => g.coachingMove && g.coachingMove.trim(),
  );
  if (!usable.length) return "";

  const always = usable.filter((g) => g.appliesToSession === null);
  const here = usable.filter((g) => g.appliesToSession !== null);

  const render = (list: readonly GateCard[], from: number) =>
    list.map((g, i) => {
      const rule = `${from + i}. ${redactCardCodes(g.coachingMove!.trim())}`;
      return opts.includeFailurePath && g.failurePath?.trim()
        ? `${rule}\n   If this is breached, correct it: ${redactCardCodes(g.failurePath.trim())}`
        : rule;
    });

  const parts: string[] = [
    "── Rules that govern how you reply ──",
    "",
    "Every rule below applies to what YOU say, not to what the student says.",
    "Follow all of them in every reply. Never mention them, name them, quote them,",
    "or explain that a rule applied — the student should experience good coaching,",
    "not a description of the system that produced it.",
    "",
  ];

  if (always.length) {
    parts.push("Always:", ...render(always, 1), "");
  }
  if (here.length) {
    parts.push("In this part of the programme:", ...render(here, always.length + 1), "");
  }

  return parts.join("\n").trimEnd();
}

/**
 * Parses the research-derived gates document — six universal gates, five module
 * gates, six audience behavioural rules.
 *
 * ── WHY A THIRD PARSER, AND WHY IT REPORTS MORE THAN IT PRODUCES ──────────
 * This document is two shapes stapled together, and only one of them is a card.
 *
 * Part B gives the five module gates as proper seven-component tables under
 * `### H-111 — …` headings: those are cards, and they parse as cards. The six
 * universal gates do not. They arrive as prose — a research citation, what the
 * gate enforces, the rule itself, where it fires hardest, violation and correct
 * examples — which is a good way to explain a gate to a person and not a card
 * specification. Five of the seven components simply are not in the document.
 *
 * So this parser extracts what is there, verbatim, and REPORTS what is not. The
 * alternative was to fill the gaps: read "where it fires hardest" as `signal`,
 * invent a `detection_method`, decide a `failure_path`. Each of those is a
 * methodology decision, and a methodology decision taken silently inside a
 * parser is the single thing the corrections layer exists to prevent. Danielle
 * can supply five rows per gate in an afternoon; nobody can un-invent a gate
 * that shipped with a `failure_path` we made up.
 *
 * ── THE ONE MAPPING IT DOES MAKE ─────────────────────────────────────────
 * `coaching_move` ← the rule paragraph. A compendium gate's `coaching_move` is
 * "what Wing must do"; each of these gates has exactly one paragraph that says
 * what Wing must do and nothing else. The label differs between gates — "The
 * rule", "The sequence", "The structural pattern" — so the label is named per
 * gate in RULE_LABEL rather than guessed, and the parser fails loudly if the
 * named label is absent.
 *
 * `delivery_adaptation` ← Part A, which is titled "Audience Delivery
 * Adaptations" and is that field by another name. IG-U010's Part A says no
 * adaptation is needed, which is an answer rather than a gap.
 */

import {
  COMPONENT_KEYS,
  cardKindOf,
  hash,
  moduleFromCode,
  unescapeMd,
  type CardKind,
  type ComponentKey,
  type ParsedCard,
} from "./parse-compendium";

export const RESEARCH_GATES_SOURCE = "methodology/wing-research-derived-gates.md";

/** The label whose paragraph is the rule, per gate. Named, never guessed. */
const RULE_LABEL: Readonly<Record<string, string>> = {
  "IG-U006": "The rule",
  "IG-U007": "The rule",
  "IG-U008": "The sequence",
  "IG-U009": "The rule",
  "IG-U010": "The structural pattern",
  "IG-U011": "The rule",
};

/**
 * The five components no universal gate in this document supplies.
 *
 * Not computed from the document — stated, so that the day one of them arrives
 * the test fails and this constant is what gets deleted.
 */
export const UNIVERSAL_GATE_GAPS: readonly ComponentKey[] = [
  "signal",
  "detection_method",
  "intervention_type",
  "success_criteria",
  "failure_path",
];

export type LabelledField = { label: string; text: string };

export type ResearchGate = {
  cardCode: string;
  /** From the heading: "Barnum Falsifiability". */
  name: string;
  /** Every `**Label:**` block in the section, verbatim, in document order. */
  fields: LabelledField[];
  /** The label RULE_LABEL names for this gate. */
  ruleLabel: string;
  /** What Wing must do. The only field that would reach a prompt. */
  rule: string;
  /** Part A's per-track notes. Empty for IG-U010 — see `audienceStatement`. */
  audienceNotes: LabelledField[];
  /**
   * Part A's prose when it gives no per-track notes at all.
   *
   * IG-U010's entry reads "No audience-specific adaptations needed. The
   * structural pattern is universal." That is an answer, and an empty
   * `audienceNotes` on its own would be indistinguishable from a section this
   * parser failed to read.
   */
  audienceStatement: string | null;
  /** Components the document does not supply. Always UNIVERSAL_GATE_GAPS today. */
  missingComponents: ComponentKey[];
  line: number;
};

/**
 * An audience behavioural rule. Her instruction: "These go in the routing
 * behavioural rules section of the compendium, not in the gate library. They're
 * coaching approach adaptations, not hard-stop gates." So they are not cards and
 * carry no code.
 */
export type BehaviouralRule = {
  /** "Career Returner", "Entrepreneur (All Sub-Tracks)". */
  track: string;
  name: string;
  rule: string;
  bannedFramings: string | null;
  correctFramings: string | null;
  line: number;
};

/** One row of one of her detection-signal tables, verbatim. */
export type IdentitySignalRow = {
  /** "\"Should\" language (3+ instances in intake)" */
  signal: string;
  /** "Across Q1–Q6", "Foundation 1" */
  source: string;
  /** The cell as written — Part D annotates it: "External (anticipating judgment)". */
  points: string;
  /**
   * The direction the cell names, or null if the cell says something else.
   *
   * Both are kept: `points` verbatim because the parenthetical carries her
   * reasoning, `direction` because 17 of the 34 cells would otherwise each need
   * their own string comparison at the call site.
   */
  direction: "external" | "internal" | null;
};

/** One of her four detection-signal tables, named by the label above it. */
export type IdentitySignalTable = {
  label: string;
  rows: IdentitySignalRow[];
  line: number;
};

export type ResearchGatesParseResult = {
  /** The six universal gates, in prose form. Not seedable as cards yet. */
  universalGates: ResearchGate[];
  /** The five module gates from Part B, as ordinary cards. */
  moduleGates: ParsedCard[];
  behaviouralRules: BehaviouralRule[];
  /** Module gates whose intervention type disagrees with the document's filing. */
  kindDisagreements: Array<{
    cardCode: string;
    interventionType: string | null;
    resolvedAs: CardKind;
  }>;
  /** Module gates missing one or more of the seven components. */
  incomplete: Array<{ cardCode: string; missing: ComponentKey[] }>;
  /**
   * The identity-reference-frame detection tables, verbatim.
   *
   * Read from the document rather than transcribed, for the same reason the
   * compendium is parsed rather than typed out: 34 rows is enough to get wrong
   * once, and a reissue should show up as a failing count rather than as nothing.
   *
   * These are the SIGNALS, not the detectors. "Self-description leads with
   * company/title" is a classification the intake engine produces from Q5; it is
   * not a string anything can match. See identity-frame.ts for which of them can
   * be detected mechanically today and which wait on the intake engine.
   */
  identitySignalTables: IdentitySignalTable[];
};

/** Part A's answer for one gate: per-track notes, or a statement instead. */
type AudienceEntry = { notes: LabelledField[]; statement: string | null };

const SIGNAL_LABEL = /^\*\*(.*(?:signals|refinement)[^*]*):\*\*\s*$/i;
const TABLE_ROW = /^\|(.+)\|\s*$/;

/**
 * Her four detection-signal tables, found by the label above each.
 *
 * Deliberately independent of the `###` section walk. Part D carries two of the
 * four tables directly under its `##` heading with no `###` between, so a
 * section-based reader drops them silently — which is exactly the class of
 * failure that costs a methodology row without telling anyone.
 */
export function identitySignalTables(text: string): IdentitySignalTable[] {
  const lines = text.split("\n").map(unescapeMd);
  const out: IdentitySignalTable[] = [];

  for (let i = 0; i < lines.length; i++) {
    const label = SIGNAL_LABEL.exec(lines[i].trim());
    if (!label) continue;

    const rows: IdentitySignalRow[] = [];
    let j = i + 1;
    // Skip the blank line the tables sit after.
    while (j < lines.length && !lines[j].trim()) j++;
    for (; j < lines.length; j++) {
      const row = TABLE_ROW.exec(lines[j].trim());
      if (!row) break;
      const cells = row[1].split("|").map((c) => c.trim());
      if (cells.length < 3) continue;
      // The header and its separator, skipped by shape rather than by position.
      if (/^-+$/.test(cells[0]) || cells[0] === "Signal") continue;
      const first = (cells[2].split(/[\s(]/)[0] ?? "").toLowerCase();
      rows.push({
        signal: cells[0],
        source: cells[1],
        points: cells[2],
        direction: first === "external" || first === "internal" ? first : null,
      });
    }
    if (rows.length) out.push({ label: label[1].trim(), rows, line: i + 1 });
  }
  return out;
}

const H2 = /^##\s+(.*)$/;
const H3 = /^###\s+(.*)$/;
const LABEL = /^\*\*([^*]+?):\*\*\s*(.*)$/;
const COMPONENT_ROW = /^\|\s*\*{0,2}\s*(\d)\s*\.\s*([a-z_]+)\s*\*{0,2}\s*\|\s*(.*?)\s*\|\s*$/;
const UNIVERSAL_HEADING = /^(IG-U\d+):\s*(.*)$/;
const AUDIENCE_HEADING = /^(IG-U\d+)\s*\(/;
const MODULE_HEADING = /^(H-\d+)\s*[—–-]\s*(.*)$/;
const TRACK_HEADING = /^([^:]+):\s*(.+)$/;

/** Every `**Label:**` block in a section, verbatim. */
function labelledFields(body: string[]): LabelledField[] {
  const out: LabelledField[] = [];
  for (const line of body) {
    const m = LABEL.exec(line.trim());
    if (m) {
      out.push({ label: m[1].trim(), text: m[2].trim() });
      continue;
    }
    // Continuation — a bullet list or a wrapped paragraph under the last label.
    if (out.length && line.trim()) {
      out[out.length - 1].text = `${out[out.length - 1].text}\n${line.trim()}`.trim();
    }
  }
  for (const f of out) f.text = f.text.trim();
  return out;
}

function fieldText(fields: LabelledField[], label: string): string | null {
  for (const f of fields) if (f.label === label) return f.text;
  return null;
}

type Section = { part: string; heading: string; body: string[]; line: number };

/** Splits the document into `###` sections, each tagged with its `##` part. */
function sections(text: string): Section[] {
  const lines = text.split("\n").map(unescapeMd);
  const out: Section[] = [];
  let part = "";
  let current: Section | null = null;

  for (let i = 0; i < lines.length; i++) {
    const three = H3.exec(lines[i]);
    if (three) {
      current = { part, heading: three[1].trim(), body: [], line: i + 1 };
      out.push(current);
      continue;
    }
    const two = H2.exec(lines[i]);
    if (two) {
      part = two[1].trim();
      current = null;
      continue;
    }
    if (current) current.body.push(lines[i]);
  }
  return out;
}

export function parseResearchGates(text: string): ResearchGatesParseResult {
  const universalGates: ResearchGate[] = [];
  const moduleGates: ParsedCard[] = [];
  const behaviouralRules: BehaviouralRule[] = [];
  const kindDisagreements: ResearchGatesParseResult["kindDisagreements"] = [];
  const incomplete: ResearchGatesParseResult["incomplete"] = [];

  const all = sections(text);
  const audience = new Map<string, AudienceEntry>();

  /* Part A first: the universal gates need it. */
  for (const s of all) {
    if (s.part.indexOf("Part A") !== 0) continue;
    const m = AUDIENCE_HEADING.exec(s.heading);
    if (!m) continue;
    const notes = labelledFields(s.body);
    const prose = s.body.join("\n").trim();
    audience.set(m[1], { notes, statement: notes.length ? null : prose || null });
  }

  for (const s of all) {
    /* ── The six universal gates ── */
    if (s.part.indexOf("PLATFORM-WIDE GATES") === 0) {
      const m = UNIVERSAL_HEADING.exec(s.heading);
      if (!m) continue;
      const cardCode = m[1];
      const fields = labelledFields(s.body);
      const ruleLabel = RULE_LABEL[cardCode];
      if (!ruleLabel) {
        throw new Error(`${cardCode} has no entry in RULE_LABEL — add one, do not guess`);
      }
      const rule = fieldText(fields, ruleLabel);
      if (!rule) {
        throw new Error(
          `${cardCode}: RULE_LABEL says "${ruleLabel}" and the document has no such label`,
        );
      }
      universalGates.push({
        cardCode,
        name: m[2].trim(),
        fields,
        ruleLabel,
        rule,
        audienceNotes: audience.get(cardCode)?.notes ?? [],
        audienceStatement: audience.get(cardCode)?.statement ?? null,
        missingComponents: UNIVERSAL_GATE_GAPS.slice(),
        line: s.line,
      });
      continue;
    }

    /* ── Part B: the five module gates, as cards ── */
    if (s.part.indexOf("Part B") === 0) {
      const m = MODULE_HEADING.exec(s.heading);
      if (!m) continue;
      const cardCode = m[1];
      const components: Partial<Record<ComponentKey, string>> = {};
      for (const line of s.body) {
        const row = COMPONENT_ROW.exec(line);
        if (!row) continue;
        const key = row[2] as ComponentKey;
        if ((COMPONENT_KEYS as readonly string[]).indexOf(key) >= 0) {
          components[key] = row[3].trim();
        }
      }
      const missing = COMPONENT_KEYS.filter((k) => !components[k]);
      if (missing.length) incomplete.push({ cardCode, missing: missing.slice() });

      const interventionType = components.intervention_type
        ? (/^\s*\*{0,2}([A-Z][A-Z_]+)/.exec(components.intervention_type)?.[1] ?? null)
        : null;

      /*
       * `heading` is the card's own heading, not the part title. The part title is
       * "Module-Specific Gates" and would classify all five as gates by the word
       * alone — including H-315 and H-616, which declare COACH and detect on the
       * student's turn. Same treatment the compendium gets, and the disagreement
       * with her filing is reported rather than resolved by whichever string the
       * parser happened to read.
       */
      const cardKind = cardKindOf(cardCode, interventionType, s.heading);
      const typeSaysGate = interventionType === "META" || interventionType === "GATE";
      if (!typeSaysGate) {
        kindDisagreements.push({ cardCode, interventionType, resolvedAs: cardKind });
      }

      moduleGates.push({
        cardCode,
        name: `${cardCode} ${m[2].trim()}`,
        description: "",
        populationTags: [],
        components,
        moduleMapping: null,
        notes: null,
        weight: null,
        module: moduleFromCode(cardCode),
        heading: s.heading,
        line: s.line,
        bodyHash: hash(COMPONENT_KEYS.map((k) => components[k] ?? "").join(" ")),
        interventionType,
        cardKind,
      });
      continue;
    }

    /* ── The audience behavioural rules: three in the body, three in Part C ── */
    const isRuleSection =
      s.part.indexOf("AUDIENCE-SPECIFIC BEHAVIORAL RULES") === 0 ||
      s.part.indexOf("Part C") === 0;
    if (!isRuleSection) continue;
    const m = TRACK_HEADING.exec(s.heading);
    if (!m) continue;
    const fields = labelledFields(s.body);
    const rule = fieldText(fields, "The rule");
    if (!rule) continue;
    behaviouralRules.push({
      track: m[1].trim(),
      name: m[2].trim(),
      rule,
      bannedFramings: fieldText(fields, "Banned framings"),
      correctFramings: fieldText(fields, "Correct framings"),
      line: s.line,
    });
  }

  return {
    universalGates,
    moduleGates,
    behaviouralRules,
    kindDisagreements,
    incomplete,
    identitySignalTables: identitySignalTables(text),
  };
}

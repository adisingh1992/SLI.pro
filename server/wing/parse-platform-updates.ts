import { moduleFromCode, unescapeMd } from "./parse-compendium";

/**
 * Parses Wing_Platform_Updates (19 August) — the six platform-wide gates and
 * the one Reveal Cycle gate that is defined here rather than in v4.
 *
 * ── WHY THESE SEVEN LIVE IN A SEPARATE PARSER ────────────────────────────
 * IG-U012–U017 are not written as cards. They arrived as an engineering memo:
 * an H2 naming the gate, then a run of `**Label:**` paragraphs — Promoted from,
 * Scope, What it enforces, Research basis, Modules affected. There is no
 * component table anywhere in the document, so five of the seven components do
 * not exist for any of them. That is the same shape parse-research-gates deals
 * with, and it is handled the same way: the rule is the gate, everything else
 * is kept verbatim as a labelled field, and nothing is invented to fill a
 * seven-component template these gates were never written against.
 *
 * ── IG-RC13 IS HERE, AND THAT IS DELIBERATE ──────────────────────────────
 * The Reveal Cycle v4 document stops at IG-RC12. IG-RC13 (Unsourced Population
 * Claims) is defined only in this memo, and Doc 2's Appendix A settles the
 * question outright — "IG-RC13 source: Platform Updates canonical". So it is
 * parsed here, filed under its own module by its code, and the Reveal Cycle
 * parser is left reporting twelve gates because twelve is what its document
 * contains. Two parsers, one numbering band, no duplicate record.
 *
 * ── THE RULE LABEL IS DECLARED, NEVER GUESSED ────────────────────────────
 * Every gate in this memo happens to state its rule under "What it enforces".
 * The table below still names it per gate and the parser throws when a gate is
 * missing from it, because "they all use the same label today" is a property of
 * this revision, and a later gate that states its rule under a different label
 * would otherwise be seeded with an empty rule and no complaint. That is
 * parse-research-gates' rule and the reason for it is unchanged.
 */

export const PLATFORM_UPDATES_SOURCE = "methodology/wing-platform-updates-aug19.md";

/** The label carrying the enforceable rule, per gate. Declared, not inferred. */
const RULE_LABEL: Readonly<Record<string, string>> = {
  "IG-U012": "What it enforces",
  "IG-U013": "What it enforces",
  "IG-U014": "What it enforces",
  "IG-U015": "What it enforces",
  "IG-U016": "What it enforces",
  "IG-U017": "What it enforces",
  "IG-RC13": "What it enforces",
};

export type LabelledField = { label: string; text: string };

export type PlatformGate = {
  cardCode: string;
  /** From the heading: "Evidence Grade Classification". */
  name: string;
  /** Every `**Label:**` block in the section, verbatim, in document order. */
  fields: LabelledField[];
  /** The label RULE_LABEL names for this gate. */
  ruleLabel: string;
  /** What Wing must do. The only field that would reach a prompt. */
  rule: string;
  /** The `Scope:` paragraph, which is what makes these platform-wide. */
  scope: string | null;
  /** `Research basis:` or `Promoted from:` — where the gate came from. */
  provenance: string | null;
  module: string;
  line: number;
};

export type PlatformUpdatesParseResult = {
  gates: PlatformGate[];
  /** Gates whose section carries no text under the declared rule label. */
  ruleless: string[];
  /** Same code twice. */
  collisions: Array<{ cardCode: string; line: number; firstSeenLine: number }>;
  /** Codes in RULE_LABEL that the document does not contain. */
  missing: string[];
};

/** `## New Universal Gate: IG-U012 — Evidence Grade Classification` and
 *  `## Gate Definition: IG-RC13 — Unsourced Population Claims`. */
const GATE_HEADING = /^#{2}\s+.*?\b((?:IG-U|IG-RC)\d+)\s*[—–-]\s*(.+?)\s*$/;
const ANY_HEADING = /^#{1,2}\s+/;
const LABEL = /^\*\*([^*]+?):\*\*\s*(.*)$/;

export function parsePlatformUpdates(text: string): PlatformUpdatesParseResult {
  const lines = text.split("\n");

  const gates: PlatformGate[] = [];
  const ruleless: string[] = [];
  const collisions: PlatformUpdatesParseResult["collisions"] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const head = GATE_HEADING.exec(unescapeMd(lines[i]));
    if (!head) continue;

    const cardCode = head[1];
    const name = head[2].trim();
    const line = i + 1;

    const firstSeen = seen.get(cardCode);
    if (firstSeen !== undefined) {
      collisions.push({ cardCode, line, firstSeenLine: firstSeen });
      continue;
    }
    seen.set(cardCode, line);

    const ruleLabel = RULE_LABEL[cardCode];
    if (!ruleLabel) {
      throw new Error(
        `${cardCode} has no entry in RULE_LABEL — add one naming the label that ` +
          `carries its rule. Do not guess: a gate seeded with the wrong paragraph ` +
          `compiles the wrong sentence into every prompt.`,
      );
    }

    // Collect labelled blocks until the next heading. A block runs to the next
    // label or heading, so a rule spanning several lines — including its bullet
    // list — arrives whole rather than truncated at the first newline.
    const fields: LabelledField[] = [];
    let current: LabelledField | null = null;

    for (let j = i + 1; j < lines.length; j++) {
      const raw = unescapeMd(lines[j]);
      if (ANY_HEADING.test(raw)) break;

      const label = LABEL.exec(raw.trim());
      if (label) {
        if (current) fields.push(current);
        current = { label: label[1].trim(), text: label[2].trim() };
        continue;
      }
      if (current && raw.trim()) {
        current.text = current.text ? `${current.text}\n${raw.trim()}` : raw.trim();
      }
    }
    if (current) fields.push(current);

    const find = (label: string) =>
      fields.find((f) => f.label.toLowerCase() === label.toLowerCase())?.text ?? null;

    const rule = find(ruleLabel);
    if (!rule) {
      ruleless.push(cardCode);
    }

    gates.push({
      cardCode,
      name,
      fields,
      ruleLabel,
      rule: rule ?? "",
      scope: find("Scope"),
      provenance: find("Research basis") ?? find("Promoted from") ?? find("Source"),
      module: moduleFromCode(cardCode),
      line,
    });
  }

  const found = new Set(gates.map((g) => g.cardCode));
  const missing = Object.keys(RULE_LABEL).filter((c) => !found.has(c));

  return { gates, ruleless, collisions, missing };
}

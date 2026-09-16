import { unescapeMd } from "./parse-compendium";
import {
  parseComponentCards,
  type ComponentCard,
  type ComponentCardsResult,
} from "./parse-component-cards";

/**
 * Parses the two UX documents — IG-UX01–06 and IG-MJ01–06.
 *
 * ── TWO GATE FAMILIES, TWO DOCUMENTS, TWO SHAPES ─────────────────────────
 * The UX Recommendation's Part 8 writes its six gates as full seven-component
 * cards under H2 headings, so they go through the shared component-table
 * grammar and arrive as complete records. The Addendum writes its six as three
 * columns — Gate ID, Rule, Source — and says so plainly: they are behavioural
 * requirements promoted to gates, not cards authored as cards. Doc 3 agrees
 * ("Summaries are canonical. Full 7-component specs were never produced") and
 * Doc 2's Appendix C files the expansion as a Priority 3 maybe.
 *
 * So the IG-MJ six seed the way intake's thirteen gates did: the rule is the
 * gate, one component, and the six the document does not supply stay absent.
 * Inventing a failure_path for a crisis-language rule is not a thing that can
 * be undone once it has shipped.
 *
 * ── NEITHER FAMILY IS NAMED, AND THE PARSER DOES NOT NAME THEM ───────────
 * IG-UX gates have titles in their headings. IG-MJ gates have none at all —
 * the table is a code, a rule and a section reference. So `name` is the bare
 * code and `nameFromDocument` is false, which the coverage report counts and
 * prints. The alternative was to summarise each rule into a title, and a
 * parser that writes titles is a parser that authors methodology: "IG-MJ01
 * Three-response minimum" is a reading of the rule, not the document's words.
 * Naming them is one of the edits Danielle asked to be able to make.
 */

export const UX_RECOMMENDATION_SOURCE = "methodology/wing-ux-recommendation.md";
export const UX_ADDENDUM_SOURCE = "methodology/wing-ux-addendum.md";
export const UX_MODULE = "ux";
export const MJ_MODULE = "micro_journaling";

export type UxGate = ComponentCard;

export type MicroJournalGate = {
  cardCode: string;
  /** The bare code. These gates have no title anywhere in the corpus. */
  name: string;
  /** Always false here — kept explicit so the report can count them. */
  nameFromDocument: boolean;
  /** The gate's enforceable text, verbatim from the table. */
  rule: string;
  /** The addendum section the requirement was promoted from. */
  source: string;
  module: string;
  line: number;
};

export type UxGatesParseResult = {
  uxGates: ComponentCardsResult;
  mjGates: MicroJournalGate[];
  /** Codes in the expected sets that the documents do not contain. */
  missing: string[];
};

const EXPECTED_UX = ["IG-UX01", "IG-UX02", "IG-UX03", "IG-UX04", "IG-UX05", "IG-UX06"];
const EXPECTED_MJ = ["IG-MJ01", "IG-MJ02", "IG-MJ03", "IG-MJ04", "IG-MJ05", "IG-MJ06"];

/** `| IG-MJ01 | Never recommend a module based on … | Section A2 |` */
const MJ_ROW = /^\|\s*(IG-MJ\d+)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$/;

export function parseUxGates(recommendation: string, addendum: string): UxGatesParseResult {
  const uxGates = parseComponentCards(recommendation, {
    codePattern: "IG-UX\\d+",
    cardHeadingLevel: 2,
    expectedModule: UX_MODULE,
    moduleMapping: "UX layer — navigation, dashboard and messaging",
  });

  const mjGates: MicroJournalGate[] = [];
  const seen = new Set<string>();
  const lines = addendum.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const row = MJ_ROW.exec(unescapeMd(lines[i]).trim());
    if (!row) continue;

    const cardCode = row[1];
    // The addendum states the table once, but a later revision that repeats it
    // in a summary must not produce two records for one gate.
    if (seen.has(cardCode)) continue;
    seen.add(cardCode);

    mjGates.push({
      cardCode,
      name: cardCode,
      nameFromDocument: false,
      rule: row[2].trim(),
      source: row[3].trim(),
      module: MJ_MODULE,
      line: i + 1,
    });
  }

  const found = new Set([...uxGates.cards.map((c) => c.cardCode), ...mjGates.map((g) => g.cardCode)]);
  const missing = [...EXPECTED_UX, ...EXPECTED_MJ].filter((c) => !found.has(c));

  return { uxGates, mjGates, missing };
}

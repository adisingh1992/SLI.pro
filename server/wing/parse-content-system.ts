/**
 * Parses `methodology/wing-content-system-v1.md` — Danielle's Content Trigger Layer
 * spec (H-620–627, H-701, IG-M6-01–05, IG-IMG-01–03) — into the same kind of
 * canonical records `parse-compendium.ts` produces for the main compendium.
 *
 * ── WHY A SEPARATE PARSER RATHER THAN REFORMATTING THE DOCUMENT ───────────
 * The two documents are not the same dialect. The main compendium's parser requires
 * a `##`/`###` markdown heading per card, `**name:**`/`**description:**`/
 * `**populationTags:**` with bold markers, and bold numbered table rows
 * (`| **1. signal** | ... |`). This document uses none of that: cards are bare
 * `H-620 Comment Trigger` lines, fields are plain `name:`/`description:` with no
 * bold, table rows are un-bolded (`| 1. signal | ... |`), and the eight gates
 * (IG-M6-*, IG-IMG-*) don't use the seven-component table at all — they're a
 * `name` / `gate_type` / `Rule:` shape the compendium parser has no field for.
 *
 * Reformatting ~9,000 words of spec into the compendium's exact markup to reuse
 * one parser would risk introducing transcription errors into the rules that gate
 * what Wing is allowed to say (IG-U006, IG-U017, IG-M6-03's comfort gating) — the
 * same reason `parse-compendium.ts` itself exists instead of hand-transcribing.
 * A second, purpose-built parser for this document's own grammar avoids that
 * risk entirely: it reads exactly what's on the page.
 *
 * ── WHAT IT SHARES WITH parse-compendium.ts, AND WHY ───────────────────────
 * `ComponentKey`/`COMPONENT_KEYS` (the seven-component table's field names are
 * identical in both documents — "signal", "detection_method", etc.), `unescapeMd`
 * (this document is backslash-escaped the same way), and `moduleFromCode` (so this
 * parser can report, from the corrected version, whether every code it finds is
 * one the shared module-classification logic actually recognizes — see
 * `unrecognizedByCompendium` below). Nothing else is shared, because nothing else
 * is the same shape.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
 * Same discipline as parse-compendium.ts: it does not touch the database, and it
 * does not repair the document. A malformed or missing field is reported in
 * `warnings`, not guessed at.
 */

import {
  COMPONENT_KEYS,
  moduleFromCode,
  unescapeMd,
  type ComponentKey,
} from "./parse-compendium";

export type ContentSystemCard = {
  /** `H-620`, `H-701`. Verbatim from the `name:` line (not the bare title line
   *  above it, which is sometimes absent — H-701 has no separate title line). */
  cardCode: string;
  name: string;
  description: string;
  populationTags: string[];
  components: Partial<Record<ComponentKey, string>>;
  moduleMapping: string | null;
  notes: string | null;
  /** 1-based line of the card's heading/name line, so a reviewer can find it. */
  line: number;
};

export type ContentSystemGate = {
  /** `IG-M6-01`, `IG-IMG-01`. */
  cardCode: string;
  /** The title text from the heading line — gates have no separate `name:` field. */
  name: string;
  gateType: string;
  /** The full Rule paragraph, joined across its source lines with `\n`, including
   *  any sub-bullets (○) and a trailing Implementation note where the document
   *  has one (IG-IMG-01). */
  rule: string;
  line: number;
};

/**
 * Cards from THIS document — and only this document — that a Tier 1 client
 * requirement pulls in, despite their derived module (module_6, module_7) not
 * being Tier 1 scope on its own.
 *
 * ── WHY THIS LIVES HERE, NOT IN parse-compendium.ts's TIER1_INCLUDED ────────
 * It did, briefly. `Wing_Content_System_v1` reuses the code "H-701" for Baby
 * Radar Topic Suggestion — Aditya ruled the card itself Tier 1 on 2 Sep 2026 —
 * but the master compendium already has an unrelated, real "H-701 Radar
 * weekly brief generation" card (the full Module 7 weekly-brief pipeline,
 * correctly Tier 2). `parse-compendium.ts`'s `TIER1_INCLUDED` is keyed by bare
 * card code and checked against any `ParsedCard` regardless of source
 * document, so an entry for "H-701" there silently promoted BOTH cards —
 * caught by `npm test`'s "53 cards are in Tier 1 scope" going to 54.
 *
 * This table only ever sees cards this parser produced, so the same code
 * collision can't cross-contaminate the master compendium's own Tier 1 count
 * again. Nothing here is applied automatically by `parseContentSystem` — a
 * caller building a Tier 1 seed from this document's cards checks a code
 * against this set the same way `isTier1` in parse-compendium.ts does.
 *
 * The underlying collision — two real, differently-scoped cards both named
 * H-701 — is a numbering problem, not a parsing one. Worth raising with
 * Danielle rather than continuing to route around it here.
 */
export const CONTENT_SYSTEM_TIER1_INCLUDED: Record<string, string> = {
  "H-701": "Aditya, 2 Sep 2026 — Baby Radar is Tier 1, overriding the standing Tier 2 " +
    "classification of Module 7/Radar in general. Scoped to this card alone: full Radar " +
    "(weekly-brief pipeline, real feed integration) stays Tier 2.",
};

export type ContentSystemParseResult = {
  cards: ContentSystemCard[];
  gates: ContentSystemGate[];
  meta: {
    status: string | null;
    cardNumbering: string | null;
    covers: string | null;
    for: string | null;
  };
  /** Every `○ CODE` reference found anywhere in the document — the "governing
   *  gates" list up top, Spec 3's pre-publish checklist, etc. These name gates
   *  this document assumes already exist elsewhere in the compendium; nothing
   *  here creates them. Useful for a cross-check against the real corpus:
   *  every one of these should resolve to an existing card. */
  referencedGates: string[];
  /** Cards or gates found here whose code `moduleFromCode` still returns
   *  "unknown" for — i.e., the compendium's own module-classification logic
   *  doesn't recognize them even after the IG-M6 / IG-IMG prefix fix. Should
   *  be empty; a non-empty result means the parser and the classifier have
   *  drifted apart, worth investigating rather than ignoring. */
  unrecognizedByCompendium: string[];
  /** Anything the parser noticed but couldn't resolve on its own — a card
   *  missing an expected field, a table row with an unrecognized component
   *  label, etc. Mirrors parse-compendium.ts's own policy: report, don't guess. */
  warnings: string[];
};

/* ── Line-level grammar ─────────────────────────────────────────────────────
 *
 * A card or gate heading is a line that is either bare (`H-620 Comment Trigger`)
 * or markdown-prefixed (`### H-701 — Baby Radar Topic Suggestion`) — the document
 * uses both inconsistently, so both are accepted. What actually confirms it's a
 * heading, not a stray mention of a code in prose, is the line immediately
 * following: a real heading is always followed (after any blank lines) by either
 * `name:` (a card) or `gate_type:` (a gate). Anything else is not a boundary and
 * is left for whichever field or table-row rule matches it instead.
 */
const CODE_LINE_RE =
  /^(?:#{1,3}\s+)?((?:H|IG)-(?:[A-Z0-9]+-)?\d+(?:\.\d+)?)\b\s*(?:—|-)?\s*(.*)$/;

function skipBlank(lines: string[], i: number): number {
  let j = i;
  while (j < lines.length && lines[j].trim() === "") j++;
  return j;
}

function looksLikeHeadingAt(lines: string[], i: number): boolean {
  const la = skipBlank(lines, i);
  if (la >= lines.length) return false;
  const t = lines[la].trim();
  return /^name:/.test(t) || /^gate_type:/.test(t);
}

function parseSectionedCard(
  lines: string[],
  startIdx: number,
  headingLine: number,
  warnings: string[],
): { card: ContentSystemCard; endIndex: number } {
  let i = startIdx + 1;
  let code: string | null = null;
  let name = "";
  let description = "";
  let populationTags: string[] = [];
  const components: Partial<Record<ComponentKey, string>> = {};
  let moduleMapping: string | null = null;
  let notes: string | null = null;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === "---") {
      i++;
      break;
    }
    if (CODE_LINE_RE.test(raw) && looksLikeHeadingAt(lines, i + 1)) break;
    // A `##`/`###` section header that is not itself a card/gate code also
    // closes the block (e.g. "## CADENCE FRAMEWORK" between two card groups).
    if (/^#{1,3}\s+\S/.test(raw) && !CODE_LINE_RE.test(raw)) break;

    const nameM = /^name:\s*(.*)$/.exec(trimmed);
    if (nameM) {
      // The name line carries the authoritative code, e.g. "H-620 Comment trigger".
      const codeM = /^((?:H|IG)-(?:[A-Z0-9]+-)?\d+(?:\.\d+)?)\s*(.*)$/.exec(nameM[1]);
      if (codeM) {
        code = codeM[1];
        name = unescapeMd(nameM[1].trim());
      } else {
        name = unescapeMd(nameM[1].trim());
      }
      i++;
      continue;
    }

    const descM = /^description:\s*(.*)$/.exec(trimmed);
    if (descM) {
      description = unescapeMd(descM[1].trim());
      i++;
      continue;
    }

    const tagsM = /^populationTags:\s*\[([^\]]*)\]/.exec(trimmed);
    if (tagsM) {
      populationTags = tagsM[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      i++;
      continue;
    }

    if (/^\|\s*Component\s*\|\s*Content\s*\|\s*$/i.test(trimmed)) {
      i++; // header row
      if (i < lines.length && /^\|\s*-+\s*\|\s*-+\s*\|\s*$/.test(lines[i].trim())) i++; // separator
      while (i < lines.length) {
        const rowM = /^\|\s*(\d+)\.\s*([a-z_]+)\s*\|(.*)\|\s*$/.exec(lines[i]);
        if (!rowM) break;
        const key = rowM[2];
        if ((COMPONENT_KEYS as readonly string[]).includes(key)) {
          components[key as ComponentKey] = unescapeMd(rowM[3].trim());
        } else {
          warnings.push(
            `line ${i + 1}: table row "${rowM[2]}" is not a recognized component key`,
          );
        }
        i++;
      }
      continue;
    }

    const mmM = /^module_mapping:\s*(.*)$/.exec(trimmed);
    if (mmM) {
      moduleMapping = unescapeMd(mmM[1].trim());
      i++;
      continue;
    }

    const notesM = /^notes:\s*(.*)$/.exec(trimmed);
    if (notesM) {
      notes = unescapeMd(notesM[1].trim());
      i++;
      continue;
    }

    i++; // blank line, section banner, etc. — not part of any field
  }

  if (!code) {
    // Fall back to the code on the heading line itself (covers H-701, whose
    // "### H-701 — Baby Radar Topic Suggestion" heading carries the code even
    // though its `name:` line — "name: H-701 Baby Radar topic suggestion" —
    // would also have matched; this branch only fires if that somehow failed).
    const headingM = CODE_LINE_RE.exec(lines[startIdx]);
    code = headingM ? headingM[1] : `UNKNOWN-line-${headingLine}`;
    if (!headingM) warnings.push(`line ${headingLine}: could not determine card code`);
  }

  for (const key of COMPONENT_KEYS) {
    if (!(key in components)) {
      warnings.push(`${code}: missing component "${key}"`);
    }
  }

  return {
    card: {
      cardCode: code,
      name,
      description,
      populationTags,
      components,
      moduleMapping,
      notes,
      line: headingLine,
    },
    endIndex: i,
  };
}

function parseGateCard(
  lines: string[],
  startIdx: number,
  headingLine: number,
  warnings: string[],
): { gate: ContentSystemGate; endIndex: number } {
  const headingM = CODE_LINE_RE.exec(lines[startIdx]);
  const code = headingM ? headingM[1] : `UNKNOWN-line-${headingLine}`;
  const titleFromHeading = headingM ? headingM[2].trim() : "";
  if (!headingM) warnings.push(`line ${headingLine}: could not determine gate code`);

  let i = startIdx + 1;
  let gateType = "";
  const ruleLines: string[] = [];
  let inRule = false;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === "---") {
      i++;
      break;
    }
    if (CODE_LINE_RE.test(raw) && looksLikeHeadingAt(lines, i + 1)) break;
    if (/^#{1,3}\s+\S/.test(raw) && !CODE_LINE_RE.test(raw)) break;

    const gtM = /^gate_type:\s*(.*)$/.exec(trimmed);
    if (gtM) {
      gateType = unescapeMd(gtM[1].trim());
      inRule = false;
      i++;
      continue;
    }

    const ruleM = /^Rule:\s*(.*)$/.exec(trimmed);
    if (ruleM) {
      ruleLines.push(ruleM[1].trim());
      inRule = true;
      i++;
      continue;
    }

    if (inRule) {
      // Blank lines inside the rule (IG-IMG-01's "Implementation:" paragraph
      // follows one) are kept as paragraph breaks rather than treated as the
      // end of the rule — only another heading or `---` ends it.
      ruleLines.push(trimmed);
      i++;
      continue;
    }

    i++;
  }

  if (!gateType) warnings.push(`${code}: missing gate_type`);
  if (ruleLines.length === 0) warnings.push(`${code}: missing Rule`);

  return {
    gate: {
      cardCode: code,
      name: unescapeMd(titleFromHeading),
      gateType,
      rule: unescapeMd(ruleLines.join("\n").replace(/\n{3,}/g, "\n\n").trim()),
      line: headingLine,
    },
    endIndex: i,
  };
}

function matchMeta(lines: string[], re: RegExp): string | null {
  for (const line of lines) {
    const m = re.exec(line.trim());
    if (m) return m[1].trim();
  }
  return null;
}

export function parseContentSystem(text: string): ContentSystemParseResult {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cards: ContentSystemCard[] = [];
  const gates: ContentSystemGate[] = [];
  const warnings: string[] = [];
  const referencedGatesSet = new Set<string>();

  const meta = {
    status: matchMeta(lines, /^##\s*Status:\s*(.*)$/i),
    cardNumbering: matchMeta(lines, /^##\s*Card numbering:\s*(.*)$/i),
    covers: matchMeta(lines, /^##\s*Covers:\s*(.*)$/i),
    for: matchMeta(lines, /^##\s*For:\s*(.*)$/i),
  };

  // Deliberately looser than CODE_LINE_RE: this only has to match a code that
  // follows a bullet marker, which the compendium's classic no-hyphen prefixes
  // (IG-U006, IG-V07, IG-RC13 — letters directly against the digits, no
  // trailing hyphen) need too, not just this document's own H-/IG-M6-/IG-IMG-
  // headings.
  const GATE_MENTION_RE = /^[○o]\s*((?:H|IG)-[A-Z]*\d+(?:-\d+)?(?:\.\d+)?)\b/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const mentionM = GATE_MENTION_RE.exec(line.trim());
    if (mentionM) referencedGatesSet.add(mentionM[1]);

    const codeMatch = CODE_LINE_RE.exec(line);
    if (!codeMatch) {
      i++;
      continue;
    }
    const lineNo = i + 1;

    if (looksLikeHeadingAt(lines, i + 1)) {
      const la = skipBlank(lines, i + 1);
      const isGate = /^gate_type:/.test(lines[la].trim());
      if (isGate) {
        const { gate, endIndex } = parseGateCard(lines, i, lineNo, warnings);
        gates.push(gate);
        i = endIndex;
      } else {
        const { card, endIndex } = parseSectionedCard(lines, i, lineNo, warnings);
        cards.push(card);
        i = endIndex;
      }
      continue;
    }

    i++;
  }

  const allCodes = [...cards.map((c) => c.cardCode), ...gates.map((g) => g.cardCode)];
  const unrecognizedByCompendium = allCodes.filter((code) => moduleFromCode(code) === "unknown");

  return {
    cards,
    gates,
    meta,
    referencedGates: [...referencedGatesSet].sort(),
    unrecognizedByCompendium,
    warnings,
  };
}

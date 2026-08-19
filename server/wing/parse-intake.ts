/**
 * Parses the Intake Module card document into the same records as the compendium.
 *
 * ── WHY A SECOND PARSER ──────────────────────────────────────────────────
 * `parse-compendium.ts` finds a card by its markdown heading — `## H-102 Role
 * sprawl detection`. This document has no card headings. Its cards open with a
 * bare line (`H-010 Wing self-introduction`), its integrity gates carry an
 * `IG-INT` prefix the compendium's code pattern rejects, its component tables
 * are unbolded, and one card is numbered `H-019.5` so that inserting it did not
 * renumber the fifteen reveal templates below it.
 *
 * Four differences, and any one of them reads to the compendium parser as "no
 * cards here": it finds zero of the 42. Bending one parser around two formats
 * would leave every future compendium change one heading-shape away from
 * silently dropping the intake module, so this is a second parser producing the
 * same `ParsedCard` records. Everything below the surface syntax is shared — the
 * seven component keys, the kind rules, `unescapeMd`, the module derivation, the
 * body hash — because two parsers that disagreed about what a card IS would be
 * worse than one parser that guessed.
 *
 * ── HOW A CARD IS RECOGNISED WITHOUT A HEADING ───────────────────────────
 * A bare code line is a weak anchor: a sentence beginning "H-019.5 fires before
 * any RT card" would match it. So a code line only opens a block when the NEXT
 * line declares what kind of thing it is — `name:` for a card, `gate_type:` for
 * a gate. Both hold for all 42 and for nothing else in the document, which is
 * why 42 is a count here and not an estimate.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
 * The compendium parser's three rules hold: no database, no repair of the
 * document, no inference of Tier 1 membership. One rule is added — it reports
 * population tags no student can resolve to, instead of passing them through.
 * This document tags every card with `entrepreneur_early`,
 * `entrepreneur_fundraising` and `entrepreneur_scaling`, and the platform
 * resolves none of them; a card tagged only with those reaches nobody, and
 * `cardAppliesTo` has no way to tell an empty intersection from a typo.
 */

import {
  COMPONENT_KEYS,
  cardKindOf,
  hash,
  moduleFromCode,
  unescapeMd,
  type ComponentKey,
  type ParsedCard,
} from "./parse-compendium";
import { METHODOLOGY_POPULATIONS } from "./population-tags";

/** The document this parser reads. Committed exactly as delivered. */
export const INTAKE_SOURCE = "methodology/wing-intake-heuristic-cards-v1.1.md";

/**
 * An intake integrity gate — IG-INT01 to IG-INT13.
 *
 * Not a `ParsedCard`, because it genuinely is not one: the compendium's gates
 * carry the same seven components as its cards, and these carry two lines, a
 * `gate_type` and a `Rule`. Forcing them into `components` would mean inventing
 * six empty fields and then explaining, at seed time, why every intake gate is
 * "incomplete". The Rule IS the gate.
 */
export type ParsedIntakeGate = {
  cardCode: string;
  /** The gate's own title, without the code. */
  name: string;
  gateType: string;
  rule: string;
  /**
   * The universal gate this one restates, from a title like
   * "IG-INT10 Barnum falsifiability (IG-U006 applied)".
   *
   * Four of the thirteen are intake-specific wordings of a platform-wide gate.
   * Recorded because compiling both into one prompt would state the same rule
   * twice — the second time in different words, which is how a model learns that
   * the rule is negotiable.
   */
  restates: string | null;
  line: number;
};

export type IntakeParseResult = {
  /** One record per card, in document order. */
  cards: ParsedCard[];
  gates: ParsedIntakeGate[];
  /** Cards missing one or more of the seven components. */
  incomplete: Array<{ cardCode: string; missing: ComponentKey[] }>;
  /** Cards the document gives no sequence weight for. */
  missingWeight: string[];
  /** Same ID twice. `H-019` and `H-019.5` are different IDs and do not collide. */
  collisions: Array<{ cardCode: string; line: number; firstSeenLine: number }>;
  /** Every distinct `intervention_type` token found, with counts. */
  interventionTypes: Record<string, number>;
  /** Every distinct population tag found, with counts. */
  populationTags: Record<string, number>;
  /**
   * Tags outside `METHODOLOGY_POPULATIONS`, so no student can carry them.
   *
   * Reported, not translated. Which platform population an
   * `entrepreneur_fundraising` is belongs to `population-tags.ts`, where the
   * mapping lives with its reasoning; a parser that quietly rewrote the tag
   * would hide a methodology change inside a parse.
   */
  unresolvableTags: string[];
  /** Cards whose module does not derive to `intake`. Should always be empty. */
  misfiled: Array<{ cardCode: string; module: string }>;
};

const CODE_LINE = /^((?:H|IG)-(?:INT)?\d+(?:\.\d+)?)\s+(.*\S)\s*$/;
const SECTION = /^#{1,3}\s+(.*)$/;
const COMPONENT_ROW = /^\|\s*\*{0,2}\s*(\d)\s*\.\s*([a-z_]+)\s*\*{0,2}\s*\|\s*(.*?)\s*\|\s*$/;
const FIELD_LINE = /^(name|description|module_mapping|notes|gate_type|Rule):\s*(.*)$/;
const TAGS_LINE = /^populationTags:\s*\[([^\]]*)\]/;

/** Whether the line after a code line declares a card or a gate. */
function opensBlock(next: string): "card" | "gate" | null {
  if (/^name:/.test(next)) return "card";
  if (/^gate_type:/.test(next)) return "gate";
  return null;
}

export function parseIntake(text: string): IntakeParseResult {
  const lines = text.split("\n");

  const cards: ParsedCard[] = [];
  const gates: ParsedIntakeGate[] = [];
  const incomplete: IntakeParseResult["incomplete"] = [];
  const missingWeight: string[] = [];
  const collisions: IntakeParseResult["collisions"] = [];
  const interventionTypes: Record<string, number> = {};
  const populationTags: Record<string, number> = {};
  const misfiled: IntakeParseResult["misfiled"] = [];

  const known = new Set<string>(METHODOLOGY_POPULATIONS as readonly string[]);
  const unresolvable = new Set<string>();
  const seen = new Map<string, number>();

  let heading = "";

  for (let i = 0; i < lines.length; i++) {
    const raw = unescapeMd(lines[i]);

    const section = SECTION.exec(raw);
    if (section) {
      heading = section[1].trim();
      continue;
    }

    const code = CODE_LINE.exec(raw);
    if (!code) continue;
    const kind = opensBlock(unescapeMd(lines[i + 1] ?? ""));
    if (!kind) continue;

    const cardCode = code[1];
    const title = code[2].replace(/^[\s—–-]+/, "").trim();
    const line = i + 1;

    const prior = seen.get(cardCode);
    if (prior !== undefined) collisions.push({ cardCode, line, firstSeenLine: prior });
    else seen.set(cardCode, line);

    /* The block runs to the next block, the next section, or the rule between them. */
    let end = i + 1;
    while (end < lines.length) {
      const l = unescapeMd(lines[end]);
      if (SECTION.test(l) || /^---\s*$/.test(l)) break;
      const c = CODE_LINE.exec(l);
      if (c && opensBlock(unescapeMd(lines[end + 1] ?? ""))) break;
      end++;
    }
    const body = lines.slice(i + 1, end).map(unescapeMd);

    const fields: Record<string, string> = {};
    const components: Partial<Record<ComponentKey, string>> = {};
    let tags: string[] = [];

    for (const l of body) {
      const row = COMPONENT_ROW.exec(l);
      if (row) {
        const key = row[2] as ComponentKey;
        if ((COMPONENT_KEYS as readonly string[]).indexOf(key) >= 0) {
          components[key] = row[3].trim();
        }
        continue;
      }
      const tagsMatch = TAGS_LINE.exec(l);
      if (tagsMatch) {
        tags = tagsMatch[1]
          .split(",")
          .map((t) => t.replace(/["'\s]/g, ""))
          .filter(Boolean);
        continue;
      }
      const field = FIELD_LINE.exec(l);
      // First occurrence wins: `notes:` appears once per card, but a Rule can
      // contain the word and a later line must not overwrite the real value.
      if (field && !(field[1] in fields)) fields[field[1]] = field[2].trim();
    }

    if (kind === "gate") {
      const restates = /\((IG-[A-Z]*\d+)\s+applied\)/.exec(title);
      gates.push({
        cardCode,
        name: title,
        gateType: fields.gate_type ?? "",
        rule: fields.Rule ?? "",
        restates: restates ? restates[1] : null,
        line,
      });
      continue;
    }

    for (const t of tags) {
      populationTags[t] = (populationTags[t] ?? 0) + 1;
      if (!known.has(t)) unresolvable.add(t);
    }

    const weightMatch = /Sequence weight:\s*([0-9]+(?:\.[0-9]+)?)/.exec(body.join("\n"));
    const weight = weightMatch ? Number(weightMatch[1]) : null;
    if (weight === null) missingWeight.push(cardCode);

    const interventionType = components.intervention_type
      ? (/^\s*\*{0,2}([A-Z][A-Z_]+)/.exec(components.intervention_type)?.[1] ?? null)
      : null;
    if (interventionType) {
      interventionTypes[interventionType] = (interventionTypes[interventionType] ?? 0) + 1;
    }

    const missing = COMPONENT_KEYS.filter((k) => !components[k]);
    if (missing.length) incomplete.push({ cardCode, missing: missing.slice() });

    const module = moduleFromCode(cardCode);
    if (module !== "intake") misfiled.push({ cardCode, module });

    cards.push({
      cardCode,
      name: fields.name ?? title,
      description: fields.description ?? "",
      populationTags: tags,
      components,
      moduleMapping: fields.module_mapping ?? null,
      notes: fields.notes ?? null,
      weight,
      module,
      heading,
      line,
      bodyHash: hash(COMPONENT_KEYS.map((k) => components[k] ?? "").join(" ")),
      interventionType,
      cardKind: cardKindOf(cardCode, interventionType, heading),
    });
  }

  for (const g of gates) {
    const module = moduleFromCode(g.cardCode);
    if (module !== "intake") misfiled.push({ cardCode: g.cardCode, module });
  }

  return {
    cards,
    gates,
    incomplete,
    missingWeight,
    collisions,
    interventionTypes,
    populationTags,
    unresolvableTags: Array.from(unresolvable).sort(),
    misfiled,
  };
}

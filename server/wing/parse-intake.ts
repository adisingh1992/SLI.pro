/**
 * Parses the Intake Module card document into the same records as the compendium.
 *
 * ── VERSION ──────────────────────────────────────────────────────────────
 * v1.7 (19 August) supersedes v1.1 (18 August), and needed no change here: same
 * bare code lines, same seven-component tables, same IG-INT prefix, H-019.5 still
 * decimal. What changed is content — RT-14 retired, RT-09's placeholder defect
 * fixed, RT-06's cultural-competence check added, and copy corrections across 17
 * of the 28 card bodies. See wing-intake-change-note-v1.7.md.
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

/**
 * The document this parser reads. Committed exactly as delivered.
 *
 * ── WHY v1.8 IS A SAFE MOVE, MEASURED RATHER THAN ASSUMED ────────────────
 * v1.8 is v1.7 plus two component changes, and that was checked by parsing both and
 * comparing all seven components of all 28 cards and all 13 gate rules:
 *
 *   H-014   `failure_path`      — the "often means" frequency claim removed per IG-RC13,
 *                                 replaced with an instruction not to explain the phrase.
 *   H-019.5 `detection_method`  — 15 reveal templates to 14, and the range corrected to
 *                                 "RT-01 through RT-13, RT-15" after RT-14's retirement.
 *
 * Nothing else in the seven components of any card, and no gate rule, differs. Same 28
 * codes, same 13 gates, no collisions, nothing incomplete, nothing misfiled, every
 * population tag still resolvable. **This parser needed no change for v1.8.**
 *
 * Three more edits are in the document and are deliberately invisible to a body hash,
 * because they are not components: H-019.5's `description` and a prose line both move 15
 * to 14, and the summary table's reveal-template count is corrected from 13 to 14 (the
 * range H-020–H-032 plus H-034 is fourteen cards, so v1.7's 13 was wrong). Her footer
 * claims three template-count fixes; there are four, and the fourth is in the right
 * direction.
 *
 * ── WHAT v1.8 DOES NOT FIX ───────────────────────────────────────────────
 * H-019.5's `delivery_adaptation` still offers "RT-14 Clean Slate = undergraduate only"
 * as a live track-specific template, in the same card whose description and detection
 * method were both corrected for RT-14's retirement. A missed spot in a pass over that
 * exact card, raised with her on 26 August rather than guessed at here.
 */
export const INTAKE_SOURCE = "methodology/wing-intake-heuristic-cards-v1.8.md";

/**
 * Every version this one supersedes, newest first.
 *
 * "Build from v1.7, discard the v1.1 I sent on the 18th" — Danielle, 19 August. Discarded
 * as sources: nothing parses either of these into a card any more.
 *
 * They stay in the repo because `update-intake.ts` needs them, and it needs **all** of
 * them rather than one. The safe way to replace a seeded card is to check first that the
 * row still says what some released version said; a row matching none of them has been
 * edited by hand in the admin editor, and overwriting that would destroy the methodology
 * owner's own work — silently, because a seed prints what it wrote and not what it
 * replaced.
 *
 * A single prior version was enough while there was one. It stopped being enough at v1.8,
 * and not as a tidiness point: the provenance block cites the document it came from, so a
 * row seeded from v1.7 and compared only against v1.1 differs in its notes for a reason
 * that has nothing to do with anyone editing it. Every one of the 41 would have been
 * reported as hand-edited and skipped — a run that refuses safely, looks like a disaster,
 * and blocks the release for a day while someone works out why.
 *
 * Which version the rows were actually seeded from is not knowable from here, so the
 * script reports the version each row matched instead of assuming one.
 *
 * Drop an entry the release after the update has run everywhere.
 */
export const PRIOR_INTAKE_SOURCES: readonly string[] = [
  "methodology/wing-intake-heuristic-cards-v1.7.md",
  "methodology/wing-intake-heuristic-cards-v1.1.md",
];

/**
 * The immediate predecessor.
 *
 * Kept as its own export because callers outside the update script use it to mean "the
 * one before this", and repointing it silently would change what they check.
 */
export const PRIOR_INTAKE_SOURCE = PRIOR_INTAKE_SOURCES[0];

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

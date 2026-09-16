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

/**
 * Parses the Reveal Cycle v4 canonical document into card records.
 *
 * ── WHY THIS IS A THIRD GRAMMAR AND NOT A THIRD COPY ─────────────────────
 * The compendium writes a card as a heading plus a metadata line plus a table.
 * Intake and Module 13 write one as a code line plus `name:` / `description:` /
 * `populationTags:` plus the same table. The Reveal Cycle writes one as an H3
 * heading and the table, with no metadata line at all. Three documents, three
 * preambles, one component table — so the component table's grammar is imported
 * from parse-compendium and only the preamble is written again here.
 *
 * ── WHAT THIS DOCUMENT DOES NOT SAY, AND WHY THAT IS REPORTED ────────────
 * Two fields every other card carries are simply absent from all 26 records:
 *
 *   description    The heading is the only prose title. It is used as the
 *                  description and `descriptionFromHeading` is set, so nothing
 *                  downstream can mistake a title for a written description.
 *   populationTags Empty for every card. The tracks appear inside
 *                  delivery_adaptation as prose — "**career_returner:** extend
 *                  the deferral cap" — and harvesting tags out of a sentence is
 *                  exactly the kind of inference a parser must not make. A card
 *                  with no tags is a card that applies to everyone, and if that
 *                  is wrong it is Danielle's correction to make, not ours.
 *
 * ── IG-RC12 HAS NO TABLE, AND THAT IS THE DOCUMENT BEING HONEST ──────────
 * v4 carries IG-RC12 as a paragraph flagging an open question — whether it
 * survives as its own gate or folds into IG-S03. Doc 1 records the answer:
 * retired, number retained. So it parses as a code with no components, lands in
 * `specified`, and never pretends to be a seven-component gate. Inventing the
 * six missing components for a gate whose own document says it may not exist is
 * how a retired rule gets shipped.
 *
 * IG-RC13 is not in this document at all. It is defined in Wing_Platform_Updates
 * (Aug 19) and Doc 2's Appendix A settles that as canonical, so it is parsed
 * there. A reader counting IG-RC01–13 here and finding twelve is seeing the
 * document, not a parser fault.
 *
 * ── WHY META CARDS COME OUT AS GATES ─────────────────────────────────────
 * H-RC01, H-RC02, H-RC03 and H-RC09 declare META, so `cardKindOf` files them as
 * integrity gates — the same resolution the compendium's H-007, H-703 and H-709
 * already got. Doc 1's "13 cards + 12 gates" counts by numbering band; card_kind
 * counts by whether a student's turn can make it fire. Both are right about
 * different questions, and only the second one governs the detector.
 */

export const REVEAL_CYCLE_SOURCE = "methodology/wing-reveal-cycle-v4-canonical.md";
export const REVEAL_CYCLE_MODULE = "reveal_cycle";

export type RevealCycleCard = ParsedCard & {
  /** Always true here: the document states no description, only a title. */
  descriptionFromHeading: boolean;
};

export type RevealCycleParseResult = {
  cards: RevealCycleCard[];
  /** Cards missing one or more of the seven components. */
  incomplete: Array<{ cardCode: string; missing: ComponentKey[] }>;
  /** Codes the document names but gives no component table at all. */
  specified: string[];
  /** Same code twice. */
  collisions: Array<{ cardCode: string; line: number; firstSeenLine: number }>;
  /** Every distinct `intervention_type` token found, with counts. */
  interventionTypes: Record<string, number>;
  /** Codes whose module does not derive to `reveal_cycle`. Should be empty. */
  misfiled: Array<{ cardCode: string; module: string }>;
  /** §14's own count table, for the cross-check. Null where it is absent. */
  statedCounts: { cards: number | null; gates: number | null; total: number | null };
};

const CARD_HEADING = /^#{3}\s+((?:H|IG)-RC\d+)\s*[—–-]\s*(.+?)\s*$/;
const SECTION = /^#{1,2}\s+(.*)$/;
const COMPONENT_ROW = /^\|\s*\*{0,2}\s*(\d)\s*\.\s*([a-z_]+)\s*\*{0,2}\s*\|\s*(.*?)\s*\|\s*$/;
/** `IG-RC01 — Safety Pre-Pass Precedence · weight 3.0` */
const WEIGHT_SUFFIX = /\s*[·•]\s*weight\s+([\d.]+)\s*$/i;
/** `| Heuristic cards (H-RC01 – H-RC13) | 13 |` */
const COUNT_ROW = /^\|\s*\*{0,2}([^|]+?)\*{0,2}\s*\|\s*\*{0,2}(\d+)\*{0,2}\s*\|\s*$/;

export function parseRevealCycle(text: string): RevealCycleParseResult {
  const lines = text.split("\n");

  const cards: RevealCycleCard[] = [];
  const incomplete: RevealCycleParseResult["incomplete"] = [];
  const specified: string[] = [];
  const collisions: RevealCycleParseResult["collisions"] = [];
  const interventionTypes: Record<string, number> = {};
  const misfiled: RevealCycleParseResult["misfiled"] = [];
  const seen = new Map<string, number>();

  let heading = "";
  let statedCards: number | null = null;
  let statedGates: number | null = null;
  let statedTotal: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = unescapeMd(lines[i]);

    const section = SECTION.exec(raw);
    if (section) {
      heading = section[1].trim();
      continue;
    }

    // §14's count table. Read rather than assumed, so a revision that changes
    // the count is a visible disagreement instead of a silent one.
    if (/card count/i.test(heading)) {
      const row = COUNT_ROW.exec(raw.trim());
      if (row) {
        const label = row[1].toLowerCase();
        const n = Number(row[2]);
        if (/heuristic cards/.test(label)) statedCards = n;
        else if (/integrity gates/.test(label)) statedGates = n;
        else if (/total/.test(label)) statedTotal = n;
      }
      continue;
    }

    const head = CARD_HEADING.exec(raw);
    if (!head) continue;

    const cardCode = head[1];
    const line = i + 1;

    const firstSeen = seen.get(cardCode);
    if (firstSeen !== undefined) {
      collisions.push({ cardCode, line, firstSeenLine: firstSeen });
      continue;
    }
    seen.set(cardCode, line);

    // Title and weight share the heading. `· weight 2.0` is the document's only
    // statement of precedence for these cards; the rest have none.
    let name = head[2].trim();
    let weight: number | null = null;
    const w = WEIGHT_SUFFIX.exec(name);
    if (w) {
      weight = Number(w[1]);
      name = name.replace(WEIGHT_SUFFIX, "").trim();
    }

    // Read forward to the next H2/H3 or the next card, collecting the table.
    const components: Partial<Record<ComponentKey, string>> = {};
    for (let j = i + 1; j < lines.length; j++) {
      const body = unescapeMd(lines[j]);
      if (CARD_HEADING.test(body) || SECTION.test(body)) break;

      const row = COMPONENT_ROW.exec(body);
      if (!row) continue;
      const key = row[2] as ComponentKey;
      if (!(COMPONENT_KEYS as readonly string[]).includes(key)) continue;
      components[key] = row[3].trim();
    }

    if (Object.keys(components).length === 0) {
      specified.push(cardCode);
      continue;
    }

    const missing = COMPONENT_KEYS.filter((k) => !components[k]);
    if (missing.length) incomplete.push({ cardCode, missing: missing.slice() });

    // First token only: "META (system rule, no user-facing output)" is META,
    // and "SAFETY OVERRIDE" is two words that mean one thing — so the split is
    // on the parenthesis, not on whitespace.
    const rawType = components.intervention_type ?? null;
    const interventionType = rawType ? rawType.split("(")[0].trim() : null;
    if (interventionType) {
      interventionTypes[interventionType] = (interventionTypes[interventionType] ?? 0) + 1;
    }

    const module = moduleFromCode(cardCode);
    if (module !== REVEAL_CYCLE_MODULE) misfiled.push({ cardCode, module });

    const kind: CardKind = cardKindOf(cardCode, interventionType, heading);

    cards.push({
      cardCode,
      name: `${cardCode} ${name}`,
      description: name,
      descriptionFromHeading: true,
      populationTags: [],
      components,
      moduleMapping: "Reveal Cycle — system event",
      notes: null,
      weight,
      module,
      heading,
      line,
      bodyHash: hash(COMPONENT_KEYS.map((k) => components[k] ?? "").join(" ")),
      interventionType,
      cardKind: kind,
    });
  }

  return {
    cards,
    incomplete,
    specified,
    collisions,
    interventionTypes,
    misfiled,
    statedCounts: { cards: statedCards, gates: statedGates, total: statedTotal },
  };
}

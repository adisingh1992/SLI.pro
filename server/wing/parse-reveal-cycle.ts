import { unescapeMd } from "./parse-compendium";
import {
  parseComponentCards,
  type ComponentCard,
  type ComponentCardsResult,
} from "./parse-component-cards";

/**
 * Parses the Reveal Cycle v4 canonical document into card records.
 *
 * ── WHAT IS HERE AND WHAT IS NOT ─────────────────────────────────────────
 * The grammar — an H3 heading and the seven-row component table — is shared
 * with the UX Recommendation's Part 8 and lives in parse-component-cards.ts.
 * What is specific to this document stays here: its own namespace, its own
 * module, and §14's count table, which is read rather than assumed so that a
 * revision changing the count is a visible disagreement instead of a silent
 * one.
 *
 * ── IG-RC12 HAS NO TABLE, AND THAT IS THE DOCUMENT BEING HONEST ──────────
 * v4 carries IG-RC12 as a paragraph flagging an open question — whether it
 * survives as its own gate or folds into IG-S03. Doc 1 records the answer:
 * retired, number retained. IG-RC11 is the same shape for a different reason:
 * a standing rule that never fires at runtime. Both come back in `specified`.
 *
 * IG-RC13 is not in this document at all. It is defined in Wing_Platform_Updates
 * (19 August) and Doc 2's Appendix A settles that as canonical, so it is parsed
 * there. A reader counting IG-RC01–13 here and finding twelve is seeing the
 * document, not a parser fault.
 *
 * ── WHY META CARDS COME OUT AS GATES ─────────────────────────────────────
 * H-RC01, H-RC02 and H-RC03 declare META, so `cardKindOf` files them as
 * integrity gates — the same resolution the compendium's H-007, H-703 and H-709
 * already got. Doc 1's "13 cards + 12 gates" counts by numbering band;
 * card_kind counts by whether a student's turn can make it fire. Both are right
 * about different questions, and only the second governs the detector.
 */

export const REVEAL_CYCLE_SOURCE = "methodology/wing-reveal-cycle-v4-canonical.md";
export const REVEAL_CYCLE_MODULE = "reveal_cycle";

export type RevealCycleCard = ComponentCard;

export type RevealCycleParseResult = ComponentCardsResult & {
  /** §14's own count table, for the cross-check. Null where it is absent. */
  statedCounts: { cards: number | null; gates: number | null; total: number | null };
};

const SECTION = /^#{1,2}\s+(.*)$/;
/** `| Heuristic cards (H-RC01 – H-RC13) | 13 |` */
const COUNT_ROW = /^\|\s*\*{0,2}([^|]+?)\*{0,2}\s*\|\s*\*{0,2}(\d+)\*{0,2}\s*\|\s*$/;

export function parseRevealCycle(text: string): RevealCycleParseResult {
  const result = parseComponentCards(text, {
    codePattern: "(?:H|IG)-RC\\d+",
    cardHeadingLevel: 3,
    expectedModule: REVEAL_CYCLE_MODULE,
    moduleMapping: "Reveal Cycle — system event",
  });

  /* ── §14's count table ─────────────────────────────────────────────────── */

  const lines = text.split("\n");
  let heading = "";
  let cards: number | null = null;
  let gates: number | null = null;
  let total: number | null = null;

  for (const raw of lines) {
    const line = unescapeMd(raw);
    const section = SECTION.exec(line);
    if (section) {
      heading = section[1].trim();
      continue;
    }
    if (!/card count/i.test(heading)) continue;

    const row = COUNT_ROW.exec(line.trim());
    if (!row) continue;
    const label = row[1].toLowerCase();
    const n = Number(row[2]);
    if (/heuristic cards/.test(label)) cards = n;
    else if (/integrity gates/.test(label)) gates = n;
    else if (/total/.test(label)) total = n;
  }

  return { ...result, statedCounts: { cards, gates, total } };
}

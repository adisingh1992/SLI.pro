import { readFileSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { heuristicComponents, heuristics } from "@shared/wing-schema";
import {
  COMPONENT_KEYS,
  isTier1,
  parseCompendium,
  type ParsedCard,
} from "./parse-compendium";

/**
 * Seeds the Tier 1 cards from the Master Module Compendium v2.
 *
 * Run:  npm run wing:seed-compendium -- --dry-run   report, no writes
 *       npm run wing:seed-compendium               insert
 *
 * ── WHAT LANDS, AND WHAT DELIBERATELY DOES NOT ───────────────────────────
 * 53 of the compendium's 184 specifications: Foundation 1–3 and their gates,
 * the Foundation exercise cards, the universal warm-up, the five universal
 * gates, the six universal IG-U gates and six voice gates. Modules 4–11 are out
 * because the Feature List puts them out — every item in A5 carries its own
 * "Tier 2" or "Tier 2/3" label. See WING_TIER1_SCOPE.md §2.
 *
 * Every card lands as `candidate` and IN NO SEQUENCE, following the precedent
 * `extract-heuristics.ts` set. That matters more here than it did there: these
 * cards are meant to REPLACE the live Foundation methodology, and seeding and
 * switching over must not be the same button. Unsequenced, they are visible in
 * the admin editor for Danielle to check against the source and reachable by
 * nothing else — `getSequenceCards` can only return what a sequence contains.
 *
 * ── WHY THE SEQUENCE WEIGHT IS NOT STORED YET ────────────────────────────
 * Weight lives on `heuristic_sequence_entries`, because it is a property of a
 * card's membership of a sequence rather than of the card. These cards have no
 * membership yet, so there is nowhere to put it. It is preserved verbatim in
 * each card's notes and in `compendium-cards.json`, and it reaches the database
 * when T3 builds the Foundation sequences. Twenty-four of the 53 state no
 * weight at all; those are listed rather than quietly defaulted.
 *
 * ── WHY THERE IS NO `intervention` COMPONENT ─────────────────────────────
 * The legacy `intervention` component held prose about what to do. v2 splits
 * that in two: `intervention_type` is a classifier (now a column) and
 * `coaching_move` carries the prose. So a v2 card has no `intervention`, and
 * writing the classifier text there would put "Intervention to apply: META
 * (system rule)" into a prompt — internal methodology language in user-facing
 * output, which is the exact thing IG-U005 exists to stop.
 *
 * The consequence is bounded and worth stating: `engine.ts` builds its guidance
 * from `intervention` + `coaching_move`, so a v2 card gives it one of the two.
 * It does not break — `logApplication` already falls back from
 * `interventionComponentId` to `signalComponentId` — it degrades, and only for
 * cards in a sequence, which these are not. T3 points the engine at
 * `coaching_move`, `delivery_adaptation` and `failure_path` before any of them
 * is published.
 */

const DRY_RUN = process.argv.includes("--dry-run");
const SOURCE = "methodology/wing-master-module-compendium-v2.md";

/** v2 component → `heuristic_component_type`. Six of the seven map by name. */
const COMPONENT_COLUMN: Partial<Record<(typeof COMPONENT_KEYS)[number], string>> = {
  signal: "signal",
  detection_method: "detection_method",
  coaching_move: "coaching_move",
  delivery_adaptation: "delivery_adaptation",
  success_criteria: "success_criteria",
  failure_path: "failure_path",
  // intervention_type is the column `heuristics.intervention_type`, not a row.
};

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

/**
 * The notes row: the document's own notes, plus everything a reviewer needs to
 * check the card against the source without trusting the parser.
 *
 * The verbatim `intervention_type` cell is recorded here because the column
 * holds only the leading token, and three Tier 1 cards specify an escalation
 * the token cannot carry — H-101 and H-201 are "COACH → CHALLENGE", H-305 is
 * "AFFIRM → COACH". Storing the token alone would silently drop the second
 * phase. The engine does not model escalating interventions yet; this keeps the
 * requirement visible until it does.
 */
function notesFor(card: ParsedCard): string {
  const cell = (card.components.intervention_type ?? "").replace(/\*/g, "").trim();
  const lines: string[] = [];

  if (card.notes) lines.push(card.notes, "");

  lines.push(
    "── from the compendium ──",
    `Source: ${SOURCE}, line ${card.line}`,
    `Module: ${card.module}    Kind: ${card.cardKind}`,
    `intervention_type (verbatim): ${cell || "(none stated)"}`,
    card.weight === null
      ? "Sequence weight: NOT STATED in the source. Defaults to 1.0 when this " +
        "card enters a sequence — a weight is a decision about precedence and " +
        "1.0 is a guess, so it is flagged rather than assumed."
      : `Sequence weight: ${card.weight.toFixed(1)}`,
  );

  if (card.populationTags.length === 0) {
    lines.push("Population: untagged — applies to everyone.");
  } else {
    lines.push(`Population tags: ${card.populationTags.join(", ")}`);
  }

  lines.push(
    "",
    "Seeded from the source document by wing:seed-compendium, not transcribed " +
      "by hand. Edit freely in this editor — but a re-run of the seed will not " +
      "overwrite an existing card, so an edit here and a change in the document " +
      "will diverge. Change the document and re-seed if the source is wrong.",
  );

  return lines.join("\n");
}

async function main() {
  ({ db, pool } = await initScript());

  const parsed = parseCompendium(readFileSync(SOURCE, "utf8"));
  const cards = parsed.cards.filter(isTier1);

  if (cards.length !== 53) {
    throw new Error(
      `Expected 53 Tier 1 cards, parsed ${cards.length}. The source document has ` +
        "changed — run npm run wing:check-compendium and review before seeding.",
    );
  }

  console.log(
    `\n${DRY_RUN ? "DRY RUN — no writes" : "Seeding"}: ${cards.length} Tier 1 card(s) ` +
      `from ${SOURCE}\n`,
  );

  /* Idempotent by card_code: an existing card is never overwritten. */
  const codes = cards.map((c) => c.cardCode);
  const existing = await db
    .select({ cardCode: heuristics.cardCode })
    .from(heuristics)
    .where(inArray(heuristics.cardCode, codes));
  const taken = new Set(existing.map((r) => r.cardCode));

  if (taken.size) {
    console.log(`  ${taken.size} card(s) already present, leaving untouched:`);
    console.log(`  ${Array.from(taken).sort().join(", ")}\n`);
  }

  let inserted = 0;
  let componentRows = 0;
  const byKind: Record<string, number> = {};

  for (const card of cards) {
    if (taken.has(card.cardCode)) continue;

    byKind[card.cardKind] = (byKind[card.cardKind] ?? 0) + 1;

    if (DRY_RUN) {
      inserted++;
      componentRows +=
        Object.keys(COMPONENT_COLUMN).filter((k) => card.components[k as never]).length +
        (card.moduleMapping ? 1 : 0) +
        1; // notes, always written
      continue;
    }

    /*
     * One transaction per card. A card whose components half-inserted would be
     * worse than one that is absent: the admin editor would show it, Danielle
     * would review it, and the missing component would look like a methodology
     * omission rather than a failed write.
     */
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(heuristics)
        .values({
          // The methodology's own identifier. `card_code` exists precisely so
          // other records can bind to something that survives a rename, and
          // "H-309" is what Danielle, the compendium and every routing map call
          // this card. A generated slug would be a second name for it.
          cardCode: card.cardCode,
          name: card.name,
          /**
           * Falls back to the name for the 20 gates that have no description.
           * The compendium gives the `**name:** / **description:**` metadata
           * line to coaching cards only; a gate block opens straight into its
           * seven-component table. `description` is NOT NULL, and a gate's title
           * — "Trust Vault Protection", "Never Assign a Function" — describes it
           * accurately, so reusing it invents nothing. Counted and reported
           * below rather than done quietly.
           */
          description: card.description || card.name,
          populationTags: card.populationTags,
          status: "candidate",
          interventionType: card.interventionType as never,
          cardKind: card.cardKind as never,
        })
        .returning({ id: heuristics.id });

      const rows: Array<{ componentType: string; content: string }> = [];

      for (const key of COMPONENT_KEYS) {
        const column = COMPONENT_COLUMN[key];
        const content = card.components[key];
        if (column && content) rows.push({ componentType: column, content });
      }

      if (card.moduleMapping) {
        rows.push({ componentType: "module_mapping", content: card.moduleMapping });
      }
      rows.push({ componentType: "notes", content: notesFor(card) });

      await tx.insert(heuristicComponents).values(
        rows.map((r) => ({
          heuristicId: created.id,
          componentType: r.componentType as never,
          content: r.content,
          isCurrent: true,
        })),
      );

      componentRows += rows.length;
    });

    inserted++;
    console.log(`  + ${card.cardCode.padEnd(9)} ${card.cardKind.padEnd(15)} ${card.name.slice(0, 48)}`);
  }

  /* ── What a reviewer needs to know before publishing any of this ──────── */

  const noDescription = cards.filter((c) => !c.description);
  const noWeight = cards.filter((c) => c.weight === null);
  const escalating = cards.filter((c) => {
    const cell = (c.components.intervention_type ?? "").replace(/\*/g, "");
    return cell.includes("→");
  });

  console.log(
    `\n${DRY_RUN ? "Would insert" : "Inserted"} ${inserted} card(s) and ` +
      `${componentRows} component row(s).`,
  );
  console.log(`  by kind: ${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(", ")}`);

  console.log(
    `\n${noDescription.length} card(s) have no description in the source, so the card\n` +
      "  title was used. Every one is a gate — the compendium's metadata line is\n" +
      "  a coaching-card convention:\n" +
      `  ${noDescription.map((c) => c.cardCode).join(", ")}`,
  );

  console.log(
    `\n${noWeight.length} card(s) state no sequence weight, so T3 will default them to 1.0:\n` +
      `  ${noWeight.map((c) => c.cardCode).join(", ")}`,
  );

  console.log(
    `\n${escalating.length} card(s) specify a two-phase intervention the ` +
      "intervention_type column cannot hold:",
  );
  for (const c of escalating) {
    console.log(
      `  ${c.cardCode.padEnd(9)} ${(c.components.intervention_type ?? "").replace(/\*/g, "").trim()}`,
    );
  }
  console.log(
    "  Preserved verbatim in each card's notes. The engine does not model an\n" +
      "  escalating intervention yet — this is a T3/T4 requirement, not a defect.",
  );

  console.log(
    "\nEvery card is 'candidate' and in NO sequence, so none of this reaches a\n" +
      "student. getSequenceCards can only return cards a sequence contains.\n" +
      "Publishing is T3's Foundation sequence build, deliberately separate.\n",
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error("\n[seed-compendium] failed:", (err as Error).message);
  await pool?.end().catch(() => {});
  process.exit(1);
});

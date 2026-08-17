import { readFileSync } from "node:fs";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import {
  heuristicSequenceEntries,
  heuristicSequences,
  heuristics,
  schoolCycles,
} from "@shared/wing-schema";
import { isTier1, parseCompendium, type ParsedCard } from "./parse-compendium";

/**
 * Builds the Tier 1 heuristic sequence for each active cycle — WITHOUT publishing it.
 *
 * Run:  npm run wing:build-sequences -- --dry-run
 *       npm run wing:build-sequences
 *
 * ── WHAT "BUILT BUT NOT ACTIVE" MEANS HERE ───────────────────────────────
 * A sequence becomes live through exactly one pointer:
 * `school_cycles.active_heuristic_sequence_id`. `resolveSequenceId` reads that
 * and `students.personal_sequence_id`, and nothing else. So a sequence with
 * every entry in place, `superseded_at` NULL, and no cycle pointing at it is
 * complete, inspectable in the admin UI, and reaches no student.
 *
 * This script deliberately does not touch that pointer. `seed-methodology.ts`
 * does set it, which is the difference between seeding scaffolding and
 * publishing a methodology: 53 cards that replace what Foundation currently
 * teaches should go live by a decision, not as a side effect of a build script.
 *
 * `superseded_at` is left NULL rather than set. Superseding would mark these as
 * historical, which is the wrong word for "not yet published" — the accurate
 * state is a current, unreferenced sequence.
 *
 * ── WHY ONE SEQUENCE PER CYCLE AND NOT ONE PER SESSION ───────────────────
 * The compendium publishes three sequence maps, one per Foundation session. The
 * schema has one active sequence per cycle and no session dimension anywhere in
 * resolution — `getActiveSequenceForStudent` takes a student id, not a session.
 * Splitting into three would produce three sequences per cycle that nothing can
 * tell apart and that the single pointer cannot express.
 *
 * So the sequence holds all 53 cards and scoping a student's catalogue to their
 * CURRENT session is a read-time filter that does not exist yet. Until it does,
 * publishing this would offer H-201 (the Foundation 2 credibility test) to a
 * student sitting in Foundation 1. That is the blocker on publication, and it is
 * the reason this script stops short of it.
 */

const DRY_RUN = process.argv.includes("--dry-run");
const SOURCE = "methodology/wing-master-module-compendium-v2.md";

/**
 * Reading order within the sequence.
 *
 * Position no longer decides which card fires — weight does, as of T3 — so this
 * only has to be stable and legible to whoever reads the sequence in the admin
 * UI. Universal rules first because they bound everything after them, then the
 * voice gates, then the sessions in the order a student meets them.
 */
const MODULE_ORDER = ["universal", "voice", "foundation_1", "foundation_2", "foundation_3"];

/**
 * The session a card's entry fires in — null for every session.
 *
 * Reuses `wing.session_type` so the value cannot drift from what
 * `sessions.session_type` actually stores. `universal` and `voice` map to null:
 * those 18 cards apply wherever Wing is speaking.
 */
/**
 * Gates whose own text says they fire everywhere, whatever their card number says.
 *
 * H-308's detection_method is "Session-start trigger. Fires at every module
 * opening. This is a delivery pattern, not a content heuristic." Its code puts it
 * in the H-3xx range, so deriving scope from the number alone confined a universal
 * delivery rule to Foundation 3 — Wing would have chunked its openings in Session
 * 3 and not in Sessions 1 or 2.
 *
 * The card number is a filing convention, not a scope declaration. Where the two
 * disagree the card's own words win, and the disagreement is listed here so it is
 * visible rather than buried in a switch.
 */
const UNIVERSAL_DESPITE_CODE: Record<string, string> = {
  "H-308": 'detection_method: "Fires at every module opening"',
};

function sessionScopeFor(module: string, cardCode?: string): string | null {
  if (cardCode && cardCode in UNIVERSAL_DESPITE_CODE) return null;
  switch (module) {
    case "foundation_1": return "foundation_1";
    case "foundation_2": return "foundation_2";
    case "foundation_3": return "foundation_3";
    default: return null;
  }
}

/** `H-`, `IG-U`, `IG-V` — the code family, which groups related cards together. */
function codePrefix(cardCode: string): string {
  return cardCode.replace(/\d+$/, "");
}

/** Numeric part of a card code, for a stable within-family sort. */
function codeNumber(cardCode: string): number {
  const m = /(\d+)$/.exec(cardCode);
  return m ? Number(m[1]) : 0;
}

/**
 * Module, then code family, then number.
 *
 * Sorting on the number alone interleaved the universal block — H-003 landed
 * next to IG-U003 and IG-U03, all three sharing the number 3 — which is
 * deterministic but unreadable to anyone inspecting the sequence.
 *
 * A side effect worth keeping: within the `IG-U` family the two numbering
 * schemes still land adjacent, so `IG-U003` sits beside `IG-U03`. Those are six
 * different gates whose IDs differ only by a leading zero, and having them side
 * by side in the sequence makes that defect visible rather than buried.
 */
function sequenceOrder(a: ParsedCard, b: ParsedCard): number {
  const ma = MODULE_ORDER.indexOf(a.module);
  const mb = MODULE_ORDER.indexOf(b.module);
  if (ma !== mb) return ma - mb;

  const pa = codePrefix(a.cardCode);
  const pb = codePrefix(b.cardCode);
  if (pa !== pb) return pa.localeCompare(pb);

  return codeNumber(a.cardCode) - codeNumber(b.cardCode) ||
    a.cardCode.localeCompare(b.cardCode);
}

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  ({ db, pool } = await initScript());

  const parsed = parseCompendium(readFileSync(SOURCE, "utf8"));
  const cards = parsed.cards.filter(isTier1).slice().sort(sequenceOrder);

  if (cards.length !== 53) {
    throw new Error(`Expected 53 Tier 1 cards, parsed ${cards.length}. Re-run wing:check-compendium.`);
  }

  /* Map card codes to the rows the seed created. */
  const seeded = await db
    .select({ id: heuristics.id, cardCode: heuristics.cardCode })
    .from(heuristics);
  const idByCode = new Map(seeded.map((r) => [r.cardCode, r.id]));

  const missing = cards.filter((c) => !idByCode.has(c.cardCode));
  if (missing.length) {
    throw new Error(
      `${missing.length} card(s) are not in the database: ${missing.map((c) => c.cardCode).join(", ")}. ` +
        "Run npm run wing:seed-compendium first.",
    );
  }

  const cycles = await db
    .select({ id: schoolCycles.id, year: schoolCycles.cycleYear, active: schoolCycles.activeHeuristicSequenceId })
    .from(schoolCycles)
    .where(eq(schoolCycles.status, "active"));

  console.log(`\n${DRY_RUN ? "DRY RUN — no writes" : "Building"}: ${cards.length} card(s) × ${cycles.length} active cycle(s)\n`);

  if (!cycles.length) {
    console.log("No active cycles. Nothing to build — run wing:seed-partners first.\n");
    await pool.end();
    return;
  }

  const noWeight = cards.filter((c) => c.weight === null);

  for (const cycle of cycles) {
    /* What the cycle points at today, and whether it holds anything. */
    let currentEntries = 0;
    if (cycle.active) {
      const rows = await db
        .select({ id: heuristicSequenceEntries.id })
        .from(heuristicSequenceEntries)
        .where(eq(heuristicSequenceEntries.sequenceId, cycle.active));
      currentEntries = rows.length;
    }

    console.log(`Cycle #${cycle.id} (${cycle.year})`);
    console.log(
      cycle.active
        ? `  currently active: sequence #${cycle.active}, ${currentEntries} entr(ies)`
        : "  currently active: none",
    );

    const [latest] = await db
      .select({ version: heuristicSequences.versionNumber })
      .from(heuristicSequences)
      .where(and(eq(heuristicSequences.ownerType, "school_cycle"), eq(heuristicSequences.ownerId, cycle.id)))
      .orderBy(desc(heuristicSequences.versionNumber))
      .limit(1);
    const version = (latest?.version ?? 0) + 1;

    if (DRY_RUN) {
      console.log(`  would create version ${version} with ${cards.length} entries, unreferenced\n`);
      continue;
    }

    /*
     * One transaction per cycle. A sequence with a partial set of entries is the
     * worst outcome available here: it looks buildable, it is inspectable, and it
     * is silently missing methodology.
     */
    const sequenceId = await db.transaction(async (tx) => {
      /*
       * Supersede this cycle's earlier UNPUBLISHED sequences so re-running does
       * not accumulate near-identical versions nobody can tell apart. The one
       * the cycle actually points at is left alone — superseding a live sequence
       * would be a methodology change disguised as housekeeping, and this script
       * publishes nothing.
       */
      const stale = await tx
        .update(heuristicSequences)
        .set({ supersededAt: new Date() })
        .where(
          and(
            eq(heuristicSequences.ownerType, "school_cycle"),
            eq(heuristicSequences.ownerId, cycle.id),
            isNull(heuristicSequences.supersededAt),
            ...(cycle.active ? [ne(heuristicSequences.id, cycle.active)] : []),
          ),
        )
        .returning({ id: heuristicSequences.id });
      if (stale.length) {
        console.log(`  superseded ${stale.length} earlier unpublished version(s)`);
      }

      const [sequence] = await tx
        .insert(heuristicSequences)
        .values({
          ownerType: "school_cycle",
          ownerId: cycle.id,
          versionNumber: version,
          activeFrom: new Date(),
          // superseded_at stays NULL: this is current, just not pointed at.
        })
        .returning({ id: heuristicSequences.id });

      await tx.insert(heuristicSequenceEntries).values(
        cards.map((card, i) => ({
          sequenceId: sequence.id,
          heuristicId: idByCode.get(card.cardCode)!,
          position: i + 1,
          // numeric(5,2) takes a string. The document's weight where it states
          // one, 1.0 where it does not — reported below rather than assumed.
          weight: (card.weight ?? 1.0).toFixed(2),
          appliesToSession: sessionScopeFor(card.module, card.cardCode) as never,
        })),
      );

      return sequence.id;
    });

    console.log(`  built sequence #${sequenceId} (version ${version}), ${cards.length} entries`);
    console.log(`  NOT published — cycle #${cycle.id} still points at ${cycle.active ?? "nothing"}\n`);
  }

  /* ── What a reviewer needs before publishing ───────────────────────────── */

  const byModule: Record<string, number> = {};
  for (const c of cards) byModule[c.module] = (byModule[c.module] ?? 0) + 1;

  console.log("Sequence contents, in position order");
  console.log("───────────────────────────────────");
  for (const m of MODULE_ORDER) {
    if (byModule[m]) {
      const scope = sessionScopeFor(m) ?? "every session";
      console.log(
        `  ${m.padEnd(14)} ${String(byModule[m]).padStart(2)} card(s)   fires in: ${scope}`,
      );
    }
  }

  const overridden = cards.filter((c) => c.cardCode in UNIVERSAL_DESPITE_CODE);
  if (overridden.length) {
    console.log(
      `\n  ${overridden.length} card(s) scoped to every session despite their number:\n` +
        overridden
          .map((c) => `    ${c.cardCode.padEnd(8)} ${UNIVERSAL_DESPITE_CODE[c.cardCode]}`)
          .join("\n"),
    );
  }

  const scoped = cards.filter((c) => sessionScopeFor(c.module, c.cardCode) !== null).length;
  console.log(
    `\n  ${scoped} entr(ies) are session-scoped, ${cards.length - scoped} apply everywhere.\n` +
      "  A Foundation 1 student's catalogue is the 12 universal + 6 voice cards\n" +
      "  plus Foundation 1's 10 — not all 53.",
  );

  const weights: Record<string, number> = {};
  for (const c of cards) {
    const w = (c.weight ?? 1.0).toFixed(1);
    weights[w] = (weights[w] ?? 0) + 1;
  }
  console.log(
    `\n  weights: ${Object.entries(weights).sort((a, b) => Number(b[0]) - Number(a[0])).map(([w, n]) => `${w} × ${n}`).join(", ")}`,
  );
  console.log(
    `  ${noWeight.length} card(s) had no stated weight and were written as 1.00:\n` +
      `    ${noWeight.map((c) => c.cardCode).join(", ")}`,
  );

  const preempting = cards.filter((c) => (c.weight ?? 1.0) >= 2.0);
  console.log(
    `\n  ${preempting.length} card(s) at weight 2.0 pre-empt every other match:\n` +
      preempting.map((c) => `    ${c.cardCode.padEnd(8)} ${c.name.slice(0, 52)}`).join("\n"),
  );

  console.log(
    "\nPUBLISHING\n" +
      "──────────\n" +
      "  Nothing above is live. A sequence goes live through one pointer, and\n" +
      "  this script does not set it:\n" +
      "    UPDATE wing.school_cycles SET active_heuristic_sequence_id = <id> WHERE id = <cycle>;\n" +
      "  One statement, reversible by restoring the previous value.\n\n" +
      "  Session scoping (migration 0020) closed the blocker that made publishing\n" +
      "  unsafe: entries now carry the session they fire in, so a Foundation 1\n" +
      "  student is no longer offered Foundation 2's cards. What publishing still\n" +
      "  changes is real — 22 coaching cards start competing to fire, and the four\n" +
      "  at weight 2.0 pre-empt everything else. Review the cards in the admin UI\n" +
      "  first; that is what they were seeded as candidates for.\n",
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error("\n[build-sequences] failed:", (err as Error).message);
  await pool?.end().catch(() => {});
  process.exit(1);
});

import { readFileSync } from "node:fs";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import {
  heuristicSequenceEntries,
  heuristicSequences,
  heuristics,
  schoolCycles,
} from "@shared/wing-schema";
import { isTier1, parseCompendium } from "./parse-compendium";
import { INTAKE_SOURCE, parseIntake } from "./parse-intake";
import { RESEARCH_GATES_SOURCE, parseResearchGates } from "./parse-research-gates";
import {
  SEQUENCE_HARD_LIMIT,
  detectorLoadBySession,
  peakDetectorLoad,
} from "./sequence-limits";

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
 * So the sequence holds every Tier 1 card and scoping a student's catalogue to
 * their CURRENT session is a read-time filter — `applies_to_session` on the entry,
 * migration 0020, which `getSequenceCards` filters on. That was once the blocker on
 * publication: without it, publishing would have offered H-201, the Foundation 2
 * credibility test, to a student sitting in Foundation 1.
 *
 * ── WHAT IS IN IT SINCE 18 AUGUST ────────────────────────────────────────
 * Three documents, not one. The compendium's 53 Tier 1 cards, the intake module's
 * 41, and 9 of the research-derived gates — the six universal ones plus H-111,
 * H-210 and H-315. 103 entries.
 *
 * That is more than the activation route's hard limit of 40 would allow if the
 * limit were counted per sequence, and less than it if counted per turn, which is
 * the measurement that describes what a student experiences: 22 coaching cards in
 * intake, 7 or 8 in each Foundation session. This script refuses to build a
 * sequence whose worst turn exceeds the limit, so a set that cannot be activated
 * is never written. See sequence-limits.ts.
 */

const DRY_RUN = process.argv.includes("--dry-run");
const COMPENDIUM_SOURCE = "methodology/wing-master-module-compendium-v2.md";

/**
 * Reading order within the sequence.
 *
 * Position no longer decides which card fires — weight does, as of T3 — so this
 * only has to be stable and legible to whoever reads the sequence in the admin
 * UI. Universal rules first because they bound everything after them, then the
 * voice gates, then the sessions in the order a student meets them.
 */
const MODULE_ORDER = [
  "universal",
  "voice",
  "intake",
  "foundation_1",
  "foundation_2",
  "foundation_3",
];

/** The four fields the builder needs from a card, whatever document it came from. */
type SequenceCard = {
  cardCode: string;
  name: string;
  module: string;
  weight: number | null;
  cardKind: string;
};

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
/*
 * Empty since 18 August, and worth keeping empty rather than deleting.
 *
 * It held one entry: H-308, whose own detection method said "fires at every module
 * opening" while its H-3xx code confined it to Foundation 3. Danielle renumbered it
 * to H-007, universal — so the code and the behaviour now agree and the exception is
 * dead. The mechanism stays because the next card whose number contradicts its own
 * text will need it, and because an empty table with this comment explains the
 * decision better than its absence would.
 */
const UNIVERSAL_DESPITE_CODE: Record<string, string> = {};

function sessionScopeFor(module: string, cardCode?: string): string | null {
  if (cardCode && cardCode in UNIVERSAL_DESPITE_CODE) return null;
  switch (module) {
    // `intake` is the first value of wing.session_type, so the enum already had
    // it — the module simply had no cards until 18 August.
    case "intake": return "intake";
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
function sequenceOrder(a: SequenceCard, b: SequenceCard): number {
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

  const compendium = parseCompendium(readFileSync(COMPENDIUM_SOURCE, "utf8"));
  const intake = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));
  const research = parseResearchGates(readFileSync(RESEARCH_GATES_SOURCE, "utf8"));

  const compendiumCards = compendium.cards.filter(isTier1);
  const researchGates = research.moduleGates.filter(isTier1);

  const cards: SequenceCard[] = ([] as SequenceCard[])
    .concat(
      compendiumCards.map((c) => ({
        cardCode: c.cardCode,
        name: c.name,
        module: c.module,
        weight: c.weight,
        cardKind: c.cardKind,
      })),
    )
    .concat(
      intake.cards.map((c) => ({
        cardCode: c.cardCode,
        name: c.name,
        module: c.module,
        weight: c.weight,
        cardKind: c.cardKind,
      })),
    )
    .concat(
      // The 13 intake integrity gates are two lines and a rule, not seven-component
      // cards, so they have no ParsedCard. Weight is irrelevant to a gate: gates do
      // not compete to fire, they all apply.
      intake.gates.map((g) => ({
        cardCode: g.cardCode,
        name: `${g.cardCode} ${g.name}`,
        module: "intake",
        weight: null,
        cardKind: "integrity_gate",
      })),
    )
    .concat(
      research.universalGates.map((g) => ({
        cardCode: g.cardCode,
        name: `${g.cardCode} ${g.name}`,
        module: "universal",
        weight: null,
        cardKind: "integrity_gate",
      })),
    )
    .concat(
      researchGates.map((c) => ({
        cardCode: c.cardCode,
        name: c.name,
        module: c.module,
        weight: c.weight,
        cardKind: c.cardKind,
      })),
    )
    .sort(sequenceOrder);

  const expected = 53 + 41 + 6 + 3;
  if (compendiumCards.length !== 53 || intake.cards.length !== 28 || intake.gates.length !== 13) {
    throw new Error(
      `Source counts moved: ${compendiumCards.length} compendium Tier 1 (expected 53), ` +
        `${intake.cards.length} intake cards (28), ${intake.gates.length} intake gates (13). ` +
        "Re-run wing:check-compendium and the parser suites before building.",
    );
  }
  if (cards.length !== expected) {
    throw new Error(`Expected ${expected} entries, assembled ${cards.length}.`);
  }

  /*
   * Refuse to build what cannot be activated. The route checks this too, but
   * finding out at activation means a version exists that a reviewer has already
   * read and cannot use.
   */
  const peak = peakDetectorLoad(
    cards.map((c) => ({
      cardKind: c.cardKind,
      appliesToSession: sessionScopeFor(c.module, c.cardCode),
    })),
  );
  if (peak.count > SEQUENCE_HARD_LIMIT) {
    throw new Error(
      `${peak.count} coaching cards would be in front of the detector in ` +
        `${peak.session ?? "every session"}, above the limit of ${SEQUENCE_HARD_LIMIT}. ` +
        "Narrow the set for that session — this is a methodology decision, not a " +
        "number to raise.",
    );
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
        "Run wing:seed-compendium, wing:seed-intake and wing:seed-research-gates first.",
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
    `\n  ${scoped} entr(ies) are session-scoped, ${cards.length - scoped} apply everywhere.`,
  );

  /*
   * What one turn actually puts in front of the detector — the number the hard
   * limit applies to, and the one worth reading before publishing. Gates and
   * exercises are excluded because they never enter the detector catalogue.
   */
  const loads = detectorLoadBySession(
    cards.map((c) => ({
      cardKind: c.cardKind,
      appliesToSession: sessionScopeFor(c.module, c.cardCode),
    })),
  );
  const coachingTotal = cards.filter((c) => c.cardKind === "coaching_card").length;
  console.log(
    `\nCoaching cards in front of the detector, per turn (limit ${SEQUENCE_HARD_LIMIT})\n` +
      "──────────────────────────────────────────────────────────",
  );
  for (const l of loads.slice().sort((a, b) => b.count - a.count)) {
    console.log(`  ${String(l.session ?? "every session").padEnd(14)} ${String(l.count).padStart(3)}`);
  }
  console.log(
    `  ${coachingTotal} in the sequence overall, which is NOT the number that matters:\n` +
      "  an entry scoped to one session is invisible in the others.",
  );

  const weights: Record<string, number> = {};
  for (const c of cards) {
    const w = (c.weight ?? 1.0).toFixed(1);
    weights[w] = (weights[w] ?? 0) + 1;
  }
  console.log(
    `\n  weights: ${Object.entries(weights).sort((a, b) => Number(b[0]) - Number(a[0])).map(([w, n]) => `${w} × ${n}`).join(", ")}`,
  );
  /*
   * Split by kind, because only one of the three groups matters. Weight is
   * precedence among cards competing to fire, and gates do not compete — they all
   * apply — while exercises are routed to by explicit reference. So 40 gates and 7
   * exercises with no stated weight is not a gap; the coaching cards are.
   */
  const unweightedCoaching = noWeight.filter((c) => c.cardKind === "coaching_card");
  const unweightedOther = noWeight.length - unweightedCoaching.length;
  console.log(
    `  ${noWeight.length} entr(ies) had no stated weight and were written as 1.00, of which\n` +
      `  ${unweightedOther} are gates or exercises, where weight decides nothing. The ${unweightedCoaching.length} coaching\n` +
      `  card(s) that do compete to fire and have no stated weight:\n` +
      `    ${unweightedCoaching.map((c) => c.cardCode).join(", ")}\n` +
      "  Twelve of those are reveal templates, and the document does weight four of\n" +
      "  its templates — so this looks like an oversight of hers rather than a\n" +
      "  decision. It changes nothing yet: the reveal is chosen by H-019.5 scoring\n" +
      "  the templates, not by sequence weight.",
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
      `  changes is real — ${peak.count} coaching cards start competing to fire in ` +
      `${peak.session ?? "every session"},\n` +
      `  and the ${preempting.length} at weight 2.0 pre-empt everything else. Review the cards in\n` +
      "  the admin UI first; that is what they were seeded as candidates for.\n",
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error("\n[build-sequences] failed:", (err as Error).message);
  await pool?.end().catch(() => {});
  process.exit(1);
});

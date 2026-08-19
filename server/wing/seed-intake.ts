import { readFileSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { heuristicComponents, heuristics } from "@shared/wing-schema";
import { INTAKE_SOURCE, parseIntake } from "./parse-intake";
import { intakeCardToSeed, intakeGateToSeed, seedRows } from "./seed-shared";
import { assertInterventionTypes } from "./seed-preflight";

/**
 * Seeds the intake module — 29 cards and 13 integrity gates.
 *
 * Run:  npm run wing:seed-intake -- --dry-run   report, no writes
 *       npm run wing:seed-intake                insert
 *
 * ── WHAT LANDS ───────────────────────────────────────────────────────────
 * All 42, because all 42 are Tier 1: A1 conversational intake, which has been an
 * open Tier 1 gap since the gap analysis and had no cards until 18 August. Every
 * one lands as `candidate` and in NO sequence, so none of it reaches a student —
 * `getSequenceCards` can only return what a sequence contains. Composing a
 * sequence and pointing a cohort at it are separate, deliberate acts.
 *
 * ── WHY THE 13 GATES LOOK EMPTY ──────────────────────────────────────────
 * A compendium gate carries the same seven components as a card. An intake gate
 * carries two lines: `gate_type` and `Rule`. So each one seeds with a single
 * component — the rule, as `coaching_move` — and its notes name the six the
 * document does not supply.
 *
 * That mapping is the only one made here. A gate's `coaching_move` is "what Wing
 * must do", and the Rule is a sentence that says what Wing must do and nothing
 * else. Everything absent stays absent: inventing a `failure_path` for a safety-
 * adjacent rule is not a thing that can be undone once it has shipped.
 *
 * ── WHY intervention_type IS NULL FOR THE GATES ───────────────────────────
 * Because the document does not state one, and the column is nullable precisely
 * for cards that were never classified. `card_kind` is what actually keeps a gate
 * out of the detector catalogue, and that derives from the `IG-` prefix rather
 * than from the classifier — so nothing is lost by leaving the classifier honest.
 */

const DRY_RUN = process.argv.includes("--dry-run");

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  ({ db, pool } = await initScript());

  const parsed = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));

  if (parsed.cards.length !== 29 || parsed.gates.length !== 13) {
    throw new Error(
      `Expected 29 cards and 13 gates, parsed ${parsed.cards.length} and ` +
        `${parsed.gates.length}. The source document has changed — review before seeding.`,
    );
  }
  if (parsed.unresolvableTags.length) {
    throw new Error(
      "Population tags no student can carry: " +
        parsed.unresolvableTags.join(", ") +
        ". Map them in population-tags.ts first — a card tagged only with an " +
        "unmappable tag reaches nobody, silently.",
    );
  }
  if (parsed.misfiled.length) {
    throw new Error(
      "Cards that do not derive to the intake module: " +
        parsed.misfiled.map((m) => `${m.cardCode} → ${m.module}`).join(", "),
    );
  }

  const seeds = parsed.cards.map(intakeCardToSeed).concat(parsed.gates.map(intakeGateToSeed));


  /*
   * Before anything is written. `wing:seed-intake` was once run against a database
   * without ELICIT in the enum: it committed H-010 and threw on H-011, which is a
   * partial write caused by a precondition nobody checked.
   */
  const needed: string[] = [];
  for (const s of seeds) {
    if (s.interventionType && needed.indexOf(s.interventionType) < 0) {
      needed.push(s.interventionType);
    }
  }
  await assertInterventionTypes(pool, needed);

  console.log(
    `\n${DRY_RUN ? "DRY RUN — no writes" : "Seeding"}: ${seeds.length} intake element(s) ` +
      `from ${INTAKE_SOURCE}\n`,
  );

  /* Idempotent by card_code: an existing card is never overwritten. */
  const existing = await db
    .select({ cardCode: heuristics.cardCode })
    .from(heuristics)
    .where(inArray(heuristics.cardCode, seeds.map((s) => s.cardCode)));
  const taken = new Set(existing.map((r) => r.cardCode));

  if (taken.size) {
    console.log(`  ${taken.size} already present, leaving untouched:`);
    console.log(`  ${Array.from(taken).sort().join(", ")}\n`);
  }

  let inserted = 0;
  let componentRows = 0;
  const byKind: Record<string, number> = {};

  for (const seed of seeds) {
    if (taken.has(seed.cardCode)) continue;
    const rows = seedRows(seed);
    byKind[seed.cardKind] = (byKind[seed.cardKind] ?? 0) + 1;

    if (DRY_RUN) {
      inserted++;
      componentRows += rows.components.length;
      console.log(
        `  + ${seed.cardCode.padEnd(9)} ${seed.cardKind.padEnd(15)} ` +
          `${String(rows.components.length - 1).padStart(2)} component(s)  ${seed.name.slice(0, 42)}`,
      );
      continue;
    }

    /*
     * One transaction per card. A half-inserted card is worse than an absent one:
     * the editor shows it, a reviewer approves it, and the missing component reads
     * as a methodology omission rather than a failed write.
     */
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(heuristics)
        .values({
          cardCode: rows.heuristic.cardCode,
          name: rows.heuristic.name,
          description: rows.heuristic.description,
          populationTags: rows.heuristic.populationTags,
          status: rows.heuristic.status as never,
          interventionType: rows.heuristic.interventionType as never,
          cardKind: rows.heuristic.cardKind as never,
        })
        .returning({ id: heuristics.id });

      await tx.insert(heuristicComponents).values(
        rows.components.map((r) => ({
          heuristicId: created.id,
          componentType: r.componentType as never,
          content: r.content,
          isCurrent: true,
        })),
      );
      componentRows += rows.components.length;
    });

    inserted++;
    console.log(`  + ${seed.cardCode.padEnd(9)} ${seed.cardKind.padEnd(15)} ${seed.name.slice(0, 48)}`);
  }

  console.log(
    `\n${DRY_RUN ? "Would insert" : "Inserted"} ${inserted} element(s) and ` +
      `${componentRows} component row(s).`,
  );
  console.log(`  by kind: ${Object.keys(byKind).map((k) => `${k} ${byKind[k]}`).join(", ")}`);

  console.log(
    `\n${parsed.missingWeight.length} card(s) state no sequence weight, so a sequence ` +
      "build will default them to 1.0:\n" +
      `  ${parsed.missingWeight.join(", ")}\n` +
      "  Mostly reveal templates, and she does weight four of them — which makes this\n" +
      "  look like an oversight rather than a decision. A question for her.",
  );

  const restating = parsed.gates.filter((g) => g.restates);
  console.log(
    `\n${restating.length} intake gate(s) restate a platform-wide gate:\n` +
      restating.map((g) => `  ${g.cardCode} → ${g.restates}`).join("\n") +
      "\n  A sequence must not carry both wordings of the same rule.",
  );

  console.log(
    "\nEvery element is 'candidate' and in NO sequence, so none of this reaches a\n" +
      "student. Composing a sequence and pointing a cohort at it are separate acts.\n",
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error("\n[seed-intake] failed:", (err as Error).message);
  await pool?.end().catch(() => {});
  process.exit(1);
});

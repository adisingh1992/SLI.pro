import { readFileSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { heuristicComponents, heuristics } from "@shared/wing-schema";
import { isTier1 } from "./parse-compendium";
import {
  RESEARCH_GATES_SOURCE,
  UNIVERSAL_GATE_GAPS,
  parseResearchGates,
} from "./parse-research-gates";
import { moduleGateToSeed, seedRows, universalGateToSeed } from "./seed-shared";
import { assertInterventionTypes } from "./seed-preflight";

/**
 * Seeds the research-derived gates — six universal, three Foundation.
 *
 * Run:  npm run wing:seed-research-gates -- --dry-run   report, no writes
 *       npm run wing:seed-research-gates                insert
 *
 * ── WHAT LANDS AND WHAT WAITS ────────────────────────────────────────────
 * Nine of the eleven. IG-U006 to IG-U011 are universal, so Tier 1 by definition;
 * H-111, H-210 and H-315 are Foundation 1, 2 and 3. H-616 and H-923 defer with
 * Modules 6 and 9 — H-616 additionally depends on intake capturing positioning
 * aversion data, which the delivered intake module does not ask for, and its own
 * detection method says the gate lies dormant in that case.
 *
 * ── THE SIX ARE RULE-ONLY, AND THAT IS ENOUGH TO SEED ────────────────────
 * They arrived as prose, so five of the seven components are missing from all
 * six: signal, detection_method, intervention_type, success_criteria,
 * failure_path. Two are present under other names — the rule paragraph is
 * `coaching_move`, and Part A ("Audience Delivery Adaptations") is
 * `delivery_adaptation`.
 *
 * A rule-only gate is still a gate. What it can do is compile into a prompt,
 * which is how every gate reaches a student. What it cannot do is carry a
 * precondition (needs `detection_method`) or be verified after the fact (needs
 * `success_criteria`), and three of the six do come with their own banned-phrase
 * lists, which is most of what deterministic auditing needs.
 *
 * So they seed, as candidates, with every absent component named in their notes
 * and every unmapped field of her prose preserved verbatim there. Nothing is
 * inferred: `intervention_type` stays null because she does not state one, and
 * `card_kind` — the field that actually keeps a gate out of the detector
 * catalogue — comes from the `IG-` prefix rather than from the classifier.
 *
 * There is a second reason not to wait. IG-INT10 to IG-INT13 restate IG-U006,
 * IG-U007, IG-U009 and IG-U010 for intake. Seeding the intake gates while their
 * platform-wide originals sat unseeded would put the intake wording of a rule in
 * front of a student with the rule itself absent, which is worse than either.
 */

const DRY_RUN = process.argv.includes("--dry-run");

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  ({ db, pool } = await initScript());

  const parsed = parseResearchGates(readFileSync(RESEARCH_GATES_SOURCE, "utf8"));

  if (parsed.universalGates.length !== 6 || parsed.moduleGates.length !== 5) {
    throw new Error(
      `Expected 6 universal and 5 module gates, parsed ${parsed.universalGates.length} ` +
        `and ${parsed.moduleGates.length}. The source document has changed.`,
    );
  }
  if (parsed.incomplete.length) {
    throw new Error(
      "Module gates missing components: " +
        parsed.incomplete.map((i) => `${i.cardCode} (${i.missing.join(", ")})`).join("; "),
    );
  }

  const tier1ModuleGates = parsed.moduleGates.filter(isTier1);
  const deferred = parsed.moduleGates.filter((g) => !isTier1(g));

  const seeds = parsed.universalGates
    .map(universalGateToSeed)
    .concat(tier1ModuleGates.map(moduleGateToSeed));


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
    `\n${DRY_RUN ? "DRY RUN — no writes" : "Seeding"}: ${seeds.length} gate(s) ` +
      `from ${RESEARCH_GATES_SOURCE}\n`,
  );

  const existing = await db
    .select({ cardCode: heuristics.cardCode })
    .from(heuristics)
    .where(inArray(heuristics.cardCode, seeds.map((s) => s.cardCode)));
  const taken = new Set(existing.map((r) => r.cardCode));

  /*
   * The check that would have caught the collision of 18 August. IG-U006 to
   * IG-U008 were the Module 11 trio that morning; if this reports them as taken,
   * `wing:apply-corrections -- --apply` has not been run and seeding here would
   * bind her Barnum gate to a row that is a different rule entirely.
   */
  if (taken.size) {
    console.log(`  ${taken.size} already present, leaving untouched:`);
    console.log(`  ${Array.from(taken).sort().join(", ")}`);
    console.log(
      "  If any of IG-U006 to IG-U008 is in that list, STOP: those are the Module 11\n" +
        "  trio and the rename has not run. npm run wing:apply-corrections -- --apply\n",
    );
  }

  let inserted = 0;
  let componentRows = 0;

  for (const seed of seeds) {
    if (taken.has(seed.cardCode)) continue;
    const rows = seedRows(seed);

    if (DRY_RUN) {
      inserted++;
      componentRows += rows.components.length;
      console.log(
        `  + ${seed.cardCode.padEnd(9)} ${seed.cardKind.padEnd(15)} ` +
          `${String(rows.components.length - 1).padStart(2)} component(s)  ${seed.name.slice(0, 42)}`,
      );
      continue;
    }

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
    `\n${DRY_RUN ? "Would insert" : "Inserted"} ${inserted} gate(s) and ` +
      `${componentRows} component row(s).`,
  );

  console.log(
    `\nThe six universal gates carry 2 of 7 components. Absent from all six:\n` +
      `  ${UNIVERSAL_GATE_GAPS.join(", ")}\n` +
      "  They compile into a prompt on the rule alone. What they cannot do is carry a\n" +
      "  precondition or be verified after delivery. Five rows per gate from her closes\n" +
      "  it; nothing here guesses at them.",
  );

  console.log(
    `\n${deferred.length} module gate(s) deferred with their modules:\n` +
      deferred.map((g) => `  ${g.cardCode.padEnd(9)} ${g.module}`).join("\n"),
  );

  console.log(
    "\nEvery gate is 'candidate' and in NO sequence. Composing a sequence and\n" +
      "pointing a cohort at it are separate acts.\n",
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error("\n[seed-research-gates] failed:", (err as Error).message);
  await pool?.end().catch(() => {});
  process.exit(1);
});

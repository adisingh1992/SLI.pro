import "dotenv/config";
import { sql } from "drizzle-orm";
import { type ScriptDb } from "../script-init";
import { startScript } from "./script-start";

/**
 * `npm run wing:create-sandbox -- --sequence=<id> [--apply] [--label="..."] [--institution="..."]`
 *
 * P0.2. Creates one institution + one school_cycle whose
 * `active_heuristic_sequence_id` points at an existing, published sequence —
 * nothing else. No students, no personas: `wing:seed-personas -- --cycle=<id>`
 * is the next step once this prints a cycle id.
 *
 * ── WHY `--sequence` IS REQUIRED AND NEVER DEFAULTED ─────────────────────
 * `wing:census` settled the number question (10 Sep): two different live
 * sequences exist right now, on different cycles, at different sizes —
 *
 *   sequence 18 v8   103 entries (45 coaching)   SLI.pro Direct    peak 22
 *                    at intake, OVER the soft limit of 15
 *   sequence 13 v4    53 entries (22 coaching)   UC Berkeley        peak  8
 *   sequence 14 v4    53 entries (22 coaching)   Vanderbilt         peak  8
 *
 * (`server/wing/sequence-limits.ts`'s own header already names this shape —
 * "104 entries, 46 coaching, no turn over 23" — as the expected profile of
 * the intake-inclusive set. The census confirms *that* set, not a smaller
 * relative, is the one actually live for real students today.)
 *
 * Which of those the sandbox should exercise is a methodology choice — it
 * decides whether Danielle is reviewing the newer, larger, over-limit
 * methodology or the older Foundation-only one — not a config default this
 * script gets to make. So it takes the id on the command line and prints
 * both candidates when it is missing, rather than picking the first one.
 *
 * ── SAME REFUSALS AS THE SEEDER, CHECKED BEFORE THIS ONE TOO ─────────────
 * A cycle publishing nothing produces empty transcripts and an Unfired Cards
 * report in which the whole library never fired. So the target sequence is
 * checked here, at creation time, the same way `wing:seed-personas` checks it
 * at seed time: exists, not superseded, at least one non-retired coaching
 * card. Two independent scripts asking the same question rather than one
 * trusting the other's earlier check.
 *
 * ── DRY RUN BY DEFAULT, IDEMPOTENT BY NAME ────────────────────────────────
 * Same shape as every other `--apply` script here. Idempotent on
 * (institution name, cycle label): re-running with the same names reports
 * the existing institution/cycle and creates nothing, because the point of
 * a sandbox cycle is a stable id the seeder and the runner keep pointing at.
 *
 * ── WHAT THIS DOES NOT DO ─────────────────────────────────────────────────
 * No students, no personas, no sessions — `wing:seed-personas` is the next
 * command and it is a separate step deliberately, so a mistake in the cycle
 * (wrong sequence, wrong label) is caught before any account exists under it.
 * Does not touch `cohort-metrics.ts` or any institution-facing dashboard —
 * whether an institution admin should ever see this cycle is Danielle and
 * Sam's open question from step 3, not decided here.
 */

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

const APPLY = process.argv.includes("--apply");
const arg = (flag: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return hit ? hit.slice(flag.length + 3) : undefined;
};

const DEFAULT_INSTITUTION = "SLI Test Harness (Sandbox)";
const DEFAULT_LABEL = "Harness Sandbox";

type Row = Record<string, unknown>;
const rowsOf = async (q: unknown): Promise<Row[]> => {
  const r = await db.execute(q as never);
  return (r as unknown as { rows: Row[] }).rows ?? [];
};

async function main() {
  ({ db, pool } = await startScript());

  const sequenceArg = arg("sequence");
  const institutionName = arg("institution") ?? DEFAULT_INSTITUTION;
  const label = arg("label") ?? DEFAULT_LABEL;

  const sequenceId = sequenceArg ? Number(sequenceArg) : NaN;
  if (!Number.isInteger(sequenceId) || sequenceId <= 0) {
    const live = await rowsOf(sql`
      SELECT DISTINCT q."id" AS sequence_id, q."version_number" AS version_number,
             i."name" AS institution,
             (SELECT count(*) FROM "wing"."heuristic_sequence_entries" e
                JOIN "wing"."heuristics" h ON h."id" = e."heuristic_id"
               WHERE e."sequence_id" = q."id" AND h."card_kind" = 'coaching_card'
                 AND h."status" <> 'retired') AS coaching_cards
        FROM "wing"."heuristic_sequences" q
        JOIN "wing"."school_cycles" c ON c."active_heuristic_sequence_id" = q."id"
        JOIN "wing"."institutions" i ON i."id" = c."institution_id"
       ORDER BY q."id"
    `);
    console.error(`\n  --sequence=<id> is required. Currently LIVE sequences:\n`);
    for (const r of live) {
      console.error(
        `    sequence ${Number(r.sequence_id)} v${String(r.version_number)} · ` +
          `${Number(r.coaching_cards)} coaching card(s) · live for ${String(r.institution)}`,
      );
    }
    console.error(
      `\n  Which one the sandbox should test is a methodology choice, not a default\n` +
        `  this script makes. Run \`npm run wing:census\` for the full picture.\n`,
    );
    await pool.end();
    process.exit(1);
  }

  /* ── the same publication check the seeder makes, made here too ───────── */

  const [seq] = await rowsOf(sql`
    SELECT q."id" AS id, q."superseded_at" AS superseded_at,
           (SELECT count(*) FROM "wing"."heuristic_sequence_entries" e
              JOIN "wing"."heuristics" h ON h."id" = e."heuristic_id"
             WHERE e."sequence_id" = q."id" AND h."card_kind" = 'coaching_card'
               AND h."status" <> 'retired') AS coaching_cards
      FROM "wing"."heuristic_sequences" q
     WHERE q."id" = ${sequenceId}
     LIMIT 1
  `);

  if (!seq) {
    console.error(`\n  no sequence ${sequenceId}. Run \`npm run wing:census\`.\n`);
    await pool.end();
    process.exit(1);
  }
  if (seq.superseded_at !== null) {
    console.error(
      `\n  ✗ sequence ${sequenceId} is SUPERSEDED (${String(seq.superseded_at)}). ` +
        `A sandbox cannot publish a superseded sequence.\n`,
    );
    await pool.end();
    process.exit(1);
  }
  const coaching = Number(seq.coaching_cards ?? 0);
  if (coaching === 0) {
    console.error(
      `\n  ✗ sequence ${sequenceId} has no non-retired coaching cards — nothing for the\n` +
        `    detector to match against on any turn.\n`,
    );
    await pool.end();
    process.exit(1);
  }

  console.log(
    `\n[create-sandbox] sequence ${sequenceId} · ${coaching} non-retired coaching card(s) · ` +
      `not superseded\n`,
  );

  /* ── idempotent lookup, by name ─────────────────────────────────────────── */

  const [existingInstitution] = await rowsOf(sql`
    SELECT "id" FROM "wing"."institutions" WHERE "name" = ${institutionName} LIMIT 1
  `);
  const institutionId = existingInstitution ? Number(existingInstitution.id) : null;

  if (institutionId !== null) {
    const [existingCycle] = await rowsOf(sql`
      SELECT "id", "active_heuristic_sequence_id" AS sequence_id
        FROM "wing"."school_cycles"
       WHERE "institution_id" = ${institutionId} AND "label" = ${label}
       LIMIT 1
    `);
    if (existingCycle) {
      console.log(
        `  institution "${institutionName}" (id ${institutionId}) and cycle "${label}" ` +
          `(id ${Number(existingCycle.id)}) already exist.`,
      );
      if (Number(existingCycle.sequence_id) !== sequenceId) {
        console.log(
          `  \x1b[33mNote: that cycle currently points at sequence ` +
            `${Number(existingCycle.sequence_id)}, not ${sequenceId}. This script does not\n` +
            `  repoint an existing cycle — that is a separate, deliberate action.\x1b[0m`,
        );
      } else {
        console.log(`  It already points at sequence ${sequenceId}. Nothing to do.`);
      }
      console.log(
        `\n  Use cycle ${Number(existingCycle.id)} with ` +
          `\`npm run wing:seed-personas -- --cycle=${Number(existingCycle.id)}\`.\n`,
      );
      await pool.end();
      return;
    }
    console.log(`  institution "${institutionName}" (id ${institutionId}) already exists.`);
    console.log(`  ${APPLY ? "+" : "·"} cycle "${label}" → sequence ${sequenceId}`);
  } else {
    console.log(`  ${APPLY ? "+" : "·"} institution "${institutionName}"`);
    console.log(`  ${APPLY ? "+" : "·"} cycle "${label}" → sequence ${sequenceId}`);
  }

  if (!APPLY) {
    console.log("\n  Dry run — nothing was written. Re-run with --apply.\n");
    await pool.end();
    return;
  }

  const year = new Date().getUTCFullYear();
  const start = `${year}-01-01`;
  const end = `${year + 1}-12-31`;

  const cycleId = await db.transaction(async (tx) => {
    let instId = institutionId;
    if (instId === null) {
      const ins = await tx.execute(sql`
        INSERT INTO "wing"."institutions" ("name", "country", "status")
        VALUES (${institutionName}, 'N/A — test harness', 'active')
        RETURNING "id"
      `);
      instId = Number(ins.rows[0].id);
    }

    const cyc = await tx.execute(sql`
      INSERT INTO "wing"."school_cycles"
        ("institution_id", "cycle_year", "label", "cohort_start_date", "cohort_end_date",
         "active_heuristic_sequence_id", "status")
      VALUES (${instId}, ${year}, ${label}, ${start}, ${end}, ${sequenceId}, 'active')
      RETURNING "id"
    `);
    return Number(cyc.rows[0].id);
  });

  console.log(
    `\n  created. cycle ${cycleId} → sequence ${sequenceId}.\n\n` +
      `  Next: \`npm run wing:seed-personas -- --cycle=${cycleId}\` (dry run first), then\n` +
      `  \`npm run wing:census\` again to see it listed.\n`,
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool?.end();
  } catch {
    /* exiting anyway */
  }
  process.exit(1);
});

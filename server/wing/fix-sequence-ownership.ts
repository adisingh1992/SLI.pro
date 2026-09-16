import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { heuristicSequences, schoolCycles } from "@shared/wing-schema";
import { type ScriptDb } from "../script-init";
import { startScript } from "./script-start";

/**
 * `npm run wing:fix-sequence-ownership`          report, writes nothing
 * `npm run wing:fix-sequence-ownership -- --fix` correct the rows
 *
 * Repairs sequences filed under the wrong cycle.
 *
 * ── THE BUG THIS CLEANS UP AFTER ─────────────────────────────────────────
 * `build-full-sequences` created each cycle's new sequence with the
 * `owner_type`/`owner_id` of whatever sequence that cycle happened to be
 * pointing at, instead of the cycle it was building for. Two cycles shared one
 * sequence, so both replacements were filed under one of them.
 *
 * Nothing about the coaching was affected and nothing was lost: a cycle reaches
 * its sequence through `school_cycles.active_heuristic_sequence_id`, which was
 * set correctly, so all 325 entries were live and scoped exactly as intended.
 * What broke is the version-history panel, which selects on
 * `owner_type = 'school_cycle' AND owner_id = <cycle>`: one cycle listed two
 * Version 10s and three cycles listed none at all, for sequences they were
 * actively running.
 *
 * That is worth fixing properly rather than leaving as a display quirk. The
 * history panel is how anyone answers "what changed and when" — and a screen
 * that says "No sequence has ever been built for this cycle" about a cycle
 * running 325 cards is worse than no screen.
 *
 * ── WHAT IT TOUCHES, AND WHAT IT LEAVES ALONE ────────────────────────────
 * Only sequences a cycle currently points at. Superseded sequences keep their
 * existing ownership: they are history, and rewriting who owned something in
 * the past to make a list tidier is the opposite of an audit trail.
 *
 * One consequence worth stating. Where two cycles shared a sequence, its
 * history stays with the cycle that owned it and the other cycle's history
 * begins at its current version. That is accurate — the shared sequence really
 * was one row, and it really did belong to one owner — and the alternative,
 * duplicating history rows so both cycles show the same past, would invent
 * versions that were never built.
 *
 * ── VERSION COLLISIONS ───────────────────────────────────────────────────
 * Moving a sequence to its correct cycle can collide with a version number that
 * cycle already has. Where it does, the moved sequence is renumbered to that
 * cycle's next free version and the change is reported per row. Version numbers
 * order a cycle's own history; they are not referenced by anything else.
 */

const FIX = process.argv.includes("--fix");

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

type Row = Record<string, unknown>;

async function rows(q: unknown): Promise<Row[]> {
  const r = await db.execute(q as never);
  return (r as unknown as { rows: Row[] }).rows ?? [];
}

const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => (v === null || v === undefined ? "—" : String(v));
const heading = (t: string) => console.log(`\n\x1b[1m${t}\x1b[0m`);

async function main() {
  ({ db, pool } = await startScript());

  heading("Every cycle, and who owns the sequence it runs");

  const cycles = await rows(sql`
    SELECT c."id"                           AS cycle_id,
           i."name"                         AS institution,
           c."active_heuristic_sequence_id" AS sequence_id,
           q."owner_type"                   AS owner_type,
           q."owner_id"                     AS owner_id,
           q."version_number"               AS version_number,
           (SELECT count(*) FROM "wing"."heuristic_sequence_entries" e
             WHERE e."sequence_id" = q."id")                      AS entries,
           (SELECT count(*) FROM "wing"."heuristic_sequences" h
             WHERE h."owner_type" = 'school_cycle'
               AND h."owner_id" = c."id")                         AS owned_by_cycle
      FROM "wing"."school_cycles" c
      JOIN "wing"."institutions" i ON i."id" = c."institution_id"
      LEFT JOIN "wing"."heuristic_sequences" q ON q."id" = c."active_heuristic_sequence_id"
     ORDER BY c."id"
  `);

  const wrong: Array<{ cycleId: number; sequenceId: number; version: number; name: string }> = [];

  for (const cy of cycles) {
    const cycleId = n(cy.cycle_id);
    const seqId = cy.sequence_id === null ? null : n(cy.sequence_id);
    const misfiled =
      seqId !== null && (String(cy.owner_type) !== "school_cycle" || n(cy.owner_id) !== cycleId);

    console.log(
      `  cycle ${String(cycleId).padEnd(3)} ${s(cy.institution).slice(0, 34).padEnd(36)} ` +
        (seqId === null
          ? "no sequence"
          : `sequence ${String(seqId).padEnd(4)} v${String(s(cy.version_number)).padEnd(3)} ` +
            `${String(n(cy.entries)).padStart(4)} entries  ` +
            `owner ${s(cy.owner_type)}/${s(cy.owner_id)}` +
            (misfiled ? `  \x1b[31m✗ should be school_cycle/${cycleId}\x1b[0m` : "  ✓")) +
        `   history shows ${n(cy.owned_by_cycle)}`,
    );

    if (misfiled && seqId !== null) {
      wrong.push({
        cycleId,
        sequenceId: seqId,
        version: n(cy.version_number),
        name: s(cy.institution),
      });
    }
  }

  if (!wrong.length) {
    console.log("\n  ✓ every cycle owns the sequence it runs. Nothing to do.\n");
    await pool.end();
    return;
  }

  heading(FIX ? "Correcting" : "Would correct");

  if (!FIX) {
    for (const w of wrong) {
      console.log(
        `  sequence ${w.sequenceId} (v${w.version}) → owner school_cycle/${w.cycleId} — ${w.name}`,
      );
    }
    console.log(
      "\n  Nothing has been changed. Re-run with --fix:\n" +
        "    npm run wing:fix-sequence-ownership -- --fix\n",
    );
    await pool.end();
    return;
  }

  await db.transaction(async (tx: any) => {
    for (const w of wrong) {
      // Does this cycle already have a sequence at that version number?
      const [{ taken }] = await tx
        .select({
          taken: sql<number>`count(*)`,
        })
        .from(heuristicSequences)
        .where(
          sql`${heuristicSequences.ownerType} = 'school_cycle'
              AND ${heuristicSequences.ownerId} = ${w.cycleId}
              AND ${heuristicSequences.versionNumber} = ${w.version}
              AND ${heuristicSequences.id} <> ${w.sequenceId}`,
        );

      let version = w.version;
      if (Number(taken) > 0) {
        const [{ next }] = await tx
          .select({
            next: sql<number>`COALESCE(MAX(${heuristicSequences.versionNumber}), 0) + 1`,
          })
          .from(heuristicSequences)
          .where(
            sql`${heuristicSequences.ownerType} = 'school_cycle'
                AND ${heuristicSequences.ownerId} = ${w.cycleId}`,
          );
        version = Number(next);
      }

      await tx
        .update(heuristicSequences)
        .set({
          ownerType: "school_cycle" as never,
          ownerId: w.cycleId,
          versionNumber: version,
        })
        .where(eq(heuristicSequences.id, w.sequenceId));

      console.log(
        `  ✓ sequence ${w.sequenceId} → school_cycle/${w.cycleId}` +
          (version !== w.version ? `, renumbered v${w.version} → v${version}` : "") +
          `  (${w.name})`,
      );
    }

    // The pointers were always right; this asserts the repair did not disturb
    // them, because a fix that changed what a cohort runs would be a far worse
    // bug than the one it was fixing.
    const stranded = await tx
      .select({ id: schoolCycles.id })
      .from(schoolCycles)
      .where(sql`${schoolCycles.activeHeuristicSequenceId} IS NULL`);
    if (stranded.length !== cycles.filter((c) => c.sequence_id === null).length) {
      throw new Error("a cycle lost its sequence pointer during the repair — rolling back");
    }
  });

  heading("Verifying");

  const after = await rows(sql`
    SELECT c."id" AS cycle_id,
           (SELECT count(*) FROM "wing"."heuristic_sequences" h
             WHERE h."owner_type" = 'school_cycle' AND h."owner_id" = c."id") AS owned,
           (SELECT count(*) FROM "wing"."heuristic_sequence_entries" e
             WHERE e."sequence_id" = c."active_heuristic_sequence_id")        AS entries
      FROM "wing"."school_cycles" c
     ORDER BY c."id"
  `);
  for (const a of after) {
    console.log(
      `  cycle ${String(n(a.cycle_id)).padEnd(3)} history shows ${String(n(a.owned)).padStart(3)} ` +
        `version(s), running ${String(n(a.entries)).padStart(4)} entries`,
    );
  }
  console.log("");

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool?.end();
  } catch {
    /* already closed */
  }
  process.exit(1);
});

import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { heuristicSequences, schoolCycles } from "@shared/wing-schema";
import { type ScriptDb } from "../script-init";
import { startScript } from "./script-start";

/**
 * `npm run wing:fix-sequence-ownership`          report, writes nothing
 * `npm run wing:fix-sequence-ownership -- --fix` correct the rows
 *
 * Gives every cycle a sequence of its own, owned by itself.
 *
 * ── TWO BUGS, AND THE SECOND ONE IS WHY THE FIRST FIX WAS NOT ENOUGH ─────
 * The first was ownership: `build-full-sequences` filed each new sequence under
 * whatever owner the pointed-at sequence had, rather than the cycle it was
 * building for. The version-history panel selects on
 * `owner_type = 'school_cycle' AND owner_id = <cycle>`, so a cohort could run
 * 325 entries while its history said nothing had ever been built.
 *
 * The second is SHARING, and it is the one that matters. Two cycles can point
 * at the SAME sequence row. Reassigning ownership then just moves the problem:
 * whichever cycle does not own it still runs a sequence missing from its
 * history, and worse, the two cohorts are permanently coupled — editing one
 * cycle's sequence in the admin panel silently edits the other's, because there
 * is only one row and one set of entries.
 *
 * So ownership alone is not the fix. Each cycle needs its own row.
 *
 * ── WHAT IT DOES ─────────────────────────────────────────────────────────
 *   1. Finds cycles sharing an active sequence. For every cycle after the first
 *      claimant, it clones the sequence — a new row owned by that cycle, at
 *      that cycle's next version, with every entry copied verbatim including
 *      position, weight and session scope — and repoints the cycle at the
 *      clone. The composition is identical, so nothing a student experiences
 *      changes; the cohorts simply stop being the same object.
 *   2. Reassigns ownership of any remaining active sequence to the cycle that
 *      runs it.
 *   3. Verifies, and rolls back unless every cycle owns exactly the sequence it
 *      runs and no sequence is shared.
 *
 * Superseded sequences keep their existing ownership. They are history, and
 * rewriting who owned something in the past to tidy a list is the opposite of
 * an audit trail — so a cycle that used to share another's sequence has a
 * history that starts where its own rows start. That is accurate.
 *
 * Idempotent: run it twice and the second run reports nothing to do.
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

async function survey() {
  return rows(sql`
    SELECT c."id"                           AS cycle_id,
           i."name"                         AS institution,
           c."active_heuristic_sequence_id" AS sequence_id,
           q."owner_type"                   AS owner_type,
           q."owner_id"                     AS owner_id,
           q."version_number"               AS version_number,
           (SELECT count(*) FROM "wing"."heuristic_sequence_entries" e
             WHERE e."sequence_id" = q."id")                      AS entries,
           (SELECT count(*) FROM "wing"."school_cycles" o
             WHERE o."active_heuristic_sequence_id" = q."id")     AS cycles_sharing,
           (SELECT count(*) FROM "wing"."heuristic_sequences" h
             WHERE h."owner_type" = 'school_cycle'
               AND h."owner_id" = c."id")                         AS owned_by_cycle
      FROM "wing"."school_cycles" c
      JOIN "wing"."institutions" i ON i."id" = c."institution_id"
      LEFT JOIN "wing"."heuristic_sequences" q ON q."id" = c."active_heuristic_sequence_id"
     ORDER BY c."id"
  `);
}

async function main() {
  ({ db, pool } = await startScript());

  heading("Every cycle, the sequence it runs, and who owns it");

  const before = await survey();

  type Problem = { cycleId: number; sequenceId: number; name: string; shared: boolean };
  const problems: Problem[] = [];

  for (const cy of before) {
    const cycleId = n(cy.cycle_id);
    const seqId = cy.sequence_id === null ? null : n(cy.sequence_id);
    const misowned =
      seqId !== null && (String(cy.owner_type) !== "school_cycle" || n(cy.owner_id) !== cycleId);
    const shared = seqId !== null && n(cy.cycles_sharing) > 1;

    const flags = [
      shared ? `\x1b[31mshared with ${n(cy.cycles_sharing) - 1} other cycle(s)\x1b[0m` : "",
      misowned ? `\x1b[31mowned by ${s(cy.owner_type)}/${s(cy.owner_id)}\x1b[0m` : "",
    ].filter(Boolean);

    console.log(
      `  cycle ${String(cycleId).padEnd(3)} ${s(cy.institution).slice(0, 34).padEnd(36)} ` +
        (seqId === null
          ? "no sequence"
          : `sequence ${String(seqId).padEnd(4)} v${String(s(cy.version_number)).padEnd(3)} ` +
            `${String(n(cy.entries)).padStart(4)} entries  history ${String(n(cy.owned_by_cycle)).padStart(2)}`) +
        (flags.length ? `  ✗ ${flags.join(" · ")}` : seqId === null ? "" : "  ✓"),
    );

    if (seqId !== null && (misowned || shared)) {
      problems.push({ cycleId, sequenceId: seqId, name: s(cy.institution), shared });
    }
  }

  if (!problems.length) {
    console.log("\n  ✓ every cycle owns exactly the sequence it runs, and none is shared.\n");
    await pool.end();
    return;
  }

  heading(FIX ? "Correcting" : "Would correct");

  if (!FIX) {
    for (const p of problems) {
      console.log(
        `  cycle ${p.cycleId} (${p.name}): ` +
          (p.shared
            ? `sequence ${p.sequenceId} is shared — clone it and repoint this cycle`
            : `re-own sequence ${p.sequenceId} to school_cycle/${p.cycleId}`),
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
    /* ── 1 · split every shared sequence ────────────────────────────────── */

    const sharedSequences = new Map<number, number[]>();
    for (const cy of before) {
      const seqId = cy.sequence_id === null ? null : n(cy.sequence_id);
      if (seqId === null || n(cy.cycles_sharing) <= 1) continue;
      (sharedSequences.get(seqId) ?? sharedSequences.set(seqId, []).get(seqId)!).push(n(cy.cycle_id));
    }

    for (const [seqId, cycleIds] of Array.from(sharedSequences.entries())) {
      /*
       * The first claimant keeps the original row. Which one is "first" does
       * not matter for behaviour — the compositions are identical — so cycle id
       * order is used simply because it is stable between runs.
       */
      const [keeps, ...clones] = cycleIds.slice().sort((a, b) => a - b);
      console.log(`  sequence ${seqId} is shared by cycles ${cycleIds.join(", ")}`);
      console.log(`    cycle ${keeps} keeps the original row`);

      for (const cycleId of clones) {
        const [{ next }] = await tx
          .select({
            next: sql<number>`COALESCE(MAX(${heuristicSequences.versionNumber}), 0) + 1`,
          })
          .from(heuristicSequences)
          .where(
            sql`${heuristicSequences.ownerType} = 'school_cycle'
                AND ${heuristicSequences.ownerId} = ${cycleId}`,
          );

        const [clone] = await tx
          .insert(heuristicSequences)
          .values({
            ownerType: "school_cycle" as never,
            ownerId: cycleId,
            versionNumber: Number(next),
            activeFrom: new Date(),
          })
          .returning({ id: heuristicSequences.id });

        // Copied in one statement so the clone is exact by construction —
        // position, weight and session scope included — rather than exact
        // because a mapping in this file got every field right.
        await tx.execute(sql`
          INSERT INTO "wing"."heuristic_sequence_entries"
            ("sequence_id", "heuristic_id", "position", "weight", "applies_to_session")
          SELECT ${clone.id}, "heuristic_id", "position", "weight", "applies_to_session"
            FROM "wing"."heuristic_sequence_entries"
           WHERE "sequence_id" = ${seqId}
        `);

        await tx
          .update(schoolCycles)
          .set({ activeHeuristicSequenceId: clone.id })
          .where(eq(schoolCycles.id, cycleId));

        const [{ copied }] = await tx
          .select({ copied: sql<number>`count(*)` })
          .from(sql`"wing"."heuristic_sequence_entries"`)
          .where(sql`"sequence_id" = ${clone.id}`);

        console.log(
          `    cycle ${cycleId} → sequence ${clone.id} v${Number(next)}, ` +
            `${Number(copied)} entries copied`,
        );
      }
    }

    /* ── 2 · re-own whatever is still filed under the wrong cycle ───────── */

    const after = await survey();
    for (const cy of after) {
      const cycleId = n(cy.cycle_id);
      const seqId = cy.sequence_id === null ? null : n(cy.sequence_id);
      if (seqId === null) continue;
      if (String(cy.owner_type) === "school_cycle" && n(cy.owner_id) === cycleId) continue;

      const [{ taken }] = await tx
        .select({ taken: sql<number>`count(*)` })
        .from(heuristicSequences)
        .where(
          sql`${heuristicSequences.ownerType} = 'school_cycle'
              AND ${heuristicSequences.ownerId} = ${cycleId}
              AND ${heuristicSequences.versionNumber} = ${n(cy.version_number)}
              AND ${heuristicSequences.id} <> ${seqId}`,
        );

      let version = n(cy.version_number);
      if (Number(taken) > 0) {
        const [{ next }] = await tx
          .select({
            next: sql<number>`COALESCE(MAX(${heuristicSequences.versionNumber}), 0) + 1`,
          })
          .from(heuristicSequences)
          .where(
            sql`${heuristicSequences.ownerType} = 'school_cycle'
                AND ${heuristicSequences.ownerId} = ${cycleId}`,
          );
        version = Number(next);
      }

      await tx
        .update(heuristicSequences)
        .set({ ownerType: "school_cycle" as never, ownerId: cycleId, versionNumber: version })
        .where(eq(heuristicSequences.id, seqId));

      console.log(
        `  ✓ sequence ${seqId} → school_cycle/${cycleId}` +
          (version !== n(cy.version_number) ? `, renumbered v${n(cy.version_number)} → v${version}` : "") +
          `  (${s(cy.institution)})`,
      );
    }

    /* ── 3 · verify, or roll the whole thing back ───────────────────────── */

    const final = await survey();
    const stillWrong = final.filter((cy) => {
      const seqId = cy.sequence_id === null ? null : n(cy.sequence_id);
      if (seqId === null) return false;
      return (
        String(cy.owner_type) !== "school_cycle" ||
        n(cy.owner_id) !== n(cy.cycle_id) ||
        n(cy.cycles_sharing) > 1
      );
    });
    if (stillWrong.length) {
      throw new Error(
        `${stillWrong.length} cycle(s) still misfiled or sharing after the repair — rolling back. ` +
          stillWrong.map((c) => `cycle ${n(c.cycle_id)}`).join(", "),
      );
    }

    const emptied = final.filter(
      (cy) => cy.sequence_id !== null && n(cy.entries) === 0,
    );
    if (emptied.length) {
      throw new Error(
        `${emptied.length} cycle(s) ended up running an empty sequence — rolling back. ` +
          "A repair that changes what a cohort runs is worse than the bug it fixes.",
      );
    }
  });

  heading("Verifying");

  for (const cy of await survey()) {
    console.log(
      `  cycle ${String(n(cy.cycle_id)).padEnd(3)} ${s(cy.institution).slice(0, 34).padEnd(36)} ` +
        `sequence ${String(s(cy.sequence_id)).padEnd(4)} v${String(s(cy.version_number)).padEnd(3)} ` +
        `${String(n(cy.entries)).padStart(4)} entries  history ${String(n(cy.owned_by_cycle)).padStart(2)}  ` +
        `shared by ${n(cy.cycles_sharing)}  ✓`,
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

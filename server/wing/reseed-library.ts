import "dotenv/config";
import { writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { type ScriptDb } from "../script-init";
import { startScript } from "./script-start";
import { collectLibrary } from "./collect-library";
import { interventionTypes, missingTypes } from "./seed-preflight";
import {
  discoverReferences,
  purgeAndReseed,
  undeclaredTables,
  type ManifestCycle,
} from "./reseed-purge";

/**
 * `npm run wing:reseed-library`
 *
 * Reports what a full library rebuild would delete and insert, and captures
 * everything needed to put the sequences back. **Writes nothing.**
 *
 * ── WHY THIS HALF EXISTS ON ITS OWN ──────────────────────────────────────
 * The rebuild Danielle's email leads to is a clean slate: drop the card library
 * and seed it again from the documents. On stage that is a reasonable thing to
 * want, and it is what Aditya has authorised. It is also irreversible, it takes
 * three tables of student data with it because the foreign keys give it no
 * choice, and it mints new card ids — which breaks every sequence entry and
 * every cycle pointer that named the old ones.
 *
 * None of that is a reason not to do it. It is a reason not to do it blind. So
 * this run answers three questions first, against the real database:
 *
 *   1. Is the methodology completely sourced?  Refuses if any expected element
 *      has no document behind it, because a purge followed by an incomplete
 *      seed is strictly worse than the library we have.
 *   2. Can the rows even be stored?  Checks `heuristic_intervention_type` for
 *      every value the corpus declares and prints the ALTER TYPE if not. A seed
 *      that dies halfway through leaves a purged library and no cards.
 *   3. What exactly would be lost, and what puts it back?  Counts every
 *      referencing row and writes a restore manifest naming each cycle's
 *      sequence BY CARD CODE — not by id, because ids are the one thing a
 *      rebuild does not preserve.
 *
 * ── THE MANIFEST IS THE POINT ────────────────────────────────────────────
 * `library-restore-manifest.json` records, per cycle: the institution, the
 * pointer, the sequence version, and the ordered card codes with their weights
 * and session scoping. After the rebuild, the sequence is recomposed from those
 * codes against the new ids and each cycle is repointed. That turns "seed and
 * hope" into a restore with something to check it against — and if a code in the
 * manifest no longer exists in the new library, that is a finding printed loudly
 * rather than a sequence that is quietly one card shorter.
 *
 * Read-only. Moves no pointer, deletes nothing, inserts nothing.
 */

const MANIFEST = "library-restore-manifest.json";

/*
 * Three independent things must be true before a row is deleted, and they are
 * deliberately awkward. --purge says what you want, the long flag says you know
 * what it costs, and --confirm is given only after the plan has been printed
 * with the database's own name on it. A single flag would be one shell-history
 * arrow-up away from destroying the wrong environment.
 */
const PURGE = process.argv.includes("--purge");
const ACKNOWLEDGED = process.argv.includes("--i-understand-this-deletes-student-data");
const CONFIRM = process.argv.includes("--confirm");

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

  /* ── 1 · is the methodology completely sourced? ────────────────────────── */

  heading("Preflight · sources");

  const library = collectLibrary();

  console.log(`  ${library.elements.length} rows would be seeded`);
  for (const [source, codes] of Array.from(library.bySource.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    console.log(`    ${source.padEnd(30)} ${String(codes.length).padStart(4)}`);
  }

  if (library.unsourced.length) {
    console.log(
      `\n  \x1b[33m${library.unsourced.length} element(s) the registry expects have no ` +
        `document: ${library.unsourced.join(", ")}\x1b[0m`,
    );
    console.log(
      "  These are the safety gates whose text is only in Wing_Safety_Architecture.md.\n" +
        "  They will be MISSING from the rebuilt library until that document arrives.",
    );
  }
  if (library.surplus.length) {
    console.log(`  Seeded but never named by Doc 2's registry: ${library.surplus.join(", ")}`);
  }
  if (library.descriptionFromName.length) {
    console.log(
      `  ${library.descriptionFromName.length} rows reuse their name as the description ` +
        `(the source states none).`,
    );
  }
  for (const t of library.normalisedTypes) {
    console.log(`  intervention_type normalised: ${t.cardCode} "${t.from}" → ${t.to}`);
  }

  /* ── 2 · can the rows be stored? ───────────────────────────────────────── */

  heading("Preflight · enum");

  const declared = Array.from(
    new Set(library.elements.map((e) => e.seed.interventionType).filter(Boolean) as string[]),
  ).sort();
  const have = await interventionTypes(pool);
  const missing = missingTypes(have, declared);

  console.log(`  declared by the corpus: ${declared.join(", ")}`);
  if (missing.length) {
    console.log(`\n  \x1b[31m✗ heuristic_intervention_type is missing: ${missing.join(", ")}\x1b[0m`);
    console.log("  Apply migration 0049, or run:");
    for (const t of missing) {
      console.log(
        `    ALTER TYPE "wing"."heuristic_intervention_type" ADD VALUE IF NOT EXISTS '${t}';`,
      );
    }
  } else {
    console.log("  ✓ every declared value exists");
  }

  /* ── 3 · what is there now ─────────────────────────────────────────────── */

  heading("What the purge would delete");

  const counts = await rows(sql`
    SELECT
      (SELECT count(*) FROM "wing"."heuristics")                                AS heuristics,
      (SELECT count(*) FROM "wing"."heuristic_components")                      AS components,
      (SELECT count(*) FROM "wing"."heuristic_sequence_entries")                AS sequence_entries,
      (SELECT count(*) FROM "wing"."heuristic_sequences")                       AS sequences,
      (SELECT count(*) FROM "wing"."user_heuristic_applications")               AS applications,
      (SELECT count(*) FROM "wing"."user_heuristic_scores")                     AS scores,
      (SELECT count(*) FROM "wing"."transcript_turns"
        WHERE "active_heuristic_id" IS NOT NULL)                                AS turns_naming_a_card,
      (SELECT count(*) FROM "wing"."gate_audit_findings")                       AS findings,
      (SELECT count(*) FROM "wing"."gate_audit_findings"
        WHERE "status" <> 'pending_review')                                     AS findings_reviewed
  `);
  const c = counts[0] ?? {};
  for (const [label, key] of [
    ["heuristics", "heuristics"],
    ["heuristic_components", "components"],
    ["heuristic_sequence_entries", "sequence_entries"],
    ["user_heuristic_applications", "applications"],
    ["user_heuristic_scores", "scores"],
    ["transcript_turns.active_heuristic_id", "turns_naming_a_card"],
  ] as const) {
    console.log(`  ${label.padEnd(38)} ${String(n(c[key])).padStart(7)}`);
  }
  console.log(
    `  ${"heuristic_sequences (kept, re-entried)".padEnd(38)} ${String(n(c.sequences)).padStart(7)}`,
  );
  console.log(
    `  ${"gate_audit_findings (PRESERVED)".padEnd(38)} ${String(n(c.findings)).padStart(7)}` +
      (n(c.findings_reviewed) > 0 ? `   ${n(c.findings_reviewed)} already reviewed` : ""),
  );

  const found = await discoverReferences(db);
  const undeclared = undeclaredTables(found);
  console.log(
    `\n  ${found.length} table(s) reference the card tables, per pg_constraint:\n` +
      `  ${found.join(", ")}`,
  );
  if (undeclared.length) {
    console.log(
      `\n  \x1b[31m\u2717 no disposition declared for: ${undeclared.join(", ")}\x1b[0m\n` +
        "  The run is blocked. Add each to REFERENCING_TABLES in reseed-purge.ts.",
    );
  }

  const studentData = n(c.applications) + n(c.scores) + n(c.turns_naming_a_card);
  if (studentData > 0) {
    console.log(
      `\n  \x1b[33m${studentData} rows of student data reference a card. A hard delete takes ` +
        `them with it:\x1b[0m\n` +
        "  which card fired, for whom, on which turn, and how it performed. On stage that is\n" +
        "  test-user history. Confirm that is what you mean before the destructive run.",
    );
  }

  /* ── 4 · the library as it stands, against the documents ───────────────── */

  heading("The library now, against the documents");

  const existing = await rows(sql`
    SELECT "card_code" AS code, "status" AS status, "card_kind" AS kind
      FROM "wing"."heuristics"
     ORDER BY "card_code"
  `);
  const existingCodes = new Set(existing.map((r) => String(r.code)));
  const seedCodes = new Set(library.elements.map((e) => e.seed.cardCode));

  const added = Array.from(seedCodes).filter((x) => !existingCodes.has(x));
  const dropped = Array.from(existingCodes).filter((x) => !seedCodes.has(x));
  const kept = Array.from(seedCodes).filter((x) => existingCodes.has(x));

  console.log(`  in the database now      ${String(existing.length).padStart(4)}`);
  console.log(`  would be seeded          ${String(library.elements.length).padStart(4)}`);
  console.log(`  same code, re-created    ${String(kept.length).padStart(4)}`);
  console.log(`  new to the library       ${String(added.length).padStart(4)}`);
  console.log(`  in the database, not in the documents  ${String(dropped.length).padStart(4)}`);
  if (dropped.length) {
    console.log(
      "\n  These exist today and no document supplies them. A hard purge removes them\n" +
        "  permanently — check none is a card someone authored by hand in the panel:",
    );
    console.log(`    ${dropped.sort().join(", ")}`);
  }

  /* ── 5 · the restore manifest ──────────────────────────────────────────── */

  heading("Sequences and pointers · captured for restore");

  const cycles = await rows(sql`
    SELECT c."id"                            AS cycle_id,
           i."name"                          AS institution,
           c."label"                         AS label,
           c."cycle_year"                    AS cycle_year,
           c."status"                        AS status,
           c."active_heuristic_sequence_id"  AS sequence_id,
           q."version_number"                AS version_number,
           q."superseded_at"                 AS superseded_at,
           (SELECT count(*) FROM "wing"."students" st WHERE st."cycle_id" = c."id") AS students
      FROM "wing"."school_cycles" c
      JOIN "wing"."institutions" i ON i."id" = c."institution_id"
      LEFT JOIN "wing"."heuristic_sequences" q ON q."id" = c."active_heuristic_sequence_id"
     ORDER BY i."name", c."cycle_year", c."id"
  `);

  const manifest: Record<string, unknown> = {
    capturedAt: new Date().toISOString(),
    note:
      "Composition is recorded BY CARD CODE, not by heuristic id. A rebuild mints new ids, " +
      "so codes are the only thing that survives it.",
    cycles: [] as unknown[],
  };

  if (!cycles.length) console.log("  no cycles");

  for (const cy of cycles) {
    const seqId = cy.sequence_id === null ? null : n(cy.sequence_id);
    const name = `${s(cy.institution)}${cy.label ? ` / ${s(cy.label)}` : ""} ${s(cy.cycle_year)}`;

    let entries: Row[] = [];
    if (seqId !== null) {
      entries = await rows(sql`
        SELECT h."card_code"          AS code,
               e."position"           AS position,
               e."weight"             AS weight,
               e."applies_to_session" AS applies_to_session
          FROM "wing"."heuristic_sequence_entries" e
          JOIN "wing"."heuristics" h ON h."id" = e."heuristic_id"
         WHERE e."sequence_id" = ${seqId}
         ORDER BY e."position"
      `);
    }

    console.log(
      `  cycle ${String(n(cy.cycle_id)).padEnd(4)} ${name.padEnd(36)} ` +
        `students ${String(n(cy.students)).padStart(4)}  ` +
        (seqId === null
          ? "\x1b[33mNO SEQUENCE\x1b[0m"
          : `sequence ${seqId} v${s(cy.version_number)}  ${entries.length} entries`) +
        (cy.superseded_at !== null && seqId !== null ? "  \x1b[31m✗ SUPERSEDED\x1b[0m" : ""),
    );

    // A pointer at a code no document supplies cannot be restored, and that has
    // to be known before the delete rather than discovered after it.
    const unrestorable = entries
      .map((e) => String(e.code))
      .filter((code) => !seedCodes.has(code));
    if (unrestorable.length) {
      console.log(
        `       \x1b[31m✗ ${unrestorable.length} entr${unrestorable.length === 1 ? "y" : "ies"} ` +
          `name a card the documents do not supply — the restored sequence would be ` +
          `short:\x1b[0m\n       ${unrestorable.join(", ")}`,
      );
    }

    (manifest.cycles as unknown[]).push({
      cycleId: n(cy.cycle_id),
      institution: s(cy.institution),
      label: cy.label === null ? null : s(cy.label),
      cycleYear: cy.cycle_year === null ? null : n(cy.cycle_year),
      status: s(cy.status),
      sequenceId: seqId,
      versionNumber: cy.version_number === null ? null : n(cy.version_number),
      supersededAt: cy.superseded_at === null ? null : s(cy.superseded_at),
      students: n(cy.students),
      entries: entries.map((e) => ({
        cardCode: String(e.code),
        position: n(e.position),
        weight: e.weight === null ? null : Number(e.weight),
        appliesToSession: e.applies_to_session === null ? null : String(e.applies_to_session),
      })),
      unrestorable,
    });
  }

  const liveSequenceIds = new Set(
    cycles.map((cy) => cy.sequence_id).filter((x) => x !== null).map((x) => n(x)),
  );
  const totalLiveEntries = Array.from(liveSequenceIds).reduce((sum, id) => {
    const cy = (manifest.cycles as Array<{ sequenceId: number | null; entries: unknown[] }>).find(
      (x) => x.sequenceId === id,
    );
    return sum + (cy ? cy.entries.length : 0);
  }, 0);

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n  Restore manifest written to ${MANIFEST}`);

  /* ── 6 · verdict ───────────────────────────────────────────────────────── */

  heading("Verdict");

  const blockers: string[] = [];
  if (missing.length) blockers.push(`heuristic_intervention_type is missing ${missing.join(", ")}`);
  if (undeclared.length) {
    blockers.push(`no disposition declared for ${undeclared.join(", ")}`);
  }
  if (library.elements.length === 0) blockers.push("the collector produced no rows");

  if (blockers.length) {
    for (const b of blockers) console.log(`  \x1b[31m✗ ${b}\x1b[0m`);
    console.log("\n  The destructive run is blocked until these are fixed.\n");
    await pool.end();
    process.exit(1);
  }

  console.log("  ✓ sources complete, enum ready, manifest captured.");

  if (!PURGE) {
    console.log(
      "\n  Nothing has been changed. Send this output back before the destructive run —\n" +
        "  the numbers above are what it will do.\n",
    );
    await pool.end();
    return;
  }

  /* ── 7 · the destructive path ──────────────────────────────────────────── */

  heading("Destructive run");

  if (!ACKNOWLEDGED) {
    console.log(
      "  \x1b[31m✗ --purge given without --i-understand-this-deletes-student-data\x1b[0m\n" +
        `  This run would delete ${studentData} row(s) of student data permanently:\n` +
        "  which card fired, for whom, on which turn, and how it performed. There is no\n" +
        "  Trash and no undo. Add the flag if that is what you mean.\n",
    );
    await pool.end();
    process.exit(1);
  }

  const where = await rows(sql`
    SELECT current_database() AS db,
           current_user       AS usr,
           inet_server_addr()::text AS addr
  `);
  const w = where[0] ?? {};
  console.log(`  database   ${s(w.db)}`);
  console.log(`  user       ${s(w.usr)}`);
  console.log(`  server     ${s(w.addr)}`);
  console.log(`  students   ${cycles.reduce((t, cy) => t + n(cy.students), 0)} across ${cycles.length} cycle(s)`);

  console.log(
    `\n  Would delete  ${String(n(c.heuristics)).padStart(5)} cards, ` +
      `${n(c.components)} components, ${n(c.sequence_entries)} sequence entries,\n` +
      `                ${n(c.applications)} applications, ${n(c.scores)} scores, ` +
      `${n(c.turns_naming_a_card)} transcript turn references`,
  );
  console.log(`  Would insert  ${String(library.elements.length).padStart(5)} cards`);
  console.log(
    `  Would PRESERVE ${String(n(c.findings)).padStart(4)} gate audit finding(s), re-pointed ` +
      `by card code with their review status intact`,
  );
  console.log(
    `  Would rebuild ${String(liveSequenceIds.size).padStart(5)} ` +
      `live sequence(s) as new versions, and repoint the cycles that name them`,
  );
  console.log(
    `  Would NOT restore ${Math.max(0, n(c.sequence_entries) - totalLiveEntries)} entries ` +
      `belonging to sequences no cycle points at.`,
  );

  if (!CONFIRM) {
    console.log(
      "\n  \x1b[33mStopping here. Nothing has been changed.\x1b[0m\n" +
        "  Read the three lines above. If that is the right database, re-run with --confirm:\n\n" +
        "    npm run wing:reseed-library -- --purge " +
        "--i-understand-this-deletes-student-data --confirm\n",
    );
    await pool.end();
    return;
  }

  const done = await purgeAndReseed(
    db,
    library.elements,
    manifest.cycles as ManifestCycle[],
    (line) => console.log(line),
  );

  heading("Done");
  console.log(`  cards        ${done.cardsDeleted} deleted → ${done.cardsInserted} inserted`);
  console.log(`  components   ${done.componentsDeleted} deleted → ${done.componentsInserted} inserted`);
  console.log(`  sequences    ${done.sequencesCreated} new version(s), ${done.entriesRestored} entries restored`);
  console.log(`  cycles       ${done.cyclesRepointed} repointed`);
  console.log(
    `  student data ${done.applicationsDeleted} applications, ${done.scoresDeleted} scores ` +
      `deleted; ${done.turnsCleared} transcript turns cleared`,
  );
  console.log(
    `  findings     ${done.findingsPreserved} preserved with review status` +
      (done.findingsDropped.length
        ? `, ${done.findingsDropped.length} dropped (card gone: ` +
          `${Array.from(new Set(done.findingsDropped)).join(", ")})`
        : "") +
      "\n",
  );

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

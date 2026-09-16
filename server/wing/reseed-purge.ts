import { eq, inArray, sql } from "drizzle-orm";
import {
  heuristicComponents,
  heuristicSequenceEntries,
  heuristicSequences,
  heuristics,
  schoolCycles,
  transcriptTurns,
  userHeuristicApplications,
  userHeuristicScores,
} from "@shared/wing-schema";
import { seedRows } from "./seed-shared";
import type { LibraryElement } from "./collect-library";

/**
 * The destructive half of `wing:reseed-library`.
 *
 * ── THE MISTAKE THIS VERSION EXISTS TO NOT REPEAT ────────────────────────
 * The first attempt enumerated the tables referencing a card from the comment
 * at the top of reset-cards.ts, which names five. There are six:
 * `gate_audit_findings` arrived in migration 0021, after that comment was
 * written, and the run died on its foreign key. It died safely — one
 * transaction, nothing committed — but it died on a fact the database knew and
 * the script had taken on faith from prose.
 *
 * So this version does not hold a list. It asks `pg_constraint` which tables
 * reference `heuristics` and `heuristic_components`, and refuses to touch
 * anything if even one of them has no declared disposition below. A table added
 * by a future migration now stops the run instead of being discovered by a
 * rollback — and a table someone deliberately wired to cards is never silently
 * emptied because the script did not know about it.
 *
 * ── WHAT HAPPENS TO EACH REFERENCING TABLE, AND WHY ──────────────────────
 *   heuristic_components         delete · child rows, re-created from source
 *   heuristic_sequence_entries   delete · rebuilt from the restore manifest
 *   transcript_turns             null   · the turn survives, its card pointer
 *                                         does not; nulling keeps the transcript
 *   user_heuristic_applications  delete · which card fired, for whom
 *   user_heuristic_scores        delete · how that card performed
 *   gate_audit_findings          PRESERVE · captured, deleted, and re-inserted
 *                                         against the new ids by card_code
 *
 * That last one is the reason the failure was worth having. The table carries
 * `card_code` denormalised with the schema's own note — "it survives a rename" —
 * and a `status` the schema calls Danielle's review state, where "a rejected
 * finding means the PATTERN is too broad". Those rows are her work reviewing
 * what the gates caught, not machine exhaust, and a rebuild of the card library
 * is exactly the rename that column was put there to survive. Deleting them
 * because a foreign key pointed the wrong way would have thrown away the review
 * queue to reseed the thing being reviewed.
 *
 * A finding whose card_code no longer exists in the new library cannot be
 * re-pointed. Those are reported by code and dropped, never guessed at.
 *
 * ── WHY ONE TRANSACTION ──────────────────────────────────────────────────
 * A purge that succeeds followed by a seed that dies on row 200 leaves no card
 * library, no sequences, and four cycles pointing at nothing. Postgres will not
 * let that be the end state if the whole thing is one transaction, so it is.
 *
 * ── WHY THE SEQUENCES COME BACK AS NEW VERSIONS ──────────────────────────
 * Rewriting entries onto the published sequence rows would leave sequence 18 v8
 * holding different cards before and after with nothing recording it. So: a new
 * version per live sequence, the old one superseded, the pointers moved.
 * Replacement is keyed on the OLD sequence id rather than on the cycle, so the
 * two cycles that share sequence 18 share its replacement.
 *
 * ── WHY IT RESTORES BY CARD CODE ─────────────────────────────────────────
 * Ids do not survive a rebuild. Codes do. A code that does not resolve is a hard
 * error rather than a sequence that is quietly one card shorter.
 */

/* ── Referencing tables and what happens to them ─────────────────────────── */

export type Disposition = "delete" | "null" | "preserve";

/**
 * Declared, and checked against the catalog before anything is touched.
 *
 * Keyed by table name. A table `pg_constraint` reports that is missing from here
 * aborts the run — which is the whole point: the next migration to wire a table
 * to `heuristics` gets a loud refusal rather than a rollback at the foreign key.
 */
export const REFERENCING_TABLES: Readonly<Record<string, Disposition>> = {
  heuristic_components: "delete",
  heuristic_sequence_entries: "delete",
  transcript_turns: "null",
  user_heuristic_applications: "delete",
  user_heuristic_scores: "delete",
  gate_audit_findings: "preserve",
};

/** Every table with a foreign key onto the card tables, from the catalog. */
export async function discoverReferences(db: any): Promise<string[]> {
  const res = await db.execute(sql`
    SELECT DISTINCT src.relname AS table_name
      FROM pg_constraint con
      JOIN pg_class     src ON src.oid = con.conrelid
      JOIN pg_class     tgt ON tgt.oid = con.confrelid
      JOIN pg_namespace n   ON n.oid   = tgt.relnamespace
     WHERE con.contype = 'f'
       AND n.nspname = 'wing'
       AND tgt.relname IN ('heuristics', 'heuristic_components')
     ORDER BY 1
  `);
  return ((res as any).rows ?? [])
    .map((r: any) => String(r.table_name))
    // heuristic_components references itself for version lineage; it is not a
    // separate dependant and is already handled as a child.
    .filter((t: string) => t !== "heuristic_components" || true);
}

/** Tables the catalog reports that this script has no instruction for. */
export function undeclaredTables(found: readonly string[]): string[] {
  return found.filter((t) => !(t in REFERENCING_TABLES));
}

/* ── Drift detection ─────────────────────────────────────────────────────── */

export type ManifestEntry = {
  cardCode: string;
  position: number;
  weight: number | null;
  appliesToSession: string | null;
};

export type ManifestCycle = {
  cycleId: number;
  institution: string;
  sequenceId: number | null;
  versionNumber: number | null;
  entries: ManifestEntry[];
};

/** A stable shape for comparing two captures. Order-insensitive within a cycle. */
export function fingerprint(cycles: ManifestCycle[]): string {
  return JSON.stringify(
    cycles
      .map((c) => ({
        cycleId: c.cycleId,
        sequenceId: c.sequenceId,
        entries: c.entries
          .map((e) => `${e.cardCode}@${e.position}`)
          .slice()
          .sort(),
      }))
      .sort((a, b) => a.cycleId - b.cycleId),
  );
}

/* ── The run ─────────────────────────────────────────────────────────────── */

export type PurgeCounts = {
  turnsCleared: number;
  scoresDeleted: number;
  applicationsDeleted: number;
  entriesDeleted: number;
  componentsDeleted: number;
  cardsDeleted: number;
  cardsInserted: number;
  componentsInserted: number;
  sequencesCreated: number;
  entriesRestored: number;
  cyclesRepointed: number;
  findingsPreserved: number;
  findingsDropped: string[];
};

export async function purgeAndReseed(
  db: any,
  elements: LibraryElement[],
  manifest: ManifestCycle[],
  log: (line: string) => void,
): Promise<PurgeCounts> {
  const counts: PurgeCounts = {
    turnsCleared: 0,
    scoresDeleted: 0,
    applicationsDeleted: 0,
    entriesDeleted: 0,
    componentsDeleted: 0,
    cardsDeleted: 0,
    cardsInserted: 0,
    componentsInserted: 0,
    sequencesCreated: 0,
    entriesRestored: 0,
    cyclesRepointed: 0,
    findingsPreserved: 0,
    findingsDropped: [],
  };

  await db.transaction(async (tx: any) => {
    /* ── 1 · does the script know about every dependant? ─────────────────── */

    const found = await discoverReferences(tx);
    const undeclared = undeclaredTables(found);
    if (undeclared.length) {
      throw new Error(
        `${undeclared.length} table(s) reference the card tables and this script has no ` +
          `instruction for them: ${undeclared.join(", ")}. Add a disposition to ` +
          `REFERENCING_TABLES — delete, null or preserve — and say why. Nothing has been ` +
          `deleted.`,
      );
    }
    log(`  ✓ ${found.length} referencing table(s), all declared: ${found.join(", ")}`);

    /* ── 2 · has anything moved since the report? ────────────────────────── */

    const fresh = await captureCycles(tx);
    if (fingerprint(fresh) !== fingerprint(manifest)) {
      throw new Error(
        "The database has changed since the report was run — a cycle pointer or a sequence's " +
          "composition differs from library-restore-manifest.json. Re-run the report, read it, " +
          "and try again. Nothing has been deleted.",
      );
    }
    log("  ✓ database matches the approved manifest");

    /* ── 3 · take the review queue out of the way, keeping it ────────────── */

    const findings = ((await tx.execute(sql`
      SELECT "student_id", "session_id", "turn_id", "card_code", "mode",
             "matched", "excerpt", "status", "detected_at"
        FROM "wing"."gate_audit_findings"
       ORDER BY "id"
    `)) as any).rows ?? [];

    await tx.execute(sql`DELETE FROM "wing"."gate_audit_findings"`);
    log(`  ✓ captured ${findings.length} gate audit finding(s) to restore by card code`);

    /* ── 4 · delete, in the order the foreign keys require ───────────────── */

    const cleared = await tx
      .update(transcriptTurns)
      .set({ activeHeuristicId: null })
      .where(sql`${transcriptTurns.activeHeuristicId} IS NOT NULL`)
      .returning({ id: transcriptTurns.id });
    counts.turnsCleared = cleared.length;

    counts.scoresDeleted = (await tx.delete(userHeuristicScores).returning({
      heuristicId: userHeuristicScores.heuristicId,
    })).length;
    counts.applicationsDeleted = (await tx.delete(userHeuristicApplications).returning({
      id: userHeuristicApplications.id,
    })).length;
    counts.entriesDeleted = (await tx.delete(heuristicSequenceEntries).returning({
      id: heuristicSequenceEntries.id,
    })).length;
    counts.componentsDeleted = (await tx.delete(heuristicComponents).returning({
      id: heuristicComponents.id,
    })).length;
    counts.cardsDeleted = (await tx.delete(heuristics).returning({ id: heuristics.id })).length;

    log(
      `  ✓ deleted ${counts.cardsDeleted} cards, ${counts.componentsDeleted} components, ` +
        `${counts.entriesDeleted} sequence entries, ${counts.applicationsDeleted} applications, ` +
        `${counts.scoresDeleted} scores; cleared ${counts.turnsCleared} transcript turns`,
    );

    /* ── 5 · insert the library ──────────────────────────────────────────── */

    const idByCode = new Map<string, number>();

    for (const element of elements) {
      const rows = seedRows(element.seed);
      const [card] = await tx
        .insert(heuristics)
        .values({
          cardCode: rows.heuristic.cardCode,
          name: rows.heuristic.name,
          description: rows.heuristic.description,
          populationTags: rows.heuristic.populationTags,
          status: element.status as never,
          interventionType: rows.heuristic.interventionType as never,
          cardKind: rows.heuristic.cardKind as never,
        })
        .returning({ id: heuristics.id });

      idByCode.set(rows.heuristic.cardCode, card.id);
      counts.cardsInserted++;

      if (rows.components.length) {
        await tx.insert(heuristicComponents).values(
          rows.components.map((c) => ({
            heuristicId: card.id,
            componentType: c.componentType as never,
            content: c.content,
            isCurrent: true,
          })),
        );
        counts.componentsInserted += rows.components.length;
      }
    }

    log(`  ✓ inserted ${counts.cardsInserted} cards, ${counts.componentsInserted} components`);

    /* ── 6 · put the review queue back, against the new ids ──────────────── */

    for (const f of findings) {
      const code = String(f.card_code);
      const heuristicId = idByCode.get(code);
      if (heuristicId === undefined) {
        counts.findingsDropped.push(code);
        continue;
      }
      await tx.execute(sql`
        INSERT INTO "wing"."gate_audit_findings"
          ("student_id", "session_id", "turn_id", "heuristic_id", "card_code",
           "mode", "matched", "excerpt", "status", "detected_at")
        VALUES (${f.student_id}, ${f.session_id}, ${f.turn_id}, ${heuristicId}, ${code},
                ${f.mode}, ${f.matched}, ${f.excerpt}, ${f.status}, ${f.detected_at})
      `);
      counts.findingsPreserved++;
    }

    if (findings.length) {
      log(
        `  ✓ restored ${counts.findingsPreserved} finding(s) with their review status` +
          (counts.findingsDropped.length
            ? `; dropped ${counts.findingsDropped.length} whose card no longer exists ` +
              `(${Array.from(new Set(counts.findingsDropped)).join(", ")})`
            : ""),
      );
    }

    /* ── 7 · rebuild each live sequence as a new version ─────────────────── */

    const liveSequenceIds = Array.from(
      new Set(manifest.map((c) => c.sequenceId).filter((x): x is number => x !== null)),
    );

    /** old sequence id → new sequence id, so shared pointers stay shared. */
    const replacement = new Map<number, number>();

    for (const oldId of liveSequenceIds) {
      const [old] = await tx
        .select({
          ownerType: heuristicSequences.ownerType,
          ownerId: heuristicSequences.ownerId,
          versionNumber: heuristicSequences.versionNumber,
        })
        .from(heuristicSequences)
        .where(eq(heuristicSequences.id, oldId));

      if (!old) throw new Error(`sequence ${oldId} vanished between capture and rebuild`);

      const [created] = await tx
        .insert(heuristicSequences)
        .values({
          ownerType: old.ownerType,
          ownerId: old.ownerId,
          versionNumber: old.versionNumber + 1,
          activeFrom: new Date(),
        })
        .returning({ id: heuristicSequences.id });

      replacement.set(oldId, created.id);
      counts.sequencesCreated++;

      const source = manifest.find((c) => c.sequenceId === oldId)!;
      const missing = source.entries.filter((e) => !idByCode.has(e.cardCode));
      if (missing.length) {
        throw new Error(
          `sequence ${oldId} names ${missing.length} card(s) the new library does not contain: ` +
            missing.map((m) => m.cardCode).join(", ") +
            ". Nothing has been committed.",
        );
      }

      await tx.insert(heuristicSequenceEntries).values(
        source.entries.map((e) => ({
          sequenceId: created.id,
          heuristicId: idByCode.get(e.cardCode)!,
          position: e.position,
          weight: e.weight === null ? "1.0" : e.weight.toFixed(2),
          appliesToSession: (e.appliesToSession ?? null) as never,
        })),
      );
      counts.entriesRestored += source.entries.length;

      await tx
        .update(heuristicSequences)
        .set({ supersededAt: new Date() })
        .where(eq(heuristicSequences.id, oldId));

      log(
        `  ✓ sequence ${oldId} v${old.versionNumber} → ${created.id} ` +
          `v${old.versionNumber + 1}, ${source.entries.length} entries`,
      );
    }

    /* ── 8 · repoint every cycle that named a rebuilt sequence ───────────── */

    for (const [oldId, newId] of Array.from(replacement.entries())) {
      const moved = await tx
        .update(schoolCycles)
        .set({ activeHeuristicSequenceId: newId })
        .where(eq(schoolCycles.activeHeuristicSequenceId, oldId))
        .returning({ id: schoolCycles.id });
      counts.cyclesRepointed += moved.length;
      log(`  ✓ repointed ${moved.length} cycle(s) from sequence ${oldId} to ${newId}`);
    }

    /* ── 9 · verify before commit ────────────────────────────────────────── */

    if (counts.cardsInserted !== elements.length) {
      throw new Error(
        `expected to insert ${elements.length} cards, inserted ${counts.cardsInserted}`,
      );
    }

    const expectedEntries = liveSequenceIds.reduce(
      (sum, id) => sum + (manifest.find((c) => c.sequenceId === id)?.entries.length ?? 0),
      0,
    );
    if (counts.entriesRestored !== expectedEntries) {
      throw new Error(
        `expected to restore ${expectedEntries} sequence entries, restored ${counts.entriesRestored}`,
      );
    }

    if (counts.findingsPreserved + counts.findingsDropped.length !== findings.length) {
      throw new Error(
        `${findings.length} findings were captured but ${counts.findingsPreserved} restored and ` +
          `${counts.findingsDropped.length} dropped — one has gone missing`,
      );
    }

    if (liveSequenceIds.length) {
      const stranded = await tx
        .select({ id: schoolCycles.id })
        .from(schoolCycles)
        .where(inArray(schoolCycles.activeHeuristicSequenceId, liveSequenceIds));
      if (stranded.length) {
        throw new Error(
          `${stranded.length} cycle(s) still point at a superseded sequence after the repoint`,
        );
      }
    }

    log("  ✓ verified — committing");
  });

  return counts;
}

/** Reads every cycle and its active sequence's composition, by card code. */
export async function captureCycles(db: any): Promise<ManifestCycle[]> {
  const cycles = await db.execute(sql`
    SELECT c."id"                            AS cycle_id,
           i."name"                          AS institution,
           c."active_heuristic_sequence_id"  AS sequence_id,
           q."version_number"                AS version_number
      FROM "wing"."school_cycles" c
      JOIN "wing"."institutions" i ON i."id" = c."institution_id"
      LEFT JOIN "wing"."heuristic_sequences" q ON q."id" = c."active_heuristic_sequence_id"
     ORDER BY c."id"
  `);

  const out: ManifestCycle[] = [];
  for (const row of (cycles as any).rows ?? []) {
    const sequenceId = row.sequence_id === null ? null : Number(row.sequence_id);
    let entries: ManifestEntry[] = [];
    if (sequenceId !== null) {
      const res = await db.execute(sql`
        SELECT h."card_code"          AS code,
               e."position"           AS position,
               e."weight"             AS weight,
               e."applies_to_session" AS applies_to_session
          FROM "wing"."heuristic_sequence_entries" e
          JOIN "wing"."heuristics" h ON h."id" = e."heuristic_id"
         WHERE e."sequence_id" = ${sequenceId}
         ORDER BY e."position"
      `);
      entries = ((res as any).rows ?? []).map((e: any) => ({
        cardCode: String(e.code),
        position: Number(e.position),
        weight: e.weight === null ? null : Number(e.weight),
        appliesToSession: e.applies_to_session === null ? null : String(e.applies_to_session),
      }));
    }
    out.push({
      cycleId: Number(row.cycle_id),
      institution: String(row.institution),
      sequenceId,
      versionNumber: row.version_number === null ? null : Number(row.version_number),
      entries,
    });
  }
  return out;
}

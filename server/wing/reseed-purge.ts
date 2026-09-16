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
 * ── WHAT THIS DOES, IN ORDER, IN ONE TRANSACTION ─────────────────────────
 *   1. Re-reads the cycles and their sequence composition and compares it to
 *      the manifest the report wrote. A mismatch aborts: the plan the human
 *      approved was computed against a database that has since changed.
 *   2. Nulls `transcript_turns.active_heuristic_id`, then deletes the two
 *      user_heuristic_* tables, the sequence entries, the components and the
 *      cards. That order is the foreign keys' order, not a preference.
 *   3. Inserts every element the collector produced.
 *   4. Rebuilds each live sequence as a NEW version, supersedes the old one,
 *      and repoints every cycle that named it.
 *   5. Verifies, and throws — rolling everything back — if anything is short.
 *
 * ── WHY ONE TRANSACTION ──────────────────────────────────────────────────
 * The failure this exists to prevent is the interesting one: a purge that
 * succeeds followed by a seed that dies on row 200 leaves no card library at
 * all, no sequences, and four cycles pointing at nothing. Postgres will not let
 * that be the end state if the whole thing is one transaction, so it is.
 *
 * ── WHY THE SEQUENCES COME BACK AS NEW VERSIONS ──────────────────────────
 * Rewriting entries onto the published sequence rows would be faster and would
 * leave the pointers untouched, and it would also mean sequence 18 v8 contains
 * different cards before and after with nothing recording that. The versioning
 * convention exists for exactly this. So: a new version per live sequence, the
 * old one marked superseded, and the pointers moved. Two cycles share sequence
 * 18 today and they share its replacement — one new sequence, two pointers,
 * preserved by keying on the OLD sequence id rather than on the cycle.
 *
 * ── WHY IT RESTORES BY CARD CODE ─────────────────────────────────────────
 * Ids do not survive a rebuild. Codes do. Every entry is restored by looking
 * its code up in the newly inserted library, and a code that does not resolve
 * is a hard error rather than a sequence that is quietly one card shorter.
 */

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
  };

  await db.transaction(async (tx: any) => {
    /* ── 1 · has anything moved since the report? ────────────────────────── */

    const fresh = await captureCycles(tx);
    if (fingerprint(fresh) !== fingerprint(manifest)) {
      throw new Error(
        "The database has changed since the report was run — a cycle pointer or a sequence's " +
          "composition differs from library-restore-manifest.json. Re-run the report, read it, " +
          "and try again. Nothing has been deleted.",
      );
    }
    log("  ✓ database matches the approved manifest");

    /* ── 2 · delete, in the order the foreign keys require ───────────────── */

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

    /* ── 3 · insert the library ──────────────────────────────────────────── */

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

    /* ── 4 · rebuild each live sequence as a new version ─────────────────── */

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

      // Composition comes from whichever cycle captured this sequence; they are
      // identical by construction, because the capture read the sequence.
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

    /* ── 5 · repoint every cycle that named a rebuilt sequence ───────────── */

    for (const [oldId, newId] of Array.from(replacement.entries())) {
      const moved = await tx
        .update(schoolCycles)
        .set({ activeHeuristicSequenceId: newId })
        .where(eq(schoolCycles.activeHeuristicSequenceId, oldId))
        .returning({ id: schoolCycles.id });
      counts.cyclesRepointed += moved.length;
      log(`  ✓ repointed ${moved.length} cycle(s) from sequence ${oldId} to ${newId}`);
    }

    /* ── 6 · verify before commit ────────────────────────────────────────── */

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

    const stranded = await tx
      .select({ id: schoolCycles.id })
      .from(schoolCycles)
      .where(inArray(schoolCycles.activeHeuristicSequenceId, liveSequenceIds));
    if (stranded.length) {
      throw new Error(
        `${stranded.length} cycle(s) still point at a superseded sequence after the repoint`,
      );
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

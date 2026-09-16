import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import {
  heuristicSequenceEntries,
  heuristicSequences,
  schoolCycles,
} from "@shared/wing-schema";
import { type ScriptDb } from "../script-init";
import { startScript } from "./script-start";
import { collectLibrary } from "./collect-library";
import { moduleFromCode } from "./parse-compendium";
import { compareCardCodes } from "./card-annotations";
import { sessionScopeFor, unscopedCoaching, type ScopedEntry } from "./session-scope";
import {
  SEQUENCE_HARD_LIMIT,
  SEQUENCE_SOFT_LIMIT,
  detectorLoadBySession,
  peakDetectorLoad,
} from "./sequence-limits";

/**
 * `npm run wing:build-full-sequences`            report, writes nothing
 * `npm run wing:build-full-sequences -- --publish`   build and activate
 *
 * Puts every card in the library into every cycle's sequence, scoped to its own
 * module.
 *
 * ── WHY THIS COULD NOT BE DONE BEFORE MIGRATION 0050 ─────────────────────
 * `applies_to_session` is what keeps H-201, the Foundation 2 credibility test,
 * out of a Foundation 1 session, and it reuses `wing.session_type`. That enum
 * had ONE value — `module_run` — for every module from 4 to 13. With 105
 * coaching cards across those modules, scoping them all to it would have put
 * Module 9's power-dynamics cards and Module 10's interview cards in front of
 * the detector during a Module 4 career session, at a peak load of 105 against
 * a hard limit of 40. The limit would have refused the sequence, correctly.
 *
 * With a scope per module the peak is the largest single module — 22 — and the
 * question the limit is really asking ("how many near-neighbour signals is the
 * detector choosing between on one turn?") gets an answer the methodology can
 * defend.
 *
 * ── WHAT THIS DOES NOT DECIDE ────────────────────────────────────────────
 * Whether those modules should be reaching students at all. Doc 2 marks Modules
 * 6–11 "Later" and Module 13 "If time" in its own September 1 column, and this
 * script publishes them anyway on Aditya's instruction. It prints the
 * disagreement every run rather than letting the deployed set and the delivery
 * plan drift apart quietly, because the person who has to reconcile them is
 * Danielle and she should hear it from a number rather than from a student.
 *
 * ── WEIGHT ───────────────────────────────────────────────────────────────
 * 141 of the 325 state a sequence weight; 184 do not. The unstated ones are
 * written as 1.0, because the column is NOT NULL and 1.0 is the neutral value —
 * and the count is reported every run, because a weight is a precedence
 * decision and 184 of them are currently ours rather than the methodology's.
 *
 * Read-only unless `--publish`.
 */

const PUBLISH = process.argv.includes("--publish");

/** Modules Doc 2 §1 does not mark for the September 1 release. */
const DEFERRED_MODULES = new Set([
  "module_6", "module_7", "module_8", "module_9",
  "module_10", "module_11", "module_13",
]);

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

  /* ── 1 · the composition, from the documents ───────────────────────────── */

  heading("Composition");

  const library = collectLibrary();
  const weightByCode = new Map(library.elements.map((e) => [e.seed.cardCode, e.weight]));

  const live = await rows(sql`
    SELECT "id" AS id, "card_code" AS code, "card_kind" AS kind, "status" AS status
      FROM "wing"."heuristics"
     ORDER BY "card_code"
  `);

  const idByCode = new Map(live.map((r) => [String(r.code), n(r.id)]));
  const kindByCode = new Map(live.map((r) => [String(r.code), String(r.kind)]));

  const missing = library.elements
    .map((e) => e.seed.cardCode)
    .filter((c) => !idByCode.has(c));
  if (missing.length) {
    console.log(
      `  \x1b[31m✗ ${missing.length} card(s) the documents describe are not in the ` +
        `database: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? " …" : ""}\x1b[0m`,
    );
    console.log("  Run wing:reseed-library first. Nothing has been changed.");
    await pool.end();
    process.exit(1);
  }

  const entries: ScopedEntry[] = Array.from(idByCode.keys())
    .sort(compareCardCodes)
    .map((cardCode) => {
      const module = moduleFromCode(cardCode);
      return {
        cardCode,
        cardKind: kindByCode.get(cardCode) ?? "coaching_card",
        module,
        scope: sessionScopeFor(module),
      };
    });

  console.log(`  ${entries.length} entries, from ${live.length} cards in the library`);

  /* ── 2 · the check the scopes exist to pass ────────────────────────────── */

  heading("Detector load, per session");

  const loose = unscopedCoaching(entries);
  if (loose.length) {
    console.log(
      `  \x1b[31m✗ ${loose.length} coaching card(s) have no session scope and would fire on ` +
        `every turn of every session:\x1b[0m\n    ` +
        loose.map((e) => `${e.cardCode} (${e.module})`).join(", "),
    );
    console.log("  Map their module in session-scope.ts. Nothing has been changed.");
    await pool.end();
    process.exit(1);
  }

  const scoped = entries.map((e) => ({ cardKind: e.cardKind, appliesToSession: e.scope }));
  const load = detectorLoadBySession(scoped).sort((a, b) => b.count - a.count);
  const peak = peakDetectorLoad(scoped);

  for (const l of load) {
    const flag =
      l.count > SEQUENCE_HARD_LIMIT
        ? "  \x1b[31m✗ over the hard limit\x1b[0m"
        : l.count > SEQUENCE_SOFT_LIMIT
          ? "  \x1b[33mover the soft limit — review\x1b[0m"
          : "";
    console.log(`  ${s(l.session ?? "every session").padEnd(22)} ${String(l.count).padStart(4)}${flag}`);
  }
  console.log(
    `\n  peak ${peak.count} in ${s(peak.session)} · soft ${SEQUENCE_SOFT_LIMIT} · ` +
      `hard ${SEQUENCE_HARD_LIMIT}`,
  );

  if (peak.count > SEQUENCE_HARD_LIMIT) {
    console.log(
      `\n  \x1b[31m✗ refusing to build: a sequence that cannot be activated is not worth ` +
        `writing.\x1b[0m\n`,
    );
    await pool.end();
    process.exit(1);
  }

  /* ── 3 · what the methodology has not decided ──────────────────────────── */

  heading("Weights and deferrals");

  const unweighted = entries.filter((e) => (weightByCode.get(e.cardCode) ?? null) === null);
  console.log(
    `  ${entries.length - unweighted.length} of ${entries.length} state a sequence weight; ` +
      `${unweighted.length} are written as 1.0 because the column is NOT NULL`,
  );

  const deferred = entries.filter((e) => DEFERRED_MODULES.has(e.module));
  console.log(
    `  ${deferred.length} entries belong to modules Doc 2 §1 marks "Later" or "If time" ` +
      `(Modules 6–11, 13).`,
  );
  console.log(
    "  Publishing them puts the deployed set and the delivery plan in disagreement.\n" +
      "  That is Aditya's instruction and Danielle's call to confirm or correct.",
  );

  /* ── 4 · the cycles ────────────────────────────────────────────────────── */

  heading(PUBLISH ? "Building and activating" : "Cycles that would change");

  const cycles = await rows(sql`
    SELECT c."id"                           AS cycle_id,
           i."name"                         AS institution,
           c."label"                        AS label,
           c."active_heuristic_sequence_id" AS sequence_id,
           q."owner_type"                   AS owner_type,
           q."owner_id"                     AS owner_id,
           q."version_number"               AS version_number,
           (SELECT count(*) FROM "wing"."students" st WHERE st."cycle_id" = c."id") AS students
      FROM "wing"."school_cycles" c
      JOIN "wing"."institutions" i ON i."id" = c."institution_id"
      LEFT JOIN "wing"."heuristic_sequences" q ON q."id" = c."active_heuristic_sequence_id"
     ORDER BY c."id"
  `);

  for (const cy of cycles) {
    const current = cy.sequence_id === null ? null : n(cy.sequence_id);
    console.log(
      `  cycle ${String(n(cy.cycle_id)).padEnd(3)} ${s(cy.institution).slice(0, 34).padEnd(36)} ` +
        `students ${String(n(cy.students)).padStart(3)}  ` +
        (current === null ? "no sequence" : `sequence ${current} v${s(cy.version_number)}`) +
        ` → ${entries.length} entries`,
    );
  }

  if (!PUBLISH) {
    console.log(
      "\n  Nothing has been changed. Re-run with --publish to build and activate:\n" +
        "    npm run wing:build-full-sequences -- --publish\n",
    );
    await pool.end();
    return;
  }

  await db.transaction(async (tx: any) => {
    for (const cy of cycles) {
      const cycleId = n(cy.cycle_id);
      const oldId = cy.sequence_id === null ? null : n(cy.sequence_id);

      /*
       * A sequence belongs to its cycle. Where one exists we continue its
       * version lineage; where a cycle has none — Berkeley and Vanderbilt did,
       * before the rebuild — we start one owned by the cycle.
       */
      const ownerType = oldId === null ? "school_cycle" : String(cy.owner_type);
      const ownerId = oldId === null ? cycleId : n(cy.owner_id);
      const version = oldId === null ? 1 : n(cy.version_number) + 1;

      const [created] = await tx
        .insert(heuristicSequences)
        .values({
          ownerType: ownerType as never,
          ownerId,
          versionNumber: version,
          activeFrom: new Date(),
        })
        .returning({ id: heuristicSequences.id });

      await tx.insert(heuristicSequenceEntries).values(
        entries.map((e, i) => ({
          sequenceId: created.id,
          heuristicId: idByCode.get(e.cardCode)!,
          position: i + 1,
          weight: (weightByCode.get(e.cardCode) ?? 1).toFixed(2),
          appliesToSession: (e.scope ?? null) as never,
        })),
      );

      if (oldId !== null) {
        await tx
          .update(heuristicSequences)
          .set({ supersededAt: new Date() })
          .where(eq(heuristicSequences.id, oldId));
      }

      await tx
        .update(schoolCycles)
        .set({ activeHeuristicSequenceId: created.id })
        .where(eq(schoolCycles.id, cycleId));

      console.log(
        `  ✓ cycle ${cycleId} ${s(cy.institution).slice(0, 30)} → sequence ${created.id} ` +
          `v${version}, ${entries.length} entries`,
      );
    }
  });

  heading("Done");
  console.log(
    `  ${cycles.length} cycle(s) now carry all ${entries.length} elements, each scoped to its ` +
      `own module.`,
  );
  console.log(
    `  Peak detector load ${peak.count} in ${s(peak.session)}. Modules 6–11 and 13 are now ` +
      `reaching students — tell Danielle.\n`,
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

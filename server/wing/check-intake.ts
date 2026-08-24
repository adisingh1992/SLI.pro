import { readFileSync } from "node:fs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import {
  heuristicComponents,
  heuristicSequenceEntries,
  heuristicSequences,
  heuristics,
  schoolCycles,
  selfDescriptions,
} from "@shared/wing-schema";
import { INTAKE_SOURCE, PRIOR_INTAKE_SOURCE, parseIntake } from "./parse-intake";
import { intakeCardToSeed, intakeGateToSeed, seedRows, type SeedCard } from "./seed-shared";

/**
 * Reads what the database actually holds for the intake module. Writes nothing.
 *
 *     npm run wing:check-intake
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * `wing:update-intake` reported "0 component(s) would be revised, 263 already at
 * v1.7, 1 card(s) retired" against a database nothing in this session had updated
 * to v1.7 — so either the rows really are at v1.7 and something else put them
 * there, or a counter is lying. A count is not evidence. This compares every stored
 * component against BOTH documents and says which one it matches, card by card.
 *
 * It also reports the self-description capture, because the same question applies:
 * the table exists and the code writes to it, and the only proof that it works is
 * rows.
 */

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

type Verdict = "v1.7" | "v1.1" | "other" | "missing";

function rowsByType(seed: SeedCard): Map<string, string> {
  return new Map(seedRows(seed).components.map((r) => [r.componentType, r.content]));
}

async function main() {
  ({ db, pool } = await initScript());

  const current = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));
  const prior = parseIntake(readFileSync(PRIOR_INTAKE_SOURCE, "utf8"));

  const now = new Map<string, SeedCard>();
  for (const c of current.cards) now.set(c.cardCode, intakeCardToSeed(c, INTAKE_SOURCE));
  for (const g of current.gates) now.set(g.cardCode, intakeGateToSeed(g, INTAKE_SOURCE));

  const was = new Map<string, SeedCard>();
  for (const c of prior.cards) was.set(c.cardCode, intakeCardToSeed(c, PRIOR_INTAKE_SOURCE));
  for (const g of prior.gates) was.set(g.cardCode, intakeGateToSeed(g, PRIOR_INTAKE_SOURCE));

  const codes = Array.from(new Set(Array.from(now.keys()).concat(Array.from(was.keys()))));

  const rows = await db
    .select({
      id: heuristics.id,
      cardCode: heuristics.cardCode,
      status: heuristics.status,
      cardKind: heuristics.cardKind,
    })
    .from(heuristics)
    .where(inArray(heuristics.cardCode, codes));
  const byCode = new Map(rows.map((r) => [r.cardCode, r]));

  console.log(`\nIntake module — what the database holds\n`);
  console.log(`  current source: ${INTAKE_SOURCE}`);
  console.log(`  prior source:   ${PRIOR_INTAKE_SOURCE}\n`);

  const tally: Record<Verdict, number> = { "v1.7": 0, "v1.1": 0, other: 0, missing: 0 };
  const mixed: string[] = [];
  const notSeeded: string[] = [];

  for (const code of Array.from(now.keys())) {
    const row = byCode.get(code);
    if (!row) {
      notSeeded.push(code);
      continue;
    }

    const stored = await db
      .select({
        componentType: heuristicComponents.componentType,
        content: heuristicComponents.content,
      })
      .from(heuristicComponents)
      .where(
        and(eq(heuristicComponents.heuristicId, row.id), eq(heuristicComponents.isCurrent, true)),
      );
    const held = new Map(stored.map((r) => [r.componentType as string, r.content]));

    const target = rowsByType(now.get(code)!);
    const before = was.has(code) ? rowsByType(was.get(code)!) : new Map<string, string>();

    const verdicts: Verdict[] = [];
    for (const [type, wanted] of Array.from(target.entries())) {
      const have = held.get(type);
      if (have === undefined) verdicts.push("missing");
      else if (have === wanted) verdicts.push("v1.7");
      else if (have === before.get(type)) verdicts.push("v1.1");
      else verdicts.push("other");
    }
    for (const v of verdicts) tally[v]++;

    const distinct = Array.from(new Set(verdicts));
    if (distinct.length > 1) {
      mixed.push(`${code}: ${distinct.join(" + ")}`);
    }
  }

  console.log("  component rows, by which document they match:");
  console.log(`    at v1.7   ${String(tally["v1.7"]).padStart(4)}`);
  console.log(`    at v1.1   ${String(tally["v1.1"]).padStart(4)}`);
  console.log(`    neither   ${String(tally.other).padStart(4)}   (edited by hand, or a third version)`);
  console.log(`    missing   ${String(tally.missing).padStart(4)}`);

  if (notSeeded.length) console.log(`\n  not seeded: ${notSeeded.join(", ")}`);
  if (mixed.length) {
    console.log(`\n  ${mixed.length} card(s) hold a MIXTURE, which no single run produces:`);
    for (const m of mixed) console.log(`    ${m}`);
  }

  /* ── The retired card ─────────────────────────────────────────────────── */
  const dropped = Array.from(was.keys()).filter((c) => !now.has(c));
  console.log("\n  cards v1.7 dropped:");
  for (const code of dropped) {
    const row = byCode.get(code);
    console.log(
      `    ${code.padEnd(9)} ${row ? `status=${row.status}` : "not in the database at all"}`,
    );
  }

  /* ── Are any of them live? ────────────────────────────────────────────── */
  const ids = Array.from(now.keys())
    .map((c) => byCode.get(c)?.id)
    .filter((n): n is number => typeof n === "number");
  const inSequences = ids.length
    ? await db
        .select({
          sequenceId: heuristicSequenceEntries.sequenceId,
          n: sql<number>`count(*)::int`,
        })
        .from(heuristicSequenceEntries)
        .where(inArray(heuristicSequenceEntries.heuristicId, ids))
        .groupBy(heuristicSequenceEntries.sequenceId)
    : [];
  /*
   * ── THE ONLY QUESTION THAT DECIDES WHETHER THIS IS LIVE ────────────────
   * Membership of a sequence is not publication. A sequence reaches a student
   * through exactly one pointer, `school_cycles.active_heuristic_sequence_id`, so a
   * card can sit in six sequences and reach nobody. Reported together, because the
   * count alone reads as alarming when it may be inert — and reads as safe when it
   * may not be.
   */
  console.log("\n  sequences containing intake cards:");
  if (!inSequences.length) {
    console.log("    none — so no intake card can reach a student");
  } else {
    const cycles = await db
      .select({
        id: schoolCycles.id,
        year: schoolCycles.cycleYear,
        active: schoolCycles.activeHeuristicSequenceId,
        status: schoolCycles.status,
      })
      .from(schoolCycles);
    const pointedAt = new Map<number, string[]>();
    for (const c of cycles) {
      if (c.active === null) continue;
      const label = `cycle #${c.id} (${c.year}, ${c.status})`;
      pointedAt.set(c.active, (pointedAt.get(c.active) ?? []).concat([label]));
    }

    const meta = await db
      .select({
        id: heuristicSequences.id,
        version: heuristicSequences.versionNumber,
        ownerId: heuristicSequences.ownerId,
        supersededAt: heuristicSequences.supersededAt,
      })
      .from(heuristicSequences)
      .where(inArray(heuristicSequences.id, inSequences.map((r) => r.sequenceId)));
    const metaById = new Map(meta.map((m) => [m.id, m]));

    let liveCount = 0;
    for (const r of inSequences) {
      const m = metaById.get(r.sequenceId);
      const live = pointedAt.get(r.sequenceId);
      if (live) liveCount++;
      console.log(
        `    #${String(r.sequenceId).padEnd(4)} holds ${String(r.n).padStart(3)} intake card(s)` +
          `  cycle ${m?.ownerId ?? "?"} v${m?.version ?? "?"}` +
          `  ${m?.supersededAt ? "superseded" : "current"}` +
          `  ${live ? `LIVE — pointed at by ${live.join(", ")}` : "not pointed at"}`,
      );
    }
    console.log(
      liveCount
        ? `\n    ${liveCount} of them IS live. Intake cards are reaching students in those\n` +
            "    cohorts, which also means the intake gate section and its token cost are\n" +
            "    in force. Nothing in this session published them."
        : "\n    None is pointed at by a cycle, so none of this reaches a student.",
    );
  }

  /* ── The capture ──────────────────────────────────────────────────────── */
  /*
   * Last, and in its own try: the capture is the newest thing here and the most
   * likely to fail on a schema that has not caught up. A report that dies on its
   * final section throws away everything above it, which is how a missing column
   * hid six sequences the first time this ran.
   */
  /*
   * Before reading rows, report what the table actually IS. The 0023 that ran on this
   * database is not the 0023 in the folder, and the file is untracked, so its shape
   * cannot be read from source — only asked for. Two failures came out of guessing at
   * it: a missing column, then a missing enum. This section is the end of guessing.
   */
  const EXPECTED_COLUMNS = [
    "id",
    "student_id",
    "session_id",
    "captured_at",
    "source_module",
    "source_question",
    "asked_as",
    "equivalence",
    "verbatim_text",
    "provenance",
  ];
  console.log("\n  the capture table as the database actually holds it:");
  try {
    const cols = await pool.query(
      `select column_name as name, is_nullable as nullable, udt_name as type
         from information_schema.columns
        where table_schema = 'wing' and table_name = 'self_descriptions'
        order by ordinal_position`,
    );
    const have = cols.rows as Array<{ name: string; nullable: string; type: string }>;
    const enums = await pool.query(
      `select t.typname as name
         from pg_type t
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'wing'
          and t.typtype = 'e'
          and t.typname like 'self_description%'
        order by t.typname`,
    );
    const enumNames = (enums.rows as Array<{ name: string }>).map((r) => r.name);
    if (!have.length) {
      console.log("    wing.self_descriptions does not exist. Run npm run db:migrate.");
    } else {
      for (const c of have) {
        console.log(
          `    ${c.name.padEnd(18)}${c.type.padEnd(30)}` +
            `${c.nullable === "YES" ? "null ok" : "not null"}`,
        );
      }
      const missing = EXPECTED_COLUMNS.filter((c) => !have.some((h) => h.name === c));
      console.log(
        missing.length
          ? `    MISSING: ${missing.join(", ")}\n` +
              "    The writer fails on every turn until a migration adds them, and fails\n" +
              "    silently — it swallows its own errors so that a failed capture can never\n" +
              "    break someone's intake. A missing column therefore produces no error\n" +
              "    anywhere, only an empty table. Nothing above this line is affected."
          : "    every column the writer needs is present.",
      );
    }
    console.log(`    enums: ${enumNames.length ? enumNames.join(", ") : "none in wing"}`);
  } catch (err) {
    console.log(`    could not read the shape: ${(err as Error).message}`);
  }

  let captured: Array<{
    sourceQuestion: string | null;
    equivalence: string | null;
    provenance: string;
    n: number;
  }> = [];
  let captureError: string | null = null;
  try {
    captured = (await db
      .select({
        sourceQuestion: selfDescriptions.sourceQuestion,
        equivalence: selfDescriptions.equivalence,
        provenance: selfDescriptions.provenance,
        n: sql<number>`count(*)::int`,
      })
      .from(selfDescriptions)
      .groupBy(
        selfDescriptions.sourceQuestion,
        selfDescriptions.equivalence,
        selfDescriptions.provenance,
      )) as never;
  } catch (err) {
    captureError = (err as Error).message;
  }

  console.log("\n  self-descriptions captured:");
  if (captureError) {
    console.log(`    could not read the table: ${captureError}`);
    console.log(
      "    Everything above this line still stands. Compare it against the shape\n" +
        "    reported above: 0024 is the migration that converges this table, and it is\n" +
        "    the only file that can — 0023 is already recorded as applied.",
    );
  } else if (!captured.length) {
    console.log(
      "    none yet. The table and the writer exist; a row appears the first time\n" +
        "    someone answers an intake question after this deploy.",
    );
  } else {
    for (const r of captured) {
      console.log(
        `    ${(r.sourceQuestion ?? "(no equivalent)").padEnd(16)}` +
          `${(r.equivalence ?? "—").padEnd(12)}${String(r.provenance).padEnd(12)}${r.n}`,
      );
    }
  }

  console.log("");
  await pool.end();
}

main().catch(async (err) => {
  console.error("\n[check-intake] failed:", (err as Error).message);
  await pool?.end().catch(() => {});
  process.exit(1);
});

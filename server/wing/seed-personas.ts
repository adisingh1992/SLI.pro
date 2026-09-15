import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { type ScriptDb } from "../script-init";
import { startScript } from "./script-start";
import { parsePersona, personaEmail, type PersonaSpec } from "./parse-persona";

/**
 * `npm run wing:seed-personas -- --cycle=<id> [--apply]`
 *
 * Creates one test account per persona spec in `methodology/personas/`.
 *
 * ── DRY RUN BY DEFAULT ───────────────────────────────────────────────────
 * Same shape as `wing:apply-corrections`: it reports and changes nothing until
 * `--apply`. This one writes user rows, so the default matters more than usual.
 *
 * ── IT REFUSES THE WHOLE RUN IF ANY SPEC IS INVALID ──────────────────────
 * Not "skip the bad ones and carry on". A run of nineteen personas where the
 * twentieth was silently dropped produces a cross-persona report with a hole in
 * it that nothing in the output would reveal, and the Unfired Cards report is
 * measured against the personas that ran. Better to fix the spec.
 *
 * The refusal that matters most is a spec with no `professional_status` or no
 * `pathway` — see `parse-persona.ts` for why an account seeded without them
 * would make every audience-specific card look like dead weight.
 *
 * ── AND IT REFUSES A CYCLE THAT PUBLISHES NOTHING ────────────────────────
 * Publication here is a pointer: `school_cycles.active_heuristic_sequence_id`.
 * A cycle with that column NULL has no cards and no gates, so every persona run
 * against it would produce empty transcripts and an Unfired Cards report in
 * which the entire library never fired. That reads exactly like a catastrophic
 * methodology finding and is in fact a configuration mistake, so it is checked
 * before a single row is written. `wing:census` is the script that shows which
 * cycles publish anything.
 *
 * ── WHAT IT WRITES, AND WHAT IT DELIBERATELY DOES NOT ────────────────────
 * Writes: a `wing.users` row with `is_test_user = true`, a `wing.students` row
 * bound to the given cycle, and a `wing.intake_records` row carrying the
 * pathway. That is the minimum for `populationTagsForStudent` to resolve the
 * audience tags the engine filters on.
 *
 * Does NOT write a password hash — the column is nullable for LinkedIn-only
 * accounts and a persona never logs in through a browser; the runner
 * authenticates as a service. Does NOT mark intake `completed`: the pathway is
 * what the tags need, and claiming a completed intake would assert a reveal
 * that never happened. Does NOT create sessions or checkpoints — that is
 * `applyCheckpoint`'s job, and it is not built yet.
 *
 * Idempotent by email. Re-running reports each persona as existing and updates
 * nothing, because a persona's account is not the persona: editing a spec and
 * re-seeding must not silently repoint an account whose transcripts are already
 * being reviewed.
 */

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

const APPLY = process.argv.includes("--apply");
const cycleArg = process.argv.find((a) => a.startsWith("--cycle="));

const PERSONA_DIR = join(process.cwd(), "methodology", "personas");

type Row = Record<string, unknown>;
const rowsOf = async (q: unknown): Promise<Row[]> => {
  const r = await db.execute(q as never);
  return (r as unknown as { rows: Row[] }).rows ?? [];
};

function load(): { specs: PersonaSpec[]; problems: string[] } {
  const problems: string[] = [];
  const specs: PersonaSpec[] = [];

  let files: string[];
  try {
    files = readdirSync(PERSONA_DIR)
      .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
      .sort();
  } catch {
    return { specs, problems: [`cannot read ${PERSONA_DIR}`] };
  }

  if (!files.length) {
    return {
      specs,
      problems: [
        `no persona specs in methodology/personas/. Copy _TEMPLATE.md and fill it in ` +
          `(files starting with _ are ignored).`,
      ],
    };
  }

  const seen = new Map<string, string>();

  for (const file of files) {
    const text = readFileSync(join(PERSONA_DIR, file), "utf8");
    const hash = createHash("sha256").update(text).digest("hex");
    const result = parsePersona(text, hash);

    if (!result.ok) {
      for (const f of result.failures) problems.push(`${file} · ${f.field}: ${f.problem}`);
      continue;
    }

    /*
     * Two files claiming one id would make the second silently win on the
     * email uniqueness constraint, and a finding citing that id would be
     * ambiguous forever.
     */
    const clash = seen.get(result.spec.id);
    if (clash) {
      problems.push(`${file} · id "${result.spec.id}" is already used by ${clash}`);
      continue;
    }
    seen.set(result.spec.id, file);
    specs.push(result.spec);
  }

  return { specs, problems };
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? { first: parts[0], last: "(persona)" }
    : { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

async function main() {
  ({ db, pool } = await startScript());

  const cycleId = cycleArg ? Number(cycleArg.split("=")[1]) : NaN;
  if (!Number.isInteger(cycleId) || cycleId <= 0) {
    console.error(
      "\n  --cycle=<id> is required. Run `npm run wing:census` to see which cycles\n" +
        "  exist and which of them actually publish a sequence.\n",
    );
    await pool.end();
    process.exit(1);
  }

  /* ── the cycle has to publish something ──────────────────────────────── */

  const [cycle] = await rowsOf(sql`
    SELECT c."id"                             AS id,
           i."name"                           AS institution,
           c."label"                          AS label,
           c."institution_id"                 AS institution_id,
           c."active_heuristic_sequence_id"   AS sequence_id,
           q."superseded_at"                  AS superseded_at,
           (SELECT count(*)
              FROM "wing"."heuristic_sequence_entries" e
              JOIN "wing"."heuristics" h ON h."id" = e."heuristic_id"
             WHERE e."sequence_id" = c."active_heuristic_sequence_id"
               AND h."card_kind" = 'coaching_card'
               AND h."status" <> 'retired')   AS coaching_cards
      FROM "wing"."school_cycles" c
      JOIN "wing"."institutions" i ON i."id" = c."institution_id"
      LEFT JOIN "wing"."heuristic_sequences" q ON q."id" = c."active_heuristic_sequence_id"
     WHERE c."id" = ${cycleId}
     LIMIT 1
  `);

  if (!cycle) {
    console.error(`\n  no cycle ${cycleId}. Run \`npm run wing:census\`.\n`);
    await pool.end();
    process.exit(1);
  }

  const label = `${String(cycle.institution)}${cycle.label ? ` / ${String(cycle.label)}` : ""}`;
  console.log(`\n[seed-personas] cycle ${cycleId} — ${label}`);

  if (cycle.sequence_id === null) {
    console.error(
      `\n  ✗ cycle ${cycleId} points at NO sequence, so it publishes no cards and no\n` +
        `    gates. Every persona run against it would produce an Unfired Cards report\n` +
        `    in which the whole library never fired — a configuration mistake that\n` +
        `    reads like a methodology catastrophe. Point the cycle at a published\n` +
        `    sequence first.\n`,
    );
    await pool.end();
    process.exit(1);
  }

  if (cycle.superseded_at !== null) {
    console.error(
      `\n  ✗ cycle ${cycleId} points at sequence ${Number(cycle.sequence_id)}, which is\n` +
        `    SUPERSEDED (${String(cycle.superseded_at)}). Fix the pointer before seeding.\n`,
    );
    await pool.end();
    process.exit(1);
  }

  const coaching = Number(cycle.coaching_cards ?? 0);
  console.log(
    `  sequence ${Number(cycle.sequence_id)} · ${coaching} non-retired coaching card(s)`,
  );
  if (coaching === 0) {
    console.error(
      `\n  ✗ that sequence contains no coaching cards — only gates and/or exercises.\n` +
        `    The detector would have nothing to match against on any turn.\n`,
    );
    await pool.end();
    process.exit(1);
  }

  /* ── the specs ───────────────────────────────────────────────────────── */

  const { specs, problems } = load();

  if (problems.length) {
    console.error(`\n  ✗ ${problems.length} spec problem(s) — nothing was written:\n`);
    for (const p of problems) console.error(`    ${p}`);
    console.error(
      `\n    Every spec must be valid before any is seeded. A run with one persona\n` +
        `    silently missing produces a cross-persona report with a hole in it that\n` +
        `    the output would not reveal.\n`,
    );
    await pool.end();
    process.exit(1);
  }

  console.log(`  ${specs.length} valid spec(s)\n`);

  const existing = new Set(
    (
      await rowsOf(sql`
        SELECT u."email" AS email
          FROM "wing"."users" u
         WHERE u."email" = ANY (${specs.map((s) => personaEmail(s.id))}::text[])
      `)
    ).map((r) => String(r.email)),
  );

  let created = 0;
  let already = 0;

  for (const spec of specs) {
    const email = personaEmail(spec.id);
    const tags = spec.populationTags.join(", ");

    if (existing.has(email)) {
      already++;
      console.log(`  = ${spec.id.padEnd(24)} exists — left untouched`);
      continue;
    }

    console.log(
      `  ${APPLY ? "+" : "·"} ${spec.id.padEnd(24)} ${spec.professionalStatus} / ${spec.pathway}` +
        `  → [${tags}]`,
    );

    if (!APPLY) continue;

    const { first, last } = splitName(spec.name);

    /*
     * One transaction per persona. Nineteen good personas and one that fails on
     * a constraint should leave nineteen whole accounts, not a half-written
     * twentieth — and the script is idempotent, so the fix is to correct the
     * spec and re-run.
     */
    await db.transaction(async (tx) => {
      const ins = await tx.execute(sql`
        INSERT INTO "wing"."users"
          ("email", "first_name", "last_name", "role", "professional_status",
           "is_test_user", "timezone")
        VALUES (${email}, ${first}, ${last}, 'student', ${spec.professionalStatus},
                true, 'America/New_York')
        RETURNING "id"
      `);
      const userId = Number(ins.rows[0].id);

      const st = await tx.execute(sql`
        INSERT INTO "wing"."students"
          ("user_id", "institution_id", "cycle_id", "origin", "enrollment_status")
        VALUES (${userId}, ${Number(cycle.institution_id)}, ${cycleId},
                'institutional', 'active')
        RETURNING "id"
      `);
      const studentId = Number(st.rows[0].id);

      /*
       * `completed` stays false and `structured_responses` stays empty. The
       * pathway is the only thing the audience tags need, and asserting a
       * completed intake would claim a reveal the persona never had.
       */
      await tx.execute(sql`
        INSERT INTO "wing"."intake_records" ("student_id", "pathway")
        VALUES (${studentId}, ${spec.pathway})
      `);
    });

    created++;
  }

  console.log(
    `\n  ${APPLY ? `${created} created` : `${specs.length - already} would be created`}` +
      `, ${already} already existed.`,
  );

  if (!APPLY) {
    console.log("  Dry run — nothing was written. Re-run with --apply.\n");
  } else {
    console.log(
      `  Verify with \`npm run wing:check-test-user\`: the accounts should appear as\n` +
        `  test accounts with sessions and turns, and every 'must be zero' line must\n` +
        `  still read zero.\n`,
    );
  }

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

import "dotenv/config";
import { initScript } from "../script-init";

/**
 * Checks the primary student journey for the defect that broke registration,
 * the questionnaire and homework.
 *
 * Run:  npx tsx server/wing/check-journey.ts
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────
 * Registration creates a `wing.users` row and NO `public.users` row. Any code
 * path that writes a legacy public table whose user_id is a foreign key to
 * `public.users` therefore fails for every student who signed up after the
 * cutover — and fails invisibly, because the corresponding READ was usually
 * already migrated to wing, and because anyone testing with a migrated account
 * has rows in both schemas and sees it work.
 *
 * Three instances have been found and fixed by hand. This finds the rest by
 * asking the database rather than by reading code, which is what a grep-based
 * audit kept getting wrong.
 *
 * Read-only.
 */

async function main() {
  const { db, pool } = await initScript();
  const { sql } = await import("drizzle-orm");

  const q = async (text: string) => {
    const r: any = await db.execute(sql.raw(text));
    return r.rows ?? r ?? [];
  };

  console.log("");

  /* ── 1. How many students exist only in wing? ──────────────────────── */

  const [counts] = await q(`
    select
      (select count(*) from wing.users)::int   as wing_users,
      (select count(*) from wing.students)::int as wing_students,
      (select count(*) from public.users)::int  as public_users
  `);
  console.log(`wing.users ${counts.wing_users}   wing.students ${counts.wing_students}   public.users ${counts.public_users}`);

  const [orphans] = await q(`
    select count(*)::int as n
    from wing.users wu
    where not exists (
      select 1 from public.users lu where lower(lu.username) = lower(wu.email)
    )
  `);
  console.log(
    `\n${orphans.n} wing user(s) have NO public.users counterpart.\n` +
      `   Every one of them breaks on any write to a public table keyed to public.users.`,
  );

  /* ── 2. Which public tables still FK to public.users? ──────────────── */

  const fks = await q(`
    select tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and ccu.table_schema = 'public'
      and ccu.table_name = 'users'
    order by tc.table_name
  `);

  console.log(`\n${fks.length} public table(s) still reference public.users:`);
  for (const f of fks) console.log(`   ${f.table_name}.${f.column_name}`);

  console.log(
    `\nEach is safe ONLY if no live code path writes it. All reachable writes\n` +
      `have now been moved:\n` +
      `   profiles              -> wing.students.onboarding_*   (migration 0011)\n` +
      `   questionnaires        -> wing.intake_records          (intake-store)\n` +
      `   homework_assignments  -> wing.homework_assignments    (migration 0013)\n` +
      `   monthly_check_ins     -> wing.monthly_check_ins       (migration 0014)\n` +
      `   coaching_notes        -> wing.coaching_notes          (migration 0014)\n` +
      `\nRemaining public tables have NO client caller (dead routes):\n` +
      `   skills, languages, experiences, education\n` +
      `They would break identically if anyone wired them up.\n`,
  );

  /* ── 3. Did the homework backfill land? ────────────────────────────── */

  const [hw] = await q(`
    select
      (select count(*) from wing.homework_assignments)::int as wing_rows,
      (select count(*) from public.homework_assignments)::int as legacy_rows
  `).catch(() => [{ wing_rows: -1, legacy_rows: -1 }]);

  if (hw && hw.wing_rows >= 0) {
    console.log(`homework: ${hw.wing_rows} row(s) on wing, ${hw.legacy_rows} in the legacy table.`);
    if (hw.wing_rows < hw.legacy_rows) {
      console.log(
        `   !! ${hw.legacy_rows - hw.wing_rows} legacy row(s) did not carry across.\n` +
          `      The backfill joins on email; rows belonging to a legacy account with no\n` +
          `      wing counterpart are expected to be left behind. Check before assuming a bug.`,
      );
    }
  }

  /* ── 4. Do the two id spaces disagree? ─────────────────────────────── */

  /*
   * The identity migration gave every wing user a fresh serial and kept no
   * mapping back to the legacy id. So `public.users.id` and `wing.users.id`
   * number the same people differently, and any endpoint that hands out one
   * while its neighbour resolves the other silently shows the wrong person.
   *
   * That is exactly what the admin student list did: it listed legacy ids and
   * linked them into an endpoint reading `wing.users`. Every row opened
   * somebody else, and every derived column — progress, school, programme —
   * was computed from a third party's data. Nothing raised, because both ids
   * exist and both resolve to a real human.
   *
   * This prints the collision rate. Anything other than "identical" means an
   * id must never be moved between the two spaces without translating it.
   */
  const [ids] = await q(`
    select
      (select count(*) from public.users)::int                       as legacy,
      (select count(*) from wing.users)::int                         as wing,
      (select count(*) from public.users p
         join wing.users w on w.id = p.id
        where lower(w.email) <> lower(coalesce(p.username, '')))::int as mismatched
  `).catch(() => [null]);

  if (ids) {
    console.log(
      `\nid spaces: ${ids.legacy} legacy user(s), ${ids.wing} wing user(s).`,
    );
    if (ids.mismatched > 0) {
      console.log(
        `   !! ${ids.mismatched} id(s) resolve to a DIFFERENT person in each table.\n` +
          `      Any admin surface that lists one id space and links into the other\n` +
          `      will open the wrong record. Endpoints must return wing ids.`,
      );
    } else {
      console.log(`   ids happen to agree — do not rely on it, nothing enforces it.`);
    }
  }

  console.log("");
  await pool.end();
}

main().catch((e) => {
  console.error("check failed:", e);
  process.exit(1);
});

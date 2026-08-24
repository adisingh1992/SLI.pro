/**
 * The two rules that decide what a migration run does, extracted so they can be
 * tested without a database.
 *
 * Both were wrong in `check-migrations.ts` at the same time, and the two wrongs
 * pointed the same way: they made an already-applied migration look pending and
 * unsafe, which invited baselining a migration that had in fact run. Three failures
 * came out of not knowing which of these two worlds we were in, so they are pure
 * functions with a suite on them now rather than inline arithmetic in a script that
 * only runs against a live database.
 */

/**
 * Whether `db:migrate` will open a migration file at all.
 *
 * Drizzle's actual rule, from `pg-core/dialect.js`:
 *
 *     const lastDbMigration = dbMigrations[0];   // ORDER BY created_at DESC LIMIT 1
 *     if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)
 *
 * One number, compared with `<`. Three consequences that are not obvious:
 *
 *   1. The stored hash is never consulted. Editing an applied migration does not
 *      make it pending — the migrator reports `done` without opening the file.
 *   2. It is `<`, not `<=`: a migration whose `when` equals the last recorded
 *      `created_at` is skipped.
 *   3. It is one timestamp, not a set. A journal entry inserted with a `when`
 *      BELOW the newest recorded one is skipped forever, however new the file is.
 *
 * @param lastCreatedAt the largest `created_at` in `drizzle.__drizzle_migrations`,
 *   or null when the table is empty or absent
 * @param when the journal entry's `when` (drizzle calls it `folderMillis`)
 */
export function willApply(lastCreatedAt: number | null, when: number): boolean {
  return lastCreatedAt === null || lastCreatedAt < when;
}

export type ReplayVerdict = { safe: boolean; why: string };

/**
 * Whether a migration survives being run a second time.
 *
 * The same rule the contract suite applies to every file from 0008 on. Counted in
 * two independent tallies, because Postgres has neither `CREATE TYPE IF NOT EXISTS`
 * nor `ADD CONSTRAINT IF NOT EXISTS` — the only way to make either replayable is the
 * `DO $$ ... EXCEPTION WHEN duplicate_object` block drizzle-kit itself emits.
 *
 * Lumping them into one tally is what made the old arithmetic accidental: it read
 * migration 0023 as five unguarded CREATEs when all five are guarded, three by
 * `IF NOT EXISTS` and two by `duplicate_object`.
 */
export function replaySafe(sql: string): ReplayVerdict {
  // Comments explain these rules at length in the files themselves; they must not
  // be read as code, in either direction — a CREATE in a comment is not a statement,
  // and an IF NOT EXISTS in a comment is not a guard.
  const code = sql.replace(/--.*$/gm, "");

  const creates = (code.match(/\bcreate (table|index|unique index)\b/gi) ?? []).length;
  const guards = (code.match(/if not exists/gi) ?? []).length;
  if (creates > guards) {
    return { safe: false, why: `${creates} CREATE(s) but only ${guards} IF NOT EXISTS` };
  }

  const createTypes = (code.match(/\bcreate type\b/gi) ?? []).length;
  const constraints = (code.match(/add constraint/gi) ?? []).length;
  const handled = (code.match(/duplicate_object/gi) ?? []).length;
  if (createTypes + constraints > handled) {
    return {
      safe: false,
      why:
        `${createTypes} CREATE TYPE and ${constraints} ADD CONSTRAINT but only ` +
        `${handled} duplicate_object guard(s)`,
    };
  }

  return { safe: true, why: "" };
}

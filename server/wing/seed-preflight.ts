import type { ScriptDb } from "../script-init";

/**
 * Refuses a seed that the database's enums cannot hold.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * `wing:seed-intake` was run before migration 0022 had been applied. It inserted
 * H-010, whose intervention type is META and therefore valid, then threw on H-011
 * with `invalid input value for enum wing.heuristic_intervention_type: "ELICIT"`.
 *
 * Nothing was corrupted — the seeders are idempotent by `card_code` and use one
 * transaction per card, so H-010 committed whole and a re-run skips it. But the
 * shape of that failure is wrong in two ways. The database was written to by a run
 * that could not possibly complete, and the reason only became visible at card 2
 * of 42, in an error message about an enum rather than about a migration.
 *
 * Both are avoidable with one query before the loop. A precondition that can be
 * checked in advance should never be discovered by failing.
 */

/** The intervention types this database can store. */
export async function interventionTypes(pool: ScriptDb["pool"]): Promise<string[]> {
  const res = await pool.query(
    `select e.enumlabel as label
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'wing' and t.typname = 'heuristic_intervention_type'
      order by e.enumsortorder`,
  );
  return (res.rows as Array<{ label: string }>).map((r) => r.label);
}

/** Which of `needed` the database cannot store. Pure, so it can be tested. */
export function missingTypes(have: readonly string[], needed: readonly string[]): string[] {
  const known: Record<string, true> = {};
  for (const h of have) known[h] = true;
  const missing: string[] = [];
  for (const n of needed) {
    if (!known[n] && missing.indexOf(n) < 0) missing.push(n);
  }
  return missing;
}

/**
 * Throws before anything is written if a needed intervention type is absent.
 *
 * The message carries the statement that fixes it, because "apply the migration"
 * is only useful to someone who knows which migration, and the person running a
 * seed at 11pm is not always that person.
 */
export async function assertInterventionTypes(
  pool: ScriptDb["pool"],
  needed: readonly string[],
): Promise<void> {
  const have = await interventionTypes(pool);
  const missing = missingTypes(have, needed);
  if (!missing.length) return;

  const alters = missing
    .map(
      (t) =>
        `  ALTER TYPE "wing"."heuristic_intervention_type" ADD VALUE IF NOT EXISTS '${t}';`,
    )
    .join("\n");

  throw new Error(
    `this database cannot store intervention type(s): ${missing.join(", ")}.\n\n` +
      `  The seed would insert cards until it reached one, then stop — leaving the ` +
      `document half seeded.\n` +
      `  ${have.length ? `This database has: ${have.join(", ")}` : "The enum does not exist at all."}\n\n` +
      `  Apply the migration that adds them (migrations/0022_intake_intervention_types.sql\n` +
      `  adds ELICIT and OBSERVE), or run:\n\n${alters}\n`,
  );
}

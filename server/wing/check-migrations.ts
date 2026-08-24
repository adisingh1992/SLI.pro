import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { initScript, type ScriptDb } from "../script-init";
import { replaySafe, willApply } from "./migration-rules";

/**
 * What the deployment pipeline's migration step will actually do.
 *
 * Run:  npm run wing:check-migrations
 *
 * Read-only. Sends nothing, changes nothing.
 *
 * ── WHY THIS IS NOT OBVIOUS FROM THE REPO ────────────────────────────────
 * `npm run db:migrate` — the command the Container Apps job runs — applies
 * whatever `migrations/meta/_journal.json` lists, in order, skipping anything
 * already recorded in `drizzle.__drizzle_migrations`. Two things follow that
 * the folder listing does not tell you:
 *
 *   1. A `.sql` file with no journal entry is invisible. Not pending —
 *      invisible. The migrator reports success having ignored it.
 *
 *   2. Whether a migration runs depends on a table in the target database, not
 *      on anything in the repo. Two environments with identical code can be at
 *      completely different points.
 *
 * ── THE FAILURE THIS WAS WRITTEN FOR ─────────────────────────────────────
 * Migrations 0000–0009 predate the convention and contain 180-odd unguarded
 * `CREATE TABLE` / `CREATE TYPE` statements. They are safe exactly once.
 *
 * If a database's schema was built by `db:wing-ddl` (psql, starting at 0003)
 * rather than by drizzle, then `__drizzle_migrations` is empty or partial —
 * and `db:migrate` will try to replay 0000 against a schema that already has
 * those tables, failing on the first statement with "relation already exists".
 * The pipeline reports "Migration failed" and, because the job runs inside the
 * VNet, discards the reason.
 *
 * This tells you which of those two worlds you are in before you run it.
 */

let pool: ScriptDb["pool"];

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const warn = (s: string) => console.log(`  \x1b[33m!\x1b[0m ${s}`);
const bad = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`);

/** Drizzle hashes the whole file with sha256 and stores it per migration. */
const hashOf = (sql: string) => createHash("sha256").update(sql).digest("hex");

async function main() {
  ({ pool } = await initScript());

  const dir = join(process.cwd(), "migrations");
  const journal = JSON.parse(readFileSync(join(dir, "meta", "_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string; when: number }[];
  };

  const files = new Set(
    readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, "")),
  );

  /* ── 1 · Journal vs folder ──────────────────────────────────────────── */
  console.log("\n\x1b[1mJournal\x1b[0m");
  const tags = journal.entries.map((e) => e.tag);
  const orphanFiles = Array.from(files).filter((f) => !tags.includes(f));
  const orphanTags = tags.filter((t) => !files.has(t));

  console.log(`  ${tags.length} entry(ies), ${files.size} .sql file(s)`);
  if (orphanFiles.length) {
    bad(`not in the journal — the pipeline will never apply these: ${orphanFiles.join(", ")}`);
  }
  if (orphanTags.length) {
    bad(`journal lists these but the file is gone — db:migrate will throw: ${orphanTags.join(", ")}`);
  }
  if (!orphanFiles.length && !orphanTags.length) ok("journal and folder agree");

  /* ── 2 · What the database thinks ───────────────────────────────────── */
  console.log("\n\x1b[1mWhat this database has applied\x1b[0m");

  const exists = await pool.query(`
    select to_regclass('drizzle.__drizzle_migrations') is not null as present
  `);

  if (!exists.rows[0]?.present) {
    bad("drizzle.__drizzle_migrations does not exist");
    console.log(
      `\n      This database has never been migrated by drizzle. The next\n` +
        `      db:migrate will start at 0000 — which contains unguarded CREATE\n` +
        `      statements — and fail immediately if the schema is already there.\n` +
        `\n      If the schema was built with db:wing-ddl, that is exactly the\n` +
        `      situation. See "Reconciling" below.\n`,
    );
    await pool.end();
    return;
  }

  /*
   * ── HOW DRIZZLE ACTUALLY DECIDES, WHICH IS NOT THE OBVIOUS WAY ──────────
   * It reads the single most recent `created_at` and applies every journal entry
   * whose `when` is greater than that one number:
   *
   *     if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)
   *
   * The hash is stored and never consulted. So "pending" cannot be computed by
   * asking whether a file's hash is recorded — which is what this script used to
   * do. Editing an applied migration changes its hash, and the old logic then
   * reported it as pending and offered to baseline it. Both were wrong, and this is
   * the one confusion the script exists to prevent: 0023 was applied, was edited
   * afterwards, and read as "the next db:migrate would apply 0023" while drizzle
   * had no intention of opening it.
   */
  const applied = await pool.query(`
    select hash, created_at from drizzle.__drizzle_migrations order by created_at
  `);
  const appliedHashes = new Set((applied.rows as Array<{ hash: string }>).map((r) => r.hash));
  const stamps = (applied.rows as Array<{ created_at: string }>).map((r) => Number(r.created_at));
  const lastCreatedAt = stamps.length ? stamps.reduce((a, b) => (b > a ? b : a), 0) : null;

  console.log(`  ${applied.rows.length} migration(s) recorded`);

  /* ── 3 · What the next run would do ─────────────────────────────────── */
  console.log("\n\x1b[1mThe next db:migrate would\x1b[0m");

  let pending = 0;
  const risky: string[] = [];
  const diverged: string[] = [];

  for (const entry of journal.entries) {
    if (!files.has(entry.tag)) continue;
    const sql = readFileSync(join(dir, `${entry.tag}.sql`), "utf8");

    if (!willApply(lastCreatedAt, entry.when)) {
      /*
       * Recorded, so drizzle will never open this file again. If it no longer
       * hashes to what was recorded, the file and the database have diverged and
       * nothing in the repo closes the gap — reported below rather than here,
       * because it is not something the next run will do.
       */
      if (!appliedHashes.has(hashOf(sql))) diverged.push(entry.tag);
      continue;
    }

    pending++;
    const verdict = replaySafe(sql);
    if (!verdict.safe) risky.push(entry.tag);

    console.log(
      `  ${verdict.safe ? " " : "\x1b[31m!\x1b[0m"} apply ${entry.tag}` +
        (verdict.safe ? "" : `  — ${verdict.why}, fails if already present`),
    );
  }

  if (pending === 0) ok("nothing — the database is up to date");

  /* ── 4 · Files that no longer match what ran ─────────────────────────── */
  if (diverged.length) {
    console.log("\n\x1b[1mRecorded, but the file has changed since it ran\x1b[0m");
    for (const tag of diverged) warn(tag);
    console.log(
      `\n  These are already recorded, so db:migrate will not open them again — it\n` +
        `  compares one timestamp, not hashes, and reports \`done\` without reading a\n` +
        `  file it has already run. **An applied migration is immutable in effect.**\n` +
        `  Whatever the edit was meant to do, only a LATER migration can do it.\n` +
        `\n  This is not automatically a problem: an edit that only touches comments\n` +
        `  diverges too. It is a problem when the edit added a column, a type or a\n` +
        `  constraint, because the database does not have it and nothing here says so.\n` +
        `  Compare the file against the live shape before assuming either way.\n`,
    );
  }

  if (risky.length) {
    console.log(
      `\n\x1b[1mReconciling\x1b[0m\n` +
        `  ${risky.length} pending migration(s) are not safe to replay: ${risky.join(", ")}.\n` +
        `  If their objects already exist (because db:wing-ddl built the schema),\n` +
        `  record them as applied instead of running them:\n\n` +
        `    npm run wing:check-migrations -- --print-baseline\n\n` +
        `  That prints the INSERT statements. Read them before running them —\n` +
        `  marking a migration applied that genuinely has not been is how a\n` +
        `  column goes missing in a way nothing detects until a query fails.\n`,
    );
  }

  /* ── 5 · The baseline, on request ───────────────────────────────────── */
  if (process.argv.includes("--print-baseline")) {
    console.log("\x1b[1m-- Baseline inserts\x1b[0m");
    console.log("-- Marks migrations as applied WITHOUT running them.");
    console.log("-- Only correct if every object they create already exists.\n");
    let printed = 0;
    for (const entry of journal.entries) {
      if (!files.has(entry.tag)) continue;
      /*
       * Only what drizzle would actually run. A recorded-but-diverged migration
       * used to land here, and baselining one is worse than useless: it inserts a
       * second row for a migration that already ran, under the hash of a version
       * that never did, which is a lie a future reader has no way to catch.
       */
      if (!willApply(lastCreatedAt, entry.when)) continue;
      const sql = readFileSync(join(dir, `${entry.tag}.sql`), "utf8");
      console.log(
        `insert into drizzle.__drizzle_migrations (hash, created_at) ` +
          `values ('${hashOf(sql)}', ${entry.when});  -- ${entry.tag}`,
      );
      printed++;
    }
    if (!printed) console.log("-- nothing pending; no inserts to make.");
    console.log("");
  }

  console.log("");
  await pool.end();
}

main().catch((err) => {
  console.error("[check-migrations] failed:", err);
  process.exit(1);
});

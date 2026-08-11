import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { initScript, type ScriptDb } from "../script-init";

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

  const applied = await pool.query(`
    select hash, created_at from drizzle.__drizzle_migrations order by created_at
  `);
  const appliedHashes = new Set(applied.rows.map((r: any) => r.hash));
  console.log(`  ${applied.rows.length} migration(s) recorded`);

  /* ── 3 · What the next run would do ─────────────────────────────────── */
  console.log("\n\x1b[1mThe next db:migrate would\x1b[0m");

  let pending = 0;
  let risky = 0;

  for (const entry of journal.entries) {
    if (!files.has(entry.tag)) continue;
    const sql = readFileSync(join(dir, `${entry.tag}.sql`), "utf8");

    if (appliedHashes.has(hashOf(sql))) continue;

    pending++;
    // Unguarded CREATEs are safe once. On a schema that already has them, they
    // are the thing that fails.
    const creates = (sql.match(/^\s*create (table|type|index|unique)/gim) ?? []).length;
    const guards = (sql.match(/if not exists/gi) ?? []).length;
    const safe = creates === 0 || guards >= creates;
    if (!safe) risky++;

    console.log(
      `  ${safe ? " " : "\x1b[31m!\x1b[0m"} apply ${entry.tag}` +
        (safe ? "" : `  — ${creates} unguarded CREATE(s), fails if already present`),
    );
  }

  if (pending === 0) ok("nothing — the database is up to date");

  if (risky > 0) {
    console.log(
      `\n\x1b[1mReconciling\x1b[0m\n` +
        `  ${risky} pending migration(s) are not safe to replay. If their objects\n` +
        `  already exist (because db:wing-ddl built the schema), record them as\n` +
        `  applied instead of running them:\n\n` +
        `    npm run wing:check-migrations -- --print-baseline\n\n` +
        `  That prints the INSERT statements. Read them before running them —\n` +
        `  marking a migration applied that genuinely has not been is how a\n` +
        `  column goes missing in a way nothing detects until a query fails.\n`,
    );
  }

  /* ── 4 · The baseline, on request ───────────────────────────────────── */
  if (process.argv.includes("--print-baseline")) {
    console.log("\x1b[1m-- Baseline inserts\x1b[0m");
    console.log("-- Marks migrations as applied WITHOUT running them.");
    console.log("-- Only correct if every object they create already exists.\n");
    for (const entry of journal.entries) {
      if (!files.has(entry.tag)) continue;
      const sql = readFileSync(join(dir, `${entry.tag}.sql`), "utf8");
      if (appliedHashes.has(hashOf(sql))) continue;
      console.log(
        `insert into drizzle.__drizzle_migrations (hash, created_at) ` +
          `values ('${hashOf(sql)}', ${entry.when});  -- ${entry.tag}`,
      );
    }
    console.log("");
  }

  console.log("");
  await pool.end();
}

main().catch((err) => {
  console.error("[check-migrations] failed:", err);
  process.exit(1);
});

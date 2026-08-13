import "dotenv/config";
import pg from "pg";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadSecretFromVault } from "./config";

/**
 * Applies versioned SQL migrations from ./migrations idempotently.
 *
 * Generate migrations with `npm run db:generate` (drizzle-kit generate) and
 * apply them with `npm run db:migrate`. This replaces `drizzle-kit push` for
 * anything other than local scratch work, so schema changes are reviewable and
 * repeatable across environments.
 *
 * DATABASE_URL resolution, in order:
 *   1. the environment / .env  — local runs and any CI that can reach the DB
 *   2. Key Vault via managed identity, if KEY_VAULT_URI is set
 *
 * (2) exists because the stage/production database is VNet-only: a hosted
 * pipeline agent cannot reach it, so migrations run as a Container Apps job
 * inside the VNet. That job gets the connection string the same way the app
 * does rather than from a second copy of the secret — one source of truth, and
 * rotating the password stays a single operation.
 */

const { Pool } = pg;

async function main() {
  if (!(await loadSecretFromVault("DATABASE_URL"))) {
    throw new Error(
      "DATABASE_URL must be set in the environment, or available as the " +
        "'DATABASE-URL' secret in the vault named by KEY_VAULT_URI",
    );
  }

  const useSsl = process.env.DATABASE_SSL !== "false";
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 1,
  });

  const db = drizzle(pool);

  /*
   * pgvector, before anything that declares a vector column.
   *
   * Migration 0003 declares `vector(1536)` on `life_log_entries` and
   * `user_memory_embeddings` and builds an HNSW index over the second, so
   * `db:migrate` against a FRESH database fails at 0003 unless the extension
   * already exists. It was only ever a prose step in
   * PHASE_1_AZURE_MIGRATION_PLAN.md — fine on stage, where it was done by hand
   * months ago and has been invisibly satisfied ever since, and not fine on the
   * production cutover path, which has never run.
   *
   * IF NOT EXISTS, so it is a no-op on every database that already has it.
   *
   * PRECONDITION THIS CANNOT MEET: `vector` must be in the server's
   * `azure.extensions` allow-list first. That is a server parameter on the
   * Flexible Server, it can require a restart to take effect, and it is not
   * something a migration can do for itself. If this throws with
   * "extension \"vector\" is not allow-listed", that is the fix — not a code
   * change. Better to fail here, on the first statement, with a clear message,
   * than four migrations later inside a cutover window.
   */
  console.log("[migrate] ensuring pgvector ...");
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

  console.log("[migrate] applying migrations from ./migrations ...");
  await migrate(db, { migrationsFolder: "./migrations" });
  console.log("[migrate] done");

  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});

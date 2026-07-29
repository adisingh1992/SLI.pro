import "dotenv/config";
import pg from "pg";
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

  console.log("[migrate] applying migrations from ./migrations ...");
  await migrate(db, { migrationsFolder: "./migrations" });
  console.log("[migrate] done");

  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});

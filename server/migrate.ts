import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/**
 * Applies versioned SQL migrations from ./migrations idempotently.
 *
 * Generate migrations with `npm run db:generate` (drizzle-kit generate) and
 * apply them with `npm run db:migrate`. This replaces `drizzle-kit push` for
 * anything other than local scratch work, so schema changes are reviewable and
 * repeatable across environments.
 *
 * DATABASE_URL must be set in the environment when this runs (CI/CD sets it;
 * it is not fetched from Key Vault here).
 */

const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to run migrations");
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

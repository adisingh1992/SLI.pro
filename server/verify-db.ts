import "dotenv/config";
import pg from "pg";
import { loadSecretFromVault } from "./config";

/**
 * Connectivity + state check for the target database.
 * Run with: npm run db:verify   (VPN must be connected for the private stage DB)
 * DATABASE_URL resolves from the environment first, then Key Vault, exactly like
 * server/migrate.ts and the other standalone database scripts.
 *
 * Reports: server version, applied drizzle migrations, table count/list, and
 * whether the pgvector extension is available and enabled.
 */

const { Pool } = pg;

async function main() {
  if (!(await loadSecretFromVault("DATABASE_URL"))) {
    throw new Error(
      "DATABASE_URL must be set in the environment, or available as the " +
        "'DATABASE-URL' secret in the vault named by KEY_VAULT_URI",
    );
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL !== "false" ? { rejectUnauthorized: false } : false,
    max: 1,
  });

  const q = async (sql: string) => (await pool.query(sql)).rows;

  const [{ version }] = await q("SELECT version()");
  console.log(`\n[db] connected: ${version.split(",")[0]}`);

  // Applied migrations (drizzle tracks these in its own schema)
  try {
    const applied = await q(
      `SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`,
    );
    console.log(`[db] applied migrations: ${applied.length}`);
  } catch {
    console.log("[db] no drizzle migrations table found (nothing applied yet)");
  }

  const tables = await q(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  console.log(`[db] public tables: ${tables.length}`);
  console.log(tables.map((t: any) => `      - ${t.tablename}`).join("\n"));

  // pgvector: available in the server's allow-list, and actually created?
  const avail = await q(`SELECT name FROM pg_available_extensions WHERE name = 'vector'`);
  const enabled = await q(`SELECT extname FROM pg_extension WHERE extname = 'vector'`);
  console.log(
    `\n[db] pgvector available: ${avail.length > 0 ? "yes" : "NO"} | enabled: ${
      enabled.length > 0 ? "yes" : "NO — run: CREATE EXTENSION vector;"
    }`,
  );

  // ── Wing schema (post-migration data model) ──────────────────────────────
  const wingTables = await q(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'wing' ORDER BY tablename`,
  );
  console.log(`\n[wing] tables: ${wingTables.length} (expected 44)`);
  if (wingTables.length) {
    const enums = await q(
      `SELECT t.typname FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'wing' AND t.typtype = 'e'`,
    );
    console.log(`[wing] enum types: ${enums.length} (expected 47)`);

    const hnsw = await q(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'wing' AND indexdef ILIKE '%hnsw%'`,
    );
    console.log(
      `[wing] HNSW vector index: ${hnsw.length ? hnsw[0].indexname : "MISSING"}`,
    );

    // The two non-negotiables from the spec.
    const turnCols = await q(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='wing' AND table_name='transcript_turns'
       ORDER BY ordinal_position`,
    );
    console.log(
      `[wing] transcript_turns columns: ${turnCols.map((c: any) => c.column_name).join(", ")}`,
    );

    const turnTypes = await q(
      `SELECT e.enumlabel FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname='wing' AND t.typname='turn_type' ORDER BY e.enumsortorder`,
    );
    console.log(
      `[wing] turn_type values: ${turnTypes.map((r: any) => r.enumlabel).join(" · ")}`,
    );
  } else {
    console.log("[wing] schema not found — run: npm run db:migrate");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[db] verification failed:", err.message);
  process.exit(1);
});

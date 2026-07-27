import "dotenv/config";
import pg from "pg";

/**
 * Connectivity + state check for the target database.
 * Run with: npm run db:verify   (VPN must be connected for the private stage DB)
 *
 * Reports: server version, applied drizzle migrations, table count/list, and
 * whether the pgvector extension is available and enabled.
 */

const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");

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

  await pool.end();
}

main().catch((err) => {
  console.error("[db] verification failed:", err.message);
  process.exit(1);
});

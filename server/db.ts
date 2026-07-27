import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Azure Database for PostgreSQL Flexible Server requires TLS. Set
// DATABASE_SSL=false only for a local (Docker) Postgres without TLS.
//
// For staging we do not pin the Azure CA (rejectUnauthorized: false) to avoid
// bundling the certificate chain. For PRODUCTION, tighten this to
// { rejectUnauthorized: true, ca: <Azure CA bundle> }.
const useSsl = process.env.DATABASE_SSL !== "false";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DATABASE_POOL_MAX || "10", 10),
});

export const db = drizzle(pool, { schema });

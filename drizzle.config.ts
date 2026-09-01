import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` only needs the schema, so DATABASE_URL is not required
// to generate migrations. Direct drizzle-kit commands such as `db:push` need it
// in the environment. The repository's `npm run db:migrate` entrypoint is different:
// server/migrate.ts hydrates it from Key Vault first when no local override exists.
export default defineConfig({
  out: "./migrations",
  // Legacy MVP tables (public) + the Wing post-migration model (wing schema).
  schema: ["./shared/schema.ts", "./shared/wing-schema.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});

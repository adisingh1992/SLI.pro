import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` only needs the schema, so DATABASE_URL is not required
// to generate migrations. `db:push` / `db:migrate` do need it and will fail
// with a clear connection error if it is empty.
export default defineConfig({
  out: "./migrations",
  // Legacy MVP tables (public) + the Wing post-migration model (wing schema).
  schema: ["./shared/schema.ts", "./shared/wing-schema.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});

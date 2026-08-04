-- Public-schema prerequisites for a migration rehearsal.
--
-- WHY THIS EXISTS RATHER THAN JUST RUNNING THE MIGRATION FILES
-- `db:wing-ddl` gets re-run every rehearsal, but migration 0001 and 0004 use
-- bare `ADD COLUMN` / `CREATE TABLE`, so a second run dies with
-- `column "blob_key" of relation "documents" already exists`. The wing parts
-- are fine to re-run as-is because `DROP SCHEMA wing CASCADE` precedes them;
-- these two touch `public`, which is only re-created when you take a fresh
-- restore. Restated here as idempotent so the script survives repetition.
--
-- Contents match migrations 0001 and 0004 exactly. If either changes, change
-- this too — they are duplicated on purpose, since the originals must stay
-- non-idempotent for the real `db:migrate` path against an empty production
-- database.

-- 0001 · documents.blob_key + nullable file_data.
-- Production predates this migration, so the column genuinely does not exist
-- there. Without it, migrate-data dies on its first document read: Drizzle
-- selects every column declared in shared/schema.ts, blob_key included.
ALTER TABLE "documents" ALTER COLUMN "file_data" DROP NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "blob_key" text;

-- 0004 · public.wing_migration_links.
-- Never created in production (nothing there writes to it), so it is absent
-- from the dump. migrate-data reaches it transitively via commerce-store ->
-- bootstrap.ts.
CREATE TABLE IF NOT EXISTS "wing_migration_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "legacy_type" text NOT NULL,
  "legacy_id" integer NOT NULL,
  "wing_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "wing_migration_links_legacy_type_legacy_id_unique" UNIQUE("legacy_type","legacy_id")
);
CREATE INDEX IF NOT EXISTS "wing_migration_links_lookup_idx"
  ON "wing_migration_links" USING btree ("legacy_type","legacy_id");

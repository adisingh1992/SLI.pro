-- Analysis methodology: how a finished transcript is read.
--
-- ── MADE REPLAY-SAFE ────────────────────────────────────────────────────────
-- Originally plain CREATE statements. Rewritten with guards because the stage
-- database had this applied by `db:wing-ddl` (psql) while drizzle's
-- `__drizzle_migrations` table had no record of it — so every pipeline run
-- reached this file, tried to create `analysis_methodology_id_seq` a second
-- time, and failed with 42P07.
--
-- Guarding here rather than hand-inserting a row into drizzle's tracking table
-- means any environment can be brought forward by `db:migrate` regardless of
-- how its schema was originally built. A baseline INSERT fixes one database;
-- this fixes the next one too.

CREATE TABLE IF NOT EXISTS "wing"."analysis_methodology" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."analysis_methodology_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"population_tag" text NOT NULL,
	"session_type" "wing"."session_type" NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"status" "wing"."publish_status" DEFAULT 'draft' NOT NULL,
	"sections" jsonb NOT NULL,
	"change_note" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS. Catching duplicate_object is
-- the pattern drizzle-kit itself emits for constraints.
DO $$ BEGIN
	ALTER TABLE "wing"."analysis_methodology" ADD CONSTRAINT "analysis_methodology_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analysis_methodology_lookup_idx" ON "wing"."analysis_methodology" USING btree ("population_tag","session_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "analysis_methodology_published_unique" ON "wing"."analysis_methodology" USING btree ("population_tag","session_type") WHERE "wing"."analysis_methodology"."status" = 'published';

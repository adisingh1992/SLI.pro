-- 0040 — accumulated schema drift, made replay-safe.
--
-- This file started as drizzle-kit's raw `db:generate` output — unguarded CREATE
-- TABLE/TYPE and bare ADD CONSTRAINT statements, no IF NOT EXISTS, no transaction
-- wrapper — which is why `wing:check-migrations`'s replaySafe() rejected it: 36
-- CREATE(s) with 0 IF NOT EXISTS, and 30 CREATE TYPE/ADD CONSTRAINT statements with
-- 0 duplicate_object guards. Every statement below is unchanged in effect; each one
-- is now wrapped or suffixed the same way 0023, 0038 and 0039 already are: CREATE
-- TABLE/INDEX get IF NOT EXISTS, CREATE TYPE and ADD CONSTRAINT get a
-- `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` block, ADD
-- COLUMN and ALTER TYPE ADD VALUE get IF NOT EXISTS too (not required by
-- replaySafe(), which only checks the first two categories, but genuinely needed
-- for this file to survive a second run).
--
-- ── WHY THIS ONE FILE IS SO LARGE, AND WHAT TO CHECK BEFORE RUNNING IT ──────────
-- Only two of these objects are new work from this session: the "radar_suggested_
-- action" enum and "radar_suggestions" table (H-701, Baby Radar). Everything else
-- here — new tables "analysis_methodology", "coaching_notes", "content_activity_
-- log", "gate_audit_findings", "homework_assignments", "monthly_check_ins",
-- "objective_sets", "prompt_openers", "self_descriptions", "student_demographics",
-- "turn_objectives", the four heuristic_component_type enum values, and every ADD
-- COLUMN below — already has its own earlier, already-guarded migration file:
-- 0008, 0009, 0010, 0013, 0014, 0021, 0023/0024, 0031, 0035, and others through
-- 0039. drizzle-kit's `generate` diffs the current schema.ts against ITS OWN
-- internal snapshot history, not against these files' contents — so if any of
-- that snapshot history was built out of band (by hand-writing a migration
-- instead of running `generate`, which is exactly what 0023's own header
-- describes happening to it), drizzle-kit has no record those objects exist and
-- will regenerate them from scratch the next time schema.ts changes, however
-- unrelated the actual change was. That is most likely what happened here.
--
-- The IF NOT EXISTS / duplicate_object guards below make this file safe to run
-- either way — a no-op for whatever already exists, a real create for whatever
-- does not. But "safe to run" is not the same as "known to be correct": before
-- running `db:migrate` on a file this size, run `npm run wing:check-migrations`
-- first — it is the tool this codebase already built for exactly this situation,
-- and it will say whether the target database already has these objects.

BEGIN;

DO $$ BEGIN
  CREATE TYPE "wing"."content_activity_event_type" AS ENUM('trigger_fired', 'trigger_declined', 'coaching_round', 'draft_started', 'draft_abandoned', 'published');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "wing"."content_trigger_type" AS ENUM('comment', 'post', 'article', 'dm', 'connection_request');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "wing"."gate_finding_mode" AS ENUM('violation', 'review');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "wing"."heuristic_card_kind" AS ENUM('coaching_card', 'integrity_gate', 'exercise');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "wing"."heuristic_intervention_type" AS ENUM('COACH', 'CHALLENGE', 'REDIRECT', 'REFRAME', 'AFFIRM', 'META', 'GATE', 'ELICIT', 'OBSERVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "wing"."radar_suggested_action" AS ENUM('comment', 'post', 'save_for_later');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "wing"."self_description_equivalence" AS ENUM('exact', 'approximate');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "wing"."self_description_provenance" AS ENUM('spontaneous', 'elicited', 'coached');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
ALTER TYPE "wing"."heuristic_component_type" ADD VALUE IF NOT EXISTS 'detection_method';

--> statement-breakpoint
ALTER TYPE "wing"."heuristic_component_type" ADD VALUE IF NOT EXISTS 'delivery_adaptation';

--> statement-breakpoint
ALTER TYPE "wing"."heuristic_component_type" ADD VALUE IF NOT EXISTS 'failure_path';

--> statement-breakpoint
ALTER TYPE "wing"."heuristic_component_type" ADD VALUE IF NOT EXISTS 'success_criteria';

--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "wing"."coaching_notes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."coaching_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"author_user_id" bigint,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wing"."content_activity_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."content_activity_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"trigger_type" "wing"."content_trigger_type" NOT NULL,
	"event_type" "wing"."content_activity_event_type" NOT NULL,
	"content_draft_id" bigint,
	"coaching_round" smallint,
	"trigger_source" text,
	"source_type" "wing"."source_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wing"."gate_audit_findings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."gate_audit_findings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"session_id" bigint NOT NULL,
	"turn_id" bigint,
	"heuristic_id" bigint NOT NULL,
	"card_code" text NOT NULL,
	"mode" "wing"."gate_finding_mode" NOT NULL,
	"matched" text NOT NULL,
	"excerpt" text NOT NULL,
	"status" "wing"."pattern_status" DEFAULT 'pending_review' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wing"."homework_assignments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."homework_assignments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"assigned_by_user_id" bigint,
	"question_text" text NOT NULL,
	"answer_text" text,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wing"."monthly_check_ins" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."monthly_check_ins_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"month" text NOT NULL,
	"content_posts" integer DEFAULT 0 NOT NULL,
	"content_links" text[] DEFAULT '{}' NOT NULL,
	"engagement_frequency" text,
	"new_connections" integer DEFAULT 0 NOT NULL,
	"target_connection_percentage" text,
	"recommendation_implementation" text,
	"implementation_challenges" text,
	"updated_profile_visuals" boolean DEFAULT false NOT NULL,
	"screenshot_uris" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wing"."objective_sets" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."objective_sets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_type" "wing"."session_type" NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"status" "wing"."publish_status" DEFAULT 'draft' NOT NULL,
	"objectives" jsonb NOT NULL,
	"change_note" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wing"."prompt_openers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."prompt_openers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pool" text NOT NULL,
	"text" text NOT NULL,
	"placeholders" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wing"."radar_suggestions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."radar_suggestions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"topic" text NOT NULL,
	"why_relevant" text NOT NULL,
	"suggested_action" "wing"."radar_suggested_action" NOT NULL,
	"engaged_at" timestamp with time zone
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wing"."self_descriptions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."self_descriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"session_id" bigint NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_module" text NOT NULL,
	"source_question" text,
	"asked_as" text NOT NULL,
	"equivalence" "wing"."self_description_equivalence",
	"verbatim_text" text NOT NULL,
	"provenance" "wing"."self_description_provenance" NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wing"."student_demographics" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."student_demographics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"age" smallint,
	"gender" text,
	"gender_self_describe" text,
	"ethnicities" text[] DEFAULT '{}' NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"privacy_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_demographics_student_id_unique" UNIQUE("student_id")
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wing"."turn_objectives" (
	"turn_id" bigint NOT NULL,
	"session_id" bigint NOT NULL,
	"objective_key" text NOT NULL,
	"satisfied_here" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turn_objectives_turn_id_unique" UNIQUE("turn_id")
);

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ALTER COLUMN "category" DROP NOT NULL;

--> statement-breakpoint
ALTER TABLE "wing"."content_drafts" ADD COLUMN IF NOT EXISTS "share_count" integer DEFAULT 0 NOT NULL;

--> statement-breakpoint
ALTER TABLE "wing"."engagement_sequence_states" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

--> statement-breakpoint
ALTER TABLE "wing"."heuristic_sequence_entries" ADD COLUMN IF NOT EXISTS "applies_to_session" "wing"."session_type";

--> statement-breakpoint
-- ⚠ Unlike every other ADD COLUMN below, this one has no DEFAULT. IF NOT EXISTS
-- makes the guard idempotent, but it does not make the first application safe: if
-- "wing"."heuristics" already has rows, this statement fails outright (NOT NULL
-- violation on the existing rows), guard or no guard. Confirm the table is either
-- empty or fully repopulated by a seed step before this runs, or add a DEFAULT /
-- backfill step ahead of it. Not something this pass invents a value for.
ALTER TABLE "wing"."heuristics" ADD COLUMN IF NOT EXISTS "card_code" text NOT NULL;

--> statement-breakpoint
ALTER TABLE "wing"."heuristics" ADD COLUMN IF NOT EXISTS "intervention_type" "wing"."heuristic_intervention_type";

--> statement-breakpoint
ALTER TABLE "wing"."heuristics" ADD COLUMN IF NOT EXISTS "card_kind" "wing"."heuristic_card_kind" DEFAULT 'coaching_card' NOT NULL;

--> statement-breakpoint
ALTER TABLE "wing"."institutions" ADD COLUMN IF NOT EXISTS "email_domains" text[] DEFAULT '{}' NOT NULL;

--> statement-breakpoint
ALTER TABLE "wing"."message_events" ADD COLUMN IF NOT EXISTS "opener_id" bigint;

--> statement-breakpoint
ALTER TABLE "wing"."message_events" ADD COLUMN IF NOT EXISTS "failed_at" timestamp with time zone;

--> statement-breakpoint
ALTER TABLE "wing"."message_events" ADD COLUMN IF NOT EXISTS "failure_reason" text;

--> statement-breakpoint
ALTER TABLE "wing"."message_events" ADD COLUMN IF NOT EXISTS "reply_token" text;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "prompt_code" text;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "behavioral_signal" text;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "signal_category" text;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "signal_category_because" text;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "signal_category_source" text;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "evidence_tier" smallint;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "evidence_tier_because" text;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "evidence_tier_source" text;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "audience_scope" text;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "cadence" text;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "delivery_marker" text;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "library" text;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "event_sensitive" boolean DEFAULT false NOT NULL;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "source_document" text;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "source_block" text;

--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "source_line" integer;

--> statement-breakpoint
ALTER TABLE "wing"."students" ADD COLUMN IF NOT EXISTS "internship_start_date" date;

--> statement-breakpoint
ALTER TABLE "wing"."students" ADD COLUMN IF NOT EXISTS "onboarding_step" integer DEFAULT 0 NOT NULL;

--> statement-breakpoint
ALTER TABLE "wing"."students" ADD COLUMN IF NOT EXISTS "onboarding_complete" boolean DEFAULT false NOT NULL;

--> statement-breakpoint
ALTER TABLE "wing"."transcript_turns" ADD COLUMN IF NOT EXISTS "analysis_eligible" boolean DEFAULT true NOT NULL;

--> statement-breakpoint
ALTER TABLE "wing"."transcript_turns" ADD COLUMN IF NOT EXISTS "analysis_exclusion_reason" text;

--> statement-breakpoint
ALTER TABLE "wing"."user_channel_preferences" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

--> statement-breakpoint
ALTER TABLE "wing"."users" ADD COLUMN IF NOT EXISTS "institution_id" bigint;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."analysis_methodology" ADD CONSTRAINT "analysis_methodology_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."coaching_notes" ADD CONSTRAINT "coaching_notes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."coaching_notes" ADD CONSTRAINT "coaching_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."content_activity_log" ADD CONSTRAINT "content_activity_log_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."content_activity_log" ADD CONSTRAINT "content_activity_log_content_draft_id_content_drafts_id_fk" FOREIGN KEY ("content_draft_id") REFERENCES "wing"."content_drafts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."gate_audit_findings" ADD CONSTRAINT "gate_audit_findings_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."gate_audit_findings" ADD CONSTRAINT "gate_audit_findings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "wing"."sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."gate_audit_findings" ADD CONSTRAINT "gate_audit_findings_turn_id_transcript_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "wing"."transcript_turns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."gate_audit_findings" ADD CONSTRAINT "gate_audit_findings_heuristic_id_heuristics_id_fk" FOREIGN KEY ("heuristic_id") REFERENCES "wing"."heuristics"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."homework_assignments" ADD CONSTRAINT "homework_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."homework_assignments" ADD CONSTRAINT "homework_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."monthly_check_ins" ADD CONSTRAINT "monthly_check_ins_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."objective_sets" ADD CONSTRAINT "objective_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."radar_suggestions" ADD CONSTRAINT "radar_suggestions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."self_descriptions" ADD CONSTRAINT "self_descriptions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."self_descriptions" ADD CONSTRAINT "self_descriptions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "wing"."sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."student_demographics" ADD CONSTRAINT "student_demographics_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."turn_objectives" ADD CONSTRAINT "turn_objectives_turn_id_transcript_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "wing"."transcript_turns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."turn_objectives" ADD CONSTRAINT "turn_objectives_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "wing"."sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analysis_methodology_lookup_idx" ON "wing"."analysis_methodology" USING btree ("population_tag","session_type","status");

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "analysis_methodology_published_unique" ON "wing"."analysis_methodology" USING btree ("population_tag","session_type") WHERE "wing"."analysis_methodology"."status" = 'published';

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coaching_notes_student_created_idx" ON "wing"."coaching_notes" USING btree ("student_id","created_at");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_activity_log_student_trigger_idx" ON "wing"."content_activity_log" USING btree ("student_id","trigger_type","occurred_at");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_activity_log_student_event_idx" ON "wing"."content_activity_log" USING btree ("student_id","event_type");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_audit_findings_card_status_idx" ON "wing"."gate_audit_findings" USING btree ("card_code","status");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_audit_findings_student_idx" ON "wing"."gate_audit_findings" USING btree ("student_id","detected_at");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_audit_findings_session_idx" ON "wing"."gate_audit_findings" USING btree ("session_id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_assignments_student_created_idx" ON "wing"."homework_assignments" USING btree ("student_id","created_at");

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_check_ins_student_month_unique" ON "wing"."monthly_check_ins" USING btree ("student_id","month");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "objective_sets_lookup_idx" ON "wing"."objective_sets" USING btree ("session_type","status");

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "objective_sets_published_unique" ON "wing"."objective_sets" USING btree ("session_type") WHERE "wing"."objective_sets"."status" = 'published';

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_openers_pool_idx" ON "wing"."prompt_openers" USING btree ("active","pool");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "radar_suggestions_student_generated_idx" ON "wing"."radar_suggestions" USING btree ("student_id","generated_at");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "radar_suggestions_student_engaged_idx" ON "wing"."radar_suggestions" USING btree ("student_id","engaged_at");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "self_descriptions_student_idx" ON "wing"."self_descriptions" USING btree ("student_id","captured_at");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "self_descriptions_question_idx" ON "wing"."self_descriptions" USING btree ("student_id","source_question","captured_at");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "turn_objectives_session_idx" ON "wing"."turn_objectives" USING btree ("session_id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "turn_objectives_objective_idx" ON "wing"."turn_objectives" USING btree ("objective_key");

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."message_events" ADD CONSTRAINT "message_events_opener_id_prompt_openers_id_fk" FOREIGN KEY ("opener_id") REFERENCES "wing"."prompt_openers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wing"."users" ADD CONSTRAINT "users_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "wing"."institutions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "freshness_reports_student_idx" ON "wing"."freshness_reports" USING btree ("student_id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "heuristic_sequence_entries_session_idx" ON "wing"."heuristic_sequence_entries" USING btree ("sequence_id","applies_to_session");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "heuristics_kind_status_idx" ON "wing"."heuristics" USING btree ("card_kind","status");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linkedin_optimizations_student_idx" ON "wing"."linkedin_optimizations" USING btree ("student_id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_library_selection_idx" ON "wing"."prompt_library" USING btree ("active","cadence","library","audience_scope");

--> statement-breakpoint
-- A UNIQUE constraint is backed by an index, and Postgres raises duplicate_table (42P07,
-- "relation ... already exists"), not duplicate_object, when that index name is taken —
-- 0010's own version of this exact statement already catches both for exactly this reason.
DO $$ BEGIN
  ALTER TABLE "wing"."heuristics" ADD CONSTRAINT "heuristics_card_code_unique" UNIQUE("card_code");
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;

COMMIT;

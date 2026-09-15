-- Reconciles "wing"."harness_personas" with the current shape of migration 0042, for any
-- database where 0042 was already applied under an earlier version of its own file.
--
-- WHY THIS EXISTS: 0042_harness_personas.sql got edited twice after this table had already
-- been migrated once — once to swap `spec_body`/`source_note` for the eight named content
-- fields, once to drop `related_personas`. drizzle-orm's `migrate()` tracks which
-- migrations have run by a hash of each file's contents, not by filename. Editing an
-- already-applied migration's SQL doesn't retroactively re-run it against a database
-- that's already past that point — drizzle just sees a new hash for "0042" and (harmlessly)
-- runs the new file's text once more, whose `CREATE TABLE IF NOT EXISTS` is a no-op against
-- a table that already exists. Net effect: the physical table stayed on whichever shape of
-- 0042 was live the first time `npm run db:migrate` actually ran, while
-- `shared/wing-schema.ts` had already moved on to the eight-field shape — the exact
-- mismatch behind "column quick_reference does not exist".
--
-- This migration is the one-time reconciliation, and it's safe regardless of which shape of
-- 0042 ran first (the original spec_body/source_note version, or the eight-field +
-- related_personas version): every statement below is IF EXISTS / IF NOT EXISTS, so a
-- database that's already fully caught up — e.g. a brand-new install created straight from
-- today's 0042 — sees no-ops throughout and this migration changes nothing.
--
-- LESSON FOR NEXT TIME, RECORDED HERE ON PURPOSE: don't hand-edit an already-applied
-- migration's file. A table whose shape changes after being migrated once gets a new
-- migration, always — this file is that new migration, arriving late for the two edits
-- that preceded it.

BEGIN;

ALTER TABLE "wing"."harness_personas"
  ADD COLUMN IF NOT EXISTS "quick_reference" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "readiness_by_behavior" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "interaction_policy" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "voice_sample" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "diamond" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "cold_start_note" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "system_prompt_summary" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "what_this_tests" text NOT NULL DEFAULT '';--> statement-breakpoint

ALTER TABLE "wing"."harness_personas"
  DROP COLUMN IF EXISTS "spec_body",
  DROP COLUMN IF EXISTS "source_note",
  DROP COLUMN IF EXISTS "related_personas";--> statement-breakpoint

COMMIT;

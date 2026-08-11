-- Onboarding progress moves from public.profiles onto wing.students.
--
-- public.profiles.user_id has a foreign key to public.users, but registration
-- creates a wing.users row — so every new signup failed the constraint.
-- Migrated users have rows in both tables, which is why it only ever affected
-- people actually registering.
--
-- ── THE BACKFILL MUST NOT RUN TWICE ─────────────────────────────────────────
-- The columns are trivially guarded. The UPDATE is not: `public.profiles` is a
-- frozen legacy table, and re-running this would copy a stale
-- `completion_step` over a student's current progress. A student who has since
-- finished onboarding would be silently reset to wherever the old MVP thought
-- they were — a regression that looks like a product bug, months later, with
-- nothing pointing back here.
--
-- So it only touches rows still at their defaults. That makes it a backfill in
-- the strict sense: it fills what is empty and never overwrites what is not.

ALTER TABLE "wing"."students" ADD COLUMN IF NOT EXISTS "onboarding_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wing"."students" ADD COLUMN IF NOT EXISTS "onboarding_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Carry across whatever the legacy table holds for already-migrated students,
-- matched through the email the migration used. Skipped silently when the
-- legacy tables are absent, so a fresh production database is unaffected.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    UPDATE "wing"."students" s
    SET "onboarding_step" = COALESCE(p.completion_step, 0),
        "onboarding_complete" = COALESCE(p.is_complete, false)
    FROM "public"."profiles" p
    JOIN "public"."users" lu ON lu.id = p.user_id
    JOIN "wing"."users" wu ON lower(wu.email) = lower(lu.username)
    WHERE s.user_id = wu.id
      -- Untouched since the column was added. See the note above.
      AND s."onboarding_step" = 0
      AND s."onboarding_complete" = false;
  END IF;
END $$;

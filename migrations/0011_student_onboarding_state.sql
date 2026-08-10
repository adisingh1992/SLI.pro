-- Onboarding progress moves from public.profiles onto wing.students.
--
-- public.profiles.user_id has a foreign key to public.users, but registration
-- creates a wing.users row — so every new signup failed the constraint.
-- Migrated users have rows in both tables, which is why it only ever affected
-- people actually registering.

ALTER TABLE "wing"."students" ADD COLUMN "onboarding_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wing"."students" ADD COLUMN "onboarding_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint

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
    WHERE s.user_id = wu.id;
  END IF;
END $$;

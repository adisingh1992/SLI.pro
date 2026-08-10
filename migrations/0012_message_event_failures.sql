-- message_events records a send whether or not the provider accepted it, but it
-- had no way to say which. Every row looked delivered.
--
-- That is not a reporting inconvenience. alreadySent() reads this table to stop
-- duplicate welcome emails, so a send SendGrid refused suppressed its own retry
-- forever: the student never received it and the system was certain they had.
-- The advisor snapshot had the same shape — the appointment was stamped as sent
-- and the admin was told it went.

-- IF NOT EXISTS so this file is safe to re-run on its own, which is how it will
-- be applied to an environment that is already up rather than rebuilt.
ALTER TABLE "wing"."message_events" ADD COLUMN IF NOT EXISTS "failed_at" timestamptz;--> statement-breakpoint
ALTER TABLE "wing"."message_events" ADD COLUMN IF NOT EXISTS "failure_reason" text;--> statement-breakpoint

-- Partial index: the queries that matter ask "what actually reached this
-- student", so the common path filters failed_at IS NULL.
CREATE INDEX IF NOT EXISTS "message_events_failed_idx"
  ON "wing"."message_events" ("student_id", "template_key")
  WHERE "failed_at" IS NULL;--> statement-breakpoint

-- Existing rows are left as NULL rather than backfilled to "succeeded". We do
-- not know whether they went; NULL says exactly that, and the alternative would
-- be inventing a delivery record.

-- 0031 — which opener went with a prompt.
--
-- Her Integration Note asks for the opener pool to be "implemented as a separate layer —
-- the system selects the opener independently of the prompt, ensuring variety in how
-- prompts feel even when the underlying question repeats at the 14-day minimum interval."
--
-- Independent selection needs its own memory. `message_events.prompt_id` already records
-- which question was asked, and that is what the 14-day no-repeat rule queries. Nothing
-- records which greeting carried it, so "do not send the same opener twice running" had
-- nowhere to read from — the variety her note is asking for would have been a coin toss
-- over fourteen strings, which lands on the same one about one time in fourteen.
--
-- ── WHY ON message_events AND NOT ON THE STUDENT ────────────────────────────
-- Same reasoning the no-repeat rule already follows, in `messaging-store`'s own words:
-- "the no-repeat rule is a query against message_events rather than an array column on the
-- student — so adding a prompt to the library takes effect immediately and retiring one
-- does not leave a dangling reference."
--
-- A `last_opener_id` on the student would be a second place to keep the same fact, and it
-- would go stale the first time a send failed after the column was written.
--
-- ── NULLABLE, AND MOST ROWS WILL STAY NULL ──────────────────────────────────
-- Only the life-log prompt carries an opener. Welcome emails, dormancy nudges, advisor
-- snapshots and session-completion messages have their own copy and are not greeted from
-- her pool. NULL here means "this message had no opener", which is the truth for every
-- row written before today and for most rows written after.

BEGIN;

ALTER TABLE "wing"."message_events"
  ADD COLUMN IF NOT EXISTS "opener_id" integer;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."message_events"
    ADD CONSTRAINT "message_events_opener_id_fk"
    FOREIGN KEY ("opener_id") REFERENCES "wing"."prompt_openers"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- The read is "the last opener this student was sent", so the index is on the student and
-- the send time, partial on the rows that have one. Most of the table does not.
CREATE INDEX IF NOT EXISTS "message_events_opener_idx"
  ON "wing"."message_events" ("student_id", "sent_at" DESC)
  WHERE "opener_id" IS NOT NULL;--> statement-breakpoint

COMMENT ON COLUMN "wing"."message_events"."opener_id" IS
  'The greeting from wing.prompt_openers that carried this message, when it had one. '
  'Selected independently of prompt_id, per her Integration Notes, and read back so the '
  'same opener does not arrive twice running. NULL for every message that is not a '
  'life-log prompt.';

COMMIT;

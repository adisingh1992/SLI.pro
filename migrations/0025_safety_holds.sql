-- Safety holds: the record that IG-S01 fired, so contact can actually stop.
--
-- WHY THIS IS A TABLE AND NOT A COLUMN: a hold is an event with a time, and the
-- rule reads "days since IG-S01 fired". A boolean on the student cannot answer
-- that, and cannot answer it a second time either — the Reveal Cycle's Gate 1
-- asks "did IG-S01 fire within the trailing 7 days", which needs history, not
-- state. Rows also mean a hold is never silently overwritten by the next one.
--
-- WHY NOTHING HERE IS DELETED OR LIFTED: Danielle, 25 August — "Auto-resume is
-- itself a scheduled re-contact, which is exactly what the hold exists to
-- prevent." Seven days is a MINIMUM, not a duration. A hold ends because the
-- user came back on their own, which is `returned_at`, and never because a clock
-- ran out. There is deliberately no `expires_at`.
--
-- WHY `soft_check_in_sent_at` IS ON THE HOLD: her ruling permits exactly one
-- message, at day 30. One per hold, so the column belongs to the hold rather
-- than to the student, and "have we sent it" is answerable without a scan.
CREATE TABLE IF NOT EXISTS "wing"."safety_holds" (
  "id" bigserial PRIMARY KEY,
  "student_id" bigint NOT NULL,
  -- Only IG-S01 today. Text rather than an enum: a second safety rule earning a
  -- hold is a methodology decision, and a migration should not be the thing that
  -- has to happen first for her to make it.
  "rule" text NOT NULL,
  "fired_at" timestamptz NOT NULL DEFAULT now(),
  -- Set when the user next writes to Wing of their own accord. The only lift.
  "returned_at" timestamptz,
  -- The single permitted message, per hold.
  "soft_check_in_sent_at" timestamptz,
  -- Never rendered to a user. For the admin surface and for a reviewer.
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."safety_holds"
    ADD CONSTRAINT "safety_holds_student_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "wing"."users"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;--> statement-breakpoint

-- The query every send makes: "does this student have a hold that has not been
-- returned from". Partial, because a returned hold is history and the hot path
-- never looks at it.
CREATE INDEX IF NOT EXISTS "safety_holds_active_idx"
  ON "wing"."safety_holds" ("student_id", "fired_at" DESC)
  WHERE "returned_at" IS NULL;--> statement-breakpoint

-- And the Reveal Cycle's Gate 1 question, which reads every hold regardless of
-- whether it has been returned from: "did IG-S01 fire in the trailing 7 days".
CREATE INDEX IF NOT EXISTS "safety_holds_student_fired_idx"
  ON "wing"."safety_holds" ("student_id", "fired_at" DESC);

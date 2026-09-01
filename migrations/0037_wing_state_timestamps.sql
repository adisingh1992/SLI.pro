-- 0037 — close the two remaining lifecycle-timestamp gaps in mutable Wing state.
--
-- Deliberately Wing-only. The public schema is deprecated and is not touched here.
-- Domain event tables retain their precise names (occurred_at, uploaded_at, applied_at,
-- etc.); this migration adds only timestamps whose information was previously lost.

BEGIN;

-- updated_at is overwritten whenever preferences change, so it cannot answer when the
-- consent/preferences row first existed. Preference rows are created with the user; the
-- user's created_at is therefore the honest historical backfill.
ALTER TABLE "wing"."user_channel_preferences"
  ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "wing"."user_channel_preferences" WHERE "created_at" IS NULL
  ) THEN
    UPDATE "wing"."user_channel_preferences" AS preference
    SET "created_at" = COALESCE("user"."created_at", preference."updated_at", now())
    FROM "wing"."users" AS "user"
    WHERE "user"."id" = preference."user_id"
      AND preference."created_at" IS NULL;

    -- The FK should make this unnecessary, but it keeps a partially reconciled database
    -- migratable without failing after the column has already been added.
    UPDATE "wing"."user_channel_preferences"
    SET "created_at" = COALESCE("updated_at", now())
    WHERE "created_at" IS NULL;
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "wing"."user_channel_preferences"
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint

COMMENT ON COLUMN "wing"."user_channel_preferences"."created_at" IS
  'When this preference and consent-state row was first created.';--> statement-breakpoint

-- started_at is already the creation event for a sequence-state row. What was missing
-- was the time its mutable cursor/status last advanced. For existing rows, the latest
-- matching message event is the strongest recoverable evidence; completed_at and
-- started_at are bounded fallbacks. next_run_at is deliberately excluded because it is
-- a future scheduler cursor, not evidence that a write happened at that time.
ALTER TABLE "wing"."engagement_sequence_states"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "wing"."engagement_sequence_states" WHERE "updated_at" IS NULL
  ) THEN
    WITH latest_sequence_event AS (
      SELECT
        "student_id",
        "sequence_key",
        max(COALESCE(
          "replied_at",
          "clicked_at",
          "opened_at",
          "delivered_at",
          "failed_at",
          "sent_at",
          "created_at"
        )) AS "last_event_at"
      FROM "wing"."message_events"
      WHERE "student_id" IS NOT NULL
        AND "sequence_key" IS NOT NULL
      GROUP BY "student_id", "sequence_key"
    )
    UPDATE "wing"."engagement_sequence_states" AS state
    SET "updated_at" = GREATEST(
      state."started_at",
      state."completed_at",
      latest_sequence_event."last_event_at"
    )
    FROM latest_sequence_event
    WHERE latest_sequence_event."student_id" = state."student_id"
      AND latest_sequence_event."sequence_key" = state."sequence_key"
      AND state."updated_at" IS NULL;

    UPDATE "wing"."engagement_sequence_states"
    SET "updated_at" = COALESCE("completed_at", "started_at", now())
    WHERE "updated_at" IS NULL;
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "wing"."engagement_sequence_states"
  ALTER COLUMN "updated_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint

COMMENT ON COLUMN "wing"."engagement_sequence_states"."updated_at" IS
  'When the mutable sequence cursor, schedule, or status last changed.';

COMMIT;

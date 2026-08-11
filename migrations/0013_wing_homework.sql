-- Homework moves from public.homework_assignments onto wing.
--
-- public.homework_assignments.user_id is a foreign key to public.users.
-- Registration creates a wing.users row and no public.users row at all, so both
-- assigning homework and answering it threw a constraint violation for every
-- student who registered after the cutover. Identical in shape to the
-- registration bug (public.profiles) and the questionnaire bug
-- (public.questionnaires).
--
-- The ids could not simply be repointed: migrate-identity inserted wing users
-- with fresh serials and merged one duplicate account (255 legacy -> 254 wing),
-- so legacy and wing user ids diverge. The backfill below therefore remaps
-- through email, which is the same join migrate-identity itself used.

CREATE TABLE IF NOT EXISTS "wing"."homework_assignments" (
  "id" serial PRIMARY KEY,
  "student_id" integer NOT NULL REFERENCES "wing"."students"("id") ON DELETE CASCADE,
  "assigned_by_user_id" integer REFERENCES "wing"."users"("id"),
  "question_text" text NOT NULL,
  "answer_text" text,
  "answered_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "homework_assignments_student_created_idx"
  ON "wing"."homework_assignments" ("student_id", "created_at");--> statement-breakpoint

-- Backfill, guarded so a database without the legacy tables is unaffected.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'homework_assignments') THEN

    INSERT INTO "wing"."homework_assignments"
      ("student_id", "assigned_by_user_id", "question_text", "answer_text",
       "answered_at", "created_at", "updated_at")
    SELECT
      s.id,
      -- The assigning admin may not exist in wing (staff accounts were not all
      -- migrated). NULL rather than dropping the row: who set the homework
      -- matters less than the homework, and the column is nullable for exactly
      -- this case.
      admin_w.id,
      h.question_text,
      h.answer_text,
      -- The legacy table has no answered_at. updated_at is the best available
      -- proxy AND ONLY when an answer exists — using it unconditionally would
      -- invent an answer time for unanswered homework.
      CASE WHEN h.answer_text IS NOT NULL THEN h.updated_at END,
      h.created_at,
      h.updated_at
    FROM "public"."homework_assignments" h
    JOIN "public"."users"  lu     ON lu.id = h.user_id
    JOIN "wing"."users"    wu     ON lower(wu.email) = lower(lu.username)
    JOIN "wing"."students" s      ON s.user_id = wu.id
    LEFT JOIN "public"."users" admin_l ON admin_l.id = h.admin_id
    LEFT JOIN "wing"."users"   admin_w ON lower(admin_w.email) = lower(admin_l.username)
    -- Idempotent: re-running must not duplicate. Matched on the natural key
    -- rather than an id, because ids are not carried across.
    WHERE NOT EXISTS (
      SELECT 1 FROM "wing"."homework_assignments" x
      WHERE x.student_id = s.id
        AND x.question_text = h.question_text
        AND x.created_at = h.created_at
    );

  END IF;
END $$;

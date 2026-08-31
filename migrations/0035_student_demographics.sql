-- 0035 — the institutional reporting block the signup form promises.
--
-- ── WHY THIS IS ITS OWN TABLE ───────────────────────────────────────────────
-- The signup screen collects age, gender, race/ethnicity and a marketing opt-in under a
-- specific promise, in its own words:
--
--     "Collected for [Institution] reporting. Does not affect your Wing experience."
--
-- That promise is only kept if nothing which builds a coaching prompt can read these
-- columns. A `gender` column on `wing.students` would be true the day it is added and
-- quietly false the first time somebody writes `select * from students` into a context
-- builder — which is exactly how `student_context` is assembled today.
--
-- So the promise is expressed as a join nobody makes. `buildStudentContext` and every
-- prompt assembler read `students`, `intake_records` and the transcript tables; none of
-- them touches this one, and a reviewer can check that claim with a single grep for the
-- table name rather than by auditing which columns of a wide row got selected.
--
-- ── AGE, AND THE ONE THING IT IS ALLOWED TO REACH ───────────────────────────
-- `minor_protection.ts` is built and tested and has never had a real input — it has been
-- inferring from conversation. A stated age is the first hard signal it could use, and
-- that is a SAFETY use, not a coaching one. It is deliberately not wired here: routing a
-- demographic column into a gate is a decision about what the promise above means, and it
-- belongs to whoever owns the privacy notice, not to this migration.
--
-- `age` and not `date_of_birth`: the form asks for an age, a year is enough for reporting,
-- and a date of birth is a stronger identifier than the purpose needs.

BEGIN;

CREATE TABLE IF NOT EXISTS "wing"."student_demographics" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "student_id" bigint NOT NULL UNIQUE,

  -- Nullable throughout. Every one of these is a question a student may decline, and the
  -- form's own vocabulary includes "Prefer not to say" — which is an answer, stored as
  -- itself, and distinct from NULL meaning never asked.
  "age" smallint,
  "gender" text,
  "gender_self_describe" text,
  "ethnicities" text[] NOT NULL DEFAULT '{}',

  "marketing_opt_in" boolean NOT NULL DEFAULT false,
  -- When they ticked the privacy acknowledgement, not whether. A boolean cannot answer
  -- "which version of the notice did they accept"; a timestamp at least dates it.
  "privacy_accepted_at" timestamptz,

  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."student_demographics"
    ADD CONSTRAINT "student_demographics_student_fk"
    FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- ON DELETE CASCADE, unlike every other foreign key in this schema.
--
-- The rest of the platform retires rather than deletes, because a transcript is the
-- student's longitudinal record and losing it loses the product. This row is the
-- opposite: it exists for a reporting obligation, it is the most sensitive thing stored
-- about a person here, and when an account is deleted there is no argument for keeping it.
DO $$ BEGIN
  ALTER TABLE "wing"."student_demographics"
    ADD CONSTRAINT "student_demographics_age_range" CHECK ("age" IS NULL OR ("age" >= 13 AND "age" <= 120));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

COMMENT ON TABLE "wing"."student_demographics" IS
  'Institutional reporting only. Collected at registration under an explicit promise that '
  'it does not affect the Wing experience. NOTHING that assembles a coaching prompt may '
  'read this table — that is the whole reason it is not columns on wing.students.';

COMMIT;

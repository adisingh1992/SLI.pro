-- ⚠ THIS FILE IS NOT WHAT RAN ON STAGE. It was edited after it was recorded as
-- applied, so the edits never executed there — the migrator compares one timestamp,
-- never a hash, and reports `done` without opening a file it has already run.
-- `wing:check-migrations` lists it under "recorded, but the file has changed since it
-- ran", and that flag is permanent and correct. Migration 0024 reconciles the gap; it
-- re-declares everything below, guarded, so read the two together. Do not edit this
-- file to fix a database — it cannot.
--
-- Every self-description a user gives, verbatim, with what prompted it.
--
-- WHY A TABLE AND NOT THE TRANSCRIPT: the transcript already holds every word the
-- user typed. What it cannot answer is which of those words are the user describing
-- THEMSELVES, at which prompt, and whether they volunteered it or were asked. That
-- cannot be reconstructed later, and Danielle's requirement is explicit about why it
-- matters:
--
--   "Intake is the only time Wing ever sees a user describe themselves before Wing
--   has taught them any language for it. Every self-description after Foundation 1
--   is shaped by coaching. That makes intake the uncoached reference point
--   everything downstream gets measured against — and it cannot be reconstructed
--   after the fact."
--
-- A downstream feature (the Reveal Cycle readiness mechanism) reads this history to
-- tell whether a self-view is converging, diverging or rehearsed. That feature is
-- not being built now. The capture is, because the window closes.
--
-- WING'S OWN WORDS ARE NEVER IN HERE: "Storing Wing's coaching language in the same
-- table as the user's self-descriptions would contaminate the baseline." The writer
-- only ever receives the human turn.
--
-- ── THE TWO COLUMNS SHE DID NOT SPECIFY ────────────────────────────────────
-- She named five fields and left storage to us. `asked_as` and `equivalence` are
-- additions, and they exist because today's intake asks its own thirteen beats:
--
--   Q2              ↔ beat `situation`         the same question            exact
--   Q6              ↔ beat `proud_of`          near-miss                    approximate
--   Q7              ↔ beat `self_perception`   near-miss                    approximate
--   reveal_reaction ↔ the turn after the reveal                             exact
--
-- Q5 (the party question) and Q5.5 (topic) are NOT captured, deliberately. Q5
-- especially: our nearest beat asks what someone does day to day, hers asks what
-- they SAY they do, and the gap between those two is the entire point of Q5.
-- Recording one as the other would silently corrupt the comparison this table exists
-- to make. `source_question` is therefore nullable — NULL is a statement that today's
-- prompt is not one of her questions, not a missing value.
--
-- NOTE ON PROVENANCE: her table marks Q2 `spontaneous` even though Wing asks it. Her
-- definition is about the DESCRIPTION being unprompted rather than the turn, and her
-- labels are followed here rather than re-derived.
-- Guarded like every other statement in this file. CREATE TYPE has no IF NOT
-- EXISTS in Postgres, so a bare one makes the whole migration fail on a re-run —
-- which is precisely the situation a half-applied migration puts you in. Verified
-- against Postgres 16 by applying this file twice.
DO $$ BEGIN
	CREATE TYPE "wing"."self_description_provenance" AS ENUM ('spontaneous', 'elicited', 'coached');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "wing"."self_description_equivalence" AS ENUM ('exact', 'approximate');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wing"."self_descriptions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
	"student_id" bigint NOT NULL,
	"session_id" bigint NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_module" text NOT NULL,
	"source_question" text,
	"asked_as" text NOT NULL,
	"equivalence" "wing"."self_description_equivalence",
	"verbatim_text" text NOT NULL,
	"provenance" "wing"."self_description_provenance" NOT NULL,
	-- An equivalence is a property of a PAIRING, so it exists exactly when there is
	-- something to pair with. Enforced rather than remembered: the alternative is a
	-- row claiming to be an approximation of nothing.
	CONSTRAINT "self_descriptions_equivalence_pairs_question" CHECK (
		("source_question" IS NULL) = ("equivalence" IS NULL)
	)
);--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "wing"."self_descriptions" ADD CONSTRAINT "self_descriptions_student_id_students_id_fk"
		FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "wing"."self_descriptions" ADD CONSTRAINT "self_descriptions_session_id_sessions_id_fk"
		FOREIGN KEY ("session_id") REFERENCES "wing"."sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
-- The downstream question is always "this user's self-descriptions, oldest first".
CREATE INDEX IF NOT EXISTS "self_descriptions_student_idx" ON "wing"."self_descriptions" ("student_id","captured_at");--> statement-breakpoint
-- And the narrower one: how this user's answer to ONE question moved over time.
CREATE INDEX IF NOT EXISTS "self_descriptions_question_idx" ON "wing"."self_descriptions" ("student_id","source_question","captured_at");

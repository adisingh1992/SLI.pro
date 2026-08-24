-- Brings an existing `self_descriptions` table up to the shape 0023 describes.
--
-- ── THE 0023 THAT RAN IS NOT THE 0023 IN THIS FOLDER ──────────────────────
-- An earlier version of that file created the table. The version on disk was edited
-- afterwards to add the `equivalence` enum and column, and the edit had no effect:
-- 0023 was already recorded as applied, so the migrator reports `done` without
-- opening a file it has already run. **An applied migration is immutable in effect.
-- The only thing that changes a database is the next migration.**
--
-- 0023 is untracked, so git cannot say what the applied version contained. That is
-- why this file re-declares the enum, the foreign keys and the indexes as well as
-- the column: nothing 0023 declares can be assumed present. The first attempt at
-- this migration failed on exactly that assumption — `type
-- "wing.self_description_equivalence" does not exist`, because the enum only ever
-- existed in the edited copy. Guessing at the shape a second time is not worth the
-- round trip, so everything is declared and everything is guarded.
--
-- Every statement is conditional, so a database that got all of this from 0023 —
-- any fresh install — passes through this file unchanged.
--
-- ── THE BACKFILL ───────────────────────────────────────────────────────────
-- Rows written before the column existed have NULL. They are not unknown: the
-- pairing is a property of which question the row was filed under, and that mapping
-- is fixed — Q2 and the reveal reaction are the question we asked, Q6 and Q7 are
-- near-misses of hers. Backfilled from that, because a NULL equivalence beside a
-- non-null source_question is what the constraint below forbids.
--
-- Wrapped in IF EXISTS rather than left as a bare UPDATE with a WHERE clause. The
-- WHERE alone is idempotent, but "is this WHERE safe to replay?" is not a question a
-- reviewer or a static check can answer by looking — and migration 0010 is why that
-- matters here: its backfill recomputed every card_code, discarded deduplication
-- suffixes, and broke a UNIQUE constraint that had been fine for months.
DO $$ BEGIN
	CREATE TYPE "wing"."self_description_equivalence" AS ENUM ('exact', 'approximate');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "wing"."self_descriptions" ADD COLUMN IF NOT EXISTS "equivalence" "wing"."self_description_equivalence";--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (
		SELECT 1 FROM "wing"."self_descriptions"
		WHERE "equivalence" IS NULL AND "source_question" IS NOT NULL
	) THEN
		UPDATE "wing"."self_descriptions" SET "equivalence" =
			CASE
				WHEN "source_question" IS NULL THEN NULL
				WHEN "source_question" IN ('Q2', 'reveal_reaction')
					THEN 'exact'::"wing"."self_description_equivalence"
				ELSE 'approximate'::"wing"."self_description_equivalence"
			END
		WHERE "equivalence" IS NULL AND "source_question" IS NOT NULL;
	END IF;
END $$;--> statement-breakpoint
-- An equivalence is a property of a PAIRING, so it exists exactly when there is
-- something to pair with. Enforced rather than remembered: the alternative is a row
-- claiming to be an approximation of nothing. Added after the backfill, because a
-- constraint added first would reject the rows the backfill exists to fix.
DO $$ BEGIN
	ALTER TABLE "wing"."self_descriptions" ADD CONSTRAINT "self_descriptions_equivalence_pairs_question"
		CHECK (("source_question" IS NULL) = ("equivalence" IS NULL));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
-- The remaining four are convergence, not new design. They are what 0023 declares,
-- re-stated because the applied 0023 is unreadable. Each is a no-op where it landed.
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

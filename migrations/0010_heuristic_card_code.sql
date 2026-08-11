-- Stable identifier for heuristic cards.
--
-- Added nullable, backfilled from the name, then made NOT NULL UNIQUE — the
-- table already holds reviewed cards and a bare NOT NULL would reject them.
--
-- ── REPLAY SAFETY IS NOT JUST "IF NOT EXISTS" HERE ──────────────────────────
-- Guarding the DDL is the easy half. The backfill is the half that matters:
-- re-running the first UPDATE unconditionally would recompute every card_code
-- from the name, discarding the `_<id>` suffixes the deduplication step added —
-- so two cards that slug identically would collide, and the UNIQUE constraint
-- added at the bottom would then fail on a table that was previously fine.
--
-- Worse, it would do that silently on any card whose name had since been
-- edited: the code is a STABLE identifier, and recomputing it from a changed
-- name breaks every reference to it.
--
-- So the backfill runs only while there is something to backfill. A migration
-- that is safe to re-run is not the same as one that is harmless to re-run.

ALTER TABLE "wing"."heuristics" ADD COLUMN IF NOT EXISTS "card_code" text;--> statement-breakpoint

DO $$
BEGIN
	-- Nothing to do once every card has a code. See the note above.
	IF EXISTS (SELECT 1 FROM "wing"."heuristics" WHERE "card_code" IS NULL) THEN

		-- Slug of the name.
		UPDATE "wing"."heuristics" SET "card_code" =
			regexp_replace(
				regexp_replace(lower("name"), '[^a-z0-9]+', '_', 'g'),
				'^_|_$', '', 'g'
			)
		WHERE "card_code" IS NULL;

		-- Deduplicated by id where two cards slug identically.
		UPDATE "wing"."heuristics" h SET "card_code" = h."card_code" || '_' || h."id"
		WHERE EXISTS (
			SELECT 1 FROM "wing"."heuristics" o
			WHERE o."card_code" = h."card_code" AND o."id" <> h."id"
		);

		-- Any card whose name slugged to nothing at all.
		UPDATE "wing"."heuristics" SET "card_code" = 'card_' || "id"
		WHERE "card_code" IS NULL OR "card_code" = '';

	END IF;
END $$;
--> statement-breakpoint

-- Both no-op if already in place.
ALTER TABLE "wing"."heuristics" ALTER COLUMN "card_code" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "wing"."heuristics" ADD CONSTRAINT "heuristics_card_code_unique" UNIQUE("card_code");
EXCEPTION
	WHEN duplicate_object THEN NULL;
	WHEN duplicate_table THEN NULL;
END $$;

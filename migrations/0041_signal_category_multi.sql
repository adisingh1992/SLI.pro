-- 0041 — a prompt carries several signal categories, not one.
--
-- 0028 gave `prompt_library.signal_category` a single text value guarded by a CHECK
-- against her eight, and 0026 gave `prompt_log.signal_category` the same shape. That was
-- right for the material as it stood: her library annotates one dominant signal per
-- prompt. It is wrong for the material as she reads it — "a single prompt response could
-- contain both an energy signal and a relationship signal" (Sept 4 pre-read, §7e) — and a
-- one-value column forces her to drop the second one on the floor at tagging time, which
-- is the same "collapse distinctness that is there" failure 0039's header warns about,
-- just moved one step earlier.
--
-- Both columns become `text[]`. The vocabulary is unchanged: still her eight, still
-- guarded, now with `<@` instead of `IN` so the guard means "every element is one of
-- hers" rather than "the value is one of hers".
--
-- ── WHY EMPTY ARRAY AND NOT NULL, WHEN EVERY OTHER OPTIONAL COLUMN IS NULLABLE ──
-- `population_tags` on this same table is already `text[] NOT NULL DEFAULT '{}'`, and for
-- the reason that applies here too: with an array, "unset" and "set to nothing" are the
-- same fact, and two spellings of one fact is how `IS NULL` and `cardinality() = 0` end
-- up disagreeing in different queries. One spelling. Existing NULLs become '{}', and
-- every "has she categorised this" test in the application becomes a length check.
--
-- ── WHY prompt_log WIDENS TOO ────────────────────────────────────────────────
-- It did not have to. `logDelivery` could have recorded the first category and left this
-- table alone, which would have kept Gate 2's "3 distinct categories" counting exactly as
-- it is. Aditya's call was to record every category, and the consequence is deliberate
-- and worth stating: a single response tagged energy + relationship + career now satisfies
-- Gate 2's distinct-category condition on its own, where before it would have taken three
-- separately-categorised responses. That is a real loosening of a threshold Danielle set,
-- and the place to revisit it is `GATE2.distinctCategories` in reveal-gates.ts, not here.
--
-- Nothing has been delivered against either table in production — `logDelivery`'s only
-- caller is the engagement scheduler and the Reveal Cycle is not scheduled — so this is
-- the cheap moment to do it. Once it isn't, this becomes a backfill nobody can do: the
-- second category of a prompt already sent is not recoverable from the log.

/* ── prompt_library ──────────────────────────────────────────────────────── */

-- The old guard names a scalar and cannot survive the type change; the new one is added
-- below, after the column is an array.
ALTER TABLE "wing"."prompt_library"
  DROP CONSTRAINT IF EXISTS "prompt_library_signal_category";--> statement-breakpoint

-- Guarded on the column's current type so a re-run is a no-op rather than an error:
-- ARRAY["signal_category"] does not type-check once the column is already text[].
DO $$ BEGIN
  IF (
    SELECT "data_type" FROM "information_schema"."columns"
    WHERE "table_schema" = 'wing'
      AND "table_name" = 'prompt_library'
      AND "column_name" = 'signal_category'
  ) IS DISTINCT FROM 'ARRAY' THEN
    ALTER TABLE "wing"."prompt_library"
      ALTER COLUMN "signal_category" DROP DEFAULT;

    ALTER TABLE "wing"."prompt_library"
      ALTER COLUMN "signal_category" TYPE text[]
      USING (
        CASE
          WHEN "signal_category" IS NULL THEN '{}'::text[]
          ELSE ARRAY["signal_category"]
        END
      );
  END IF;
END $$;--> statement-breakpoint

UPDATE "wing"."prompt_library"
  SET "signal_category" = '{}'::text[]
  WHERE "signal_category" IS NULL;--> statement-breakpoint

ALTER TABLE "wing"."prompt_library"
  ALTER COLUMN "signal_category" SET DEFAULT '{}'::text[];--> statement-breakpoint

ALTER TABLE "wing"."prompt_library"
  ALTER COLUMN "signal_category" SET NOT NULL;--> statement-breakpoint

-- Her eight, as a guard rather than as a type — 0028's sentence, still true, now
-- elementwise. A row may carry none; it may not carry a ninth. Duplicates are not
-- refused here: the editor normalises a draft to her order and deduplicates before it
-- writes, and a CHECK that had to prove uniqueness inside an array would be a subquery
-- per row for a case the write path already cannot produce.
DO $$ BEGIN
  ALTER TABLE "wing"."prompt_library"
    ADD CONSTRAINT "prompt_library_signal_category"
    CHECK ("signal_category" <@ ARRAY[
      'language', 'energy', 'decision', 'relationship',
      'industry', 'career', 'influence', 'achievement'
    ]::text[]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

COMMENT ON COLUMN "wing"."prompt_library"."signal_category" IS
  'Zero or more of her eight. Empty means uncategorised — there is no NULL state. '
  'signal_category_because and signal_category_source describe the set as a whole, not '
  'one element of it.';--> statement-breakpoint

/* ── prompt_log ──────────────────────────────────────────────────────────── */

-- 0026's partial btree was for IG-RC10's delivery audit ("were prompts in that category
-- delivered during the window"). A btree cannot answer containment against an array, and
-- no query has ever used it — `categoryWasDelivered` filters in memory over entries
-- `evidenceSince` already fetched. Replaced with a GIN index, which is the shape that
-- would actually serve that question if it is ever asked in SQL.
DROP INDEX IF EXISTS "wing"."prompt_log_category_window_idx";--> statement-breakpoint

DO $$ BEGIN
  IF (
    SELECT "data_type" FROM "information_schema"."columns"
    WHERE "table_schema" = 'wing'
      AND "table_name" = 'prompt_log'
      AND "column_name" = 'signal_category'
  ) IS DISTINCT FROM 'ARRAY' THEN
    ALTER TABLE "wing"."prompt_log"
      ALTER COLUMN "signal_category" DROP DEFAULT;

    ALTER TABLE "wing"."prompt_log"
      ALTER COLUMN "signal_category" TYPE text[]
      USING (
        CASE
          WHEN "signal_category" IS NULL THEN '{}'::text[]
          ELSE ARRAY["signal_category"]
        END
      );
  END IF;
END $$;--> statement-breakpoint

UPDATE "wing"."prompt_log"
  SET "signal_category" = '{}'::text[]
  WHERE "signal_category" IS NULL;--> statement-breakpoint

ALTER TABLE "wing"."prompt_log"
  ALTER COLUMN "signal_category" SET DEFAULT '{}'::text[];--> statement-breakpoint

ALTER TABLE "wing"."prompt_log"
  ALTER COLUMN "signal_category" SET NOT NULL;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."prompt_log"
    ADD CONSTRAINT "prompt_log_signal_category"
    CHECK ("signal_category" <@ ARRAY[
      'language', 'energy', 'decision', 'relationship',
      'industry', 'career', 'influence', 'achievement'
    ]::text[]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "prompt_log_category_gin_idx"
  ON "wing"."prompt_log" USING GIN ("signal_category");--> statement-breakpoint

COMMENT ON COLUMN "wing"."prompt_log"."signal_category" IS
  'The categories the delivered prompt carried, as at delivery. Empty where the prompt '
  'had none, or where none of its own categories map to one of her eight. Gate 2 counts '
  'the distinct categories across all events, so one multi-category response now '
  'contributes more than one toward GATE2.distinctCategories.';

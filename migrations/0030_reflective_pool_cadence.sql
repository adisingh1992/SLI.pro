-- 0030 — the reflective pool joins the rhythm it was always part of.
--
-- 0028 backfilled `library = 'reflective'` onto the 28 prompts that predate her library,
-- because her rotation weighting needs the two pools told apart:
--
--   "Rotation weighting: Roughly 2:1 approachable-to-serious in any given week. Two of
--    these for every one serious/reflective prompt."
--
-- It left their `cadence` null, which was the cautious choice at the time and is the wrong
-- one. Selection filters by cadence — that is how a weekly heartbeat prompt is kept out of
-- the daily rotation — so a reflective prompt with no cadence is never a candidate, and
-- her 2:1 becomes 2:0. The ratio would have been implemented, tested, and unreachable.
--
-- ── WHY THIS IS TRUE AND NOT CONVENIENT ─────────────────────────────────────
-- The 28 rows are the life-log prompts `wing:seed-prompts` wrote. The life log is B2, and
-- B2's rhythm is the micro-journal one. Her sentence presumes both pools feed the SAME
-- weekly rotation — "two of these for every one serious/reflective prompt" is a ratio
-- within one stream, not a comparison between two streams that never meet.
--
-- Only rows that are already marked reflective and have no cadence are touched. A row
-- somebody has since classified by hand keeps what they gave it.

BEGIN;

-- Guarded with IF EXISTS rather than with the count below, because the contract suite
-- reads the SHAPE of a migration and `IF n > 0` is an argument a reviewer has to
-- reconstruct. The count is kept, but it reports rather than decides.
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM "wing"."prompt_library"
  WHERE "library" = 'reflective' AND "cadence" IS NULL;

  IF EXISTS (
    SELECT 1 FROM "wing"."prompt_library"
    WHERE "library" = 'reflective' AND "cadence" IS NULL
  ) THEN
    UPDATE "wing"."prompt_library"
    SET "cadence" = 'micro_journal',
        "updated_at" = now()
    WHERE "library" = 'reflective' AND "cadence" IS NULL;

    RAISE NOTICE '0030: % reflective prompt(s) joined the micro-journal rotation', n;
  ELSE
    RAISE NOTICE '0030: no reflective prompt is missing a cadence';
  END IF;
END $$;--> statement-breakpoint

-- What the two pools now look like, so the ratio is checkable rather than assumed.
DO $$
DECLARE
  approachable integer;
  reflective integer;
BEGIN
  SELECT
    count(*) FILTER (WHERE "library" = 'approachable'),
    count(*) FILTER (WHERE "library" = 'reflective')
  INTO approachable, reflective
  FROM "wing"."prompt_library"
  WHERE "cadence" = 'micro_journal' AND "active";

  RAISE NOTICE '0030: micro-journal rotation holds % approachable and % reflective prompt(s)',
    approachable, reflective;
END $$;

COMMIT;

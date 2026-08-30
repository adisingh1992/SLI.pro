-- 0032 — retire the objective sets and the renderer that read them.
--
-- Part 4 of the Tier 1 plan: "Retire the 21 objectives and the objective renderer
-- outright. The renderer was never validated — OBJECTIVE_RENDERER_POPULATIONS is unset by
-- default, so it has never run for a real student."
--
-- The design was sound and the reasoning behind it is still worth reading in
-- `wing_schema`'s comment on this table: methodology in 22,000-character prompt literals,
-- three near-identical copies, criteria stated in three places and disagreeing. What
-- replaced it in Tier 1 is not the prompt file it was built against — it is the v2
-- Foundation cards, `gate-compiler` and `voice-compiler`, which assemble a turn prompt
-- from published components and are the thing a student will actually meet on 1 September.
-- Two mechanisms for building the same prompt is one more than anybody can keep correct,
-- and only one of them has been exercised.
--
-- ── ROWS, NOT TABLES ────────────────────────────────────────────────────────
-- Both tables stay. `objective_sets` carries the version history the editor wrote, and
-- `turn_objectives` carries whatever attribution exists — dropping either would destroy
-- the only record of what was tried, to save two tables nothing queries. The schema's own
-- convention, and the one the criteria and methodology tables already follow.
--
-- ── WHY RETIRED AND NOT DELETED ─────────────────────────────────────────────
-- `retired` is already what this enum means by "no longer in force, still on file", and
-- `objective_sets_published_unique` only constrains rows where status = 'published', so a
-- retired set leaves the slot free. If a later cycle wants objectives back, the row is
-- there to revert to; the editor's own revert path did exactly this in reverse.
--
-- ── WHAT THIS DOES NOT TOUCH ────────────────────────────────────────────────
-- Completion criteria and analysis methodology are LIVE and load-bearing today, and the
-- plan holds them until the v2 cards produce equivalent session-end artifacts. They share
-- this table's versioning convention and none of its fate.

BEGIN;

-- Guarded on the table's presence rather than assumed: a database restored from before
-- 0009 has no objective_sets at all, and an UPDATE against a missing table would abort a
-- migration whose whole job is to make something stop happening.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'wing' AND table_name = 'objective_sets'
  ) THEN
    UPDATE "wing"."objective_sets"
       SET "status" = 'retired'
     WHERE "status" = 'published';
  END IF;
END $$;--> statement-breakpoint

COMMENT ON TABLE "wing"."objective_sets" IS
  'RETIRED 2026-08-30. The objective renderer was removed in Tier 1 part 4 — it was '
  'never enabled for any population and never produced a conversation. Rows are kept '
  'for their history; nothing reads this table. The turn prompt is assembled by the v2 '
  'Foundation cards via gate-compiler and voice-compiler.';--> statement-breakpoint

COMMENT ON TABLE "wing"."turn_objectives" IS
  'RETIRED 2026-08-30. Per-turn objective attribution, written only by the objective '
  'renderer, which was removed in Tier 1 part 4. Rows are kept; nothing writes here.';

COMMIT;

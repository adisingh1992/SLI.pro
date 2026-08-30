-- 0029 — the third rhythm, and her marker kept verbatim.
--
-- 0028 allowed two cadences, `micro_journal` and `heartbeat`, because those are the two
-- her micro-journal library and the heartbeat file are named for. Parsing Section 5 of the
-- heartbeat file found a third she states in its preamble:
--
--   "Prompts marked *synthesis-cycle* should only be used at monthly/quarterly cadence,
--    not in the weekly rotation."
--
-- Three prompts carry it. Under 0028's constraint the seed would have failed on them, or —
-- worse, had the constraint been looser — put them in the weekly rotation she excluded
-- them from.
--
-- ── WHY THIS IS 0029 AND NOT AN EDIT TO 0028 ────────────────────────────────
-- Because drizzle records a migration as applied by its tag, and `willApply` decides from
-- the journal rather than from the file's contents — `migration-rules.ts` says so directly:
-- "the hash is not part of the decision, so an edit is invisible". So if 0028 has already
-- run anywhere, an amended 0028 silently never applies its new parts, and the schema and
-- the file disagree with nothing to say so.
--
-- Editing it would have been tidier and is only safe if nobody has run it, which is not
-- something this file can know.
--
-- ── AND ONE COLUMN 0028 SHOULD HAVE HAD ─────────────────────────────────────
-- `delivery_marker`. Her markers are hand-written prose and there are seven distinct
-- wordings across 27 prompts — `*(heartbeat)*`, `*(heartbeat — requires event-sensitivity
-- flag)*`, `*(heartbeat — paired with "no one sees this but you" framing)*`,
-- `*(synthesis-cycle only)*`, `*(reveal-trigger — only fires on uniformly positive
-- pattern)*`, `*(monthly calibration)*`.
--
-- `cadence` and `event_sensitive` are what the code derives from them. Keeping the marker
-- itself means a reviewer can check that derivation against her document without reading
-- the parser, and it means the two markers that name no rhythm — the reveal-trigger prompt
-- and the calibration widget — are not stored as an unexplained NULL cadence. They carry
-- what she wrote about them.

BEGIN;

ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "delivery_marker" text;--> statement-breakpoint

-- The constraint is replaced rather than widened in place: Postgres has no ALTER
-- CONSTRAINT for a CHECK, so dropping and re-adding is the only route. `DROP ... IF
-- EXISTS` makes the first half idempotent and the duplicate_object guard makes the second.
ALTER TABLE "wing"."prompt_library" DROP CONSTRAINT IF EXISTS "prompt_library_cadence";--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."prompt_library"
    ADD CONSTRAINT "prompt_library_cadence"
    CHECK ("cadence" IS NULL OR "cadence" IN ('micro_journal', 'heartbeat', 'synthesis_cycle'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- NULL stays permitted, and it is not an oversight. Two of her Section 5 prompts name a
-- delivery mode rather than a rhythm — one fires from the Reveal, one is a monthly
-- calibration widget — and neither belongs in a rotation. Their marker says which, so the
-- absence is a recorded decision rather than a missing value.
COMMENT ON COLUMN "wing"."prompt_library"."cadence" IS
  'micro_journal | heartbeat | synthesis_cycle. NULL where her delivery marker names a '
  'mode rather than a rhythm (reveal-trigger, monthly calibration) — see delivery_marker.';--> statement-breakpoint

COMMENT ON COLUMN "wing"."prompt_library"."delivery_marker" IS
  'Her inline marker, verbatim, from Section 5 of the heartbeat document. cadence and '
  'event_sensitive are derived from it; this is what they were derived FROM.';

COMMIT;

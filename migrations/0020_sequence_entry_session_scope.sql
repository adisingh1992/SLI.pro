-- Which session a sequence entry applies in.
--
-- WHY: the compendium publishes THREE sequence maps for Foundation — one per
-- session, 8 cards, 7 cards and 8 cards. The schema has one active sequence per
-- cycle (`school_cycles.active_heuristic_sequence_id`) and no session dimension
-- anywhere in resolution, so `wing:build-sequences` had to put all 53 Tier 1
-- cards into a single sequence. Published that way, a student sitting in
-- Foundation 1 could have H-201 fire — the Foundation 2 VC credibility test —
-- because every card in the sequence enters the detector catalogue on every turn.
--
-- That is the one thing blocking publication of the v2 methodology, and it is
-- why the build script stops short of setting the cycle pointer.
--
-- ── WHY THIS BELONGS ON THE ENTRY, NOT ON THE CARD ──────────────────────────
-- Two other places were considered:
--
--   a column on `heuristics`   — makes the session a property of the CARD. But
--     the same card can legitimately be deployed in more than one session, and
--     it is the methodology owner's sequence that decides where. Baking it into
--     the card would make "H-303 belongs to Foundation 3" a fact about the card
--     rather than a fact about this cohort's deployment of it.
--
--   the `module_mapping` component — already present on 23 of the 53 cards,
--     carrying the document's own prose ("Foundation 1"). Making it queryable
--     would mean either overwriting the methodology owner's text with a machine
--     value or versioning a second component whose only difference is machine
--     readability. It would also put a join and a string match on the per-turn
--     hot path.
--
-- `heuristic_sequence_entries` already carries `position` and `weight` — both
-- deployment properties rather than card properties — and `getSequenceCards`
-- already joins it on every turn. So the filter costs nothing extra, and it is
-- the schema's way of expressing "three sequence maps inside one cycle sequence".
--
-- ── NULL MEANS EVERY SESSION ───────────────────────────────────────────────
-- 18 of the 53 cards are universal or voice gates that apply wherever Wing is
-- speaking: H-001..H-005, the six IG-U gates, the six IG-V gates, H-900. NULL
-- rather than a sentinel, so "applies everywhere" needs no enum value and no
-- backfill decision when a new session type is added.
--
-- Reuses `wing.session_type`, which already has foundation_1/2/3 alongside
-- intake, the enhancement modules and module_run. Nothing new to define, and a
-- value that cannot drift from what `sessions.session_type` actually stores.

ALTER TABLE "wing"."heuristic_sequence_entries"
  ADD COLUMN IF NOT EXISTS "applies_to_session" "wing"."session_type";--> statement-breakpoint

-- The per-turn query is "which cards in this sequence may fire in this session",
-- so it reads sequence_id and this column together. Existing rows stay NULL,
-- which means the sequences already built keep behaving exactly as they do now
-- until `wing:build-sequences` is re-run to populate them.
CREATE INDEX IF NOT EXISTS "heuristic_sequence_entries_session_idx"
  ON "wing"."heuristic_sequence_entries" ("sequence_id", "applies_to_session");

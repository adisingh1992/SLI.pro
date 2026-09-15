-- wing.transcript_turns.delivery_audience / delivery_register (this session,
-- 15 Sep 2026, resolving Danielle's "output requirements" doc's #1/#6/#10):
-- voice.ts already resolves which audience population and which register
-- rendered on a turn (VoiceContextResult.audience / .register), but the
-- result was only ever used to build the system prompt and log a line, then
-- discarded -- nothing persisted which register was actually in force when a
-- past turn happened, so test-run-export.ts could only name the field
-- "notReconstructed" rather than report it. These two nullable columns close
-- that gap at its root: test-run-export.ts's #1, card-comparison's #6, and
-- delivery-adaptation-effectiveness's #10 all trace back to this one missing
-- write.
--
-- Written only on Wing's own turns (a persona/student turn has no delivery
-- register of its own). Null for every turn recorded before this migration,
-- and for any turn where voice resolved nothing (no profile published, no
-- population match).

BEGIN;

ALTER TABLE "wing"."transcript_turns"
  ADD COLUMN IF NOT EXISTS "delivery_audience" text,
  ADD COLUMN IF NOT EXISTS "delivery_register" text;

COMMIT;

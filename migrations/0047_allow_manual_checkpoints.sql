-- wing.users.allow_manual_checkpoints (claude/HARNESS_GAP_ANALYSIS_SEP15.md §1a,
-- resolved 15 Sep 2026): a real staff account (Danielle's own) needed to use
-- applyCheckpoint (server/wing/checkpoint-store.ts) WITHOUT being flagged
-- is_test_user, which would exclude its real coaching data from the behavioral
-- corpus — the two things (checkpoint access, corpus exclusion) were previously
-- the same flag, which is why checkpoint-store.ts refused Danielle's own account
-- even though the original email promised it would work.
--
-- Independent of is_test_user, default false. A seeded persona never needs this
-- (it already has is_test_user); a real student never gets it. Not read by any
-- live methodology or scoring path — same boundary is_test_user itself draws,
-- just the opposite direction (this flag only ever WIDENS what an account may
-- do, never narrows what's read about it).

BEGIN;

ALTER TABLE "wing"."users"
  ADD COLUMN IF NOT EXISTS "allow_manual_checkpoints" boolean NOT NULL DEFAULT false;

COMMIT;

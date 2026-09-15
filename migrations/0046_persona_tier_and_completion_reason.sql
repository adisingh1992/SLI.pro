-- Two independent additions from the same round of decisions
-- (claude/HARNESS_BUILD_STEP17_SEP11.md):
--
-- wing.harness_personas.default_model_tier — Danielle's own default deployment tier for a
-- persona, chosen from the admin panel (Aditya, 11 Sep 2026: "provide a dropdown in the admin
-- panel for danielle to select a model for persona. The current list should have the existing
-- deployments."). Nullable: null means "use the platform default", consulted by
-- server/wing/test-run-engine.ts's claimTestRun before it falls back to
-- server/wing/model-tier.ts's DEFAULT_PERSONA_TIER.
--
-- wing.test_runs.completion_reason — set only when status = 'completed', to say HOW. Today's one
-- value, 'crisis_hold_asserted', marks a run ended early because the persona's own turn tripped
-- IG-S01 (Aditya, 11 Sep 2026: "treat hold as success"). Null on every ordinary completion.
--
-- Neither column is read by the live methodology or by any real (non-test) student flow — same
-- boundary every wing.harness_personas / wing.test_runs column already draws.

BEGIN;

ALTER TABLE "wing"."harness_personas"
  ADD COLUMN IF NOT EXISTS "default_model_tier" text;--> statement-breakpoint

ALTER TABLE "wing"."test_runs"
  ADD COLUMN IF NOT EXISTS "completion_reason" text;--> statement-breakpoint

COMMIT;

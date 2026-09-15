-- P3.1's spend/latency guards for the persona simulator (P3, claude/TEST_HARNESS_PLAN_SEP9.md /
-- claude/HARNESS_BUILD_STEP13_SEP11.md). turn_ceiling already bounds how many exchanges a run
-- drives; nothing bounded what they cost or how long a stuck run could keep going. This adds
-- both, plus the running total the engine checks them against.
--
-- token_budget: cumulative input+output tokens across every persona and Wing call in the run.
-- A turn's own maxTokens already caps one call; this caps the sum across the whole run.
--
-- tokens_used: the running total server/wing/test-run-engine.ts updates every turn.
--
-- max_wall_clock_seconds: wall-clock ceiling from the run's start, checked once per turn —
-- catches a slow or stuck run that would otherwise keep going until turn_ceiling regardless of
-- how long that actually takes.
--
-- Nothing here is read by the live methodology or by any real (non-test) student flow — same
-- boundary every wing.test_runs column already draws.

BEGIN;

ALTER TABLE "wing"."test_runs"
  ADD COLUMN IF NOT EXISTS "token_budget" integer NOT NULL DEFAULT 300000;--> statement-breakpoint

ALTER TABLE "wing"."test_runs"
  ADD COLUMN IF NOT EXISTS "tokens_used" integer NOT NULL DEFAULT 0;--> statement-breakpoint

ALTER TABLE "wing"."test_runs"
  ADD COLUMN IF NOT EXISTS "max_wall_clock_seconds" integer NOT NULL DEFAULT 900;--> statement-breakpoint

COMMIT;

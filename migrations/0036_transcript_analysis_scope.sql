-- 0036 — keep scoped free-chat refusals out of longitudinal career memory.
--
-- Every transcript turn remains visible for conversation continuity and audit. Human
-- provenance alone is no longer sufficient for analysis eligibility: an abusive,
-- off-topic, crisis, spam, or prompt-injection turn is human-originated but is not
-- evidence about the student's professional identity.

BEGIN;

ALTER TABLE "wing"."transcript_turns"
  ADD COLUMN IF NOT EXISTS "analysis_eligible" boolean NOT NULL DEFAULT true;--> statement-breakpoint

ALTER TABLE "wing"."transcript_turns"
  ADD COLUMN IF NOT EXISTS "analysis_exclusion_reason" text;--> statement-breakpoint

COMMENT ON COLUMN "wing"."transcript_turns"."analysis_eligible" IS
  'Whether a human-originated turn may feed longitudinal analysis, memory, and pattern detection.';--> statement-breakpoint

COMMENT ON COLUMN "wing"."transcript_turns"."analysis_exclusion_reason" IS
  'Stable policy category explaining why a recorded turn is excluded from analysis.';

COMMIT;

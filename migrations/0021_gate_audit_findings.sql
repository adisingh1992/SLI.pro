-- Where the gate audit records what it found.
--
-- WHY A NEW TABLE: the obvious home was `user_heuristic_applications`, and it is
-- the wrong one. That table means "this card was APPLIED", and
-- `user_heuristic_scores` aggregates from it to decide which methodology earns
-- promotion to `validated`. Writing a gate BREACH there would conflate "the rule
-- fired" with "the rule was broken", and every gate would accumulate a composite
-- score built from its own failures. The scoring data is the thing the whole
-- heuristics engine exists to produce; it must not be polluted to save a table.
--
-- `admin_audit_log` was the other candidate. Its `actor_user_id` is NOT NULL and
-- references a real person, and a finding has no actor — the system noticed it.
--
-- ── WHAT A FINDING IS ──────────────────────────────────────────────────────
-- Thirteen Tier 1 gates say "content analysis on Wing's own output before
-- delivery". The turn path streams, so inspection happens after delivery: the
-- rules are compiled into the prompt, and this table records whether they held.
-- That is the measure half of the measure-then-enforce decision, and it is what
-- turns "which gates deserve hard blocking?" from a guess into a query.
--
-- Two modes, because the gates are not all the same shape:
--   violation  the matched phrase IS the breach. "Your function is Marketing"
--              breaks H-109 outright.
--   review     the phrase means the rule now APPLIES. H-002's triggers — "you
--              mentioned", "in your Foundation session" — signal that a
--              cross-session reference is being made, at which point provenance
--              is required. Recording those as breaches would make every
--              legitimate callback a violation, and H-303 is a Foundation 3 card
--              whose entire job is calling back to Session 2.
--
-- ── WHY `status` MATTERS MORE THAN THE COUNT ────────────────────────────────
-- Danielle tunes the rules from this, exactly as she asked to tune routing: "by
-- reviewing which routes fire, which get accepted, and which consistently get
-- declined — which means the trigger is wrong, not the user." A finding she
-- rejects is evidence the PATTERN is too broad, not that Wing misbehaved. Without
-- a review state, a false positive and a real breach are the same row and the
-- data is worthless. Reuses `pattern_status`; `authored` does not apply here.
--
-- ── DATA NOTE ──────────────────────────────────────────────────────────────
-- `excerpt` is a window of Wing's own reply and may quote the student back, so it
-- carries the same sensitivity as `transcript_turns.content` and belongs behind
-- the same access control. Any admin surface over this table must be
-- `isPlatformAdmin` or institution-scoped — see ADMIN_SCOPE.md.

DO $$ BEGIN
  CREATE TYPE "wing"."gate_finding_mode" AS ENUM ('violation', 'review');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "wing"."gate_audit_findings" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "student_id" bigint NOT NULL REFERENCES "wing"."students"("id"),
  "session_id" bigint NOT NULL REFERENCES "wing"."sessions"("id"),
  -- The AI turn whose text broke the rule. Nullable only because the turn write
  -- can fail independently; a finding without it is still worth keeping.
  "turn_id" bigint REFERENCES "wing"."transcript_turns"("id"),
  "heuristic_id" bigint NOT NULL REFERENCES "wing"."heuristics"("id"),
  -- Denormalised deliberately. `card_code` is how the methodology, the routing
  -- maps and every conversation refer to a gate, and a tuning query grouped by a
  -- numeric id is unreadable. It also survives the card being renamed.
  "card_code" text NOT NULL,
  "mode" "wing"."gate_finding_mode" NOT NULL,
  "matched" text NOT NULL,
  "excerpt" text NOT NULL,
  "status" "wing"."pattern_status" NOT NULL DEFAULT 'pending_review',
  "detected_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

-- The tuning query: which rules are being broken, and which findings are still
-- unreviewed. This is the one Danielle runs.
CREATE INDEX IF NOT EXISTS "gate_audit_findings_card_status_idx"
  ON "wing"."gate_audit_findings" ("card_code", "status");--> statement-breakpoint

-- Per-student review, and the recent-findings feed.
CREATE INDEX IF NOT EXISTS "gate_audit_findings_student_idx"
  ON "wing"."gate_audit_findings" ("student_id", "detected_at");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "gate_audit_findings_session_idx"
  ON "wing"."gate_audit_findings" ("session_id");

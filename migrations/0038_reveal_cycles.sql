-- The Reveal Cycle's own decision log — the plumbing, not the content.
--
-- WHAT THIS RECORDS AND WHAT IT DOES NOT: `reveal-gates.ts`, `reveal-evidence.ts` and
-- `reveal-select.ts` are all pure, tested, and — per their own headers — "waiting for"
-- something to call them. This table is that something's memory: one row per meaningful
-- outcome of `evaluateRevealCycle` (fire, defer, or route), never one row per hourly
-- check. A `wait` outcome is not recorded, on purpose — it is the common case for most
-- students most hours (day 5 of 30, or Foundation 1 not yet complete), it is fully
-- recomputable from `sli_records` and this table's own `fire` rows, and logging it would
-- make the one query anyone actually wants ("what did the Reveal Cycle decide, and why")
-- unreadable under its own volume. Same reasoning `gate_audit_findings` follows: it
-- records findings, not clean turns.
--
-- WHAT THIS TABLE DOES NOT DO: it does not store a delivered message. `template_code` is
-- which of the 14 templates `reveal-select.ts` chose, or NULL for a protected null Reveal
-- (IG-INT06: "no template met all three criteria... a weak reveal is worse than none").
-- Turning a selected template into actual sent text — quoting the student's own words,
-- following the template's `revealDirective` — is a separate, later piece of work with
-- its own open design questions. Nothing here should be read as "the Reveal shipped";
-- only as "the gates and the selector ran, and this is what they decided."
--
-- WHY jsonb FOR THE GATE VERDICTS: `GateVerdict` from reveal-gates.ts already carries a
-- human-readable `conditions` array with a name/met/detail per condition — exactly the
-- shape Danielle would want to read when a student's cycle looks wrong ("Gate 2 failed on
-- category_spread, 2 of 3"). Recomputing it from raw counts later would need the same
-- evidence this row was computed from, which is not retained here; storing the verdict
-- itself is what makes the row self-explanatory without a join back to `prompt_log`.

BEGIN;

CREATE TABLE IF NOT EXISTS "wing"."reveal_cycles" (
  "id" bigserial PRIMARY KEY,
  "student_id" bigint NOT NULL,
  "evaluated_at" timestamptz NOT NULL DEFAULT now(),
  -- Days since this student's cycle origin (their last fired Reveal, or their Foundation
  -- 1 completion if they have never had one) — see reveal-cycle.ts for why those are the
  -- same reference point Gate 1 and Gate 3 both read, just handled differently.
  "day_in_cycle" integer NOT NULL,
  "action" text NOT NULL,
  -- 'cadence' | 'escalation', set only when action = 'fire'. Escalation detection is not
  -- built yet (it needs contradiction-detection over real evidence, which the evidence
  -- pipeline does not populate yet either) — every fire recorded by this version of the
  -- orchestrator is 'cadence'. The column exists now so a later escalation build is an
  -- INSERT change, not a migration.
  "kind" text,
  -- The gate chain's own reasoning, human-readable, for the row a person actually reads.
  "why" text NOT NULL,
  -- GateVerdict snapshots — see the header note on why these are stored rather than
  -- recomputed.
  "gate1" jsonb NOT NULL,
  "gate2" jsonb NOT NULL,
  -- RT-xx, or NULL for a protected null Reveal (IG-INT06) or any non-fire action.
  "template_code" text,
  "template_band" smallint,
  -- Set only when action = 'defer' — the day the next check should reconsider Gate 2.
  "next_check_day" integer,
  -- Set only when action = 'route' — today always 'H-RC10', the day-60 exit this
  -- orchestrator does not itself implement.
  "routed_to" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "reveal_cycles_action_check"
    CHECK ("action" IN ('fire', 'defer', 'route')),
  CONSTRAINT "reveal_cycles_kind_check"
    CHECK ("kind" IS NULL OR "kind" IN ('cadence', 'escalation')),
  CONSTRAINT "reveal_cycles_kind_only_on_fire"
    CHECK ("kind" IS NULL OR "action" = 'fire'),
  CONSTRAINT "reveal_cycles_next_check_day_only_on_defer"
    CHECK ("next_check_day" IS NULL OR "action" = 'defer'),
  CONSTRAINT "reveal_cycles_routed_to_only_on_route"
    CHECK ("routed_to" IS NULL OR "action" = 'route')
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."reveal_cycles"
    ADD CONSTRAINT "reveal_cycles_student_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;--> statement-breakpoint

-- The lookup every evaluation makes first: this student's most recent fire, to anchor
-- day_in_cycle. Partial on action = 'fire' because defer/route rows are never the origin.
CREATE INDEX IF NOT EXISTS "reveal_cycles_student_last_fire_idx"
  ON "wing"."reveal_cycles" ("student_id", "evaluated_at" DESC)
  WHERE "action" = 'fire';--> statement-breakpoint

-- Per-student history, any action — the admin/review surface.
CREATE INDEX IF NOT EXISTS "reveal_cycles_student_idx"
  ON "wing"."reveal_cycles" ("student_id", "evaluated_at" DESC);

COMMIT;

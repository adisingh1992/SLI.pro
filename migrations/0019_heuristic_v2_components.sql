-- The methodology's v2 card format arrives.
--
-- WHY: `heuristic_component_type` was designed before the final methodology
-- existed, from the shape the earlier cards had. The v2 format Danielle
-- delivered has seven components and the enum holds three of them by name:
--
--   v2 component          enum today
--   signal             →  signal            exact
--   coaching_move      →  coaching_move     exact
--   success_criteria   →  outcome           usable, narrower semantics
--   detection_method   →  (nothing)
--   intervention_type  →  (nothing — `intervention` holds text, not a type)
--   delivery_adaptation→  (nothing)
--   failure_path       →  (nothing)
--
-- All 182 cards in the compendium carry all seven components with no omissions,
-- so without this migration a v2 import stores four sevenths of the methodology
-- nowhere. `delivery_adaptation` is the one that costs most: it is where the
-- seven audiences actually differ, so dropping it means every population
-- receives identical coaching language.
--
-- WHY `success_criteria` IS ADDED RATHER THAN MAPPED ONTO `outcome`: post-session
-- scoring reads `outcome` today. Repointing it would mean changing a live
-- scoring path in the same migration that changes the enum, for a rename. So
-- both names exist for one release and `outcome` retires with the rest of the
-- superseded methodology (WING_TIER1_SCOPE.md T9), by which point nothing reads
-- it. Two names for one concept is a known, temporary, written-down cost.
--
-- ── ADDING ENUM VALUES AND USING THEM ────────────────────────────────────────
-- `ALTER TYPE … ADD VALUE` is permitted inside a transaction on PostgreSQL 12+
-- (this server is 16.14, per PHASE2_MIGRATION_RUNBOOK.md §123), but a value added
-- that way CANNOT BE USED in the same transaction that added it.
--
-- That constraint is wider than one file. drizzle's migrator wraps EVERY PENDING
-- migration in a SINGLE transaction — `pg-core/dialect.cjs` opens one
-- `session.transaction` and loops over all of them inside it. On an existing
-- database only 0019 is pending, so the window is this file. On an EMPTY database
-- — the cutover dry run, a fresh local Postgres — 0001 through 0019 apply in one
-- transaction together, and so would any later migration.
--
-- So: no migration in this repo may write a row using 'detection_method',
-- 'delivery_adaptation', 'failure_path' or 'success_criteria'. It will pass review,
-- pass on a database where 0019 is already committed, and fail during cutover.
-- Seeding happens from `seed-compendium.ts`, in its own transaction, after
-- migration completes.
--
-- The two CREATE TYPE statements below are NOT subject to this: the restriction
-- applies to values added to a pre-existing enum, not to a type created outright,
-- which is why `card_kind` can take a DEFAULT of 'coaching_card' in this file.

ALTER TYPE "wing"."heuristic_component_type" ADD VALUE IF NOT EXISTS 'detection_method';--> statement-breakpoint
ALTER TYPE "wing"."heuristic_component_type" ADD VALUE IF NOT EXISTS 'delivery_adaptation';--> statement-breakpoint
ALTER TYPE "wing"."heuristic_component_type" ADD VALUE IF NOT EXISTS 'failure_path';--> statement-breakpoint
ALTER TYPE "wing"."heuristic_component_type" ADD VALUE IF NOT EXISTS 'success_criteria';--> statement-breakpoint

-- ── intervention_type: a column, not a component ────────────────────────────
--
-- One classifier per card, not versioned prose. A component row carries content
-- that gets refined over time with a version lineage behind it; "this card is a
-- CHALLENGE" is a single fact that either changes or does not, and storing it as
-- a component would mean a JOIN and a version walk to answer "which cards
-- challenge the student", which the engine needs on every turn.
--
-- SEVEN VALUES, NOT SIX. An earlier inventory of the compendium reported six —
-- COACH, META, CHALLENGE, REDIRECT, REFRAME, AFFIRM — and an enum built from
-- that list rejects 19 cards at seed time: every `IG-*` gate in Modules 10 and
-- 11 plus all six universal `IG-U` gates declare `GATE`. Found by
-- `parse-compendium.ts`, which is why the parser runs before the seed.
--
-- Distribution across the 182 cards, for anyone sizing a query:
--   COACH 82 · META 35 · GATE 19 · CHALLENGE 14 · REDIRECT 14 · REFRAME 11 · AFFIRM 7
DO $$ BEGIN
  CREATE TYPE "wing"."heuristic_intervention_type" AS ENUM (
  'COACH', 'CHALLENGE', 'REDIRECT', 'REFRAME', 'AFFIRM', 'META', 'GATE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- ── card_kind: the discriminator the engine is missing ──────────────────────
--
-- `heuristics.status` is candidate/validated/retired — a LIFECYCLE. Nothing says
-- what KIND of card a row is, and the three kinds behave differently enough that
-- the engine cannot treat them alike:
--
--   coaching_card   fires on the STUDENT's turn. What the detector matches.
--   integrity_gate  fires on WING's OWN OUTPUT, before delivery. Must never
--                   enter the detector catalogue: a gate's signal describes
--                   something Wing is about to say, so offering it to the
--                   detector asks the model to match Wing's rules against the
--                   student's words. 54 of the 184 specifications are gates.
--   exercise        routed to by an explicit reference from another card's
--                   coaching_move, not by signal match — which is why all 19
--                   exercise-library cards state no sequence weight. They are
--                   not in the precedence ordering because they are not
--                   competing to fire.
--
-- Without this column a v2 import loads 54 output-inspection rules as if they
-- were student-turn signals. That is not a degraded engine, it is a wrong one.
DO $$ BEGIN
  CREATE TYPE "wing"."heuristic_card_kind" AS ENUM (
  'coaching_card', 'integrity_gate', 'exercise'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "wing"."heuristics"
  ADD COLUMN IF NOT EXISTS "intervention_type" "wing"."heuristic_intervention_type";--> statement-breakpoint

-- Defaults to coaching_card so existing rows keep the behaviour they have today.
-- Every card extracted before v2 came from the prompt files as student-turn
-- coaching, so the default is correct for all 253 of them rather than merely
-- convenient.
ALTER TABLE "wing"."heuristics"
  ADD COLUMN IF NOT EXISTS "card_kind" "wing"."heuristic_card_kind"
  NOT NULL DEFAULT 'coaching_card';--> statement-breakpoint

-- The engine asks "which non-retired cards in this sequence may fire on a
-- student turn" on every turn, and that question is now two columns wide.
CREATE INDEX IF NOT EXISTS "heuristics_kind_status_idx"
  ON "wing"."heuristics" ("card_kind", "status");

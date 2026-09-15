-- The test harness's own persona table — draft/ready/seeded personas authored from the
-- Admin panel, replacing file-based `methodology/personas/*.md` specs for anyone who isn't
-- running commands (Danielle). See claude/HARNESS_PERSONA_UI_AND_DOC_REVIEW_SEP10.md.
--
-- WHY THIS IS NOT PART OF THE ORIGINAL SPEC: no row in this table is ever read by the live
-- methodology. It is authored data for the harness only, read and written by
-- server/harness-persona-routes.ts, and "activating" a row runs the exact account-creation
-- logic server/wing/seed-personas.ts already runs from the CLI — a wing.users row with
-- is_test_user = true, a wing.students row bound to a cycle, and a wing.intake_records row
-- carrying the pathway. Nothing outside the harness ever queries this table.
--
-- WHY THE PERSONA'S PROSE IS SEVERAL COLUMNS, NOT ONE BLOB: the first cut of this table had
-- a single `spec_body` and a `source_note` inviting a document link. Aditya's correction, 10
-- Sep: expose the actual fields Danielle writes rather than depending on parsing a document.
-- The columns below are exactly the sections her own sample document uses (Quick Reference,
-- Readiness to change by behavior, Interaction Policy, Voice Sample, Diamond/testable
-- outcome, the Cold-Start Problem, System Prompt Summary, What This Tests) — each kept
-- verbatim in its own field, the same "never reflowed, never summarised" guarantee
-- `parse-persona.ts` gives the file format's body, just split at the seams she already
-- writes at rather than glued into one field. `composeSpecPrompt()` in
-- harness-persona-store.ts concatenates them, in this fixed order, into the one text a
-- future runner injects — so there is still exactly one verbatim prompt, assembled rather
-- than typed as one.
--
-- NOTE (10 Sep, later same day): an earlier version of this table also carried
-- `related_personas`, a free-text array for notes like "Tyler and Greg are father and son —
-- same family trust baseline". Removed on Aditya's request once confirmed nothing reads it —
-- not the store, not the routes, not the boundary test. If a real use for cross-referencing
-- personas shows up later, it's a fresh column then, not a resurrection of an unused one.
--
-- WHY status/action-style columns are plain text + CHECK rather than a new enum type: this
-- repo's own recent convention for a narrow, single-purpose flag with no other consumer
-- (see 0038_reveal_cycles.sql's `action`/`kind` columns) — not every three-value flag earns
-- a CREATE TYPE.
--
-- WHY professional_status and pathway reuse the EXISTING wing enums rather than mirroring
-- them as text + CHECK: unlike `status` above, these two are not internal to this table —
-- they are read by populationTagsFor() and must stay the exact same vocabulary
-- wing.users.professional_status and wing.intake_records.pathway already enforce, so the
-- database should refuse a fourth value here exactly as it would there.

BEGIN;

CREATE TABLE IF NOT EXISTS "wing"."harness_personas" (
  "id" bigserial PRIMARY KEY,
  -- Stable slug — same identity rule as parse-persona.ts's file-based `id`, so both
  -- authoring paths key on the same thing and a persona's email
  -- (persona+<key>@sli-harness.invalid) never changes under an edit.
  "persona_key" text NOT NULL,
  "name" text NOT NULL,
  -- Nullable here: a draft may be saved before either is filled in. The API refuses to
  -- mark a persona 'ready' or to activate it without both — the same refusal
  -- parse-persona.ts already makes for the file format, and for the same reason (without
  -- them every audience-specific card looks like dead weight in the Unfired Cards report).
  "professional_status" "wing"."professional_status",
  "pathway" "wing"."career_pathway",
  -- Danielle's deterministic-marker vocabulary — optional, and distinct from "what_this_
  -- tests" below, which is qualitative and read by a person, not counted.
  "expected_markers" text[] NOT NULL DEFAULT '{}',
  -- The eight sections her sample document actually contains. Each kept verbatim; none of
  -- them are required to save a draft, only to activate (see validatePersonaForActivation).
  "quick_reference" text NOT NULL DEFAULT '',
  "readiness_by_behavior" text NOT NULL DEFAULT '',
  "interaction_policy" text NOT NULL DEFAULT '',
  "voice_sample" text NOT NULL DEFAULT '',
  "diamond" text NOT NULL DEFAULT '',
  "cold_start_note" text NOT NULL DEFAULT '',
  "system_prompt_summary" text NOT NULL DEFAULT '',
  "what_this_tests" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'draft',
  -- Set once activated. Mirrors seed-personas.ts: activating is idempotent by
  -- persona_key, and an already-seeded persona is refused rather than silently repointed
  -- to a different account.
  "seeded_student_id" bigint,
  "seeded_cycle_id" bigint,
  "created_by_admin_id" bigint,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "harness_personas_persona_key_unique" UNIQUE ("persona_key"),
  CONSTRAINT "harness_personas_status_check"
    CHECK ("status" IN ('draft', 'ready', 'seeded'))
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."harness_personas"
    ADD CONSTRAINT "harness_personas_seeded_student_id_fk"
    FOREIGN KEY ("seeded_student_id") REFERENCES "wing"."students"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."harness_personas"
    ADD CONSTRAINT "harness_personas_seeded_cycle_id_fk"
    FOREIGN KEY ("seeded_cycle_id") REFERENCES "wing"."school_cycles"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."harness_personas"
    ADD CONSTRAINT "harness_personas_created_by_admin_id_fk"
    FOREIGN KEY ("created_by_admin_id") REFERENCES "wing"."users"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "harness_personas_status_idx"
  ON "wing"."harness_personas" ("status");--> statement-breakpoint

COMMIT;

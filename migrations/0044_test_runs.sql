-- Run records for the persona simulator (P3, claude/TEST_HARNESS_PLAN_SEP9.md). A methodology
-- finding has to be traceable to the exact persona version and sequence version that produced
-- it, so every run is recorded before any turn is driven, not reconstructed afterward from
-- whatever session rows happen to exist.
--
-- wing.test_runs is the run itself: which persona (by id, plus a hash of its spec text at the
-- moment the run started, since the same persona row can be edited later), which published
-- heuristic sequence was active, which checkpoint the account was fast-forwarded to before the
-- run started, and the checkpoint's fidelity (see server/wing/checkpoint-store.ts —
-- "marked_complete" is the only one built so far; "replayed" is a future addition, not a new
-- column, since the column is text, not an enum, for exactly the same one-off reason
-- harness_personas.status is).
--
-- wing.test_run_sessions is one row per Foundation session the run actually drives turns
-- against — today that's always exactly one (the run's single target session), kept as its own
-- table rather than a column on test_runs because a later, multi-session run (e.g. driving
-- Foundation 1 through 3 back to back in one run) is the natural next step and shouldn't need a
-- schema change to add.
--
-- Nothing here is read by the live methodology or by any real (non-test) student flow —
-- exactly the same boundary claude/HARNESS_BUILD_STEP6_SEP10.md drew for harness_personas.

BEGIN;

CREATE TABLE IF NOT EXISTS "wing"."test_runs" (
  "id" bigserial PRIMARY KEY,
  "persona_id" bigint NOT NULL,
  -- sha256 of composeSpecPrompt(persona) at the moment this run started — the persona row can
  -- be edited later, so a finding traces to the exact wording that produced it, not whatever
  -- the row says today.
  "spec_hash" text NOT NULL,
  -- The heuristic_sequences row publishing cards when this run started. Nullable at the column
  -- level though activatePersona/applyCheckpoint already refuse a cycle that publishes
  -- nothing, so this should always be set in practice — the same caution
  -- create-sandbox-cycle.ts and seed-personas.ts already take independently before writing
  -- under a cycle.
  "sequence_id" bigint,
  -- One of checkpoint-store.ts's four checkpoint values — plain text, not this table's own
  -- enum, so the two never drift: this column only ever labels the run, and checkpoint-store.ts
  -- stays the single place that vocabulary is defined.
  "checkpoint" text NOT NULL,
  -- 'marked_complete' | 'replayed' — see checkpoint-store.ts's ApplyCheckpointResult. A finding
  -- read off the wrong fidelity is the failure mode this column exists to prevent (Danielle,
  -- 9 Sep pre-read): "marked_complete" is valid for card firing and wording, not for whether an
  -- opening lands.
  "fidelity" text NOT NULL DEFAULT 'marked_complete',
  "turn_ceiling" integer NOT NULL DEFAULT 12,
  -- Which Azure OpenAI deployment tier played the persona's side of the conversation. Null
  -- until the run actually starts driving turns (P3.1) — a provisioned-but-not-yet-run record
  -- hasn't chosen one yet.
  "model_deployment" text,
  -- 'provisioned' | 'running' | 'completed' | 'aborted' — plain text, this table's own
  -- single-purpose flag, same convention as harness_personas.status.
  "status" text NOT NULL DEFAULT 'provisioned',
  "abort_reason" text,
  "started_at" timestamptz,
  "finished_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "test_runs_checkpoint_check"
    CHECK ("checkpoint" IN ('from_scratch', 'foundation_1_complete', 'foundation_2_complete', 'module_6_entry')),
  CONSTRAINT "test_runs_fidelity_check"
    CHECK ("fidelity" IN ('marked_complete', 'replayed')),
  CONSTRAINT "test_runs_status_check"
    CHECK ("status" IN ('provisioned', 'running', 'completed', 'aborted'))
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."test_runs"
    ADD CONSTRAINT "test_runs_persona_id_fk"
    FOREIGN KEY ("persona_id") REFERENCES "wing"."harness_personas"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."test_runs"
    ADD CONSTRAINT "test_runs_sequence_id_fk"
    FOREIGN KEY ("sequence_id") REFERENCES "wing"."heuristic_sequences"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "test_runs_persona_idx"
  ON "wing"."test_runs" ("persona_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "test_runs_status_idx"
  ON "wing"."test_runs" ("status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "wing"."test_run_sessions" (
  "id" bigserial PRIMARY KEY,
  "test_run_id" bigint NOT NULL,
  "session_id" bigint NOT NULL,
  -- Denormalized from wing.sessions.session_type — cheap, and lets a run's session list be
  -- read without a join for the common case (one row).
  "session_type" "wing"."session_type" NOT NULL,
  "turn_count" integer NOT NULL DEFAULT 0,
  -- 'pending' | 'in_progress' | 'completed' | 'aborted' — mirrors test_runs.status at the
  -- per-session grain, so a future multi-session run can have one session still running while
  -- another already finished.
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "test_run_sessions_status_check"
    CHECK ("status" IN ('pending', 'in_progress', 'completed', 'aborted'))
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."test_run_sessions"
    ADD CONSTRAINT "test_run_sessions_test_run_id_fk"
    FOREIGN KEY ("test_run_id") REFERENCES "wing"."test_runs"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."test_run_sessions"
    ADD CONSTRAINT "test_run_sessions_session_id_fk"
    FOREIGN KEY ("session_id") REFERENCES "wing"."sessions"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "test_run_sessions_run_idx"
  ON "wing"."test_run_sessions" ("test_run_id");--> statement-breakpoint

COMMIT;

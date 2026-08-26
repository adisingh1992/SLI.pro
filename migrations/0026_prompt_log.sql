-- The Reveal Cycle's prompt log: what Wing asked, and whether anyone answered.
--
-- WHY THIS IS URGENT RATHER THAN TIDY: IG-RC10's hard filter 0 says an absence
-- claim "dies unless prompts in that signal category were actually delivered".
-- Today `life_log_entries` records answers and nothing records questions, so a
-- prompt that was shown and ignored is indistinguishable from one that was never
-- shown — and those mean opposite things. A response can be read back from the
-- entry text at any time. **A delivery that was never written down is gone.**
-- That asymmetry is the whole reason this lands before the rest of the Reveal
-- Cycle: it is cheap now and impossible later.
--
-- WHY tier AND category ARE COLUMNS HERE AND NOT A JOIN: Danielle's ruling is
-- that evidence tier is a property of the PROMPT, and prompts get edited. A log
-- row has to record the tier the prompt carried WHEN IT WAS DELIVERED, or a later
-- re-tiering silently rewrites what past events counted for — the same
-- append-never-mutate rule the component versions follow. A join would make Gate
-- 2's arithmetic depend on the library's current state rather than on what
-- actually happened.
--
-- WHY tier IS NULLABLE: `prompt_library` has no tier column yet, and the 295
-- proposed tiers from `wing:tag-prompts` are with Danielle and not approved.
-- Writing a computed tier now would record our proposal as her decision. Null
-- means "not known at delivery"; `prompt_id` is kept so it can be backfilled
-- exactly once she rules.
CREATE TABLE IF NOT EXISTS "wing"."prompt_log" (
  "id" bigserial PRIMARY KEY,
  "student_id" bigint NOT NULL,
  -- The library row, so tier and category can be backfilled against what was sent.
  "prompt_id" bigint,
  -- One of reveal-evidence.ts's ten channels. Text rather than an enum: the list
  -- is hers and half of it belongs to modules that do not exist, so a migration
  -- should not be what has to happen first when she adds one.
  "channel" text NOT NULL,
  -- Her eight signal categories, recorded as at delivery. Null where the prompt's
  -- own category does not map to one of hers.
  "signal_category" text,
  -- 1, 2 or 3. Null until she approves the tiers.
  "evidence_tier" smallint,
  "delivered_at" timestamptz NOT NULL DEFAULT now(),
  -- Null means delivered and not answered, which is a finding rather than a gap.
  "responded_at" timestamptz,
  -- The user's own words. IG-U010 cannot quote what was never stored.
  "verbatim" text,
  -- single_word | list | prose. Classified at capture per her §3, and recomputable
  -- from `verbatim` if the rule changes.
  "quote_shape" text,
  -- no_response | thin | substantive.
  "substantiveness" text NOT NULL DEFAULT 'no_response',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "prompt_log_tier_range" CHECK ("evidence_tier" IS NULL OR "evidence_tier" BETWEEN 1 AND 3),
  -- A response without a time, or a time without a response, is a half-written row.
  CONSTRAINT "prompt_log_response_complete" CHECK (
    ("responded_at" IS NULL AND "verbatim" IS NULL)
    OR ("responded_at" IS NOT NULL AND "verbatim" IS NOT NULL)
  )
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."prompt_log"
    ADD CONSTRAINT "prompt_log_student_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "wing"."users"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."prompt_log"
    ADD CONSTRAINT "prompt_log_prompt_id_fk"
    FOREIGN KEY ("prompt_id") REFERENCES "wing"."prompt_library"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;--> statement-breakpoint

-- Gate 2 counts events in a trailing window, per student, newest first.
CREATE INDEX IF NOT EXISTS "prompt_log_student_delivered_idx"
  ON "wing"."prompt_log" ("student_id", "delivered_at" DESC);--> statement-breakpoint

-- IG-RC10's delivery audit: "were prompts in that category delivered during the
-- window". Partial on a known category, because a null one cannot answer it.
CREATE INDEX IF NOT EXISTS "prompt_log_category_window_idx"
  ON "wing"."prompt_log" ("student_id", "signal_category", "delivered_at" DESC)
  WHERE "signal_category" IS NOT NULL;--> statement-breakpoint

-- The open delivery a response has to find. One student's unanswered prompts are
-- few, and this is the write path, so it stays cheap.
CREATE INDEX IF NOT EXISTS "prompt_log_awaiting_response_idx"
  ON "wing"."prompt_log" ("student_id", "prompt_id", "delivered_at" DESC)
  WHERE "responded_at" IS NULL;

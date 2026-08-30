-- 0034 — what has to be true before a prompt can be edited.
--
-- B2: "Prompt library configurable without code changes."
--
-- ── EDITING A PROMPT IS NOT UPDATING ITS ROW ────────────────────────────────
-- `life_log_entries.prompt_id` and `prompt_log.prompt_id` are foreign keys to this
-- table. An entry IS an answer to the question the row holds. Rewrite the row and every
-- past answer silently becomes an answer to a question nobody was asked — a student's
-- three paragraphs about a hard week, filed under whatever the prompt says today.
--
-- The Reveal Cycle makes that worse than untidy. IG-RC10's hard filter 0 kills an
-- absence claim "unless prompts in that signal category were actually delivered", so the
-- category on the row is evidence about what was asked. Editing it in place rewrites the
-- evidence too.
--
-- So the editor retires and supersedes, exactly as the message-template editor does:
-- `active` goes false on the old row, a new row carries the new text, and both stay. The
-- reader already filters on `active` (`nextLibraryPrompt` selects `active = true`), so
-- the retired row leaves the pool the moment it is retired and the old FKs keep
-- resolving to the words that were actually sent.
--
-- Two things stand in the way of that today, and this migration removes both.

BEGIN;

-- ── 1. THE LINEAGE ─────────────────────────────────────────────────────────
--
-- Without it, three edits of one prompt are three unrelated rows and a report counting
-- answers to "U-01" finds them split across all three with nothing saying they are the
-- same question. `prompt_code` cannot do this job: the code names her document's entry,
-- and a prompt edited here has by definition diverged from her document.
--
-- Self-referencing and nullable. NULL means "written here, not derived from anything",
-- which is the correct answer for every one of the seeded rows.
ALTER TABLE "wing"."prompt_library"
  ADD COLUMN IF NOT EXISTS "supersedes_id" bigint;--> statement-breakpoint

ALTER TABLE "wing"."prompt_openers"
  ADD COLUMN IF NOT EXISTS "supersedes_id" bigint;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."prompt_library"
    ADD CONSTRAINT "prompt_library_supersedes_fk"
    FOREIGN KEY ("supersedes_id") REFERENCES "wing"."prompt_library"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."prompt_openers"
    ADD CONSTRAINT "prompt_openers_supersedes_fk"
    FOREIGN KEY ("supersedes_id") REFERENCES "wing"."prompt_openers"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "prompt_library_supersedes_idx"
  ON "wing"."prompt_library" ("supersedes_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "prompt_openers_supersedes_idx"
  ON "wing"."prompt_openers" ("supersedes_id");--> statement-breakpoint

-- ── 2. THE UNIQUE INDEXES, NARROWED TO WHAT IS LIVE ────────────────────────
--
-- 0028 put UNIQUE (source_block, prompt_code) on prompt_library and UNIQUE (pool, text)
-- on prompt_openers. Both are right about the invariant and wrong about its scope: they
-- constrain the whole table, including retired rows.
--
-- That makes retire-and-supersede impossible in the two cases that matter most:
--
--   editing        a successor keeping her prompt_code collides with its own
--                  predecessor, so the only way to save an edit is to throw away the
--                  identifier that says which of her prompts this is.
--   reverting      re-publishing an earlier opener's text collides with the retired row
--                  that still holds it. Reverting is the operation you reach for when
--                  the live copy is wrong, which is the worst moment to discover it is
--                  the one operation the schema forbids.
--
-- The invariant that was actually wanted is "one LIVE prompt per code" and "one LIVE
-- opener per (pool, text)" — the retired ones are history, and history is allowed to
-- repeat itself. Adding `active` to the predicate says that.
--
-- Dropped and recreated rather than altered: Postgres has no ALTER INDEX ... WHERE, and
-- the drop is guarded so a replay is a no-op rather than an error.
DROP INDEX IF EXISTS "wing"."prompt_library_code_idx";--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_library_code_idx"
  ON "wing"."prompt_library" ("source_block", "prompt_code")
  WHERE "prompt_code" IS NOT NULL AND "active";--> statement-breakpoint

DROP INDEX IF EXISTS "wing"."prompt_openers_text_idx";--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_openers_text_idx"
  ON "wing"."prompt_openers" ("pool", "text")
  WHERE "active";--> statement-breakpoint

COMMENT ON COLUMN "wing"."prompt_library"."supersedes_id" IS
  'The row this one was edited from. Editing a prompt retires the old row and inserts a '
  'new one, because life_log_entries.prompt_id points at whichever row was live when the '
  'student answered — rewriting it in place would re-file every past answer under a '
  'question that was never asked. NULL on a prompt written from scratch.';--> statement-breakpoint

COMMENT ON COLUMN "wing"."prompt_openers"."supersedes_id" IS
  'The row this one was edited from. Same rule as prompt_library: message_events.opener_id '
  'records which greeting a student received, so an edit publishes a successor rather '
  'than rewriting history.';

COMMIT;

-- 0028 — the prompt library her documents describe.
--
-- T7's first half. `wing.prompt_library` has held seven columns since 0000 — id, category,
-- prompt_text, population_tags, active, created_at, updated_at — and 28 rows in seven
-- categories that predate her library entirely (career, personal, content, education,
-- encouragement, fun, design_thinking). Her library is 220 micro-journal prompts plus 48
-- heartbeat prompts, and none of what the selection engine needs to choose between them
-- has anywhere to live.
--
-- ── EVERY COLUMN TRACES TO A LINE SHE WROTE ─────────────────────────────────
-- The Integration Notes at the end of the micro-journal library are the spec:
--
--   "Every prompt in this library should be tagged with its behavioral signal in the
--    prompt_library schema so the adaptive selection engine can choose based on what
--    signal is most informative for the current user."          → behavioral_signal
--
--   "The universal opener pool should be implemented as a separate layer — the system
--    selects the opener independently of the prompt, ensuring variety in how prompts
--    feel even when the underlying question repeats at the 14-day minimum interval."
--                                                                → wing.prompt_openers
--
--   "The event-sensitivity rule is a constraint on the adaptive selection engine:
--    prompts referencing specific events … are only eligible for delivery if the user
--    has mentioned the event."                                   → event_sensitive
--
--   "Rotation weighting: Roughly 2:1 approachable-to-serious in any given week."
--                                                                → library
--
-- Nothing here is a column somebody thought would be useful.
--
-- ── WHY THE LIVE READER DOES NOT BREAK ──────────────────────────────────────
-- `messaging-store.selectPrompt` filters on `active` and optionally on `category`, and
-- `life-log-store` joins on id and reads `prompt_text`. Every addition is nullable or
-- defaulted, and the only change to an existing column is dropping a NOT NULL. Both
-- keep working on the 28 rows that are already there, unchanged.
--
-- ── WHAT THIS MIGRATION DELIBERATELY DOES NOT DO ────────────────────────────
-- It does not seed. The 220 prompts arrive in their own step, because a schema that is
-- wrong is cheap to fix and 220 rows written under a wrong schema are not.
--
-- It does not populate `signal_category`. Her eight categories — Language, Energy,
-- Decision, Relationship, Industry, Career, Influence, Achievement — are named in Part 9.2
-- and in the Reveal Cycle, and NOT ONE of the 220 prompts carries one. The library's own
-- `*Signal:*` lines are analytical prose ("tacit knowledge. Intuitive expertise that
-- exists beyond explicit instruction."), not category labels, and the block headings mix
-- theme with style — "The Playful Ones" is not one of her eight and does not map to one.
--
-- So the prose is stored verbatim in `behavioral_signal` and the category stays NULL until
-- she assigns it. This is the same ruling as `prompt_log`: a wrong category is worse than a
-- null one, because Gate 2 counts DISTINCT categories and a guess either manufactures
-- distinctness that is not there or collapses distinctness that is.
--
-- **This is the column that currently blocks the Reveal Cycle.** Gate 2 needs four Tier 1
-- events across three distinct signal categories. Every prompt in the live library maps to
-- null or, for the legacy `career` rows, to one. Until these are assigned, Gate 2 cannot
-- fire however much a student writes.

BEGIN;

-- ── prompt_library ──────────────────────────────────────────────────────────

-- Her id for the prompt: a bare number in Section 1, a code like U-01 or EF-03 elsewhere.
-- Not unique on its own — heartbeat prompts are numbered 1 to 8 within each track, so the
-- ids repeat across blocks. Uniqueness is on the pair, below.
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "prompt_code" text;--> statement-breakpoint

-- Her `*Signal:*` line, verbatim. The thing her Integration Note asks to be tagged.
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "behavioral_signal" text;--> statement-breakpoint

-- One of her eight. Text rather than an enum for the same reason 0026 used text: the list
-- is hers, and a migration should not be what has to happen first when she revises it.
-- Null until she assigns them — see the note above.
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "signal_category" text;--> statement-breakpoint

-- 1, 2 or 3, proposed by `wing:tag-prompts`. Null until she approves the tiers, exactly as
-- in prompt_log.
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "evidence_tier" smallint;--> statement-breakpoint

-- universal | adapted | specific — her three sections. Governs who is eligible together
-- with population_tags, which already exists and already holds the audience.
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "audience_scope" text;--> statement-breakpoint

-- micro_journal | heartbeat. Two different rhythms from two different documents; the
-- cadence classes themselves are B2's and cannot fire until the scheduler exists.
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "cadence" text;--> statement-breakpoint

-- approachable | reflective. Her rotation weighting is "roughly 2:1 approachable-to-serious
-- in any given week", which needs the two pools to be distinguishable. The 28 rows already
-- in the table are the serious ones; the backfill below says so.
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "library" text;--> statement-breakpoint

-- Her event-sensitivity rule, as a flag the selection engine can filter on. Default false,
-- because the overwhelming majority of her prompts use general scenes on purpose — she
-- wrote the rule to keep them that way.
ALTER TABLE "wing"."prompt_library"
  ADD COLUMN IF NOT EXISTS "event_sensitive" boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- Where the row came from, so a re-seed can be diffed against the document rather than
-- against memory. `source_line` is the line in that file at the time of seeding.
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "source_document" text;--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "source_block" text;--> statement-breakpoint
ALTER TABLE "wing"."prompt_library" ADD COLUMN IF NOT EXISTS "source_line" integer;--> statement-breakpoint

-- `category` is the seven-value legacy enum and none of her 220 prompts has one. Forcing a
-- value would be inventing a classification; the column stays for the 28 rows that have
-- one and for `selectPrompt`'s optional filter.
ALTER TABLE "wing"."prompt_library" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."prompt_library"
    ADD CONSTRAINT "prompt_library_tier_range"
    CHECK ("evidence_tier" IS NULL OR "evidence_tier" BETWEEN 1 AND 3);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."prompt_library"
    ADD CONSTRAINT "prompt_library_audience_scope"
    CHECK ("audience_scope" IS NULL OR "audience_scope" IN ('universal', 'adapted', 'specific'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."prompt_library"
    ADD CONSTRAINT "prompt_library_cadence"
    CHECK ("cadence" IS NULL OR "cadence" IN ('micro_journal', 'heartbeat'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "wing"."prompt_library"
    ADD CONSTRAINT "prompt_library_library"
    CHECK ("library" IS NULL OR "library" IN ('approachable', 'reflective'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- Her eight, as a guard rather than as a type. A row may carry none; it may not carry a
-- ninth. This is what stops a plausible-looking wrong category being written quietly.
DO $$ BEGIN
  ALTER TABLE "wing"."prompt_library"
    ADD CONSTRAINT "prompt_library_signal_category"
    CHECK ("signal_category" IS NULL OR "signal_category" IN (
      'language', 'energy', 'decision', 'relationship',
      'industry', 'career', 'influence', 'achievement'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- One row per (block, code). Partial, because the 28 existing rows have neither and a
-- plain unique index would collide them all on (NULL, NULL) in some engines and, worse,
-- would silently permit any number of un-coded duplicates here.
CREATE UNIQUE INDEX IF NOT EXISTS "prompt_library_code_idx"
  ON "wing"."prompt_library" ("source_block", "prompt_code")
  WHERE "prompt_code" IS NOT NULL;--> statement-breakpoint

-- The selection engine's read: eligible prompts for a student, by pool and cadence.
CREATE INDEX IF NOT EXISTS "prompt_library_selection_idx"
  ON "wing"."prompt_library" ("active", "cadence", "library", "audience_scope");--> statement-breakpoint

-- ── prompt_openers ──────────────────────────────────────────────────────────
--
-- "The universal opener pool should be implemented as a separate layer — the system
-- selects the opener independently of the prompt."
--
-- A separate table rather than a column, because that is what independent selection means:
-- eleven openers against 220 prompts is 2,420 pairings, and a student who sees the same
-- question at the 14-day floor should not see the same greeting with it. Folding the
-- opener into the prompt row would make the two move together, which is the one thing her
-- note rules out.
CREATE TABLE IF NOT EXISTS "wing"."prompt_openers" (
  "id" serial PRIMARY KEY,
  -- casual | warm_return | post_response. Her three pools, and they are not
  -- interchangeable: warm_return is for "users who haven't responded in 5+ days" and
  -- post_response is for following up on a theme, so the pool is a precondition, not a
  -- flavour. Text with a CHECK, consistent with the columns above.
  "pool" text NOT NULL,
  "text" text NOT NULL,
  -- Her openers interpolate the user's name, and one post_response opener also
  -- interpolates a topic. Recorded so a renderer can refuse an opener whose placeholders
  -- it cannot fill rather than sending "[Name]" to a student.
  "placeholders" text[] NOT NULL DEFAULT '{}',
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "prompt_openers_pool" CHECK ("pool" IN ('casual', 'warm_return', 'post_response'))
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_openers_text_idx"
  ON "wing"."prompt_openers" ("pool", "text");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "prompt_openers_pool_idx"
  ON "wing"."prompt_openers" ("active", "pool");--> statement-breakpoint

-- ── the 28 rows already there ───────────────────────────────────────────────
--
-- Guarded rather than left to the WHERE clause, per the replay rule the contract suite
-- enforces: on a second run nothing matches, the IF is false, and no row is touched.
--
-- They are the "serious/reflective" pool her rotation weighting names, and they predate the
-- micro-journal split, so `cadence` stays NULL rather than being assigned one. Only what is
-- known is written.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "wing"."prompt_library" WHERE "library" IS NULL) THEN
    UPDATE "wing"."prompt_library"
    SET "library" = 'reflective',
        "updated_at" = now()
    WHERE "library" IS NULL;
  END IF;
END $$;--> statement-breakpoint

DO $$
DECLARE
  total integer;
  categorised integer;
BEGIN
  SELECT count(*), count("signal_category") INTO total, categorised
  FROM "wing"."prompt_library";
  RAISE NOTICE '0028: % prompt(s) in the library, % with one of her signal categories', total, categorised;
  RAISE NOTICE '0028: the Reveal Cycle Gate 2 needs three distinct categories — assign them before it can fire';
END $$;

COMMIT;

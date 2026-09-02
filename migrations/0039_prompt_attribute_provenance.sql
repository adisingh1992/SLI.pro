-- 0039 — why a tier or a signal category is what it is, and who said so.
--
-- `evidence_tier` and `signal_category` (0028) have sat null on every row since the
-- library was seeded — "null until she approves the tiers", "not one prompt carries one".
-- That silence was deliberate: a wrong category is worse than a missing one, because Gate
-- 2 counts distinct categories and a bad guess can manufacture distinctness that is not
-- there or collapse distinctness that is (see prompt-library-source.ts's own comment).
--
-- This migration doesn't change that carefulness — it gives it somewhere to write down
-- its reasoning. `populate-prompt-attributes.ts` proposes a value for both columns using
-- her own stated rules (evidence tier) and her own stated category definitions plus her
-- own per-prompt Signal annotations (signal category), the same "show your work" pattern
-- `wing:tag-prompts` already uses in its report — except this pass writes to the row
-- instead of a markdown file, and reasoning that used to live only in a report Danielle
-- may never open now lives on the row itself, for the admin review screen to show her.
--
-- ── WHY THIS IS A PLAIN UPDATE, NOT A RETIRE-AND-SUPERSEDE (0034) ───────────────
-- 0034's rule is for editing a prompt's TEXT, because life_log_entries.prompt_id and
-- prompt_log.prompt_id point at the row a student was actually asked, and rewriting text
-- in place re-files past answers under a question nobody was asked. Setting a
-- classification field on a row nothing has been delivered against yet — logDelivery has
-- no production caller as of this migration — carries no such risk: there is no historical
-- answer anywhere that this update could mis-attribute. If that stops being true (delivery
-- gets wired, students start answering), a LATER change to an already-classified row's
-- tier or category should go through the same retire-and-supersede path 0034 built, not a
-- plain UPDATE — worth remembering when that day comes rather than rediscovering.
--
-- ── WHY "source" AND NOT A BOOLEAN "verified" ────────────────────────────────
-- A boolean answers one question — has a human looked at this — and this table needs to
-- answer a different one: WHAT produced the value, so a reviewer can weight it accordingly.
-- 'rule_engine' means a deterministic function applied one of her own written rules
-- mechanically (today's evidence-tier pass). 'claude_review' means a judgment call was
-- made against her stated definitions and per-prompt annotations, not a mechanical match
-- (today's signal-category pass, and any evidence-tier row the rule engine could not call).
-- 'danielle' is reserved for the day she or an admin edits a row through the review screen
-- and overwrites either the value or the reasoning herself. Nothing here gates the Reveal
-- Cycle on any of the three — Gate 2 reads wing.prompt_log, not this table, and nothing
-- writes wing.prompt_log in production yet (see claude/REVEAL_CYCLE_PLUMBING_SEP2.md and
-- the Sept 2 follow-up) — so this is provenance for a human reviewing the library, not a
-- live safety gate. Whoever wires prompt delivery to logDelivery later should decide
-- there, deliberately, whether an unreviewed 'claude_review' row is fit to feed a real
-- Reveal — this migration takes no position on that question, it only makes the answer to
-- "was this reviewed by a person" answerable instead of silent.

BEGIN;

ALTER TABLE "wing"."prompt_library"
  ADD COLUMN IF NOT EXISTS "evidence_tier_because" text;--> statement-breakpoint

ALTER TABLE "wing"."prompt_library"
  ADD COLUMN IF NOT EXISTS "evidence_tier_source" text;--> statement-breakpoint

ALTER TABLE "wing"."prompt_library"
  ADD COLUMN IF NOT EXISTS "signal_category_because" text;--> statement-breakpoint

ALTER TABLE "wing"."prompt_library"
  ADD COLUMN IF NOT EXISTS "signal_category_source" text;--> statement-breakpoint

COMMENT ON COLUMN "wing"."prompt_library"."evidence_tier_because" IS
  'The words that decided evidence_tier, so a reviewer can disagree with the reason rather '
  'than just the answer. Same idea as prompt-tiers.ts''s TierProposal.because, written to '
  'the row instead of only to a report.';--> statement-breakpoint

COMMENT ON COLUMN "wing"."prompt_library"."evidence_tier_source" IS
  '''rule_engine'' | ''claude_review'' | ''danielle''. What produced evidence_tier, not '
  'whether a person has checked it — see this migration''s header. Null means the column '
  'predates this pass (the 28 legacy rows, or any row set before this migration ran).';--> statement-breakpoint

COMMENT ON COLUMN "wing"."prompt_library"."signal_category_because" IS
  'The words that decided signal_category — usually a quote from the row''s own '
  'behavioral_signal annotation, since that is what Danielle actually wrote about the '
  'prompt. Null where nothing in the annotation or the prompt text supported a category '
  'and the field was left null rather than guessed.';--> statement-breakpoint

COMMENT ON COLUMN "wing"."prompt_library"."signal_category_source" IS
  'Same vocabulary and same meaning as evidence_tier_source, for signal_category.';--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "prompt_library_needs_review_idx"
  ON "wing"."prompt_library" ("active", "evidence_tier_source", "signal_category_source");

COMMIT;

-- A session type per module, so a sequence entry can be scoped to its own module.
--
-- WHY: `heuristic_sequence_entries.applies_to_session` is how `getSequenceCards`
-- keeps H-201, the Foundation 2 credibility test, out of a Foundation 1 session.
-- It reuses `wing.session_type` on purpose, so an entry's scope cannot drift from
-- what `sessions.session_type` actually stores.
--
-- That enum has ONE value for every module from 4 to 13: `module_run`. It was
-- enough while only Foundation was deployed. It is not enough now that the library
-- holds 160 coaching cards, 105 of them in Modules 4 through 13 — scoping all of
-- those to `module_run` would put Module 9's power-dynamics cards and Module 10's
-- interview cards in front of the detector during a Module 4 career session, and
-- the peak detector load would be 105 against a hard limit of 40. The limit would
-- refuse the sequence, correctly, and raising the limit would be treating the
-- symptom: the problem is not that 105 cards is too many, it is that they are not
-- 105 cards about the same thing.
--
-- With a value per module the peak becomes the largest single module — 22, Module
-- 10 — which is under the hard limit of 40 and over the soft limit of 15 for four
-- modules. That is a review warning, which is what the soft limit is for.
--
-- `reveal_cycle` is here for a different reason. The Reveal Cycle is a system
-- event rather than a module: its cards fire when a monthly synthesis is
-- assembled, not when a student types. Giving it its own scope keeps its ten
-- coaching cards out of every ordinary session's catalogue rather than leaving
-- them unscoped, where they would be added to every module's load.
--
-- `module_12` is deliberately absent. Reserved and unassigned — the number skipped
-- when Module 13 was named — and a scope nothing can be scoped to is a value
-- someone will eventually use by mistake.
--
-- `module_run` is KEPT. `sessions.session_type` stores it on real rows, so
-- removing it is a data migration rather than an enum change, and nothing here
-- needs it gone.
--
-- ADD VALUE IF NOT EXISTS so re-running is safe. Postgres 12+ permits this inside
-- a transaction as long as the new value is not used in the same transaction, and
-- nothing here inserts.
ALTER TYPE "wing"."session_type" ADD VALUE IF NOT EXISTS 'module_4';--> statement-breakpoint
ALTER TYPE "wing"."session_type" ADD VALUE IF NOT EXISTS 'module_5';--> statement-breakpoint
ALTER TYPE "wing"."session_type" ADD VALUE IF NOT EXISTS 'module_6';--> statement-breakpoint
ALTER TYPE "wing"."session_type" ADD VALUE IF NOT EXISTS 'module_7';--> statement-breakpoint
ALTER TYPE "wing"."session_type" ADD VALUE IF NOT EXISTS 'module_8';--> statement-breakpoint
ALTER TYPE "wing"."session_type" ADD VALUE IF NOT EXISTS 'module_9';--> statement-breakpoint
ALTER TYPE "wing"."session_type" ADD VALUE IF NOT EXISTS 'module_10';--> statement-breakpoint
ALTER TYPE "wing"."session_type" ADD VALUE IF NOT EXISTS 'module_11';--> statement-breakpoint
ALTER TYPE "wing"."session_type" ADD VALUE IF NOT EXISTS 'module_13';--> statement-breakpoint
ALTER TYPE "wing"."session_type" ADD VALUE IF NOT EXISTS 'reveal_cycle';

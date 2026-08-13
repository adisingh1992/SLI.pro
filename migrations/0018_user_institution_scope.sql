-- Administrators gain the institution they belong to.
--
-- WHY: `students.institution_id` binds a student to their university and
-- `advisors.institution_id` binds an advisor to theirs, but there has never been
-- an equivalent for an ADMINISTRATOR. `wing.users` carries `role` and nothing
-- else, so an `institution_admin` had no institution — which means no guard
-- could scope one even in principle, however carefully it was written.
--
-- What that allows: `/api/admin/metrics/export` takes `institutionId` from the
-- query string and never compares it to the caller, so a Berkeley admin could
-- request Vanderbilt's cohort and receive a CSV of student names and email
-- addresses — or omit the parameter entirely, which means "no filter" and
-- returns every student on the platform. `/api/admin/export/transcripts` is the
-- same guard over full coaching conversations.
--
-- Nothing has leaked. Nothing anywhere creates an `institution_admin`: the only
-- role writes in the codebase set `platform_admin` (routes.ts, bootstrap.ts) or
-- `student`, so today every administrator is SLI.pro staff and the exposure is
-- latent. This column exists so that the control is in place BEFORE the first
-- Berkeley or Vanderbilt administrator account is created, rather than after.
--
-- SEMANTICS, because a nullable column with two meanings needs them written
-- down:
--   platform_admin    NULL — unrestricted. SLI.pro staff see every institution.
--   institution_admin SET  — sees exactly that institution.
--                     NULL — sees NOTHING. Fail closed: an admin account nobody
--                            finished configuring must not default to seeing
--                            everything, which is what any other default means.
--   advisor           SET  — mirrors `advisors.institution_id`.
--   student           NULL — unused. A student's binding lives on
--                            `students.institution_id`, and duplicating it here
--                            would create two sources of truth that drift.
--
-- No backfill: there are no `institution_admin` rows to backfill, and giving
-- existing `platform_admin` rows an institution would narrow SLI.pro's own
-- access.

ALTER TABLE "wing"."users"
  ADD COLUMN IF NOT EXISTS "institution_id" bigint REFERENCES "wing"."institutions"("id");--> statement-breakpoint

-- Resolved on every admin request that reads student data, so it gets an index.
-- Partial, because the column is NULL for every student and for platform staff
-- — which is the overwhelming majority of rows.
CREATE INDEX IF NOT EXISTS "users_institution_idx"
  ON "wing"."users" ("institution_id") WHERE "institution_id" IS NOT NULL;

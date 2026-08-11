-- Institutions gain the email domains that identify their students.
--
-- Without this there is no way a student ever becomes an institutional
-- student. `identity.createUser` creates everyone as origin='direct' with a
-- NULL institution_id, and nothing anywhere sets it — so the B4 dashboard's
-- Berkeley and Vanderbilt filters return zero rows however many students from
-- those universities have registered, and the advisor snapshot has no
-- institution to scope to.
--
-- Email domain is the right signal for the partnerships: a student registering
-- with a berkeley.edu address is a Berkeley student, which is exactly how the
-- institutional programme is defined. It is also checkable at registration,
-- unlike anything the student would have to be asked.

ALTER TABLE "wing"."institutions"
  ADD COLUMN IF NOT EXISTS "email_domains" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint

-- Lookup by domain happens on every registration, so it gets an index.
-- GIN because the query is "does this array contain the domain".
CREATE INDEX IF NOT EXISTS "institutions_email_domains_idx"
  ON "wing"."institutions" USING GIN ("email_domains");

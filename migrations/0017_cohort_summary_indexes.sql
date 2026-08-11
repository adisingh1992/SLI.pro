-- Indexes for the cohort summary query (admin students list).
--
-- ── WHY THESE TWO AND NOT THE OTHERS ───────────────────────────────────────
-- `cohort-summary.ts` decides a student's funnel position with a CASE over
-- EXISTS subqueries, one per stage. Most of the tables it touches already have
-- a usable index because they were given a composite one for another reason:
--
--   sessions          (student_id, session_type)   sessions_student_type_idx
--   sli_records       (student_id, status)         sli_records_student_status_idx
--   documents         (student_id, doc_type)       documents_student_type_idx
--   intake_records    student_id UNIQUE            implicit
--   students          user_id UNIQUE               implicit
--
-- These two do not. A foreign key constrains the referencing column but does
-- NOT index it — Postgres indexes the referenced side only. So
-- `linkedin_optimizations` and `freshness_reports` were reachable only by
-- sequential scan.
--
-- That matters more than it looks: LinkedIn optimisation is the FIRST branch of
-- the CASE, so it is evaluated for every user in the cohort before any other
-- branch is considered. Collapsing 2,300 queries into one and then leaving it
-- to seq-scan a table per student would have moved the cost rather than removed
-- it.
--
-- Safe to re-run.

create index if not exists linkedin_optimizations_student_idx
  on wing.linkedin_optimizations (student_id);

create index if not exists freshness_reports_student_idx
  on wing.freshness_reports (student_id);

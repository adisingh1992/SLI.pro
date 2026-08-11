-- Internship start date, for the 30- and 60-day milestone messages (B3 E2).
--
-- "E2. Internship Milestones — 30 and 60 days after internship start."
--
-- Nothing in the schema recorded when an internship began, so there was no date
-- to count from. It goes on the student rather than being inferred from a life
-- log entry: inferring "I started my internship today" from prose would fire
-- real emails on a guess, and a milestone message arriving three weeks early is
-- worse than one that never arrives.
--
-- Nullable, because most students are not on an internship. NULL means the
-- milestones simply never fire for them, which is correct rather than a gap.

ALTER TABLE "wing"."students"
  ADD COLUMN IF NOT EXISTS "internship_start_date" date;--> statement-breakpoint

-- The runner asks "whose internship started exactly 30 or 60 days ago", so the
-- date is the lookup key.
CREATE INDEX IF NOT EXISTS "students_internship_start_idx"
  ON "wing"."students" ("internship_start_date")
  WHERE "internship_start_date" IS NOT NULL;

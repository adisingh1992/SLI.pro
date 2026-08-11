-- Monthly check-ins and coaching notes move from public onto wing.
--
-- The last two reachable instances of the defect that broke registration, the
-- questionnaire and homework: a public table whose user_id is a foreign key to
-- public.users, written by a live code path, for students who exist only in
-- wing.users. Both failed for every account created after the cutover.
--
-- public.coaching_notes has TWO such keys — the student and the admin who wrote
-- the note — so it broke on both sides.
--
-- As with homework (0013), the backfill remaps through email: migrate-identity
-- inserted wing users with fresh serials and merged a duplicate, so legacy and
-- wing ids do not correspond.

CREATE TABLE IF NOT EXISTS "wing"."monthly_check_ins" (
  "id" serial PRIMARY KEY,
  "student_id" integer NOT NULL REFERENCES "wing"."students"("id") ON DELETE CASCADE,
  "month" text NOT NULL,
  "content_posts" integer DEFAULT 0 NOT NULL,
  "content_links" text[] DEFAULT '{}' NOT NULL,
  "engagement_frequency" text,
  "new_connections" integer DEFAULT 0 NOT NULL,
  "target_connection_percentage" text,
  "recommendation_implementation" text,
  "implementation_challenges" text,
  "updated_profile_visuals" boolean DEFAULT false NOT NULL,
  "screenshot_uris" text[] DEFAULT '{}' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint

-- One check-in per student per month. The legacy table had no such constraint,
-- so a student could submit March twice and both rows counted in any report.
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_check_ins_student_month_unique"
  ON "wing"."monthly_check_ins" ("student_id", "month");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "wing"."coaching_notes" (
  "id" serial PRIMARY KEY,
  "student_id" integer NOT NULL REFERENCES "wing"."students"("id") ON DELETE CASCADE,
  "author_user_id" integer REFERENCES "wing"."users"("id"),
  "content" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "coaching_notes_student_created_idx"
  ON "wing"."coaching_notes" ("student_id", "created_at");--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'monthly_check_ins') THEN

    INSERT INTO "wing"."monthly_check_ins"
      ("student_id", "month", "content_posts", "content_links",
       "engagement_frequency", "new_connections", "target_connection_percentage",
       "recommendation_implementation", "implementation_challenges",
       "updated_profile_visuals", "created_at", "updated_at")
    SELECT DISTINCT ON (s.id, m.month)
      s.id,
      m.month,
      COALESCE(m.content_posts, 0),
      -- content_links was jsonb; anything malformed becomes an empty array
      -- rather than failing the whole migration for one bad row.
      COALESCE(
        (SELECT array_agg(value #>> '{}')
         FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(m.content_links) = 'array'
                THEN m.content_links ELSE '[]'::jsonb END)),
        '{}'
      ),
      m.engagement_frequency,
      COALESCE(m.new_connections, 0),
      m.target_connection_percentage,
      m.recommendation_implementation,
      m.implementation_challenges,
      COALESCE(m.updated_profile_visuals, false),
      m.created_at,
      m.created_at
    FROM "public"."monthly_check_ins" m
    JOIN "public"."users"  lu ON lu.id = m.user_id
    JOIN "wing"."users"    wu ON lower(wu.email) = lower(lu.username)
    JOIN "wing"."students" s  ON s.user_id = wu.id
    -- DISTINCT ON with this ordering keeps the NEWEST when a student submitted
    -- the same month twice, which the legacy table permitted.
    ORDER BY s.id, m.month, m.created_at DESC
    ON CONFLICT ("student_id", "month") DO NOTHING;

    -- Screenshots are deliberately NOT carried across. They were base64 blobs
    -- inline in the row; the wing column holds Blob URIs, and inventing URIs
    -- for images that were never uploaded to Blob would produce broken links
    -- that look like real ones. The legacy rows keep the images if anyone needs
    -- to retrieve them.

  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'coaching_notes') THEN

    INSERT INTO "wing"."coaching_notes"
      ("student_id", "author_user_id", "content", "created_at", "updated_at")
    SELECT
      s.id,
      author_w.id,   -- NULL when the staff account was not migrated
      c.content,
      c.created_at,
      c.updated_at
    FROM "public"."coaching_notes" c
    JOIN "public"."users"  lu ON lu.id = c.user_id
    JOIN "wing"."users"    wu ON lower(wu.email) = lower(lu.username)
    JOIN "wing"."students" s  ON s.user_id = wu.id
    LEFT JOIN "public"."users" author_l ON author_l.id = c.admin_id
    LEFT JOIN "wing"."users"   author_w ON lower(author_w.email) = lower(author_l.username)
    WHERE NOT EXISTS (
      SELECT 1 FROM "wing"."coaching_notes" x
      WHERE x.student_id = s.id
        AND x.content = c.content
        AND x.created_at = c.created_at
    );

  END IF;
END $$;

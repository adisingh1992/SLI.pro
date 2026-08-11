import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * The whole cohort's funnel position, school and programme — in one query.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────
 * `getUserStatus()` derived one student's stage by asking nine questions in
 * sequence, each its own round trip: LinkedIn optimisations, then SLI records,
 * then freshness reports, then the user, then their student id, then their
 * sessions, then documents, then the intake record, then the questionnaire. It
 * short-circuits on the first hit, so a student who has finished everything
 * costs one query and a student who has only registered costs nine.
 *
 * The admin list called it per student inside a `Promise.all`, and then asked
 * for the branding intake a second time for the school column. At 255 students
 * that is on the order of 2,300 queries — issued as 255 concurrent chains
 * against a connection pool of ten, so they serialise into roughly 230 rounds
 * of latency stacked end to end. That is the loading time.
 *
 * ── WHY ONE QUERY AND NOT JUST BATCHING ──────────────────────────────────
 * Batching each of the nine lookups into nine `WHERE student_id = ANY(...)`
 * queries would fix the count and keep the logic in TypeScript. It was
 * tempting. The reason not to: the funnel is a strict precedence — the highest
 * reached stage wins — and expressing precedence over nine collections in
 * application code means assembling nine maps and walking them in order, which
 * is more code than the SQL and has more places to disagree with the version
 * that runs on the student's own dashboard.
 *
 * A `CASE` expression over `EXISTS` subqueries states the precedence once, in
 * the order it is written. Postgres evaluates a `CASE` top to bottom and stops
 * at the first true branch, so the short-circuit behaviour is preserved rather
 * than reimplemented.
 *
 * ── THE ORDER IS THE CONTRACT ────────────────────────────────────────────
 * It must match `FUNNEL` in `client/src/pages/admin/students-page.tsx`, which
 * turns these strings into a step number and a progress bar. A label typo here
 * is not a display bug — `stepOf()` falls back to 0, so the student silently
 * renders as "Registered" no matter how far they have actually got.
 */

export type CohortRow = {
  userId: number;
  journeyStatus: string;
  school: string | null;
  academicProgram: string | null;
  marketingOptIn: boolean | null;
};

export async function cohortSummary(): Promise<Map<number, CohortRow>> {
  const result = await db.execute(sql`
    with intake as (
      select s.user_id,
             r.completed,
             r.structured_responses as responses
        from wing.students s
        left join wing.intake_records r on r.student_id = s.id
    )
    select
      u.id as "userId",

      case
        when exists (select 1 from wing.linkedin_optimizations o
                      join wing.students s on s.id = o.student_id
                     where s.user_id = u.id)
          then 'LinkedIn Optimization Done'

        when exists (select 1 from wing.sli_records r
                      join wing.students s on s.id = r.student_id
                     where s.user_id = u.id)
          then 'SLI Generated'

        when exists (select 1 from wing.freshness_reports f
                      join wing.students s on s.id = f.student_id
                     where s.user_id = u.id)
          then 'Freshness Report Generated'

        -- Modules descend C -> A, then Foundation 3 -> 1: the furthest
        -- reached wins, and modules sit above sessions in the funnel.
        when exists (select 1 from wing.sessions x join wing.students s on s.id = x.student_id
                     where s.user_id = u.id and x.status::text = 'completed'
                       and x.session_type::text = 'enhancement_c')
          then 'Enhancement Module C Completed'
        when exists (select 1 from wing.sessions x join wing.students s on s.id = x.student_id
                     where s.user_id = u.id and x.status::text = 'completed'
                       and x.session_type::text = 'enhancement_b')
          then 'Enhancement Module B Completed'
        when exists (select 1 from wing.sessions x join wing.students s on s.id = x.student_id
                     where s.user_id = u.id and x.status::text = 'completed'
                       and x.session_type::text = 'enhancement_a')
          then 'Enhancement Module A Completed'
        when exists (select 1 from wing.sessions x join wing.students s on s.id = x.student_id
                     where s.user_id = u.id and x.status::text = 'completed'
                       and x.session_type::text = 'foundation_3')
          then 'Foundation Session 3 Completed'
        when exists (select 1 from wing.sessions x join wing.students s on s.id = x.student_id
                     where s.user_id = u.id and x.status::text = 'completed'
                       and x.session_type::text = 'foundation_2')
          then 'Foundation Session 2 Completed'
        when exists (select 1 from wing.sessions x join wing.students s on s.id = x.student_id
                     where s.user_id = u.id and x.status::text = 'completed'
                       and x.session_type::text = 'foundation_1')
          then 'Foundation Session 1 Completed'

        -- Both, not either: the old predicate required a resume AND a LinkedIn
        -- export, and one of the two is not "documents uploaded".
        when (select count(distinct d.doc_type::text) from wing.documents d
                join wing.students s on s.id = d.student_id
               where s.user_id = u.id and d.doc_type::text in ('resume', 'linkedin')) = 2
          then 'Documents Uploaded'

        when (select i.completed from intake i where i.user_id = u.id) then
          'Registration Intake Completed'

        when exists (select 1 from intake i
                     where i.user_id = u.id and i.responses <> '{}'::jsonb)
          then 'Questionnaire Completed'

        else 'Registered'
      end as "journeyStatus",

      -- Three different intake shapes have shipped; the school lives under a
      -- different key in each. Coalesce rather than pick one, or the column is
      -- empty for whichever cohort registered under the other version.
      coalesce(
        i.responses ->> 'university_name',
        i.responses ->> 'undergrad_institution',
        i.responses ->> 'grad_university_name'
      ) as "school",
      coalesce(
        i.responses ->> 'major',
        i.responses ->> 'highest_degree'
      ) as "academicProgram",

      (i.responses ->> 'marketingOptIn')::boolean as "marketingOptIn"

    from wing.users u
    left join intake i on i.user_id = u.id
  `);

  const rows = ((result as any).rows ?? result) as CohortRow[];
  return new Map(rows.map((r) => [Number(r.userId), r]));
}

import "dotenv/config";
import { initScript, type ScriptDb } from "../script-init";

/**
 * Read-only preflight for every outbound message surface (B3 + B2).
 *
 * Run:  npm run wing:check-sequences
 *
 * Sends nothing. Answers the four questions that decide whether a message will
 * ever arrive, in the order they fail in practice:
 *
 *   1. Is the template published?      — a missing key is a silent no-send
 *   2. Is there an audience?           — institution_id NULL means nobody
 *   3. Is anything due?                — dates, sequences, log entries
 *   4. Did past sends actually land?   — failed_at, which "sent" does not show
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Every failure in this subsystem so far has been silent: a send that reported
 * success and never arrived, a template key nothing had seeded, an audience
 * query that matched zero students because nothing set institution_id. None of
 * those raise. They all produce a cheerful "0 sent" that looks like a quiet
 * day. This asks the database directly rather than trusting the runner's own
 * account of itself.
 */

/** Every template key the code can ask for. Kept in sync by hand — deliberately:
 *  the point is to notice when code references a key nobody seeded. */
const REQUIRED_TEMPLATES = [
  "welcome_1",
  "welcome_2",
  "welcome_3",
  "session_complete_1",
  "session_complete_2",
  "session_complete_3",
  "dormancy_1",
  "dormancy_2",
  "dormancy_3",
  "advisor_snapshot",
  "student_prep_incomplete",
  "student_prep_complete",
  "life_log_nudge",
  "event_followup_career",
  "event_followup_personal",
  "internship_day_30",
  "internship_day_60",
  "positioning_launch_week",
  "calendar_touchpoint_incomplete",
  "calendar_touchpoint_complete",
];

let pool: ScriptDb["pool"];

const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

const heading = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const warn = (s: string) => console.log(`  \x1b[33m!\x1b[0m ${s}`);
const bad = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`);

async function main() {
  ({ pool } = await initScript());

  const problems: string[] = [];

  /* ── 1 · Templates ───────────────────────────────────────────────────── */
  heading("Templates");

  const templates = await q(
    `select template_key, channel::text as channel, version, active
       from wing.message_templates
      where active = true`,
  );
  const published = new Set(templates.map((t: any) => t.template_key));

  const missing = REQUIRED_TEMPLATES.filter((k) => !published.has(k));
  if (missing.length === 0) {
    ok(`all ${REQUIRED_TEMPLATES.length} templates published`);
  } else {
    bad(`${missing.length} missing: ${missing.join(", ")}`);
    problems.push("run: npm run wing:seed-templates");
  }

  const orphans = Array.from(published).filter((k) => !REQUIRED_TEMPLATES.includes(k as string));
  if (orphans.length) warn(`published but never referenced in code: ${orphans.join(", ")}`);

  /* ── 2 · Audience ────────────────────────────────────────────────────── */
  heading("Audience");

  const [counts] = await q(
    `select count(*)::int                                          as total,
            count(*) filter (where institution_id is null)::int    as unassigned,
            count(*) filter (where enrollment_status = 'active')::int as active
       from wing.students`,
  );
  console.log(`  ${counts.total} student(s), ${counts.active} active`);

  if (counts.unassigned > 0) {
    // This is the one that produced a zero-length audience with no error.
    bad(`${counts.unassigned} student(s) have no institution — calendar touchpoints skip them`);
    problems.push("run: npm run wing:seed-partners  (assigns by email domain)");
  } else {
    ok("every student is assigned to an institution");
  }

  const byInstitution = await q(
    `select i.name, count(s.id)::int as students
       from wing.institutions i
       left join wing.students s
              on s.institution_id = i.id and s.enrollment_status = 'active'
      group by i.name order by i.name`,
  );
  for (const row of byInstitution as any[]) {
    console.log(`    ${String(row.name).padEnd(24)} ${row.students} active`);
  }

  /* ── 3 · Due now ─────────────────────────────────────────────────────── */
  heading("Due on the next run");

  const stored = await q(
    `select sequence_key, count(*)::int as n
       from wing.engagement_sequence_states
      where status = 'active' and next_run_at <= now()
      group by sequence_key order by sequence_key`,
  );
  if (stored.length === 0) console.log("  no stored sequence steps due");
  for (const row of stored as any[]) {
    console.log(`  ${String(row.sequence_key).padEnd(24)} ${row.n} step(s)`);
  }

  const calendarDue = await q(
    `select e.label, i.name, e.template_key
       from wing.institution_calendar_events e
       join wing.institutions i on i.id = e.institution_id
      where e.active = true and e.event_date = current_date`,
  );
  console.log(`  calendar events today: ${calendarDue.length}`);
  for (const row of calendarDue as any[]) {
    console.log(`    ${row.label} · ${row.name} · ${row.template_key ?? "NO TEMPLATE"}`);
  }

  const [milestones] = await q(
    `select count(*) filter (where internship_start_date = current_date - 30)::int as day30,
            count(*) filter (where internship_start_date = current_date - 60)::int as day60,
            count(*) filter (where internship_start_date is not null)::int         as have_date
       from wing.students`,
  );
  console.log(
    `  internships: ${milestones.have_date} date(s) recorded, ` +
      `${milestones.day30} at day 30, ${milestones.day60} at day 60`,
  );

  const [followUps] = await q(
    `select count(distinct student_id)::int as n
       from wing.life_log_entries
      where created_at >= now() - interval '48 hours'
        and created_at <  now() - interval '24 hours'`,
  );
  console.log(`  life-log follow-ups in window: ${followUps.n} student(s)`);

  const launches = await q(
    `select status::text as status, count(*)::int as n, min(current_step)::int as lo,
            max(current_step)::int as hi
       from wing.engagement_sequence_states
      where sequence_key = 'positioning_launch'
      group by status`,
  );
  if (launches.length === 0) {
    console.log("  positioning launch: nobody has published a first post yet");
  }
  for (const row of launches as any[]) {
    console.log(`  positioning launch (${row.status}): ${row.n}, weeks ${row.lo}–${row.hi}`);
  }

  /* ── 4 · Did past sends land ─────────────────────────────────────────── */
  heading("Delivery history");

  const [sends] = await q(
    `select count(*)::int                                       as total,
            count(*) filter (where failed_at is not null)::int  as failed,
            count(*) filter (where sent_at > now() - interval '7 days')::int as week
       from wing.message_events
      where direction = 'outbound'`,
  );
  console.log(`  ${sends.total} outbound, ${sends.week} in the last 7 days`);

  if (sends.failed > 0) {
    bad(`${sends.failed} recorded failure(s)`);
    const reasons = await q(
      `select template_key, failure_reason, count(*)::int as n
         from wing.message_events
        where failed_at is not null
        group by template_key, failure_reason
        order by n desc limit 10`,
    );
    for (const row of reasons as any[]) {
      console.log(`    ${String(row.template_key).padEnd(28)} ${row.n}× ${row.failure_reason}`);
    }
  } else if (sends.total > 0) {
    ok("no recorded delivery failures");
  }

  // A provider id is the only evidence the send left the building. Rows with
  // neither an id nor a failure are the shape the "sent but never arrived" bug
  // produced, and are worth looking at even though nothing is technically wrong.
  const [silent] = await q(
    `select count(*)::int as n
       from wing.message_events
      where direction = 'outbound'
        and failed_at is null
        and (provider_message_id is null or provider_message_id = '')`,
  );
  if (silent.n > 0) {
    warn(`${silent.n} send(s) recorded with no provider id and no failure — unverifiable`);
  }

  /* ── Summary ─────────────────────────────────────────────────────────── */
  heading("Next steps");
  if (problems.length === 0) console.log("  nothing blocking.\n");
  else problems.forEach((p) => console.log(`  ${p}`));
  console.log("");

  await pool.end();
}

main().catch((err) => {
  console.error("[check-sequences] failed:", err);
  process.exit(1);
});

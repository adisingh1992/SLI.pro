import "dotenv/config";
import { initScript } from "../script-init";

/**
 * Runs the B4 dashboard queries and cross-checks them against independent
 * counts.
 *
 * Run:  npm run wing:check-metrics
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * A dashboard that crashes gets fixed the same day. A dashboard that returns
 * plausible wrong numbers goes into a board pack. These aggregates use
 * `count(distinct …) filter (…)` over a left join, which is the shape most
 * likely to be quietly wrong — a restarted session, a student with no sessions
 * at all, an enhancement module counted as a foundation one.
 *
 * So the derived figures are recomputed here the slow, obvious way and
 * compared. Read-only.
 */

async function main() {
  const { db, pool } = await initScript();
  const { sql } = await import("drizzle-orm");
  const metrics = await import("./cohort-metrics");

  const m = await metrics.cohortMetrics({});

  console.log(`\nregistered              ${m.totalRegistered}`);
  console.log(`active (30d)            ${m.activeLast30Days}`);
  console.log(`never started           ${m.neverStarted}`);
  console.log(
    `completed all three     ${m.completedAllThree.numerator} of ${m.completedAllThree.denominator}`,
  );
  console.log(`median days to complete ${m.medianDaysToComplete ?? "—"}`);
  console.log(`with selected SLI       ${m.withSelectedSli.numerator}`);
  console.log(`appointments            ${m.appointments.total} (${m.appointments.withSnapshotSent} briefed)`);

  console.log(`\ncompletion by session:`);
  for (const s of m.completionBySession) {
    console.log(
      `   ${s.sessionType.padEnd(14)} ${String(s.completed).padStart(4)} of ${String(s.started).padEnd(4)} started`,
    );
  }

  console.log(`\nhow far students get:`);
  for (const d of m.engagementDistribution) {
    console.log(`   ${d.sessionsCompleted} session(s)   ${d.students}`);
  }

  /* ── Cross-checks ──────────────────────────────────────────────────── */

  const problems: string[] = [];

  // The distribution partitions everyone, so it must sum to the total.
  const distributionTotal = m.engagementDistribution.reduce((a, d) => a + d.students, 0);
  if (distributionTotal !== m.totalRegistered) {
    problems.push(
      `distribution sums to ${distributionTotal} but ${m.totalRegistered} are registered`,
    );
  }

  // "3 sessions completed" and "completed all three" are computed differently
  // and must agree.
  const threeInDistribution =
    m.engagementDistribution.find((d) => d.sessionsCompleted === 3)?.students ?? 0;
  if (threeInDistribution !== m.completedAllThree.numerator) {
    problems.push(
      `distribution says ${threeInDistribution} finished all three, headline says ${m.completedAllThree.numerator}`,
    );
  }

  // Independent count of students with all three foundation sessions complete.
  const independent: any = await db.execute(sql`
    select count(*)::int as n from (
      select s.id
      from wing.students s
      join wing.sessions ses on ses.student_id = s.id
      where ses.status::text = 'completed'
        and ses.session_type::text like 'foundation_%'
      group by s.id
      having count(distinct ses.session_type) >= 3
    ) t
  `);
  const independentCount = Number(independent.rows?.[0]?.n ?? independent[0]?.n ?? 0);
  if (independentCount !== m.completedAllThree.numerator) {
    problems.push(
      `independent query says ${independentCount} finished all three, dashboard says ${m.completedAllThree.numerator}`,
    );
  }

  // Completed can never exceed started for a session.
  for (const s of m.completionBySession) {
    if (s.completed > s.started) {
      problems.push(`${s.sessionType}: ${s.completed} completed but only ${s.started} started`);
    }
  }

  // Never-started must match the zero bucket.
  const zeroBucket = m.engagementDistribution.find((d) => d.sessionsCompleted === 0)?.students ?? 0;
  if (m.neverStarted > zeroBucket) {
    problems.push(
      `${m.neverStarted} never started but only ${zeroBucket} have zero completions — impossible`,
    );
  }

  console.log("");
  if (problems.length) {
    console.log(`${problems.length} PROBLEM(S):`);
    for (const p of problems) console.log(`   ✗ ${p}`);
    console.log("");
    await pool.end();
    process.exit(1);
  }

  console.log("all cross-checks agree.\n");
  await pool.end();
}

main().catch((e) => {
  console.error("check failed:", e);
  process.exit(1);
});

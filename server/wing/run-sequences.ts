import "dotenv/config";
import { initScript, type ScriptDb } from "../script-init";

/**
 * Delivers every engagement sequence step that is due (Feature List B3).
 *
 * Run:  npm run wing:run-sequences
 *       npm run wing:run-sequences -- --dry-run
 *
 * ── WHY A SCRIPT AND NOT AN IN-PROCESS TIMER ─────────────────────────────
 * It runs as an Azure Container Apps job on a schedule trigger, hourly, using
 * the same image as the app — the pattern the migration job already uses. See
 * AZURE_SCHEDULER.md for the resource and the cron.
 *
 * Hourly rather than daily because `daily_prompt_hour_local` exists: students
 * choose when they hear from Wing, and a daily run can only honour one hour for
 * everybody. Every job below asks "who is due now", so running more often costs
 * queries and sends nothing extra.
 *
 * Keeping the work in a standalone entry point means the schedule is a
 * deployment concern rather than a rewrite — the job calls this, or a cron
 * does, or a person does while testing on stage.
 *
 * An in-process `setInterval` would also mean every container replica runs the
 * same sequence, and a student gets three copies of the same dormancy email.
 *
 * Safe to run repeatedly: `next_run_at` advances only after a send is
 * recorded, so a second run in the same minute finds nothing due.
 */

const DRY_RUN = process.argv.includes("--dry-run");

let pool: ScriptDb["pool"];
let db: ScriptDb["db"];

/*
 * ── WHY FAILURES ARE COLLECTED RATHER THAN THROWN ────────────────────────
 * Each job below is wrapped so one failure cannot stop the others — a broken
 * calendar job must not mean nobody gets an internship milestone. That was
 * right, and on a scheduled job it was also silent: every failure was caught,
 * logged to a stdout nobody was reading, and the execution recorded as a
 * success. A job that has been failing for a month looks identical to one that
 * has nothing to do.
 *
 * So failures are collected and the process exits non-zero at the end, after
 * every job has had its turn. Container Apps records a failed execution, and
 * the next hourly run catches up whatever was missed.
 */
const failures: string[] = [];

function failed(job: string, err: unknown) {
  const message = (err as Error)?.message ?? String(err);
  failures.push(`${job}: ${message}`);
  console.error(`[sequences] ${job} failed: ${message}`);
}

async function main() {
  // llm: true — Baby Radar's job below calls the orchestrator. Without this,
  // the run starts happily and fails on its first eligible-and-due student,
  // which is exactly the failure mode initScript's own header warns about.
  ({ db, pool } = await initScript({ llm: true }));

  const messaging = await import("./messaging-store");
  const engagement = await import("./engagement");

  const due = await messaging.dueSequences();
  console.log(`\n[sequences] ${due.length} step(s) due\n`);

  for (const d of due) {
    console.log(`    student ${d.studentId}  ${d.sequenceKey}  step ${d.currentStep} -> ${d.currentStep + 1}`);
  }

  if (DRY_RUN) {
    console.log("\n[sequences] (dry run — nothing sent)\n");
    await pool.end();
    return;
  }

  // NOT short-circuited when no sequences are due: advisor snapshots are on
  // an independent clock, and returning early here would mean they silently
  // never send on any day without a welcome or dormancy step queued.
  if (due.length) {
    const result = await engagement.runDueSequences();
    console.log(`\n[sequences] ${result.sent} sent, ${result.skipped} skipped.`);
  }

  // Advisor snapshots ride the same runner — one scheduler to deploy as an
  // Azure Function, not two competing timers.
  const advisor = await import("./advisor-snapshot");
  const snaps = await advisor.sendDueSnapshots();
  console.log(`[sequences] ${snaps.sent} advisor snapshot(s) sent.`);

  /*
   * The date-driven sequences, all on the same runner for the same reason.
   *
   * Each asks the database "who is due today" rather than relying on a row
   * written when the triggering event happened, so a day the runner did not
   * execute is caught up rather than lost. Each is awaited separately and none
   * can stop the others: a failure in the calendar job must not mean nobody
   * gets an internship milestone.
   */
  const events = await import("./event-sequences");
  const calendar = await import("./calendar-touchpoints");

  try {
    const touchpoints = await calendar.runDueTouchpoints();
    console.log(
      `[sequences] calendar: ${touchpoints.events} event(s) due, ` +
        `${touchpoints.sent} sent, ${touchpoints.skipped} skipped.`,
    );
  } catch (err) {
    failed("calendar touchpoints", err);
  }

  try {
    const followUps = await events.runEventFollowUps();
    console.log(`[sequences] ${followUps.sent} life-event follow-up(s) sent.`);
  } catch (err) {
    failed("event follow-ups", err);
  }

  try {
    const milestones = await events.runInternshipMilestones();
    console.log(`[sequences] ${milestones.sent} internship milestone(s) sent.`);
  } catch (err) {
    failed("internship milestones", err);
  }

  /*
   * ── The one message a safety hold permits ──────────────────────────────
   *
   * Her ruling: "If the user hasn't returned after 30 days, Wing sends one soft check-in
   * — not coaching, not a prompt. 'I'm here when you're ready.' That's the only automated
   * contact during a hold."
   *
   * It rides this runner because it is on a clock and nothing else was going to call it.
   * `softCheckInIsDue` has existed since the hold store was written, with no caller.
   *
   * It is deliberately NOT routed through `maySend`. Everything else Wing sends asks that
   * function for permission and is refused while a hold is open; this message is the
   * exception to the suppression, so asking would refuse the one thing the rule requires.
   */
  try {
    const soft = await import("./soft-check-in");
    const result = await soft.runDueSoftCheckIns();
    console.log(
      `[sequences] ${result.sent} soft check-in(s) sent, ` +
        `${result.candidates} candidate(s) considered.\n`,
    );
  } catch (err) {
    failed("soft check-ins", err);
  }

  /*
   * The Reveal Cycle's gates, evidence and template selection — wired for the first
   * time, per claude/REVEAL_CYCLE_PLUMBING_SEP2.md. Rides this runner for the same
   * reason everything else here does: it asks "who is due" itself (Gate 1's floor,
   * Gate 3's cadence), so running it hourly costs a query per eligible student and
   * sends nothing extra. On today's unpopulated prompt library this will defer or wait
   * for essentially every student — Gate 2 correctly cannot pass without evidence, and
   * that is the protected null Reveal working as designed, not a fault in the wiring.
   */
  try {
    const reveal = await import("./reveal-cycle");
    const result = await reveal.runDueRevealCycles();
    console.log(
      `[sequences] reveal cycle: ${result.evaluated} evaluated, ${result.fired} fired, ` +
        `${result.deferred} deferred, ${result.routed} routed.`,
    );
  } catch (err) {
    failed("reveal cycle", err);
  }

  /*
   * H-701, Baby Radar. Rides this runner for the same reason as everything else here:
   * it asks "who is eligible and due" itself (radarEligibility, isRadarDueThisWeek), so
   * running it hourly against a weekly cadence costs one cheap query per candidate on an
   * off week and generates nothing extra. Unlike its neighbours on this runner,
   * baby-radar.ts takes `db` as an explicit argument rather than importing it — every
   * function in that file already does, for testability (see its own header) — so `db`
   * is passed in here rather than left to an internal import.
   */
  try {
    const radar = await import("./baby-radar");
    const result = await radar.runDueRadarSuggestions(db as any);
    console.log(
      `[sequences] radar: ${result.candidates} candidate(s), ${result.generated} generated, ` +
        `${result.skipped} skipped.`,
    );
  } catch (err) {
    failed("baby radar", err);
  }

  await pool.end();

  if (failures.length) {
    console.error(
      `\n[sequences] ${failures.length} job(s) failed:\n` +
        failures.map((f) => `    ${f}`).join("\n") +
        `\n[sequences] The next hourly execution catches up what was missed.\n`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[sequences] failed:", err);
  process.exit(1);
});

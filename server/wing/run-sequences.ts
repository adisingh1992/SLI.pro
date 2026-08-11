import "dotenv/config";
import { initScript, type ScriptDb } from "../script-init";

/**
 * Delivers every engagement sequence step that is due (Feature List B3).
 *
 * Run:  npm run wing:run-sequences
 *       npm run wing:run-sequences -- --dry-run
 *
 * ── WHY A SCRIPT AND NOT AN IN-PROCESS TIMER ─────────────────────────────
 * The target is an Azure Function on a timer trigger. Keeping the work in a
 * standalone entry point means that becomes a deployment concern rather than a
 * rewrite — the Function calls this, or a cron does, or a person does while
 * testing on stage. The scheduling decision stays outside the logic.
 *
 * An in-process `setInterval` would also mean every container replica runs the
 * same sequence, and a student gets three copies of the same dormancy email.
 *
 * Safe to run repeatedly: `next_run_at` advances only after a send is
 * recorded, so a second run in the same minute finds nothing due.
 */

const DRY_RUN = process.argv.includes("--dry-run");

let pool: ScriptDb["pool"];

async function main() {
  ({ pool } = await initScript());

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
    console.error(`[sequences] calendar touchpoints failed: ${(err as Error).message}`);
  }

  try {
    const followUps = await events.runEventFollowUps();
    console.log(`[sequences] ${followUps.sent} life-event follow-up(s) sent.`);
  } catch (err) {
    console.error(`[sequences] event follow-ups failed: ${(err as Error).message}`);
  }

  try {
    const milestones = await events.runInternshipMilestones();
    console.log(`[sequences] ${milestones.sent} internship milestone(s) sent.\n`);
  } catch (err) {
    console.error(`[sequences] internship milestones failed: ${(err as Error).message}\n`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[sequences] failed:", err);
  process.exit(1);
});

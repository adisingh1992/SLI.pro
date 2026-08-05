import "dotenv/config";
import { and, eq, inArray, sql } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import {
  users,
  students,
  sessions,
  transcripts,
  transcriptTurns,
  sessionArtifacts,
  turnObjectives,
  userMemoryEmbeddings,
  userHeuristicApplications,
  sliRecords,
  evidencePortfolioItems,
  lifeLogEntries,
  intakeRecords,
  classifierPromptComponents,
} from "@shared/wing-schema";

/**
 * Resets a user's Foundation Sessions so they can be run again.
 *
 * Run:  npm run wing:reset-sessions -- --email someone@example.com
 *       npm run wing:reset-sessions -- --email someone@example.com --confirm
 *       npm run wing:reset-sessions -- --email someone@example.com --sessions 1
 *
 * DRY BY DEFAULT. Without --confirm it prints what would go and deletes
 * nothing. This destroys real coaching transcripts, and the person running it
 * is usually mid-experiment and moving fast — the wrong email with no
 * confirmation step is a bad combination.
 *
 * ── WHAT IS DELETED VS NULLED ────────────────────────────────────────────
 * Session-owned records are deleted: transcripts, turns, artifacts, objective
 * attribution, memory embeddings, heuristic applications.
 *
 * Records that merely REFERENCE a session are nulled, not deleted. An SLI the
 * student wrote, an evidence portfolio item, a life-log entry — these outlive
 * the session that produced them, and destroying a student's SLI because a
 * test session was reset would be a data-loss bug wearing a cleanup script's
 * clothes.
 */

const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const CONFIRM = args.includes("--confirm");
const email = arg("email");
const sessionNumbers = (arg("sessions") ?? "1,2,3")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => n >= 1 && n <= 3);

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  if (!email) {
    console.error("Required: --email someone@example.com");
    process.exit(1);
  }

  ({ db, pool } = await initScript());

  // Which database this is about to modify. Printed unprompted because the
  // same command against stage and against production looks identical.
  const url = new URL(process.env.DATABASE_URL!);
  console.log(`\n[reset] host ${url.hostname}${url.pathname}`);
  console.log(`[reset] ${email} · foundation ${sessionNumbers.join(", ")}\n`);

  const [user] = await db
    .select({ id: users.id, email: users.email, isTest: users.isTestUser })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  if (!user) {
    console.error(`No wing user with email ${email}`);
    await pool.end();
    process.exit(1);
  }

  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(eq(students.userId, user.id))
    .limit(1);

  if (!student) {
    console.error(`User ${email} has no student record`);
    await pool.end();
    process.exit(1);
  }

  if (!user.isTest) {
    console.log("  ⚠ This is NOT flagged as a test user. Real coaching history.\n");
  }

  const types = sessionNumbers.map((n) => `foundation_${n}`);
  const targetSessions = await db
    .select({ id: sessions.id, sessionType: sessions.sessionType, status: sessions.status })
    .from(sessions)
    .where(
      and(
        eq(sessions.studentId, student.id),
        inArray(sessions.sessionType, types as any),
      ),
    );

  if (!targetSessions.length) {
    console.log("  Nothing to reset — no matching sessions.\n");
    await pool.end();
    return;
  }

  const sessionIds = targetSessions.map((s) => s.id);

  const transcriptRows = await db
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(inArray(transcripts.sessionId, sessionIds));
  const transcriptIds = transcriptRows.map((t) => t.id);

  const turnRows = transcriptIds.length
    ? await db
        .select({ id: transcriptTurns.id })
        .from(transcriptTurns)
        .where(inArray(transcriptTurns.transcriptId, transcriptIds))
    : [];
  const turnIds = turnRows.map((t) => t.id);

  for (const s of targetSessions) {
    console.log(`    ${s.sessionType.padEnd(14)} #${s.id}  ${s.status}`);
  }
  console.log(
    `\n    ${transcriptIds.length} transcript(s), ${turnIds.length} turn(s)\n`,
  );

  if (!CONFIRM) {
    console.log("[reset] DRY RUN — nothing deleted. Re-run with --confirm.\n");
    await pool.end();
    return;
  }

  await db.transaction(async (tx) => {
    // Turn-scoped first, then transcript, then session — FKs point inward and
    // deleting outside-in would violate them.
    if (turnIds.length) {
      await tx.delete(turnObjectives).where(inArray(turnObjectives.turnId, turnIds));
      await tx
        .delete(userMemoryEmbeddings)
        .where(inArray(userMemoryEmbeddings.turnId, turnIds));

      // Nulled, not deleted: a classifier prompt's training example outlives
      // the turn it was drawn from, and the published prompt must keep working.
      await tx
        .update(classifierPromptComponents)
        .set({ sourceTurnId: null })
        .where(inArray(classifierPromptComponents.sourceTurnId, turnIds));

      await tx
        .update(userHeuristicApplications)
        .set({ turnId: null })
        .where(inArray(userHeuristicApplications.turnId, turnIds));

      await tx
        .update(evidencePortfolioItems)
        .set({ sourceTurnId: null })
        .where(inArray(evidencePortfolioItems.sourceTurnId, turnIds));
    }

    // Session-referencing records that OUTLIVE the session: nulled so the
    // student keeps their SLI, portfolio and life log.
    await tx
      .update(sliRecords)
      .set({ generatedInSessionId: null })
      .where(inArray(sliRecords.generatedInSessionId, sessionIds));
    await tx
      .update(evidencePortfolioItems)
      .set({ sourceSessionId: null })
      .where(inArray(evidencePortfolioItems.sourceSessionId, sessionIds));
    await tx
      .update(lifeLogEntries)
      .set({ sessionId: null })
      .where(inArray(lifeLogEntries.sessionId, sessionIds));
    await tx
      .update(intakeRecords)
      .set({ sessionId: null })
      .where(inArray(intakeRecords.sessionId, sessionIds));

    // Session-owned records: deleted.
    await tx
      .delete(userHeuristicApplications)
      .where(inArray(userHeuristicApplications.sessionId, sessionIds));
    await tx
      .delete(userMemoryEmbeddings)
      .where(inArray(userMemoryEmbeddings.sessionId, sessionIds));
    await tx.delete(turnObjectives).where(inArray(turnObjectives.sessionId, sessionIds));
    await tx.delete(sessionArtifacts).where(inArray(sessionArtifacts.sessionId, sessionIds));

    if (transcriptIds.length) {
      await tx
        .delete(transcriptTurns)
        .where(inArray(transcriptTurns.transcriptId, transcriptIds));
      await tx.delete(transcripts).where(inArray(transcripts.sessionId, sessionIds));
    }

    await tx.delete(sessions).where(inArray(sessions.id, sessionIds));
  });

  console.log(
    `[reset] deleted ${targetSessions.length} session(s), ${transcriptIds.length} ` +
      `transcript(s), ${turnIds.length} turn(s).\n` +
      `[reset] SLIs, portfolio items and life-log entries were kept, with their\n` +
      `[reset] session reference cleared.\n`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error("[reset] failed:", err);
  process.exit(1);
});

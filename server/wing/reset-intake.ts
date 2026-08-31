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
  selfDescriptions,
  intakeRecords,
  classifierPromptComponents,
  sliRecords,
  evidencePortfolioItems,
  lifeLogEntries,
} from "@shared/wing-schema";

/**
 * Resets a user's branding intake (Feature List A1) so they can run it again from
 * "Hi — I'm Wing."
 *
 * Run:  npm run wing:reset-intake -- --email someone@example.com
 *       npm run wing:reset-intake -- --email someone@example.com --confirm
 *
 * DRY BY DEFAULT, on the same reasoning as `reset-foundation-sessions.ts`: without
 * --confirm this prints what would go and deletes nothing.
 *
 * ── WHAT IS DELETED VS NULLED ───────────────────────────────────────────────────
 * Intake-owned records are deleted outright: the intake session itself, its
 * transcript and turns, its self-descriptions (the verbatim answers captured
 * turn-by-turn), and anything else scoped to that one session — objective
 * attribution, memory embeddings, heuristic applications, session artifacts. None of
 * these mean anything once the conversation they came from is gone.
 *
 * `intake_records` is not deleted — `ensureRecord` in `intake-store.ts` expects
 * exactly one row per student and creates it lazily on first write, so a second
 * intake would either collide with a stale row or (more likely) just find none of
 * the columns it expects. It's reset in place instead: responses cleared, `completed`
 * back to false, `pathway` and the early-insight timestamp cleared, back to
 * `verification_status = 'pending'`.
 *
 * `wing.users.professional_status` is nulled too. `intake-conversation.ts` mirrors
 * `professional_status` onto that column the moment it's extracted, and later
 * sessions read it directly rather than always going back through `intake_records` —
 * left set, a "reset" intake would still be quietly steering Foundation Session
 * content at the old population tag.
 *
 * What is NOT touched: `self_descriptions` rows from any OTHER module,
 * `user_heuristic_applications`/`user_memory_embeddings` rows from a Foundation
 * session, an SLI, evidence portfolio items, the life log — none of these are
 * produced by intake, so a reset scoped by `session_id`/`student_id` + this
 * session's own id can't reach them.
 */

const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const CONFIRM = args.includes("--confirm");
const email = arg("email");

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  if (!email) {
    console.error("Required: --email someone@example.com");
    process.exit(1);
  }

  ({ db, pool } = await initScript());

  // Which database this is about to modify. Printed unprompted, same reason as
  // reset-foundation-sessions.ts: the same command against stage and against
  // production looks identical.
  const url = new URL(process.env.DATABASE_URL!);
  console.log(`\n[reset-intake] host ${url.hostname}${url.pathname}`);
  console.log(`[reset-intake] ${email}\n`);

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
    console.log("  ⚠ This is NOT flagged as a test user. Real intake history.\n");
  }

  const targetSessions = await db
    .select({ id: sessions.id, status: sessions.status })
    .from(sessions)
    .where(and(eq(sessions.studentId, student.id), eq(sessions.sessionType, "intake" as any)));

  const [intakeRow] = await db
    .select({ id: intakeRecords.id, completed: intakeRecords.completed })
    .from(intakeRecords)
    .where(eq(intakeRecords.studentId, student.id))
    .limit(1);

  if (!targetSessions.length && !intakeRow) {
    console.log("  Nothing to reset — no intake session or record for this user.\n");
    await pool.end();
    return;
  }

  const sessionIds = targetSessions.map((s) => s.id);

  const transcriptRows = sessionIds.length
    ? await db.select({ id: transcripts.id }).from(transcripts).where(inArray(transcripts.sessionId, sessionIds))
    : [];
  const transcriptIds = transcriptRows.map((t) => t.id);

  const turnRows = transcriptIds.length
    ? await db
        .select({ id: transcriptTurns.id })
        .from(transcriptTurns)
        .where(inArray(transcriptTurns.transcriptId, transcriptIds))
    : [];
  const turnIds = turnRows.map((t) => t.id);

  for (const s of targetSessions) {
    console.log(`    intake         #${s.id}  ${s.status}`);
  }
  console.log(`    intake_records ${intakeRow ? `#${intakeRow.id}  completed=${intakeRow.completed}` : "(none)"}`);
  console.log(`\n    ${transcriptIds.length} transcript(s), ${turnIds.length} turn(s)\n`);

  if (!CONFIRM) {
    console.log("[reset-intake] DRY RUN — nothing changed. Re-run with --confirm.\n");
    await pool.end();
    return;
  }

  await db.transaction(async (tx) => {
    if (turnIds.length) {
      // Nulled, not deleted: a classifier prompt's training example outlives the
      // turn it was drawn from, same rule as reset-foundation-sessions.ts.
      await tx
        .update(classifierPromptComponents)
        .set({ sourceTurnId: null })
        .where(inArray(classifierPromptComponents.sourceTurnId, turnIds));
      await tx
        .update(evidencePortfolioItems)
        .set({ sourceTurnId: null })
        .where(inArray(evidencePortfolioItems.sourceTurnId, turnIds));
    }

    if (sessionIds.length) {
      /*
       * Nulled, not deleted, and done FIRST: an intake session should never be the
       * `generatedInSessionId`/`sourceSessionId`/`sessionId` behind an SLI, an evidence
       * item or a life-log entry in the ordinary flow — those are Foundation-session
       * outputs — but the FK is on the session id regardless of type, and the first real
       * run of this script hit exactly this shape of bug one level up (`intake_records`
       * itself, fixed above). Cheap and matches zero rows in the normal case; the point
       * is not depending on that being true.
       */
      await tx.update(sliRecords).set({ generatedInSessionId: null }).where(inArray(sliRecords.generatedInSessionId, sessionIds));
      await tx
        .update(evidencePortfolioItems)
        .set({ sourceSessionId: null })
        .where(inArray(evidencePortfolioItems.sourceSessionId, sessionIds));
      await tx.update(lifeLogEntries).set({ sessionId: null }).where(inArray(lifeLogEntries.sessionId, sessionIds));

      // Session-owned records: deleted. Nothing downstream should still be
      // pointing at an intake session that no longer exists.
      await tx.delete(selfDescriptions).where(inArray(selfDescriptions.sessionId, sessionIds));
      await tx
        .delete(userHeuristicApplications)
        .where(inArray(userHeuristicApplications.sessionId, sessionIds));
      await tx.delete(userMemoryEmbeddings).where(inArray(userMemoryEmbeddings.sessionId, sessionIds));
      await tx.delete(turnObjectives).where(inArray(turnObjectives.sessionId, sessionIds));
      await tx.delete(sessionArtifacts).where(inArray(sessionArtifacts.sessionId, sessionIds));
    }

    if (transcriptIds.length) {
      await tx.delete(transcriptTurns).where(inArray(transcriptTurns.transcriptId, transcriptIds));
      await tx.delete(transcripts).where(inArray(transcripts.sessionId, sessionIds));
    }

    /*
     * intake_records BEFORE sessions, not after. `intake_records.session_id` still points
     * at the row `sessions` is about to delete — this has to be nulled first, or Postgres
     * refuses the delete with a foreign-key violation (`intake_records_session_id_...`).
     * Caught exactly that way on the first real run against dev1@sli.pro: the whole thing
     * is one transaction, so nothing was actually lost, but the ordering was backwards.
     *
     * intake_records is reset in place, not deleted — see the file comment for why.
     */
    if (intakeRow) {
      await tx
        .update(intakeRecords)
        .set({
          structuredResponses: {} as any,
          completed: false,
          pathway: null,
          earlyInsightDeliveredAt: null,
          verificationStatus: "pending" as any,
          sessionId: null,
          updatedAt: new Date(),
        })
        .where(eq(intakeRecords.id, intakeRow.id));
    }

    if (sessionIds.length) {
      await tx.delete(sessions).where(inArray(sessions.id, sessionIds));
    }

    // The population tag intake set on the user row directly — see the file
    // comment. Left set, a "reset" intake still steers later sessions.
    await tx.update(users).set({ professionalStatus: null, updatedAt: new Date() }).where(eq(users.id, user.id));
  });

  console.log(
    `[reset-intake] deleted ${targetSessions.length} session(s), ${transcriptIds.length} transcript(s), ` +
      `${turnIds.length} turn(s).\n` +
      `[reset-intake] intake_records reset to a blank, incomplete state; ` +
      `professional_status cleared.\n` +
      `[reset-intake] the student's next visit to /branding-intake starts a fresh intake.\n`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error("[reset-intake] failed:", err);
  process.exit(1);
});

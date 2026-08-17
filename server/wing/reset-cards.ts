import { and, count, eq, isNotNull, ne } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import {
  heuristicComponents,
  heuristicSequenceEntries,
  heuristics,
  sessions,
  students,
  transcriptTurns,
  transcripts,
  userHeuristicApplications,
  userHeuristicScores,
  users,
} from "@shared/wing-schema";

/**
 * Clears the pre-v2 card library, before the compendium seed.
 *
 * Run:  npm run wing:reset-cards              report only, no writes
 *       npm run wing:reset-cards -- --retire  keep the rows, make them inert
 *       npm run wing:reset-cards -- --delete  remove the rows entirely
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * "This replaces any existing methodology. Clean slate." Four separate passes
 * have written cards into this table — 253 from the prompt-file extraction, 36
 * intervention cards, the hand-written scaffolding from `seed-methodology`, and
 * anything created by hand in the admin editor. Seeding 53 v2 cards on top of
 * that leaves a library where nobody can tell which methodology a card belongs
 * to, which is the state the clean slate exists to avoid.
 *
 * ── THE TWO MODES, AND WHY DELETE IS GUARDED ─────────────────────────────
 * Five tables reference a card and three of them hold student data:
 *
 *   heuristic_components          child rows
 *   heuristic_sequence_entries    child rows
 *   transcript_turns.active_heuristic_id   WHICH CARD GOVERNED A REAL TURN
 *   user_heuristic_applications   WHICH CARD FIRED, FOR WHOM, ON WHICH TURN
 *   user_heuristic_scores         how that card performed for that student
 *
 * The last three are the provenance record, and "turn-level human/AI
 * provenance" is one of the three principles the schema was built around.
 * `heuristics-store.ts` states the rule outright: "Heuristics are never deleted
 * — a retired card stays as a permanent record."
 *
 * `--retire` honours that: status goes to `retired` and every sequence entry is
 * removed. `getSequenceCards` and the admin card list both filter
 * `status != 'retired'`, so the old library cannot fire and cannot be seen,
 * while every row that recorded what Wing once did stays exactly where it is.
 *
 * `--delete` is for the case the convention does not cover — a database whose
 * only coaching history belongs to test accounts, where "permanent record"
 * protects nothing. It is allowed there and refused everywhere else, and the
 * check is not a flag the caller asserts: the script joins every referencing
 * row back to `users.is_test_user` and proves it. A caller who believes the
 * database holds only test users and is wrong gets a refusal naming the real
 * students, not an irreversible delete.
 */

const RETIRE = process.argv.includes("--retire");
const DELETE = process.argv.includes("--delete");

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function scalar(q: Promise<Array<{ n: number }>>): Promise<number> {
  const [row] = await q;
  return Number(row?.n ?? 0);
}

/**
 * Referencing rows belonging to accounts that are NOT flagged as test users.
 *
 * Applications and scores reach a user in two hops; a governed turn takes four,
 * through its transcript and session. Each is counted separately so a refusal
 * can say which kind of history is at risk rather than only that some is.
 */
async function realStudentReferences() {
  const applications = await scalar(
    db
      .select({ n: count() })
      .from(userHeuristicApplications)
      .innerJoin(students, eq(students.id, userHeuristicApplications.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(eq(users.isTestUser, false)),
  );

  const scores = await scalar(
    db
      .select({ n: count() })
      .from(userHeuristicScores)
      .innerJoin(students, eq(students.id, userHeuristicScores.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(eq(users.isTestUser, false)),
  );

  const turns = await scalar(
    db
      .select({ n: count() })
      .from(transcriptTurns)
      .innerJoin(transcripts, eq(transcripts.id, transcriptTurns.transcriptId))
      .innerJoin(sessions, eq(sessions.id, transcripts.sessionId))
      .innerJoin(students, eq(students.id, sessions.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(and(isNotNull(transcriptTurns.activeHeuristicId), eq(users.isTestUser, false))),
  );

  return { applications, scores, turns, total: applications + scores + turns };
}

async function main() {
  ({ db, pool } = await initScript());

  if (RETIRE && DELETE) {
    throw new Error("Pass --retire or --delete, not both.");
  }

  /* ── What is actually there ───────────────────────────────────────────── */

  const live = await scalar(
    db.select({ n: count() }).from(heuristics).where(ne(heuristics.status, "retired")),
  );
  const retired = await scalar(
    db.select({ n: count() }).from(heuristics).where(eq(heuristics.status, "retired")),
  );
  const components = await scalar(db.select({ n: count() }).from(heuristicComponents));
  const entries = await scalar(db.select({ n: count() }).from(heuristicSequenceEntries));

  const byStatus = await db
    .select({ status: heuristics.status, n: count() })
    .from(heuristics)
    .groupBy(heuristics.status);

  /* ── What refers to a card ────────────────────────────────────────────── */

  const applications = await scalar(db.select({ n: count() }).from(userHeuristicApplications));
  const scores = await scalar(db.select({ n: count() }).from(userHeuristicScores));
  const turns = await scalar(
    db
      .select({ n: count() })
      .from(transcriptTurns)
      .where(isNotNull(transcriptTurns.activeHeuristicId)),
  );
  const studentRefs = applications + scores + turns;
  const real = await realStudentReferences();

  console.log("\nCard library before the v2 seed");
  console.log("───────────────────────────────");
  console.log(`  live (not retired)        ${live}`);
  console.log(`  already retired           ${retired}`);
  for (const row of byStatus) console.log(`    ${String(row.status).padEnd(22)} ${row.n}`);
  console.log(`  component rows            ${components}`);
  console.log(`  sequence entries          ${entries}`);

  console.log("\nStudent data referring to a card");
  console.log("────────────────────────────────");
  console.log(
    `  user_heuristic_applications   ${applications}  (${real.applications} on real accounts)`,
  );
  console.log(`  user_heuristic_scores         ${scores}  (${real.scores} on real accounts)`);
  console.log(`  transcript_turns (governed)   ${turns}  (${real.turns} on real accounts)`);

  if (studentRefs === 0) {
    console.log("\n  Nothing. No card has ever been applied, so --delete destroys nothing.");
  } else if (real.total === 0) {
    console.log(
      `\n  All ${studentRefs} row(s) belong to test accounts, verified against\n` +
        "  users.is_test_user. --delete will clear them along with the cards.",
    );
  } else {
    console.log(
      `\n  ${real.total} row(s) belong to REAL students. --delete will refuse —\n` +
        "  removing them would destroy a real coaching history. Use --retire.",
    );
  }

  if (!RETIRE && !DELETE) {
    console.log(
      "\nReport only — nothing was written.\n" +
        "  --retire   retire every card and clear every sequence entry\n" +
        "  --delete   remove the rows entirely, with the test-account check above\n",
    );
    await pool.end();
    return;
  }

  /* ── Act ──────────────────────────────────────────────────────────────── */

  if (DELETE) {
    if (real.total > 0) {
      throw new Error(
        `Refusing to delete: ${real.total} referencing row(s) belong to real students ` +
          `(${real.applications} application(s), ${real.scores} score(s), ${real.turns} turn(s)). ` +
          "Deleting would destroy coaching provenance. Use --retire instead.",
      );
    }

    /*
     * One transaction. Six statements across five tables with enforced foreign
     * keys — a partial failure would leave a card library that is neither the
     * old one nor empty, which is worse than either.
     *
     * Order is load-bearing and verified against a real Postgres: children
     * before parents. `transcript_turns` is nulled rather than deleted because
     * the turn is the student's own message; only the note about which card was
     * governing it goes.
     */
    const removed = await db.transaction(async (tx) => {
      const apps = await tx.delete(userHeuristicApplications).returning({ id: userHeuristicApplications.id });
      const scs = await tx.delete(userHeuristicScores).returning({ studentId: userHeuristicScores.studentId });
      const trn = await tx
        .update(transcriptTurns)
        .set({ activeHeuristicId: null })
        .where(isNotNull(transcriptTurns.activeHeuristicId))
        .returning({ id: transcriptTurns.id });
      const ent = await tx.delete(heuristicSequenceEntries).returning({ id: heuristicSequenceEntries.id });
      const cmp = await tx.delete(heuristicComponents).returning({ id: heuristicComponents.id });
      const crd = await tx.delete(heuristics).returning({ id: heuristics.id });
      return {
        apps: apps.length, scores: scs.length, turns: trn.length,
        entries: ent.length, components: cmp.length, cards: crd.length,
      };
    });

    console.log(
      `\nDeleted ${removed.cards} card(s), ${removed.components} component row(s), ` +
        `${removed.entries} sequence entr(ies).\n` +
        `Cleared ${removed.apps} test application(s), ${removed.scores} test score(s), ` +
        `and unlinked ${removed.turns} governed turn(s).`,
    );
  } else {
    // Sequence entries go regardless of status: a retired card still listed in a
    // sequence reads as live to anyone inspecting the sequence, and the point is
    // that nothing from the old library is referenced.
    const kept = await db.transaction(async (tx) => {
      const ent = await tx.delete(heuristicSequenceEntries).returning({ id: heuristicSequenceEntries.id });
      const crd = await tx
        .update(heuristics)
        .set({ status: "retired", modifiedAt: new Date() })
        .where(ne(heuristics.status, "retired"))
        .returning({ id: heuristics.id });
      return { entries: ent.length, cards: crd.length };
    });

    console.log(
      `\nRetired ${kept.cards} card(s) and removed ${kept.entries} sequence entr(ies).\n` +
        `${retired} card(s) were already retired.\n\n` +
        "Retired cards are excluded by getSequenceCards and by the admin list, so\n" +
        "they cannot fire and Danielle will see only the v2 library. Their rows —\n" +
        "and every student application that referenced them — are intact.",
    );
  }

  /* ── Prove it ─────────────────────────────────────────────────────────── */

  const stillLive = await scalar(
    db.select({ n: count() }).from(heuristics).where(ne(heuristics.status, "retired")),
  );
  const stillEntries = await scalar(db.select({ n: count() }).from(heuristicSequenceEntries));
  const stillComponents = await scalar(db.select({ n: count() }).from(heuristicComponents));

  console.log(
    `\nAfter: ${stillLive} live card(s), ${stillComponents} component row(s), ` +
      `${stillEntries} sequence entr(ies).`,
  );

  if (stillLive !== 0) throw new Error(`Expected 0 live cards, found ${stillLive}.`);
  if (stillEntries !== 0) throw new Error(`Expected 0 sequence entries, found ${stillEntries}.`);
  if (DELETE && stillComponents !== 0) {
    throw new Error(`Expected 0 component rows after --delete, found ${stillComponents}.`);
  }

  console.log("Clean slate confirmed. Ready for wing:seed-compendium.\n");
  await pool.end();
}

main().catch(async (err) => {
  console.error("\n[reset-cards] failed:", (err as Error).message);
  await pool?.end().catch(() => {});
  process.exit(1);
});

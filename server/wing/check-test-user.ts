import "dotenv/config";
import { sql } from "drizzle-orm";
import { type ScriptDb } from "../script-init";
import { startScript } from "./script-start";

/**
 * `npm run wing:check-test-user`
 *
 * Reports whether any test account exists and whether its data has reached the
 * tables the methodology learns from.
 *
 * ── WHY THIS SCRIPT AND NOT A TEST ───────────────────────────────────────
 * `test-user-scope.test.ts` checks that the guards are in the code. It cannot
 * check that they worked, because nothing sets `is_test_user` to true yet — so
 * every runtime assertion would pass on an empty premise. This script asks the
 * database instead, and it is written to be run at exactly two moments:
 *
 *   BEFORE the seeder exists — every count is zero, and the script says that
 *   zero means "no test accounts exist", NOT "the guards work". That distinction
 *   is the whole reason it prints the account count first.
 *
 *   AFTER the first persona run — the counts become the verification. A non-zero
 *   number in any analysis column is a leak, and the script names the table and
 *   exits 1.
 *
 * ── WHAT COUNTS AS A LEAK, AND WHAT DOES NOT ─────────────────────────────
 * Sessions, transcripts and turns for a test account are EXPECTED — that is the
 * harness doing its job, and the selection trace reads them. What must stay at
 * zero is everything downstream that aggregates across students or feeds the
 * methodology:
 *
 *   user_heuristic_scores   the table that decides which methodology earns promotion
 *   prompt_log              the Reveal Cycle's evidence (IG-RC10 filter 0)
 *   pattern_detection_queue the between-cohort candidate miner
 *   classified turns        `classified_by = 'nano'`, which the hand-tagged gold
 *                           standard is validated against
 *
 * `user_heuristic_applications` sits in between and is deliberately NOT a leak:
 * the application log is how the selection trace knows which card fired, and
 * the harness needs it. What it must not carry is an `outcome_signal`, because
 * that is the scorer's judgement and the input to the aggregate — so the
 * outcome column is counted separately from the rows.
 */

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

type Row = Record<string, unknown>;

const num = (r: Row | undefined, k = "n") => Number(r?.[k] ?? 0);

async function one(q: unknown): Promise<Row | undefined> {
  const r = await db.execute(q as never);
  return (r as unknown as { rows: Row[] }).rows?.[0];
}

async function main() {
  ({ db, pool } = await startScript());

  const accounts = num(
    await one(sql`SELECT count(*) AS n FROM "wing"."users" WHERE "is_test_user" = true`),
  );
  const testStudents = num(
    await one(sql`
      SELECT count(*) AS n
        FROM "wing"."students" s
        JOIN "wing"."users" u ON u."id" = s."user_id"
       WHERE u."is_test_user" = true
    `),
  );

  console.log("\n[check-test-user] test accounts");
  console.log(`  wing.users with is_test_user = true : ${accounts}`);
  console.log(`  students belonging to them          : ${testStudents}`);

  if (accounts === 0) {
    console.log(
      "\n  No test account exists. Every count below is therefore zero because\n" +
        "  there is nothing to leak — NOT because the guards were exercised.\n" +
        "  Re-run this after the seeder creates its first persona; that run is\n" +
        "  the one that verifies anything.",
    );
  }

  /* ── Expected: the harness's own footprint ───────────────────────────── */

  const sessionsN = num(
    await one(sql`
      SELECT count(*) AS n
        FROM "wing"."sessions" se
        JOIN "wing"."students" s ON s."id" = se."student_id"
        JOIN "wing"."users" u ON u."id" = s."user_id"
       WHERE u."is_test_user" = true
    `),
  );
  const turnsN = num(
    await one(sql`
      SELECT count(*) AS n
        FROM "wing"."transcript_turns" t
        JOIN "wing"."transcripts" tr ON tr."id" = t."transcript_id"
        JOIN "wing"."sessions" se ON se."id" = tr."session_id"
        JOIN "wing"."students" s ON s."id" = se."student_id"
        JOIN "wing"."users" u ON u."id" = s."user_id"
       WHERE u."is_test_user" = true
    `),
  );
  const applicationsN = num(
    await one(sql`
      SELECT count(*) AS n
        FROM "wing"."user_heuristic_applications" a
        JOIN "wing"."students" s ON s."id" = a."student_id"
        JOIN "wing"."users" u ON u."id" = s."user_id"
       WHERE u."is_test_user" = true
    `),
  );

  console.log("\n[check-test-user] expected — the harness needs these");
  console.log(`  sessions                            : ${sessionsN}`);
  console.log(`  transcript turns                    : ${turnsN}`);
  console.log(`  heuristic applications              : ${applicationsN}   (the selection trace reads these)`);

  /* ── Must be zero ────────────────────────────────────────────────────── */

  const leaks: Array<{ what: string; n: number; why: string }> = [
    {
      what: "user_heuristic_scores",
      why: "decides which methodology earns promotion",
      n: num(
        await one(sql`
          SELECT count(*) AS n
            FROM "wing"."user_heuristic_scores" sc
            JOIN "wing"."students" s ON s."id" = sc."student_id"
            JOIN "wing"."users" u ON u."id" = s."user_id"
           WHERE u."is_test_user" = true
        `),
      ),
    },
    {
      what: "applications with an outcome_signal",
      why: "the scorer's judgement, and the input to the aggregate",
      n: num(
        await one(sql`
          SELECT count(*) AS n
            FROM "wing"."user_heuristic_applications" a
            JOIN "wing"."students" s ON s."id" = a."student_id"
            JOIN "wing"."users" u ON u."id" = s."user_id"
           WHERE u."is_test_user" = true AND a."outcome_signal" IS NOT NULL
        `),
      ),
    },
    {
      what: "prompt_log rows",
      why: "the Reveal Cycle's evidence — IG-RC10 hard filter 0",
      n: num(
        await one(sql`
          SELECT count(*) AS n
            FROM "wing"."prompt_log" pl
            JOIN "wing"."students" s ON s."id" = pl."student_id"
            JOIN "wing"."users" u ON u."id" = s."user_id"
           WHERE u."is_test_user" = true
        `),
      ),
    },
    {
      what: "turns classified by nano",
      why: "the corpus the hand-tagged gold standard is validated against",
      n: num(
        await one(sql`
          SELECT count(*) AS n
            FROM "wing"."transcript_turns" t
            JOIN "wing"."transcripts" tr ON tr."id" = t."transcript_id"
            JOIN "wing"."sessions" se ON se."id" = tr."session_id"
            JOIN "wing"."students" s ON s."id" = se."student_id"
            JOIN "wing"."users" u ON u."id" = s."user_id"
           WHERE u."is_test_user" = true AND t."classified_by" = 'nano'
        `),
      ),
    },
  ];

  console.log("\n[check-test-user] must be zero");
  let leaked = 0;
  for (const l of leaks) {
    const flag = l.n === 0 ? "ok  " : "LEAK";
    if (l.n !== 0) leaked++;
    console.log(`  ${flag} ${l.what.padEnd(36)}: ${l.n}   (${l.why})`);
  }

  /*
   * The between-cohort miner has no table rows to attribute to a student — its
   * `supporting_turn_ids` is an array — so it is checked by overlap rather than
   * by a join.
   */
  const minerN = num(
    await one(sql`
      SELECT count(*) AS n
        FROM "wing"."pattern_detection_queue" q
       WHERE EXISTS (
         SELECT 1
           FROM "wing"."transcript_turns" t
           JOIN "wing"."transcripts" tr ON tr."id" = t."transcript_id"
           JOIN "wing"."sessions" se ON se."id" = tr."session_id"
           JOIN "wing"."students" s ON s."id" = se."student_id"
           JOIN "wing"."users" u ON u."id" = s."user_id"
          WHERE u."is_test_user" = true AND t."id" = ANY (q."supporting_turn_ids")
       )
    `),
  );
  if (minerN !== 0) leaked++;
  console.log(
    `  ${minerN === 0 ? "ok  " : "LEAK"} ${"pattern_detection_queue candidates".padEnd(36)}: ${minerN}` +
      `   (cites a test account's turns)`,
  );

  if (leaked) {
    console.log(
      `\n  ${leaked} leak(s). Synthetic data is inside what the methodology learns from.\n` +
        `  Find the writer, guard it, and see server/wing/test-user.ts for why the\n` +
        `  guard goes at an entry point rather than into a query.\n`,
    );
    await pool.end();
    process.exit(1);
  }

  console.log(
    accounts === 0
      ? "\n  Nothing leaked, and nothing could have. Re-run after the seeder.\n"
      : "\n  Nothing leaked.\n",
  );
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool?.end();
  } catch {
    /* the process is exiting anyway */
  }
  process.exit(1);
});

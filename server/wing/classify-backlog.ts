import "dotenv/config";
import { and, eq, lt, ne, sql } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { transcripts, transcriptTurns, sessions } from "@shared/wing-schema";

/**
 * Sweeps sessions whose turns are still provisionally typed.
 *
 * Run:  npm run wing:classify-backlog
 *       npm run wing:classify-backlog -- --dry-run --older-than-hours=6
 *
 * WHY THIS EXISTS
 * classifySession() is triggered when a session completes or is ended early.
 * A session that is simply ABANDONED — the student closes the tab and never
 * returns — hits neither path, so its turns keep their provisional labels
 * forever. Those turns are still corpus data: they are still human utterances
 * that ground memory, and a permanently provisional label means they were
 * never checked for the one type the rule cannot infer, `human_correction`.
 *
 * The schema anticipated this. `transcript_turns_provisional_idx` is a partial
 * index on exactly this predicate, which is only worth having if something
 * sweeps.
 *
 * Intended to run as a Container Apps cron job, hourly or daily. Idempotent:
 * classifySession skips anything already classified or hand-tagged.
 *
 * The delay before sweeping is deliberate — a session in progress right now
 * has provisional turns for a perfectly good reason, and classifying mid-
 * conversation would burn Nano calls on turns that are about to be classified
 * by the normal path anyway.
 */

const DRY_RUN = process.argv.includes("--dry-run");

const olderThanArg = process.argv.find((a) => a.startsWith("--older-than-hours="));
const OLDER_THAN_HOURS = olderThanArg ? Number(olderThanArg.split("=")[1]) : 6;

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  // llm: true — this script calls the orchestrator, so the Azure OpenAI
  // settings must be hydrated too, not just DATABASE_URL.
  ({ db, pool } = await initScript({ llm: true }));
  const classifier = await import("./classifier");

  if (!Number.isFinite(OLDER_THAN_HOURS) || OLDER_THAN_HOURS < 0) {
    throw new Error("--older-than-hours must be a non-negative number");
  }

  const cutoff = new Date(Date.now() - OLDER_THAN_HOURS * 3600_000);

  console.log(
    `[classify-backlog] sessions with provisional turns older than ` +
      `${OLDER_THAN_HOURS}h (before ${cutoff.toISOString()})` +
      (DRY_RUN ? " — DRY RUN" : ""),
  );

  // Legacy imports are excluded: their provenance is unknown by definition and
  // the migration rules forbid inventing any retroactively.
  const rows = await db
    .selectDistinct({ sessionId: sessions.id })
    .from(transcriptTurns)
    .innerJoin(transcripts, eq(transcripts.id, transcriptTurns.transcriptId))
    .innerJoin(sessions, eq(sessions.id, transcripts.sessionId))
    .where(
      and(
        eq(transcriptTurns.classificationStatus, "provisional"),
        ne(transcriptTurns.provenanceTag, "provenance_unknown"),
        ne(transcripts.status, "migrated_provenance_unknown"),
        lt(transcriptTurns.createdAt, cutoff),
        sql`${transcriptTurns.turnType} IN ('human_spontaneous', 'human_elicited_response')`,
      ),
    );

  if (!rows.length) {
    console.log("[classify-backlog] nothing to do");
    await pool.end();
    return;
  }

  console.log(`[classify-backlog] ${rows.length} session(s) to sweep`);

  if (DRY_RUN) {
    console.log(`[classify-backlog] would classify: ${rows.map((r) => r.sessionId).join(", ")}`);
    await pool.end();
    return;
  }

  // Sequential on purpose: this is background work competing with live traffic
  // for the same Nano deployment, and a burst of parallel calls would show up
  // as latency inside somebody's session.
  for (const { sessionId } of rows) {
    await classifier.classifySession(sessionId);
  }

  console.log("[classify-backlog] done");
  await pool.end();
}

main().catch(async (err) => {
  console.error("[classify-backlog] failed:", err);
  await pool?.end().catch(() => {});
  process.exit(1);
});

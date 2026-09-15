import { createHash } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { harnessPersonas, schoolCycles, testRuns, testRunSessions } from "@shared/wing-schema";
import { composeSpecPrompt } from "./harness-persona-store";
import { applyCheckpoint, nextFoundationSession, type Checkpoint } from "./checkpoint-store";
import { ensureSession, type WingSessionType } from "./session-store";
import * as sessionStore from "./session-store";
import { isAiTurn } from "./turn-type";
import { scoreAdherence, type AdherenceReport } from "./persona-adherence";
import { sessionTrace } from "../harness/trace-store";
import { buildDiscrepancyReport, type DiscrepancyFinding } from "../harness/discrepancy-report";

/**
 * P3.2 — `initializeTestRun`, the service behind `POST
 * /api/test/sessions/initialize` (`claude/TEST_HARNESS_PLAN_SEP9.md`).
 *
 * ── WHAT THIS DOES AND, JUST AS IMPORTANTLY, DOES NOT DO ───────────────────
 * "Seeder + checkpoint + session provisioning, returns run id and session
 * ids" — that's the whole scope. This function fast-forwards the account
 * (`applyCheckpoint`), works out which Foundation session a run should
 * actually drive turns against, provisions that session, and records a
 * `wing.test_runs` / `wing.test_run_sessions` row pair so the run is
 * traceable before a single turn happens.
 *
 * It does **not** drive any turns. That is `test-run-engine.ts`
 * (`claimTestRun` + `runTestRunTurns`, P3.1) — a separate file, on purpose:
 * this one only ever inserts `testRuns`/`testRunSessions` rows, and the
 * boundary test for this surface (`harness-test-run-boundary.test.ts`)
 * fails loudly if that stops being true. Driving turns means real Azure
 * OpenAI spend against a real deployment tier and calls into the extracted
 * streaming-route logic (`assembleFoundationTurnPrompt`,
 * `finalizeFoundationTurn`) — different enough scope, and different enough
 * risk, to earn its own file and its own review rather than growing this
 * one. A run this function creates sits at `status: "provisioned"` until
 * `claimTestRun` moves it to `"running"`.
 *
 * ── WHY THE SPEC HASH ─────────────────────────────────────────────────────
 * `harness_personas` rows are editable at any time, including after a run
 * has started against them (`updatePersona` never locks the content fields).
 * `spec_hash` is `composeSpecPrompt(persona)` hashed at the moment this run
 * is created, so a finding a week from now points at the exact wording that
 * produced it, not whatever the row happens to say when someone reads it.
 *
 * ── THE OTHER TWO GUARDS (migration 0045) ──────────────────────────────────
 * `turnCeiling` bounds how many exchanges a run drives; `tokenBudget` and
 * `maxWallClockSeconds` bound what those exchanges cost and how long they're
 * allowed to take — `test-run-engine.ts` checks both once per turn and
 * aborts the run rather than continuing past either. Defaulted here, not
 * left to the column defaults alone, so a caller that never mentions a guard
 * still gets one explicitly rather than depending on Postgres filling it in.
 */

export type InitializeResult =
  | {
      ok: true;
      runId: number;
      studentId: number;
      checkpoint: Checkpoint;
      sessionId: number;
      sessionType: WingSessionType;
      sequenceId: number | null;
    }
  | {
      ok: false;
      error: "persona_not_found" | "not_seeded" | "checkpoint_failed" | "no_runnable_session";
      detail?: string;
    };

// Bumped from 12 to 15 (Aditya, 11 Sep 2026: "bump the default to 15") — 12
// undershot TEST_HARNESS_PLAN_SEP9.md's own planned figure; nothing about
// MIN_TURN_CEILING/MAX_TURN_CEILING in harness-test-run-routes.ts needed to
// move, since 15 already sat well inside that 1-60 range.
const DEFAULT_TURN_CEILING = 15;
// Matches the column defaults in migration 0045 — kept here too so a caller
// that never mentions a guard still gets one, not `undefined` silently
// falling through to Postgres's own default only some of the time.
const DEFAULT_TOKEN_BUDGET = 300_000;
const DEFAULT_MAX_WALL_CLOCK_SECONDS = 900;

export async function initializeTestRun(
  personaId: number,
  checkpoint: Checkpoint,
  turnCeiling: number = DEFAULT_TURN_CEILING,
  tokenBudget: number = DEFAULT_TOKEN_BUDGET,
  maxWallClockSeconds: number = DEFAULT_MAX_WALL_CLOCK_SECONDS,
): Promise<InitializeResult> {
  const [persona] = await db.select().from(harnessPersonas).where(eq(harnessPersonas.id, personaId));
  if (!persona) return { ok: false, error: "persona_not_found" };
  if (persona.status !== "seeded" || !persona.seededStudentId || !persona.seededCycleId) {
    return { ok: false, error: "not_seeded", detail: "activate this persona before initializing a run" };
  }

  const studentId = persona.seededStudentId;

  // Same is_test_user check happens again inside applyCheckpoint — this call
  // is what actually enforces it; nothing here bypasses that.
  const checkpointResult = await applyCheckpoint(studentId, checkpoint);
  if (!checkpointResult.ok) {
    return { ok: false, error: "checkpoint_failed", detail: checkpointResult.error };
  }

  const sessionType = nextFoundationSession(checkpoint);
  if (!sessionType) {
    return {
      ok: false,
      error: "no_runnable_session",
      detail:
        "module_6_entry has no Foundation session left to run — Module 6 isn't session-based, " +
        "and driving it isn't built yet",
    };
  }

  const session = await ensureSession(studentId, sessionType);

  const [cycle] = await db
    .select({ sequenceId: schoolCycles.activeHeuristicSequenceId })
    .from(schoolCycles)
    .where(eq(schoolCycles.id, persona.seededCycleId));
  const sequenceId = cycle?.sequenceId ?? null;

  const specHash = createHash("sha256").update(composeSpecPrompt(persona)).digest("hex");

  const [run] = await db
    .insert(testRuns)
    .values({
      personaId,
      specHash,
      sequenceId,
      checkpoint,
      fidelity: "marked_complete",
      turnCeiling,
      tokenBudget,
      maxWallClockSeconds,
      status: "provisioned",
    })
    .returning();

  await db.insert(testRunSessions).values({
    testRunId: run.id,
    sessionId: session.id,
    sessionType,
    status: "pending",
  });

  return {
    ok: true,
    runId: run.id,
    studentId,
    checkpoint,
    sessionId: session.id,
    sessionType,
    sequenceId,
  };
}

/**
 * The read side for the admin panel — a run, its one driven session, and
 * that session's turns (including the synthetic ones, unlike every
 * analysis-facing read in this codebase, which is the point: this is where
 * Danielle looks AT the synthetic conversation, not around it).
 *
 * `adherence` (P4.3 / P5) is computed here, on read, from the turns already
 * in hand — not written anywhere. Same "reconstruction over live capture"
 * choice this harness already made for the coaching-card selection trace
 * (`server/harness/`): the persona's own turns are the only input the report
 * needs, so there is nothing to persist that the transcript doesn't already
 * hold, and a scoring-rule change (say, a different word-count band) applies
 * retroactively to every past run's export instead of only future ones.
 */
export type TestRunDetail = {
  run: typeof testRuns.$inferSelect;
  session: typeof testRunSessions.$inferSelect | null;
  turns: Awaited<ReturnType<typeof sessionStore.getTurns>>;
  adherence: AdherenceReport | null;
  /** P5.4 — hedging-specific discrepancies, reusing the same session-trace
   *  reconstruction the Methodology > Simulations screen already exposes at
   *  `/api/admin/harness/sessions/:id/discrepancies`. Null only when there is
   *  no methodology to trace against (`sessionTrace` itself returned null),
   *  which `trace-store.ts` already treats as a real, non-error state. */
  discrepancies: DiscrepancyFinding[] | null;
  /** P7 — "card badges" on the live monitor's transcript. Keyed by turn id;
   *  `null` means this turn was traced and nothing won (an honest "no card
   *  fired" rather than an absent key reading as "not traced"). Turns with
   *  no key at all are turns `sessionTrace` never covered — Wing's own
   *  turns, per `run-export-format.ts`'s doc comment on why a card fires in
   *  response to the persona's turn, never Wing's. Reuses the same trace
   *  `discrepancies` already reconstructs — no second read. */
  cardWins: Record<number, { cardCode: string; name: string } | null>;
} | null;

export async function getTestRunDetail(runId: number): Promise<TestRunDetail> {
  const [run] = await db.select().from(testRuns).where(eq(testRuns.id, runId));
  if (!run) return null;

  const [runSession] = await db
    .select()
    .from(testRunSessions)
    .where(eq(testRunSessions.testRunId, runId));

  const turns = runSession ? await sessionStore.getTurns(runSession.sessionId) : [];

  let adherence: AdherenceReport | null = null;
  let discrepancies: DiscrepancyFinding[] | null = null;
  const cardWins: Record<number, { cardCode: string; name: string } | null> = {};
  if (runSession) {
    const [persona] = await db
      .select({ expectedMarkers: harnessPersonas.expectedMarkers })
      .from(harnessPersonas)
      .where(eq(harnessPersonas.id, run.personaId));
    // The persona's own turns only — Wing's replies would swamp the counts
    // and this report is about the PERSONA's language, not Wing's.
    const personaTurnTexts = turns.filter((t) => !isAiTurn(t.turnType)).map((t) => t.content);
    adherence = scoreAdherence(personaTurnTexts, persona?.expectedMarkers ?? []);

    const trace = await sessionTrace(runSession.sessionId);
    discrepancies = trace ? buildDiscrepancyReport(trace) : null;

    if (trace) {
      for (const turnRow of trace.turns) {
        const winner = turnRow.trace.winner;
        if (!winner) {
          cardWins[turnRow.turnId] = null;
          continue;
        }
        const card = turnRow.trace.cards.find((c) => c.heuristicId === winner.heuristicId);
        cardWins[turnRow.turnId] = { cardCode: winner.cardCode, name: card?.name ?? winner.cardCode };
      }
    }
  }

  return { run, session: runSession ?? null, turns, adherence, discrepancies, cardWins };
}


export type LatestRunSummary = {
  runId: number;
  status: "provisioned" | "running" | "completed" | "aborted";
  startedAt: string | null;
  finishedAt: string | null;
};

/**
 * One row per persona: its most recent run, if it has one at all.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The admin Personas panel's run status/progress line lived entirely in
 * React state keyed to whichever run a "Run" click just started
 * (`PersonaRunControls`'s own `runId` state) — reload the page, navigate away
 * and back, or open the panel in a second tab, and that state is gone with
 * nothing to rebuild it from, even though the run itself is still going (or
 * finished) in the database. Aditya, 15 Sep 2026: "there is no indication on
 * any of the screens which lets the admin know of the progress" — this is
 * the read the persona list uses to reattach to a persona's own run on
 * mount, so the status survives a reload instead of only surviving as long
 * as the component that started it stays mounted.
 *
 * ── ONE QUERY FOR THE WHOLE LIST, NOT ONE PER PERSONA ─────────────────────
 * `listPersonas()`'s caller wants this for every persona on the page at
 * once. Fetching every run for the given personas and keeping only each
 * one's highest `id` (== latest, ids are monotonic) in application code
 * avoids a `DISTINCT ON` or a correlated-subquery-per-row, and the personas
 * list is small enough (dozens, not thousands) that this is the simpler
 * thing to read back later.
 */
export async function getLatestRunsForPersonas(
  personaIds: number[],
): Promise<Map<number, LatestRunSummary>> {
  const out = new Map<number, LatestRunSummary>();
  if (personaIds.length === 0) return out;

  const rows = await db
    .select({
      personaId: testRuns.personaId,
      id: testRuns.id,
      status: testRuns.status,
      startedAt: testRuns.startedAt,
      finishedAt: testRuns.finishedAt,
    })
    .from(testRuns)
    .where(inArray(testRuns.personaId, personaIds))
    .orderBy(desc(testRuns.id));

  for (const row of rows) {
    // First row seen per personaId is the latest, since rows arrive id-descending.
    if (out.has(row.personaId)) continue;
    out.set(row.personaId, {
      runId: row.id,
      status: row.status as LatestRunSummary["status"],
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    });
  }

  return out;
}

/**
 * Every run for one persona, oldest first -- the cross-module comparison a
 * coaching debrief needs (`coaching-debrief.ts`): "what changed between this
 * module and the one before it" only means anything read in the order the
 * modules actually happened. Includes every run regardless of status, same
 * as `getLatestRunsForPersonas` -- a caller that only wants completed runs
 * filters on `status` itself, the same way `test-run-export.ts` already
 * treats an unfinished run's export as "nothing to export yet" rather than
 * this function guessing at that policy.
 */
export type PersonaRunSummary = {
  runId: number;
  checkpoint: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export async function listRunsForPersona(personaId: number): Promise<PersonaRunSummary[]> {
  const rows = await db
    .select({
      id: testRuns.id,
      checkpoint: testRuns.checkpoint,
      status: testRuns.status,
      startedAt: testRuns.startedAt,
      finishedAt: testRuns.finishedAt,
    })
    .from(testRuns)
    .where(eq(testRuns.personaId, personaId))
    .orderBy(testRuns.id);

  return rows.map((row) => ({
    runId: row.id,
    checkpoint: row.checkpoint,
    status: row.status,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  }));
}

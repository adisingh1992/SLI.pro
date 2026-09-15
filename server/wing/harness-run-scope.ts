import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { harnessPersonas, testRuns, testRunSessions } from "@shared/wing-schema";
import { sessionTrace } from "../harness/trace-store";
import type { TurnTrace } from "../harness/selection-trace";

/**
 * Resolving "which runs, and their traces" for a sequence-scoped report — the
 * one piece P6.2 and P6.3 both need, factored out once they turned out to
 * need it identically.
 *
 * `unfired-cards-report.ts` (P6.2) wanted every trace flattened into one
 * array; `card-comparison-report.ts` (P6.3) wants the same traces kept per
 * run so one card's outcome can be pivoted by persona. Writing the gathering
 * twice would risk the two reports disagreeing on which runs are in scope or
 * how a run with no sessions is handled — the same reason this codebase
 * factors `cardAppliesTo`, `classifyUnfired` and `sessionTrace` itself into
 * one place apiece rather than letting each caller re-derive them.
 *
 * ── SCOPE AND THE MULTI-SEQUENCE REFUSAL ──────────────────────────────────
 * A card's identity — eligible, considered, won — only means one thing within
 * one sequence's own catalogue, so an explicit `runIds` scope spanning more
 * than one sequence is refused here, once, rather than in every caller.
 */

export type RunScope = { sequenceId: number } | { runIds: number[] };

export type ResolvedRun = {
  runId: number;
  personaId: number;
  personaName: string;
  /** 'provisioned' | 'running' | 'completed' | 'aborted' — shown, never
   *  filtered, so nothing in scope is invisible to whoever reads a report. */
  status: string;
  sessionsTraced: number;
  turnsTraced: number;
  traces: TurnTrace[];
};

export type ResolveRunScopeResult =
  | { ok: true; sequenceId: number; runs: ResolvedRun[] }
  | { ok: false; error: "no_runs_for_scope" }
  | { ok: false; error: "runs_span_multiple_sequences"; detail: string };

export async function resolveRunScope(scope: RunScope): Promise<ResolveRunScopeResult> {
  const runs =
    "sequenceId" in scope
      ? await db
          .select({
            id: testRuns.id,
            personaId: testRuns.personaId,
            status: testRuns.status,
            sequenceId: testRuns.sequenceId,
          })
          .from(testRuns)
          .where(eq(testRuns.sequenceId, scope.sequenceId))
      : await db
          .select({
            id: testRuns.id,
            personaId: testRuns.personaId,
            status: testRuns.status,
            sequenceId: testRuns.sequenceId,
          })
          .from(testRuns)
          .where(inArray(testRuns.id, scope.runIds));

  if (!runs.length) return { ok: false, error: "no_runs_for_scope" };

  const distinctSequenceIds = new Set(runs.map((r) => r.sequenceId));
  if (distinctSequenceIds.size > 1) {
    return {
      ok: false,
      error: "runs_span_multiple_sequences",
      detail:
        `runs ${runs.map((r) => r.id).join(", ")} point at sequences ` +
        `${[...distinctSequenceIds].map((s) => s ?? "none").join(", ")} — a card's eligibility ` +
        `is only comparable within one sequence's own catalogue`,
    };
  }

  const sequenceId = [...distinctSequenceIds][0];
  // Defensive: `activatePersona`/`applyCheckpoint` already refuse a cycle
  // that publishes nothing, so a run's sequenceId should never be null in
  // practice — see testRuns.sequenceId's own doc comment.
  if (sequenceId === null) return { ok: false, error: "no_runs_for_scope" };

  const personaRows = runs.length
    ? await db
        .select({ id: harnessPersonas.id, name: harnessPersonas.name })
        .from(harnessPersonas)
        .where(
          inArray(
            harnessPersonas.id,
            runs.map((r) => r.personaId),
          ),
        )
    : [];
  const personaNameById = new Map(personaRows.map((p) => [p.id, p.name]));

  const runSessionRows = await db
    .select({ testRunId: testRunSessions.testRunId, sessionId: testRunSessions.sessionId })
    .from(testRunSessions)
    .where(
      inArray(
        testRunSessions.testRunId,
        runs.map((r) => r.id),
      ),
    );
  const sessionIdsByRun = new Map<number, number[]>();
  for (const row of runSessionRows) {
    const list = sessionIdsByRun.get(row.testRunId) ?? [];
    list.push(row.sessionId);
    sessionIdsByRun.set(row.testRunId, list);
  }

  const resolved: ResolvedRun[] = [];
  for (const run of runs) {
    const sessionIds = sessionIdsByRun.get(run.id) ?? [];
    const traces: TurnTrace[] = [];
    for (const sessionId of sessionIds) {
      const trace = await sessionTrace(sessionId);
      if (!trace) continue;
      for (const turn of trace.turns) traces.push(turn.trace);
    }
    resolved.push({
      runId: run.id,
      personaId: run.personaId,
      personaName: personaNameById.get(run.personaId) ?? `persona ${run.personaId}`,
      status: run.status,
      sessionsTraced: sessionIds.length,
      turnsTraced: traces.length,
      traces,
    });
  }

  return { ok: true, sequenceId, runs: resolved };
}

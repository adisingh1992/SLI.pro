import { classifyUnfired } from "../harness/selection-trace";
import { resolveRunScope, type RunScope } from "./harness-run-scope";

/**
 * P6.2 — the Unfired Cards report, across every persona run that shares a
 * sequence (`claude/TEST_HARNESS_PLAN_SEP9.md` §P6.2). Danielle's own
 * framing: "if a card never fires across 20 personas, that's either a card
 * that needs different signal conditions or a card that's dead weight" —
 * and `trace-report.ts` (the pre-runner CLI) already says the rest out
 * loud: "One session is one persona's worth of evidence. The cross-persona
 * report is the one that answers 'never fires for anyone' — that needs the
 * runner." The runner (P3) now exists, so this is that report.
 *
 * ── WHY THIS IS ASSEMBLY, NOT NEW LOGIC ───────────────────────────────────
 * The four-way split — never_eligible / eligible_never_won / never_considered
 * / fired — is `classifyUnfired()` (`harness/selection-trace.ts`), already
 * written and already unit-tested there. Which runs are in scope and what
 * their traces are is `resolveRunScope()` (`wing/harness-run-scope.ts`),
 * shared with `card-comparison-report.ts` (P6.3) so the two reports can never
 * disagree about scope. This file's only job is flattening
 * `resolveRunScope`'s per-run traces into one array for `classifyUnfired` and
 * shaping the result — it must not reimplement either.
 */

export type UnfiredCardsReportRunSummary = {
  runId: number;
  personaId: number;
  personaName: string;
  status: string;
  sessionsTraced: number;
  turnsTraced: number;
};

export type UnfiredCardsReport = {
  sequenceId: number;
  runsIncluded: UnfiredCardsReportRunSummary[];
  totalTurnsTraced: number;
  cards: ReturnType<typeof classifyUnfired>;
  generatedAt: string;
};

export type BuildUnfiredCardsReportResult =
  | { ok: true; report: UnfiredCardsReport }
  | { ok: false; error: "no_runs_for_scope" }
  | { ok: false; error: "runs_span_multiple_sequences"; detail: string };

export async function buildUnfiredCardsReport(scope: RunScope): Promise<BuildUnfiredCardsReportResult> {
  const resolved = await resolveRunScope(scope);
  if (!resolved.ok) return resolved;

  const allTraces = resolved.runs.flatMap((r) => r.traces);

  return {
    ok: true,
    report: {
      sequenceId: resolved.sequenceId,
      runsIncluded: resolved.runs.map(({ traces, ...summary }) => summary),
      totalTurnsTraced: allTraces.length,
      cards: classifyUnfired(allTraces),
      generatedAt: new Date().toISOString(),
    },
  };
}

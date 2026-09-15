import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  harnessPersonas,
  heuristicComponents,
  testRuns,
  testRunSessions,
  userHeuristicApplications,
} from "@shared/wing-schema";
import * as sessionStore from "./session-store";
import { isAiTurn } from "./turn-type";
import { scoreAdherence } from "./persona-adherence";
import { NOT_MEASURED_CLASSIFICATIONS } from "./marker-instrumentation";
import { sessionTrace } from "../harness/trace-store";
import { buildDiscrepancyReport } from "../harness/discrepancy-report";
import type { RunExport, RunExportTurnRow } from "./run-export-format";

// Re-exported so `harness-test-run-routes.ts`'s existing
// `import { buildRunExport, runExportToCsv } from "./wing/test-run-export"`
// keeps working unchanged — see `run-export-format.ts`'s own doc comment for
// why the CSV renderer and its types moved there (the pure/impure split this
// whole harness already uses everywhere else).
export { runExportToCsv, type RunExport, type RunExportTurnRow } from "./run-export-format";

/**
 * P6.1 — the export endpoint (`TEST_HARNESS_PLAN_SEP9.md` §P6.1): "JSON and CSV: turn
 * index, speaker, content, card applied, component version, audience adaptation, full
 * selection trace, gate findings, P5 marker counts, persona adherence, and the run's
 * provenance block (persona version, sequence version, checkpoint, fidelity, model
 * deployments)."
 *
 * ── WHERE EACH FIELD ALREADY COMES FROM ──────────────────────────────────────────────
 * Every field the plan names except one was already reconstructable from earlier phases:
 * `sessionTrace` (P1) for the full selection trace and gate findings, `scoreAdherence`
 * (P4.3) for persona adherence AND per-turn P5 marker counts (it already computes
 * `computeDeterministicMarkers` per persona turn — this file reads that back rather than
 * computing it a second time), `buildDiscrepancyReport` (P5.4) alongside them, and the
 * run's own row (`test_runs`) for the provenance block. This file's only new read is the
 * one join nothing before it needed: `user_heuristic_applications.heuristic_component_id`
 * resolved to `heuristic_components.version_number`, for "component version."
 *
 * ── AUDIENCE ADAPTATION, RESOLVED AS OF 15 SEP 2026 ──────────────────────────────────
 * "Audience adaptation" used to be the one field this file could not honestly produce —
 * nothing in the schema persisted which register (`voice.ts`'s undergraduate/executive/
 * default) a past turn actually rendered with, only which one TODAY's voice-profile
 * configuration would resolve to. `transcript_turns.delivery_audience`/`.delivery_register`
 * (migration 0048) close that gap at the write path (`provenance.ts`'s `recordTurn`), so
 * this file now reads real per-turn history rather than reconstructing anything.
 * `notReconstructed` stays in the shape as a mechanism, now empty, for the same reason
 * `trace-store.ts`'s own `populationTagsAsOf: "now"` flag exists — to call a gap out
 * rather than paper over it, should one ever reappear.
 *
 * ── WHY WING'S TURNS CARRY NO SELECTION TRACE OF THEIR OWN ────────────────────────────
 * A card fires in response to the STUDENT's (here, the persona's) turn — the detector
 * never runs against Wing's own reply. So the trace and gate findings in each row below
 * are attached to the persona turn that triggered them, exactly as `trace-store.ts`
 * already documents for `gateFindings` ("breaches the deterministic audit found in the
 * reply to this turn"); Wing's own row in this export always carries
 * `selectionTrace: null` and `gateFindings: []`, which is a fact about how coaching
 * works, not a gap in this export.
 *
 * ── THE PURE/IMPURE SPLIT ──────────────────────────────────────────────────────────────
 * The export's TYPES and its CSV rendering live in `run-export-format.ts`, which has no
 * database import at all — same split as `marker-instrumentation.ts`/`test-run-store.ts`
 * and `selection-trace.ts`/`trace-store.ts` elsewhere in this harness, and for the same
 * reason: a function with no I/O of its own should be testable with no I/O of its own.
 * This file is the other half — the actual reads.
 */

export async function buildRunExport(runId: number): Promise<RunExport | null> {
  const [run] = await db.select().from(testRuns).where(eq(testRuns.id, runId));
  if (!run) return null;

  const [runSession] = await db
    .select()
    .from(testRunSessions)
    .where(eq(testRunSessions.testRunId, runId));

  const [persona] = await db
    .select({ expectedMarkers: harnessPersonas.expectedMarkers })
    .from(harnessPersonas)
    .where(eq(harnessPersonas.id, run.personaId));

  const provenance: RunExport["provenance"] = {
    personaId: run.personaId,
    personaVersion: run.specHash,
    sequenceId: run.sequenceId,
    checkpoint: run.checkpoint,
    fidelity: run.fidelity,
    completionReason: run.completionReason,
    modelDeployments: { persona: run.modelDeployment, wing: "flagship" },
  };

  if (!runSession) {
    // Provisioned but never driven — nothing to export yet, but the run
    // itself and its provenance still exist and are worth returning rather
    // than 404ing.
    return {
      runId,
      status: run.status,
      provenance,
      turns: [],
      personaAdherence: null,
      discrepancies: null,
      classificationsNotMeasured: NOT_MEASURED_CLASSIFICATIONS,
      notReconstructed: [],
    };
  }

  const [allTurns, trace] = await Promise.all([
    sessionStore.getTurns(runSession.sessionId),
    sessionTrace(runSession.sessionId),
  ]);

  const traceByTurnId = new Map((trace?.turns ?? []).map((t) => [t.turnId, t]));
  const discrepancies = trace ? buildDiscrepancyReport(trace) : null;

  // Component version — the one join P6.1 needs that nothing before this
  // read: which version of a card's component actually fired, resolved off
  // the same application row `trace-store.ts` already reads for the trace
  // itself.
  const applications = await db
    .select({
      turnId: userHeuristicApplications.turnId,
      componentVersion: heuristicComponents.versionNumber,
    })
    .from(userHeuristicApplications)
    .innerJoin(
      heuristicComponents,
      eq(heuristicComponents.id, userHeuristicApplications.heuristicComponentId),
    )
    .where(eq(userHeuristicApplications.sessionId, runSession.sessionId));
  const componentVersionByTurn = new Map(
    applications.filter((a) => a.turnId !== null).map((a) => [a.turnId as number, a.componentVersion]),
  );

  const personaTurnTexts = allTurns.filter((t) => !isAiTurn(t.turnType)).map((t) => t.content);
  const personaAdherence = scoreAdherence(personaTurnTexts, persona?.expectedMarkers ?? []);

  let personaTurnCursor = 0;
  const turns: RunExportTurnRow[] = allTurns.map((t, i) => {
    const speaker: "persona" | "wing" = isAiTurn(t.turnType) ? "wing" : "persona";
    const traceRow = traceByTurnId.get(t.id);
    const winner = traceRow?.trace.cards.find((c) => c.outcome.state === "won");

    // Reads back the marker snapshot `scoreAdherence` already computed for
    // this exact persona turn, in the same order, rather than recomputing it
    // — `personaTurnTexts` and `personaAdherence.turns` are built from the
    // identical filter above, so the indices line up.
    const markerCounts = speaker === "persona" ? personaAdherence.turns[personaTurnCursor++]?.markers ?? null : null;

    return {
      turnIndex: i,
      speaker,
      content: t.content,
      cardApplied: winner
        ? {
            cardCode: winner.cardCode,
            name: winner.name,
            componentVersion: componentVersionByTurn.get(t.id) ?? null,
          }
        : null,
      markerCounts,
      gateFindings: traceRow?.gateFindings ?? [],
      selectionTrace: traceRow?.trace ?? null,
      deliveryAudience: t.deliveryAudience,
      deliveryRegister: t.deliveryRegister,
    };
  });

  return {
    runId,
    status: run.status,
    provenance,
    turns,
    personaAdherence,
    discrepancies,
    classificationsNotMeasured: NOT_MEASURED_CLASSIFICATIONS,
    notReconstructed: [],
  };
}

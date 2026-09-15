/**
 * Per-persona, per-module coaching debrief -- Danielle's output-requirements
 * doc, #5: "what the system learned about the persona during this module,
 * behavioral patterns identified (first detection, second instance, pattern
 * threshold met), cards that fired and the reasoning behind them, withholding
 * instances, cross-session learning carried forward, and an assessment of
 * whether coaching produced the desired impact."
 *
 * ── WHAT THIS IS: SYNTHESIS, NOT NEW INSTRUMENTATION ─────────────────────
 * Every field below is assembled from data P6.1 (`test-run-export.ts`) and
 * P5.4 (`discrepancy-report.ts`) already compute -- this file reads
 * `buildRunExport`'s output and reshapes it into the debrief's structure. In
 * this harness's current usage a `test_runs` row drives exactly one session
 * (one module), so "per module" and "per run" are the same scope; if that
 * ever changes (a run spanning several `test_run_sessions`), this file
 * would need a session-scoped variant of `buildRunExport` first.
 *
 * ── WHAT "WITHHOLDING" HONESTLY MEANS HERE ───────────────────────────────
 * Danielle's phrasing ("failure paths triggered but system did not respond,
 * signals detected but signal count insufficient to act") describes a
 * per-candidate scoring model the detector does not have --
 * `selection-trace.ts`'s own file header is explicit that per-candidate
 * match scores do not exist and cannot be reconstructed short of changing
 * the live detector. The one form of withholding that genuinely is
 * reconstructable is `TracedCard`'s `"withheld"` state: a card the detector
 * matched and then H-003's intensity sequencing held back on purpose. That
 * is what `withheld` below reports -- narrower than Danielle's description,
 * flagged as such in `limits` rather than quietly answering a different
 * question than the one she asked.
 *
 * ── WHAT "ASSESSMENT" DELIBERATELY DOES NOT DO ───────────────────────────
 * This file does not generate a verdict on whether coaching "worked" for
 * this persona/module -- that is Danielle's own call, and a generated
 * verdict would be exactly the kind of confident-sounding, unearned output
 * `reveal-gates.ts`'s Barnum-gate concern already exists elsewhere in this
 * codebase to guard against. Instead, `buildCoachingDebrief` assembles the
 * measured facts (adherence, discrepancies, marker patterns) a human needs
 * to make that call themselves, and stops there.
 */
import { buildRunExport } from "./test-run-export";
import { listRunsForPersona } from "./test-run-store";
import {
  collectCardFirings,
  collectWithheld,
  findMarkerPatterns,
  type CardFiring,
  type CoachingDebrief,
  type MarkerPattern,
  type ModuleComparison,
  type WithheldInstance,
} from "./coaching-debrief-format";

// Re-exported so existing callers (`harness-test-run-routes.ts`'s
// `import { buildCoachingDebrief } from "./wing/coaching-debrief"`, and this
// file's own test) keep working unchanged — the pure/impure split above this
// comment moved the assembly functions and types out, not the import site.
export {
  collectCardFirings,
  collectWithheld,
  findMarkerPatterns,
  type CardFiring,
  type CoachingDebrief,
  type MarkerPattern,
  type ModuleComparison,
  type WithheldInstance,
} from "./coaching-debrief-format";

export async function buildCoachingDebrief(runId: number): Promise<CoachingDebrief | null> {
  const exportData = await buildRunExport(runId);
  if (!exportData) return null;

  const limits: string[] = [
    '"Withheld" below is narrower than a full withholding analysis: it is only the ' +
      "H-003 intensity-sequencing case the selection trace can reconstruct, not every " +
      "case of a signal detected but not acted on — the detector keeps no per-candidate " +
      "scores to reconstruct the general case from (see selection-trace.ts).",
  ];

  const allModules = await listRunsForPersona(exportData.provenance.personaId);
  const priorCompleted = allModules
    .filter((m) => m.runId < runId && m.status === "completed")
    .sort((a, b) => b.runId - a.runId)[0];

  let comparedToPriorModule: ModuleComparison | null = null;
  if (priorCompleted) {
    const priorExport = await buildRunExport(priorCompleted.runId);
    const priorTypes = new Set((priorExport?.discrepancies ?? []).map((d) => d.type));
    const thisTypes = new Set((exportData.discrepancies ?? []).map((d) => d.type));
    comparedToPriorModule = {
      priorRunId: priorCompleted.runId,
      priorCheckpoint: priorCompleted.checkpoint,
      recurring: [...thisTypes].filter((t) => priorTypes.has(t)),
      noLongerPresent: [...priorTypes].filter((t) => !thisTypes.has(t)),
      newThisModule: [...thisTypes].filter((t) => !priorTypes.has(t)),
    };
  } else {
    limits.push("No earlier completed module exists for this persona — nothing to compare against yet.");
  }

  return {
    runId: exportData.runId,
    personaId: exportData.provenance.personaId,
    checkpoint: exportData.provenance.checkpoint,
    status: exportData.status,
    turnCount: exportData.turns.length,
    expectedMarkers: exportData.personaAdherence?.expectedMarkers ?? [],
    measuredPatterns: findMarkerPatterns(exportData.turns),
    cardsFired: collectCardFirings(exportData.turns),
    withheld: collectWithheld(exportData.turns),
    discrepancies: exportData.discrepancies ?? [],
    adherence: exportData.personaAdherence
      ? {
          adherent: exportData.personaAdherence.adherent,
          lengthAdherence: exportData.personaAdherence.lengthAdherence,
          brokeCharacter: exportData.personaAdherence.brokeCharacter,
          notMeasured: exportData.personaAdherence.notMeasured,
        }
      : null,
    allModules,
    comparedToPriorModule,
    limits,
  };
}

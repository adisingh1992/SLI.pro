/**
 * P6.1 — the export shape and its CSV rendering, pure half.
 *
 * Split out of `test-run-export.ts` (which does the actual database reads)
 * for the same reason every other pure/impure split in this harness exists —
 * `marker-instrumentation.ts`/`test-run-store.ts`, `selection-trace.ts`/
 * `trace-store.ts`, `discrepancy-report.ts`/`trace-store.ts`: a function with
 * no I/O of its own should be testable with no I/O of its own.
 * `runExportToCsv` never touches the database — it turns an already-built
 * `RunExport` into a CSV string — but it sat in the same file as
 * `buildRunExport`, which imports `../db` at the top level; importing that
 * file at all (even only for the pure function) pulls the database module
 * into the module graph, exactly the trap this split avoids. Every type here
 * is imported with `import type` for the same reason: type-only imports are
 * erased before module resolution, so this file needs none of
 * `marker-instrumentation.ts`, `persona-adherence.ts`, or the `harness/`
 * trace modules to exist at runtime, even though it names their types.
 */
import type { AdherenceReport } from "./persona-adherence";
import type { DeterministicMarkers, NOT_MEASURED_CLASSIFICATIONS } from "./marker-instrumentation";
import type { DiscrepancyFinding } from "../harness/discrepancy-report";
import type { TurnTrace } from "../harness/selection-trace";

export type RunExportTurnRow = {
  turnIndex: number;
  speaker: "persona" | "wing";
  content: string;
  cardApplied: { cardCode: string; name: string; componentVersion: number | null } | null;
  /** P5 marker counts — persona turns only; null for Wing's own turns, which
   *  this instrumentation was never built to measure. */
  markerCounts: DeterministicMarkers | null;
  gateFindings: Array<{ cardCode: string; mode: string; matched: string; excerpt: string }>;
  /** Null for Wing's turns — a card fires in response to the persona's turn,
   *  not to Wing's reply, so a selection trace belongs to the turn that
   *  triggered it. */
  selectionTrace: TurnTrace | null;
  /** Which audience population/register `voice.ts` resolved for this turn's
   *  reply — null for persona turns (they carry no delivery register of
   *  their own), and null for a Wing turn recorded before this was captured,
   *  or where voice resolved nothing. See `transcript_turns.delivery_audience`
   *  / `.delivery_register`. */
  deliveryAudience: string | null;
  deliveryRegister: string | null;
};

export type RunExport = {
  runId: number;
  status: string;
  provenance: {
    personaId: number;
    /** `test_runs.spec_hash` — a sha256 of `composeSpecPrompt(persona)` at the
     *  moment this run was created, so an export a week from now still points
     *  at the exact wording that produced it, not whatever the persona row
     *  says today. */
    personaVersion: string;
    sequenceId: number | null;
    checkpoint: string;
    fidelity: string;
    /** Set only on a run that ended via the crisis-hold-as-success path
     *  (`"crisis_hold_asserted"`); null on every ordinary completion. */
    completionReason: string | null;
    modelDeployments: { persona: string | null; wing: "flagship" };
  };
  turns: RunExportTurnRow[];
  personaAdherence: AdherenceReport | null;
  discrepancies: DiscrepancyFinding[] | null;
  /** The four P5.2 stylometric classifications this harness refuses to
   *  approximate from phrase counts — named in every export, per
   *  `marker-instrumentation.ts`'s own doc comment, never silently dropped. */
  classificationsNotMeasured: typeof NOT_MEASURED_CLASSIFICATIONS;
  /** Fields the plan names that this export does not produce, and cannot
   *  honestly approximate — see `test-run-export.ts`'s file header. Empty
   *  since 15 Sep 2026: "audience_adaptation" was the one field here, and
   *  `delivery_audience`/`delivery_register` capture now closes it. Kept as
   *  a mechanism, not removed, so a future genuine gap has somewhere honest
   *  to be named rather than silently dropped. */
  notReconstructed: string[];
};

/**
 * CSV is turn rows only — one line per turn, flattening `markerCounts` and
 * summarizing `gateFindings`/`selectionTrace` rather than nesting them (a
 * spreadsheet has no column for a nested object). The provenance block,
 * persona adherence, and discrepancy list are exactly the parts of a run
 * export that do NOT fit a turn-shaped row; they're available via the JSON
 * format (`?format=json`), which carries the whole `RunExport` structure.
 */
const CSV_COLUMNS = [
  "turn_index",
  "speaker",
  "content",
  "card_code",
  "card_name",
  "component_version",
  "word_count",
  "modal_epistemic",
  "modal_deontic",
  "modal_dynamic",
  "pronoun_first_person_singular",
  "pronoun_collective",
  "pronoun_depersonalized",
  "causal_connectives",
  "repair_false_starts",
  "hedging_softeners",
  "gate_findings",
  "no_fire_reason",
  "delivery_audience",
  "delivery_register",
] as const;

function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function runExportToCsv(exportData: RunExport): string {
  const lines = [CSV_COLUMNS.join(",")];

  for (const row of exportData.turns) {
    const m = row.markerCounts;
    const gateFindingsSummary = row.gateFindings
      .map((f) => `${f.cardCode} (${f.mode}: ${f.matched})`)
      .join("; ");

    lines.push(
      [
        row.turnIndex,
        row.speaker,
        csvCell(row.content),
        row.cardApplied?.cardCode ?? "",
        csvCell(row.cardApplied?.name ?? ""),
        row.cardApplied?.componentVersion ?? "",
        m?.wordCount ?? "",
        m?.modalVerbs.epistemic ?? "",
        m?.modalVerbs.deontic ?? "",
        m?.modalVerbs.dynamic ?? "",
        m?.pronouns.firstPersonSingular ?? "",
        m?.pronouns.collective ?? "",
        m?.pronouns.depersonalized ?? "",
        m?.causalConnectives ?? "",
        m?.repairFalseStarts ?? "",
        m?.hedgingSofteners ?? "",
        csvCell(gateFindingsSummary),
        row.selectionTrace?.noFire ?? "",
        row.deliveryAudience ?? "",
        row.deliveryRegister ?? "",
      ]
        .map((v) => (typeof v === "string" ? v : csvCell(v)))
        .join(","),
    );
  }

  return lines.join("\n");
}

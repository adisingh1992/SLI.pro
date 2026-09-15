/**
 * Per-persona, per-module coaching debrief — the export shape and its pure
 * assembly functions. Split out of `coaching-debrief.ts` for the same reason
 * every other pure/impure split in this harness exists (`run-export-format.ts`/
 * `test-run-export.ts`, `selection-trace.ts`/`trace-store.ts`): these functions
 * take a `RunExport`'s turns and compute over them with no database of their
 * own, but `coaching-debrief.ts` imports `buildRunExport`, which imports
 * `../db` at the top level — importing that file at all, even only for these
 * pure functions, pulls the database module into the graph and breaks any
 * caller (including this file's own test) that has no `DATABASE_URL` set.
 * Every type here comes from `import type`, erased before module resolution,
 * so this file needs no live database to exist at runtime.
 *
 * See `coaching-debrief.ts`'s own file header for what "withholding" and
 * "assessment" deliberately do and do not mean here — that reasoning lives
 * with `buildCoachingDebrief`, the function that actually assembles a debrief,
 * not with these pure pieces.
 */
import type { DiscrepancyFinding } from "../harness/discrepancy-report";
import type { RunExport } from "./run-export-format";
import type { PersonaRunSummary } from "./test-run-store";

const MARKER_CATEGORIES = [
  "modalVerbs.epistemic",
  "modalVerbs.deontic",
  "modalVerbs.dynamic",
  "pronouns.firstPersonSingular",
  "pronouns.collective",
  "pronouns.depersonalized",
  "causalConnectives",
  "repairFalseStarts",
  "hedgingSofteners",
] as const;

type MarkerCategory = (typeof MARKER_CATEGORIES)[number];

function readMarker(markers: RunExport["turns"][number]["markerCounts"], category: MarkerCategory): number {
  if (!markers) return 0;
  const [a, b] = category.split(".") as [string, string | undefined];
  if (b) return (markers as any)[a][b] as number;
  return (markers as any)[a] as number;
}

export type MarkerPattern = {
  category: MarkerCategory;
  firstTurnIndex: number;
  secondTurnIndex: number | null;
  turnsPresent: number;
  /** Seen in 2+ persona turns -- the threshold `AdherenceReport`'s own
   *  `lengthAdherence`/`adherent` fields use elsewhere in this harness for
   *  "more than a one-off." */
  thresholdMet: boolean;
};

/** First and second turn a deterministic marker category appears in, across
 *  this run's persona turns, in turn order. Categories that never appear are
 *  omitted -- an absent pattern is not a pattern with zero instances. */
export function findMarkerPatterns(turns: RunExport["turns"]): MarkerPattern[] {
  const patterns: MarkerPattern[] = [];
  for (const category of MARKER_CATEGORIES) {
    const presentTurns = turns
      .filter((t) => t.speaker === "persona" && readMarker(t.markerCounts, category) > 0)
      .map((t) => t.turnIndex);
    if (presentTurns.length === 0) continue;
    patterns.push({
      category,
      firstTurnIndex: presentTurns[0],
      secondTurnIndex: presentTurns.length > 1 ? presentTurns[1] : null,
      turnsPresent: presentTurns.length,
      thresholdMet: presentTurns.length >= 2,
    });
  }
  return patterns;
}

export type CardFiring = {
  turnIndex: number;
  cardCode: string;
  cardName: string;
  componentVersion: number | null;
  confidence: number | null;
  rationale: string | null;
};

/** Every turn a card won, with the detector's own confidence/rationale read
 *  back from the turn's selection trace -- not just the winner's identity,
 *  which `RunExportTurnRow.cardApplied` alone would give. */
export function collectCardFirings(turns: RunExport["turns"]): CardFiring[] {
  const out: CardFiring[] = [];
  for (const t of turns) {
    if (!t.cardApplied) continue;
    const won = t.selectionTrace?.cards.find(
      (c) => c.cardCode === t.cardApplied!.cardCode && c.outcome.state === "won",
    );
    const outcome = won?.outcome.state === "won" ? won.outcome : null;
    out.push({
      turnIndex: t.turnIndex,
      cardCode: t.cardApplied.cardCode,
      cardName: t.cardApplied.name,
      componentVersion: t.cardApplied.componentVersion,
      confidence: outcome?.confidence ?? null,
      rationale: outcome?.rationale ?? null,
    });
  }
  return out;
}

export type WithheldInstance = {
  turnIndex: number;
  cardCode: string;
  cardName: string;
  reason: string;
};

export function collectWithheld(turns: RunExport["turns"]): WithheldInstance[] {
  const out: WithheldInstance[] = [];
  for (const t of turns) {
    for (const c of t.selectionTrace?.cards ?? []) {
      if (c.outcome.state === "withheld") {
        out.push({ turnIndex: t.turnIndex, cardCode: c.cardCode, cardName: c.name, reason: c.outcome.reason });
      }
    }
  }
  return out;
}

export type ModuleComparison = {
  priorRunId: number;
  priorCheckpoint: string;
  /** Discrepancy types this module shares with the immediately preceding
   *  one -- present in both, so still unresolved. */
  recurring: DiscrepancyFinding["type"][];
  /** Discrepancy types the preceding module had that this one does not --
   *  a plain reading is "resolved," but see `limits`: this is a count
   *  comparison across two runs, not a causal claim about why. */
  noLongerPresent: DiscrepancyFinding["type"][];
  /** Discrepancy types new to this module. */
  newThisModule: DiscrepancyFinding["type"][];
};

export type CoachingDebrief = {
  runId: number;
  personaId: number;
  checkpoint: string;
  status: string;
  turnCount: number;
  /** Danielle's own declared vocabulary for this persona -- presented for a
   *  human to read next to the measured patterns below, not scored against
   *  them (same choice `persona-adherence.ts`'s `AdherenceReport` already
   *  makes, for the same reason: this text was never meant to be matched
   *  literally). */
  expectedMarkers: string[];
  measuredPatterns: MarkerPattern[];
  cardsFired: CardFiring[];
  withheld: WithheldInstance[];
  discrepancies: DiscrepancyFinding[];
  adherence: {
    adherent: boolean;
    lengthAdherence: number;
    brokeCharacter: boolean;
    notMeasured: { rule: string; reason: string }[];
  } | null;
  /** Every other run this persona has had, oldest first, for context. */
  allModules: PersonaRunSummary[];
  /** Set only when an earlier completed module exists for this persona. */
  comparedToPriorModule: ModuleComparison | null;
  /** What this debrief cannot honestly answer, named rather than guessed at
   *  -- see file header. Always includes the withholding-scope note; may
   *  include more (e.g. no prior module to compare against). */
  limits: string[];
};


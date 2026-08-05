/**
 * Objective rules — pure functions, zero imports.
 *
 * Dependency-free like turn-type.ts and engine-rules.ts, so CI can run these
 * without a database or a model. Their failure mode is a plausible prompt
 * rather than an error, which is exactly the kind of thing that reached
 * production repeatedly when methodology lived in template literals.
 *
 * ── WHY THERE IS NO BASE OBJECTIVE ───────────────────────────────────────
 * The first design had one base objective per beat plus per-population
 * overrides. Modelling Foundation Session 1 falsified it: **four of six
 * objectives were overridden by all three populations**, leaving a shared
 * spine of 1/6. A base that every population overrides is not a shared
 * definition — it is a placeholder that exists to be discarded, and it invites
 * the reader to believe in a commonality that is not there.
 *
 * What the data did support is that the *structure* is shared. All six beats
 * run in the same order for every population; one is universal; one is cleanly
 * inapplicable to undergraduates. So the beat, its purpose, its position and
 * the artifact fields it produces are shared — and each population states its
 * own intent, evidence bar and interventions.
 *
 * That keeps the property the whole design is for: because `key` and `purpose`
 * are shared, per-objective satisfaction rates remain comparable across
 * populations, and "undergraduates stall at validate_function_evidence three
 * times as often as mid-career" stays an answerable question.
 */

export type PopulationTag =
  | "undergraduate_or_recent_grad"
  | "early_career"
  | "mid_career_or_senior";

export const POPULATIONS: PopulationTag[] = [
  "undergraduate_or_recent_grad",
  "early_career",
  "mid_career_or_senior",
];

/** What one population actually does for this beat. */
export type ObjectiveContent = {
  /** One sentence, addressed to Wing. How this population pursues the beat. */
  intent: string;
  /** When this becomes live for this population. */
  entryCondition: string;
  /** The bar. What must appear in the transcript to satisfy it. */
  evidenceRequired: string;
  /** Heuristic card codes eligible while this objective is live. */
  interventions: string[];
  /** Why this population differs from the others. Reviewed, not enforced. */
  note?: string;
};

export type Objective = {
  /**
   * Stable identifier, shared across populations. This is what makes
   * cross-population measurement possible, so it must mean the same thing
   * everywhere even when the content differs completely.
   */
  key: string;
  /**
   * What this beat is for, population-independent.
   *
   * Not sent to the model — it is for humans reviewing the set and for
   * anyone reading a satisfaction-rate comparison and needing to know that
   * the three populations were being measured on the same question.
   */
  purpose: string;
  /** Session artifact fields this objective produces. Shared by definition. */
  artifactContribution: string[];
  /**
   * Per-population content. `null` means the beat does not apply to that
   * population at all — mid-career Session 1's sunk-cost beat has no
   * undergraduate analogue, because there is no legacy function to be anchored
   * to. Null rather than a flag, so an unwritten population cannot be mistaken
   * for a deliberate omission.
   */
  content: Record<PopulationTag, ObjectiveContent | null>;
};

/** An objective resolved for one population — what reaches a prompt. */
export type ResolvedObjective = ObjectiveContent & {
  key: string;
  purpose: string;
  artifactContribution: string[];
  /** False when this beat does not apply to this population. */
  applies: boolean;
};

/**
 * Resolves one objective for one population.
 *
 * Returns `applies: false` with empty content when the population has none,
 * rather than throwing or omitting — callers that render a progress view need
 * every beat present so the shape stays comparable.
 */
export function resolveObjective(
  objective: Objective,
  population: PopulationTag,
): ResolvedObjective {
  const c = objective.content[population];
  return {
    key: objective.key,
    purpose: objective.purpose,
    artifactContribution: objective.artifactContribution,
    intent: c?.intent ?? "",
    entryCondition: c?.entryCondition ?? "",
    evidenceRequired: c?.evidenceRequired ?? "",
    interventions: c?.interventions ?? [],
    note: c?.note,
    applies: c !== null && c !== undefined,
  };
}

/** The whole set, resolved for one population, in order. */
export function resolveForPopulation(
  objectives: readonly Objective[],
  population: PopulationTag,
): ResolvedObjective[] {
  return objectives.map((o) => resolveObjective(o, population));
}

/**
 * Which objective Wing should be pursuing now.
 *
 * Returns the first applicable, unsatisfied objective. Satisfaction is supplied
 * by the caller from evidence — not by counting turns, and not by assuming
 * objectives complete in order.
 *
 * Students routinely answer objective 4 while being asked about objective 2.
 * Wing must accept that, mark it satisfied and move on. If this forced
 * sequence, the design would produce something worse than the prompts it
 * replaces, and the failure would look like rigidity rather than like a bug.
 *
 * Inapplicable objectives are skipped, not deprioritised: they can never be
 * satisfied, so without the skip the session stalls on one permanently and
 * nothing raises an error.
 */
export function nextObjective<T extends { key: string; applies?: boolean }>(
  objectives: readonly T[],
  satisfiedKeys: readonly string[],
): T | null {
  const satisfied = new Set(satisfiedKeys);
  return (
    objectives.find((o) => o.applies !== false && !satisfied.has(o.key)) ?? null
  );
}

/**
 * Objectives a student may satisfy right now: everything applicable and still
 * open.
 *
 * Given to the analysis so an answer arriving early is credited rather than
 * missed, and so Wing does not re-ask something already answered.
 */
export function openObjectives<T extends { key: string; applies?: boolean }>(
  objectives: readonly T[],
  satisfiedKeys: readonly string[],
): T[] {
  const satisfied = new Set(satisfiedKeys);
  return objectives.filter((o) => o.applies !== false && !satisfied.has(o.key));
}

/**
 * Fraction of applicable objectives satisfied.
 *
 * The denominator excludes inapplicable beats, or an undergraduate would cap
 * at 5/6 forever and every progress display would be wrong for a whole
 * population.
 */
export function progress(
  objectives: readonly { key: string; applies?: boolean }[],
  satisfiedKeys: readonly string[],
): number {
  const applicable = objectives.filter((o) => o.applies !== false);
  if (!applicable.length) return 0;
  const satisfied = new Set(satisfiedKeys);
  return applicable.filter((o) => satisfied.has(o.key)).length / applicable.length;
}

/* ── Validation ─────────────────────────────────────────────────────────── */

export type ValidationIssue = { objectiveKey: string | null; message: string };

/**
 * Structural checks run before an objective set may be published.
 *
 * Every one corresponds to something that actually went wrong while
 * methodology lived in prose, and every one would otherwise reach students as
 * a subtly wrong prompt rather than as a failure.
 */
export function validateObjectiveSet(objectives: readonly Objective[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!objectives.length) {
    issues.push({ objectiveKey: null, message: "A session needs at least one objective" });
    return issues;
  }

  const seen = new Set<string>();
  for (const o of objectives) {
    if (!o.key?.trim()) {
      issues.push({ objectiveKey: null, message: "Every objective needs a key" });
      continue;
    }
    // Duplicate keys corrupt turn_objectives, where the key is how a turn is
    // attributed — two objectives sharing one would merge their measurements.
    if (seen.has(o.key)) {
      issues.push({ objectiveKey: o.key, message: `Duplicate objective key "${o.key}"` });
    }
    seen.add(o.key);

    if (!o.purpose?.trim()) {
      issues.push({
        objectiveKey: o.key,
        message:
          "Purpose is required — it is what makes this beat comparable across populations",
      });
    }

    // A population missing entirely is ambiguous: it could mean "does not
    // apply" or "nobody wrote it yet". Explicit null is required so the two
    // cannot be confused, which is precisely the ambiguity that let
    // undergraduate methodology drift unnoticed in the prompt files.
    for (const pop of POPULATIONS) {
      if (!(pop in o.content)) {
        issues.push({
          objectiveKey: o.key,
          message: `${pop} is missing — use null to mean "does not apply", never omission`,
        });
        continue;
      }
      const c = o.content[pop];
      if (c === null) continue;
      if (!c.intent?.trim()) {
        issues.push({ objectiveKey: o.key, message: `${pop}: intent is required` });
      }
      if (!c.evidenceRequired?.trim()) {
        issues.push({
          objectiveKey: o.key,
          message:
            `${pop}: evidence is required — without it the objective can never be ` +
            "satisfied and the session stalls on it forever",
        });
      }
    }

    // Every population inapplicable means the beat exists for nobody.
    if (POPULATIONS.every((p) => o.content[p] === null)) {
      issues.push({
        objectiveKey: o.key,
        message: "Applies to no population — delete it rather than carrying it",
      });
    }
  }

  return issues;
}

/**
 * How much of the set is genuinely common across populations.
 *
 * Reported by the seeder because it is the number that falsified the original
 * overlay design, and it should stay visible: if content converges over time
 * that is worth knowing, and if it diverges further that is worth knowing too.
 */
export function sharedContentRatio(objectives: readonly Objective[]): number {
  if (!objectives.length) return 0;
  const identical = objectives.filter((o) => {
    const written = POPULATIONS.map((p) => o.content[p]).filter(Boolean) as ObjectiveContent[];
    if (written.length < 2) return false;
    const first = JSON.stringify({
      intent: written[0].intent,
      entryCondition: written[0].entryCondition,
      evidenceRequired: written[0].evidenceRequired,
      interventions: written[0].interventions,
    });
    return written.every(
      (c) =>
        JSON.stringify({
          intent: c.intent,
          entryCondition: c.entryCondition,
          evidenceRequired: c.evidenceRequired,
          interventions: c.interventions,
        }) === first,
    );
  }).length;
  return identical / objectives.length;
}

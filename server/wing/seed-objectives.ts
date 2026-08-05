import "dotenv/config";
import { eq } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { objectiveSets } from "@shared/wing-schema";
import {
  POPULATIONS,
  resolveForPopulation,
  sharedContentRatio,
  validateObjectiveSet,
  type Objective,
} from "./objective-rules";

/**
 * Foundation Session 1 as an objective set.
 *
 * Run:  npm run wing:seed-objectives
 *       npm run wing:seed-objectives -- --dry-run
 *
 * Derived by reading all three population prompts rather than transcribing one
 * and assuming the others match. That reading produced the findings below, all
 * of which were invisible while the methodology lived in prose.
 *
 * Publishing does NOT change behaviour: the renderer is used only once a
 * session is switched over to it. This seeds the definition so it can be
 * reviewed against the prompts it will replace.
 *
 * ── WHY THERE IS NO BASE ─────────────────────────────────────────────────
 * The first version had a base objective per beat plus per-population
 * overrides. Modelling this session falsified it — four of six beats were
 * overridden by all three populations, a shared spine of 1/6. Making the base
 * population-neutral did not rescue it; it only stopped mid-career's zero
 * overrides from disguising the result.
 *
 * The structure held: six beats, same order, every population. So the beat,
 * its purpose and its artifact fields are shared, and each population states
 * its own content. Shared keys keep satisfaction rates comparable, which is
 * the property the whole design exists for.
 */

const DRY_RUN = process.argv.includes("--dry-run");

/*
 * ── FINDINGS FOR DANIELLE ────────────────────────────────────────────────
 * 1. Undergraduate Session 1 recognises SIX functions — the usual five plus
 *    "R&D / Technical". Mid-career and early-career recognise five, and
 *    mid-career's analysis schema enumerates exactly five, so an undergraduate
 *    who locks R&D produces a value the analysis cannot express.
 *
 * 2. Mid-career and undergraduate give opposite instructions on the opening.
 *    Mid-career: do NOT define the functions, challenge instead. Undergraduate:
 *    present the framework explicitly. Both defensible; neither was visible.
 *
 * 3. Mid-career's sunk-cost beat has no undergraduate analogue and is marked
 *    inapplicable rather than left unsatisfiable — otherwise the session would
 *    stall on it permanently with no error.
 */

const FOUNDATION_1: Objective[] = [
  {
    key: "surface_current_positioning",
    purpose:
      "Learn how the student currently describes their professional identity, before any " +
      "framework is imposed on it.",
    artifactContribution: ["linkedInCurrentState"],
    content: {
      mid_career_or_senior: {
        intent:
          "Ask directly which single function a board would hire them for. Do not define the " +
          "functions.",
        entryCondition: "From the opening turn.",
        evidenceRequired:
          "The student has stated a position, however hedged or title-based.",
        interventions: ["opening_challenge"],
        note:
          "Their prompts state explicitly that these users know the five functions and that " +
          "defining them is counterproductive — challenge positioning instead.",
      },
      early_career: {
        intent:
          "Frame why owning one function matters at this stage, then ask which one they are " +
          "building toward.",
        entryCondition: "From the opening turn.",
        evidenceRequired:
          "The student has named a direction or described how they currently position " +
          "themselves.",
        interventions: ["opening_frame"],
        note: "Opens with a rationale rather than a challenge — no entrenched position yet.",
      },
      undergraduate_or_recent_grad: {
        intent: "Present the functions framework, then ask where they think they fit.",
        entryCondition: "From the opening turn.",
        evidenceRequired:
          "The student has responded to the framework with an initial sense of fit, however " +
          "tentative.",
        interventions: ["opening_frame"],
        note:
          "FINDING 2 — the opposite instruction to mid-career, deliberately. Undergraduates do " +
          "not know the functions, so asking cold produces confusion rather than a position.",
      },
    },
  },
  {
    key: "narrow_to_single_function",
    purpose:
      "Move the student from several functions, a title or a seniority label to exactly one " +
      "primary function.",
    artifactContribution: ["primaryFunction"],
    content: {
      mid_career_or_senior: {
        intent: "Dismantle the multi-function claim and force a single choice.",
        entryCondition: "Once their positioning names more than one function, or none.",
        evidenceRequired:
          "ONE of Finance, Operations, Sales, Marketing or Product named as primary. " +
          "Leadership, strategy and general management are not functions.",
        interventions: ["multi_function_challenge", "anti_generalist", "resistance_patterns"],
        note:
          "Carries a scripted multi-function challenge and a resistance-pattern table the " +
          "other populations do not — these users arrive with a defended position.",
      },
      early_career: {
        intent: "Move them from industry, employer or job title to a function.",
        entryCondition: "Once their positioning names more than one function, or none.",
        evidenceRequired:
          "ONE of Finance, Operations, Sales, Marketing or Product named as primary.",
        interventions: ["multi_function_challenge", "anti_generalist", "special_case_flags"],
        note:
          "Adds dedicated handling for founders, concurrent grad students and career changers, " +
          "which neither other population has.",
      },
      undergraduate_or_recent_grad: {
        intent:
          "Help them pick the function that best fits how they naturally think and work.",
        entryCondition: "Once they have an initial sense of fit.",
        evidenceRequired:
          "ONE of Finance, Operations, Sales, Marketing, Product or R&D / Technical named as " +
          "the best current fit. A tentative commitment counts.",
        interventions: ["anti_generalist"],
        note:
          "FINDING 1 — the sixth function, R&D / Technical, exists only here and is absent " +
          "from the analysis schema. The confrontational challenge is also dropped: it reads " +
          "as hostile to someone with no track record to defend.",
      },
    },
  },
  {
    key: "validate_function_evidence",
    purpose:
      "Test the claimed function against how the student actually creates value, at a standard " +
      "of proof appropriate to their stage.",
    artifactContribution: ["confidence", "keyInsights"],
    content: {
      mid_career_or_senior: {
        intent: "Apply the budget-bet test for the claimed function.",
        entryCondition: "Once a single function is named.",
        evidenceRequired:
          "A mechanism of value creation owned rather than assisted, that the relevant " +
          "executive would stake budget on.",
        interventions: ["function_validation_tests"],
      },
      early_career: {
        intent: "Separate what they personally drove from what their team or employer did.",
        entryCondition: "Once a single function is named.",
        evidenceRequired:
          "A mechanism of value creation they personally drove, distinguishable from employer " +
          "brand or team effort.",
        interventions: ["function_validation_tests"],
        note: "Work is real but team-embedded, so the test is attribution, not ownership.",
      },
      undergraduate_or_recent_grad: {
        intent: "Find a concrete instance of the function in what they have actually done.",
        entryCondition: "Once a function is named as the best fit.",
        evidenceRequired:
          "A concrete instance from coursework, a project, a club or an internship. " +
          "Employment is not required.",
        interventions: ["function_validation_tests"],
        note:
          "Requiring workplace evidence produces failure regardless of actual fit, because the " +
          "evidence cannot exist yet.",
      },
    },
  },
  {
    key: "resolve_function_shift",
    purpose:
      "Establish whether the function the student is known for is still the one they create " +
      "the most value in.",
    artifactContribution: ["functionShifted"],
    content: {
      mid_career_or_senior: {
        intent: "Surface sunk cost and name the shift if there is one.",
        entryCondition: "Once a function is claimed and there is history for the two to diverge.",
        evidenceRequired:
          "The student has explicitly addressed whether their function has shifted, and either " +
          "confirmed continuity or named the shift.",
        interventions: ["sunk_cost_resistance"],
        note:
          "Sunk cost is the documented primary obstacle at this stage, so the harder " +
          "confrontation is warranted.",
      },
      early_career: {
        intent: "Check whether their trajectory is drifting from the function they claim.",
        entryCondition: "Once a function is claimed.",
        evidenceRequired:
          "The student has addressed whether their direction matches the function claimed.",
        interventions: ["sunk_cost_resistance"],
        note: "Drift is possible but not entrenched — the question is direction, not sunk cost.",
      },
      // FINDING 3 — no legacy function exists to be anchored to, and the
      // undergraduate prompts have no sunk-cost section at all.
      undergraduate_or_recent_grad: null,
    },
  },
  {
    key: "lock_primary_and_split",
    purpose: "Obtain an explicit commitment to one primary function.",
    artifactContribution: ["primaryFunction", "secondaryFunction", "functionalSplit"],
    content: {
      mid_career_or_senior: {
        intent: "Force an explicit 80/20 statement.",
        entryCondition: "Once the function is validated against evidence.",
        evidenceRequired:
          "An explicit 80/20 statement: one primary function, optionally one secondary.",
        interventions: ["anti_generalist"],
        note: "The numeric split is what the artifact's functionalSplit field expects.",
      },
      early_career: {
        intent: "Get a clear primary commitment, with a secondary only if volunteered.",
        entryCondition: "Once the function is validated against evidence.",
        evidenceRequired:
          "An explicit commitment naming one primary function. 'I do everything' does not count.",
        interventions: ["anti_generalist"],
      },
      undergraduate_or_recent_grad: {
        intent: "Get a direction they are willing to explore, framed as opening doors.",
        entryCondition: "Once a concrete instance of the function has been found.",
        evidenceRequired:
          "A stated primary direction they are willing to explore further. A hard percentage " +
          "split is not required.",
        interventions: [],
        note:
          "The documented psychology is fear that committing closes doors. Demanding a numeric " +
          "split triggers exactly that fear.",
      },
    },
  },
  {
    key: "confirm_and_acknowledge",
    purpose:
      "Close the loop: state the conclusion back and get the student's explicit agreement.",
    artifactContribution: ["reasoning", "commitmentStatement"],
    content: {
      mid_career_or_senior: {
        intent: "State the conclusion declaratively and get explicit agreement.",
        entryCondition: "Once a primary function is locked.",
        evidenceRequired:
          "Wing has stated the conclusion as a declarative sentence and the student has " +
          "responded affirmatively. Silence or a change of subject does not count.",
        interventions: ["breakthrough_confirmation"],
      },
      early_career: {
        intent: "State the conclusion declaratively and get explicit agreement.",
        entryCondition: "Once a primary function is locked.",
        evidenceRequired:
          "Wing has stated the conclusion as a declarative sentence and the student has " +
          "responded affirmatively. Silence or a change of subject does not count.",
        interventions: ["breakthrough_confirmation"],
      },
      undergraduate_or_recent_grad: {
        intent: "State the conclusion declaratively and get explicit agreement.",
        entryCondition: "Once a primary direction is stated.",
        evidenceRequired:
          "Wing has stated the conclusion as a declarative sentence and the student has " +
          "responded affirmatively. Silence or a change of subject does not count.",
        interventions: ["breakthrough_confirmation"],
      },
    },
  },
];

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  ({ db, pool } = await initScript());
  console.log(`\n[objectives] Foundation Session 1${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  const issues = validateObjectiveSet(FOUNDATION_1);
  if (issues.length) {
    console.error("[objectives] ABORT — the set does not validate:");
    for (const i of issues) console.error(`    ${i.objectiveKey ?? "(set)"}: ${i.message}`);
    await pool.end();
    process.exit(1);
  }

  console.log(`  ${FOUNDATION_1.length} objectives, validates clean\n`);

  // Printed per objective so the structure is visible as a column. `--`
  // marks a beat that does not apply to that population.
  console.log("  objective                          UG   EC   MC");
  console.log("  " + "-".repeat(48));
  for (const o of FOUNDATION_1) {
    const cells = POPULATIONS.map((p) => (o.content[p] ? "  ✓ " : "  --"));
    console.log(`  ${o.key.padEnd(34)}${cells.join(" ")}`);
  }

  console.log("");
  for (const pop of POPULATIONS) {
    const applicable = resolveForPopulation(FOUNDATION_1, pop).filter((o) => o.applies).length;
    console.log(`  ${pop.padEnd(30)} ${applicable}/${FOUNDATION_1.length} beats apply`);
  }

  const shared = sharedContentRatio(FOUNDATION_1);
  console.log(
    `\n  Shared content:    ${Math.round(shared * 100)}% of beats identical across all populations\n` +
      `  Shared structure:  ${FOUNDATION_1.length}/${FOUNDATION_1.length} beats, same order, every population\n`,
  );

  /*
   * The shared-content figure is the one that falsified the original design,
   * so it is worth reading carefully rather than glancing at.
   *
   *   overlay model, mid-career as base   1/6 shared  (and mid-career showed
   *                                                    zero overrides, which
   *                                                    was an artefact)
   *   overlay model, neutral base         1/6 shared
   *   per-population content              0/6 shared
   *
   * It fell to zero on the last step because writing each population's content
   * out in full forced a difference the overlay had hidden by inheritance:
   * undergraduates lock a *direction*, not a *function*, so the closing beat's
   * entry condition genuinely differs for them. Under the overlay that beat
   * looked universal only because nobody had written undergraduate's version.
   *
   * So: there is no beat whose content is the same for all three populations.
   * The shared thing is the six beats and their order — which is exactly what
   * per-objective measurement needs, and nothing more.
   */
  if (shared === 0) {
    console.log(
      `  No beat has identical content across all three populations. That is a real\n` +
        `  result, not a gap: the shared asset here is the structure, and the six keys\n` +
        `  are what keep satisfaction rates comparable between populations.\n`,
    );
  }

  const [existing] = await db
    .select({ id: objectiveSets.id })
    .from(objectiveSets)
    .where(eq(objectiveSets.sessionType, "foundation_1" as any))
    .limit(1);

  if (existing) {
    console.log("[objectives] foundation_1 already has a set — skipped.\n");
    await pool.end();
    return;
  }

  if (DRY_RUN) {
    console.log("[objectives] (dry run — nothing was written)\n");
    await pool.end();
    return;
  }

  await db.insert(objectiveSets).values({
    sessionType: "foundation_1" as any,
    versionNumber: 1,
    status: "published",
    objectives: FOUNDATION_1 as any,
    changeNote:
      "Session 1 modelled as objectives, derived by reading all three population prompts. " +
      "Shared structure, per-population content. Publishing does not change behaviour — the " +
      "renderer is used only once the session is switched over to it.",
    publishedAt: new Date(),
  });

  console.log("[objectives] published foundation_1 v1.\n");
  await pool.end();
}

main().catch((err) => {
  console.error("[objectives] failed:", err);
  process.exit(1);
});

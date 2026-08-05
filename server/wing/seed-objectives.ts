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

/*
 * ── SESSION 2: CREDIBILITY EVIDENCE ──────────────────────────────────────
 * A different shape from Session 1, which is the point of modelling it second.
 * Session 1 was six beats with one inapplicable to one population. This is
 * SEVEN beats with two inapplicable to TWO populations — so the beat model
 * generalises, but "six beats, one exception" was a fact about Session 1
 * rather than about sessions.
 *
 * The two mid-career-only beats are visible in the criteria and nowhere else:
 * cross-context repeatability and decision frameworks appear in mid-career's
 * list and in neither other population's. Early-career and undergraduate stop
 * at "claims, personally driven, at least one metric".
 *
 * `articulate_decision_frameworks` is also the beat behind the original
 * complaint weeks ago — mid-career Session 2 stalling. As prose it was one
 * line among six; as a beat it gets its own satisfaction rate.
 */
const FOUNDATION_2: Objective[] = [
  {
    key: "anchor_to_locked_function",
    purpose:
      "Re-establish the function locked in Session 1 and frame this session as proving it.",
    artifactContribution: ["lockedFunction"],
    content: {
      mid_career_or_senior: {
        intent:
          "Name the locked function and open with the investor frame: what have they done in " +
          "it that someone would bet money on.",
        entryCondition: "From the opening turn.",
        evidenceRequired:
          "The locked function has been named and the student has engaged with the question " +
          "rather than deflecting to a different function.",
        interventions: ["opening_challenge"],
        note: "Their opening is explicitly an ROI framing — a VC gives zero consideration to passion.",
      },
      early_career: {
        intent: "Name the locked function and ask what they have actually done in it.",
        entryCondition: "From the opening turn.",
        evidenceRequired:
          "The locked function has been named and the student has begun offering examples.",
        interventions: ["opening_frame"],
      },
      undergraduate_or_recent_grad: {
        intent: "Name the locked function and ask what they have done that shows it.",
        entryCondition: "From the opening turn.",
        evidenceRequired:
          "The locked function has been named and the student has begun offering examples.",
        interventions: ["opening_frame"],
      },
    },
  },
  {
    key: "surface_candidate_claims",
    purpose: "Get the student to name specific things they have done in the locked function.",
    artifactContribution: ["credibilityClaims"],
    content: {
      mid_career_or_senior: {
        intent: "Draw out candidate claims without accepting the first vague one.",
        entryCondition: "Once the function is anchored.",
        evidenceRequired:
          "At least three distinct candidate claims within the locked function have been named.",
        interventions: ["specificity_ladder"],
        note: "The MC standard is 3–4 locked claims, so more candidates than that are needed.",
      },
      early_career: {
        intent: "Draw out candidate claims from real work, however early-stage.",
        entryCondition: "Once the function is anchored.",
        evidenceRequired:
          "At least two distinct candidate claims within the locked function have been named.",
        interventions: ["specificity_ladder"],
      },
      undergraduate_or_recent_grad: {
        intent:
          "Draw out candidate claims from coursework, projects, clubs or internships.",
        entryCondition: "Once the function is anchored.",
        evidenceRequired:
          "At least two distinct candidate claims within the locked function have been named.",
        interventions: ["specificity_ladder"],
      },
    },
  },
  {
    key: "separate_aspiration_from_achievement",
    purpose:
      "Reject what the student wants to do, or oversaw, in favour of what they actually did.",
    artifactContribution: ["keyInsights"],
    content: {
      mid_career_or_senior: {
        intent:
          "Name the aspiration/achievement gap fast when it appears — 'I managed teams that', " +
          "'I oversaw the initiative'.",
        entryCondition: "The moment a claim is aspirational or ownership is vague.",
        evidenceRequired:
          "Every surviving claim describes something the student personally did, not something " +
          "they wanted, supervised or were adjacent to.",
        interventions: ["resistance_patterns", "specificity_ladder"],
      },
      early_career: {
        intent: "Separate what they personally drove from what their team or employer did.",
        entryCondition: "The moment a claim leans on employer brand or team effort.",
        evidenceRequired:
          "Every surviving claim references a business outcome the student personally drove.",
        interventions: ["resistance_patterns"],
      },
      undergraduate_or_recent_grad: {
        intent: "Separate what they actually did from what they hope to do.",
        entryCondition: "The moment a claim is aspirational.",
        evidenceRequired:
          "Every surviving claim references something the student actually did.",
        interventions: ["resistance_patterns"],
      },
    },
  },
  {
    key: "quantify_outcomes",
    purpose: "Attach a measurable or observable outcome to the claims.",
    artifactContribution: ["quantifiedClaims", "credibilityTier"],
    content: {
      mid_career_or_senior: {
        intent:
          "Escalate each surviving claim to a Tier 1 or Tier 2 outcome — money saved, revenue " +
          "grown, percentage improved.",
        entryCondition: "Once claims are real rather than aspirational.",
        evidenceRequired:
          "3–4 claims carry a quantified business outcome, at Tier 1 or Tier 2 evidence.",
        interventions: ["specificity_ladder", "credibility_litmus_tests"],
      },
      early_career: {
        intent: "Get a metric onto at least one claim.",
        entryCondition: "Once claims are real rather than aspirational.",
        evidenceRequired: "At least one claim includes a measurable metric.",
        interventions: ["specificity_ladder"],
      },
      undergraduate_or_recent_grad: {
        intent: "Get a measurable or observable outcome onto at least one claim.",
        entryCondition: "Once claims are real rather than aspirational.",
        evidenceRequired:
          "At least one claim has a measurable or observable outcome. A number is not required " +
          "if the outcome is concrete.",
        interventions: ["specificity_ladder"],
      },
    },
  },
  {
    key: "establish_cross_context",
    purpose:
      "Show the result was repeatable rather than a single lucky outcome.",
    artifactContribution: ["crossContextEvidence"],
    content: {
      mid_career_or_senior: {
        intent:
          "Push for the same result across companies or materially different scenarios.",
        entryCondition: "Once at least one claim is quantified.",
        evidenceRequired:
          "Measurable impact is demonstrated in more than one company, team or materially " +
          "different scenario.",
        interventions: ["credibility_litmus_tests"],
      },
      // Cross-context repeatability appears in mid-career's criteria and in
      // neither other population's — a few years or a degree does not provide
      // two companies to repeat a result across.
      early_career: null,
      undergraduate_or_recent_grad: null,
    },
  },
  {
    key: "articulate_decision_frameworks",
    purpose:
      "Surface the judgement behind the results — why this approach, when, and when not.",
    artifactContribution: ["decisionFrameworks"],
    content: {
      mid_career_or_senior: {
        intent:
          "Get them to state a principled stance: when they use one approach over another, and why.",
        entryCondition: "Once claims are quantified and repeatable.",
        evidenceRequired:
          "The student has expressed a clear opinion or decision framework — not just what " +
          "happened, but the judgement that produced it.",
        interventions: ["credibility_litmus_tests"],
        note:
          "This is the beat behind the original mid-career Session 2 stall. As one line among " +
          "six criteria it was invisible; as a beat it has its own satisfaction rate.",
      },
      // Not in either other population's criteria. Decision frameworks require
      // enough repetitions to have formed a view.
      early_career: null,
      undergraduate_or_recent_grad: null,
    },
  },
  {
    key: "close_credibility_statement",
    purpose: "State the established credibility back and close the session.",
    artifactContribution: ["reasoning", "credibilityStatement"],
    content: {
      mid_career_or_senior: {
        intent:
          "State the case as an investor or hiring manager would hear it, and confirm it lands.",
        entryCondition: "Once the claims are quantified and the frameworks are stated.",
        evidenceRequired:
          "The conversation has established check-worthy credibility for an investor or hiring " +
          "manager, stated back to the student.",
        interventions: ["breakthrough_confirmation"],
      },
      early_career: {
        intent: "Deliver the closing line summarising the claims.",
        entryCondition: "Once at least two claims are locked with a metric.",
        evidenceRequired: "The coach has delivered the closing line.",
        interventions: ["closing_move"],
      },
      undergraduate_or_recent_grad: {
        intent:
          "Deliver the closing line, framed so a recruiter would have reason to engage.",
        entryCondition: "Once at least two claims are locked.",
        evidenceRequired:
          "The coach has delivered the closing line, and the conversation establishes that a " +
          "recruiter would have reason to engage with this candidate.",
        interventions: ["closing_move"],
      },
    },
  },
];

/*
 * ── SESSION 3: SIGNATURE STORY ───────────────────────────────────────────
 * A third shape. Eight beats, and the inapplicability is spread differently
 * again — three beats absent for undergraduates, one mid-career only.
 *
 *   Session 1   6 beats · 1 absent for 1 population
 *   Session 2   7 beats · 2 absent for 2 populations
 *   Session 3   8 beats · 3 absent for UG, 1 for MC only
 *
 * The undergraduate story bar is visibly lower and it is stated in their own
 * criteria: they require "specific context, personal agency, observable
 * outcome, and differentiation" — four elements. Mid-career and early-career
 * require five, the fifth being struggle. So `probe_struggle` and
 * `articulate_methodology` are genuinely absent for undergraduates rather than
 * merely softened, which is why they are null rather than reworded.
 */
const FOUNDATION_3: Objective[] = [
  {
    key: "excavate_stories",
    purpose: "Draw out candidate stories that do not already appear on the resume.",
    artifactContribution: ["stories"],
    content: {
      mid_career_or_senior: {
        intent:
          "Ask for the outcome they are proudest of that the resume does not capture, and for " +
          "what they figured out that was in no playbook.",
        entryCondition: "From the opening turn.",
        evidenceRequired: "At least two candidate stories have been offered in outline.",
        interventions: ["story_excavation"],
      },
      early_career: {
        intent: "Draw out stories from real work, however early.",
        entryCondition: "From the opening turn.",
        evidenceRequired: "At least two candidate stories have been offered in outline.",
        interventions: ["story_excavation"],
      },
      undergraduate_or_recent_grad: {
        intent: "Draw out stories from coursework, projects, clubs or internships.",
        entryCondition: "From the opening turn.",
        evidenceRequired: "At least two candidate stories have been offered in outline.",
        interventions: ["story_excavation"],
      },
    },
  },
  {
    key: "establish_agency_and_outcome",
    purpose: "Establish what the student personally did, and what came of it.",
    artifactContribution: ["personalAgency", "quantifiedOutcomes"],
    content: {
      mid_career_or_senior: {
        intent: "Separate their action from the team's, and attach a quantified outcome.",
        entryCondition: "Once candidate stories exist.",
        evidenceRequired:
          "Each story states what the student personally did and carries a quantified outcome.",
        interventions: ["story_quality_gatekeepers"],
      },
      early_career: {
        intent: "Separate their action from the team's, and attach an outcome.",
        entryCondition: "Once candidate stories exist.",
        evidenceRequired:
          "Each story states what the student personally did and carries an outcome.",
        interventions: ["story_quality_check"],
      },
      undergraduate_or_recent_grad: {
        intent: "Establish specific context, what they did, and what was observable as a result.",
        entryCondition: "Once candidate stories exist.",
        evidenceRequired:
          "Each story has specific context, personal agency and an observable outcome.",
        interventions: ["story_quality_check"],
      },
    },
  },
  {
    key: "probe_struggle",
    purpose: "Surface the tension or near-failure that makes a story more than a resume bullet.",
    artifactContribution: ["struggle"],
    content: {
      mid_career_or_senior: {
        intent: "Ask what nearly broke, and where it almost failed.",
        entryCondition: "Once a story has agency and an outcome.",
        evidenceRequired: "Each story demonstrates struggle or tension, not just success.",
        interventions: ["struggle_probe"],
        note: "Their prompt marks this mandatory — without struggle it is just a resume bullet.",
      },
      early_career: {
        intent: "Ask what was hard about it.",
        entryCondition: "Once a story has agency and an outcome.",
        evidenceRequired: "Each story demonstrates struggle or tension.",
        interventions: ["struggle_probe"],
      },
      // Undergraduate criteria require four story elements — context, agency,
      // observable outcome, differentiation. Struggle is not among them.
      undergraduate_or_recent_grad: null,
    },
  },
  {
    key: "articulate_methodology",
    purpose: "Surface the non-obvious thinking — why they did it that way and not the usual way.",
    artifactContribution: ["methodology"],
    content: {
      mid_career_or_senior: {
        intent:
          "Ask where their approach differed from what most people in their function would have done.",
        entryCondition: "Once struggle has been surfaced.",
        evidenceRequired:
          "Each story articulates a methodology or a piece of non-obvious thinking.",
        interventions: ["methodology_probe"],
      },
      early_career: {
        intent: "Ask what they worked out that was not obvious.",
        entryCondition: "Once struggle has been surfaced.",
        evidenceRequired: "Each story articulates how they approached it, not just what happened.",
        interventions: ["methodology_probe"],
      },
      // Not in the undergraduate four-element bar.
      undergraduate_or_recent_grad: null,
    },
  },
  {
    key: "derive_positioning_assets",
    purpose: "Turn the stories into the positioning language the student will actually use.",
    artifactContribution: ["sliClaim", "linkedinHeadline", "aboutSection"],
    content: {
      mid_career_or_senior: {
        intent: "Derive the SLI claim, LinkedIn headline and About section from the stories.",
        entryCondition: "Once at least two stories meet the quality bar.",
        evidenceRequired:
          "An SLI claim, a LinkedIn headline and an About section are derivable from what the " +
          "stories established.",
        interventions: ["story_quality_gatekeepers"],
      },
      early_career: {
        intent:
          "Produce a positioning sentence, a headline draft, and rewrite experience bullets.",
        entryCondition: "Once at least two stories meet the quality bar.",
        evidenceRequired:
          "A positioning direction sentence, a LinkedIn headline draft, and at least two " +
          "experience bullet rewrites have been produced.",
        interventions: ["story_quality_gatekeepers"],
        note: "Bullet rewrites appear only in early-career's criteria.",
      },
      undergraduate_or_recent_grad: {
        intent: "Produce a positioning sentence and a headline draft.",
        entryCondition: "Once at least two stories meet the quality bar.",
        evidenceRequired:
          "A positioning direction sentence and a LinkedIn headline draft have been produced.",
        interventions: ["story_quality_check"],
      },
    },
  },
  {
    key: "extract_content_direction",
    purpose: "Turn the stories into a content plan the student can act on.",
    artifactContribution: ["contentDirection"],
    content: {
      mid_career_or_senior: {
        intent: "Extract a 70/20/10 content direction from the story material.",
        entryCondition: "Once positioning assets exist.",
        evidenceRequired: "A 70/20/10 content direction is extractable from the stories.",
        interventions: ["content_ideation_from_stories"],
      },
      early_career: {
        intent: "Extract a 70/20/10 content direction with specific angles.",
        entryCondition: "Once positioning assets exist.",
        evidenceRequired: "A 70/20/10 content direction with specific angles is articulated.",
        interventions: ["content_ideation_from_stories"],
      },
      // Absent from undergraduate criteria — content strategy is Module A
      // territory for them rather than a Session 3 deliverable.
      undergraduate_or_recent_grad: null,
    },
  },
  {
    key: "project_trajectory",
    purpose: "Identify where this positioning points over the next stage of their career.",
    artifactContribution: ["trajectory"],
    content: {
      mid_career_or_senior: {
        intent: "Project the C-suite or executive trajectory the stories support.",
        entryCondition: "Once positioning and content direction exist.",
        evidenceRequired: "A C-suite or executive trajectory is identifiable from the material.",
        interventions: ["c_suite_trajectory_projection"],
      },
      early_career: null,
      undergraduate_or_recent_grad: null,
    },
  },
  {
    key: "close_declaratively",
    purpose: "Close with a declarative statement the student explicitly acknowledges.",
    artifactContribution: ["reasoning", "closingStatement"],
    content: {
      mid_career_or_senior: {
        intent: "State the positioning back as a conclusion, not a question.",
        entryCondition: "Once the trajectory is established.",
        evidenceRequired:
          "The session closes with a declarative statement and the student has acknowledged it.",
        interventions: ["breakthrough_confirmation"],
      },
      early_career: {
        intent: "Deliver the declarative close covering all six required elements.",
        entryCondition: "Once positioning assets and content direction exist.",
        evidenceRequired:
          "The session closes with a declarative statement covering all six required elements, " +
          "and the professional has acknowledged the closing.",
        interventions: ["closing_move"],
      },
      undergraduate_or_recent_grad: {
        intent: "Deliver the declarative close covering all five required elements.",
        entryCondition: "Once positioning assets exist.",
        evidenceRequired:
          "The session closes with a declarative statement covering all five required elements, " +
          "and the student has acknowledged the closing.",
        interventions: ["closing_move"],
      },
    },
  },
];

/**
 * Everything this script knows how to seed.
 *
 * ── WHY THE ENHANCEMENT MODULES ARE ABSENT ───────────────────────────────
 * They were examined and deliberately left out. Their criteria are deliverable
 * checklists, not conversational beats:
 *
 *   Module A  11 items — profile evaluated, buzzword audit done, 2 Featured
 *             article concepts developed, 30/60/90 milestones set …
 *   Module B   6 items — pruning logic applied, ≥3 Tier-1 targets identified,
 *             outreach templates defined …
 *   Module C  10 items — backwards narrative, tier classification, gap
 *             analysis, 3 stepping stones, alignment statement …
 *
 * Modelling those as objectives produces a 1:1 restatement of the completion
 * criteria: for each item, "how to pursue it" and "what counts as done" are the
 * same sentence. That is not a beat structure — it is a production checklist,
 * and duplicating it into a second table would recreate precisely the
 * two-sources-of-truth problem this work removed from the analysis prompts.
 *
 * A session is a conversation with beats; a module is a production run. The
 * objective layer earns its place where "which beat is this turn pursuing?" has
 * a meaningful answer, and for a module the answer is only ever "producing
 * deliverable N".
 */
const SETS: Array<{ sessionType: string; label: string; objectives: Objective[] }> = [
  { sessionType: "foundation_1", label: "Foundation Session 1", objectives: FOUNDATION_1 },
  { sessionType: "foundation_2", label: "Foundation Session 2", objectives: FOUNDATION_2 },
  { sessionType: "foundation_3", label: "Foundation Session 3", objectives: FOUNDATION_3 },
];

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function seedOne(set: (typeof SETS)[number]) {
  console.log(`\n[objectives] ${set.label}${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  const FOUNDATION_1 = set.objectives; // local alias; the body below is generic
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
   * Beat count and inapplicability are NOT constant across sessions, which is
   * the finding from modelling a second one:
   *
   *   Session 1   6 beats, 1 inapplicable to 1 population (undergraduate)
   *   Session 2   7 beats, 2 inapplicable to 2 populations
   *
   * So the beat model generalises, but "six beats with one exception" was a
   * fact about Session 1 rather than about sessions. Anyone modelling Session 3
   * should expect a third shape and not try to force this one onto it.
   */

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
        `  result, not a gap: the shared asset is the structure, and the ${FOUNDATION_1.length} keys are\n` +
        `  what keep satisfaction rates comparable between populations.\n`,
    );
  }

  const [existing] = await db
    .select({ id: objectiveSets.id })
    .from(objectiveSets)
    .where(eq(objectiveSets.sessionType, set.sessionType as any))
    .limit(1);

  if (existing) {
    console.log(`[objectives] ${set.sessionType} already has a set — skipped.\n`);
    return;
  }

  if (DRY_RUN) {
    console.log("[objectives] (dry run — nothing was written)\n");
    return;
  }

  await db.insert(objectiveSets).values({
    sessionType: set.sessionType as any,
    versionNumber: 1,
    status: "published",
    objectives: FOUNDATION_1 as any,
    changeNote:
      `${set.label} modelled as objectives, derived by reading all three population prompts. ` +
      "Shared structure, per-population content. Publishing does not change behaviour — the " +
      "renderer is used only once the session is switched over to it.",
    publishedAt: new Date(),
  });

  console.log(`[objectives] published ${set.sessionType} v1.\n`);
}

async function main() {
  ({ db, pool } = await initScript());

  // One set may be requested; otherwise all known sets are seeded.
  const only = process.argv.includes("--session")
    ? process.argv[process.argv.indexOf("--session") + 1]
    : null;

  const targets = only ? SETS.filter((s) => s.sessionType === only) : SETS;
  if (!targets.length) {
    console.error(`Unknown session "${only}". One of: ${SETS.map((s) => s.sessionType).join(", ")}`);
    await pool.end();
    process.exit(1);
  }

  // Validation aborts the whole run before anything is written, so a broken
  // set cannot be published just because it happened to come first.
  for (const set of targets) {
    const issues = validateObjectiveSet(set.objectives);
    if (issues.length) {
      console.error(`\n[objectives] ABORT — ${set.sessionType} does not validate:`);
      for (const i of issues) console.error(`    ${i.objectiveKey ?? "(set)"}: ${i.message}`);
      await pool.end();
      process.exit(1);
    }
  }

  for (const set of targets) await seedOne(set);

  await pool.end();
}

main().catch((err) => {
  console.error("[objectives] failed:", err);
  process.exit(1);
});

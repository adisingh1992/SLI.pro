import {
  nextObjective,
  openObjectives,
  progress,
  type ResolvedObjective,
} from "./objective-rules";

/**
 * Assembles the conversation prompt from parts.
 *
 * THE POINT OF THIS FILE
 * The prompt stops being a 22,000-character document that people edit and
 * becomes a build product. That removes, by construction, the entire class of
 * failure this codebase has been fighting:
 *
 *   · Criteria cannot be duplicated into prose, because the criteria block is
 *     assembled here rather than typed. Five of nine analysis prompts used to
 *     state their criteria twice, disagreeing.
 *   · An editor cannot delete `${ctx.completionCriteria}`, because there is no
 *     interpolation to delete — a hazard that was live in every
 *     CRITICAL COMPLETION INSTRUCTION section.
 *   · Extractors stop existing. Four were written against the old files and
 *     four were silently wrong.
 *
 * It should also produce better conversations, not merely more maintainable
 * ones. A model given one clear objective and the handful of interventions
 * relevant to it behaves better than the same model given forty rules covering
 * every eventuality, thirty-nine of which do not apply to this turn.
 *
 * WHAT THIS FILE DOES NOT DO
 * It does not decide when an objective is satisfied — that is evidence, judged
 * elsewhere and passed in as `satisfied`. Keeping assembly separate from
 * judgement is what makes each testable.
 */

export type RenderContext = {
  /** Voice and stance. Prose on purpose: it does not decompose into fields. */
  identity: string;
  sessionTitle: string;
  /** Objectives resolved for this student's population, in order. */
  objectives: ResolvedObjective[];
  /** Keys already satisfied, from evidence. */
  satisfied: string[];
  /** Rendered heuristic card text, keyed by card code. */
  interventionText: Record<string, string>;
  /** Resume, questionnaire, prior sessions — already-formatted blocks. */
  studentContext: string;
  /** Rendered from session_completion_criteria. The single source. */
  completionCriteria?: string;
};

export type RenderedPrompt = {
  prompt: string;
  /** The objective this turn is pursuing, for turn_objectives attribution. */
  currentObjectiveKey: string | null;
  progress: number;
};

function block(title: string, body: string): string {
  return body.trim() ? `## ${title}\n${body.trim()}\n` : "";
}

/**
 * Renders the objective the conversation is currently on, plus what else is
 * still open.
 *
 * Open objectives are listed — not just the current one — because students
 * routinely answer objective 4 while being asked about objective 2. Wing needs
 * to recognise that and credit it rather than re-asking. Showing only the
 * current objective is the mistake that would make this design feel rigid, and
 * rigidity is how a state machine ruins a coaching conversation.
 */
function renderFocus(
  current: ResolvedObjective | null,
  open: ResolvedObjective[],
): string {
  if (!current) {
    return (
      "Every objective for this session has been met. Do not open new ground. " +
      "Consolidate what the student has established and close cleanly."
    );
  }

  const others = open.filter((o) => o.key !== current.key);

  return [
    `**Right now:** ${current.intent}`,
    ``,
    `Evidence you are listening for: ${current.evidenceRequired}`,
    others.length
      ? `\nStill open, and worth crediting if the student gets there on their own — ` +
        `do not re-ask something they have already answered:\n` +
        others.map((o) => `- ${o.intent}`).join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function renderInterventions(
  current: ResolvedObjective | null,
  text: Record<string, string>,
): string {
  if (!current?.interventions.length) return "";
  const available = current.interventions
    .map((code) => text[code])
    .filter(Boolean);
  if (!available.length) return "";

  return (
    "These are available to you for the objective above. Use one when it fits; " +
    "none of them is a script, and applying one that does not fit the moment is " +
    "worse than applying none.\n\n" +
    available.map((t) => `- ${t}`).join("\n")
  );
}

export function renderConversationPrompt(ctx: RenderContext): RenderedPrompt {
  const current = nextObjective(ctx.objectives, ctx.satisfied);
  const open = openObjectives(ctx.objectives, ctx.satisfied);

  const prompt = [
    ctx.identity.trim(),
    "",
    `# ${ctx.sessionTitle}`,
    "",
    block("Focus", renderFocus(current, open)),
    block("Interventions", renderInterventions(current, ctx.interventionText)),
    block("What you know about this student", ctx.studentContext),
    // Assembled, never authored — so it cannot drift from what the analysis
    // uses, and cannot be edited away.
    block(
      "When this session may close",
      ctx.completionCriteria
        ? `All of the following must hold:\n${ctx.completionCriteria}`
        : "",
    ),
  ]
    .filter((s) => s !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return {
    prompt,
    currentObjectiveKey: current?.key ?? null,
    progress: progress(ctx.objectives, ctx.satisfied),
  };
}

/**
 * The analysis counterpart: asks for a per-objective verdict rather than one
 * whole-session judgement.
 *
 * This is the change that makes "Session 2 is not completing" answerable. Today
 * that is a single opaque verdict; here it becomes "objective
 * credibility.quantify_claim satisfies at 31%", which is a fact someone can act
 * on. It also lets an objective answered early be credited, because every open
 * objective is evaluated rather than only the current one.
 */
export function renderObjectiveEvidencePrompt(params: {
  objectives: ResolvedObjective[];
  satisfied: string[];
  transcript: string;
}): string {
  const open = openObjectives(params.objectives, params.satisfied);

  return [
    "Judge which objectives the transcript satisfies. Base every judgement ONLY",
    "on what the transcript shows — do not infer, and do not give credit for",
    "something the student was asked but did not answer.",
    "",
    "Objectives:",
    open
      .map((o) => `- key: ${o.key}\n  intent: ${o.intent}\n  evidence: ${o.evidenceRequired}`)
      .join("\n"),
    "",
    "Transcript:",
    params.transcript,
    "",
    "Return STRICT JSON only:",
    `{"satisfied": [{"key": string, "evidence": string, "confidence": number}],`,
    ` "unsatisfied": [{"key": string, "missing": string}]}`,
    "",
    "`evidence` must quote or closely paraphrase the transcript. An objective with",
    "no quotable support belongs in `unsatisfied`, whatever it seems to imply.",
  ].join("\n");
}

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { heuristics, heuristicComponents } from "@shared/wing-schema";
import { log } from "../logger";
import { resolveCardCode } from "./card-code";
import { parseJsonResponse } from "../json-response";
import * as orchestrator from "../orchestrator";
import * as objectives from "./objectives-store";
import {
  openObjectives,
  type PopulationTag,
  type ResolvedObjective,
} from "./objective-rules";
import {
  renderConversationPrompt,
  renderObjectiveEvidencePrompt,
} from "./prompt-renderer";

/**
 * Runtime bridge: builds a conversation prompt from objectives instead of the
 * legacy prompt file, and judges which objectives a transcript has satisfied.
 *
 * ── OFF BY DEFAULT, PER POPULATION ───────────────────────────────────────
 * `OBJECTIVE_RENDERER_POPULATIONS` is a comma-separated allowlist, empty
 * meaning nobody. This changes what a real student experiences, and nothing
 * here has ever produced a conversation — a 1,495-character focused prompt may
 * well beat the 22,000-character one, but that is a hypothesis until a human
 * reads the transcripts.
 *
 * Every failure path falls back to the legacy prompt. A student mid-session
 * must never see this break; the worst acceptable outcome is that the
 * experiment silently does not run, which is why each fallback logs.
 */

function enabledPopulations(): Set<string> {
  return new Set(
    (process.env.OBJECTIVE_RENDERER_POPULATIONS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isEnabledFor(population: string | null | undefined): boolean {
  return !!population && enabledPopulations().has(population);
}

/** Population tag from professionalStatus, matching getPromptSet's defaulting. */
export function populationOf(professionalStatus: string | null | undefined): PopulationTag {
  return professionalStatus === "undergraduate_or_recent_grad" ||
    professionalStatus === "early_career"
    ? professionalStatus
    : "mid_career_or_senior";
}

/** Current intervention text for the cards an objective names. */
async function interventionTextFor(
  resolved: ResolvedObjective[],
  population: PopulationTag,
): Promise<{ text: Record<string, string>; missing: string[] }> {
  const rows = await db
    .select({
      code: heuristics.cardCode,
      componentType: heuristicComponents.componentType,
      content: heuristicComponents.content,
    })
    .from(heuristics)
    .innerJoin(
      heuristicComponents,
      and(
        eq(heuristicComponents.heuristicId, heuristics.id),
        eq(heuristicComponents.isCurrent, true),
      ),
    );

  const byCode = new Map<string, string>();
  for (const r of rows) {
    if (r.componentType === "intervention" && r.content) byCode.set(r.code, r.content);
  }

  const text: Record<string, string> = {};
  const missing: string[] = [];
  for (const code of Array.from(new Set(resolved.flatMap((o) => o.interventions)))) {
    const found = resolveCardCode(code, population, new Set(byCode.keys()));
    if (found) text[code] = byCode.get(found)!;
    else missing.push(code);
  }
  return { text, missing };
}

/**
 * Builds the conversation prompt from objectives.
 *
 * Returns null whenever the experiment cannot run — flag off, no published
 * objective set, or anything thrown. The caller falls back to the legacy
 * prompt, so null is a normal outcome rather than an error.
 */
export async function buildObjectivePrompt(params: {
  sessionId: number;
  sessionType: string;
  sessionTitle: string;
  professionalStatus: string | null | undefined;
  identity: string;
  studentContext: string;
  completionCriteria?: string;
}): Promise<{ prompt: string; currentObjectiveKey: string | null; progress: number } | null> {
  if (!isEnabledFor(populationOf(params.professionalStatus))) return null;

  try {
    const population = populationOf(params.professionalStatus);
    const resolved = await objectives.getResolved(params.sessionType, population);
    if (!resolved?.length) return null;

    const satisfied = await objectives.satisfiedKeys(params.sessionId);
    const { text, missing } = await interventionTextFor(resolved, population);

    // A missing card renders as nothing, so the objective silently loses its
    // interventions. Logged rather than swallowed — the experiment is still
    // worth running, but not worth misreading.
    if (missing.length) {
      log(
        `objective prompt for session ${params.sessionId}: ${missing.length} intervention(s) ` +
          `have no card (${missing.join(", ")})`,
        "objectives",
      );
    }

    const rendered = renderConversationPrompt({
      identity: params.identity,
      sessionTitle: params.sessionTitle,
      objectives: resolved,
      satisfied,
      interventionText: text,
      studentContext: params.studentContext,
      completionCriteria: params.completionCriteria,
    });

    return rendered;
  } catch (err) {
    log(
      `objective prompt failed for session ${params.sessionId}, using legacy prompt: ` +
        (err as Error).message,
      "objectives",
    );
    return null;
  }
}

/**
 * Judges which open objectives the transcript now satisfies, and records them.
 *
 * One mid-tier call per human turn. That is real cost, which is why it only
 * runs for allowlisted populations — but it is what turns the whole design
 * from a refactor into a measurement system: without per-objective evidence
 * there is no satisfaction rate to compare between cohorts, and no honest way
 * to test a conversation change.
 *
 * Best-effort throughout. Losing one turn's attribution costs a data point;
 * throwing would cost the student their session.
 */
export async function recordObjectiveEvidence(params: {
  sessionId: number;
  sessionType: string;
  professionalStatus: string | null | undefined;
  turnId: number;
  transcript: string;
}): Promise<void> {
  if (!isEnabledFor(populationOf(params.professionalStatus))) return;

  try {
    const population = populationOf(params.professionalStatus);
    const resolved = await objectives.getResolved(params.sessionType, population);
    if (!resolved?.length) return;

    const satisfied = await objectives.satisfiedKeys(params.sessionId);
    const open = openObjectives(resolved, satisfied);
    if (!open.length) return;

    const { text } = await orchestrator.complete({
      tier: "mid",
      maxTokens: 1200,
      messages: [
        {
          role: "user",
          content: renderObjectiveEvidencePrompt({
            objectives: resolved,
            satisfied,
            transcript: params.transcript,
          }),
        },
      ],
    });

    const parsed = parseJsonResponse<{
      satisfied?: Array<{ key: string; evidence?: string; confidence?: number }>;
    }>(text);

    const newlySatisfied = (parsed?.satisfied ?? [])
      // Only objectives that were actually open. A model naming something
      // already satisfied, or a key that does not exist, must not write a row.
      .filter((s) => open.some((o) => o.key === s.key))
      // Evidence must be quotable. Without this the model credits objectives
      // it merely believes were implied, which is exactly the looseness the
      // evidence prompt asks it to avoid.
      .filter((s) => (s.evidence ?? "").trim().length > 10);

    for (const s of newlySatisfied) {
      await objectives.recordTurnObjective({
        turnId: params.turnId,
        sessionId: params.sessionId,
        objectiveKey: s.key,
        satisfiedHere: true,
      });
    }

    if (newlySatisfied.length) {
      log(
        `session ${params.sessionId} satisfied: ${newlySatisfied.map((s) => s.key).join(", ")}`,
        "objectives",
      );
    }
  } catch (err) {
    log(
      `objective evidence failed for session ${params.sessionId}: ${(err as Error).message}`,
      "objectives",
    );
  }
}

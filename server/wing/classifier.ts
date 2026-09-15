import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  transcripts,
  transcriptTurns,
  sessions,
  students,
  schoolCycles,
  classifierPrompts,
  classifierPromptComponents,
} from "@shared/wing-schema";
import * as orchestrator from "../orchestrator";
import { parseJsonResponse } from "../json-response";
import { log } from "../logger";
import { provenanceForTurnType, type TurnTypeValue } from "./turn-type";
import { TEST_USER_SKIP, isTestSession } from "./test-user";
import { interpretClassification, type ClassifiedType } from "./classifier-rules";

/**
 * The Nano turn classifier — provisional → classified (spec §5).
 *
 * WHAT PROBLEM THIS SOLVES
 * The deterministic capture rule assigns a turn type synchronously with zero
 * latency, but it cannot infer `human_correction`: whether a student is
 * pushing back on Wing's framing is a judgement about meaning, not about turn
 * order. Until this classifier runs, therefore:
 *
 *   - no turn is ever typed `human_correction`;
 *   - so no AI turn is ever typed `ai_adapted`, because that type is defined
 *     as "the AI turn following a correction";
 *   - so the correction branch in post-session scoring can never fire.
 *
 * Those three consequences were live in the codebase until this module
 * existed. The capture rule was right; it was just only ever half the system.
 *
 * ─── A TENSION IN THE SPEC, RESOLVED DELIBERATELY ───────────────────────────
 *
 * Spec §5 says `ai_adapted` is marked AT CAPTURE, "because retro-tagging would
 * mean reprocessing the corpus". The same section says `human_correction` is
 * NOT deterministically detectable at capture and must be refined
 * asynchronously. Both cannot hold: if a correction is only recognised later,
 * the AI turn that followed it was typed from a premise not yet known.
 *
 * Resolution: when this classifier marks a turn `human_correction`, it also
 * retypes the immediately following AI turn to `ai_adapted`. That is a
 * bounded, one-hop retro-update of a single adjacent row — not a corpus
 * reprocessing — and it is what makes `ai_adapted` mean anything at all. The
 * alternative, leaving it permanently unreachable, would quietly delete a turn
 * type the methodology depends on.
 *
 * ─── WHAT IS NEVER TOUCHED ──────────────────────────────────────────────────
 *
 * `hand_tagged` turns. Those are the gold standard a human labelled, used to
 * validate this very classifier. A classifier that can overwrite its own
 * validation set is measuring nothing.
 *
 * Migrated turns (`provenance_unknown`) are also skipped: the legacy corpus
 * has no reliable provenance by definition, and inventing some retroactively
 * is precisely what the migration rules forbid.
 */

/** Turns of surrounding context the classifier sees. */
const CONTEXT_TURNS = 4;

/** Fallback rules, used when no classifier prompt is authored for the cycle. */
export const DEFAULT_RULES = [
  "You classify a single student turn in a professional-branding coaching conversation.",
  "",
  "Choose exactly one type:",
  '- "human_correction": the student is pushing back on, correcting or',
  "  qualifying the coach's framing — telling the coach it does not fit them.",
  '  Examples: "that\'s not quite it", "I wouldn\'t put it that way",',
  '  "actually my background is more…". This is the type that matters most.',
  '- "human_elicited_response": the student is answering the question the coach',
  "  just asked.",
  '- "human_spontaneous": the student volunteers something not asked for —',
  "  changing direction, or raising a new thread themselves.",
  "",
  "Guidance:",
  "- A turn that answers the question AND pushes back on the framing is a",
  "  correction; the pushback is the more significant fact.",
  "- Mere disagreement with a suggestion is not a correction unless it is about",
  "  how the coach has characterised the student.",
  "- If genuinely unsure, keep the type you were given. An unchanged label is",
  "  much cheaper than a wrong one.",
  "",
  'Reply with JSON only: {"turnType": "<one of the three>", "confidence": <0..1>,',
  '"rationale": "<one sentence>"}',
].join("\n");

/* ── Prompt resolution ──────────────────────────────────────────────────── */

/**
 * Finds the authored classifier prompt for a student's cycle, if any.
 *
 * Like heuristics, classifier prompts are versioned data rather than code, so
 * the methodology owner can tune turn typing without a deploy.
 */
async function resolvePrompt(
  studentId: number,
): Promise<{ id: number | null; system: string }> {
  try {
    const [row] = await db
      .select({ classifierPromptId: schoolCycles.classifierPromptId })
      .from(students)
      .innerJoin(schoolCycles, eq(schoolCycles.id, students.cycleId))
      .where(eq(students.id, studentId))
      .limit(1);

    if (!row?.classifierPromptId) return { id: null, system: DEFAULT_RULES };

    const [prompt] = await db
      .select({ id: classifierPrompts.id, status: classifierPrompts.status })
      .from(classifierPrompts)
      .where(
        and(
          eq(classifierPrompts.id, row.classifierPromptId),
          eq(classifierPrompts.task, "turn_typing"),
        ),
      )
      .limit(1);

    // A draft prompt is not live methodology; fall back rather than use it.
    if (!prompt || prompt.status !== "published") {
      return { id: null, system: DEFAULT_RULES };
    }

    const components = await db
      .select({
        componentType: classifierPromptComponents.componentType,
        content: classifierPromptComponents.content,
      })
      .from(classifierPromptComponents)
      .where(
        and(
          eq(classifierPromptComponents.classifierPromptId, prompt.id),
          eq(classifierPromptComponents.isCurrent, true),
        ),
      );

    const rules = components.find((c) => c.componentType === "rules")?.content;
    const examples = components.find((c) => c.componentType === "examples")?.content;
    if (!rules) return { id: null, system: DEFAULT_RULES };

    // Examples are stored structured (turn, preceding turn, correct type) so
    // they stay queryable and re-renderable. They must be rendered as readable
    // text here — dumping raw JSON into the prompt would ask a small model to
    // parse a data structure while also doing the classification, which is the
    // opposite of making the task easy.
    const { renderExamples } = await import("./classifier-training");

    const renderedExamples =
      typeof examples === "string"
        ? examples
        : Array.isArray(examples)
          ? renderExamples(examples as any)
          : "";

    const system = [
      typeof rules === "string" ? rules : JSON.stringify(rules),
      renderedExamples
        ? `\nWorked examples — these were labelled by the methodology owner:\n\n${renderedExamples}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    return { id: prompt.id, system };
  } catch (err) {
    log(`classifier prompt resolution failed: ${(err as Error).message}`, "classifier");
    return { id: null, system: DEFAULT_RULES };
  }
}

/* ── Classification ─────────────────────────────────────────────────────── */

/**
 * Runs the classifier over one turn WITHOUT writing anything.
 *
 * Used by the validation run: hand-tagged turns are the gold standard, so
 * measuring the classifier means asking what it *would* say about them and
 * comparing — never overwriting them. Re-runnable, so it measures the current
 * prompt rather than whatever the classifier happened to think months ago.
 */
export async function dryRunClassify(params: {
  studentId: number;
  content: string;
  currentType: TurnTypeValue;
  context: Array<{ turnType: string; content: string }>;
}) {
  const { system } = await resolvePrompt(params.studentId);
  return classifyOne({
    system,
    content: params.content,
    currentType: params.currentType,
    context: params.context,
  });
}

async function classifyOne(params: {
  system: string;
  content: string;
  currentType: TurnTypeValue;
  context: Array<{ turnType: string; content: string }>;
}): Promise<{ turnType: ClassifiedType; confidence: number; rationale: string } | null> {
  const contextBlock = params.context
    .map((t) => `[${t.turnType}] ${t.content}`)
    .join("\n");

  let raw: string;
  try {
    const result = await orchestrator.complete({
      tier: "nano",
      system: params.system,
      messages: [
        {
          role: "user",
          content:
            `Conversation so far:\n${contextBlock}\n\n` +
            `Turn to classify (currently typed "${params.currentType}"):\n${params.content}`,
        },
      ],
      maxTokens: 250,
      temperature: 0,
    });
    raw = result.text;
  } catch (err) {
    log(`classification call failed: ${(err as Error).message}`, "classifier");
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseJsonResponse(raw, "Turn classification");
  } catch (err) {
    log(`classification returned non-JSON: ${(err as Error).message}`, "classifier");
    return null;
  }

  const verdict = interpretClassification(parsed, params.currentType);
  return verdict.accepted ? verdict : null;
}

/* ── Retro-update of the adjacent AI turn ───────────────────────────────── */

/**
 * Retypes the AI turn immediately following a newly-recognised correction.
 *
 * Only the next turn, only if it is currently `ai_prompt`, and only if it is
 * still provisional. Bounded on purpose — see the header.
 */
async function markFollowingAiTurnAdapted(transcriptId: number, position: number) {
  const [next] = await db
    .select({
      id: transcriptTurns.id,
      turnType: transcriptTurns.turnType,
      classificationStatus: transcriptTurns.classificationStatus,
    })
    .from(transcriptTurns)
    .where(
      and(
        eq(transcriptTurns.transcriptId, transcriptId),
        eq(transcriptTurns.sequencePosition, position + 1),
      ),
    )
    .limit(1);

  if (!next || next.turnType !== "ai_prompt") return;
  if (next.classificationStatus === "hand_tagged") return;

  await db
    .update(transcriptTurns)
    .set({
      turnType: "ai_adapted",
      provenanceTag: provenanceForTurnType("ai_adapted"),
      classificationStatus: "classified",
      classifiedBy: "nano",
    })
    .where(eq(transcriptTurns.id, next.id));

  log(`turn ${next.id} retyped ai_prompt -> ai_adapted (followed a correction)`, "classifier");
}

/* ── Entry point ────────────────────────────────────────────────────────── */

/**
 * Classifies every provisional human turn in a session.
 *
 * Safe to re-run: already-classified and hand-tagged turns are skipped. Never
 * throws — classification is refinement, and a failure must leave the turn on
 * its provisional label rather than break anything upstream.
 */
export async function classifySession(sessionId: number): Promise<void> {
  try {
    /*
     * A test account's turns keep their provisional labels.
     *
     * Two reasons, and the second is the one that matters. The cheap one is
     * cost: this is a Nano call per turn, and 20 personas x 30 turns is a real
     * bill for labels nobody reads. The real one is that `classified_by: nano`
     * rows are what `tagging-store.runValidation` measures the classifier
     * against, using the hand-tagged sessions as the gold standard. Synthetic
     * turns in that comparison would move the classifier's own accuracy number
     * without anyone choosing to.
     *
     * `classify-backlog.ts` filters test sessions out of its sweep for the same
     * reason, so these turns are not re-found hourly forever. Provisional is
     * the correct resting state for a persona's turn.
     */
    if (await isTestSession(sessionId)) {
      log(`classifySession(${sessionId}) ${TEST_USER_SKIP}`, "classifier");
      return;
    }

    const [session] = await db
      .select({ studentId: sessions.studentId })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (!session) return;

    const [transcript] = await db
      .select({ id: transcripts.id, status: transcripts.status })
      .from(transcripts)
      .where(eq(transcripts.sessionId, sessionId))
      .limit(1);
    if (!transcript) return;

    // The migrated corpus has no reliable provenance; the migration rules
    // forbid inventing any retroactively.
    if (transcript.status === "migrated_provenance_unknown") {
      log(`session ${sessionId} is a legacy import; not classified`, "classifier");
      return;
    }

    const turns = await db
      .select({
        id: transcriptTurns.id,
        position: transcriptTurns.sequencePosition,
        turnType: transcriptTurns.turnType,
        content: transcriptTurns.content,
        classificationStatus: transcriptTurns.classificationStatus,
        provenanceTag: transcriptTurns.provenanceTag,
        analysisEligible: transcriptTurns.analysisEligible,
      })
      .from(transcriptTurns)
      .where(eq(transcriptTurns.transcriptId, transcript.id))
      .orderBy(asc(transcriptTurns.sequencePosition));

    const pending = turns.filter(
      (t) =>
        t.classificationStatus === "provisional" &&
        t.analysisEligible &&
        t.provenanceTag !== "provenance_unknown" &&
        (t.turnType === "human_spontaneous" || t.turnType === "human_elicited_response"),
    );
    if (!pending.length) return;

    const { id: promptId, system } = await resolvePrompt(session.studentId);

    let changed = 0;
    for (const turn of pending) {
      const context = turns
        .filter((t) => t.position < turn.position && t.analysisEligible)
        .slice(-CONTEXT_TURNS)
        .map((t) => ({ turnType: t.turnType, content: t.content }));

      const verdict = await classifyOne({
        system,
        content: turn.content,
        currentType: turn.turnType as TurnTypeValue,
        context,
      });

      // No verdict: leave it provisional so a later run can retry. Marking it
      // classified would quietly assert a confidence nobody has.
      if (!verdict) continue;

      const newType = verdict.turnType as TurnTypeValue;

      await db
        .update(transcriptTurns)
        .set({
          turnType: newType,
          provenanceTag: provenanceForTurnType(newType),
          classificationStatus: "classified",
          classifiedBy: "nano",
          classifierPromptId: promptId,
        })
        .where(eq(transcriptTurns.id, turn.id));

      if (newType !== turn.turnType) {
        changed++;
        log(
          `turn ${turn.id} reclassified ${turn.turnType} -> ${newType} ` +
            `(confidence ${verdict.confidence.toFixed(2)}): ${verdict.rationale}`,
          "classifier",
        );
      }

      if (newType === "human_correction") {
        await markFollowingAiTurnAdapted(transcript.id, turn.position);
      }
    }

    log(
      `session ${sessionId}: classified ${pending.length} turn(s), ${changed} retyped`,
      "classifier",
    );
  } catch (err) {
    log(`classifySession(${sessionId}) failed: ${(err as Error).stack ?? err}`, "classifier");
  }
}

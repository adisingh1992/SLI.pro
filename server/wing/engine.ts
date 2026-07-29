import { eq } from "drizzle-orm";
import { db } from "../db";
import { transcriptTurns } from "@shared/wing-schema";
import * as orchestrator from "../orchestrator";
import { parseJsonResponse } from "../json-response";
import { log } from "../logger";
import * as store from "./heuristics-store";
import { interpretDetection } from "./engine-rules";
import type { HeuristicCard } from "./heuristics-store";

/**
 * The heuristics engine — the real-time loop from spec §6.
 *
 * Per turn: read the active sequence for the student, evaluate the turn
 * against the signal definitions in heuristic_components, and if a signal
 * fires, return the intervention and coaching move as context for Wing's next
 * response. The application is logged with the exact component versions used.
 *
 * WHAT THIS MODULE DOES NOT DO
 * It does not generate Wing's reply. It returns guidance that the caller folds
 * into its existing LLM call, so there is exactly one place where Wing speaks.
 * It also encodes no methodology: every signal, intervention and coaching move
 * is read from the database (spec §2, "code the engine, not the heuristics").
 *
 * FAILURE POSTURE — read this before changing anything here
 * Detection is best-effort and must NEVER break a session. Every failure path
 * returns null, which means "no heuristic fired" and leaves the conversation
 * exactly as it would have been. A student in the middle of a Foundation
 * Session must not see an error because a classifier call timed out. Failures
 * are logged loudly rather than swallowed silently — the bug that hid inside a
 * bare catch cost a day, and this module has more catch blocks than most.
 */

/** How many prior turns of context the detector sees. Keeps the Nano call small. */
const CONTEXT_TURNS = 6;

export type DetectedSignal = {
  heuristicId: number;
  name: string;
  confidence: number;
  /** Why the detector thought this fired — stored on the application log. */
  rationale: string;
  signalComponentId: number;
  interventionComponentId: number | null;
  intervention: string | null;
  coachingMove: string | null;
};

export type EngineGuidance = {
  detected: DetectedSignal;
  sequenceId: number;
  cycleId: number | null;
  applicationId: number;
  /** Ready to append to the system prompt of the caller's completion call. */
  systemPromptFragment: string;
};

/* ── Detection ──────────────────────────────────────────────────────────── */

function buildDetectorSystemPrompt(cards: HeuristicCard[]): string {
  const catalogue = cards
    .filter((c) => c.components.signal)
    .map(
      (c) =>
        `- id: ${c.heuristicId}\n  name: ${c.name}\n  signal: ${c.components.signal!.content}`,
    )
    .join("\n");

  return [
    "You are a signal detector inside a professional-branding coaching system.",
    "You are given a catalogue of behavioural signal definitions and the latest",
    "turn of a conversation. Decide whether the student's latest turn matches",
    "ONE of the signal definitions.",
    "",
    "Signal catalogue:",
    catalogue,
    "",
    "Rules:",
    "- Judge ONLY the student's latest turn; prior turns are context.",
    "- Match only if the turn genuinely satisfies the signal definition. Not",
    "  every turn contains a signal; most do not. Returning none is normal and",
    "  is strongly preferred over a speculative match.",
    "- Never invent a heuristic id that is not in the catalogue.",
    "",
    'Reply with JSON only: {"heuristicId": <number|null>, "confidence": <0..1>,',
    '"rationale": "<one sentence>"}',
    'If nothing matches, reply {"heuristicId": null, "confidence": 0, "rationale": "..."}',
  ].join("\n");
}

/**
 * Runs the Nano-tier detector against the latest turn.
 *
 * Nano because this is on the session's critical path — the whole real-time
 * cycle is meant to complete within the turn, so the detector must be small
 * and fast. Returns null on no match, low confidence, or any failure.
 */
export async function detectSignal(params: {
  cards: HeuristicCard[];
  content: string;
  recentTurns?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<DetectedSignal | null> {
  const candidates = params.cards.filter((c) => c.components.signal);
  if (!candidates.length) return null;

  const context = (params.recentTurns ?? []).slice(-CONTEXT_TURNS);

  let raw: string;
  try {
    const result = await orchestrator.complete({
      tier: "nano",
      system: buildDetectorSystemPrompt(candidates),
      messages: [
        ...context,
        { role: "user", content: `Student's latest turn:\n${params.content}` },
      ],
      maxTokens: 300,
      temperature: 0,
    });
    raw = result.text;
  } catch (err) {
    log(`signal detection call failed: ${(err as Error).message}`, "engine");
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseJsonResponse(raw, "Signal detection");
  } catch (err) {
    log(`signal detection returned non-JSON: ${(err as Error).message}`, "engine");
    return null;
  }

  const verdict = interpretDetection(
    parsed,
    candidates.map((c) => c.heuristicId),
  );

  if (!verdict.accepted) {
    // Only the anomalous rejections are logged; "no_match" and "low_confidence"
    // are the normal case and would drown the log.
    if (verdict.reason === "unknown_heuristic" || verdict.reason === "malformed") {
      log(
        `signal detection rejected (${verdict.reason}): ${JSON.stringify(parsed).slice(0, 200)}`,
        "engine",
      );
    }
    return null;
  }

  const card = candidates.find((c) => c.heuristicId === verdict.heuristicId)!;

  return {
    heuristicId: card.heuristicId,
    name: card.name,
    confidence: verdict.confidence,
    rationale: verdict.rationale,
    signalComponentId: card.components.signal!.id,
    interventionComponentId: card.components.intervention?.id ?? null,
    intervention: card.components.intervention?.content ?? null,
    coachingMove: card.components.coaching_move?.content ?? null,
  };
}

/* ── The per-turn cycle ─────────────────────────────────────────────────── */

function buildGuidance(detected: DetectedSignal): string {
  const parts = [
    `A coaching signal has been detected in the student's last message: ${detected.name}.`,
  ];
  if (detected.intervention) {
    parts.push(`Intervention to apply: ${detected.intervention}`);
  }
  if (detected.coachingMove) {
    parts.push(`How to deliver it: ${detected.coachingMove}`);
  }
  parts.push(
    "Apply this naturally within your reply. Do not mention the heuristic, " +
      "the signal, or that a rule fired — the student should experience good " +
      "coaching, not an explanation of the system.",
  );
  return parts.join("\n");
}

/**
 * Evaluates one human turn and, if a heuristic fires, logs it and returns
 * guidance for Wing's next response.
 *
 * Call this AFTER the turn has been recorded, so the turn id exists to attach
 * the application to. Returns null when no methodology is active for the
 * student, nothing matched, or anything failed.
 */
export async function evaluateTurn(params: {
  studentId: number;
  sessionId: number;
  content: string;
  turnId?: number | null;
  recentTurns?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<EngineGuidance | null> {
  try {
    const sequence = await store.getActiveSequenceForStudent(params.studentId);
    if (!sequence) return null;

    const detected = await detectSignal({
      cards: sequence.cards,
      content: params.content,
      recentTurns: params.recentTurns,
    });
    if (!detected) return null;

    // The audit record pins the component version actually used, so "why did
    // Wing say that?" stays answerable after the card is later revised.
    const applicationId = await store.logApplication({
      studentId: params.studentId,
      sessionId: params.sessionId,
      heuristicId: detected.heuristicId,
      heuristicComponentId:
        detected.interventionComponentId ?? detected.signalComponentId,
      sequenceId: sequence.sequenceId,
      turnId: params.turnId ?? null,
      cycleId: sequence.cycleId,
      notes: detected.rationale
        ? `confidence ${detected.confidence.toFixed(2)}: ${detected.rationale}`
        : `confidence ${detected.confidence.toFixed(2)}`,
    });

    if (params.turnId) {
      await markTurnSignal(params.turnId, detected.heuristicId);
    }

    log(
      `${detected.name} fired for student ${params.studentId} ` +
        `(session ${params.sessionId}, confidence ${detected.confidence.toFixed(2)})`,
      "engine",
    );

    return {
      detected,
      sequenceId: sequence.sequenceId,
      cycleId: sequence.cycleId,
      applicationId,
      systemPromptFragment: buildGuidance(detected),
    };
  } catch (err) {
    // Deliberately broad: a failure here must degrade to ordinary conversation
    // rather than surface to the student. Logged with a stack because a silent
    // engine is indistinguishable from an engine with no matching heuristics.
    log(`evaluateTurn failed: ${(err as Error).stack ?? err}`, "engine");
    return null;
  }
}

/** Stamps the triggering turn with the heuristic that was active. */
export async function markTurnSignal(turnId: number, heuristicId: number) {
  await db
    .update(transcriptTurns)
    .set({ signalDetected: true, activeHeuristicId: heuristicId })
    .where(eq(transcriptTurns.id, turnId));
}

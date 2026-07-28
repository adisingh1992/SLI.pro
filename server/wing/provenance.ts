import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  sessions,
  transcripts,
  transcriptTurns,
} from "@shared/wing-schema";

/**
 * Turn-level provenance capture — the separation mechanism.
 *
 * Spec §8 (Database Structure & Schema Specification) and §5 of the Wing Data
 * Architecture spec. This is the least reversible part of the system: every
 * turn is stored individually and tagged human-originated or AI-generated at
 * the moment of capture. Only human-originated turns ground longitudinal
 * memory and any future fine-tuning corpus.
 *
 * THE DETERMINISTIC CAPTURE RULE
 *   - prior turn was `ai_prompt`      → human_elicited_response / human_elicited
 *   - otherwise (human turn)           → human_spontaneous     / human_spontaneous
 *   - AI turn after a human_correction → ai_adapted ★          / ai_generated
 *   - any other AI turn                → ai_prompt             / ai_generated
 *
 * The rule assigns a PROVISIONAL tag synchronously with zero added latency;
 * the turn persists immediately. The Nano classifier then refines the label
 * asynchronously (classification_status: provisional → classified), which is
 * why `human_correction` is not inferred here — it is not deterministically
 * detectable at capture. Callers may pass an explicit turnType when the UI
 * knows better (e.g. the student used an explicit "that's not right" action).
 *
 * Nothing in the session turn waits on classification.
 */

export type TurnOrigin = "human" | "ai";

export type CaptureChannelValue =
  | "in_app"
  | "voice"
  | "email_reply"
  | "sms_reply"
  | "legacy_import";

export type TurnTypeValue =
  | "ai_prompt"
  | "human_elicited_response"
  | "human_spontaneous"
  | "human_correction"
  | "ai_adapted";

export type ProvenanceTagValue =
  | "ai_generated"
  | "human_elicited"
  | "human_spontaneous"
  | "human_correction"
  | "provenance_unknown";

export interface RecordTurnParams {
  sessionId: number;
  content: string;
  origin: TurnOrigin;
  channel?: CaptureChannelValue;
  /** Heuristic active at the time of the turn (engine context). */
  activeHeuristicId?: number | null;
  signalDetected?: boolean;
  /**
   * Explicit override for cases the deterministic rule cannot infer —
   * principally `human_correction`. Provenance is derived from it.
   */
  turnType?: TurnTypeValue;
}

/** Provenance is a pure function of turn type — never set independently. */
export function provenanceForTurnType(turnType: TurnTypeValue): ProvenanceTagValue {
  switch (turnType) {
    case "ai_prompt":
    case "ai_adapted": // ★ still ai_generated; still excluded from memory
      return "ai_generated";
    case "human_elicited_response":
      return "human_elicited";
    case "human_spontaneous":
      return "human_spontaneous";
    case "human_correction":
      return "human_correction";
  }
}

/** The deterministic capture rule, isolated so it is unit-testable. */
export function deriveTurnType(
  origin: TurnOrigin,
  previousTurnType: TurnTypeValue | null,
): TurnTypeValue {
  if (origin === "ai") {
    // The AI turn immediately following a human correction is the moment Wing
    // changes course because a human pushed back — worth marking at capture,
    // because retro-tagging would mean reprocessing the corpus.
    return previousTurnType === "human_correction" ? "ai_adapted" : "ai_prompt";
  }
  return previousTurnType === "ai_prompt"
    ? "human_elicited_response"
    : "human_spontaneous";
}

/** Returns the session's transcript, creating it on first turn. */
export async function ensureTranscript(sessionId: number): Promise<number> {
  const existing = await db
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId))
    .limit(1);

  if (existing.length) return existing[0].id;

  const [created] = await db
    .insert(transcripts)
    .values({ sessionId, status: "incomplete" })
    .returning({ id: transcripts.id });

  return created.id;
}

/**
 * Records a single turn with its provenance.
 *
 * Runs in a transaction and takes a row lock on the transcript so concurrent
 * writes cannot collide on sequence_position (which is UNIQUE per transcript).
 */
export async function recordTurn(params: RecordTurnParams) {
  const {
    sessionId,
    content,
    origin,
    channel = "in_app",
    activeHeuristicId = null,
    signalDetected = false,
  } = params;

  return db.transaction(async (tx) => {
    // Resolve (or create) the transcript, then lock it so the position
    // sequence is serialized for concurrent turn writes.
    let transcriptId: number;
    const found = await tx
      .select({ id: transcripts.id })
      .from(transcripts)
      .where(eq(transcripts.sessionId, sessionId))
      .for("update")
      .limit(1);

    if (found.length) {
      transcriptId = found[0].id;
    } else {
      const [created] = await tx
        .insert(transcripts)
        .values({ sessionId, status: "incomplete" })
        .returning({ id: transcripts.id });
      transcriptId = created.id;
    }

    const [previous] = await tx
      .select({
        position: transcriptTurns.sequencePosition,
        turnType: transcriptTurns.turnType,
      })
      .from(transcriptTurns)
      .where(eq(transcriptTurns.transcriptId, transcriptId))
      .orderBy(desc(transcriptTurns.sequencePosition))
      .limit(1);

    const turnType =
      params.turnType ??
      deriveTurnType(origin, (previous?.turnType as TurnTypeValue) ?? null);

    const [turn] = await tx
      .insert(transcriptTurns)
      .values({
        transcriptId,
        sequencePosition: (previous?.position ?? 0) + 1,
        turnType,
        content,
        provenanceTag: provenanceForTurnType(turnType),
        activeHeuristicId,
        signalDetected,
        channel,
        // Provisional until the Nano classifier settles it. An explicit
        // caller-supplied type is a rule-based decision, not a classification.
        classificationStatus: "provisional",
        classifiedBy: "rule",
      })
      .returning();

    return turn;
  });
}

/** Convenience wrappers — the shapes call sites actually use. */
export const recordHumanTurn = (
  sessionId: number,
  content: string,
  opts: Omit<RecordTurnParams, "sessionId" | "content" | "origin"> = {},
) => recordTurn({ sessionId, content, origin: "human", ...opts });

export const recordAiTurn = (
  sessionId: number,
  content: string,
  opts: Omit<RecordTurnParams, "sessionId" | "content" | "origin"> = {},
) => recordTurn({ sessionId, content, origin: "ai", ...opts });

/**
 * Marks a transcript complete when its session ends.
 * Legacy imports use `migrated_provenance_unknown` instead (spec §14).
 */
export async function completeTranscript(sessionId: number): Promise<void> {
  const transcriptId = await ensureTranscript(sessionId);
  await db
    .update(transcripts)
    .set({ status: "complete", updatedAt: new Date() })
    .where(eq(transcripts.id, transcriptId));
}

/**
 * Human-originated turns only — the corpus that grounds memory, scoring and
 * any future training set. AI turns are recorded but never returned here.
 */
export async function getHumanTurns(sessionId: number) {
  return db
    .select({
      id: transcriptTurns.id,
      position: transcriptTurns.sequencePosition,
      turnType: transcriptTurns.turnType,
      content: transcriptTurns.content,
      provenanceTag: transcriptTurns.provenanceTag,
      signalDetected: transcriptTurns.signalDetected,
      createdAt: transcriptTurns.createdAt,
    })
    .from(transcriptTurns)
    .innerJoin(transcripts, eq(transcripts.id, transcriptTurns.transcriptId))
    .where(
      and(
        eq(transcripts.sessionId, sessionId),
        sql`${transcriptTurns.provenanceTag} <> 'ai_generated'`,
      ),
    )
    .orderBy(transcriptTurns.sequencePosition);
}

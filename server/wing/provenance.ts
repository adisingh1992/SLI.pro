import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  sessions,
  transcripts,
  transcriptTurns,
} from "@shared/wing-schema";
import {
  deriveTurnType,
  provenanceForTurnType,
  type CaptureChannelValue,
  type ProvenanceTagValue,
  type TurnOrigin,
  type TurnTypeValue,
} from "./turn-type";

// The capture rule lives in ./turn-type (no imports, so it is testable without
// a database). Re-exported here so callers have one import site.
export {
  deriveTurnType,
  provenanceForTurnType,
  type CaptureChannelValue,
  type ProvenanceTagValue,
  type TurnOrigin,
  type TurnTypeValue,
};

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

export interface RecordTurnParams {
  sessionId: number;
  content: string;
  origin: TurnOrigin;
  channel?: CaptureChannelValue;
  /** Heuristic active at the time of the turn (engine context). */
  activeHeuristicId?: number | null;
  signalDetected?: boolean;
  /**
   * `voice.ts`'s `VoiceContextResult.audience` / `.register` for this turn --
   * only ever meaningful on an AI turn (`recordAiTurn`); a caller recording a
   * human turn has no reason to pass either.
   */
  deliveryAudience?: string | null;
  deliveryRegister?: string | null;
  /**
   * Explicit override for cases the deterministic rule cannot infer —
   * principally `human_correction`. Provenance is derived from it.
   */
  turnType?: TurnTypeValue;
  /** Whether this human turn may enter longitudinal analysis and memory. */
  analysisEligible?: boolean;
  /** Stable policy reason when analysisEligible is false. */
  analysisExclusionReason?: string | null;
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
    deliveryAudience = null,
    deliveryRegister = null,
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
        deliveryAudience,
        deliveryRegister,
        channel,
        // Provisional until the Nano classifier settles it. An explicit
        // caller-supplied type is a rule-based decision, not a classification.
        classificationStatus: "provisional",
        classifiedBy: "rule",
        analysisEligible: params.analysisEligible ?? true,
        analysisExclusionReason: params.analysisEligible === false
          ? params.analysisExclusionReason ?? "policy_excluded"
          : null,
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
 * A second-layer safety judgement may exclude a turn after its provisional scope
 * classification. The content remains auditable; only analysis eligibility changes.
 */
export async function excludeTurnFromAnalysis(turnId: number, reason: string): Promise<void> {
  await db
    .update(transcriptTurns)
    .set({ analysisEligible: false, analysisExclusionReason: reason })
    .where(eq(transcriptTurns.id, turnId));
}

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
      analysisEligible: transcriptTurns.analysisEligible,
      analysisExclusionReason: transcriptTurns.analysisExclusionReason,
      createdAt: transcriptTurns.createdAt,
    })
    .from(transcriptTurns)
    .innerJoin(transcripts, eq(transcripts.id, transcriptTurns.transcriptId))
    .where(
      and(
        eq(transcripts.sessionId, sessionId),
        // turn_type, not provenance. `provenance_tag <> 'ai_generated'` reads
        // like "human", and is — until migrated turns exist. Those are all
        // stamped provenance_unknown, so that test passed Wing's own turns
        // into the corpus this function exists to keep human-only.
        sql`${transcriptTurns.turnType} not in ('ai_prompt', 'ai_adapted')`,
        eq(transcriptTurns.analysisEligible, true),
      ),
    )
    .orderBy(transcriptTurns.sequencePosition);
}

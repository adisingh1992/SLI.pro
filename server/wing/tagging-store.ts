import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  transcripts,
  transcriptTurns,
  sessions,
  students,
  users,
  heuristics,
} from "@shared/wing-schema";
import { provenanceForTurnType, type TurnTypeValue } from "./turn-type";

/**
 * Hand-tagging — the gold standard the classifier is measured against.
 *
 * Spec §14 calls for the strongest 10–15 sessions to be hand-tagged at turn
 * level to seed the classifier and provide a validation set. This is the store
 * behind that.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS
 * The classifier assigns turn types, and turn type decides what enters
 * longitudinal memory and any future training corpus. Without labelled turns
 * there is no way to know whether it is accurate — and "the classifier seems
 * about right" is not a claim anyone can act on. Disagreement between a human
 * label and the classifier is the only real signal about classifier quality.
 *
 * TWO INVARIANTS
 *
 * 1. A hand tag is FINAL. classify-session and classify-backlog both skip
 *    `hand_tagged` turns. A classifier that can overwrite its own validation
 *    set measures nothing.
 *
 * 2. Provenance follows turn type, always. It is never set independently —
 *    the same rule the capture path uses, so a hand tag cannot produce a
 *    combination the engine could never have produced itself.
 */

export type TaggableTurnType = TurnTypeValue;

/** Sessions worth tagging, with how much of each is already done. */
export async function listTaggableSessions() {
  const rows = await db
    .select({
      sessionId: sessions.id,
      sessionType: sessions.sessionType,
      status: sessions.status,
      completedAt: sessions.completedAt,
      studentId: students.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      isTestUser: users.isTestUser,
      transcriptId: transcripts.id,
      transcriptStatus: transcripts.status,
      totalTurns: sql<number>`count(${transcriptTurns.id})::int`,
      // turn_type, not provenance. Migrated turns are all provenance_unknown,
      // so the old filter counted Wing's turns as human and overstated how
      // much of each migrated session was actually taggable.
      humanTurns: sql<number>`
        count(*) filter (
          where ${transcriptTurns.turnType} not in ('ai_prompt', 'ai_adapted')
            and ${transcriptTurns.analysisEligible} = true
        )::int`,
      handTagged: sql<number>`
        count(*) filter (where ${transcriptTurns.classificationStatus} = 'hand_tagged')::int`,
    })
    .from(sessions)
    .innerJoin(students, eq(students.id, sessions.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .innerJoin(transcripts, eq(transcripts.sessionId, sessions.id))
    .leftJoin(transcriptTurns, eq(transcriptTurns.transcriptId, transcripts.id))
    .groupBy(
      sessions.id, sessions.sessionType, sessions.status, sessions.completedAt,
      students.id, users.firstName, users.lastName, users.email, users.isTestUser,
      transcripts.id, transcripts.status,
    )
    .having(sql`count(${transcriptTurns.id}) > 0`)
    .orderBy(desc(sessions.completedAt), desc(sessions.id));

  return rows;
}

/** Every turn of a session, in order, with what the classifier decided. */
export async function getSessionTurns(sessionId: number) {
  const [transcript] = await db
    .select({ id: transcripts.id, status: transcripts.status })
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId))
    .limit(1);
  if (!transcript) return null;

  const turns = await db
    .select({
      id: transcriptTurns.id,
      position: transcriptTurns.sequencePosition,
      turnType: transcriptTurns.turnType,
      provenanceTag: transcriptTurns.provenanceTag,
      content: transcriptTurns.content,
      classificationStatus: transcriptTurns.classificationStatus,
      classifiedBy: transcriptTurns.classifiedBy,
      signalDetected: transcriptTurns.signalDetected,
      activeHeuristicId: transcriptTurns.activeHeuristicId,
      activeHeuristicName: heuristics.name,
      createdAt: transcriptTurns.createdAt,
    })
    .from(transcriptTurns)
    .leftJoin(heuristics, eq(heuristics.id, transcriptTurns.activeHeuristicId))
    .where(eq(transcriptTurns.transcriptId, transcript.id))
    .orderBy(asc(transcriptTurns.sequencePosition));

  return { transcriptId: transcript.id, transcriptStatus: transcript.status, turns };
}

/**
 * Records a human's judgement on one turn.
 *
 * `previousType` is kept on the return so the caller can report whether the
 * human agreed with the machine — that comparison is the entire point of the
 * exercise, and it is only available at the moment of tagging.
 */
export async function handTagTurn(params: {
  turnId: number;
  turnType: TaggableTurnType;
  taggedByUserId: number;
}) {
  const [existing] = await db
    .select({
      id: transcriptTurns.id,
      turnType: transcriptTurns.turnType,
      classificationStatus: transcriptTurns.classificationStatus,
      classifiedBy: transcriptTurns.classifiedBy,
      analysisEligible: transcriptTurns.analysisEligible,
    })
    .from(transcriptTurns)
    .where(eq(transcriptTurns.id, params.turnId))
    .limit(1);

  if (!existing || !existing.analysisEligible) return null;

  const [updated] = await db
    .update(transcriptTurns)
    .set({
      turnType: params.turnType,
      // Never set independently — see invariant 2.
      provenanceTag: provenanceForTurnType(params.turnType),
      classificationStatus: "hand_tagged",
      classifiedBy: "human",
    })
    .where(eq(transcriptTurns.id, params.turnId))
    .returning();

  return {
    turn: updated,
    previousType: existing.turnType,
    previousStatus: existing.classificationStatus,
    previousClassifier: existing.classifiedBy,
    /** Did the human confirm what the machine said, or overturn it? */
    changed: existing.turnType !== params.turnType,
    /** Only a machine label can be agreed or disagreed with. */
    wasMachineLabelled: existing.classifiedBy === "nano",
  };
}

/** Removes a hand tag, returning the turn to the classifier's pool. */
export async function clearHandTag(turnId: number) {
  const [updated] = await db
    .update(transcriptTurns)
    .set({
      classificationStatus: "provisional",
      classifiedBy: "rule",
    })
    .where(
      and(
        eq(transcriptTurns.id, turnId),
        eq(transcriptTurns.classificationStatus, "hand_tagged"),
      ),
    )
    .returning();

  return updated ?? null;
}

/* ── Coverage ───────────────────────────────────────────────────────────── */

/** How much of the corpus is labelled, and by what. */
export async function taggingCoverage() {
  const rows = await db
    .select({
      turnType: transcriptTurns.turnType,
      classificationStatus: transcriptTurns.classificationStatus,
      count: sql<number>`count(*)::int`,
    })
    .from(transcriptTurns)
    .where(
      and(
        ne(transcriptTurns.provenanceTag, "provenance_unknown"),
        eq(transcriptTurns.analysisEligible, true),
      ),
    )
    .groupBy(transcriptTurns.turnType, transcriptTurns.classificationStatus);

  const byStatus: Record<string, number> = {};
  const handTaggedByType: Record<string, number> = {};

  for (const r of rows) {
    byStatus[r.classificationStatus] = (byStatus[r.classificationStatus] ?? 0) + r.count;
    if (r.classificationStatus === "hand_tagged") {
      handTaggedByType[r.turnType] = (handTaggedByType[r.turnType] ?? 0) + r.count;
    }
  }

  return {
    totalTurns: rows.reduce((s, r) => s + r.count, 0),
    byStatus,
    handTaggedByType,
  };
}

/* ── Validation run ─────────────────────────────────────────────────────── */

/**
 * Measures the CURRENT classifier against the hand-tagged gold standard.
 *
 * Asks the classifier what it would say about each hand-tagged turn and
 * compares — writing nothing. Two properties matter:
 *
 *  - The gold standard is never touched, so it cannot be contaminated by the
 *    thing it is meant to judge.
 *  - It is re-runnable. Change the classifier prompt, run it again, and see
 *    whether accuracy moved. A one-shot number captured at tagging time could
 *    not do that, and would silently describe an old prompt.
 *
 * Only human turns are evaluated: the classifier never assigns AI turn types.
 */
export async function runValidation(limit = 200) {
  const { dryRunClassify } = await import("./classifier");

  const tagged = await db
    .select({
      id: transcriptTurns.id,
      transcriptId: transcriptTurns.transcriptId,
      position: transcriptTurns.sequencePosition,
      turnType: transcriptTurns.turnType,
      content: transcriptTurns.content,
      studentId: sessions.studentId,
    })
    .from(transcriptTurns)
    .innerJoin(transcripts, eq(transcripts.id, transcriptTurns.transcriptId))
    .innerJoin(sessions, eq(sessions.id, transcripts.sessionId))
    .where(
      and(
        eq(transcriptTurns.classificationStatus, "hand_tagged"),
        eq(transcriptTurns.analysisEligible, true),
        // turn_type, not provenance — see the note on humanTurns above.
        sql`${transcriptTurns.turnType} not in ('ai_prompt', 'ai_adapted')`,
      ),
    )
    .orderBy(asc(transcriptTurns.id))
    .limit(limit);

  if (!tagged.length) {
    return {
      evaluated: 0, agreed: 0, accuracy: null, confusion: [],
      unresolved: 0, heldOut: 0, usedAsExamples: 0,
    };
  }

  // ONLY the holdout is evaluated. The training split is what the published
  // prompt shows the classifier as worked examples, so scoring it there would
  // be grading the model on its own crib sheet — the number would rise and
  // mean nothing.
  const { splitTagged } = await import("./classifier-rules");
  const { train, holdout } = splitTagged(tagged);
  const subjects = holdout;

  if (!subjects.length) {
    return {
      evaluated: 0, agreed: 0, accuracy: null, confusion: [], unresolved: 0,
      heldOut: 0, usedAsExamples: train.length,
      note:
        "Every tagged turn is currently used as a prompt example — there are too " +
        "few per class to hold any back. Tag more turns to get a validation set.",
    } as any;
  }

  // Preceding turns give the classifier the same context the live path has.
  const contextCache = new Map<number, Array<{ position: number; turnType: string; content: string }>>();
  async function contextFor(transcriptId: number, position: number) {
    if (!contextCache.has(transcriptId)) {
      const all = await db
        .select({
          position: transcriptTurns.sequencePosition,
          turnType: transcriptTurns.turnType,
          content: transcriptTurns.content,
        })
        .from(transcriptTurns)
        .where(eq(transcriptTurns.transcriptId, transcriptId))
        .orderBy(asc(transcriptTurns.sequencePosition));
      contextCache.set(transcriptId, all);
    }
    return contextCache
      .get(transcriptId)!
      .filter((t) => t.position < position)
      .slice(-4)
      .map((t) => ({ turnType: t.turnType, content: t.content }));
  }

  const confusion = new Map<string, number>();
  let agreed = 0;
  let unresolved = 0;

  for (const turn of subjects) {
    const verdict = await dryRunClassify({
      studentId: turn.studentId,
      content: turn.content,
      // The classifier is told the RULE's provisional label, not the human's,
      // so the gold standard cannot leak into the input it is judged on.
      currentType: deriveProvisionalType(
        await contextFor(turn.transcriptId, turn.position),
      ),
      context: await contextFor(turn.transcriptId, turn.position),
    });

    if (!verdict) {
      unresolved++;
      continue;
    }

    const key = `${turn.turnType} -> ${verdict.turnType}`;
    confusion.set(key, (confusion.get(key) ?? 0) + 1);
    if (verdict.turnType === turn.turnType) agreed++;
  }

  const evaluated = subjects.length - unresolved;

  return {
    evaluated,
    agreed,
    accuracy: evaluated ? agreed / evaluated : null,
    unresolved,
    heldOut: subjects.length,
    usedAsExamples: train.length,
    confusion: Array.from(confusion.entries())
      .map(([pair, count]) => {
        const [expected, got] = pair.split(" -> ");
        return { expected, got, count, correct: expected === got };
      })
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * What the deterministic rule would have assigned, from context alone.
 *
 * The validation run must not show the classifier the human's answer — doing
 * so would let it simply agree, and the accuracy number would be meaningless.
 * So it is given the same provisional label the live capture path would have
 * produced.
 */
function deriveProvisionalType(
  context: Array<{ turnType: string; content: string }>,
): TurnTypeValue {
  const previous = context.length ? context[context.length - 1].turnType : null;
  return previous === "ai_prompt" ? "human_elicited_response" : "human_spontaneous";
}

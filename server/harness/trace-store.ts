/**
 * Selection trace — reads, impure half.
 *
 * ── THE BOUNDARY THIS FILE HOLDS ─────────────────────────────────────────
 * READ ONLY. Every query here is a SELECT. The harness does not write to a
 * single platform table, and this file is where that would be easiest to
 * break, so it is stated once here and enforced by
 * `harness-boundary.test.ts`: no `db.insert`, `db.update` or `db.delete`
 * anywhere under `server/harness/`.
 *
 * It calls the engine's own store functions rather than re-querying, for the
 * same reason `selection-trace.ts` imports `cardAppliesTo`: a reconstruction
 * that queries differently from the engine will eventually disagree with it,
 * and the disagreement will look like a methodology finding.
 *
 * ── TWO HONESTY FLAGS THIS FILE MUST CARRY ───────────────────────────────
 * A reconstruction reads today's database to describe a past turn, so two
 * things can have moved underneath it, and both are reported rather than
 * silently absorbed:
 *
 * 1. `sequenceSource`. The sequence a turn actually ran under is recorded on
 *    the application row. A turn where nothing fired has no row, so for a
 *    session with no applications at all the sequence has to come from the
 *    cycle's CURRENT pointer — which may have moved since. `"current_pointer"`
 *    means "this is today's methodology, not provably the session's".
 * 2. `populationTagsAsOf: "now"`. Tags derive at read time from
 *    `users.professional_status` and `intake_records.pathway`; neither is
 *    versioned. A student who completed intake after the session, or changed
 *    status, resolves to different tags than the engine saw. Always true of
 *    this reconstruction, so it is a constant on the result rather than a
 *    condition to test.
 *
 * For harness runs neither flag bites: a run records its own sequence version
 * and its personas do not change status mid-run. Both matter when this is
 * pointed at a real student's past session, which is the other thing it is
 * for.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  gateAuditFindings,
  sessions,
  transcripts,
  transcriptTurns,
  userHeuristicApplications,
} from "@shared/wing-schema";
import {
  getSequenceCards,
  populationTagsForStudent,
  resolveSequenceId,
} from "../wing/heuristics-store";
import {
  parseApplicationNote,
  traceTurn,
  type TraceInputCard,
  type TurnTrace,
} from "./selection-trace";

/** Turn types that carry the student's own words. */
const HUMAN_TURN_TYPES = [
  "human_elicited_response",
  "human_spontaneous",
  "human_correction",
] as const;

export type TurnTraceRow = {
  turnId: number;
  sequencePosition: number;
  turnType: string;
  content: string;
  analysisEligible: boolean;
  analysisExclusionReason: string | null;
  trace: TurnTrace;
  /** Breaches the deterministic audit found in the reply to this turn. Never
   *  "gates that held" — that is not recorded anywhere. */
  gateFindings: Array<{ cardCode: string; mode: string; matched: string; excerpt: string }>;
};

export type SessionTrace = {
  sessionId: number;
  studentId: number;
  sessionType: string;
  sequenceId: number | null;
  sequenceSource: "application_log" | "current_pointer" | "unresolved";
  populationTags: string[];
  populationTagsAsOf: "now";
  turns: TurnTraceRow[];
  /** Present when there is no methodology to trace against, which is a real and
   *  common state — Berkeley and Vanderbilt have a voice profile and no sequence. */
  note?: string;
};

/**
 * Reconstructs the selection trace for every student turn in one session.
 *
 * Works on any session, test or real, because it only reads. Pointed at a
 * hand-run session it gives Danielle the trace visibility for her own manual
 * testing before any runner exists.
 */
export async function sessionTrace(sessionId: number): Promise<SessionTrace | null> {
  const [session] = await db
    .select({
      id: sessions.id,
      studentId: sessions.studentId,
      sessionType: sessions.sessionType,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) return null;

  const [transcript] = await db
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId))
    .limit(1);

  const turns = transcript
    ? await db
        .select({
          id: transcriptTurns.id,
          sequencePosition: transcriptTurns.sequencePosition,
          turnType: transcriptTurns.turnType,
          content: transcriptTurns.content,
          analysisEligible: transcriptTurns.analysisEligible,
          analysisExclusionReason: transcriptTurns.analysisExclusionReason,
        })
        .from(transcriptTurns)
        .where(
          and(
            eq(transcriptTurns.transcriptId, transcript.id),
            inArray(transcriptTurns.turnType, HUMAN_TURN_TYPES as unknown as string[] as never),
          ),
        )
        .orderBy(asc(transcriptTurns.sequencePosition))
    : [];

  const applications = await db
    .select({
      turnId: userHeuristicApplications.turnId,
      heuristicId: userHeuristicApplications.heuristicId,
      sequenceId: userHeuristicApplications.sequenceId,
      notes: userHeuristicApplications.notes,
    })
    .from(userHeuristicApplications)
    .where(eq(userHeuristicApplications.sessionId, sessionId))
    .orderBy(asc(userHeuristicApplications.appliedAt));

  /*
   * The sequence the session actually ran under, preferred over today's pointer.
   * More than one distinct value would mean the pointer moved mid-session, which
   * the mid-cycle-override path allows; the most recent application wins and the
   * source stays `application_log` because it is still a recorded fact.
   */
  const loggedSequenceId = applications.length
    ? applications[applications.length - 1].sequenceId
    : null;

  let sequenceId: number | null = loggedSequenceId;
  let sequenceSource: SessionTrace["sequenceSource"] = "application_log";
  if (!sequenceId) {
    const resolved = await resolveSequenceId(session.studentId);
    sequenceId = resolved?.sequenceId ?? null;
    sequenceSource = resolved ? "current_pointer" : "unresolved";
  }

  const populationTags = await populationTagsForStudent(session.studentId);

  if (!sequenceId) {
    return {
      sessionId,
      studentId: session.studentId,
      sessionType: session.sessionType,
      sequenceId: null,
      sequenceSource,
      populationTags,
      populationTagsAsOf: "now",
      turns: [],
      note:
        "No sequence resolves for this student, so no card could have fired and " +
        "there is nothing to trace. This is a published-methodology state, not an error.",
    };
  }

  // Every entry, all kinds, unscoped — narrowing here would hide the drops.
  const all = await getSequenceCards(sequenceId, {});
  const inputCards: TraceInputCard[] = all.map((c) => ({
    heuristicId: c.heuristicId,
    cardCode: c.cardCode,
    name: c.name,
    cardKind: c.cardKind,
    weight: c.weight,
    position: c.position,
    appliesToSession: c.appliesToSession,
    populationTags: c.populationTags,
    hasSignalComponent: Boolean(c.components.signal),
  }));

  const appliedByTurn = new Map<number, (typeof applications)[number]>();
  for (const a of applications) if (a.turnId) appliedByTurn.set(a.turnId, a);

  const findings = await db
    .select({
      turnId: gateAuditFindings.turnId,
      cardCode: gateAuditFindings.cardCode,
      mode: gateAuditFindings.mode,
      matched: gateAuditFindings.matched,
      excerpt: gateAuditFindings.excerpt,
    })
    .from(gateAuditFindings)
    .where(eq(gateAuditFindings.sessionId, sessionId));

  return {
    sessionId,
    studentId: session.studentId,
    sessionType: session.sessionType,
    sequenceId,
    sequenceSource,
    populationTags,
    populationTagsAsOf: "now",
    turns: turns.map((turn) => {
      const applied = appliedByTurn.get(turn.id);
      const parsed = applied ? parseApplicationNote(applied.notes) : null;

      return {
        turnId: turn.id,
        sequencePosition: turn.sequencePosition,
        turnType: turn.turnType,
        content: turn.content,
        analysisEligible: turn.analysisEligible,
        analysisExclusionReason: turn.analysisExclusionReason,
        trace: traceTurn({
          sequenceId: sequenceId!,
          sessionType: session.sessionType,
          studentTags: populationTags,
          sequenceCards: inputCards,
          applied:
            applied && parsed
              ? {
                  heuristicId: applied.heuristicId,
                  confidence: parsed.confidence,
                  rationale: parsed.rationale,
                  withheld: parsed.withheld,
                }
              : null,
          turnId: turn.id,
        }),
        gateFindings: findings
          .filter((f) => f.turnId === turn.id)
          .map(({ cardCode, mode, matched, excerpt }) => ({
            cardCode,
            mode: mode as string,
            matched,
            excerpt,
          })),
      };
    }),
  };
}

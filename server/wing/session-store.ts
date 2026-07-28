import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  sessions,
  sessionArtifacts,
  transcripts,
  transcriptTurns,
} from "@shared/wing-schema";
import { ensureStudent, studentIdForWingUser } from "./bootstrap";
import { recordHumanTurn, recordAiTurn, completeTranscript } from "./provenance";

/**
 * Wing-native session store.
 *
 * Replaces the MVP's foundation_sessions / foundation_session_messages and
 * enhancement_modules / enhancement_module_messages with the specification's
 * conversation spine:
 *
 *   sessions ─┬─ transcripts ── transcript_turns   (provenance at capture)
 *             └─ session_artifacts                 (typed structured outputs)
 *
 * Two shape changes versus the MVP, both from the spec:
 *
 * 1. Messages become TURNS. A turn carries turn_type and provenance_tag
 *    assigned at capture, not a bare user/assistant role.
 *
 * 2. `completionData` (a single untyped JSON blob) becomes typed
 *    `session_artifacts` rows — functional_identity, credibility_assessment,
 *    signature_story, module_outcome. This is what makes session outputs
 *    queryable and lets the Behavioral Evidence Portfolio cite them.
 *
 * Forward-locking and prerequisites are ENGINE LOGIC, not schema (spec §8):
 * this store exposes state, and the route layer decides progression.
 */

export type WingSessionType =
  | "intake" | "foundation_1" | "foundation_2" | "foundation_3"
  | "enhancement_a" | "enhancement_b" | "enhancement_c"
  | "ongoing_engagement" | "career_event_review" | "module_run";

export type WingSessionStatus =
  | "locked" | "available" | "in_progress" | "completed" | "ended_early";

export type ArtifactType =
  | "functional_identity" | "credibility_assessment" | "signature_story"
  | "module_outcome" | "intake_summary" | "advisor_snapshot" | "wing_summary";

type LegacyUser = Parameters<typeof ensureStudent>[0];

export const FOUNDATION_TYPES: WingSessionType[] = [
  "foundation_1", "foundation_2", "foundation_3",
];
export const ENHANCEMENT_TYPES: WingSessionType[] = [
  "enhancement_a", "enhancement_b", "enhancement_c",
];

/** foundation_2 → 2, enhancement_b → 'B'. Presentation helpers for the API. */
export const foundationNumber = (t: WingSessionType) =>
  Number(t.replace("foundation_", ""));
export const enhancementCode = (t: WingSessionType) =>
  t.replace("enhancement_", "").toUpperCase();

/* ── Sessions ─────────────────────────────────────────────────────────── */

/**
 * Resolves the caller to their student id.
 *
 * Post-cutover `req.user` is a wing user, so this accepts the wing user object
 * (or a bare wing user id) and finds the student directly.
 */
export async function studentIdFor(user: { id: number } | number): Promise<number> {
  const wingUserId = typeof user === "number" ? user : user.id;
  return studentIdForWingUser(wingUserId);
}

export async function getSession(studentId: number, sessionType: WingSessionType) {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.studentId, studentId), eq(sessions.sessionType, sessionType)))
    .orderBy(desc(sessions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getSessionById(sessionId: number) {
  const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  return row ?? null;
}

export async function listSessions(studentId: number, types?: WingSessionType[]) {
  const where = types?.length
    ? and(eq(sessions.studentId, studentId), inArray(sessions.sessionType, types))
    : eq(sessions.studentId, studentId);
  return db.select().from(sessions).where(where).orderBy(asc(sessions.sessionType));
}

/** Idempotent: one session row per (student, type) for the fixed-arc types. */
export async function ensureSession(
  studentId: number,
  sessionType: WingSessionType,
  status: WingSessionStatus = "available",
) {
  const existing = await getSession(studentId, sessionType);
  if (existing) return existing;

  const [created] = await db
    .insert(sessions)
    .values({ studentId, sessionType, status })
    .returning();
  return created;
}

export async function startSession(sessionId: number) {
  const [row] = await db
    .update(sessions)
    .set({ status: "in_progress", startedAt: new Date(), updatedAt: new Date() })
    .where(eq(sessions.id, sessionId))
    .returning();
  return row;
}

export async function updateSessionStatus(sessionId: number, status: WingSessionStatus) {
  const [row] = await db
    .update(sessions)
    .set({ status, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId))
    .returning();
  return row;
}

export async function addElapsedSeconds(sessionId: number, seconds: number) {
  const [row] = await db
    .update(sessions)
    .set({ timerElapsedSeconds: seconds, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId))
    .returning();
  return row;
}

/** Completes the session and seals its transcript. */
export async function completeSession(sessionId: number) {
  const [row] = await db
    .update(sessions)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(sessions.id, sessionId))
    .returning();
  await completeTranscript(sessionId);
  return row;
}

/* ── Turns ────────────────────────────────────────────────────────────── */

/** Full turn list for a session, in order. Includes AI turns (needed to
 *  render the conversation); memory/scoring use provenance to filter. */
export async function getTurns(sessionId: number) {
  return db
    .select({
      id: transcriptTurns.id,
      position: transcriptTurns.sequencePosition,
      turnType: transcriptTurns.turnType,
      provenanceTag: transcriptTurns.provenanceTag,
      content: transcriptTurns.content,
      signalDetected: transcriptTurns.signalDetected,
      activeHeuristicId: transcriptTurns.activeHeuristicId,
      classificationStatus: transcriptTurns.classificationStatus,
      channel: transcriptTurns.channel,
      createdAt: transcriptTurns.createdAt,
    })
    .from(transcriptTurns)
    .innerJoin(transcripts, eq(transcripts.id, transcriptTurns.transcriptId))
    .where(eq(transcripts.sessionId, sessionId))
    .orderBy(asc(transcriptTurns.sequencePosition));
}

/** Turns shaped for prompt assembly (the orchestrator's message list). */
export async function getTurnsAsMessages(sessionId: number) {
  const turns = await getTurns(sessionId);
  return turns.map((t) => ({
    role: (t.provenanceTag === "ai_generated" ? "assistant" : "user") as
      | "assistant"
      | "user",
    content: t.content,
  }));
}

export const addHumanTurn = recordHumanTurn;
export const addAiTurn = recordAiTurn;

export async function countTurns(sessionId: number): Promise<number> {
  const turns = await getTurns(sessionId);
  return turns.length;
}

/* ── Artifacts ────────────────────────────────────────────────────────── */

/**
 * Writes a typed artifact. Replaces the MVP's completionData blob.
 * Re-writing the same artifact type creates a new version rather than
 * overwriting — session outputs are part of the longitudinal record.
 */
export async function putArtifact(params: {
  sessionId: number;
  artifactType: ArtifactType;
  content: unknown;
  sourceType?: "human_originated" | "ai_generated";
}) {
  const existing = await db
    .select({ version: sessionArtifacts.version })
    .from(sessionArtifacts)
    .where(
      and(
        eq(sessionArtifacts.sessionId, params.sessionId),
        eq(sessionArtifacts.artifactType, params.artifactType),
      ),
    )
    .orderBy(desc(sessionArtifacts.version))
    .limit(1);

  const [row] = await db
    .insert(sessionArtifacts)
    .values({
      sessionId: params.sessionId,
      artifactType: params.artifactType,
      content: params.content as any,
      sourceType: params.sourceType ?? "ai_generated",
      version: (existing[0]?.version ?? 0) + 1,
    })
    .returning();
  return row;
}

/** Latest version of each artifact type on a session. */
export async function getArtifacts(sessionId: number) {
  const rows = await db
    .select()
    .from(sessionArtifacts)
    .where(eq(sessionArtifacts.sessionId, sessionId))
    .orderBy(desc(sessionArtifacts.version));

  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.artifactType)) latest.set(row.artifactType, row);
  }
  return Array.from(latest.values());
}

/* ── Convenience reads keyed on the legacy user (transition helpers) ───── */

/** Artifact type each Foundation Session produces. */
export const FOUNDATION_ARTIFACT: Record<number, ArtifactType> = {
  1: "functional_identity",
  2: "credibility_assessment",
  3: "signature_story",
};

/**
 * Foundation Sessions for a legacy user, with their outcome artifacts folded
 * in as `completionData` — the shape the existing consumers expect.
 * Used by admin views, LinkedIn generation and the progress report so they all
 * read the wing corpus rather than the retired MVP tables.
 */
export async function getFoundationSessionsForUser(legacyUser: any) {
  const studentId = await studentIdFor(legacyUser);
  const rows = await listSessions(studentId, FOUNDATION_TYPES);

  return Promise.all(
    rows.map(async (row) => {
      const n = foundationNumber(row.sessionType);
      const artifact =
        row.status === "completed"
          ? await getArtifact(row.id, FOUNDATION_ARTIFACT[n])
          : null;
      return {
        id: row.id,
        sessionNumber: n,
        sessionType: row.sessionType,
        status: row.status,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        timerElapsed: row.timerElapsedSeconds,
        // jsonb: shape varies by session, so callers narrow it themselves.
        completionData: (artifact?.content ?? null) as any,
      };
    }),
  );
}

/** A single Foundation Session (1|2|3) for a legacy user, or null. */
export async function getFoundationSessionForUser(legacyUser: any, n: number) {
  const all = await getFoundationSessionsForUser(legacyUser);
  return all.find((s) => s.sessionNumber === n) ?? null;
}

/** Convenience: the latest artifact of one type, or null. */
export async function getArtifact(sessionId: number, artifactType: ArtifactType) {
  const [row] = await db
    .select()
    .from(sessionArtifacts)
    .where(
      and(
        eq(sessionArtifacts.sessionId, sessionId),
        eq(sessionArtifacts.artifactType, artifactType),
      ),
    )
    .orderBy(desc(sessionArtifacts.version))
    .limit(1);
  return row ?? null;
}

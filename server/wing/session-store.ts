import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  sessions,
  sessionArtifacts,
  students,
  transcripts,
  transcriptTurns,
} from "@shared/wing-schema";
import { ensureStudent, studentIdForWingUser } from "./bootstrap";
import { recordHumanTurn, recordAiTurn, completeTranscript } from "./provenance";
import { isAiTurn } from "./turn-type";

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

/**
 * The three Foundation rows, all `available`. Idempotent.
 *
 * IG-UX01, ruling 1: "every module enterable at any time; depth adapts, access does not."
 * This used to write `locked` onto sessions 2 and 3, and an identical copy of the loop
 * lived in `server/routes.ts` — so the two had to be corrected in lockstep, which is the
 * shape of bug that has already cost this codebase three renumbered gate codes. One
 * function now, called from both.
 *
 * `available` is not passed: it is the column default, and letting the schema state it
 * means a future caller cannot accidentally reintroduce a status the ruling removed.
 */
export async function ensureFoundationArc(studentId: number) {
  const existing = await listSessions(studentId, FOUNDATION_TYPES);
  if (existing.length >= FOUNDATION_TYPES.length) return existing;

  const present = new Set(existing.map((s) => s.sessionType));
  for (const type of FOUNDATION_TYPES) {
    if (present.has(type)) continue;
    await ensureSession(studentId, type);
  }
  return listSessions(studentId, FOUNDATION_TYPES);
}

/** The Foundation session numbers this student has finished. Informational only. */
export async function completedFoundationNumbers(studentId: number): Promise<number[]> {
  const rows = await listSessions(studentId, FOUNDATION_TYPES);
  return rows
    .filter((r) => r.status === "completed")
    .map((r) => foundationNumber(r.sessionType));
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

/**
 * Turns shaped for prompt assembly (the orchestrator's message list).
 *
 * Speaker comes from `turn_type` via `isAiTurn`, never from `provenance_tag`.
 * Migrated turns are all stamped `provenance_unknown` by design, so keying on
 * provenance rendered every turn of every migrated session as the student —
 * including Wing's own prior questions, which it would then be asked to
 * continue from.
 */
export async function getTurnsAsMessages(sessionId: number) {
  const turns = await getTurns(sessionId);
  return turns.map((t) => ({
    role: (isAiTurn(t.turnType) ? "assistant" : "user") as "assistant" | "user",
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

/**
 * The student's session for a type, in one round trip.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * `studentIdFor()` then `getSession()` is the opening of nearly every session
 * endpoint, and it is two sequential queries to answer one question. On a
 * co-located database that is invisible. Against a remote one — local
 * development pointed at the stage database, which is how this project is
 * actually developed — each hop is one to two seconds of pure latency, and the
 * session timer alone was spending six seconds on three trivial statements.
 *
 * Joining through `students` costs nothing extra: `students.user_id` is unique
 * and indexed, and the session lookup was already filtered by `student_id`.
 *
 * Returns the student id alongside the session because most callers need both,
 * and returning only the session would send them back for the id.
 */
export async function getSessionForUser(
  wingUserId: number,
  sessionType: WingSessionType,
): Promise<{ studentId: number; session: typeof sessions.$inferSelect | null } | null> {
  const rows = await db
    .select({ studentId: students.id, session: sessions })
    .from(students)
    .leftJoin(
      sessions,
      and(eq(sessions.studentId, students.id), eq(sessions.sessionType, sessionType)),
    )
    .where(eq(students.userId, wingUserId))
    .orderBy(desc(sessions.createdAt))
    .limit(1);

  if (!rows.length) return null;
  return { studentId: rows[0].studentId, session: rows[0].session ?? null };
}

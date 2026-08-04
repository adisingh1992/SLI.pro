import { storage } from "../storage";
import * as store from "./session-store";
import type { WingSessionType } from "./session-store";
import { isAiTurn } from "./turn-type";

/**
 * Enhancement Modules, backed by the Wing schema.
 *
 * Exposes the same method surface the routes already use, so the cutover is a
 * mechanical swap rather than a rewrite of a 1,300-line file — but every read
 * and write now lands in `wing.sessions` / `transcripts` / `transcript_turns` /
 * `session_artifacts`, with provenance assigned at capture.
 *
 * Key mapping: a "module" IS a wing session of type enhancement_a|b|c, so
 * `module.id` is the wing session id and message calls keyed on `moduleId`
 * work unchanged.
 *
 * `completionData` is derived from the module_outcome artifact rather than
 * being a column, and `messages` are derived from turns.
 */

export type ModuleCode = "A" | "B" | "C";

const typeFor = (code: string): WingSessionType =>
  `enhancement_${code.toLowerCase()}` as WingSessionType;

const codeFor = (t: string): ModuleCode =>
  t.replace("enhancement_", "").toUpperCase() as ModuleCode;

/** Legacy-shaped module view over a wing session + its outcome artifact. */
export type ModuleView = {
  id: number; // wing session id
  userId: number;
  moduleCode: ModuleCode;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  timerElapsed: number;
  completionData: any | null;
};

/** Post-cutover the caller IS a wing user, so no legacy lookup is needed. */
async function legacyUserFor(userId: number) {
  return { id: userId } as any;
}

async function toView(row: any, userId: number): Promise<ModuleView> {
  const artifact = await store.getArtifact(row.id, "module_outcome");
  return {
    id: row.id,
    userId,
    moduleCode: codeFor(row.sessionType),
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    timerElapsed: row.timerElapsedSeconds,
    completionData: artifact?.content ?? null,
  };
}

/* ── Reads ─────────────────────────────────────────────────────────────── */

export async function getEnhancementModule(
  userId: number,
  moduleCode: string,
): Promise<ModuleView | undefined> {
  const studentId = await store.studentIdFor(await legacyUserFor(userId));
  const row = await store.getSession(studentId, typeFor(moduleCode));
  return row ? toView(row, userId) : undefined;
}

export async function getEnhancementModulesForUser(
  userId: number,
): Promise<ModuleView[]> {
  const studentId = await store.studentIdFor(await legacyUserFor(userId));
  const rows = await store.listSessions(studentId, store.ENHANCEMENT_TYPES);
  return Promise.all(rows.map((r) => toView(r, userId)));
}

export async function getEnhancementModuleMessages(moduleId: number) {
  const turns = await store.getTurns(moduleId);
  return turns.map((t) => ({
    id: t.id,
    moduleId,
    // turn_type, not provenance_tag: migrated turns are all provenance_unknown
    // by design, so keying on provenance showed every migrated module message
    // as the student. See isAiTurn.
    role: (isAiTurn(t.turnType) ? "assistant" : "user") as "assistant" | "user",
    content: t.content,
    createdAt: t.createdAt,
    // Wing additions, available to callers that want them.
    turnType: t.turnType,
    provenanceTag: t.provenanceTag,
  }));
}

export async function getEnhancementModuleWithMessages(
  userId: number,
  moduleCode: string,
) {
  const module = await getEnhancementModule(userId, moduleCode);
  if (!module) return undefined;
  const messages = await getEnhancementModuleMessages(module.id);
  return { module, messages };
}

/* ── Writes ────────────────────────────────────────────────────────────── */

export async function createEnhancementModule(data: {
  userId: number;
  moduleCode: string;
  status?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  timerElapsed?: number | null;
}): Promise<ModuleView> {
  const legacyUser = await legacyUserFor(data.userId);
  const studentId = await store.studentIdFor(legacyUser);

  // Enhancement Modules are never locked: skippable, any order (spec §8 / A3).
  const row = await store.ensureSession(
    studentId,
    typeFor(data.moduleCode),
    (data.status as any) ?? "available",
  );

  if (data.startedAt && !row.startedAt) {
    await store.startSession(row.id);
  }

  return toView(row, data.userId);
}

export async function createEnhancementModuleMessage(data: {
  moduleId: number;
  role: "user" | "assistant";
  content: string;
}) {
  const turn =
    data.role === "assistant"
      ? await store.addAiTurn(data.moduleId, data.content)
      : await store.addHumanTurn(data.moduleId, data.content);
  return {
    id: turn.id,
    moduleId: data.moduleId,
    role: data.role,
    content: turn.content,
    createdAt: turn.createdAt,
  };
}

export async function updateEnhancementModule(
  moduleId: number,
  data: {
    status?: string | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    timerElapsed?: number | null;
    completionData?: any;
  },
) {
  if (data.completionData !== undefined && data.completionData !== null) {
    // completionData becomes a typed artifact, versioned on each write.
    await store.putArtifact({
      sessionId: moduleId,
      artifactType: "module_outcome",
      content: data.completionData,
      sourceType: "ai_generated",
    });
  }

  if (typeof data.timerElapsed === "number") {
    await store.addElapsedSeconds(moduleId, data.timerElapsed);
  }

  if (data.status === "completed") {
    return store.completeSession(moduleId);
  }
  if (data.status === "in_progress") {
    const current = await store.getSessionById(moduleId);
    if (current && !current.startedAt) return store.startSession(moduleId);
    return store.updateSessionStatus(moduleId, "in_progress");
  }
  if (data.status) {
    return store.updateSessionStatus(moduleId, data.status as any);
  }

  return store.getSessionById(moduleId);
}

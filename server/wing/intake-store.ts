import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { intakeRecords } from "@shared/wing-schema";
import * as store from "./session-store";
import { studentIdForWingUser } from "./bootstrap";

/**
 * Intake, backed by the Wing schema.
 *
 * The MVP kept two separate tables — `questionnaires` (free-text background)
 * and `branding_intakes` (the staged platform questionnaire). The spec
 * replaces both with a single `intake_records` row per student (§12), holding
 * structured responses alongside the conversation captured as an intake
 * session. Both formats are retained, per feature list A1.
 *
 * Because one row now serves both, the two payloads are namespaced inside
 * `structured_responses`:
 *
 *   { questionnaire: {...}, brandingIntake: { platform, currentStage, responses } }
 *
 * `completed` and `pathway` are promoted to real columns because the engine
 * and the intake flow branch on them.
 */

type QuestionnairePayload = {
  industry?: string | null;
  background?: string | null;
  goals?: string | null;
  aspirations?: string | null;
  challenges?: string | null;
  interests?: string | null;
  timeframe?: string | null;
  rawAnswers?: unknown;
  /**
   * Nullable because the legacy Zod schema the routes validate against permits
   * null, and this type is what those routes hand over. Narrowing it here would
   * only push a coercion out to four call sites; getQuestionnaire already
   * resolves null to false on read.
   */
  isDraft?: boolean | null;
};

type BrandingIntakePayload = {
  platform?: string;
  currentStage?: number;
  responses?: Record<string, unknown>;
  marketingOptIn?: boolean;
};

type StructuredResponses = {
  questionnaire?: QuestionnairePayload;
  brandingIntake?: BrandingIntakePayload;
};

/**
 * `userId` is a WING user id after the identity cutover — the student is
 * resolved directly rather than through the legacy user record.
 */
async function studentFor(userId: number): Promise<number> {
  return studentIdForWingUser(userId);
}

/** The single intake row for a student, created on first write. */
async function ensureRecord(userId: number) {
  const studentId = await studentFor(userId);

  const [existing] = await db
    .select()
    .from(intakeRecords)
    .where(eq(intakeRecords.studentId, studentId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(intakeRecords)
    .values({ studentId, structuredResponses: {} as any })
    .returning();
  return created;
}

async function readRecord(userId: number) {
  const studentId = await studentFor(userId);
  const [row] = await db
    .select()
    .from(intakeRecords)
    .where(eq(intakeRecords.studentId, studentId))
    .limit(1);
  return row ?? null;
}

async function patchStructured(
  userId: number,
  patch: (current: StructuredResponses) => StructuredResponses,
  columns: Partial<{ completed: boolean; pathway: any }> = {},
) {
  const record = await ensureRecord(userId);
  const current = (record.structuredResponses ?? {}) as StructuredResponses;

  const [updated] = await db
    .update(intakeRecords)
    .set({
      structuredResponses: patch(current) as any,
      ...columns,
      updatedAt: new Date(),
    })
    .where(eq(intakeRecords.id, record.id))
    .returning();

  return updated;
}

/* ── Questionnaire (legacy surface) ────────────────────────────────────── */

export async function getQuestionnaire(userId: number) {
  const row = await readRecord(userId);
  const q = (row?.structuredResponses as StructuredResponses | undefined)?.questionnaire;
  if (!row || !q) return undefined;

  return {
    id: row.id,
    userId,
    industry: q.industry ?? null,
    background: q.background ?? null,
    goals: q.goals ?? null,
    aspirations: q.aspirations ?? null,
    challenges: q.challenges ?? null,
    interests: q.interests ?? null,
    timeframe: q.timeframe ?? null,
    rawAnswers: q.rawAnswers ?? null,
    isDraft: q.isDraft ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createQuestionnaire(userId: number, data: QuestionnairePayload) {
  await patchStructured(userId, (current) => ({
    ...current,
    questionnaire: { ...(current.questionnaire ?? {}), ...data },
  }));
  return getQuestionnaire(userId);
}

export async function updateQuestionnaire(userId: number, data: QuestionnairePayload) {
  return createQuestionnaire(userId, data); // upsert semantics
}

/* ── Branding intake (legacy surface) ──────────────────────────────────── */

export async function getBrandingIntake(userId: number) {
  const row = await readRecord(userId);
  const b = (row?.structuredResponses as StructuredResponses | undefined)?.brandingIntake;
  if (!row || !b) return undefined;

  return {
    id: row.id,
    userId,
    platform: b.platform ?? null,
    currentStage: b.currentStage ?? 1,
    responses: b.responses ?? {},
    completed: row.completed,
    marketingOptIn: b.marketingOptIn ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function upsertBrandingIntake(
  userId: number,
  data: BrandingIntakePayload & { completed?: boolean },
) {
  const { completed, ...rest } = data;
  await patchStructured(
    userId,
    (current) => ({
      ...current,
      brandingIntake: { ...(current.brandingIntake ?? {}), ...rest },
    }),
    completed !== undefined ? { completed } : {},
  );
  return getBrandingIntake(userId);
}

/* ── Wing-native surface ───────────────────────────────────────────────── */

/**
 * Merges fields INTO `responses`, leaving everything already there alone.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM upsertBrandingIntake ─────────────────
 * That function spreads at the `brandingIntake` level, so passing
 * `{ responses: {...} }` REPLACES the whole responses object. That is correct
 * for the form, which holds every answer in client state and posts the
 * complete set on each save — replace and merge are identical when the payload
 * is total.
 *
 * The conversational intake is the opposite: it learns one or two fields per
 * turn and sends only those. Routed through upsertBrandingIntake it would
 * discard everything captured so far on every single exchange, and the symptom
 * would be Wing asking questions it had already been given answers to — which
 * reads as the model losing track, not as a storage bug.
 */
export async function mergeIntakeResponses(
  userId: number,
  patch: Record<string, unknown>,
) {
  if (!patch || Object.keys(patch).length === 0) return;

  await patchStructured(userId, (current) => {
    const intake = current.brandingIntake ?? {};
    return {
      ...current,
      brandingIntake: {
        ...intake,
        responses: { ...(intake.responses ?? {}), ...patch },
      },
    };
  });
}

/**
 * The raw intake row, or undefined.
 *
 * Read-only accessor over the private `readRecord`, exported for the
 * conversational intake, which needs the columns the two legacy shims above do
 * not expose — `early_insight_delivered_at`, `session_id`, `verification_status`
 * and `completed`. Creating a record is deliberately still not possible through
 * this: writes go through the upsert functions so `ensureRecord` stays the one
 * place a row is born.
 */
export async function getIntakeRecord(userId: number) {
  return readRecord(userId);
}

/** Links the intake conversation (session_type = intake) to the record. */
export async function attachIntakeSession(userId: number, sessionId: number) {
  const record = await ensureRecord(userId);
  await db
    .update(intakeRecords)
    .set({ sessionId, updatedAt: new Date() })
    .where(eq(intakeRecords.id, record.id));
}

/** Records the question 8–10 preliminary-insight reveal (feature list A1). */
export async function markEarlyInsightDelivered(userId: number) {
  const record = await ensureRecord(userId);
  if (record.earlyInsightDeliveredAt) return;
  await db
    .update(intakeRecords)
    .set({ earlyInsightDeliveredAt: new Date(), updatedAt: new Date() })
    .where(eq(intakeRecords.id, record.id));
}

/** employment · venture · freelance — the founder/freelancer branch (A2). */
export async function setPathway(
  userId: number,
  pathway: "employment" | "venture" | "freelance",
) {
  await patchStructured(userId, (c) => c, { pathway });
}

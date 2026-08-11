import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { coachingNotes, monthlyCheckIns, students, users } from "@shared/wing-schema";

/**
 * Monthly check-ins and coaching notes, on wing.
 *
 * Replaces the `public.monthly_check_ins` and `public.coaching_notes` paths in
 * database-storage.ts, both of which were foreign-keyed to `public.users` — a
 * table no student created after the cutover has a row in. Coaching notes broke
 * on both keys, since the admin author was the same kind of reference.
 *
 * As with homework-store, the routes speak in wing user ids and every
 * coaching-side table keys on students.id. The translation happens here so
 * there is one place it can be wrong.
 */

export async function studentIdForUser(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: students.id })
    .from(students)
    .where(eq(students.userId, userId))
    .limit(1);
  return row?.id ?? null;
}

/* ── Monthly check-ins ──────────────────────────────────────────────────── */

export type CheckInInput = {
  month: string;
  contentPosts?: number;
  contentLinks?: string[];
  engagementFrequency?: string | null;
  newConnections?: number;
  targetConnectionPercentage?: string | null;
  recommendationImplementation?: string | null;
  implementationChallenges?: string | null;
  updatedProfileVisuals?: boolean;
  screenshotUris?: string[];
};

export async function listCheckIns(userId: number) {
  const studentId = await studentIdForUser(userId);
  if (!studentId) return [];

  return db
    .select()
    .from(monthlyCheckIns)
    .where(eq(monthlyCheckIns.studentId, studentId))
    .orderBy(desc(monthlyCheckIns.month));
}

export async function getCheckIn(userId: number, month: string) {
  const studentId = await studentIdForUser(userId);
  if (!studentId) return null;

  const [row] = await db
    .select()
    .from(monthlyCheckIns)
    .where(and(eq(monthlyCheckIns.studentId, studentId), eq(monthlyCheckIns.month, month)))
    .limit(1);
  return row ?? null;
}

/**
 * Creates or updates the check-in for a month.
 *
 * Upsert on (student, month) rather than insert-only. The legacy table had no
 * uniqueness constraint, so a student who submitted March twice produced two
 * rows and both counted in any report — "posts published" was silently double
 * counted for anyone who resubmitted.
 */
export async function upsertCheckIn(userId: number, input: CheckInInput) {
  const studentId = await studentIdForUser(userId);
  if (!studentId) return null;

  const values = {
    studentId,
    month: input.month,
    contentPosts: input.contentPosts ?? 0,
    contentLinks: input.contentLinks ?? [],
    engagementFrequency: input.engagementFrequency ?? null,
    newConnections: input.newConnections ?? 0,
    targetConnectionPercentage: input.targetConnectionPercentage ?? null,
    recommendationImplementation: input.recommendationImplementation ?? null,
    implementationChallenges: input.implementationChallenges ?? null,
    updatedProfileVisuals: input.updatedProfileVisuals ?? false,
    screenshotUris: input.screenshotUris ?? [],
  };

  const [row] = await db
    .insert(monthlyCheckIns)
    .values(values)
    .onConflictDoUpdate({
      target: [monthlyCheckIns.studentId, monthlyCheckIns.month],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();

  return row;
}

/* ── Coaching notes ─────────────────────────────────────────────────────── */

export async function listNotes(userId: number) {
  const studentId = await studentIdForUser(userId);
  if (!studentId) return [];

  return db
    .select({
      id: coachingNotes.id,
      content: coachingNotes.content,
      authorUserId: coachingNotes.authorUserId,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
      createdAt: coachingNotes.createdAt,
      updatedAt: coachingNotes.updatedAt,
    })
    .from(coachingNotes)
    // LEFT, not INNER: author_user_id is nullable because staff accounts were
    // not all migrated, and an inner join would hide those notes entirely.
    .leftJoin(users, eq(users.id, coachingNotes.authorUserId))
    .where(eq(coachingNotes.studentId, studentId))
    .orderBy(desc(coachingNotes.createdAt));
}

export async function createNote(params: {
  userId: number;
  authorUserId: number | null;
  content: string;
}) {
  const studentId = await studentIdForUser(params.userId);
  if (!studentId) return null;

  const [row] = await db
    .insert(coachingNotes)
    .values({
      studentId,
      authorUserId: params.authorUserId,
      content: params.content,
    })
    .returning();

  return row;
}

export async function updateNote(id: number, content: string) {
  const [row] = await db
    .update(coachingNotes)
    .set({ content, updatedAt: new Date() })
    .where(eq(coachingNotes.id, id))
    .returning();
  return row ?? null;
}

export async function deleteNote(id: number) {
  await db.delete(coachingNotes).where(eq(coachingNotes.id, id));
}

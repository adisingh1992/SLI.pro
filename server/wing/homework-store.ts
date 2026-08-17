import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { homeworkAssignments, students } from "@shared/wing-schema";

/**
 * Coach-assigned homework, on wing.
 *
 * Replaces the `public.homework_assignments` path in database-storage.ts, whose
 * user_id foreign key pointed at `public.users` — a table no post-cutover
 * student has a row in. Assigning and answering both failed for them.
 *
 * ── THE ROUTES SPEAK IN USER IDS, THIS STORE SPEAKS IN STUDENT IDS ───────
 * Every caller has a `wing.users.id` from the session or the admin URL, and
 * every coaching-side table keys on `students.id`. The translation happens here
 * rather than in the routes so there is one place it can be wrong, and so a
 * route cannot accidentally pass the wrong one — they are both integers, which
 * is precisely what makes that mistake invisible.
 */

export type Homework = {
  id: number;
  studentId: number;
  questionText: string;
  answerText: string | null;
  answeredAt: string | null;
  createdAt: string;
};

/** wing.users.id → wing.students.id. Null when the user is not a student. */
export async function studentIdForUser(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: students.id })
    .from(students)
    .where(eq(students.userId, userId))
    .limit(1);
  return row?.id ?? null;
}

const shape = {
  id: homeworkAssignments.id,
  studentId: homeworkAssignments.studentId,
  questionText: homeworkAssignments.questionText,
  answerText: homeworkAssignments.answerText,
  answeredAt: homeworkAssignments.answeredAt,
  createdAt: homeworkAssignments.createdAt,
};

/** Newest first — the most recently assigned question is the live one. */
export async function listForUser(userId: number) {
  const studentId = await studentIdForUser(userId);
  if (!studentId) return [];

  return db
    .select(shape)
    .from(homeworkAssignments)
    .where(eq(homeworkAssignments.studentId, studentId))
    .orderBy(desc(homeworkAssignments.createdAt));
}

export async function getById(id: number) {
  const [row] = await db
    .select(shape)
    .from(homeworkAssignments)
    .where(eq(homeworkAssignments.id, id))
    .limit(1);
  return row ?? null;
}

export async function create(params: {
  userId: number;
  assignedByUserId: number | null;
  questionText: string;
}) {
  const studentId = await studentIdForUser(params.userId);
  if (!studentId) return null;

  const [row] = await db
    .insert(homeworkAssignments)
    .values({
      studentId,
      assignedByUserId: params.assignedByUserId,
      questionText: params.questionText,
    })
    .returning(shape);

  return row;
}

export async function updateQuestion(id: number, questionText: string) {
  const [row] = await db
    .update(homeworkAssignments)
    .set({ questionText, updatedAt: new Date() })
    .where(eq(homeworkAssignments.id, id))
    .returning(shape);
  return row ?? null;
}

/**
 * Records a student's answer.
 *
 * Ownership is enforced in the WHERE clause rather than by fetching first and
 * comparing: a check-then-write leaves a window, and more practically it is one
 * more place to forget the comparison. A student answering someone else's
 * homework updates zero rows and gets a 404.
 */
export async function answer(params: {
  id: number;
  userId: number;
  answerText: string;
}) {
  const studentId = await studentIdForUser(params.userId);
  if (!studentId) return null;

  const [row] = await db
    .update(homeworkAssignments)
    .set({
      answerText: params.answerText,
      answeredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(homeworkAssignments.id, params.id),
        eq(homeworkAssignments.studentId, studentId),
      ),
    )
    .returning(shape);

  return row ?? null;
}

export async function remove(id: number) {
  await db.delete(homeworkAssignments).where(eq(homeworkAssignments.id, id));
}

/**
 * How many assigned questions the student has not answered.
 *
 * ── WHY THIS ONE TAKES A STUDENT ID ──────────────────────────────────────
 * Every other function here takes a `wing.users.id` because its caller is a
 * route holding a session or an admin URL. This one is called by the heuristics
 * engine, which works in student ids throughout and would otherwise have to
 * translate back to a user id purely to have this file translate it forward
 * again. The parameter is named for what it is so the two cannot be confused.
 *
 * ── WHAT IT IS FOR ───────────────────────────────────────────────────────
 * IG-U05, the between-session task follow-up tone gate, says it "fires at
 * session start or Radar check-in when uncompleted tasks exist in the task log".
 * This is that condition. Without it the gate's rule text — a page on how to
 * follow up on tasks without shaming anyone — would be compiled into turns where
 * no task exists, which is likelier to invent a follow-up than to shape one.
 */
export async function countUnansweredForStudent(studentId: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(homeworkAssignments)
    .where(
      and(
        eq(homeworkAssignments.studentId, studentId),
        isNull(homeworkAssignments.answeredAt),
      ),
    );
  return Number(row?.n ?? 0);
}


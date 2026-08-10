import { eq } from "drizzle-orm";
import { db } from "../db";
import { students } from "@shared/wing-schema";
import { log } from "../logger";

/**
 * Onboarding wizard progress, on wing.students.
 *
 * Replaces `public.profiles`, which held exactly two useful columns
 * (completion_step, is_complete) behind a whole table and a foreign key to
 * `public.users`.
 *
 * ── WHY IT HAD TO MOVE ───────────────────────────────────────────────────
 * Registration creates a `wing.users` row. `public.profiles.user_id` points at
 * `public.users`. So every new signup failed on
 * `profiles_user_id_users_id_fk` — registration was broken for anyone who was
 * not already migrated, which is every real new student.
 *
 * It went unnoticed because migrated users have rows in BOTH tables, and
 * everyone testing was migrated. The only people who could hit it were the
 * ones the August partnerships are for.
 *
 * Shaped to match the old IStorage profile methods so the call sites change by
 * one import rather than by rewriting three endpoints.
 */

export type OnboardingProfile = {
  userId: number;
  completionStep: number;
  isComplete: boolean;
};

/** By WING user id. Returns null when the student row does not exist yet. */
export async function getProfile(wingUserId: number): Promise<OnboardingProfile | null> {
  try {
    const [row] = await db
      .select({
        userId: students.userId,
        completionStep: students.onboardingStep,
        isComplete: students.onboardingComplete,
      })
      .from(students)
      .where(eq(students.userId, wingUserId))
      .limit(1);
    return row ?? null;
  } catch (err) {
    log(`onboarding profile lookup failed: ${(err as Error).message}`, "onboarding");
    return null;
  }
}

/**
 * Updates progress. Idempotent, and a no-op when the student row is missing
 * rather than an error — `ensureStudent` owns creating it, and onboarding
 * progress is not worth failing a request over.
 */
export async function updateProfile(
  wingUserId: number,
  data: { completionStep?: number | null; isComplete?: boolean | null },
): Promise<OnboardingProfile | null> {
  try {
    const patch: Record<string, unknown> = {};
    if (typeof data.completionStep === "number") patch.onboardingStep = data.completionStep;
    if (typeof data.isComplete === "boolean") patch.onboardingComplete = data.isComplete;
    if (!Object.keys(patch).length) return getProfile(wingUserId);

    await db.update(students).set(patch).where(eq(students.userId, wingUserId));
    return getProfile(wingUserId);
  } catch (err) {
    log(`onboarding profile update failed: ${(err as Error).message}`, "onboarding");
    return null;
  }
}

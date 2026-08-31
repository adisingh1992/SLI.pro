import { eq } from "drizzle-orm";
import { db } from "../db";
import { studentDemographics } from "@shared/wing-schema";

/**
 * The institutional reporting block. One writer, one reader, and neither is a prompt.
 *
 * ── THE WHOLE POINT OF THIS FILE IS WHAT IT DOES NOT EXPORT ──────────────
 * The signup form promises that this data "does not affect your Wing experience". That
 * promise lives in three places: the separate table (migration 0035), this module being
 * the only thing that touches it, and the absence of any function here shaped like
 * `demographicsFor(studentId)` returning a record a context builder could spread into a
 * prompt.
 *
 * `saveDemographics` writes. `demographicsForReporting` reads, and its name is the
 * warning — it exists for an institutional export that does not yet have a screen. If a
 * third function is ever needed, the question to answer first is which of those two it
 * is, and if the honest answer is "neither, a prompt needs it", the answer is no.
 */

export type Demographics = {
  age: number | null;
  gender: string | null;
  genderSelfDescribe: string | null;
  ethnicities: string[];
  marketingOptIn: boolean;
};

/**
 * Records what a student told the registration form.
 *
 * Upsert on `student_id`, which is unique: registering is the only path here today, but a
 * second call must correct the row rather than fail on the constraint or leave a stale
 * one — a student who re-registers after a deleted account is a real case, and so is a
 * retry.
 *
 * `privacy_accepted_at` is stamped here rather than passed in. The form cannot submit
 * without the acknowledgement ticked, so the moment the row is written IS the moment they
 * accepted, and taking a client-supplied timestamp for a consent record is how consent
 * records stop being evidence of anything.
 */
export async function saveDemographics(studentId: number, d: Demographics): Promise<void> {
  const now = new Date();

  await db
    .insert(studentDemographics)
    .values({
      studentId,
      age: d.age,
      gender: d.gender,
      genderSelfDescribe: d.genderSelfDescribe,
      ethnicities: d.ethnicities,
      marketingOptIn: d.marketingOptIn,
      privacyAcceptedAt: now,
    })
    .onConflictDoUpdate({
      target: studentDemographics.studentId,
      set: {
        age: d.age,
        gender: d.gender,
        genderSelfDescribe: d.genderSelfDescribe,
        ethnicities: d.ethnicities,
        marketingOptIn: d.marketingOptIn,
        privacyAcceptedAt: now,
        updatedAt: now,
      },
    });
}

/**
 * One student's block, for an institutional export.
 *
 * Named for its only legitimate caller. There is no export screen yet; when there is, it
 * belongs behind `isPlatformAdmin` or an institution-scoped guard, and it should almost
 * certainly aggregate rather than list — a per-student table of gender and ethnicity is a
 * report almost nobody actually needs.
 */
export async function demographicsForReporting(studentId: number) {
  const [row] = await db
    .select()
    .from(studentDemographics)
    .where(eq(studentDemographics.studentId, studentId))
    .limit(1);
  return row ?? null;
}

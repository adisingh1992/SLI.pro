import { eq } from "drizzle-orm";
import { db } from "../db";
import { students } from "@shared/wing-schema";
import type { AdminScope } from "../admin-guards";

/**
 * Membership lookups for admin scoping.
 *
 * `admin-guards.ts` derives WHAT a caller may see from the session and touches
 * no database. This file answers WHO is in that scope, which needs one. Keeping
 * them apart means the authorisation decision stays a pure function that can be
 * read in one sitting, and the queries stay where every other query lives.
 *
 * Both functions key on WING USER ids, because that is what `/api/admin/...`
 * routes carry in their paths (`req.params.userId`) and what `req.user.id` is.
 * The institution binding lives one join away on `students`.
 */

/**
 * The wing user ids belonging to an institution.
 *
 * A Set rather than a filtered query so that callers already holding a cohort
 * list — `/api/admin/users` builds one for the whole platform in two queries —
 * can narrow it without a third round trip per student.
 */
export async function userIdsForInstitution(institutionId: number): Promise<Set<number>> {
  const rows = await db
    .select({ userId: students.userId })
    .from(students)
    .where(eq(students.institutionId, institutionId));
  return new Set(rows.map((r) => r.userId));
}

/**
 * Whether a scope may read this student.
 *
 * Note what "all" means: every student, INCLUDING the ones with no institution.
 * Direct/B2C students and anybody whose email domain matched no partner are
 * invisible to every institution scope, which is correct — they belong to no
 * cohort — but they must stay visible to SLIpro staff, who are the only people
 * who can repair a mis-assignment.
 */
export async function isStudentInScope(scope: AdminScope, userId: number): Promise<boolean> {
  if (scope.kind === "all") return true;

  const [row] = await db
    .select({ institutionId: students.institutionId })
    .from(students)
    .where(eq(students.userId, userId))
    .limit(1);

  return row?.institutionId === scope.institutionId;
}

/**
 * `isStudentInScope`, refusing with a 404 rather than a 403.
 *
 * 404 and not 403 deliberately, and this is the one place in the codebase where
 * that choice is right: `isPlatformAdmin` returns 403 because the caller is a
 * legitimate admin who reached a surface above their level, and saying so is
 * useful. Here the caller supplied somebody else's id, and 403 would confirm
 * that the id exists — letting a partner administrator enumerate the other
 * partner's students by watching which ids answer 403 and which answer 404.
 *
 * Returns false having already sent the response.
 */
export async function requireStudentInScope(
  scope: AdminScope,
  userId: number,
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
): Promise<boolean> {
  if (await isStudentInScope(scope, userId)) return true;
  res.status(404).json({ error: "Student not found" });
  return false;
}

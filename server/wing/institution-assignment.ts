import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { adminAuditLog, institutions, schoolCycles, students, users } from "@shared/wing-schema";
import { log } from "../logger";

/**
 * Assigning students to their institution (Feature List B4 / partnerships).
 *
 * ── THE GAP THIS FILLS ───────────────────────────────────────────────────
 * `identity.createUser` creates every student as origin='direct' with
 * institution_id NULL, and nothing anywhere set it afterwards. So the cohort
 * dashboard's institution filter, the cohort-scoped completion rates, and every
 * number a partner would be shown returned zero — not because the students were
 * not there, but because none of them were ever attached to anything.
 *
 * ── WHY EMAIL DOMAIN ─────────────────────────────────────────────────────
 * A student registering with a berkeley.edu address is a Berkeley student, and
 * that is both the institutional programme's own definition and the only signal
 * available without asking. Asking would put an institution-selection question
 * in front of someone at registration, which is a worse experience and produces
 * worse data — people pick the wrong one.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
 * It never REASSIGNS. A student already attached to an institution keeps that
 * attachment even if their email later matches a different one, because cohort
 * membership is a fact about a programme they enrolled in, not about their
 * current address. Moving someone between cohorts silently would corrupt both
 * institutions' reporting, and it is not a decision code should be making.
 */

/** Lowercased domain of an email, or null. */
export function domainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/**
 * The institution owning an email domain, plus its current cycle.
 *
 * Subdomains match their parent: a student on `haas.berkeley.edu` belongs to
 * Berkeley. Without this, every departmental subdomain would need listing, and
 * the ones nobody thought of would silently fall through to unassigned.
 */
export async function institutionForEmail(email: string) {
  const domain = domainOf(email);
  if (!domain) return null;

  const rows = await db
    .select({
      id: institutions.id,
      name: institutions.name,
      domains: institutions.emailDomains,
    })
    .from(institutions)
    .where(eq(institutions.status, "active" as any));

  for (const inst of rows) {
    for (const d of inst.domains ?? []) {
      const owned = d.trim().toLowerCase();
      if (!owned) continue;
      if (domain === owned || domain.endsWith(`.${owned}`)) {
        return inst;
      }
    }
  }

  return null;
}

/** The cycle a newly assigned student joins — the most recent active one. */
async function currentCycleFor(institutionId: number): Promise<number | null> {
  const [cycle] = await db
    .select({ id: schoolCycles.id })
    .from(schoolCycles)
    .where(
      and(
        eq(schoolCycles.institutionId, institutionId),
        eq(schoolCycles.status, "active" as any),
      ),
    )
    .orderBy(desc(schoolCycles.cycleYear))
    .limit(1);

  return cycle?.id ?? null;
}

/**
 * Attaches one student to their institution, if their email matches one.
 *
 * Safe to call on every registration. Returns null when there is no match,
 * which is the common case — direct/B2C students are not an error.
 */
export async function assignOnRegistration(userId: number): Promise<{
  institutionId: number;
  institutionName: string;
} | null> {
  try {
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return null;

    const institution = await institutionForEmail(user.email);
    if (!institution) return null;

    const cycleId = await currentCycleFor(institution.id);

    const updated = await db
      .update(students)
      .set({
        institutionId: institution.id,
        cycleId,
        origin: "institutional" as any,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(students.userId, userId),
          // Only when unassigned. See the note at the top — an existing
          // attachment is never overwritten.
          isNull(students.institutionId),
        ),
      )
      .returning({ id: students.id });

    if (!updated.length) return null;

    log(
      `student ${updated[0].id} assigned to ${institution.name}` +
        (cycleId ? ` (cycle ${cycleId})` : " — no active cycle"),
      "institutions",
    );

    return { institutionId: institution.id, institutionName: institution.name };
  } catch (err) {
    /*
     * Never throws. Assignment failing must not fail a registration — a
     * student who cannot sign up is a far worse outcome than a student whose
     * cohort attribution needs backfilling later.
     */
    log(`institution assignment failed for user ${userId}: ${(err as Error).message}`, "institutions");
    return null;
  }
}

/* ── Manual repair ───────────────────────────────────────────────────────── */

/**
 * Unattached students, with the signal that says which ones are probably wrong.
 *
 * ── THE HOLE THIS CLOSES ─────────────────────────────────────────────────
 * Domain matching is the right default and it has one unrecoverable failure: a
 * Berkeley student who registers with a personal Gmail address matches nothing,
 * silently becomes direct/B2C, and is invisible to Berkeley's cohort reporting
 * forever. `backfill()` cannot repair them — it re-runs the same domain match
 * and fails identically — and until now no other code path wrote
 * `students.institution_id` at all. Students routinely register with personal
 * addresses, so this is not an edge case.
 *
 * ── WHY THERE IS STILL NO QUESTION AT REGISTRATION ───────────────────────
 * The note at the top of this file argues against asking, and it is right:
 * an institution picker adds friction and people choose wrong. It is also
 * unnecessary, because the form ALREADY asks how they heard about us, and
 * `university_partnership` is one of the answers. A student who selected it and
 * whose domain matched nothing has told us they are institutional and told us
 * we could not confirm it — a contradiction that is detectable with no new
 * question and no new column.
 *
 * `claimsPartnership` marks those. They are the list to work through; the rest
 * are ordinary direct students and are not a problem to be fixed.
 *
 * ── WHO IS NOT ON THIS LIST ──────────────────────────────────────────────
 * Only people with `role = 'student'`, and no test accounts.
 *
 * `identity.createUser` inserts a `students` row for EVERY user it creates,
 * whatever their role — so SLIpro staff, institution administrators and advisors
 * all have one, all have a NULL institution, and all appeared here. An admin has
 * no cohort to belong to, so every one of them was a permanent item on a list of
 * things to fix.
 *
 * Both exclusions happen in the QUERY rather than on the client, because the
 * counts on the screen are computed from this result. Filtering in the browser
 * would have shrunk the table while leaving "unattached in total" reporting the
 * unfiltered number — a figure nobody could reconcile with the rows under it,
 * which is the specific failure the stat cards are written to avoid.
 *
 * `excludedTestAccounts` is returned rather than silently dropped: a hidden
 * exclusion that changes a number is the same problem in a quieter form.
 */
export async function listUnattached() {
  const rows = await db
    .select({
      userId: students.userId,
      studentId: students.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      discoverySource: users.discoverySource,
      isTestUser: users.isTestUser,
      createdAt: students.createdAt,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(
      and(
        isNull(students.institutionId),
        // Students only. Staff, institution admins and advisors each carry a
        // students row they will never use.
        eq(users.role, "student" as any),
      ),
    )
    .orderBy(desc(students.createdAt));

  const excludedTestAccounts = rows.filter((r) => r.isTestUser).length;

  return {
    students: rows
      .filter((r) => !r.isTestUser)
      .map(({ isTestUser: _drop, ...r }) => ({
        ...r,
        domain: domainOf(r.email),
        /** Said they came via a university partnership, but matched no domain. */
        claimsPartnership: r.discoverySource === "university_partnership",
      })),
    excludedTestAccounts,
  };
}

/**
 * Attaches a student to an institution by explicit human decision.
 *
 * This is the one path that may REASSIGN, and the exception is deliberate. The
 * note at the top of this file says moving someone between cohorts is "not a
 * decision code should be making" — which is an argument about code, not about
 * people. A human correcting a wrong attribution is exactly who should make it,
 * so the action is permitted here and written to `admin_audit_log` with the
 * actor attached. Nothing else in the codebase writes that table yet; an
 * attribution change that alters what two institutions are reported as owning is
 * a reasonable place to start.
 *
 * Passing `institutionId: null` detaches, returning the student to direct/B2C —
 * needed when a student was attached to the wrong partner.
 */
export async function assignInstitutionManually(params: {
  userId: number;
  institutionId: number | null;
  /** Defaults to the institution's current active cycle. */
  cycleId?: number | null;
  actorUserId: number;
}): Promise<
  | { ok: true; institutionId: number | null; cycleId: number | null; previousInstitutionId: number | null }
  | { ok: false; reason: "student_not_found" | "institution_not_found" }
> {
  const [existing] = await db
    .select({ id: students.id, institutionId: students.institutionId })
    .from(students)
    .where(eq(students.userId, params.userId))
    .limit(1);
  if (!existing) return { ok: false, reason: "student_not_found" };

  let cycleId: number | null = null;

  if (params.institutionId != null) {
    const [inst] = await db
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.id, params.institutionId))
      .limit(1);
    if (!inst) return { ok: false, reason: "institution_not_found" };

    cycleId =
      params.cycleId !== undefined
        ? params.cycleId
        : await currentCycleFor(params.institutionId);
  }

  await db
    .update(students)
    .set({
      institutionId: params.institutionId,
      cycleId,
      origin: (params.institutionId == null ? "direct" : "institutional") as any,
      updatedAt: new Date(),
    })
    .where(eq(students.id, existing.id));

  await db.insert(adminAuditLog).values({
    actorUserId: params.actorUserId,
    action: "student.institution.assign",
    entityType: "students",
    entityId: existing.id,
    detail: {
      from: existing.institutionId,
      to: params.institutionId,
      cycleId,
    },
  });

  log(
    `student ${existing.id} reattached: ${existing.institutionId ?? "none"} -> ` +
      `${params.institutionId ?? "none"} by user ${params.actorUserId}`,
    "institutions",
  );

  return {
    ok: true,
    institutionId: params.institutionId,
    cycleId,
    previousInstitutionId: existing.institutionId,
  };
}

/**
 * Backfills every unassigned student whose email matches an institution.
 *
 * Needed because the domains did not exist until now — every student who
 * registered before this is unattached, including any Berkeley or Vanderbilt
 * students already on the platform.
 */
export async function backfill(opts: { dryRun?: boolean } = {}) {
  const unassigned = await db
    .select({ userId: students.userId, studentId: students.id, email: users.email })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(isNull(students.institutionId));

  const results: { email: string; institution: string }[] = [];
  let unmatched = 0;

  for (const s of unassigned) {
    const institution = await institutionForEmail(s.email);
    if (!institution) {
      unmatched++;
      continue;
    }

    results.push({ email: s.email, institution: institution.name });

    if (!opts.dryRun) {
      const cycleId = await currentCycleFor(institution.id);
      await db
        .update(students)
        .set({
          institutionId: institution.id,
          cycleId,
          origin: "institutional" as any,
          updatedAt: new Date(),
        })
        .where(eq(students.id, s.studentId));
    }
  }

  return { assigned: results, unmatched, considered: unassigned.length };
}

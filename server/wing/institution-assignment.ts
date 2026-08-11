import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { institutions, schoolCycles, students, users } from "@shared/wing-schema";
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

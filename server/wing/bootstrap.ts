import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { wingMigrationLinks } from "@shared/schema";
import {
  users as wingUsers,
  students as wingStudents,
  sessions as wingSessions,
} from "@shared/wing-schema";

/**
 * Bootstrap / resolution layer for the parallel-run period.
 *
 * The application still runs on the legacy MVP tables while the `wing` schema
 * becomes the system of record. Turns cannot be captured until a wing
 * `student` and `session` exist, so this module lazily resolves legacy rows to
 * their wing counterparts, idempotently.
 *
 * DESIGN NOTES
 *
 * 1. No invented institutions. Existing MVP users are not part of a Berkeley
 *    or Vanderbilt cohort, so they are created as `origin = 'direct'` students
 *    with NULL institution_id and cycle_id — exactly what the spec allows for
 *    B2C students. Fabricating a placeholder institution would pollute the
 *    institutional reporting the admin dashboard depends on. Real cohorts get
 *    real institution/cycle rows when they are onboarded.
 *
 * 2. Linkage is recorded in `wing_migration_links` (public schema,
 *    transitional) rather than by adding a legacy_id column to the wing
 *    tables, which would put migration scaffolding into the approved schema.
 *
 * 3. Everything here is idempotent and safe to call on every request.
 */

type LegacyUser = {
  id: number;
  username: string; // the MVP uses email as username
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  linkedinId?: string | null;
  professionalStatus?: string | null;
  discoverySource?: string | null;
  isAdmin?: boolean;
  isTestUser?: boolean;
};

async function getLink(legacyType: string, legacyId: number): Promise<number | null> {
  const [row] = await db
    .select({ wingId: wingMigrationLinks.wingId })
    .from(wingMigrationLinks)
    .where(
      and(
        eq(wingMigrationLinks.legacyType, legacyType),
        eq(wingMigrationLinks.legacyId, legacyId),
      ),
    )
    .limit(1);
  return row?.wingId ?? null;
}

async function putLink(legacyType: string, legacyId: number, wingId: number) {
  await db
    .insert(wingMigrationLinks)
    .values({ legacyType, legacyId, wingId })
    .onConflictDoNothing();
}

/** Resolves (or creates) the wing `users` row for a legacy MVP user. */
export async function ensureWingUser(legacyUser: LegacyUser): Promise<number> {
  const linked = await getLink("user", legacyUser.id);
  if (linked) return linked;

  const email = legacyUser.username.toLowerCase();

  // An earlier run (or the Phase 2 migration) may already have created it.
  const [existing] = await db
    .select({ id: wingUsers.id })
    .from(wingUsers)
    .where(eq(wingUsers.email, email))
    .limit(1);

  let wingUserId: number;
  if (existing) {
    wingUserId = existing.id;
  } else {
    const [created] = await db
      .insert(wingUsers)
      .values({
        email,
        firstName: legacyUser.firstName,
        lastName: legacyUser.lastName,
        phoneNumber: legacyUser.phoneNumber ?? null,
        linkedinId: legacyUser.linkedinId ?? null,
        role: legacyUser.isAdmin ? "platform_admin" : "student",
        professionalStatus: (legacyUser.professionalStatus as any) ?? null,
        discoverySource: (legacyUser.discoverySource as any) ?? null,
        isTestUser: legacyUser.isTestUser ?? false,
        // password_hash intentionally NOT copied: authentication continues to
        // run against the legacy table until cutover, and duplicating a
        // credential hash into a second location is an avoidable risk.
      })
      .returning({ id: wingUsers.id });
    wingUserId = created.id;
  }

  await putLink("user", legacyUser.id, wingUserId);
  return wingUserId;
}

/**
 * Resolves (or creates) the student for a WING user id.
 *
 * This is the post-cutover path: `req.user.id` is a wing user id, so the
 * student is found directly rather than via the legacy user and the
 * transitional links table.
 */
export async function studentIdForWingUser(wingUserId: number): Promise<number> {
  const [existing] = await db
    .select({ id: wingStudents.id })
    .from(wingStudents)
    .where(eq(wingStudents.userId, wingUserId))
    .limit(1);
  if (existing) return existing.id;

  // A user without a student row would break every coaching-side read, so
  // provision one rather than failing.
  const [created] = await db
    .insert(wingStudents)
    .values({ userId: wingUserId, origin: "direct", enrollmentStatus: "active" })
    .returning({ id: wingStudents.id });
  return created.id;
}

/** Resolves (or creates) the wing `students` row — the coaching entity. */
export async function ensureStudent(legacyUser: LegacyUser): Promise<number> {
  const wingUserId = await ensureWingUser(legacyUser);

  const [existing] = await db
    .select({ id: wingStudents.id })
    .from(wingStudents)
    .where(eq(wingStudents.userId, wingUserId))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(wingStudents)
    .values({
      userId: wingUserId,
      // Direct (B2C) until a cohort assigns them: institution_id and cycle_id
      // stay NULL rather than pointing at a fabricated institution.
      origin: "direct",
      enrollmentStatus: "active",
    })
    .returning({ id: wingStudents.id });

  return created.id;
}

/** Maps the MVP's session numbering to the wing `session_type` enum. */
export function foundationSessionType(sessionNumber: number) {
  switch (sessionNumber) {
    case 1: return "foundation_1" as const;
    case 2: return "foundation_2" as const;
    case 3: return "foundation_3" as const;
    default:
      throw new Error(`Unsupported foundation session number: ${sessionNumber}`);
  }
}

/** Maps the MVP's module codes to the wing `session_type` enum. */
export function enhancementSessionType(moduleCode: string) {
  switch (moduleCode.toUpperCase()) {
    case "A": return "enhancement_a" as const;
    case "B": return "enhancement_b" as const;
    case "C": return "enhancement_c" as const;
    default:
      throw new Error(`Unsupported enhancement module code: ${moduleCode}`);
  }
}

/**
 * Resolves (or creates) the wing `sessions` row mirroring a legacy session.
 *
 * @param legacyType  e.g. 'foundation_session' | 'enhancement_module'
 * @param legacyId    primary key of the legacy row
 */
export async function ensureWingSession(params: {
  legacyType: string;
  legacyId: number;
  legacyUser: LegacyUser;
  sessionType:
    | "intake" | "foundation_1" | "foundation_2" | "foundation_3"
    | "enhancement_a" | "enhancement_b" | "enhancement_c"
    | "ongoing_engagement" | "career_event_review" | "module_run";
  startedAt?: Date | null;
}): Promise<number> {
  const linked = await getLink(params.legacyType, params.legacyId);
  if (linked) return linked;

  const studentId = await ensureStudent(params.legacyUser);

  const [created] = await db
    .insert(wingSessions)
    .values({
      studentId,
      cycleId: null, // direct students carry no cycle
      sessionType: params.sessionType,
      status: "in_progress",
      startedAt: params.startedAt ?? new Date(),
    })
    .returning({ id: wingSessions.id });

  await putLink(params.legacyType, params.legacyId, created.id);
  return created.id;
}

/** Marks the mirrored wing session complete when the legacy session ends. */
export async function completeWingSession(
  legacyType: string,
  legacyId: number,
): Promise<void> {
  const wingSessionId = await getLink(legacyType, legacyId);
  if (!wingSessionId) return;

  await db
    .update(wingSessions)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(wingSessions.id, wingSessionId));
}

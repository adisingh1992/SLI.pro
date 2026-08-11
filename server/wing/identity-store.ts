import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  users as wingUsers,
  students as wingStudents,
  passwordResets as wingPasswordResets,
  userChannelPreferences,
} from "@shared/wing-schema";

/**
 * Identity, backed by the Wing schema.
 *
 * The spec separates the authentication identity (`users`) from the coaching
 * entity (`students`), which the MVP merged into one table (§6). After this
 * cutover, `req.user` is a wing user and `req.user.id` is a wing user id —
 * everything downstream resolves the student from it.
 *
 * The authentication MODEL is unchanged per the architecture constraint: local
 * credentials plus LinkedIn OIDC with server-side sessions. Only the storage
 * moves.
 *
 * COMPATIBILITY. The MVP's request handlers read `username`, `isAdmin` and
 * `professionalStatus` off `req.user`. Those are exposed here as derived
 * fields so ~80 call sites keep working:
 *   username → email
 *   isAdmin  → role is an admin role
 */

export type AuthUser = {
  id: number;
  email: string;
  username: string; // alias for email (MVP compatibility)
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  role: "student" | "advisor" | "institution_admin" | "platform_admin";
  isAdmin: boolean; // derived from role
  linkedinId: string | null;
  linkedinAccessToken: string | null;
  linkedinRefreshToken: string | null;
  linkedinTokenExpiry: Date | null;
  professionalStatus: string | null;
  discoverySource: string | null;
  discoverySourceOther: string | null;
  timezone: string;
  isTestUser: boolean;
  status: "active" | "suspended" | "closed";
  lastLoginAt: Date | null;
  createdAt: Date;
  passwordHash: string | null;
};

const ADMIN_ROLES = new Set(["platform_admin", "institution_admin"]);

function toAuthUser(row: any): AuthUser {
  return {
    id: row.id,
    email: row.email,
    username: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    phoneNumber: row.phoneNumber ?? null,
    role: row.role,
    isAdmin: ADMIN_ROLES.has(row.role),
    linkedinId: row.linkedinId ?? null,
    linkedinAccessToken: row.linkedinAccessToken ?? null,
    linkedinRefreshToken: row.linkedinRefreshToken ?? null,
    linkedinTokenExpiry: row.linkedinTokenExpiry ?? null,
    professionalStatus: row.professionalStatus ?? null,
    discoverySource: row.discoverySource ?? null,
    discoverySourceOther: row.discoverySourceOther ?? null,
    timezone: row.timezone,
    isTestUser: row.isTestUser,
    status: row.status,
    lastLoginAt: row.lastLoginAt ?? null,
    createdAt: row.createdAt,
    passwordHash: row.passwordHash ?? null,
  };
}

/**
 * The only shape of a user that may leave the server.
 *
 * ── ONE ALLOWLIST, USED EVERYWHERE ───────────────────────────────────────
 * Five endpoints independently did `const { passwordHash, ...rest } = user`
 * and sent `rest`. That reads as safe and is not: a denylist only excludes
 * what somebody remembered, and nobody remembered `linkedinAccessToken` or
 * `linkedinRefreshToken`. Those are live OAuth credentials, and on the admin
 * list endpoint the whole cohort's went out in a single response.
 *
 * Having one definition means a field added to `AuthUser` is private by
 * default and has to be deliberately published here. `api-contracts.test.ts`
 * fails the build if the old destructuring pattern reappears.
 *
 * `linkedinId` is reduced to a boolean: whether an account is linked is useful
 * to a client, the identifier itself is not.
 */
export function publicUser(u: AuthUser) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    phoneNumber: u.phoneNumber,
    role: u.role,
    isAdmin: u.isAdmin,
    linkedinConnected: !!u.linkedinId,
    professionalStatus: u.professionalStatus,
    discoverySource: u.discoverySource,
    discoverySourceOther: u.discoverySourceOther,
    timezone: u.timezone,
    isTestUser: u.isTestUser,
    status: u.status,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

/**
 * A profile (a user plus its nested artifacts) with the identity fields
 * replaced by the allowlist above. The nested collections — documents, SLIs,
 * sessions — carry no credentials and pass through untouched.
 */
export function publicProfile<T extends AuthUser>(profile: T) {
  const {
    passwordHash: _p,
    linkedinAccessToken: _a,
    linkedinRefreshToken: _r,
    linkedinTokenExpiry: _e,
    linkedinId: _i,
    ...rest
  } = profile;
  return { ...rest, ...publicUser(profile) };
}

/* ── Lookups ───────────────────────────────────────────────────────────── */

export async function getUser(id: number): Promise<AuthUser | undefined> {
  const [row] = await db.select().from(wingUsers).where(eq(wingUsers.id, id)).limit(1);
  return row ? toAuthUser(row) : undefined;
}

/** Case-insensitive: emails are compared lowercased. */
export async function getUserByEmail(email: string): Promise<AuthUser | undefined> {
  const [row] = await db
    .select()
    .from(wingUsers)
    .where(sql`lower(${wingUsers.email}) = lower(${email})`)
    .limit(1);
  return row ? toAuthUser(row) : undefined;
}

export async function getUserByLinkedinId(linkedinId: string): Promise<AuthUser | undefined> {
  const [row] = await db
    .select()
    .from(wingUsers)
    .where(eq(wingUsers.linkedinId, linkedinId))
    .limit(1);
  return row ? toAuthUser(row) : undefined;
}

export async function listUsers(): Promise<AuthUser[]> {
  const rows = await db.select().from(wingUsers).orderBy(wingUsers.createdAt);
  return rows.map(toAuthUser);
}

/* ── Writes ────────────────────────────────────────────────────────────── */

/**
 * Registers a user and provisions the coaching entity alongside it.
 *
 * A student row and channel preferences are created in the same breath: a
 * person who can log in but has no student record would break every
 * coaching-side read, and channel preferences drive the engagement subsystem.
 */
export async function createUser(data: {
  email: string;
  passwordHash?: string | null;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  linkedinId?: string | null;
  professionalStatus?: string | null;
  discoverySource?: string | null;
  discoverySourceOther?: string | null;
  role?: AuthUser["role"];
  isTestUser?: boolean;
}): Promise<AuthUser> {
  const [row] = await db
    .insert(wingUsers)
    .values({
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash ?? null,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber ?? null,
      linkedinId: data.linkedinId ?? null,
      professionalStatus: (data.professionalStatus as any) ?? null,
      discoverySource: (data.discoverySource as any) ?? null,
      discoverySourceOther: data.discoverySourceOther ?? null,
      role: data.role ?? "student",
      isTestUser: data.isTestUser ?? false,
    })
    .returning();

  await db
    .insert(wingStudents)
    .values({
      userId: row.id,
      // Direct (B2C) until a cohort assigns them; institution/cycle stay NULL
      // rather than pointing at a fabricated institution.
      origin: "direct",
      enrollmentStatus: "active",
    })
    .onConflictDoNothing();

  await db
    .insert(userChannelPreferences)
    .values({ userId: row.id })
    .onConflictDoNothing();

  /*
   * Attach them to their institution if the email domain matches one.
   *
   * The student row above is created as origin='direct' with a NULL
   * institution, and until this existed nothing ever changed that — so every
   * Berkeley and Vanderbilt student on the platform was invisible to their own
   * institution's cohort reporting.
   *
   * Never throws and never blocks: a failure here leaves the student
   * unassigned, which the backfill can repair, whereas a failure that took
   * registration down with it could not be repaired at all.
   */
  try {
    const { assignOnRegistration } = await import("./institution-assignment");
    await assignOnRegistration(row.id);
  } catch {
    // assignOnRegistration already swallows and logs; this is belt and braces.
  }

  return toAuthUser(row);
}

export async function updateUser(
  id: number,
  data: Partial<{
    firstName: string;
    lastName: string;
    phoneNumber: string | null;
    passwordHash: string | null;
    linkedinId: string | null;
    linkedinAccessToken: string | null;
    linkedinRefreshToken: string | null;
    linkedinTokenExpiry: Date | null;
    professionalStatus: string | null;
    discoverySource: string | null;
    role: AuthUser["role"];
    status: AuthUser["status"];
    lastLoginAt: Date;
  }>,
): Promise<AuthUser | undefined> {
  const [row] = await db
    .update(wingUsers)
    .set({ ...(data as any), updatedAt: new Date() })
    .where(eq(wingUsers.id, id))
    .returning();
  return row ? toAuthUser(row) : undefined;
}

export async function recordLogin(id: number) {
  await db
    .update(wingUsers)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(wingUsers.id, id));
}

/* ── Password resets ───────────────────────────────────────────────────── */

export async function createPasswordReset(data: {
  userId: number;
  token: string;
  expiresAt: Date;
}) {
  const [row] = await db.insert(wingPasswordResets).values(data).returning();
  return row;
}

export async function getPasswordReset(token: string) {
  const [row] = await db
    .select()
    .from(wingPasswordResets)
    .where(and(eq(wingPasswordResets.token, token), eq(wingPasswordResets.used, false)))
    .limit(1);
  return row ?? undefined;
}

export async function markPasswordResetUsed(id: number) {
  await db
    .update(wingPasswordResets)
    .set({ used: true })
    .where(eq(wingPasswordResets.id, id));
}

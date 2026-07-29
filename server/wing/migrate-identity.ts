import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { users as legacyUsers } from "@shared/schema";
import {
  users as wingUsers,
  students as wingStudents,
  userChannelPreferences,
} from "@shared/wing-schema";

/**
 * Identity migration: public.users -> wing.users
 *
 * Run once at the identity cutover:  npm run wing:migrate-identity
 *
 * Copies each legacy user into the wing schema, INCLUDING the password hash —
 * without it nobody can log in after the cutover, because authentication now
 * reads wing.users. The hash format is unchanged (scrypt, `hash.salt`), so
 * existing passwords keep working.
 *
 * Also provisions the coaching entity (`students`) and channel preferences for
 * each user, since a person who can log in but has no student row would break
 * every coaching-side read.
 *
 * Idempotent: users already present in wing (matched on lowercased email) are
 * updated rather than duplicated, so re-running is safe.
 */

function roleFor(user: { isAdmin?: boolean | null }) {
  return user.isAdmin ? ("platform_admin" as const) : ("student" as const);
}

// Assigned by initScript() before any query runs. ../db builds its pool at
// module load, so it must not be imported until DATABASE_URL is present.
let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  ({ db, pool } = await initScript());
  const legacy = await db.select().from(legacyUsers);
  console.log(`[identity] found ${legacy.length} legacy user(s)`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const user of legacy) {
    const email = (user.username ?? "").trim().toLowerCase();
    if (!email) {
      console.warn(`[identity] user ${user.id} has no username/email — skipped`);
      skipped++;
      continue;
    }

    const [existing] = await db
      .select({ id: wingUsers.id })
      .from(wingUsers)
      .where(sql`lower(${wingUsers.email}) = ${email}`)
      .limit(1);

    const values = {
      email,
      // The hash carries over verbatim; the comparison function is unchanged.
      passwordHash: user.password ?? null,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber ?? null,
      linkedinId: user.linkedinId ?? null,
      linkedinAccessToken: user.linkedinAccessToken ?? null,
      linkedinRefreshToken: user.linkedinRefreshToken ?? null,
      linkedinTokenExpiry: user.linkedinTokenExpiry ?? null,
      professionalStatus: (user.professionalStatus as any) ?? null,
      discoverySource: (user.discoverySource as any) ?? null,
      discoverySourceOther: user.discoverySourceOther ?? null,
      role: roleFor(user),
      isTestUser: user.isTestUser ?? false,
      lastLoginAt: user.lastLoginAt ?? null,
    };

    let wingUserId: number;
    if (existing) {
      await db.update(wingUsers).set(values).where(eq(wingUsers.id, existing.id));
      wingUserId = existing.id;
      updated++;
    } else {
      const [row] = await db.insert(wingUsers).values(values).returning({ id: wingUsers.id });
      wingUserId = row.id;
      created++;
    }

    // Coaching entity + channel preferences.
    await db
      .insert(wingStudents)
      .values({ userId: wingUserId, origin: "direct", enrollmentStatus: "active" })
      .onConflictDoNothing();

    await db
      .insert(userChannelPreferences)
      .values({ userId: wingUserId })
      .onConflictDoNothing();

    console.log(
      `[identity] ${existing ? "updated" : "created"} ${email} -> wing user ${wingUserId}`,
    );
  }

  console.log(
    `\n[identity] done — ${created} created, ${updated} updated, ${skipped} skipped`,
  );

  const withoutPassword = await db
    .select({ email: wingUsers.email })
    .from(wingUsers)
    .where(sql`${wingUsers.passwordHash} IS NULL AND ${wingUsers.linkedinId} IS NULL`);

  if (withoutPassword.length) {
    console.warn(
      `\n[identity] WARNING: ${withoutPassword.length} user(s) have neither a ` +
        `password nor a LinkedIn identity and cannot sign in:\n` +
        withoutPassword.map((u) => `  - ${u.email}`).join("\n"),
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[identity] migration failed:", err);
  process.exit(1);
});

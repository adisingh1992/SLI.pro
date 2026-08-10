import "dotenv/config";
import { count, desc, eq, sql } from "drizzle-orm";
import { initScript } from "../script-init";

/**
 * Verifies the B1 admin surface against the live stage database (Feature B1).
 *
 * Run:  npx tsx server/wing/check-advisor-surface.ts
 *
 * Exists because the advisee picker uses a Drizzle sub-select with an aliased
 * aggregate, and that is exactly the kind of query that typechecks cleanly and
 * then fails at runtime on the generated SQL. Reading the code is not evidence
 * that it runs; this runs it.
 *
 * Read-only. Composes a snapshot but sends nothing.
 */

async function main() {
  const { db, pool } = await initScript();
  const { institutions, sessions, students, users, advisors, advisorAppointments, messageTemplates } =
    await import("@shared/wing-schema");

  const inst = await db.select({ id: institutions.id, name: institutions.name }).from(institutions);
  console.log(`\ninstitutions: ${inst.length}`);
  for (const i of inst) console.log(`   ${i.id}  ${i.name}`);
  if (!inst.length) console.log("   !! no institutions — the advisor form has nothing to attach to");

  // Advisors are keyed to an institution, so a Berkeley advisor needs a Berkeley
  // row to file under. "SLI.pro Direct" alone is fine for testing and not enough
  // for August.
  const names = inst.map((i) => i.name.toLowerCase()).join(" ");
  for (const partner of ["berkeley", "vanderbilt"]) {
    if (!names.includes(partner)) {
      console.log(`   !! no ${partner} institution — advisors there have nowhere to be filed`);
    }
  }

  // The exact query behind /api/admin/advisees.
  const completed = db
    .select({ studentId: sessions.studentId, completed: count().as("completed") })
    .from(sessions)
    .where(eq(sessions.status, "completed" as any))
    .groupBy(sessions.studentId)
    .as("completed_sessions");

  const advisees = await db
    .select({
      id: students.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      completedSessions: sql<number>`coalesce(${completed.completed}, 0)::int`,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(completed, eq(completed.studentId, students.id))
    .orderBy(users.firstName, users.lastName);

  console.log(`\nadvisees: ${advisees.length}`);
  // Typed, not just counted: the client compares this field numerically, and
  // node-postgres returns an uncast bigint as a string.
  const t = typeof advisees[0]?.completedSessions;
  console.log(`   completedSessions arrives as ${t}${t === "number" ? "" : "  <-- WRONG, client comparisons will fail"}`);
  const withWork = advisees.filter((a) => a.completedSessions > 0);
  console.log(`   with at least one completed session: ${withWork.length}`);
  for (const a of withWork.slice(0, 5)) {
    console.log(`   ${a.id}  ${a.firstName} ${a.lastName}  ${a.completedSessions}/3`);
  }

  const tpl = await db
    .select({ key: messageTemplates.templateKey, v: messageTemplates.version })
    .from(messageTemplates)
    .where(eq(messageTemplates.active, true));
  const keys = new Set(tpl.map((t) => t.key));
  console.log(`\ntemplates active: ${tpl.length}`);
  for (const k of ["advisor_snapshot", "student_prep_incomplete", "student_prep_complete"]) {
    console.log(`   ${keys.has(k) ? "ok  " : "MISSING"} ${k}`);
  }

  console.log(`\nadvisors: ${(await db.select().from(advisors)).length}`);
  console.log(`appointments: ${(await db.select().from(advisorAppointments)).length}`);

  // The send log — the only place that answers "did it actually go out".
  // A row with failed_at set was refused by the provider; failure_reason is
  // SendGrid's own wording.
  const { messageEvents } = await import("@shared/wing-schema");
  const events = await db
    .select({
      id: messageEvents.id,
      templateKey: messageEvents.templateKey,
      sentAt: messageEvents.sentAt,
      failedAt: messageEvents.failedAt,
      failureReason: messageEvents.failureReason,
      providerMessageId: messageEvents.providerMessageId,
    })
    .from(messageEvents)
    .orderBy(desc(messageEvents.id))
    .limit(15);

  console.log(`\nlast ${events.length} send(s):`);
  for (const e of events) {
    const state = e.failedAt
      ? `FAILED  ${e.failureReason ?? ""}`
      : `sent    ${e.providerMessageId ?? "(no provider id — sent before ids were captured)"}`;
    console.log(`   ${String(e.id).padStart(4)}  ${(e.templateKey ?? "?").padEnd(24)} ${state}`);
  }

  // Compose against the most-progressed student — the case where the snapshot
  // has something to say. A student with nothing produces a valid snapshot too,
  // but it proves less.
  const target = withWork[0] ?? advisees[0];
  if (target) {
    const snap = await import("./advisor-snapshot");
    const s = await snap.compose(target.id);
    console.log(`\nsnapshot for ${target.firstName} ${target.lastName} (student ${target.id}):`);
    console.log(s ? snap.renderForEmail(s).split("\n").map((l) => "   " + l).join("\n") : "   NULL");
  }

  console.log("");
  await pool.end();
}

main().catch((e) => {
  console.error("check failed:", e);
  process.exit(1);
});

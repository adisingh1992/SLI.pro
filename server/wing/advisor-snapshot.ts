import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  advisorAppointments,
  advisors,
  sessionArtifacts,
  sessions,
  sliRecords,
  students,
  users,
} from "@shared/wing-schema";
import { log } from "../logger";
import { LIVE_SLI_STATUSES } from "./sli-store";
import * as messaging from "./messaging-store";

/**
 * Advisor pre-meeting snapshot (Feature List B1).
 *
 * Two sides, and they solve different problems:
 *
 *   ADVISOR   24 hours before an appointment, a summary of where the student
 *             actually is — so the meeting starts at strategy rather than at
 *             "so tell me about yourself".
 *   STUDENT   at appointment registration, a nudge sized to their completion
 *             state. Per the spec this exists to remove from advisors the
 *             burden of chasing students onto the platform.
 *
 * ── THE SNAPSHOT IS STORED, NOT JUST SENT ────────────────────────────────
 * `advisor_appointments.snapshot` keeps an immutable copy of what went out.
 * An advisor who reads a snapshot on Tuesday and meets the student on
 * Wednesday needs the thing they read, not a regeneration — and if a student
 * disputes what was shared, the answer has to be a record rather than a
 * re-run of the same query against changed data.
 *
 * ── WHAT IS DELIBERATELY NOT IN IT ───────────────────────────────────────
 * No transcripts and no raw turns. The snapshot carries conclusions the
 * student has seen and agreed to — their SLI, their locked function, their own
 * stated priorities. A career advisor reading a student's unedited coaching
 * conversation is a different product with different consent, and the spec
 * asks for a summary, not a transcript.
 */

/**
 * ── WHERE EACH FIELD COMES FROM, AND WHY IT MATTERS ──────────────────────
 * The three foundation sessions write different things, and the first cut of
 * this file read only Session 1 — so a student who had finished all three got
 * an advisor summary built from the leftovers of the first, omitting their
 * brand claim, their proof points and their signature story. Everything
 * Sessions 2 and 3 produce is the part an advisor can act on.
 *
 *   S1  primaryFunction, secondaryFunction, keyInsights
 *   S2  brandClaim, proofBullets, checkWorthyReason, nextSteps
 *   S3  signatureStory, brandClaim, nextSteps
 *
 * `checkWorthyReason` is the single most advisor-shaped field in the system —
 * the analysis prompt defines it as "why an investor or hiring manager would
 * bet budget on them now", which is the advisor's own question.
 *
 * `keyInsights` is the fallback, not the lead. The analysis prompt asks for it
 * in methodology shorthand — "80/20 declared", "anti-generalist commitment
 * made" — which is our vocabulary, not an advisor's. It stays because for a
 * student who has only finished Session 1 it is the only substance available,
 * and an advisor reading slightly odd phrasing beats an advisor reading a blank
 * page. Its register is worth raising with Danielle: the student sees these
 * strings too, in their own summary, described in the third person.
 */
export type Snapshot = {
  studentName: string;
  sliHeadline: string | null;
  brandClaim: string | null;
  primaryFunction: string | null;
  secondaryFunction: string | null;
  /** S2 proof points — specific, with numbers. The evidence behind the claim. */
  evidence: string[];
  /** S2 checkWorthyReason — why someone would bet on them now. */
  whyNow: string | null;
  /** S3 signature story, flattened to a title and the outcome. */
  signatureStory: { title: string; outcome: string } | null;
  /** What the student said they would do next (S2/S3). The advisor's hook. */
  nextSteps: string[];
  /** S1 methodology shorthand. Fallback only — see the note above. */
  positioningInsights: string[];
  completion: { sessionType: string; status: string; completedAt: string | null }[];
  completedCount: number;
  confidenceTrajectory: { session: string; confidence: number }[];
  generatedAt: string;
};

/** Tolerates the field being a string, an array, or absent. */
function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  if (typeof v === "string" && v.trim() !== "") return [v];
  return [];
}

/**
 * Coerces a stored snapshot of any vintage into the current shape.
 *
 * `advisor_appointments.snapshot` is an immutable record of what an advisor was
 * sent — that is the entire point of storing it. So snapshots written by an
 * older version of `compose()` are not a migration to be finished, they are a
 * permanent fact about the table. Any reader has to tolerate every shape this
 * type has ever had, forever.
 *
 * Learned by crashing the admin page: the type said `evidence: string[]`, the
 * reader trusted it, and a row written twenty minutes earlier had no such key.
 * A stored blob is `any` no matter what the TypeScript type claims — the
 * compiler checks what we write, never what we read back.
 */
export function normalizeSnapshot(raw: any): Snapshot | null {
  if (!raw || typeof raw !== "object") return null;

  const story = raw.signatureStory;
  const trajectory = Array.isArray(raw.confidenceTrajectory) ? raw.confidenceTrajectory : [];

  return {
    studentName: typeof raw.studentName === "string" ? raw.studentName : "",
    sliHeadline: raw.sliHeadline ?? null,
    brandClaim: raw.brandClaim ?? null,
    primaryFunction: raw.primaryFunction ?? null,
    secondaryFunction: raw.secondaryFunction ?? null,
    evidence: asList(raw.evidence),
    whyNow: raw.whyNow ?? null,
    signatureStory:
      story && typeof story === "object" && story.title
        ? { title: String(story.title), outcome: String(story.outcome ?? "") }
        : null,
    nextSteps: asList(raw.nextSteps),
    // `statedPriorities` was a field on the first version of this type. It is
    // folded in rather than dropped so an old snapshot still shows everything
    // the advisor actually read.
    positioningInsights: [
      ...asList(raw.positioningInsights),
      ...asList(raw.statedPriorities),
    ],
    completion: Array.isArray(raw.completion) ? raw.completion : [],
    completedCount: Number.isFinite(Number(raw.completedCount)) ? Number(raw.completedCount) : 0,
    confidenceTrajectory: trajectory.filter((c: any) => Number.isFinite(Number(c?.confidence))),
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : new Date().toISOString(),
  };
}

const APP_URL = () => process.env.APP_BASE_URL || "http://localhost:5173";

/**
 * Builds the snapshot for a student.
 *
 * Every field is optional in practice — a student who has done nothing still
 * produces a valid snapshot, because "they have not started" is exactly what
 * the advisor needs to know before the meeting. Returning null here would send
 * nothing and leave the advisor with no information at all, which is worse.
 */
export async function compose(studentId: number): Promise<Snapshot | null> {
  try {
    const [who] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(students)
      .innerJoin(users, eq(users.id, students.userId))
      .where(eq(students.id, studentId))
      .limit(1);

    if (!who) return null;

    const [sli] = await db
      .select({ title: sliRecords.title, statement: sliRecords.statement })
      .from(sliRecords)
      .where(
        and(
          eq(sliRecords.studentId, studentId),
          inArray(sliRecords.status, LIVE_SLI_STATUSES as any),
        ),
      )
      .orderBy(desc(sliRecords.createdAt))
      .limit(1);

    const sessionRows = await db
      .select({
        id: sessions.id,
        sessionType: sessions.sessionType,
        status: sessions.status,
        completedAt: sessions.completedAt,
      })
      .from(sessions)
      .where(eq(sessions.studentId, studentId))
      .orderBy(asc(sessions.sessionType));

    const artifacts = sessionRows.length
      ? await db
          .select({
            sessionId: sessionArtifacts.sessionId,
            artifactType: sessionArtifacts.artifactType,
            content: sessionArtifacts.content,
          })
          .from(sessionArtifacts)
          .where(inArray(sessionArtifacts.sessionId, sessionRows.map((s) => s.id)))
      : [];

    const bySession = new Map(artifacts.map((a) => [a.sessionId, a.content as any]));

    const contentFor = (type: string) => {
      const row = sessionRows.find((s) => s.sessionType === type);
      return row ? (bySession.get(row.id) ?? null) : null;
    };

    const s1 = contentFor("foundation_1");
    const s2 = contentFor("foundation_2");
    const s3 = contentFor("foundation_3");

    // Session 3 restates the brand claim after the story work, so it supersedes
    // Session 2's when both exist.
    const brandClaim = s3?.brandClaim ?? s2?.brandClaim ?? null;

    // Later sessions first: the most recent commitment is the live one, and it
    // is what the advisor should be following up on.
    const nextSteps = [...asList(s3?.nextSteps), ...asList(s2?.nextSteps)];

    const story = s3?.signatureStory;
    const signatureStory =
      story && typeof story === "object" && story.title
        ? { title: String(story.title), outcome: String(story.outcome ?? "") }
        : null;

    // Confidence across the arc, in session order — the trajectory matters
    // more than any single number, and a drop is the interesting case.
    const confidenceTrajectory = sessionRows
      .map((s) => ({ session: s.sessionType, confidence: Number(bySession.get(s.id)?.confidence) }))
      .filter((c) => Number.isFinite(c.confidence));

    return {
      studentName: `${who.firstName} ${who.lastName}`.trim(),
      sliHeadline: sli?.statement ?? sli?.title ?? null,
      brandClaim,
      primaryFunction: s1?.primaryFunction ?? null,
      secondaryFunction: s1?.secondaryFunction ?? null,
      evidence: asList(s2?.proofBullets).slice(0, 4),
      whyNow: s2?.checkWorthyReason ?? null,
      signatureStory,
      nextSteps: nextSteps.slice(0, 4),
      positioningInsights: asList(s1?.keyInsights).slice(0, 5),
      completion: sessionRows.map((s) => ({
        sessionType: s.sessionType,
        status: s.status,
        completedAt: s.completedAt ? new Date(s.completedAt).toISOString() : null,
      })),
      completedCount: sessionRows.filter((s) => s.status === "completed").length,
      confidenceTrajectory,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    log(`snapshot compose failed for student ${studentId}: ${(err as Error).message}`, "advisor");
    return null;
  }
}

/** Plain-text rendering for the email body. */
export function renderForEmail(s: Snapshot): string {
  const lines: string[] = [];

  lines.push(
    s.sliHeadline
      ? `Their SLI: ${s.sliHeadline}`
      : `They haven't landed on an SLI yet.`,
  );

  if (s.brandClaim) lines.push(`Their claim: "${s.brandClaim}"`);

  if (s.primaryFunction) {
    lines.push(
      `Function: ${s.primaryFunction}` +
        (s.secondaryFunction ? ` (with ${s.secondaryFunction} secondary)` : ""),
    );
  }

  lines.push(`Sessions completed: ${s.completedCount} of 3`);

  if (s.confidenceTrajectory.length > 1) {
    const first = s.confidenceTrajectory[0].confidence;
    const last = s.confidenceTrajectory[s.confidenceTrajectory.length - 1].confidence;
    // Direction, not the raw numbers — a confidence score means little to an
    // advisor in isolation and quite a lot as a trend.
    const direction = last > first ? "rising" : last < first ? "dropping" : "steady";
    lines.push(`Confidence across sessions: ${direction} (${first} → ${last})`);
  }

  if (s.evidence.length) {
    lines.push("", "The proof behind it:");
    for (const e of s.evidence) lines.push(`  - ${e}`);
  }

  if (s.whyNow) lines.push("", `Why they're worth betting on now: ${s.whyNow}`);

  if (s.signatureStory) {
    lines.push("", `Signature story — ${s.signatureStory.title}`);
    if (s.signatureStory.outcome) lines.push(`  ${s.signatureStory.outcome}`);
  }

  if (s.nextSteps.length) {
    lines.push("", "What they said they'd do next:");
    for (const n of s.nextSteps) lines.push(`  - ${n}`);
  }

  // Last, and only when the evidenced fields are empty — this is Session 1
  // shorthand and it reads like our notes rather than their position. Leading
  // with it, as the first version of this did, buries the substance.
  if (!s.evidence.length && !s.whyNow && s.positioningInsights.length) {
    lines.push("", "From their first session:");
    for (const i of s.positioningInsights) lines.push(`  - ${i}`);
  }

  return lines.join("\n");
}

/* ── Sending ────────────────────────────────────────────────────────────── */

/**
 * Sends the snapshot for one appointment and records what was sent.
 *
 * `force` is for the admin's on-demand request (Trigger 2). Without it the
 * send is skipped when one has already gone out, so the scheduler cannot
 * double-send if it runs twice.
 */
export async function sendSnapshot(
  appointmentId: number,
  force = false,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const [appt] = await db
      .select({
        id: advisorAppointments.id,
        studentId: advisorAppointments.studentId,
        scheduledAt: advisorAppointments.scheduledAt,
        snapshotSentAt: advisorAppointments.snapshotSentAt,
        advisorEmail: advisors.email,
        advisorName: advisors.name,
        advisorId: advisors.id,
      })
      .from(advisorAppointments)
      .innerJoin(advisors, eq(advisors.id, advisorAppointments.advisorId))
      .where(eq(advisorAppointments.id, appointmentId))
      .limit(1);

    if (!appt) return { sent: false, reason: "Appointment not found." };
    if (appt.snapshotSentAt && !force) {
      return { sent: false, reason: "Already sent — pass force to send it again." };
    }

    const snapshot = await compose(appt.studentId);
    if (!snapshot) return { sent: false, reason: "Could not build a snapshot for this student." };

    const result = await messaging.sendTemplated({
      studentId: appt.studentId,
      advisorId: appt.advisorId,
      to: appt.advisorEmail,
      templateKey: "advisor_snapshot",
      sequenceKey: "advisor_snapshot",
      vars: {
        advisorName: appt.advisorName,
        studentName: snapshot.studentName,
        appointmentTime: new Date(appt.scheduledAt).toLocaleString(),
        snapshot: renderForEmail(snapshot),
      },
    });

    // The result is read, not discarded. The first version of this returned
    // true unconditionally, so a send SendGrid refused stamped the appointment
    // as briefed and told the admin it had gone. Nothing downstream could tell
    // the difference, and the advisor turned up to the meeting with nothing.
    if (!result.sent) {
      log(
        `snapshot NOT sent for appointment ${appointmentId} to ${appt.advisorEmail}: ${result.reason}`,
        "advisor",
      );
      // The provider's own wording is carried back to the admin. "Not sent" on
      // its own sends whoever clicked the button digging through server logs,
      // which is where this failure was hiding in the first place.
      return { sent: false, reason: `${appt.advisorEmail}: ${result.reason ?? "provider refused"}` };
    }

    // Stored as sent, not as composed: what the advisor read is the record.
    // Only reached on a real send, so snapshot_sent_at means what it says and
    // the T-24h runner will retry an appointment whose send failed.
    await db
      .update(advisorAppointments)
      .set({ snapshot: snapshot as any, snapshotSentAt: new Date() })
      .where(eq(advisorAppointments.id, appointmentId));

    return { sent: true };
  } catch (err) {
    const message = (err as Error).message;
    log(`snapshot send failed for appointment ${appointmentId}: ${message}`, "advisor");
    return { sent: false, reason: message };
  }
}

/**
 * Trigger 1b — the student prep prompt, at appointment registration.
 *
 * The message differs by completion state because the ask does: someone with
 * nothing done needs a reason to start, someone finished needs an invitation
 * to refresh. Sending the same nudge to both is how this reads as spam.
 */
export async function sendStudentPrep(appointmentId: number): Promise<boolean> {
  try {
    const [appt] = await db
      .select({
        id: advisorAppointments.id,
        studentId: advisorAppointments.studentId,
        scheduledAt: advisorAppointments.scheduledAt,
        promptSentAt: advisorAppointments.studentPromptSentAt,
      })
      .from(advisorAppointments)
      .where(eq(advisorAppointments.id, appointmentId))
      .limit(1);

    if (!appt || appt.promptSentAt) return false;

    const to = await messaging.recipient(appt.studentId);
    if (!to?.email) return false;

    const snapshot = await compose(appt.studentId);
    const complete = (snapshot?.completedCount ?? 0) >= 3;

    // Next incomplete session, so the prompt names a specific thing rather
    // than telling them to "finish their profile".
    const nextSession = (snapshot?.completion ?? []).find((c) => c.status !== "completed");
    const nextNumber = nextSession
      ? Number(nextSession.sessionType.replace("foundation_", "")) || 1
      : 1;

    const result = await messaging.sendTemplated({
      studentId: appt.studentId,
      to: to.email,
      templateKey: complete ? "student_prep_complete" : "student_prep_incomplete",
      sequenceKey: "student_prep",
      vars: {
        firstName: to.firstName ?? "there",
        appointmentDate: new Date(appt.scheduledAt).toLocaleDateString(),
        sessionLink: `${APP_URL()}/foundation/session/${nextNumber}`,
        dashboardLink: `${APP_URL()}/dashboard`,
      },
    });

    if (!result.sent) {
      log(
        `student prep NOT sent for appointment ${appointmentId} to ${to.email}: ${result.reason}`,
        "advisor",
      );
      return false;
    }

    await db
      .update(advisorAppointments)
      .set({ studentPromptSentAt: new Date() })
      .where(eq(advisorAppointments.id, appointmentId));

    return true;
  } catch (err) {
    log(`student prep failed for appointment ${appointmentId}: ${(err as Error).message}`, "advisor");
    return false;
  }
}

/**
 * Trigger 1a — every appointment whose snapshot is due.
 *
 * "Due" is inside 24 hours and not yet sent. Called by the same runner that
 * drives the engagement sequences, so there is one scheduler rather than two.
 */
export async function sendDueSnapshots(now = new Date()): Promise<{ sent: number }> {
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const due = await db
    .select({ id: advisorAppointments.id })
    .from(advisorAppointments)
    .where(
      and(
        isNull(advisorAppointments.snapshotSentAt),
        eq(advisorAppointments.status, "scheduled" as any),
        lte(advisorAppointments.scheduledAt, horizon),
        // Past appointments are skipped rather than back-filled: a snapshot
        // for a meeting that already happened is noise in an advisor's inbox.
        sql`${advisorAppointments.scheduledAt} > ${now}`,
      ),
    )
    .limit(100);

  let sent = 0;
  for (const a of due) {
    if ((await sendSnapshot(a.id)).sent) sent++;
  }

  if (sent) log(`sent ${sent} advisor snapshot(s)`, "advisor");
  return { sent };
}

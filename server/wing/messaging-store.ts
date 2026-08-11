import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  messageTemplates,
  messageEvents,
  engagementSequenceStates,
  promptLibrary,
  students,
  users,
} from "@shared/wing-schema";
import { log } from "../logger";

/**
 * Messaging — templates, sending, and the one audit trail (Feature List B3).
 *
 * Everything Wing says outside a session goes through here: welcome and
 * session-completion emails, dormancy nudges, the advisor snapshot (B1), life
 * log prompts (B2) and later the daily micro-prompt (C1). One path, so
 * "what did we send this student and when" has a single answer.
 *
 * ── TEMPLATES ARE DATA ───────────────────────────────────────────────────
 * `message_templates` is versioned and active-flagged, so copy changes without
 * a deploy — the same principle as heuristics, criteria and objectives. Wing's
 * voice is governed by a document Danielle owns; it should not require an
 * engineer to change a sentence.
 *
 * ── EVERY SEND IS LOGGED ─────────────────────────────────────────────────
 * `message_events` records the send whether or not the provider accepted it.
 * A send that fails silently is worse than one that fails loudly: the whole
 * point of dormancy sequencing is knowing what a student has already received.
 *
 * ── VOICE ────────────────────────────────────────────────────────────────
 * Templates are written per the Voice Guide, not invented here. The rules that
 * bite most often: "we"/"let's" when proposing action, "I" when making an
 * observation, contractions throughout, and none of the four anti-patterns —
 * system-notification tone, career-centre speak, hollow enthusiasm, hedging.
 */

export type Channel = "email" | "sms" | "in_app";

/* ── Templates ──────────────────────────────────────────────────────────── */

/** The active version of a template, or null. */
export async function getTemplate(templateKey: string, channel: Channel) {
  try {
    const [row] = await db
      .select()
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.templateKey, templateKey),
          eq(messageTemplates.channel, channel as any),
          eq(messageTemplates.active, true),
        ),
      )
      .orderBy(desc(messageTemplates.version))
      .limit(1);
    return row ?? null;
  } catch (err) {
    log(`template lookup failed for ${templateKey}: ${(err as Error).message}`, "messaging");
    return null;
  }
}

/**
 * Substitutes {{variables}}.
 *
 * An unresolved variable is left visibly as `{{name}}` rather than blanked.
 * A student receiving "Nice work on , " tells you nothing; one receiving
 * "Nice work on {{sessionTitle}}" tells you exactly which variable the caller
 * forgot. Ugly on purpose.
 */
export function render(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key) => {
    const v = vars[key];
    return v === null || v === undefined || v === "" ? whole : String(v);
  });
}

/** Variables left unresolved after rendering — for the send-time warning. */
export function unresolved(rendered: string): string[] {
  return Array.from(new Set(Array.from(rendered.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1])));
}

/* ── Sending ────────────────────────────────────────────────────────────── */

export type SendResult = { sent: boolean; messageEventId?: number; reason?: string };

/**
 * Renders a template and sends it, logging the attempt either way.
 *
 * Returns rather than throws: a failed welcome email must not fail the
 * registration that triggered it.
 */
export async function sendTemplated(params: {
  studentId?: number | null;
  advisorId?: number | null;
  to: string;
  templateKey: string;
  channel?: Channel;
  vars?: Record<string, string | number | null | undefined>;
  sequenceKey?: string;
  sequenceStep?: number;
  promptId?: number | null;
}): Promise<SendResult> {
  const channel = params.channel ?? "email";

  try {
    const template = await getTemplate(params.templateKey, channel);
    if (!template) {
      log(`no active template "${params.templateKey}" (${channel}) — not sent`, "messaging");
      return { sent: false, reason: "template_missing" };
    }

    const vars = params.vars ?? {};
    const subject = render(template.subjectTemplate ?? "", vars);
    const body = render(template.bodyTemplate, vars);

    const gaps = [...unresolved(subject), ...unresolved(body)];
    if (gaps.length) {
      // Sent anyway — a message with a visible {{gap}} is recoverable; a
      // silently skipped send in a dormancy sequence is not.
      log(
        `template ${params.templateKey} has unresolved variables: ${gaps.join(", ")}`,
        "messaging",
      );
    }

    let providerMessageId: string | null = null;
    let sent = false;
    let failureReason: string | null = null;

    if (channel === "email") {
      const { sendEmailDetailed } = await import("../email-service");
      const outcome = await sendEmailDetailed({
        to: params.to,
        from: process.env.WING_FROM_EMAIL || "wing@sli.pro",
        subject,
        text: body,
        html: body.replace(/\n/g, "<br>"),
      });
      sent = outcome.sent;
      providerMessageId = outcome.messageId;
      failureReason = outcome.reason;
    } else {
      // SMS (Twilio) is Feature List B2/C1 and not wired yet. Logged as an
      // attempt so the gap is visible in message_events rather than silent.
      log(`channel ${channel} not implemented — ${params.templateKey} not sent`, "messaging");
      failureReason = `channel ${channel} not implemented`;
    }

    const [event] = await db
      .insert(messageEvents)
      .values({
        studentId: params.studentId ?? null,
        advisorId: params.advisorId ?? null,
        channel: channel as any,
        direction: "outbound" as any,
        templateKey: params.templateKey,
        templateVersion: template.version,
        sequenceKey: params.sequenceKey ?? null,
        sequenceStep: params.sequenceStep ?? null,
        promptId: params.promptId ?? null,
        providerMessageId,
        // The row is written either way — the attempt is the fact worth keeping
        // — but a refusal is marked as one rather than left looking delivered.
        failedAt: sent ? null : new Date(),
        failureReason: sent ? null : failureReason,
      })
      .returning({ id: messageEvents.id });

    if (!sent) {
      log(`${params.templateKey} to ${params.to} NOT sent — ${failureReason}`, "messaging");
    }

    return {
      sent,
      messageEventId: event.id,
      reason: sent ? undefined : (failureReason ?? "provider_failed"),
    };
  } catch (err) {
    log(`send failed for ${params.templateKey}: ${(err as Error).message}`, "messaging");
    return { sent: false, reason: "error" };
  }
}

/**
 * Has this student already had this template, ever? Guards duplicate sends.
 *
 * Failed attempts do not count. Without the `failed_at IS NULL` filter a send
 * SendGrid refused would suppress its own retry permanently — the student never
 * receives the email and the system is certain they did. That is strictly worse
 * than the duplicate this guard exists to prevent.
 */
export async function alreadySent(studentId: number, templateKey: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: messageEvents.id })
      .from(messageEvents)
      .where(
        and(
          eq(messageEvents.studentId, studentId),
          eq(messageEvents.templateKey, templateKey),
          eq(messageEvents.direction, "outbound" as any),
          isNull(messageEvents.failedAt),
        ),
      )
      .limit(1);
    return !!row;
  } catch {
    // Fail closed: if the check errors, assume it was sent. A missed email is
    // recoverable; a duplicated welcome sequence looks broken to the student.
    return true;
  }
}

/**
 * Has this student already received anything under this sequence key?
 *
 * `alreadySent` is keyed on the template, which is right for a sequence a
 * student passes through once — nobody should get two welcome emails. It is
 * wrong for anything that recurs on a different occasion with the same copy:
 * two calendar touchpoints six months apart share a template key, and a
 * template-keyed guard would suppress the second one forever.
 *
 * So this guards on the sequence key instead, which callers make unique per
 * occasion (`calendar:41`). Same job — do not send twice — different grain.
 */
export async function alreadySentForSequence(
  studentId: number,
  sequenceKey: string,
): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: messageEvents.id })
      .from(messageEvents)
      .where(
        and(
          eq(messageEvents.studentId, studentId),
          eq(messageEvents.sequenceKey, sequenceKey),
          eq(messageEvents.direction, "outbound" as any),
          isNull(messageEvents.failedAt),
        ),
      )
      .limit(1);
    return !!row;
  } catch {
    // Fail closed, for the same reason as alreadySent.
    return true;
  }
}

/* ── Sequence state ─────────────────────────────────────────────────────── */

/** Starts a sequence for a student if it is not already running. */
export async function startSequence(studentId: number, sequenceKey: string, firstRunAt?: Date) {
  try {
    await db
      .insert(engagementSequenceStates)
      .values({
        studentId,
        sequenceKey,
        currentStep: 0,
        status: "active" as any,
        nextRunAt: firstRunAt ?? new Date(),
      })
      .onConflictDoNothing();
  } catch (err) {
    log(`could not start sequence ${sequenceKey}: ${(err as Error).message}`, "messaging");
  }
}

export async function advanceSequence(params: {
  studentId: number;
  sequenceKey: string;
  step: number;
  nextRunAt: Date | null;
  done?: boolean;
}) {
  try {
    await db
      .update(engagementSequenceStates)
      .set({
        currentStep: params.step,
        nextRunAt: params.nextRunAt,
        status: (params.done ? "completed" : "active") as any,
        completedAt: params.done ? new Date() : null,
      })
      .where(
        and(
          eq(engagementSequenceStates.studentId, params.studentId),
          eq(engagementSequenceStates.sequenceKey, params.sequenceKey),
        ),
      );
  } catch (err) {
    log(`could not advance sequence ${params.sequenceKey}: ${(err as Error).message}`, "messaging");
  }
}

/** Sequences due to run. The scheduler's queue. */
export async function dueSequences(now = new Date(), limit = 200) {
  return db
    .select({
      studentId: engagementSequenceStates.studentId,
      sequenceKey: engagementSequenceStates.sequenceKey,
      currentStep: engagementSequenceStates.currentStep,
      startedAt: engagementSequenceStates.startedAt,
    })
    .from(engagementSequenceStates)
    .where(
      and(
        eq(engagementSequenceStates.status, "active" as any),
        sql`${engagementSequenceStates.nextRunAt} <= ${now}`,
      ),
    )
    .limit(limit);
}

/** Email and name for a student, for template variables. */
export async function recipient(studentId: number) {
  const [row] = await db
    .select({
      email: users.email,
      firstName: users.firstName,
      isTestUser: users.isTestUser,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(eq(students.id, studentId))
    .limit(1);
  return row ?? null;
}

/* ── Prompt library (B2 life log, C1 micro-prompt) ──────────────────────── */

/**
 * Picks a prompt the student has not had in the last 14 days.
 *
 * The no-repeat rule is a query against message_events rather than an array
 * column on the student — per the spec, so the constraint stays correct when
 * prompts are added or retired.
 */
export async function nextPrompt(studentId: number, category?: string) {
  try {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const recent = await db
      .select({ promptId: messageEvents.promptId })
      .from(messageEvents)
      .where(
        and(
          eq(messageEvents.studentId, studentId),
          gt(messageEvents.sentAt, cutoff),
        ),
      );
    const used = new Set(recent.map((r) => r.promptId).filter(Boolean) as number[]);

    const candidates = await db
      .select()
      .from(promptLibrary)
      .where(
        category
          ? and(eq(promptLibrary.active, true), eq(promptLibrary.category, category as any))
          : eq(promptLibrary.active, true),
      );

    const fresh = candidates.filter((p) => !used.has(p.id));
    // Falling back to the full set when everything is recent is deliberate:
    // repeating a prompt beats sending nothing and stalling the sequence.
    const pool = fresh.length ? fresh : candidates;
    if (!pool.length) return null;

    return pool[Math.floor(Math.random() * pool.length)];
  } catch (err) {
    log(`prompt selection failed: ${(err as Error).message}`, "messaging");
    return null;
  }
}

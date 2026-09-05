import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { selectPrompt, type Candidate, type SelectionContext } from "./prompt-selection";
import { db } from "../db";
import {
  messageTemplates,
  messageEvents,
  engagementSequenceStates,
  promptLibrary,
  promptOpeners,
  intakeRecords,
  lifeLogEntries,
  students,
  users,
} from "@shared/wing-schema";
import { log } from "../logger";
import { maySend } from "./safety-hold-store";
import type { OutboundKind } from "./suppression";
import { newReplyToken, replyAddressFor } from "./inbound-email";

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
 * The one template a safety hold permits, named once so the gate below and
 * `soft-check-in.ts` cannot disagree about which message is the exception.
 */
export const SOFT_CHECK_IN_TEMPLATE = "safety_soft_check_in";

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
  /** The greeting from her opener pool, when this message carried one. */
  openerId?: number | null;
  /**
   * Whether this message asks for an answer.
   *
   * When true and the inbound address is configured, the send carries
   * `Reply-To: <local>+<token>@<domain>` and the token is stored on the row, so a
   * reply can be attributed to this exact message — B2 Trigger 2's "response logged
   * without opening app".
   *
   * OFF by default, and that default is the safe one. A reply address on a message
   * that is not a question invites an answer nothing will read; on the soft check-in
   * it would be worse than that, because "I'm here when you're ready" is deliberately
   * not a question and the hold it is sent under permits no follow-up.
   */
  invitesReply?: boolean;
}): Promise<SendResult> {
  const channel = params.channel ?? "email";

  /*
   * ── THE SAFETY HOLD, ENFORCED HERE AND NOWHERE ELSE ────────────────────
   * `maySend` was written with `suppression.ts` and had NO CALLER. Three separate
   * comments asserted it did — `soft-check-in.ts` describes itself as the exception
   * to a suppression that was not running, `run-sequences.ts` and
   * `intake-conversation.ts` say the same. So a student who wrote something
   * frightening kept receiving welcome, dormancy, calendar, prompt and launch mail,
   * and every surface that mattered read as though they did not.
   *
   * It goes here rather than in each caller for the reason the gate exists: there are
   * eight send sites today and a ninth is one feature away, and a rule that has to be
   * remembered at a call site is a rule that will be missed at one. This function is
   * the only path to the provider.
   *
   * ── THE THREE THINGS IT DOES NOT SUPPRESS ─────────────────────────────
   * `advisorId` set — the message goes TO the advisor, about the student. A hold
   * governs whether Wing speaks first to the person, and telling a career advisor
   * about someone in difficulty is not that. Suppressing it would take the one human
   * out of the loop at the moment they are most useful.
   *
   * `studentId` null — nothing to look a hold up against; a send with no student is
   * a test send or an admin preview.
   *
   * The soft check-in, which IS the exception the rule names: "That's the only
   * automated contact during a hold."
   *
   * ── THE KIND IS THE CHANNEL, DELIBERATELY ─────────────────────────────
   * `OutboundKind` carries both channels and content classes, and every one of the
   * nine is suppressed while a hold is open. Passing the channel means the mapping
   * cannot accidentally select a permitted kind, because there is no permitted kind.
   * `maySend` fails closed on an unreadable table, so a database fault holds rather
   * than sends.
   */
  if (
    params.studentId != null &&
    params.advisorId == null &&
    params.templateKey !== SOFT_CHECK_IN_TEMPLATE
  ) {
    const verdict = await maySend(db as any, params.studentId, channel as OutboundKind);
    if (!verdict.allowed) {
      log(
        `held "${params.templateKey}" for student ${params.studentId}: ${verdict.why}`,
        "messaging",
      );
      return { sent: false, reason: "safety_hold" };
    }
  }

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

    /*
     * The reply handle, minted before the send so the address in the message and the
     * token in the row cannot disagree.
     *
     * Null unless the caller asked AND the inbound domain is configured. Not
     * configured is the state on every environment that has not set up Inbound Parse,
     * and a Reply-To pointing at a domain with no MX record bounces every reply — so
     * the absence of the setting turns the invitation off rather than half on.
     */
    const replyDomain = process.env.INBOUND_EMAIL_DOMAIN;
    const replyLocal = process.env.INBOUND_EMAIL_LOCAL || "log";
    const replyToken =
      params.invitesReply && channel === "email" && replyDomain ? newReplyToken() : null;

    if (params.invitesReply && !replyDomain) {
      log(
        `${params.templateKey} invites a reply but INBOUND_EMAIL_DOMAIN is unset — sending without a reply address`,
        "messaging",
      );
    }

    if (channel === "email") {
      const { sendEmailDetailed } = await import("../email-service");
      const outcome = await sendEmailDetailed({
        to: params.to,
        from: process.env.WING_FROM_EMAIL || "wing@sli.pro",
        replyTo: replyToken ? replyAddressFor(replyToken, replyLocal, replyDomain!) : undefined,
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
        openerId: params.openerId ?? null,
        /*
         * Stored only on a successful send. A token on a refused message is an
         * address that was never in anyone's inbox, and it would sit in the unique
         * index forever looking like a reply that never came.
         */
        replyToken: sent ? replyToken : null,
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
    const now = new Date();
    await db
      .update(engagementSequenceStates)
      .set({
        currentStep: params.step,
        nextRunAt: params.nextRunAt,
        status: (params.done ? "completed" : "active") as any,
        completedAt: params.done ? now : null,
        updatedAt: now,
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

/**
 * Email, name and the two fields a student's population tags derive from.
 *
 * `professionalStatus` and `pathway` are here because prompt selection needs them and
 * getting them wrong is worse than not having them: `populationTagsFor(null, null)`
 * returns an empty list, and an untagged student matches EVERY prompt by the fail-open
 * rule — including the ones written only for executives. So they are read on the same
 * round trip as the address rather than left to a caller to remember.
 *
 * The intake record is joined LEFT: a student who has not finished intake has no pathway,
 * and that is a normal state rather than a reason to have no email address.
 */
export async function recipient(studentId: number) {
  const [row] = await db
    .select({
      email: users.email,
      firstName: users.firstName,
      isTestUser: users.isTestUser,
      professionalStatus: users.professionalStatus,
      pathway: intakeRecords.pathway,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(intakeRecords, eq(intakeRecords.studentId, students.id))
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
/**
 * What the opener layer needs to know about this student.
 *
 * Two reads, both against `message_events` and `life_log_entries` rather than against
 * state kept on the student — the same rule the 14-day no-repeat already follows, and for
 * the same reason: a column written at send time goes stale the first time a send fails
 * after it was written.
 *
 * `daysSinceLastResponse` is measured from their last life-log entry, because an entry is
 * what answering looks like on this surface. Null means they have never written one, which
 * is NOT the same as having gone quiet — see `poolFor` in `opener.ts`, which greets a
 * student who has never answered casually rather than telling them they were missed.
 */
export async function openerStateFor(studentId: number): Promise<{
  daysSinceLastResponse: number | null;
  lastOpenerId: number | null;
}> {
  try {
    const [lastEntry] = await db
      .select({ at: lifeLogEntries.createdAt })
      .from(lifeLogEntries)
      .where(eq(lifeLogEntries.studentId, studentId))
      .orderBy(desc(lifeLogEntries.createdAt))
      .limit(1);

    const [lastOpener] = await db
      .select({ openerId: messageEvents.openerId })
      .from(messageEvents)
      .where(and(eq(messageEvents.studentId, studentId), isNotNull(messageEvents.openerId)))
      .orderBy(desc(messageEvents.sentAt))
      .limit(1);

    const at = lastEntry?.at ? new Date(lastEntry.at).getTime() : null;

    return {
      daysSinceLastResponse:
        at === null ? null : Math.max(0, Math.floor((Date.now() - at) / 86_400_000)),
      lastOpenerId: lastOpener?.openerId ?? null,
    };
  } catch (err) {
    /*
     * A failed read must not cost the student their prompt. Falling back to "never
     * answered, no previous opener" produces a casual greeting, which is the register
     * that is wrong in the least consequential direction: it under-claims a
     * relationship rather than asserting one that is not there.
     */
    log(`opener state read failed for student ${studentId}: ${(err as Error).message}`, "messaging");
    return { daysSinceLastResponse: null, lastOpenerId: null };
  }
}

/** Her opener pool, active rows only. */
export async function activeOpeners() {
  try {
    return await db
      .select({
        id: promptOpeners.id,
        pool: promptOpeners.pool,
        text: promptOpeners.text,
        placeholders: promptOpeners.placeholders,
      })
      .from(promptOpeners)
      .where(eq(promptOpeners.active, true));
  } catch (err) {
    log(`opener pool read failed: ${(err as Error).message}`, "messaging");
    return [];
  }
}

/* ── Inbound: the reply that comes back ─────────────────────────────────── */

export type ReplyTarget = {
  messageEventId: number;
  studentId: number;
  promptId: number | null;
  /** Set when this token has already been redeemed. */
  repliedAt: Date | null;
};

/**
 * The message a reply token belongs to.
 *
 * The whole of the inbound identity check. Returns null for a token nobody issued,
 * for a token on a message with no student, and for a token whose message is not an
 * email — each of which is a reply that must not be filed against anybody.
 */
export async function messageForReplyToken(token: string): Promise<ReplyTarget | null> {
  const [row] = await db
    .select({
      messageEventId: messageEvents.id,
      studentId: messageEvents.studentId,
      promptId: messageEvents.promptId,
      repliedAt: messageEvents.repliedAt,
    })
    .from(messageEvents)
    .where(eq(messageEvents.replyToken, token))
    .limit(1);

  if (!row || row.studentId === null) return null;
  return { ...row, studentId: row.studentId };
}

/**
 * Records that a reply arrived, and what it produced.
 *
 * Stamped on the OUTBOUND row rather than written as a second `inbound` one. The
 * schema puts `replied_at`, `reply_content` and `logged_life_log_entry_id` here for
 * that reason: a reply is a property of the message it answers, and keeping it on the
 * same row is what lets "did anyone answer this prompt?" be one query.
 *
 * The `inbound` direction stays for a message a student sends unprompted, which has no
 * outbound row to hang from and does not exist yet.
 */
export async function recordReply(params: {
  messageEventId: number;
  replyContent: string;
  lifeLogEntryId: number | null;
}): Promise<void> {
  await db
    .update(messageEvents)
    .set({
      repliedAt: new Date(),
      replyContent: params.replyContent,
      loggedLifeLogEntryId: params.lifeLogEntryId,
    })
    .where(eq(messageEvents.id, params.messageEventId));
}

/**
 * A prompt from Danielle's library, under her selection rules.
 *
 * `nextPrompt` below is the older path and still serves the life-log surface: it filters
 * on the legacy seven-value category and picks uniformly at random. This one applies the
 * rules her documents actually state — audience, cadence, the 2:1 pool ratio, category
 * rotation, the event-sensitivity constraint and IG-MJ05's one-per-day cap — and every one
 * of those decisions lives in `prompt-selection.ts` where it can be enumerated.
 *
 * This function does the reading and nothing else. It has no opinion about which prompt is
 * best, which is the point: a rule that lives half in a query and half in a module is a
 * rule nobody can test.
 *
 * Returns the whole row, so a caller can render the prompt and log its tier and category
 * without a second read.
 */
export async function nextLibraryPrompt(
  studentId: number,
  opts: {
    cadence: SelectionContext["cadence"];
    studentTags: readonly string[];
    /** Events Wing already knows about. Empty holds every event-sensitive prompt. */
    knownEvents?: readonly string[];
    /**
     * IG-MJ05's one-prompt-per-day cap. On by default, and off for exactly one
     * caller: the faded placeholder on the life-log page.
     *
     * The rule is "maximum one prompt per day" and it governs what Wing SENDS
     * unprompted. A student who opens the log has initiated the interaction, and an
     * empty box because Wing emailed them this morning is the cap punishing the
     * behaviour the whole feature is trying to produce.
     */
    dailyCap?: boolean;
    random?: () => number;
  },
) {
  try {
    const now = Date.now();
    const windowStart = new Date(now - 14 * 24 * 60 * 60 * 1000);
    const dayStart = new Date(new Date(now).setHours(0, 0, 0, 0));

    /*
     * One read of the send log covers both rules: the 14-day no-repeat window and
     * IG-MJ05's per-day cap. Two queries would let them disagree about "now".
     */
    const sent = await db
      .select({ promptId: messageEvents.promptId, sentAt: messageEvents.sentAt })
      .from(messageEvents)
      .where(and(eq(messageEvents.studentId, studentId), gt(messageEvents.sentAt, windowStart)))
      .orderBy(desc(messageEvents.sentAt));

    const recentPromptIds = sent
      .map((r) => r.promptId)
      .filter((id): id is number => typeof id === "number");

    const sentToday = sent.some((r) => r.sentAt !== null && r.sentAt >= dayStart);

    /*
     * The categories of what was sent recently, newest send first, for the rotation. One
     * entry per send holding that prompt's whole set — see `SelectionContext.recentCategories`
     * for why it is not flattened. Every set is empty until Danielle assigns categories, so
     * this is a list of empty lists today and the rotation reports itself inactive rather
     * than pretending.
     */
    const recentCategories: string[][] = [];
    if (recentPromptIds.length) {
      const rows = await db
        .select({ id: promptLibrary.id, signalCategory: promptLibrary.signalCategory })
        .from(promptLibrary);
      const byId = new Map<number, string[]>(rows.map((r) => [r.id, r.signalCategory ?? []]));
      for (const id of recentPromptIds) {
        recentCategories.push(byId.get(id) ?? []);
      }
    }

    const candidates = await db.select().from(promptLibrary).where(eq(promptLibrary.active, true));

    const decision = selectPrompt(
      candidates as unknown as Candidate[],
      {
        studentTags: opts.studentTags,
        cadence: opts.cadence,
        recentPromptIds,
        recentCategories,
        sentToday: opts.dailyCap === false ? false : sentToday,
        knownEvents: opts.knownEvents ?? [],
      },
      opts.random,
    );

    if (decision.promptId === null) {
      /*
       * Logged rather than swallowed. Her pools make exhaustion unreachable — the smallest
       * per-student micro-journal pool is 105 against a 14-day window at one a day — so an
       * empty result means the seed or the population resolution is wrong, and that is
       * worth a line in the log every time it happens.
       */
      log(`no prompt for student ${studentId}: ${decision.why}`, "messaging");
      return null;
    }

    return candidates.find((p) => p.id === decision.promptId) ?? null;
  } catch (err) {
    log(`library prompt selection failed: ${(err as Error).message}`, "messaging");
    return null;
  }
}

/**
 * The older path: a legacy-category prompt the student has not had in 14 days.
 *
 * Kept because the life log calls it and because the legacy category filter has no
 * equivalent in the new rules — her library carries none of those seven values. New
 * callers want `nextLibraryPrompt`.
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

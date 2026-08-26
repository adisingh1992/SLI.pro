import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { lifeLogEntries, promptLibrary, sliRecords, students } from "@shared/wing-schema";
import { log } from "../logger";
import * as orchestrator from "../orchestrator";
import * as messaging from "./messaging-store";
import * as promptLog from "./prompt-log-store";

/**
 * The career-and-personal life log (Feature List B2).
 *
 * The spec calls this "Tier 1's core data-generating surface", and that is the
 * right way to read it: sessions produce a position, the log produces the
 * evidence that keeps it true. Everything in Tier 2 — pattern detection, drift
 * detection, SLI update proposals — reads from this table.
 *
 * ── HUMAN AND AI STAY IN SEPARATE COLUMNS ────────────────────────────────
 * `entry_text` is what the student wrote. `wing_response` is what Wing said
 * back. They are distinct columns because the whole architecture rests on that
 * separation: only `entry_text` is ever embedded, so Wing's longitudinal memory
 * is grounded in what students actually said rather than in its own prior
 * output. Concatenating them for convenience would poison the memory quietly
 * and irreversibly.
 *
 * ── WING RESPONDS, IT DOES NOT ASSESS ────────────────────────────────────
 * The response is generated at write time and stored. It is a reply, not a
 * score — no rubric, no rating, nothing the student could read as being marked.
 * The Voice Guide's registers apply: teach, affirm, empathise, promote,
 * encourage. Which one depends on what they wrote, and a setback gets the
 * empathising register rather than a silver lining.
 */

export type NewEntry = {
  studentId: number;
  entryText: string;
  entryType?: "career" | "personal";
  promptId?: number | null;
  captureSource?: "in_app" | "voice" | "email_reply" | "sms_reply";
  voiceRecordingUri?: string | null;
};

/* ── Prompt selection ───────────────────────────────────────────────────── */

/**
 * The prompt shown as faded placeholder text.
 *
 * Reuses `messaging.nextPrompt`, which enforces the 14-day no-repeat rule as a
 * query against message_events rather than as state on the student — so adding
 * a prompt to the library takes effect immediately and retiring one does not
 * leave a dangling reference.
 */
export async function promptFor(studentId: number, category?: string) {
  const prompt = await messaging.nextPrompt(studentId, category);
  if (!prompt) return null;

  /*
   * ── THE DELIVERY THE REVEAL CYCLE CANNOT RECONSTRUCT ───────────────────
   * IG-RC10's hard filter 0: an absence claim "dies unless prompts in that signal
   * category were actually delivered". A student shown this prompt who writes nothing
   * leaves no trace at all otherwise, and "never asked" and "asked and ignored" mean
   * opposite things about the same silence.
   *
   * The answer is always recoverable from the entry text. This is not. So it is written
   * here, at the moment of asking, and `logDelivery` returns null rather than throwing —
   * a broken log must never be the reason a student is not asked a question.
   */
  await promptLog.logDelivery(db as never, {
    studentId,
    promptId: prompt.id,
    channel: "micro_journal",
    signalCategory: promptLog.signalCategoryFor(prompt.category),
    // Null until Danielle approves the tiers; `promptId` is what makes the backfill work.
    tier: null,
  });

  return { id: prompt.id, text: prompt.promptText, category: prompt.category };
}

/* ── Wing's response ────────────────────────────────────────────────────── */

const RESPONSE_SYSTEM = `You are Wing, a career positioning partner. A student has just written an entry in their life log — a running record of what is happening in their career and life.

Write a short reply. Two or three sentences, never more.

VOICE
- Contractions throughout. A colleague over coffee, not a career centre.
- "I" when you are making an observation. "we"/"let's" when you are proposing something.
- Specific over abstract. Refer to what they actually wrote, in their words.
- Confident, not hedging. "Here's what I'm seeing", never "you might want to consider".

REGISTER — pick the one that fits what they wrote:
- They did something well → affirm it, and say specifically what was good about it.
- Something went badly → empathise. Do not reach for a silver lining. A setback is
  material worth recording, and saying so is more useful than cheering them up.
- They are describing how they explained themselves → connect it to their positioning.
- Something happened worth telling others about → say so, concretely.
- Nothing much happened → that is fine. Acknowledge it briefly and stop.

NEVER
- Do not rate, score, or grade the entry.
- Do not say "great job", "amazing", "love this" or anything of that shape.
- Do not ask more than one question, and often ask none.
- Do not tell them to build their personal brand or leverage anything.
- Do not summarise back what they just told you. They know what they wrote.

If their SLI is given below, you may connect the entry to it — but only when the
connection is real. A forced link is worse than no link.`;

/**
 * Generates Wing's reply to an entry.
 *
 * Returns null rather than a fallback string on failure. An empty response
 * renders as "Wing hasn't replied yet", which is honest; a canned "Thanks for
 * sharing!" would be the hollow-enthusiasm anti-pattern shipped by accident,
 * and the student cannot tell the difference between that and a real reply.
 */
export async function composeResponse(
  studentId: number,
  entryText: string,
): Promise<string | null> {
  try {
    const [sli] = await db
      .select({ statement: sliRecords.statement })
      .from(sliRecords)
      .where(and(eq(sliRecords.studentId, studentId), eq(sliRecords.status, "selected" as any)))
      .orderBy(desc(sliRecords.createdAt))
      .limit(1);

    const context = sli?.statement
      ? `Their current SLI: ${sli.statement}`
      : `They have not settled on an SLI yet — do not refer to one.`;

    const result = await orchestrator.complete({
      // "mid" not "flagship": this runs on every entry, several times a week
      // per student, and the task is a short contextual reply rather than
      // analysis. Flagship here would multiply cost for no visible gain.
      tier: "mid",
      system: RESPONSE_SYSTEM,
      maxTokens: 300,
      temperature: 0.7,
      messages: [{ role: "user", content: `${context}\n\nTheir entry:\n${entryText}` }],
    });

    const text = result.text?.trim();
    return text || null;
  } catch (err) {
    log(`life log response failed for student ${studentId}: ${(err as Error).message}`, "lifelog");
    return null;
  }
}

/* ── Writing ────────────────────────────────────────────────────────────── */

/**
 * Records an entry and Wing's reply.
 *
 * The entry is written first and the response attached after. If the model call
 * fails the student's words are still saved — losing what somebody wrote
 * because an LLM was unavailable would be indefensible, and the reply can be
 * generated later.
 */
export async function createEntry(params: NewEntry) {
  const [entry] = await db
    .insert(lifeLogEntries)
    .values({
      studentId: params.studentId,
      entryText: params.entryText.trim(),
      entryType: (params.entryType ?? "career") as any,
      promptId: params.promptId ?? null,
      captureSource: (params.captureSource ?? "in_app") as any,
      voiceRecordingUri: params.voiceRecordingUri ?? null,
    })
    .returning();

  /*
   * Closes the delivery this answers, or records an unprompted entry as its own event.
   * Before the model call, on the rule this file already follows for the entry itself:
   * what the student wrote survives a failure in what Wing says back.
   */
  await promptLog.logResponse(db as never, {
    studentId: params.studentId,
    promptId: params.promptId ?? null,
    channel: "micro_journal",
    text: entry.entryText,
    at: entry.createdAt ?? new Date(),
  });

  const response = await composeResponse(params.studentId, entry.entryText);

  if (response) {
    await db
      .update(lifeLogEntries)
      .set({ wingResponse: response })
      .where(eq(lifeLogEntries.id, entry.id));
  }

  // Writing an entry is activity, so it resets the dormancy clock — otherwise
  // a student logging diligently every week would still be chased as dormant
  // for not having opened a session.
  try {
    const engagement = await import("./engagement");
    await engagement.resetDormancy(params.studentId);
  } catch (err) {
    log(`dormancy reset failed after entry: ${(err as Error).message}`, "lifelog");
  }

  return { ...entry, wingResponse: response };
}

/** Generates a missing reply for an existing entry. */
export async function backfillResponse(entryId: number): Promise<boolean> {
  const [entry] = await db
    .select({
      id: lifeLogEntries.id,
      studentId: lifeLogEntries.studentId,
      entryText: lifeLogEntries.entryText,
      wingResponse: lifeLogEntries.wingResponse,
    })
    .from(lifeLogEntries)
    .where(eq(lifeLogEntries.id, entryId))
    .limit(1);

  if (!entry || entry.wingResponse) return false;

  const response = await composeResponse(entry.studentId, entry.entryText);
  if (!response) return false;

  await db
    .update(lifeLogEntries)
    .set({ wingResponse: response })
    .where(eq(lifeLogEntries.id, entryId));

  return true;
}

/* ── Reading ────────────────────────────────────────────────────────────── */

export async function listEntries(studentId: number, limit = 50) {
  return db
    .select({
      id: lifeLogEntries.id,
      entryType: lifeLogEntries.entryType,
      entryText: lifeLogEntries.entryText,
      wingResponse: lifeLogEntries.wingResponse,
      captureSource: lifeLogEntries.captureSource,
      promptText: promptLibrary.promptText,
      createdAt: lifeLogEntries.createdAt,
    })
    .from(lifeLogEntries)
    .leftJoin(promptLibrary, eq(promptLibrary.id, lifeLogEntries.promptId))
    .where(eq(lifeLogEntries.studentId, studentId))
    .orderBy(desc(lifeLogEntries.createdAt))
    .limit(limit);
}

/** Entry count and streak-ish summary for the dashboard card. */
export async function summary(studentId: number) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      lastEntryAt: sql<Date | null>`max(${lifeLogEntries.createdAt})`,
      last30: sql<number>`count(*) filter (
        where ${lifeLogEntries.createdAt} > now() - interval '30 days'
      )::int`,
    })
    .from(lifeLogEntries)
    .where(eq(lifeLogEntries.studentId, studentId));

  return {
    total: row?.total ?? 0,
    last30Days: row?.last30 ?? 0,
    lastEntryAt: row?.lastEntryAt ? new Date(row.lastEntryAt).toISOString() : null,
  };
}

/** Resolves the wing student id for an authenticated user. */
export async function studentIdForUser(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: students.id })
    .from(students)
    .where(eq(students.userId, userId))
    .limit(1);
  return row?.id ?? null;
}

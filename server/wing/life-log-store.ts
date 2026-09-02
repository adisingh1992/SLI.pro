import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { lifeLogEntries, promptLibrary, sliRecords, students } from "@shared/wing-schema";
import { log } from "../logger";
import * as orchestrator from "../orchestrator";
import { parseJsonResponse } from "../json-response";
import { compileSafety } from "./safety-rules";
import { LIVE_SLI_STATUSES } from "./sli-store";
import { populationTagsFor } from "./population-tags";
import { openHold } from "./safety-hold-store";
import {
  IG_MJ04_REGISTER,
  LOG_REPLY_CONTRACT,
  parseLogReply,
  postEntryActions,
} from "./log-reply";
import * as messaging from "./messaging-store";
import { logResponse, signalCategoryFor } from "./prompt-log-store";
import type { EvidenceTier } from "./reveal-evidence";

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
 * ── WHY THIS IS NOT `nextPrompt` ANY MORE ────────────────────────────────
 * It was, and `nextPrompt` filters on `active` and an optional legacy category and
 * NOTHING ELSE — no audience, no cadence, no pool ratio. `cardAppliesTo` fails open,
 * so an untagged prompt reaches everyone: this surface could show a Berkeley
 * undergraduate an executive-only prompt from Danielle's library.
 *
 * That is the same fail-open the email path was fixed for. The fix landed on one of
 * the two callers, and this was the other one — which is the more visible of the two,
 * because it is on screen every time a student opens the log.
 *
 * `nextLibraryPrompt` applies her actual rules: audience, cadence, the 2:1
 * approachable-to-reflective ratio, category rotation and event-sensitivity.
 *
 * ── THE ONE RULE THIS PATH TURNS OFF ─────────────────────────────────────
 * IG-MJ05's per-day cap. See `dailyCap` in `nextLibraryPrompt`: the cap governs what
 * Wing sends unprompted, and a student who opened the log did the prompting.
 *
 * ── AND THE ONE THAT IS STILL WEAK HERE ──────────────────────────────────
 * The 14-day no-repeat rule is a query against `message_events`, which only records
 * what was SENT. Nothing writes a row when a prompt is merely displayed, so in-app
 * placeholders can repeat where emailed ones cannot. Recording a display would need a
 * `message_events` row for something that was never a message, or a second log —
 * `prompt-log-store.ts` exists for exactly this and has no caller yet. Left as it is,
 * and written down, rather than papered over: a repeated placeholder is a cosmetic
 * fault, and the wrong audience was not.
 *
 * `category` is gone. It was the legacy seven-value field, and `nextPrompt`'s own
 * comment records that "her library carries none of those values" — so passing one
 * could only ever narrow the pool to nothing.
 */
export async function promptFor(studentId: number) {
  /*
   * Read rather than defaulted, for the reason `engagement.ts` states at the sibling
   * call site: an empty tag list is not a safe default when the matcher fails open.
   * A student the platform cannot classify gets no prompt rather than everyone's.
   */
  const to = await messaging.recipient(studentId);
  if (!to) return null;

  const prompt = await messaging.nextLibraryPrompt(studentId, {
    // The log page is the micro-journal surface; heartbeat is the weekly emailed pool.
    cadence: "micro_journal",
    studentTags: populationTagsFor(to.professionalStatus as any, to.pathway as any),
    dailyCap: false,
  });

  return prompt ? { id: prompt.id, text: prompt.promptText, category: prompt.category } : null;
}

/* ── Wing's response ────────────────────────────────────────────────────── */

/*
 * ── THE SAFETY BLOCK WAS MISSING FROM THIS SURFACE ───────────────────────
 * `compileSafety()` is compiled into intake and into every Foundation turn, and was absent
 * here — on the one surface built for a student to write about whatever is happening in
 * their life, several times a week, unprompted and unstructured.
 *
 * The register list below made that worse than neutral rather than merely incomplete:
 * "Something went badly → empathise. Do not reach for a silver lining" is the branch a
 * distressed entry falls into, so the reply came back warm, on-voice, and about career
 * material.
 *
 * It goes first, as it does everywhere else — the rules are "before anything else" in
 * their own words, and a safety instruction after a voice instruction reads as a caveat.
 */
const RESPONSE_SYSTEM = `${compileSafety()}

You are Wing, a career positioning partner. A student has just written an entry in their life log — a running record of what is happening in their career and life.

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
connection is real. A forced link is worse than no link.
${IG_MJ04_REGISTER}
${LOG_REPLY_CONTRACT}`;

/**
 * Generates Wing's reply to an entry.
 *
 * Returns null rather than a fallback string on failure. An empty response
 * renders as "Wing hasn't replied yet", which is honest; a canned "Thanks for
 * sharing!" would be the hollow-enthusiasm anti-pattern shipped by accident,
 * and the student cannot tell the difference between that and a real reply.
 */
/**
 * Wing's reply, plus what it judged about the entry.
 *
 * Returns the judgement rather than only the text because IG-MJ04 and IG-S01 both key on
 * it, and a caller that got a string back would have to re-read the entry to find out
 * whether a hold should open.
 */
export async function composeResponse(
  studentId: number,
  entryText: string,
): Promise<{ reply: string | null; safetyHold: boolean; distress: boolean }> {
  try {
    const [sli] = await db
      .select({ statement: sliRecords.statement })
      .from(sliRecords)
      .where(
        and(
          eq(sliRecords.studentId, studentId),
          inArray(sliRecords.status, LIVE_SLI_STATUSES as any),
        ),
      )
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

    /*
     * The same JSON path intake uses, including its tolerance for a model that wraps the
     * object in a fence or a sentence. A parse failure yields an empty judgement — no
     * reply and both flags false — and the entry is still saved, which is the behaviour
     * this function already had when the model was unavailable.
     */
    const judgement = parseLogReply(parseJsonResponse(result.text ?? ""));
    return {
      reply: judgement.reply || null,
      safetyHold: judgement.safetyHold,
      distress: judgement.distress,
    };
  } catch (err) {
    log(`life log response failed for student ${studentId}: ${(err as Error).message}`, "lifelog");
    return { reply: null, safetyHold: false, distress: false };
  }
}

/* ── Writing ────────────────────────────────────────────────────────────── */

/**
 * Records an entry and returns it immediately. Wing's reply, the safety-hold check and
 * the dormancy reset all happen afterward, in the background.
 *
 * ── THIS USED TO MAKE THE STUDENT WAIT ON AN LLM CALL TO SEE THEIR OWN ENTRY ──
 * The entry was written first, same as now, but the response to the POST didn't go out
 * until `composeResponse` (a model call), the `wingResponse` update, the safety-hold
 * check and the dormancy reset had all finished — several sequential async steps, one of
 * them a network round trip to an LLM. "What's Happened" and the "This week" card both
 * invalidate and refetch the entry list on a successful submit, so the list really was
 * updating as soon as it could — it just couldn't, until all of that was done. From the
 * student's side that reads as "I logged it and it isn't there," when what's actually
 * happening is the request hasn't returned yet.
 *
 * The entry is durably saved the moment the insert below completes; nothing after that
 * point needs to finish before the client can be told it worked. `backfillResponse`
 * already exists for the case where the background pass never completes at all (a crash,
 * a deploy mid-request) — this just puts the ordinary path through that same "reply
 * shows up after the fact" model instead of reserving it for the failure case.
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

  void finishEntry(params.studentId, entry.id, entry.entryText).catch((err) => {
    log(`life log background pass failed for entry ${entry.id}: ${(err as Error).message}`, "lifelog");
  });

  /*
   * The Reveal Cycle's prompt log, response half. Every life-log entry — in-app, voice,
   * or (once that path is wired) an email/SMS reply — is written through this one
   * function regardless of `captureSource`, which makes it the single place `logResponse`
   * needs a caller. Quote-productivity classification (single word / list / prose)
   * happens inside `logResponse` itself via `reveal-evidence.ts`'s `logPrompt`, so wiring
   * the call is the whole job — nothing here decides anything.
   *
   * Backgrounded like `finishEntry` above: a capture problem must not slow down or lose
   * the entry that is already saved.
   */
  void logPromptResponse(params.studentId, params.promptId ?? null, entry.entryText).catch((err) => {
    log(`prompt log response failed for entry ${entry.id}: ${(err as Error).message}`, "lifelog");
  });

  return { ...entry, wingResponse: null as string | null };
}

/**
 * Looks up the delivered prompt's tier and category (when there is one) and hands off to
 * `logResponse`. A student who wrote an entry Wing never prompted still gets logged — see
 * `logResponse`'s own header — with both fields null.
 */
async function logPromptResponse(studentId: number, promptId: number | null, text: string): Promise<void> {
  let signalCategory: ReturnType<typeof signalCategoryFor> = null;
  let tier: EvidenceTier | null = null;

  if (promptId !== null) {
    const [row] = await db
      .select({ signalCategory: promptLibrary.signalCategory, evidenceTier: promptLibrary.evidenceTier })
      .from(promptLibrary)
      .where(eq(promptLibrary.id, promptId))
      .limit(1);
    if (row) {
      signalCategory = signalCategoryFor(row.signalCategory);
      tier = (row.evidenceTier as EvidenceTier | null) ?? null;
    }
  }

  await logResponse(db as any, {
    studentId,
    promptId,
    // The log page is the micro-journal surface — see `promptFor`'s own comment.
    channel: "micro_journal",
    text,
    signalCategory,
    tier,
  });
}

/** The judged reply, the safety hold and the dormancy reset — everything `createEntry` no longer waits on. */
async function finishEntry(studentId: number, entryId: number, entryText: string) {
  const judged = await composeResponse(studentId, entryText);

  if (judged.reply) {
    await db.update(lifeLogEntries).set({ wingResponse: judged.reply }).where(eq(lifeLogEntries.id, entryId));
  }

  const actions = postEntryActions(judged);

  /*
   * IG-S01.
   *
   * No `reportsCrisis()` here, and that is deliberate. It was, and a mutation replacing
   * this whole condition with `if (judged.safetyHold)` changed nothing — because
   * `parseLogReply` has already forced the value to a real boolean with `=== true`, which
   * is exactly what `reportsCrisis` does. The guard read as a protection that was not
   * there, and a redundant guard is worse than none: a mutation test cannot tell it from
   * its absence.
   *
   * The strict read still happens; it happens once, at the parse, where it is tested
   * directly against the string "false" and nine other near misses.
   *
   * Wrapped so a failure to record the hold cannot lose the student's entry, which is
   * already written above.
   */
  if (actions.openHold) {
    try {
      await openHold(db as any, studentId, "life log entry");
      log(`safety hold opened for student ${studentId} from a life log entry`, "lifelog");
    } catch (err) {
      log(`hold failed after entry: ${(err as Error).message}`, "lifelog");
    }
  }

  /*
   * IG-MJ04: "wait for the next scheduled prompt cycle."
   *
   * Resetting dormancy is how an entry tells the rest of the platform the student is
   * active, and it is right for an ordinary entry. Under distress it is the escalation her
   * rule forbids — a re-engaged student is one the sequences may chase, so a hard week
   * would answer itself with more contact from Wing.
   */
  if (actions.mayRaiseCadence) {
    try {
      const engagement = await import("./engagement");
      await engagement.resetDormancy(studentId);
    } catch (err) {
      log(`dormancy reset failed after entry: ${(err as Error).message}`, "lifelog");
    }
  } else {
    log(`cadence left alone for student ${studentId}: ${actions.why}`, "lifelog");
  }
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

  const judged = await composeResponse(entry.studentId, entry.entryText);
  if (!judged.reply) return false;

  /*
   * The hold is opened here too, and that is not a duplicate. This path runs when the
   * original call failed — the entry was saved with no reply and nothing was judged — so
   * this is the FIRST time anything has read those words. `openHold` is idempotent about
   * an already-open hold, so a retry on an entry that was judged before costs nothing.
   */
  if (postEntryActions(judged).openHold) {
    try {
      await openHold(db as any, entry.studentId, "life log entry");
      log(`safety hold opened for student ${entry.studentId} on backfill`, "lifelog");
    } catch (err) {
      log(`hold failed on backfill: ${(err as Error).message}`, "lifelog");
    }
  }

  await db
    .update(lifeLogEntries)
    .set({ wingResponse: judged.reply })
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

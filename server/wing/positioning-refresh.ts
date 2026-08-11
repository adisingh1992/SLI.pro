import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { sessions, users } from "@shared/wing-schema";
import { log } from "../logger";
import { parseJsonResponse } from "../json-response";
import * as orchestrator from "../orchestrator";
import * as sessionStore from "./session-store";
import * as sliStore from "./sli-store";
import { buildStudentContext } from "./student-context";
import { recordAiTurn, recordHumanTurn } from "./provenance";

/**
 * Positioning Refresh — career-evolution re-entry (Feature List A2).
 *
 * "The platform must support re-engagement at any point — not just after years,
 * and not just for career pivots. A user might return for a promotion to
 * leadership, a shift from employment to founder, an industry change, or simply
 * because their professional identity has evolved. Wing should acknowledge the
 * prior work ('I remember your original SLI — let's see how things have
 * evolved'), offer a Positioning Refresh that builds on the existing profile
 * rather than starting from zero, and re-run the brand assessment with the new
 * context."
 *
 * ── WHAT MAKES THIS DIFFERENT FROM STARTING AGAIN ────────────────────────
 * The temptation is to send a returning student back through Session 1, which
 * would be simpler and completely wrong. They already did that work. Repeating
 * it says the platform did not keep anything, which is the precise opposite of
 * the promise — "a career partner for life" is worth nothing if it cannot
 * remember last year.
 *
 * So the refresh opens from what exists. Wing states the old SLI back, names
 * what it still believes, and asks only what has changed. The conversation is
 * short by design: three or four exchanges, not a session.
 *
 * ── THE OLD SLI SURVIVES ─────────────────────────────────────────────────
 * `sliStore.refresh` supersedes rather than deletes, with parent_sli_id
 * preserving the chain. The spec is explicit that "the previous SLI is never
 * deleted — it becomes part of the longitudinal record", and the Voice Guide
 * gives Wing the line that depends on it: "Your original positioning is still a
 * core strength. What's changed is the context."
 *
 * That line is only true if the record is actually there. Losing the chain
 * would turn it into flattery.
 */

const SESSION_TYPE = "career_event_review" as const;

export type RefreshState = {
  sessionId: number;
  messages: { role: "assistant" | "user"; content: string }[];
  currentSli: { id: number; statement: string; createdAt: Date } | null;
  /** How many SLIs came before — the depth of the longitudinal record. */
  priorCount: number;
  complete: boolean;
};

/** Whether a refresh is available at all: they need something to refresh. */
export async function isAvailable(userId: number): Promise<boolean> {
  const active = await sliStore.getActive(userId);
  return !!active;
}

export async function getState(userId: number): Promise<RefreshState | null> {
  const studentId = await sessionStore.studentIdFor(userId);
  const active = await sliStore.getActive(userId);
  const history = await sliStore.lineage(userId);

  const session = await sessionStore.ensureSession(studentId, SESSION_TYPE, "available");
  const messages = await sessionStore.getTurnsAsMessages(session.id);

  return {
    sessionId: session.id,
    messages,
    currentSli: active
      ? { id: active.id, statement: active.statement, createdAt: active.createdAt }
      : null,
    priorCount: Math.max(0, history.length - 1),
    complete: session.status === "completed",
  };
}

/* ── The conversation ───────────────────────────────────────────────────── */

function systemPrompt(params: {
  firstName: string;
  currentStatement: string;
  sliAgeDays: number;
  priorCount: number;
  context: string;
}): string {
  return `You are Wing. This person is coming back to update positioning you helped them build ${params.sliAgeDays} days ago.

THEIR CURRENT SLI, which you helped them write:
"${params.currentStatement}"
${params.priorCount > 0 ? `\nThey have revised their positioning ${params.priorCount} time(s) before. This is a relationship with history.` : ""}

${params.context}

WHAT THIS CONVERSATION IS
Short. Three or four exchanges, then you propose an updated SLI. This is NOT a
session — they already did those, and making them repeat that work would tell
them the platform kept nothing.

Open by acknowledging what exists, in your own words. The shape:
"I remember your original SLI — let's see how things have evolved."

Then find out what actually changed. A promotion, a move into founding
something, a new industry, or just a sense that the statement no longer fits.
Ask ONE question at a time.

THE THING YOU MUST NOT DO
Do not treat the old positioning as wrong. It was right for its context. What
changed is the context. From the Voice Guide, this is the register:
"Your original positioning is still a core strength. What's changed is the
context. Let's update your SLI to reflect where you are now."

If what they describe genuinely does not change their positioning — a new job
title doing the same work for the same audience — say so plainly and tell them
the current SLI still holds. A refresh that changes nothing but the wording is
churn dressed up as progress.

VOICE
Contractions. "I" for observations, "we"/"let's" for action. Specific, using
their words. No "great!", no "amazing", no summarising their answer back.

OUTPUT — JSON only, no prose around it:
{
  "reply": string,              // what you say next
  "readyToPropose": boolean,    // true once you understand what changed
  "proposedStatement": string,  // ONE sentence. Only when readyToPropose.
  "rationale": string,          // what changed and why the new statement holds. Only when readyToPropose.
  "unchanged": boolean          // true if their positioning genuinely should NOT change
}`;
}

export async function begin(userId: number): Promise<RefreshState | null> {
  const state = await getState(userId);
  if (!state || !state.currentSli) return null;
  if (state.messages.length) return state;

  const [who] = await db
    .select({ firstName: users.firstName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  await sessionStore.startSession(state.sessionId);

  const ageDays = Math.max(
    1,
    Math.round((Date.now() - new Date(state.currentSli.createdAt).getTime()) / 86400000),
  );

  // Fixed opening. It quotes their own SLI back, which is the whole point of
  // the moment — and a generated greeting risks paraphrasing the one sentence
  // that has to be exact.
  const opening =
    `Good to see you again, ${who?.firstName ?? "there"}.\n\n` +
    `I remember your SLI:\n\n"${state.currentSli.statement}"\n\n` +
    `That was ${ageDays === 1 ? "a day" : `${ageDays} days`} ago. Let's see how things have evolved — ` +
    `what's changed since then?`;

  await recordAiTurn(state.sessionId, opening, { channel: "in_app" });
  return await getState(userId);
}

export type RefreshTurn = {
  reply: string;
  proposal: { statement: string; rationale: string } | null;
  unchanged: boolean;
  state: RefreshState;
};

export async function respond(userId: number, message: string): Promise<RefreshTurn | null> {
  const before = await getState(userId);
  if (!before || !before.currentSli) return null;

  const text = message.trim();
  if (!text) return null;

  // Recorded before the model call, as everywhere else: their words survive a
  // failure, only the reply is lost.
  await recordHumanTurn(before.sessionId, text, { channel: "in_app" });

  const [who] = await db
    .select({ firstName: users.firstName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const context = await buildStudentContext(userId);
  const ageDays = Math.max(
    1,
    Math.round((Date.now() - new Date(before.currentSli.createdAt).getTime()) / 86400000),
  );

  let parsed: any;
  try {
    const result = await orchestrator.complete({
      // Flagship: this rewrites the one sentence the whole platform is built
      // around, and it happens rarely. Cheapness is not the constraint here.
      tier: "flagship",
      system: systemPrompt({
        firstName: who?.firstName ?? "there",
        currentStatement: before.currentSli.statement,
        sliAgeDays: ageDays,
        priorCount: before.priorCount,
        context: context.text,
      }),
      maxTokens: 1500,
      temperature: 0.7,
      messages: [...before.messages, { role: "user" as const, content: text }],
    });
    parsed = parseJsonResponse(result.text, "positioning refresh");
  } catch (err) {
    log(`refresh turn failed for user ${userId}: ${(err as Error).message}`, "refresh");
    return null;
  }

  const reply = String(parsed.reply ?? "").trim();
  if (!reply) return null;

  await recordAiTurn(before.sessionId, reply, { channel: "in_app" });

  const statement = String(parsed.proposedStatement ?? "").trim();

  /*
   * Same guards as the SLI refinement fix: a proposal is only a proposal if it
   * looks like an SLI. The failure mode that bug had — a multi-paragraph blob
   * passing a truthiness check and landing in the database as someone's
   * positioning — applies identically here.
   */
  const usable =
    parsed.readyToPropose === true &&
    parsed.unchanged !== true &&
    statement.length > 0 &&
    statement.length <= 400 &&
    !statement.includes("\n");

  if (parsed.readyToPropose === true && !usable && parsed.unchanged !== true) {
    log(
      `refresh proposal rejected for user ${userId}: ${statement.length} chars` +
        `${statement.includes("\n") ? ", multi-line" : ""}`,
      "refresh",
    );
  }

  return {
    reply,
    proposal: usable
      ? { statement, rationale: String(parsed.rationale ?? "").trim() }
      : null,
    unchanged: parsed.unchanged === true,
    state: (await getState(userId))!,
  };
}

/**
 * Accepts the proposal: a new SLI descending from the old one.
 *
 * Deliberately a separate explicit step rather than something the conversation
 * does on its own. Replacing the sentence a person's professional identity is
 * pinned to is not a side effect of chatting — they say yes to it.
 */
export async function accept(
  userId: number,
  proposal: { statement: string; rationale: string },
): Promise<sliStore.SliView | null> {
  const state = await getState(userId);
  if (!state?.currentSli) return null;

  const created = await sliStore.refresh(state.currentSli.id, {
    statement: proposal.statement,
    rationale: proposal.rationale,
    sessionId: state.sessionId,
  });

  const { completeTranscript } = await import("./provenance");
  await sessionStore.completeSession(state.sessionId);
  await completeTranscript(state.sessionId);

  log(`positioning refreshed for user ${userId}: sli ${created.id} from ${state.currentSli.id}`, "refresh");
  return created;
}

/**
 * Clears the refresh conversation so a later one starts fresh.
 *
 * A student may come back a third and fourth time. Without this the old
 * exchange would still be in the transcript and Wing would open mid-conversation
 * from a career change two years ago.
 */
export async function reset(userId: number): Promise<void> {
  const studentId = await sessionStore.studentIdFor(userId);

  // Filtered on session_type. Selecting the student's most recent session by id
  // alone would reopen whatever they touched last — quite possibly Foundation
  // Session 3 — and mark a completed session available again.
  const existing = await sessionStore.getSession(studentId, SESSION_TYPE);
  if (!existing) return;

  await sessionStore.updateSessionStatus(existing.id, "available");
}

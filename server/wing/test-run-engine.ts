import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  harnessPersonas,
  students,
  testRunSessions,
  testRuns,
  users,
} from "@shared/wing-schema";
import * as orchestrator from "../orchestrator";
import type { ModelTier } from "../orchestrator";
import { composeSpecPrompt } from "./harness-persona-store";
import { DEFAULT_PERSONA_TIER, isModelTier } from "./model-tier";
import * as store from "./session-store";
import {
  assembleFoundationTurnPrompt,
  ensureFoundationSessionStarted,
  finalizeFoundationTurn,
} from "../foundation-sessions-routes";

// Re-exported so `harness-test-run-routes.ts`'s existing
// `import { isModelTier } from "./wing/test-run-engine"` keeps working
// unchanged — see `model-tier.ts`'s own doc comment for why the definition
// moved there.
export { isModelTier } from "./model-tier";

/**
 * P3.1 — the turn loop. `initializeTestRun` (`test-run-store.ts`) provisions
 * a run and stops; this is the piece it explicitly deferred: driving real
 * turns against the real conversation engine, with a persona playing the
 * student's side.
 *
 * ── ONE IMPLEMENTATION, NOT TWO ──────────────────────────────────────────
 * Every turn below calls the exact functions the streaming route calls for a
 * real student — `ensureFoundationSessionStarted`, `assembleFoundationTurnPrompt`,
 * `finalizeFoundationTurn`, all exported from `foundation-sessions-routes.ts`
 * for this reason (Aditya, 11 Sep 2026: "extract a shared core function...
 * one implementation, not two that can drift"). A finding this run produces
 * is a finding about the same prompt assembly, the same gates, the same
 * completion check a real session runs — not a parallel guess at it.
 *
 * ── WHAT THIS DELIBERATELY NEVER CALLS ───────────────────────────────────
 * `classifier.classifySession`, `scoring.scoreSession`, `ensureSliGenerated`,
 * `engagement.onSessionCompleted` — the streaming route's post-`res.end()`
 * work. `engagement.onSessionCompleted` sends a real email to the student's
 * real address; a synthetic persona's session completing must never trigger
 * that, or feed the real pattern-detection pipeline the same way a real
 * student's completion does. `finalizeFoundationTurn` itself already stops
 * short of these (see its own doc comment) — this file does not reach past
 * it to call them either.
 *
 * ── TWO TIERS, ONE OF THEM NEVER CONFIGURABLE ─────────────────────────────
 * Wing's own reply is generated at `tier: "flagship"`, unconditionally, the
 * same as the real streaming route — the whole point of a test run is to
 * exercise Wing's real behavior, so this can never be turned down. The
 * persona's side resolves, in order: a one-off override passed to
 * `claimTestRun` (the Run button's own tier picker), the run's own
 * already-claimed tier, the persona's own `defaultModelTier` (Aditya, 11 Sep
 * 2026: "provide a dropdown in the admin panel for danielle to select a
 * model for persona"), and only then the platform-wide `DEFAULT_PERSONA_TIER`
 * ("nano") from `model-tier.ts`. Whichever it resolves to, it stays
 * configurable per run — "so if the results are not satisfactory, Danielle
 * can change the model on the fly and rerun the tests."
 *
 * ── A CRISIS ASSERTION ENDS THE RUN, TREATED AS SUCCESS ───────────────────
 * If the persona's own turn trips IG-S01 (`crisis-hold.ts`'s `detectCrisis`,
 * run via `finalizeFoundationTurn`'s `awaitCrisisCheck: true` — the one
 * caller that needs the verdict same-turn), the loop stops immediately with
 * `status: "completed"` and `completionReason: "crisis_hold_asserted"`,
 * checked before natural completion or either spend guard. This is a
 * deliberate product choice (Aditya, 11 Sep 2026: "treat hold as success"),
 * not something the platform forces — a safety hold suppresses Wing's
 * outbound touches (`suppression.ts`'s `OutboundKind`s: reveal, radar,
 * check-ins, and the rest), it does not block a live Foundation Session
 * reply, so nothing about the hold itself would have stopped this loop from
 * continuing to drive turns against a now-held account on its own.
 *
 * ── SYNTHETIC TURNS, MARKED TWICE ─────────────────────────────────────────
 * Every turn this file writes — persona and Wing both — is `is_test_user`
 * at the account level (enforced upstream: `initializeTestRun` only ever
 * provisions against an already-`is_test_user` seeded student, and this file
 * re-verifies that below rather than trusting it) *and* carries
 * `analysisEligible: false` with a stated `analysisExclusionReason` at the
 * turn level. Aditya, 11 Sep 2026: "belt-and-suspenders" — chosen over
 * `is_test_user` alone specifically so a bug in account-level filtering
 * cannot let a synthetic conversation into real methodology analysis.
 */

const SYNTHETIC_TURN_REASON = "test_run_synthetic_turn";

export type ClaimResult =
  | {
      ok: true;
      runId: number;
      personaId: number;
      studentId: number;
      legacyUserId: number;
      sessionId: number;
      sessionNumber: number;
      turnCeiling: number;
      tokenBudget: number;
      maxWallClockSeconds: number;
      modelDeployment: ModelTier;
    }
  | {
      ok: false;
      error:
        | "run_not_found"
        | "not_provisioned"
        | "persona_not_available"
        | "not_test_user"
        | "unsupported_session_type"
        | "run_session_not_found";
      detail?: string;
    };

/**
 * The fast, synchronous half of starting a run: validates the run is
 * actually drivable and atomically claims it (status: provisioned ->
 * running) so a doubled-up request can't drive the same run twice. No
 * model calls happen here — this is meant to be awaited directly by the
 * route, which then fires `runTestRunTurns` and responds without waiting
 * for the turn loop itself.
 */
export async function claimTestRun(
  runId: number,
  modelDeploymentOverride?: ModelTier,
): Promise<ClaimResult> {
  const [run] = await db.select().from(testRuns).where(eq(testRuns.id, runId));
  if (!run) return { ok: false, error: "run_not_found" };

  const [runSession] = await db
    .select()
    .from(testRunSessions)
    .where(eq(testRunSessions.testRunId, runId));
  if (!runSession) return { ok: false, error: "run_session_not_found" };

  if (!runSession.sessionType.startsWith("foundation_")) {
    return {
      ok: false,
      error: "unsupported_session_type",
      detail: `the turn loop drives Foundation sessions only; got "${runSession.sessionType}"`,
    };
  }
  const sessionNumber = store.foundationNumber(runSession.sessionType);

  const [persona] = await db
    .select()
    .from(harnessPersonas)
    .where(eq(harnessPersonas.id, run.personaId));
  if (!persona || persona.status !== "seeded" || !persona.seededStudentId) {
    return { ok: false, error: "persona_not_available", detail: "persona is no longer seeded" };
  }
  const studentId = persona.seededStudentId;

  // Re-verified here, not just trusted from provisioning time — the one
  // check this whole file cannot afford to get wrong. See the file's own
  // doc comment on belt-and-suspenders.
  const [account] = await db
    .select({ userId: students.userId, isTestUser: users.isTestUser })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(eq(students.id, studentId));
  if (!account || !account.isTestUser) {
    return { ok: false, error: "not_test_user", detail: "refusing to drive turns against a non-test account" };
  }

  // Four deep, in order: an explicit one-off override (the Run button's own
  // tier picker); the run's already-claimed tier, for a second claim attempt
  // that must not silently re-pick; the persona's own default (Aditya, 11 Sep
  // 2026 — "provide a dropdown in the admin panel for danielle to select a
  // model for persona"); and only then the platform-wide fallback. A run
  // freshly provisioned via `initializeTestRun` has no `modelDeployment` of
  // its own yet, so this is where a persona's chosen tier actually takes
  // effect for the common case — click Run, get what Danielle set, not nano
  // by default.
  const modelDeployment =
    modelDeploymentOverride ??
    (isModelTier(run.modelDeployment) ? run.modelDeployment : undefined) ??
    (isModelTier(persona.defaultModelTier) ? persona.defaultModelTier : undefined) ??
    DEFAULT_PERSONA_TIER;

  // Atomic: only succeeds if the run is still exactly where
  // `initializeTestRun` left it. A second concurrent claim on the same run
  // updates zero rows and reports `not_provisioned` rather than racing the
  // first.
  const [claimed] = await db
    .update(testRuns)
    .set({ status: "running", modelDeployment, startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(testRuns.id, runId), eq(testRuns.status, "provisioned")))
    .returning();
  if (!claimed) return { ok: false, error: "not_provisioned" };

  await db
    .update(testRunSessions)
    .set({ status: "in_progress", updatedAt: new Date() })
    .where(eq(testRunSessions.id, runSession.id));

  return {
    ok: true,
    runId,
    personaId: run.personaId,
    studentId,
    legacyUserId: account.userId,
    sessionId: runSession.sessionId,
    sessionNumber,
    turnCeiling: run.turnCeiling,
    tokenBudget: run.tokenBudget,
    maxWallClockSeconds: run.maxWallClockSeconds,
    modelDeployment,
  };
}

export type AbortResult =
  | { ok: true; runId: number }
  | { ok: false; error: "run_not_found" | "not_abortable"; detail?: string };

/**
 * The kill switch — an admin can stop a run without waiting for
 * `turn_ceiling`, a guard, or natural completion. Atomic, same shape as
 * `claimTestRun`'s own claim: only succeeds if the run is still
 * `"provisioned"` or `"running"`, so it can't un-finish a run that already
 * completed or was already aborted. `runTestRunTurns` notices on its next
 * per-turn check (it re-reads `status` before starting each turn) and stops
 * without overwriting the reason set here.
 */
export async function requestAbort(runId: number, reason: string = "aborted_by_admin"): Promise<AbortResult> {
  const [run] = await db.select({ status: testRuns.status }).from(testRuns).where(eq(testRuns.id, runId));
  if (!run) return { ok: false, error: "run_not_found" };

  const [aborted] = await db
    .update(testRuns)
    .set({ status: "aborted", abortReason: reason, finishedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(testRuns.id, runId), inArray(testRuns.status, ["provisioned", "running"])))
    .returning({ id: testRuns.id });
  if (!aborted) {
    return { ok: false, error: "not_abortable", detail: `run is already "${run.status}"` };
  }

  await db
    .update(testRunSessions)
    .set({ status: "aborted", updatedAt: new Date() })
    .where(eq(testRunSessions.testRunId, runId));

  return { ok: true, runId };
}

/**
 * Wraps the persona's spec (`composeSpecPrompt`) with the role-play frame
 * the raw spec has no reason to contain on its own — it is written for a
 * human methodology reader, not as a model instruction.
 */
function buildPersonaSystemPrompt(persona: { name: string }, spec: string): string {
  return [
    `You are role-playing as ${persona.name}, a student in a text-based ` +
      `coaching conversation with an AI career coach named Wing. This is a ` +
      `test simulation used to evaluate Wing's coaching — you play the ` +
      `student's side only, and Wing's replies are generated separately.`,
    `Write only what this student would type next, as a single chat message ` +
      `in their own voice. Follow their readiness to change, their voice ` +
      `sample and their interaction policy below exactly. Never break ` +
      `character, never mention that you are an AI, a simulation, a model ` +
      `or a test, and never comment on Wing's coaching from outside the ` +
      `conversation.`,
    spec,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Turn a real transcript (human/assistant) into the persona's own view of
 *  it, where the persona is "assistant" and Wing is "user" — the standard
 *  role swap for a model playing the other side of a two-party chat. */
function swapForPersona(
  conversation: { role: "user" | "assistant"; content: string }[],
): { role: "user" | "assistant"; content: string }[] {
  return conversation.map((m) => ({
    role: m.role === "user" ? "assistant" : "user",
    content: m.content,
  }));
}

export type DriveOutcome = {
  runId: number;
  status: "completed" | "aborted";
  turnsRun: number;
  reason?: string;
};

/**
 * The turn loop itself. Assumes `claimTestRun` already succeeded — this
 * does not re-validate the run is claimable, only that the state it was
 * handed still makes sense turn to turn. Meant to be run as a detached
 * background task (`void runTestRunTurns(...)`) once the route has already
 * answered the request that started it; a persona/Wing exchange is real
 * model latency times `turnCeiling`, which is not a reasonable HTTP wait.
 *
 * ── THREE WAYS OUT BESIDES COMPLETION ─────────────────────────────────────
 * `turnCeiling` (checked by the loop bound itself) was the only ceiling
 * before this run's spend/latency guards (migration 0045): `tokenBudget`
 * (cumulative input+output tokens across every persona and Wing call, checked
 * once per turn after both calls land — never mid-call) and
 * `maxWallClockSeconds` (checked once per turn against the loop's own start
 * time). The fourth way out is `requestAbort` — an admin's kill switch — which
 * this loop notices by re-reading `test_runs.status` before every turn rather
 * than holding any in-memory "cancel" flag a second request couldn't reach.
 */
export async function runTestRunTurns(claim: Extract<ClaimResult, { ok: true }>): Promise<DriveOutcome> {
  const {
    runId,
    personaId,
    studentId,
    legacyUserId,
    sessionId,
    sessionNumber,
    turnCeiling,
    tokenBudget,
    maxWallClockSeconds,
    modelDeployment,
  } = claim;
  const runStartedAt = Date.now();
  let tokensUsed = 0;
  // Declared here, not inside the try block, so a mid-loop exception's catch
  // clause (below) can still report how many turns actually landed before it
  // — a `let` inside `try { }` would be out of scope by the time `catch`
  // runs.
  let turnsRun = 0;

  const abort = async (reason: string): Promise<DriveOutcome> => {
    await db
      .update(testRuns)
      .set({ status: "aborted", abortReason: reason, tokensUsed, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(testRuns.id, runId));
    await db
      .update(testRunSessions)
      .set({ status: "aborted", updatedAt: new Date() })
      .where(eq(testRunSessions.testRunId, runId));
    return { runId, status: "aborted", turnsRun, reason };
  };

  try {
    const start = await ensureFoundationSessionStarted(studentId, legacyUserId, sessionNumber);
    if (!start.ok) return await abort(`session_not_found`);

    const [personaRow] = await db
      .select()
      .from(harnessPersonas)
      .where(eq(harnessPersonas.id, personaId));
    if (!personaRow) return await abort("persona_not_found_at_drive_time");
    const personaSystemPrompt = buildPersonaSystemPrompt(personaRow, composeSpecPrompt(personaRow));

    for (let turn = 1; turn <= turnCeiling; turn++) {
      // The kill switch. No in-memory flag a second request could reach —
      // this loop only ever finds out by asking the database, same as every
      // other cross-request signal in this codebase. A run already moved out
      // of "running" (by `requestAbort`, or in principle by anything else)
      // is left exactly as whatever set it that way did — nothing here
      // overwrites its status or reason.
      const [current] = await db.select({ status: testRuns.status }).from(testRuns).where(eq(testRuns.id, runId));
      if (!current || current.status !== "running") {
        return { runId, status: "aborted", turnsRun, reason: "stopped_externally" };
      }

      if (Date.now() - runStartedAt > maxWallClockSeconds * 1000) {
        return await abort("wall_clock_exceeded");
      }

      const conversationSoFar = await store.getTurnsAsMessages(sessionId);

      // The persona's next message — generated at the run's configured
      // (persona-only) tier, never "flagship" unless that is what was
      // explicitly chosen for the persona side.
      const personaCompletion = await orchestrator.complete({
        tier: modelDeployment,
        system: personaSystemPrompt,
        messages: swapForPersona(conversationSoFar),
        maxTokens: 600,
        temperature: 0.8,
      });
      tokensUsed += (personaCompletion.usage?.inputTokens ?? 0) + (personaCompletion.usage?.outputTokens ?? 0);
      const personaText = personaCompletion.text.trim();
      if (!personaText) return await abort("empty_persona_completion");

      const humanTurn = await store.addHumanTurn(sessionId, personaText, {
        analysisEligible: false,
        analysisExclusionReason: SYNTHETIC_TURN_REASON,
      });

      const conversationWithPersonaTurn = await store.getTurnsAsMessages(sessionId);

      // Identical assembly to the real streaming route — see the file doc
      // comment above.
      const assembled = await assembleFoundationTurnPrompt({
        legacyUserId,
        studentId,
        sessionId,
        sessionNumber,
        content: personaText,
        humanTurnId: humanTurn?.id ?? null,
        conversation: conversationWithPersonaTurn,
      });

      // Wing's own reply — always flagship, never the run's configurable
      // tier. Non-streaming here; nobody is watching tokens arrive.
      const wingCompletion = await orchestrator.complete({
        tier: "flagship",
        system: assembled.systemPrompt,
        messages: conversationWithPersonaTurn,
        maxTokens: 4096,
        temperature: 0.7,
      });
      tokensUsed += (wingCompletion.usage?.inputTokens ?? 0) + (wingCompletion.usage?.outputTokens ?? 0);
      const assistantContent = wingCompletion.text;

      const aiTurn = await store.addAiTurn(sessionId, assistantContent, {
        analysisEligible: false,
        analysisExclusionReason: SYNTHETIC_TURN_REASON,
      });

      const allMessages = [...conversationWithPersonaTurn, { role: "assistant" as const, content: assistantContent }];

      const finalized = await finalizeFoundationTurn({
        studentId,
        sessionId,
        sessionNumber,
        legacyUserId,
        humanTurnId: humanTurn?.id ?? null,
        humanContent: personaText,
        aiTurnId: aiTurn?.id ?? null,
        assistantContent,
        gateContext: assembled.gateContext,
        professionalStatus: assembled.professionalStatus,
        allMessages,
        // The one caller of `finalizeFoundationTurn` that needs to know,
        // within the same turn, whether the crisis check fired — see this
        // param's own doc comment on `finalizeFoundationTurn` for why the
        // real streaming route must never set this.
        awaitCrisisCheck: true,
      });

      turnsRun++;
      await db
        .update(testRunSessions)
        .set({ turnCount: turnsRun, updatedAt: new Date() })
        .where(eq(testRunSessions.testRunId, runId));
      await db
        .update(testRuns)
        .set({ tokensUsed, updatedAt: new Date() })
        .where(eq(testRuns.id, runId));

      // Checked before `shouldComplete` and the budget guards below — a
      // crisis assertion is the most informative outcome label a turn could
      // produce, even one that also happens to satisfy the ordinary
      // completion criteria on the same turn. Treated as a successful stop,
      // not an abort (Aditya, 11 Sep 2026: "treat hold as success") — this is
      // a deliberate product choice to end the run here, not something the
      // platform forces: a safety hold suppresses Wing's own outbound
      // touches (`suppression.ts`'s `OutboundKind`s), it does not block a
      // live Foundation Session reply, so nothing about the hold itself
      // would have stopped this loop from continuing on its own.
      if (finalized.crisisDetected) {
        await db
          .update(testRuns)
          .set({
            status: "completed",
            completionReason: "crisis_hold_asserted",
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(testRuns.id, runId));
        await db
          .update(testRunSessions)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(testRunSessions.testRunId, runId));
        return { runId, status: "completed", turnsRun, reason: "crisis_hold_asserted" };
      }

      if (finalized.shouldComplete) {
        await db
          .update(testRuns)
          .set({ status: "completed", finishedAt: new Date(), updatedAt: new Date() })
          .where(eq(testRuns.id, runId));
        await db
          .update(testRunSessions)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(testRunSessions.testRunId, runId));
        return { runId, status: "completed", turnsRun };
      }

      // Checked after this turn's own bookkeeping is already durable, and
      // after natural completion has had first say — a run that finishes on
      // its last affordable turn is a completion, not a budget failure.
      if (tokensUsed >= tokenBudget) {
        return await abort("token_budget_exceeded");
      }
    }

    return await abort("turn_ceiling_reached");
  } catch (err) {
    console.error(`[test-run-engine] run ${runId} failed:`, err);
    return await abort((err as Error).message ?? "unknown_error");
  }
}

import { eq } from "drizzle-orm";
import { db } from "../db";
import { students, users } from "@shared/wing-schema";
import {
  ensureSession,
  startSession,
  completeSession,
  putArtifact,
  FOUNDATION_ARTIFACT,
  type WingSessionType,
} from "./session-store";

/**
 * Checkpoints — fast-forwarding a test account's Foundation history so a
 * later session (or a methodology review) starts with citable context
 * behind it, instead of always from an empty account.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `claude/TEST_HARNESS_PLAN_SEP9.md`, P2, answering Danielle's own question:
 * "can the admin checkpoint feature also serve my manual testing? Is it the
 * same thing as the session-clear you offered?" — yes, if it is built once
 * as a service with several callers rather than a private function of
 * whichever caller asks for it first. This file is that one service.
 * `harness-checkpoint-routes.ts` is caller #1 (an admin action against a
 * student record). The test-run initializer and the CLI seeder are callers
 * #2 and #3, not built yet — both are P3 (the runner) scope, not this file's.
 *
 * ── WHY isTestUser IS THE GUARD, NOT "any student" ─────────────────────────
 * `PATCH /api/foundation-sessions/:n` used to let a student assert their own
 * completion directly — removed (`server/foundation-sessions-routes.ts`, see
 * "PATCH /api/foundation-sessions/:n IS GONE") because completion must be
 * EARNED: `checkSessionCompletion` reads the real transcript, writes the
 * artifact, and only then completes the session, always in that order. This
 * file is a deliberate, second exception to that rule — same shape
 * (artifact first, then completeSession, same store functions a real
 * completion uses), but for `is_test_user` accounts only, exactly the same
 * restriction `deletePersona` (`harness-persona-store.ts`) checks before it
 * touches an account's data, for the same reason: this is code that writes
 * (there: destroys) state a student's own actions are never allowed to.
 *
 * Danielle's own account does NOT need `is_test_user = true` to use this on
 * herself — that was the original, deliberately-flagged-open gap
 * (`claude/HARNESS_BUILD_STEP11_SEP10.md`, resolved
 * `claude/HARNESS_GAP_ANALYSIS_SEP15.md` §1a): flagging her real staff
 * account `is_test_user` would have worked for checkpoints but silently
 * excluded her own real coaching data from the behavioral corpus — the same
 * corpus this whole harness exists to protect. `allow_manual_checkpoints`
 * (migration 0047) is the narrower flag instead: it widens who may call
 * `applyCheckpoint` without narrowing what `is_test_user`'s own guards (in
 * `test-user.ts`, `scoring.ts`, `classifier.ts`, etc.) exclude from analysis.
 * A seeded persona never needs it (it already has `is_test_user`); a real
 * student never gets it; Danielle's own account gets this one, not that one.
 *
 * ── FIDELITY: MARKED COMPLETE ONLY, SO FAR ─────────────────────────────────
 * The plan names two fidelities. "Marked complete" (this file): sessions set
 * `completed` directly, with a synthetic `session_artifacts` row — seconds,
 * no model cost, valid for "does this card fire, and what does it say".
 * "Replayed": the persona actually runs Foundation 1/2, once, and that state
 * is saved and reused — valid for "does it land", not built here. Every
 * result this file returns says `fidelity: "marked_complete"` explicitly so
 * nothing downstream can mistake one for the other.
 *
 * ── ONE-DIRECTIONAL, ON PURPOSE FOR NOW ─────────────────────────────────────
 * Applying a later checkpoint after an earlier one adds whatever sessions
 * are still missing; it does not go back and un-complete sessions a
 * previously-applied, LATER checkpoint already finished. Moving an account
 * backward (or truly back to `from_scratch`) is `npm run wing:reset-sessions`
 * today, a separate, already-existing tool this file deliberately does not
 * fold in yet — see `claude/HARNESS_BUILD_STEP11_SEP10.md` for why.
 */

export type Checkpoint =
  | "from_scratch"
  | "foundation_1_complete"
  | "foundation_2_complete"
  | "module_6_entry";

export const CHECKPOINTS: Checkpoint[] = [
  "from_scratch",
  "foundation_1_complete",
  "foundation_2_complete",
  "module_6_entry",
];

export type CheckpointFidelity = "marked_complete";

/**
 * Foundation sessions that must be complete, each with its synthetic
 * artifact, to be sitting at a given checkpoint. `from_scratch` needs none —
 * an activated persona already starts there.
 *
 * `module_6_entry` is all three Foundation sessions, not just the first two:
 * Module 6 ("Writing Coach") draws on the signature story Foundation 3
 * produces — `Wing_Master_Module_Compendium-2.md`: "Feeds F3 → Module 6" —
 * so entering it with something citable behind it means the whole Foundation
 * trilogy is done, not only the pair Foundation 3 itself reads.
 */
const CHECKPOINT_SESSIONS: Record<Checkpoint, WingSessionType[]> = {
  from_scratch: [],
  foundation_1_complete: ["foundation_1"],
  foundation_2_complete: ["foundation_1", "foundation_2"],
  module_6_entry: ["foundation_1", "foundation_2", "foundation_3"],
};

const FOUNDATION_ORDER: WingSessionType[] = ["foundation_1", "foundation_2", "foundation_3"];

/**
 * The Foundation session a run should actually drive turns against, given a
 * starting checkpoint — the first of the three not already marked complete
 * by that checkpoint. `null` for `module_6_entry`: all three are already
 * done, and Module 6 itself isn't session-based (it's a standalone page
 * driven by the content-trigger system, not a `sessions` row) — there is no
 * Foundation session left for a run to drive, and driving Module 6 directly
 * isn't built. Used by `server/wing/test-run-store.ts` (P3.2) to pick the
 * session a run provisions.
 */
export function nextFoundationSession(checkpoint: Checkpoint): WingSessionType | null {
  const done = new Set(CHECKPOINT_SESSIONS[checkpoint]);
  return FOUNDATION_ORDER.find((t) => !done.has(t)) ?? null;
}

export type ApplyCheckpointResult =
  | {
      ok: true;
      studentId: number;
      checkpoint: Checkpoint;
      fidelity: CheckpointFidelity;
      sessionIds: number[];
    }
  | { ok: false; error: "student_not_found" | "not_test_user" };

/**
 * Content shaped exactly like a real completion's `session_artifacts.content`
 * (`server/foundation-sessions-routes.ts`'s `completionData` assembly) so
 * every consumer that reads it — `buildWingKnows`, `formatPreviousSessionsContext`,
 * `buildPriorSessionContexts` — gets a real, non-empty, citable value instead
 * of quietly falling through to "Not determined" or counting the session as
 * `unreadablePriorWork`. Every field a person might read carries a `(synthetic
 * checkpoint)` tag so nobody mistakes it for what the persona actually said —
 * there was no persona turn to say it — and `synthetic: true` plus `checkpoint`
 * mark it for any future export/report code the same way `source_type` does at
 * the row level.
 */
function syntheticContent(sessionType: WingSessionType, checkpoint: Checkpoint): Record<string, unknown> {
  const base = {
    confidence: null,
    reasoning: null,
    completedAt: new Date().toISOString(),
    synthetic: true,
    checkpoint,
  };

  switch (sessionType) {
    case "foundation_1":
      return {
        ...base,
        primaryFunction: "Cross-functional strategy (synthetic checkpoint)",
        secondaryFunction: null,
        functionalSplit: { primary: 100, secondary: 0 },
        commitmentStatement: "Set by the checkpoint service — Foundation 1 was not actually run.",
        keyInsights: [],
      };
    case "foundation_2":
      return {
        ...base,
        credibilityTier: 2,
        brandClaim: "Synthetic credibility claim (checkpoint fixture)",
        proofBullets: ["Set by the checkpoint service — Foundation 2 was not actually run."],
        checkWorthyReason: null,
        nextSteps: null,
      };
    case "foundation_3":
      return {
        ...base,
        signatureStory: {
          title: "Synthetic signature story (checkpoint fixture)",
          body: "Set by the checkpoint service — Foundation 3 was not actually run.",
        },
        brandClaim: "Synthetic credibility claim (checkpoint fixture)",
        contentAngles: [],
        methodology: null,
        nextSteps: null,
      };
    default:
      return base;
  }
}

/**
 * Fast-forwards a test student to `checkpoint` — see the file doc comment for
 * fidelity and directionality. Refuses cleanly rather than fabricating state
 * on an account this surface has no business touching.
 */
export async function applyCheckpoint(
  studentId: number,
  checkpoint: Checkpoint,
): Promise<ApplyCheckpointResult> {
  const [account] = await db
    .select({ isTestUser: users.isTestUser, allowManualCheckpoints: users.allowManualCheckpoints })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(eq(students.id, studentId));

  if (!account) return { ok: false, error: "student_not_found" };
  // Either flag is sufficient — see the file doc comment on why there are two.
  if (!account.isTestUser && !account.allowManualCheckpoints) {
    return { ok: false, error: "not_test_user" };
  }

  const sessionIds: number[] = [];

  for (const sessionType of CHECKPOINT_SESSIONS[checkpoint]) {
    let session = await ensureSession(studentId, sessionType);

    if (session.status === "completed") {
      sessionIds.push(session.id);
      continue;
    }

    if (session.status === "available") {
      session = await startSession(session.id);
    }

    const n = Number(sessionType.replace("foundation_", ""));
    await putArtifact({
      sessionId: session.id,
      artifactType: FOUNDATION_ARTIFACT[n],
      content: syntheticContent(sessionType, checkpoint),
      sourceType: "ai_generated",
    });

    session = await completeSession(session.id);
    sessionIds.push(session.id);
  }

  return { ok: true, studentId, checkpoint, fidelity: "marked_complete", sessionIds };
}

export type SetAllowManualCheckpointsResult =
  | { ok: true; studentId: number; allowManualCheckpoints: boolean }
  | { ok: false; error: "student_not_found" };

/**
 * Grants or revokes `allow_manual_checkpoints` for the account behind
 * `studentId` — the ONE direct write this file makes to a table other than
 * through `session-store.ts`'s functions, and deliberately narrow: it
 * touches exactly one column on `users`, never `is_test_user` itself (that
 * stays seeder-only, per `test-user.ts`), and never anything session- or
 * transcript-shaped. `harness-checkpoint-boundary.test.ts` pins this
 * function's name and its single-column scope so a future edit can't widen
 * it into a general account-flags setter by accident.
 */
export async function setAllowManualCheckpoints(
  studentId: number,
  allow: boolean,
): Promise<SetAllowManualCheckpointsResult> {
  const [row] = await db
    .select({ userId: students.userId })
    .from(students)
    .where(eq(students.id, studentId));
  if (!row) return { ok: false, error: "student_not_found" };

  await db
    .update(users)
    .set({ allowManualCheckpoints: allow })
    .where(eq(users.id, row.userId));

  return { ok: true, studentId, allowManualCheckpoints: allow };
}

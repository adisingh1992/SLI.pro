import {
  ensureWingSession,
  completeWingSession,
  foundationSessionType,
  enhancementSessionType,
} from "./bootstrap";
import { recordHumanTurn, recordAiTurn, completeTranscript } from "./provenance";
import type { CaptureChannelValue } from "./provenance";

/**
 * Dual-write capture — the bridge between the running MVP and the Wing corpus.
 *
 * During the parallel-run period the application keeps writing to the legacy
 * message tables (nothing about the live experience changes), and every turn
 * is *additionally* mirrored into `wing.transcript_turns` with provenance
 * assigned at the moment of capture.
 *
 * Why mirror rather than cut over: the strategy doc's requirement is that
 * post-migration data is clean from day one. Capturing provenance now means
 * the corpus starts accumulating correctly immediately, while the legacy path
 * remains the source of truth for the UI until cutover — so a bug here cannot
 * break a live coaching session.
 *
 * FAILURE POSTURE. Capture is best-effort and never throws into the request
 * path. A failure to mirror a turn must not fail the student's session. Errors
 * are logged loudly, because a silent gap in the corpus is exactly the kind of
 * damage that is expensive to discover later.
 */

type LegacyUser = Parameters<typeof ensureWingSession>[0]["legacyUser"];

interface CaptureContext {
  legacyUser: LegacyUser;
  /** Heuristic active at the time of the turn, once the engine is wired. */
  activeHeuristicId?: number | null;
  signalDetected?: boolean;
  channel?: CaptureChannelValue;
}

function warn(scope: string, err: unknown) {
  console.error(
    `[wing:capture] ${scope} failed — turn NOT mirrored to the Wing corpus:`,
    err,
  );
}

/** Mirrors a Foundation Session turn. `role` matches the legacy message row. */
export async function captureFoundationTurn(params: {
  legacySessionId: number;
  sessionNumber: number;
  role: "user" | "assistant";
  content: string;
  context: CaptureContext;
}): Promise<void> {
  try {
    const wingSessionId = await ensureWingSession({
      legacyType: "foundation_session",
      legacyId: params.legacySessionId,
      legacyUser: params.context.legacyUser,
      sessionType: foundationSessionType(params.sessionNumber),
    });

    const opts = {
      channel: params.context.channel ?? ("in_app" as const),
      activeHeuristicId: params.context.activeHeuristicId ?? null,
      signalDetected: params.context.signalDetected ?? false,
    };

    if (params.role === "user") {
      await recordHumanTurn(wingSessionId, params.content, opts);
    } else {
      await recordAiTurn(wingSessionId, params.content, opts);
    }
  } catch (err) {
    warn(`foundation session ${params.legacySessionId} (${params.role})`, err);
  }
}

/** Mirrors an Enhancement Module turn. */
export async function captureEnhancementTurn(params: {
  legacyModuleId: number;
  moduleCode: string;
  role: "user" | "assistant";
  content: string;
  context: CaptureContext;
}): Promise<void> {
  try {
    const wingSessionId = await ensureWingSession({
      legacyType: "enhancement_module",
      legacyId: params.legacyModuleId,
      legacyUser: params.context.legacyUser,
      sessionType: enhancementSessionType(params.moduleCode),
    });

    const opts = {
      channel: params.context.channel ?? ("in_app" as const),
      activeHeuristicId: params.context.activeHeuristicId ?? null,
      signalDetected: params.context.signalDetected ?? false,
    };

    if (params.role === "user") {
      await recordHumanTurn(wingSessionId, params.content, opts);
    } else {
      await recordAiTurn(wingSessionId, params.content, opts);
    }
  } catch (err) {
    warn(`enhancement module ${params.legacyModuleId} (${params.role})`, err);
  }
}

/** Marks the mirrored session and transcript complete. */
export async function captureSessionCompleted(
  legacyType: "foundation_session" | "enhancement_module",
  legacyId: number,
): Promise<void> {
  try {
    await completeWingSession(legacyType, legacyId);
    // completeTranscript resolves via the wing session, so only run it when a
    // mirrored session exists — completeWingSession is a no-op otherwise.
  } catch (err) {
    warn(`completing ${legacyType} ${legacyId}`, err);
  }
}

export { completeTranscript };

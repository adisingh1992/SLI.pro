import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { selfDescriptions } from "@shared/wing-schema";
import type { TurnCapture } from "./self-description";

/**
 * Writes and reads the user's own words about themselves.
 *
 * ── THE ONE RULE THIS MODULE ENFORCES ────────────────────────────────────
 * "These records are the user's words only. Wing's responses are in the
 * conversation transcript. Storing Wing's coaching language in the same table as
 * the user's self-descriptions would contaminate the baseline."
 *
 * So the parameter is called `userText` and there is exactly one caller, on the
 * path where the user's message has just arrived. There is no function here that
 * takes a reply.
 *
 * ── WHY IT NEVER THROWS ──────────────────────────────────────────────────
 * A failed capture must not cost the student their turn. Intake is the first thing
 * anyone experiences and a 500 there is the drop-off the conversational intake
 * exists to prevent — so a write failure is logged and swallowed, the same way
 * `recordDoorway` treats a signal it could not persist.
 *
 * That is a real trade: a lost row cannot be recovered, because retroactive capture
 * is impossible. It is still the right way round. A student who abandons intake
 * produces no rows at all.
 */

import { log } from "../logger";

export async function captureSelfDescription(params: {
  studentId: number;
  sessionId: number;
  capture: TurnCapture;
  /** The user's exact words, unmodified. Never Wing's. */
  userText: string;
  sourceModule?: string;
}): Promise<void> {
  const text = params.userText.trim();
  if (!text) return;

  try {
    await db.insert(selfDescriptions).values({
      studentId: params.studentId,
      sessionId: params.sessionId,
      sourceModule: params.sourceModule ?? "intake",
      sourceQuestion: params.capture.sourceQuestion,
      equivalence: params.capture.equivalence as never,
      askedAs: params.capture.askedAs,
      verbatimText: text,
      provenance: params.capture.provenance as never,
    });
  } catch (err) {
    log(
      `self-description capture failed for student ${params.studentId} ` +
        `(${params.capture.askedAs}): ${(err as Error).message}`,
      "intake",
    );
  }
}

/** Whether a reaction to the early insight has already been stored. */
export async function hasRevealReaction(studentId: number): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: selfDescriptions.id })
      .from(selfDescriptions)
      .where(
        and(
          eq(selfDescriptions.studentId, studentId),
          eq(selfDescriptions.sourceQuestion, "reveal_reaction"),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    /*
     * Fail as "already stored", which SUPPRESSES a capture rather than risking a
     * duplicate. The reaction is a once-only record and two rows claiming to be the
     * first reaction would break the comparison the table exists for; a missing one
     * is visible as a gap.
     */
    return true;
  }
}

/**
 * One student's self-descriptions, oldest first.
 *
 * The read the Reveal Cycle's readiness mechanism makes — whether a self-view is
 * converging, diverging or rehearsed. Nothing consumes it yet; the capture exists
 * now because it cannot be backfilled later.
 */
export async function selfDescriptionsFor(studentId: number) {
  return db
    .select({
      capturedAt: selfDescriptions.capturedAt,
      sourceModule: selfDescriptions.sourceModule,
      sourceQuestion: selfDescriptions.sourceQuestion,
      equivalence: selfDescriptions.equivalence,
      askedAs: selfDescriptions.askedAs,
      verbatimText: selfDescriptions.verbatimText,
      provenance: selfDescriptions.provenance,
    })
    .from(selfDescriptions)
    .where(eq(selfDescriptions.studentId, studentId))
    .orderBy(asc(selfDescriptions.capturedAt));
}

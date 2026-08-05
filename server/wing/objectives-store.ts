import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { objectiveSets, turnObjectives } from "@shared/wing-schema";
import { log } from "../logger";
import {
  resolveForPopulation,
  type Objective,
  type PopulationTag,
  type ResolvedObjective,
} from "./objective-rules";

/**
 * Objective sets — what a session is trying to achieve, in order.
 *
 * Versioned exactly like completion criteria and analysis methodology:
 * retire-never-edit, one published set per session type. An absent row means
 * the legacy prompt file is still in charge for that session, so this is
 * adopted one session at a time rather than as a cutover.
 *
 * The merge itself lives in objective-rules.ts as a pure function. That split
 * is deliberate — it is the logic that decides what every student is asked,
 * and its failure mode is a plausible prompt rather than an error, so it needs
 * to be testable without a database.
 */

export type ObjectiveSetVersion = {
  id: number;
  sessionType: string;
  versionNumber: number;
  status: "draft" | "published" | "retired";
  objectives: Objective[];
  changeNote: string | null;
  createdAt: Date;
  publishedAt: Date | null;
};

/* ── Reading ────────────────────────────────────────────────────────────── */

export async function getPublished(
  sessionType: string,
): Promise<ObjectiveSetVersion | null> {
  try {
    const [row] = await db
      .select()
      .from(objectiveSets)
      .where(
        and(
          eq(objectiveSets.sessionType, sessionType as any),
          eq(objectiveSets.status, "published"),
        ),
      )
      .limit(1);

    return (row as ObjectiveSetVersion) ?? null;
  } catch (err) {
    // Never break a session over this. No published set means the legacy prompt
    // runs, which is what ran before this table existed.
    log(`objective set lookup failed: ${(err as Error).message}`, "objectives");
    return null;
  }
}

/** The set resolved for one population — what actually reaches a prompt. */
export async function getResolved(
  sessionType: string,
  population: PopulationTag,
): Promise<ResolvedObjective[] | null> {
  const published = await getPublished(sessionType);
  if (!published) return null;
  return resolveForPopulation(published.objectives, population);
}

export async function listVersions(sessionType: string) {
  return db
    .select()
    .from(objectiveSets)
    .where(eq(objectiveSets.sessionType, sessionType as any))
    .orderBy(desc(objectiveSets.versionNumber));
}

export async function listAll() {
  return db
    .select()
    .from(objectiveSets)
    .where(eq(objectiveSets.status, "published"))
    .orderBy(desc(objectiveSets.sessionType));
}

/* ── Per-turn attribution ───────────────────────────────────────────────── */

/**
 * Records which objective a turn was pursuing.
 *
 * This is what turns the design from a refactor into a measurement system:
 * every heuristic card gains a denominator, and per-objective satisfaction
 * rates become comparable across cohorts — which is the only honest way to
 * test a conversation change, since replay cannot work once Wing's words
 * change what the student says next.
 *
 * Best-effort: a failure here must not break the conversation. Losing one
 * turn's attribution costs a data point, not a session.
 */
export async function recordTurnObjective(params: {
  turnId: number;
  sessionId: number;
  objectiveKey: string;
  satisfiedHere?: boolean;
}) {
  try {
    await db
      .insert(turnObjectives)
      .values({
        turnId: params.turnId,
        sessionId: params.sessionId,
        objectiveKey: params.objectiveKey,
        satisfiedHere: params.satisfiedHere ?? false,
      })
      .onConflictDoNothing();
  } catch (err) {
    log(`turn objective not recorded: ${(err as Error).message}`, "objectives");
  }
}

/** Objective keys already satisfied in this session, for nextObjective(). */
export async function satisfiedKeys(sessionId: number): Promise<string[]> {
  try {
    const rows = await db
      .select({ key: turnObjectives.objectiveKey })
      .from(turnObjectives)
      .where(
        and(
          eq(turnObjectives.sessionId, sessionId),
          eq(turnObjectives.satisfiedHere, true),
        ),
      );
    return rows.map((r) => r.key);
  } catch (err) {
    log(`satisfied keys lookup failed: ${(err as Error).message}`, "objectives");
    return [];
  }
}

/* ── Writing ────────────────────────────────────────────────────────────── */

export async function publish(params: {
  sessionType: string;
  objectives: Objective[];
  changeNote?: string | null;
  userId?: number | null;
}) {
  if (!params.objectives.length) {
    throw new Error("An objective set needs at least one objective");
  }

  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ versionNumber: objectiveSets.versionNumber })
      .from(objectiveSets)
      .where(eq(objectiveSets.sessionType, params.sessionType as any))
      .orderBy(desc(objectiveSets.versionNumber))
      .limit(1);

    // Retire first: the unique index allows only one published row per session
    // type, so this must happen before the insert.
    await tx
      .update(objectiveSets)
      .set({ status: "retired" })
      .where(
        and(
          eq(objectiveSets.sessionType, params.sessionType as any),
          eq(objectiveSets.status, "published"),
        ),
      );

    const [created] = await tx
      .insert(objectiveSets)
      .values({
        sessionType: params.sessionType as any,
        versionNumber: (previous?.versionNumber ?? 0) + 1,
        status: "published",
        objectives: params.objectives as any,
        changeNote: params.changeNote ?? null,
        createdBy: params.userId ?? null,
        publishedAt: new Date(),
      })
      .returning();

    log(
      `objective set published: ${params.sessionType} v${created.versionNumber}, ` +
        `${params.objectives.length} objectives`,
      "objectives",
    );

    return created as ObjectiveSetVersion;
  });
}

export async function revertTo(versionId: number, userId?: number | null) {
  const [target] = await db
    .select()
    .from(objectiveSets)
    .where(eq(objectiveSets.id, versionId))
    .limit(1);

  if (!target) return null;

  return publish({
    sessionType: target.sessionType,
    objectives: target.objectives as Objective[],
    changeNote: `Reverted to v${target.versionNumber}`,
    userId,
  });
}

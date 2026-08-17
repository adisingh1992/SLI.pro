import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  schoolCycles,
  students,
  voiceProfiles,
  voiceProfileComponents,
  userDeliveryProfiles,
} from "@shared/wing-schema";
import * as cache from "./published-cache";
import { log } from "../logger";
import type { VoiceComponent } from "./voice-compiler";

/**
 * Reads and publishes voice profiles.
 *
 * ── PUBLICATION IS A POINTER, THE SAME AS THE METHODOLOGY ────────────────
 * `school_cycles.voice_profile_id` decides which profile a cohort gets, and it
 * is the only thing this file reads. A profile also has to be `published` in its
 * own right. Both switches, deliberately: the seeder writes a draft, so a
 * transcription of the Voice Guide can land, be reviewed and be corrected
 * without changing a single student's experience. Exactly the discipline the
 * heuristic sequences follow, and for the same reason — this is the text of
 * every reply Wing composes.
 *
 * ── WHY THE CACHE IS SAFE HERE ───────────────────────────────────────────
 * `published-cache.ts` sets the rule: cacheable content must be immutable once
 * written, read on the turn path, and content rather than student data. A
 * published voice profile is all three — components are versioned with
 * `is_current` rather than edited in place, and the pointer moves only when
 * somebody publishes. `publishVoiceProfile` and `pointCycleAtVoiceProfile` both
 * invalidate, so an editor sees their change immediately on the replica that
 * served it, and within the TTL everywhere else.
 */

export type VoiceProfileView = {
  profileId: number;
  name: string;
  versionNumber: number;
  components: VoiceComponent[];
};

/** Shape stored in `voice_profile_components.content`. */
type StoredContent = {
  key?: unknown;
  short?: unknown;
  full?: unknown;
  audience?: unknown;
};

function toComponent(row: {
  componentType: string;
  context: string | null;
  content: unknown;
}): VoiceComponent | null {
  const content = (row.content ?? {}) as StoredContent;
  const key = typeof content.key === "string" ? content.key : "";
  const short = typeof content.short === "string" ? content.short : "";
  // A component with no short line cannot be rendered. Dropped rather than
  // rendered as an empty bullet, which reads to a model as a withheld rule.
  if (!key || !short.trim()) return null;
  return {
    componentType: row.componentType,
    context: row.context,
    audience: typeof content.audience === "string" ? content.audience : null,
    key,
    short,
  };
}

/** The profile a cycle publishes, or null. */
export async function getVoiceProfileForCycle(
  cycleId: number,
): Promise<VoiceProfileView | null> {
  return cache.cached(`voice:cycle:${cycleId}`, async () => {
    const [cycle] = await db
      .select({ voiceProfileId: schoolCycles.voiceProfileId })
      .from(schoolCycles)
      .where(eq(schoolCycles.id, cycleId))
      .limit(1);
    if (!cycle?.voiceProfileId) return null;

    const [profile] = await db
      .select({
        id: voiceProfiles.id,
        name: voiceProfiles.name,
        versionNumber: voiceProfiles.versionNumber,
        status: voiceProfiles.status,
        supersededAt: voiceProfiles.supersededAt,
      })
      .from(voiceProfiles)
      .where(eq(voiceProfiles.id, cycle.voiceProfileId))
      .limit(1);

    // A draft or superseded profile behind a live pointer is not an error — it is
    // a cohort whose voice work is still in review. It renders nothing.
    if (!profile || profile.status !== "published" || profile.supersededAt) return null;

    const rows = await db
      .select({
        componentType: voiceProfileComponents.componentType,
        context: voiceProfileComponents.context,
        content: voiceProfileComponents.content,
      })
      .from(voiceProfileComponents)
      .where(
        and(
          eq(voiceProfileComponents.voiceProfileId, profile.id),
          eq(voiceProfileComponents.isCurrent, true),
        ),
      )
      .orderBy(voiceProfileComponents.id);

    const components = rows
      .map((r) => toComponent({ componentType: r.componentType, context: r.context, content: r.content }))
      .filter((c): c is VoiceComponent => c !== null);

    if (!components.length) return null;

    return {
      profileId: profile.id,
      name: profile.name,
      versionNumber: profile.versionNumber,
      components,
    };
  });
}

/** The profile this student's cohort publishes, or null. */
export async function getVoiceProfileForStudent(
  studentId: number,
): Promise<VoiceProfileView | null> {
  const [student] = await db
    .select({ cycleId: students.cycleId })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);

  // Direct and post-graduation students have no cycle. They get Wing's voice as
  // the prompt files already define it, which is the pre-T5 behaviour.
  if (!student?.cycleId) return null;
  return getVoiceProfileForCycle(student.cycleId);
}

/** Draft → published. Supersedes any earlier published profile of the same name. */
export async function publishVoiceProfile(profileId: number): Promise<boolean> {
  const ok = await db.transaction(async (tx) => {
    const [profile] = await tx
      .select({ id: voiceProfiles.id, name: voiceProfiles.name })
      .from(voiceProfiles)
      .where(eq(voiceProfiles.id, profileId))
      .limit(1);
    if (!profile) return false;

    const now = new Date();

    await tx
      .update(voiceProfiles)
      .set({ supersededAt: now })
      .where(
        and(
          eq(voiceProfiles.name, profile.name),
          eq(voiceProfiles.status, "published"),
          isNull(voiceProfiles.supersededAt),
        ),
      );

    await tx
      .update(voiceProfiles)
      .set({ status: "published", publishedAt: now, supersededAt: null })
      .where(eq(voiceProfiles.id, profileId));

    return true;
  });

  if (ok) cache.invalidate("voice:");
  return ok;
}

/** Points a cycle at a voice profile. This is the publication. */
export async function pointCycleAtVoiceProfile(
  cycleId: number,
  profileId: number | null,
): Promise<boolean> {
  const rows = await db
    .update(schoolCycles)
    .set({ voiceProfileId: profileId, updatedAt: new Date() })
    .where(eq(schoolCycles.id, cycleId))
    .returning({ id: schoolCycles.id });

  cache.invalidate("voice:");
  return rows.length > 0;
}

/** The newest profile of a given name, for the seeder and for an admin surface. */
export async function latestVoiceProfile(name: string) {
  const [row] = await db
    .select()
    .from(voiceProfiles)
    .where(eq(voiceProfiles.name, name))
    .orderBy(desc(voiceProfiles.versionNumber))
    .limit(1);
  return row ?? null;
}

/**
 * Records which doorway was chosen for a student, and on what evidence.
 *
 * Written, never read back as an input. `user_delivery_profiles` is a log of what
 * Wing decided, so a run of odd deliveries can be explained afterwards — not a
 * store of truth about the person. Reading it would let one bad early read
 * follow a student through every future session, which is exactly what "in
 * session signals only" was meant to avoid.
 *
 * Never throws: a delivery record that fails to write must not cost the turn.
 */
export async function recordDoorway(params: {
  studentId: number;
  componentId: number | null;
  confidence: number | null;
  signals: Record<string, unknown>;
}): Promise<void> {
  try {
    const now = new Date();
    await db
      .insert(userDeliveryProfiles)
      .values({
        studentId: params.studentId,
        observedSignals: params.signals,
        currentDoorwayComponentId: params.componentId,
        confidence: params.confidence == null ? null : String(params.confidence),
        lastEvaluatedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userDeliveryProfiles.studentId,
        set: {
          observedSignals: params.signals,
          currentDoorwayComponentId: params.componentId,
          confidence: params.confidence == null ? null : String(params.confidence),
          lastEvaluatedAt: now,
          updatedAt: now,
        },
      });
  } catch (err) {
    log(`delivery profile write failed for student ${params.studentId}: ${(err as Error).message}`, "voice");
  }
}

/** Component ids by key, so a doorway choice can be recorded against a row. */
export async function doorwayComponentIds(
  profileId: number,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ id: voiceProfileComponents.id, content: voiceProfileComponents.content })
    .from(voiceProfileComponents)
    .where(
      and(
        eq(voiceProfileComponents.voiceProfileId, profileId),
        eq(voiceProfileComponents.componentType, "delivery_doorway"),
        eq(voiceProfileComponents.isCurrent, true),
      ),
    );

  const out: Record<string, number> = {};
  for (const r of rows) {
    const key = (r.content as StoredContent)?.key;
    if (typeof key === "string") out[key] = r.id;
  }
  return out;
}

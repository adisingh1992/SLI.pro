import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { analysisMethodology } from "@shared/wing-schema";
import { log } from "../logger";

/**
 * Analysis methodology — how the model reasons about a finished transcript.
 *
 * The sibling of completion-criteria-store, and the split between them is the
 * point:
 *
 *   criteria    — WHETHER the session is done. A checklist, and the thing that
 *                 flips `isComplete`.
 *   methodology — HOW to read the transcript at all. The lenses, validation
 *                 tests and translation rules applied before reaching that
 *                 checklist.
 *
 * Editing methodology is lower-stakes than editing criteria: a worse lens
 * produces a worse judgement, whereas a wrong criterion can make a session
 * impossible to finish. Both are still live the moment they are published, so
 * both get replay.
 *
 * FALLBACK
 * No published row means the prompt file's own text is used. Adoption is
 * therefore per population/session, and an empty table changes nothing.
 */

export type MethodologySection = {
  id: string;
  /** The heading, without its number — numbering is applied at render. */
  title: string;
  /** Everything under the heading, newlines and indentation preserved. */
  body: string;
  /** Free-text note for the methodology owner. Never rendered into a prompt. */
  note?: string;
};

export type MethodologyVersion = {
  id: number;
  populationTag: string;
  sessionType: string;
  versionNumber: number;
  status: "draft" | "published" | "retired";
  sections: MethodologySection[];
  changeNote: string | null;
  createdAt: Date;
  publishedAt: Date | null;
};

/* ── Reading ────────────────────────────────────────────────────────────── */

export async function getPublished(
  populationTag: string,
  sessionType: string,
): Promise<MethodologyVersion | null> {
  try {
    const [row] = await db
      .select()
      .from(analysisMethodology)
      .where(
        and(
          eq(analysisMethodology.populationTag, populationTag),
          eq(analysisMethodology.sessionType, sessionType as any),
          eq(analysisMethodology.status, "published"),
        ),
      )
      .limit(1);

    return (row as MethodologyVersion) ?? null;
  } catch (err) {
    // A lookup failure must not break a session. Falling back to the prompt
    // file's own text is the safe outcome — it is what ran before this table
    // existed.
    log(`analysis methodology lookup failed: ${(err as Error).message}`, "methodology");
    return null;
  }
}

export async function listVersions(populationTag: string, sessionType: string) {
  return db
    .select()
    .from(analysisMethodology)
    .where(
      and(
        eq(analysisMethodology.populationTag, populationTag),
        eq(analysisMethodology.sessionType, sessionType as any),
      ),
    )
    .orderBy(desc(analysisMethodology.versionNumber));
}

export async function listAll() {
  return db
    .select()
    .from(analysisMethodology)
    .where(eq(analysisMethodology.status, "published"))
    .orderBy(
      asc(analysisMethodology.populationTag),
      asc(analysisMethodology.sessionType),
    );
}

/* ── Rendering ──────────────────────────────────────────────────────────── */

/**
 * The form the analysis prompt receives.
 *
 * Numbering is applied here rather than stored, so deleting section 3 renumbers
 * the rest automatically. Storing the numbers would mean an edit that removes
 * one section silently ships "1) 2) 4) 5)" to the model.
 */
export function renderForAnalysis(sections: MethodologySection[]): string {
  return sections
    .map((s, i) => `${i + 1}) ${s.title}\n${s.body}`)
    .join("\n\n");
}

/* ── Writing ────────────────────────────────────────────────────────────── */

/**
 * Publishes a new version, retiring the current one.
 *
 * Retire-never-edit, as with criteria, heuristic components and classifier
 * prompts: a session judged six months ago must stay explicable by the
 * methodology that was live when it ran.
 */
export async function publish(params: {
  populationTag: string;
  sessionType: string;
  sections: MethodologySection[];
  changeNote?: string | null;
  userId?: number | null;
}) {
  if (!params.sections.length) {
    throw new Error(
      "At least one section is required — publishing an empty methodology would " +
        "leave the analysis with no instructions for reading the transcript",
    );
  }

  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ versionNumber: analysisMethodology.versionNumber })
      .from(analysisMethodology)
      .where(
        and(
          eq(analysisMethodology.populationTag, params.populationTag),
          eq(analysisMethodology.sessionType, params.sessionType as any),
        ),
      )
      .orderBy(desc(analysisMethodology.versionNumber))
      .limit(1);

    // Retire first: the unique index allows only one published row per
    // population/session, so this must happen before the insert.
    await tx
      .update(analysisMethodology)
      .set({ status: "retired" })
      .where(
        and(
          eq(analysisMethodology.populationTag, params.populationTag),
          eq(analysisMethodology.sessionType, params.sessionType as any),
          eq(analysisMethodology.status, "published"),
        ),
      );

    const [created] = await tx
      .insert(analysisMethodology)
      .values({
        populationTag: params.populationTag,
        sessionType: params.sessionType as any,
        versionNumber: (previous?.versionNumber ?? 0) + 1,
        status: "published",
        sections: params.sections as any,
        changeNote: params.changeNote ?? null,
        createdBy: params.userId ?? null,
        publishedAt: new Date(),
      })
      .returning();

    log(
      `analysis methodology published: ${params.populationTag}/${params.sessionType} ` +
        `v${created.versionNumber}, ${params.sections.length} sections`,
      "methodology",
    );

    return created as MethodologyVersion;
  });
}

/**
 * Republishes an earlier version as a new one.
 *
 * A NEW version rather than reactivating the old row, so the history reads as
 * what actually happened: someone went back, rather than time moving backwards.
 */
export async function revertTo(versionId: number, userId?: number | null) {
  const [target] = await db
    .select()
    .from(analysisMethodology)
    .where(eq(analysisMethodology.id, versionId))
    .limit(1);

  if (!target) return null;

  return publish({
    populationTag: target.populationTag,
    sessionType: target.sessionType,
    sections: target.sections as MethodologySection[],
    changeNote: `Reverted to v${target.versionNumber}`,
    userId,
  });
}

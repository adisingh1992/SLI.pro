import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  transcripts,
  transcriptTurns,
  sessions,
  schoolCycles,
  classifierPrompts,
  classifierPromptComponents,
} from "@shared/wing-schema";
import { splitTagged, CLASSIFIABLE_TYPES } from "./classifier-rules";
import { log } from "../logger";

/**
 * Closing the loop — hand-tagged turns become classifier examples.
 *
 * Spec §14 says the hand-tagged corpus should "seed the classifier AND provide
 * a validation gold standard". Until this module existed only the second half
 * was true: tagging measured the classifier but never improved it, so the only
 * way a human label helped anyone was if someone read the accuracy figure and
 * hand-edited a prompt.
 *
 * Now: tagged turns are split, the training side becomes few-shot examples in
 * a published, versioned classifier prompt, and the held-out side measures
 * whether that actually helped. Every student benefits, without a deploy —
 * the same "methodology as data" path the heuristics take.
 *
 * ─── THE PROPERTY THAT MATTERS MOST ─────────────────────────────────────────
 *
 * Examples come ONLY from the training split; validation runs ONLY on the
 * holdout. If the same turns did both, the classifier would be graded on
 * examples it was handed, accuracy would climb, nothing would actually improve,
 * and the number would be quoted anyway. That is worse than no number.
 */

/** Examples per class in the prompt. Few-shot, not fine-tuning. */
const MAX_EXAMPLES_PER_TYPE = 4;

/** Turns longer than this are truncated in examples to keep the prompt small. */
const EXAMPLE_MAX_CHARS = 400;

export type TaggedTurn = {
  id: number;
  turnType: string;
  content: string;
  transcriptId: number;
  position: number;
};

/** Every hand-tagged human turn, oldest first. */
export async function loadTaggedTurns(): Promise<TaggedTurn[]> {
  return db
    .select({
      id: transcriptTurns.id,
      turnType: transcriptTurns.turnType,
      content: transcriptTurns.content,
      transcriptId: transcriptTurns.transcriptId,
      position: transcriptTurns.sequencePosition,
    })
    .from(transcriptTurns)
    .where(
      and(
        eq(transcriptTurns.classificationStatus, "hand_tagged"),
        eq(transcriptTurns.analysisEligible, true),
        // turn_type, not provenance: migrated turns are all provenance_unknown,
        // so the old test would have admitted a migrated AI turn as a human
        // training example if one were ever hand-tagged.
        sql`${transcriptTurns.turnType} not in ('ai_prompt', 'ai_adapted')`,
      ),
    )
    .orderBy(asc(transcriptTurns.id));
}

/** The preceding turn, which is what makes elicited vs spontaneous decidable. */
async function precedingTurn(transcriptId: number, position: number) {
  const [prev] = await db
    .select({
      turnType: transcriptTurns.turnType,
      content: transcriptTurns.content,
    })
    .from(transcriptTurns)
    .where(
      and(
        eq(transcriptTurns.transcriptId, transcriptId),
        eq(transcriptTurns.sequencePosition, position - 1),
      ),
    )
    .limit(1);
  return prev ?? null;
}

function truncate(s: string) {
  return s.length > EXAMPLE_MAX_CHARS ? `${s.slice(0, EXAMPLE_MAX_CHARS)}…` : s;
}

export type BuiltExample = {
  turnId: number;
  turnType: string;
  precedingTurnType: string | null;
  precedingContent: string | null;
  content: string;
};

/**
 * Chooses few-shot examples from the training split.
 *
 * Balanced per class rather than proportional. The natural distribution is
 * dominated by elicited responses, and a proportional sample would show the
 * model almost no corrections — the exact class it is worst at and the one
 * that drives `ai_adapted`, the scoring correction path, and what grounds
 * memory.
 *
 * Selection within a class is the OLDEST turns by id: deterministic, so
 * republishing without new tags produces an identical prompt and the version
 * history stays meaningful.
 */
export async function buildExamples(train: TaggedTurn[]): Promise<BuiltExample[]> {
  const byType = new Map<string, TaggedTurn[]>();
  for (const t of train) {
    const bucket = byType.get(t.turnType) ?? [];
    bucket.push(t);
    byType.set(t.turnType, bucket);
  }

  const examples: BuiltExample[] = [];

  for (const type of CLASSIFIABLE_TYPES) {
    const bucket = (byType.get(type) ?? []).slice(0, MAX_EXAMPLES_PER_TYPE);
    for (const turn of bucket) {
      const prev = await precedingTurn(turn.transcriptId, turn.position);
      examples.push({
        turnId: turn.id,
        turnType: turn.turnType,
        precedingTurnType: prev?.turnType ?? null,
        precedingContent: prev ? truncate(prev.content) : null,
        content: truncate(turn.content),
      });
    }
  }

  return examples;
}

/** Renders examples as prompt text. Kept here so the format is versioned with them. */
export function renderExamples(examples: BuiltExample[]): string {
  if (!examples.length) return "";
  return examples
    .map((e, i) => {
      const lines = [`Example ${i + 1}:`];
      if (e.precedingContent) {
        lines.push(`  Coach said: ${e.precedingContent}`);
      } else {
        lines.push("  (no preceding turn)");
      }
      lines.push(`  Student said: ${e.content}`);
      lines.push(`  Correct type: ${e.turnType}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

/* ── Publishing ─────────────────────────────────────────────────────────── */

/**
 * Publishes a new classifier prompt built from the current tagged corpus.
 *
 * Versioned and superseding, exactly like heuristic sequences: the previous
 * prompt is retired rather than edited, so any turn classified under it can
 * still be explained by the prompt that was actually live at the time.
 */
export async function publishClassifierPrompt(params: {
  rules: string;
  cycleId?: number | null;
  name?: string;
}) {
  const tagged = await loadTaggedTurns();
  const { train, holdout } = splitTagged(tagged);
  const examples = await buildExamples(train);

  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ versionNumber: classifierPrompts.versionNumber })
      .from(classifierPrompts)
      .where(eq(classifierPrompts.task, "turn_typing"))
      .orderBy(desc(classifierPrompts.versionNumber))
      .limit(1);

    const versionNumber = (previous?.versionNumber ?? 0) + 1;

    // Retire the currently published prompt. Never edited — a past
    // classification must remain explicable by the prompt that produced it.
    await tx
      .update(classifierPrompts)
      .set({ status: "retired", modifiedAt: new Date() })
      .where(
        and(
          eq(classifierPrompts.task, "turn_typing"),
          eq(classifierPrompts.status, "published"),
        ),
      );

    const [prompt] = await tx
      .insert(classifierPrompts)
      .values({
        name: params.name ?? `Turn typing v${versionNumber}`,
        task: "turn_typing",
        versionNumber,
        status: "published",
      })
      .returning({ id: classifierPrompts.id });

    await tx.insert(classifierPromptComponents).values([
      {
        classifierPromptId: prompt.id,
        componentType: "rules",
        content: params.rules as any,
        isCurrent: true,
      },
      {
        classifierPromptId: prompt.id,
        componentType: "examples",
        content: examples as any,
        isCurrent: true,
      },
    ]);

    // Point the cycle at it, so students actually get the new prompt.
    if (params.cycleId) {
      await tx
        .update(schoolCycles)
        .set({ classifierPromptId: prompt.id, updatedAt: new Date() })
        .where(eq(schoolCycles.id, params.cycleId));
    }

    log(
      `classifier prompt v${versionNumber} published with ${examples.length} example(s) ` +
        `from ${train.length} training turns; ${holdout.length} held out for validation`,
      "classifier",
    );

    return {
      promptId: prompt.id,
      versionNumber,
      exampleCount: examples.length,
      trainCount: train.length,
      holdoutCount: holdout.length,
      examples,
    };
  });
}

/** What a publish would produce, without writing anything. */
export async function previewExamples() {
  const tagged = await loadTaggedTurns();
  const { train, holdout } = splitTagged(tagged);
  const examples = await buildExamples(train);

  const holdoutByType: Record<string, number> = {};
  for (const t of holdout) {
    holdoutByType[t.turnType] = (holdoutByType[t.turnType] ?? 0) + 1;
  }

  return {
    taggedTotal: tagged.length,
    trainCount: train.length,
    holdoutCount: holdout.length,
    holdoutByType,
    examples,
    rendered: renderExamples(examples),
  };
}

/** The published prompt in force, if any. */
export async function currentPrompt() {
  const [prompt] = await db
    .select()
    .from(classifierPrompts)
    .where(
      and(
        eq(classifierPrompts.task, "turn_typing"),
        eq(classifierPrompts.status, "published"),
      ),
    )
    .orderBy(desc(classifierPrompts.versionNumber))
    .limit(1);

  if (!prompt) return null;

  const components = await db
    .select()
    .from(classifierPromptComponents)
    .where(
      and(
        eq(classifierPromptComponents.classifierPromptId, prompt.id),
        eq(classifierPromptComponents.isCurrent, true),
      ),
    );

  return { ...prompt, components };
}

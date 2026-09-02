/**
 * Writing the Reveal Cycle's prompt log. The persistence half of `reveal-evidence.ts`.
 *
 * ── WHY DELIVERY IS WRITTEN SEPARATELY FROM THE RESPONSE ─────────────────
 * Because they happen at different moments and one of them is unrecoverable. A response
 * can be read back from the entry text whenever someone asks. A prompt that was shown and
 * ignored leaves no trace anywhere unless it is written down as it is shown — and
 * IG-RC10's hard filter 0 turns on exactly that distinction: an absence claim "dies unless
 * prompts in that signal category were actually delivered".
 *
 * So `logDelivery` runs when Wing asks and `logResponse` finds that row later. A response
 * with no matching delivery still records, because losing the answer would be worse than
 * an orphan row.
 *
 * ── WHY NOTHING HERE DECIDES ANYTHING ────────────────────────────────────
 * The classifications are `reveal-evidence.ts`'s and stay there — this calls `logPrompt`
 * rather than reimplementing shape and substantiveness against a database.
 */
import { sql } from "drizzle-orm";
import {
  eventFrom,
  logPrompt,
  VERBATIM_HORIZON_DAYS,
  type Channel,
  type EvidenceEvent,
  type EvidenceTier,
  type PromptLogEntry,
  type QuoteShape,
  type SignalCategory,
  type Substantiveness,
} from "./reveal-evidence";

type Db = { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };

export type DeliveryRecord = {
  studentId: number;
  /** The library row, so tier and category can be backfilled against what was sent. */
  promptId: number | null;
  channel: Channel;
  /** Null where the prompt's own category does not map to one of her eight. */
  signalCategory: SignalCategory | null;
  /** Null until she approves the tiers; `promptId` is what makes the backfill possible. */
  tier: EvidenceTier | null;
};

/**
 * `prompt_category` in the library predates her eight signal categories and is a
 * different vocabulary. Only the ones that genuinely mean the same thing are mapped;
 * anything else records null rather than being forced into the nearest-looking slot.
 *
 * A wrong category is worse than a null one. Gate 2 requires three DISTINCT categories,
 * so mapping two unrelated library categories onto one of hers would either manufacture
 * distinctness that is not there or collapse distinctness that is. Null is visible in the
 * report and can be corrected; a plausible wrong value is not and cannot.
 */
export const CATEGORY_MAP: Readonly<Record<string, SignalCategory>> = {
  language: "language",
  energy: "energy",
  decision: "decision",
  relationship: "relationship",
  industry: "industry",
  career: "career",
  influence: "influence",
  achievement: "achievement",
};

export function signalCategoryFor(libraryCategory: string | null | undefined): SignalCategory | null {
  if (!libraryCategory) return null;
  return CATEGORY_MAP[libraryCategory.trim().toLowerCase()] ?? null;
}

/**
 * Records that Wing asked. Call at the moment the prompt is shown or sent.
 *
 * Returns the row id so a caller that already knows the response can close it, and null
 * on failure — never throws. A logging failure must not stop a student being asked a
 * question, and the alternative is that one broken insert silently removes the prompt
 * from their day.
 */
export async function logDelivery(db: Db, d: DeliveryRecord): Promise<number | null> {
  try {
    const r = await db.execute(sql`
      INSERT INTO "wing"."prompt_log"
        ("student_id", "prompt_id", "channel", "signal_category", "evidence_tier")
      VALUES (${d.studentId}, ${d.promptId}, ${d.channel}, ${d.signalCategory}, ${d.tier})
      RETURNING "id"
    `);
    const id = r.rows?.[0]?.id;
    return id === undefined || id === null ? null : Number(id);
  } catch {
    return null;
  }
}

/**
 * Records what they wrote back, against the delivery it answers.
 *
 * Matched on the most recent unanswered delivery of the same prompt. Not on the newest
 * delivery of ANY prompt: a student served three prompts who answers the first would
 * otherwise have their words filed under the third, and the tier and category attached to
 * a quote are what Gate 2 counts.
 *
 * With no matching delivery — a life-log entry written unprompted, or one predating this
 * table — the row is still written, with `delivered_at` defaulting to now. An orphan is a
 * visible imperfection; a dropped answer is lost evidence.
 */
export async function logResponse(
  db: Db,
  params: {
    studentId: number;
    promptId: number | null;
    channel: Channel;
    text: string;
    at?: Date;
    signalCategory?: SignalCategory | null;
    tier?: EvidenceTier | null;
  },
): Promise<void> {
  const at = params.at ?? new Date();

  /*
   * The classification comes from `reveal-evidence.ts`, so the rule that decides whether
   * a quote is productive lives in one place and is tested without a database.
   */
  const entry = logPrompt(
    {
      promptId: String(params.promptId ?? ""),
      category: params.signalCategory ?? "language",
      tier: params.tier ?? 1,
      channel: params.channel,
      deliveredAt: at.getTime(),
    },
    { at: at.getTime(), text: params.text },
  );

  try {
    const updated = await db.execute(sql`
      UPDATE "wing"."prompt_log"
      SET "responded_at" = ${at.toISOString()},
          "verbatim" = ${params.text},
          "quote_shape" = ${entry.shape},
          "substantiveness" = ${entry.substantiveness}
      WHERE "id" = (
        SELECT "id" FROM "wing"."prompt_log"
        WHERE "student_id" = ${params.studentId}
          AND "responded_at" IS NULL
          AND "prompt_id" IS NOT DISTINCT FROM ${params.promptId}
        ORDER BY "delivered_at" DESC
        LIMIT 1
      )
      RETURNING "id"
    `);
    if (updated.rows?.length) return;

    await db.execute(sql`
      INSERT INTO "wing"."prompt_log"
        ("student_id", "prompt_id", "channel", "signal_category", "evidence_tier",
         "delivered_at", "responded_at", "verbatim", "quote_shape", "substantiveness")
      VALUES (${params.studentId}, ${params.promptId}, ${params.channel},
              ${params.signalCategory ?? null}, ${params.tier ?? null},
              ${at.toISOString()}, ${at.toISOString()}, ${params.text},
              ${entry.shape}, ${entry.substantiveness})
    `);
  } catch {
    /*
     * Swallowed on purpose, and this is the one place it is the wrong-looking choice for
     * the right reason. The caller is mid-way through saving the student's own life-log
     * entry; throwing here would lose what they wrote to protect a log about what they
     * wrote. `wing:check-journey` is where a divergence shows up.
     */
  }
}

/**
 * The evidence a real student has actually produced since a given moment — Gate 2's
 * input, and the reason this function exists rather than Gate 2 being handed an empty
 * array forever. Reads `wing.prompt_log` and reconstructs each row into the
 * `PromptLogEntry` shape `reveal-evidence.ts`'s `eventFrom` already knows how to turn
 * into an `EvidenceEvent`, rather than duplicating that judgement here.
 *
 * ── WHY A ROW WITH NO TIER OR NO CATEGORY IS SKIPPED ─────────────────────
 * Both are nullable on the table — `evidence_tier` because the 295 proposed tiers were
 * with Danielle and unapproved when the table was written, `signal_category` because a
 * prompt's own category does not always map to one of her eight. `PromptDelivery`
 * requires both non-null, and a delivery whose grade or category isn't known cannot be
 * counted toward Gate 2's tier and category-spread conditions without guessing at one —
 * which is exactly the `signalCategory` population gap `promptLibrary`'s own column
 * comment names as "what currently blocks the Reveal Cycle." So today, on an unpopulated
 * library, this correctly returns nothing: Gate 2 sees no evidence and defers, which is
 * the protected null-Reveal outcome the methodology asks for, not a bug in this reader.
 *
 * ── analysisEligible IS ALWAYS true HERE, AND THAT IS A KNOWN GAP ────────
 * `wing.prompt_log` has no column recording whether the turn that produced a response was
 * later excluded from analysis (`transcript_turns.analysis_eligible`) — `logResponse`
 * never learns that either, because nothing calls it with that information yet. So every
 * event this function returns is `analysisEligible: true`, and `eventFrom`'s guard against
 * a crisis-excluded turn currently has nothing to catch. See reveal-evidence.ts's own
 * comment on `PromptLogEntry.analysisEligible` — closing this is future work, not silently
 * assumed safe.
 */
export async function evidenceSince(
  db: Db,
  studentId: number,
  sinceMs: number,
): Promise<EvidenceEvent[]> {
  /*
   * v4 §13's verbatim retention horizon, enforced here rather than left as the
   * documented-but-uncalled `withinVerbatimHorizon` — a cycle whose origin predates the
   * horizon (a long-dormant student, a cycle that has run past 60 days without a Reveal)
   * would otherwise hand Gate 2 verbatim older than the methodology says Wing keeps.
   * `sinceMs` still wins when it is the tighter bound — this only ever narrows the
   * window, never widens it past what the caller asked for.
   */
  const horizonStart = Date.now() - VERBATIM_HORIZON_DAYS * 24 * 60 * 60 * 1000;
  const effectiveSince = Math.max(sinceMs, horizonStart);

  const r = await db.execute(sql`
    SELECT "channel", "signal_category", "evidence_tier", "delivered_at",
           "responded_at", "verbatim", "quote_shape", "substantiveness"
    FROM "wing"."prompt_log"
    WHERE "student_id" = ${studentId}
      AND "delivered_at" >= ${new Date(effectiveSince).toISOString()}
      AND "evidence_tier" IS NOT NULL
      AND "signal_category" IS NOT NULL
  `);

  const events: EvidenceEvent[] = [];
  for (const row of r.rows ?? []) {
    const entry: PromptLogEntry = {
      promptId: "", // not read back; nothing downstream of EvidenceEvent uses it
      category: row.signal_category as SignalCategory,
      tier: Number(row.evidence_tier) as EvidenceTier,
      channel: row.channel as Channel,
      deliveredAt: new Date(row.delivered_at as string).getTime(),
      respondedAt: row.responded_at ? new Date(row.responded_at as string).getTime() : null,
      verbatim: (row.verbatim as string | null) ?? "",
      shape: (row.quote_shape as QuoteShape | null) ?? null,
      substantiveness: row.substantiveness as Substantiveness,
      analysisEligible: true, // see the function header
    };
    const event = eventFrom(entry);
    if (event) events.push(event);
  }
  return events;
}

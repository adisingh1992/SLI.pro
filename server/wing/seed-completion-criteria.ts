import "dotenv/config";
import { readFileSync } from "fs";
import { and, eq } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { sessionCompletionCriteria } from "@shared/wing-schema";

/**
 * Seeds session_completion_criteria from the current prompt files.
 *
 * Run:  npm run wing:seed-criteria -- --dry-run
 *       npm run wing:seed-criteria
 *
 * ─── WHICH LIST IS SEEDED, AND WHY ──────────────────────────────────────────
 *
 * Each session has its criteria written twice: once in the conversation prompt
 * (what Wing is told to achieve) and once in the analysis prompt (what is
 * actually checked). They disagree.
 *
 * The ANALYSIS list is seeded, because that is what gates completion today.
 * Seeding the conversation list would silently change which sessions complete —
 * a methodology change made by a migration script, which is not acceptable.
 *
 * Every criterion is then flagged `reachable`: does the conversation prompt
 * actually pursue it? An unreachable criterion can only be satisfied by luck,
 * and that is exactly how mid-career Session 2 became impossible to finish.
 * The editor surfaces these so the methodology owner decides — the script does
 * not decide for her.
 *
 * The flags are a FIRST PASS from text overlap. They are a prompt to look, not
 * a verdict.
 */

const DRY_RUN = process.argv.includes("--dry-run");

const SOURCES = [
  { file: "server/prompts/undergraduate-recent-grad.ts", populationTag: "undergraduate_or_recent_grad" },
  { file: "server/prompts/early-career.ts", populationTag: "early_career" },
  { file: "server/prompts/mid-career-senior.ts", populationTag: "mid_career_or_senior" },
];

const SESSION_TYPES = ["foundation_1", "foundation_2", "foundation_3"];

/**
 * Enhancement Modules — same idea, different prompt files.
 *
 * No schema change was needed: `enhancement_a/b/c` are already in the
 * session_type enum, so modules are just more rows.
 *
 * Their prompts differ from Foundation Sessions in two ways that matter:
 *
 *  - Module A lists analysis criteria with dashes; Module B uses blank-line
 *    separated paragraphs. Same meaning, different shape, so extraction has to
 *    handle both.
 *
 *  - Module C has NO analysis criteria at all. Its analysis prompt says "Mark
 *    shouldComplete as true ONLY if ALL completion criteria are satisfied" and
 *    never states them. The model has been inventing a bar from the module
 *    description, which means Module C completion has been effectively
 *    arbitrary in every population.
 */
const MODULE_SOURCES = [
  { file: "server/enhancement-module-prompts/undergraduate-recent-grad.ts", populationTag: "undergraduate_or_recent_grad" },
  { file: "server/enhancement-module-prompts/early-career.ts", populationTag: "early_career" },
  { file: "server/enhancement-module-prompts/mid-career-senior.ts", populationTag: "mid_career_or_senior" },
];

const MODULE_TYPES = ["enhancement_a", "enhancement_b", "enhancement_c"];

/**
 * Criteria that cannot be satisfied when the completion check runs.
 *
 * The check fires immediately after Wing's message, before the student has
 * replied. Anything requiring a reply to the CLOSING is therefore always false
 * on the closing turn — the session only completes if the student sends one
 * more message, and a good closing invites them to leave instead.
 */
const NEEDS_REPLY_AFTER_CLOSING =
  /(responded positively|acknowledged the closing|acknowledged or agreed)/i;

/** Present tense: "delivered the closing line" is checkable from the transcript. */
const CHECKABLE_CLOSING = /delivered the closing line$/i;

/**
 * Pulls the criteria list out of a prompt file.
 *
 * The lists now live inside a template default —
 *   ${ctx.completionCriteria ?? `1. …`}
 * — because that is what makes them overridable from the database. So the
 * extractor has to read through the fallback rather than expecting a bare
 * list at the start of a line. Both shapes are handled, so this still works if
 * a prompt file has not been parameterised.
 */
function extractBlocks(src: string, pattern: RegExp, itemPattern: RegExp): string[][] {
  const out: string[][] = [];
  for (const m of Array.from(src.matchAll(pattern))) {
    const body = m[1]
      // Strip the interpolation wrapper if present, keeping the default text.
      .replace(/^\$\{[^`]*\?\?\s*`/, "")
      .replace(/`\}\s*$/, "");

    const items = body
      .split("\n")
      .map((l) => l.match(itemPattern)?.[1]?.trim())
      .filter((x): x is string => Boolean(x));

    if (items.length) out.push(items);
  }
  return out;
}

/** Crude overlap: do these two sentences talk about the same requirement? */
function overlaps(a: string, b: string): boolean {
  const norm = (s: string) =>
    new Set(
      s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const A = norm(a);
  const B = norm(b);
  if (!A.size) return false;
  let shared = 0;
  for (const w of Array.from(A)) if (B.has(w)) shared++;
  return shared / A.size >= 0.4;
}

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  ({ db, pool } = await initScript());

  console.log(
    DRY_RUN
      ? "[criteria] DRY RUN — no writes\n"
      : "[criteria] seeding from the current prompt files\n",
  );

  let published = 0;
  let skipped = 0;

  for (const source of SOURCES) {
    const src = readFileSync(source.file, "utf-8");

    const conversationBlocks = extractBlocks(
      src,
      /Do NOT end this session prematurely[^\n]*\n((?:\$\{[^`]*\?\?\s*`)?(?:[^\n]*\n)*?[^\n]*`\}\n|(?:\s*\d+\.[^\n]*\n)+)/g,
      /^\s*\d+\.\s*(.+)$/,
    );
    const analysisBlocks = extractBlocks(
      src,
      /all must be satisfied to set isComplete=true\):\n((?:\$\{[^`]*\?\?\s*`)?(?:[^\n]*\n)*?[^\n]*`\}\n|(?:\s*-[^\n]*\n)+)/g,
      /^\s*-\s*(.+)$/,
    );

    for (let i = 0; i < SESSION_TYPES.length; i++) {
      const sessionType = SESSION_TYPES[i];
      const analysis = analysisBlocks[i];
      const conversation = conversationBlocks[i] ?? [];

      if (!analysis?.length) {
        console.log(`  ! ${source.populationTag}/${sessionType}: no analysis criteria found`);
        continue;
      }

      // Keyed on BOTH population and session type. Matching on population
      // alone meant that once foundation_1 was written, sessions 2 and 3 were
      // skipped as already-existing — 3 published, 6 silently dropped.
      const [existing] = await db
        .select({ id: sessionCompletionCriteria.id })
        .from(sessionCompletionCriteria)
        .where(
          and(
            eq(sessionCompletionCriteria.populationTag, source.populationTag),
            eq(sessionCompletionCriteria.sessionType, sessionType as any),
          ),
        )
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      const criteria = analysis.map((text, n) => {
        // The overlap check is a WEAK signal and is treated as one. It flagged
        // 8 of 8 on mid-career Session 3, where the audit established that
        // those eight are simply the five quality elements the conversation
        // already requires, listed individually. A flag that fires on
        // everything gets ignored — and takes the real finding with it.
        const mirrored = conversation.some((c) => overlaps(text, c));

        // This one IS precise: a criterion naming a reply to the closing
        // cannot be true when the check runs, because the check fires before
        // any reply exists. Verified by hand across all nine pairs.
        const needsReplyAfterClosing =
          NEEDS_REPLY_AFTER_CLOSING.test(text) && !CHECKABLE_CLOSING.test(text);

        return {
          id: `c${n + 1}`,
          text,
          // Only the confident finding sets this false. `mirrored` is surfaced
          // separately as a hint, not as a verdict.
          reachable: !needsReplyAfterClosing,
          mirroredInConversation: mirrored,
          ...(needsReplyAfterClosing
            ? {
                note:
                  "UNREACHABLE ON THE CLOSING TURN. This requires the student to " +
                  "reply after Wing's closing message, but the completion check " +
                  "runs before any reply exists. The session can only complete if " +
                  "the student sends one more message — and a good closing invites " +
                  "them to leave instead.",
              }
            : {}),
        };
      });

      const blocking = criteria.filter((c) => !c.reachable).length;
      const unmirrored = criteria.filter((c) => !c.mirroredInConversation).length;

      console.log(
        `  ${source.populationTag}/${sessionType}: ${criteria.length} criteria` +
          (blocking ? `, ${blocking} UNREACHABLE` : "") +
          (unmirrored ? `, ${unmirrored} not obviously mirrored` : ""),
      );
      for (const c of criteria) {
        if (!c.reachable) console.log(`      ✗ ${c.text.slice(0, 70)}…`);
      }

      if (DRY_RUN) continue;

      await db.insert(sessionCompletionCriteria).values({
        populationTag: source.populationTag,
        sessionType: sessionType as any,
        versionNumber: 1,
        status: "published",
        criteria: criteria as any,
        changeNote:
          "Seeded from the analysis prompt, which is what gated completion at " +
          "the time. Flags are a first pass from text overlap — review them.",
        publishedAt: new Date(),
      });
      published++;
    }
  }

  /* ── Enhancement Modules ─────────────────────────────────────────────── */

  let modulesPublished = 0;
  let modulesDrafted = 0;

  for (const source of MODULE_SOURCES) {
    const src = readFileSync(source.file, "utf-8");

    // BOTH extractions must read THROUGH the `${... ?? `...`}` wrapper that
    // parameterising the prompts introduced.
    //
    // I fixed exactly this for Foundation Sessions and then reintroduced it
    // here: the conversation regex found nothing for Module C (so no draft was
    // written), and the analysis regex kept the wrapper text as part of the
    // FIRST criterion, publishing "${completionCriteria ?? `- Profile headline
    // …" as if it were methodology. Parameterising a prompt always breaks any
    // extractor that reads it — the lesson is to re-verify extraction after
    // every such change, not to remember the specific regex.
    const conversationBlocks = extractBlocks(
      src,
      /CRITICAL COMPLETION INSTRUCTION[^\n]*\n(?:[^\n]*\n)?((?:\$\{[^`]*\?\?\s*`)?(?:[^\n]*\n)*?[^\n]*`\}\n|(?:\s*\d+\.[^\n]*\n)+)/g,
      /^\s*\d+\.\s*(.+)$/,
    );

    /*
     * Analysis criteria. THREE formats, not one — this is the fourth time an
     * extractor here was wrong because it assumed a single shape.
     *
     *  Module A  headed "Rules for completion (…)", dash bullets
     *  Module B  same heading, blank-line separated paragraphs, no bullets
     *  Module C  headed "COMPLETION CRITERIA — ALL MUST BE SATISFIED:",
     *            dash bullets with INDENTED sub-bullets
     *
     * Module C's heading was missed entirely by the previous version, which
     * matched only Module A/B's. It reported "analysis had NONE", Module C was
     * seeded from its CONVERSATION prompt instead, and the seed script printed
     * a warning claiming Module C's completion had always been arbitrary. All
     * of that was false — Module C had a full criteria list the whole time,
     * written with ✅ marks that no pattern here looked for.
     */
    const analysisSpans = Array.from(
      src.matchAll(
        /(?:Rules for completion \(ALL must be satisfied for shouldComplete=true\):|COMPLETION CRITERIA — ALL MUST BE SATISFIED:)\n([\s\S]*?)\n\s*(?:If (?:these criteria|any criterion)|Extract these fields)/g,
      ),
    ).map((m) =>
      // Strip the interpolation wrapper before splitting, or its opening line
      // becomes part of the first criterion.
      m[1].replace(/^\$\{[^`]*\?\?\s*`/, "").replace(/`\}\s*$/, ""),
    );

    const analysisBlocks = analysisSpans.map((span) => {
      // Split on a TOP-LEVEL bullet only. Module C nests sub-bullets under a
      // parent ("…mapped across the 4 categories:" followed by the four), and
      // a plain line split would promote each sub-bullet to its own criterion.
      let chunks = span
        .trim()
        .split(/\n(?=[-•]\s)/)
        .map((c) => c.replace(/^[-•]\s*/, "").trimEnd())
        .filter((c) => c.trim().length > 15);

      // Module B has no bullets at all, so the split yields one chunk. Fall
      // back to line-per-criterion for that shape.
      if (chunks.length <= 1) {
        chunks = span
          .split("\n")
          .map((l) => l.replace(/^\s*[-•]\s*/, "").trim())
          .filter((l) => l.length > 15);
      }

      return chunks.filter((c) => !c.includes("completionCriteria"));
    });

    for (let i = 0; i < MODULE_TYPES.length; i++) {
      const sessionType = MODULE_TYPES[i];
      const moduleLetter = "ABC"[i];
      const conversation = conversationBlocks[i] ?? [];
      const analysis = analysisBlocks[i] ?? [];

      const [existing] = await db
        .select({ id: sessionCompletionCriteria.id })
        .from(sessionCompletionCriteria)
        .where(
          and(
            eq(sessionCompletionCriteria.populationTag, source.populationTag),
            eq(sessionCompletionCriteria.sessionType, sessionType as any),
          ),
        )
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      // Fallback to the conversation prompt only if a module genuinely states
      // no analysis criteria. That is no longer true of any of them: Module C
      // was believed to have none, but its list was simply written under a
      // different heading with ✅ marks the old extractor did not match. This
      // branch is kept as a guard for a future module, not because one needs
      // it today — if it ever fires, check the extractor before believing it.
      const usingConversationFallback = analysis.length === 0;
      const source_ = usingConversationFallback ? conversation : analysis;

      if (!source_.length) {
        console.log(`  ! ${source.populationTag}/${sessionType}: no criteria found`);
        continue;
      }

      const criteria = source_.map((text, n) => ({
        id: `c${n + 1}`,
        text,
        reachable: true,
        mirroredInConversation: usingConversationFallback
          ? true
          : conversation.some((c) => overlaps(text, c)),
        ...(usingConversationFallback
          ? {
              note:
                "Taken from the CONVERSATION prompt because no analysis criteria " +
                "were extracted. Verify that against the prompt file before " +
                "trusting it — the last time this fired, the criteria existed and " +
                "the extractor was wrong.",
            }
          : {}),
      }));

      const status = usingConversationFallback ? "draft" : "published";

      console.log(
        `  ${source.populationTag}/${sessionType} (Module ${moduleLetter}): ` +
          `${criteria.length} criteria, ${status}` +
          (usingConversationFallback ? "  <-- analysis had NONE" : ""),
      );

      if (DRY_RUN) continue;

      await db.insert(sessionCompletionCriteria).values({
        populationTag: source.populationTag,
        sessionType: sessionType as any,
        versionNumber: 1,
        status: status as any,
        criteria: criteria as any,
        changeNote: usingConversationFallback
          ? "DRAFT. This module's analysis prompt lists no criteria, so these come " +
            "from the conversation prompt. Publishing would give the analysis a bar " +
            "it has never had — stricter than today. Replay before publishing."
          : "Seeded from the analysis prompt, which is what gated completion.",
        publishedAt: usingConversationFallback ? null : new Date(),
      });

      if (usingConversationFallback) modulesDrafted++;
      else modulesPublished++;
    }
  }

  console.log(
    `\n[criteria] modules: ${modulesPublished} published, ${modulesDrafted} left as DRAFT.\n` +
      (modulesDrafted
        ? `[criteria] A DRAFT means no analysis criteria were extracted for that\n` +
          `[criteria] module and the conversation prompt was used instead. Check the\n` +
          `[criteria] prompt file before accepting that — the last time this\n` +
          `[criteria] happened the criteria were there and the extractor missed them.\n`
        : ""),
  );

  console.log(
    `\n[criteria] ${published} published, ${skipped} already existed.\n` +
      `[criteria] Behaviour is unchanged: these are the criteria that were\n` +
      `[criteria] already gating completion. What changes is that both prompts\n` +
      `[criteria] now read the SAME row, and the flags are visible in the UI.`,
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error("[criteria] failed:", err);
  await pool?.end().catch(() => {});
  process.exit(1);
});

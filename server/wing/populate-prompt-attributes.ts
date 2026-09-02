import { and, eq, isNull, or } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { promptLibrary } from "@shared/wing-schema";
import { classifyPromptTier } from "./prompt-tiers";
import { classifySignalCategory } from "./signal-categories";

/**
 * Writes evidence_tier and signal_category onto the live prompt_library rows, from the
 * same two classifiers that used to only produce a report nobody had to look at.
 *
 *     npm run wing:populate-prompt-attributes                report only
 *     npm run wing:populate-prompt-attributes -- --apply      write
 *
 * ── WHAT "POPULATE WITHOUT WAITING FOR DANIELLE" ACTUALLY MEANS HERE ─────────
 * Two different justifications, not one policy:
 *
 *   evidence_tier    her own three definitions, applied mechanically by
 *                    `classifyPromptTier`. Written with source 'rule_engine' — no
 *                    judgment was exercised beyond what she already wrote down.
 *
 *   signal_category  her eight definitions plus her own per-prompt "Signal:" annotation
 *                    where one exists, read by a human (this pass) rather than a
 *                    mechanical rule alone, because no single sentence of hers defines
 *                    the boundary the way the tier definitions do. Written with source
 *                    'claude_review' — a judgment call against her material, not a
 *                    verified fact, and `evidence_tier_because` /
 *                    `signal_category_because` record the reasoning so the admin review
 *                    screen can show her exactly why, for her to correct after the fact
 *                    rather than before.
 *
 * Neither write claims to BE her approval. Both are provenance, not permission — see
 * migration 0039's header for why this does not, on its own, change what the Reveal Cycle
 * can do: Gate 2 reads wing.prompt_log, and nothing writes wing.prompt_log in production
 * yet, so this populates the library for whenever delivery is wired, it does not turn
 * anything on today.
 *
 * ── WHY EXISTING VALUES ARE NEVER OVERWRITTEN ────────────────────────────────
 * A row with evidence_tier or signal_category already set was set by someone or something
 * that got there first — the prompt editor, an earlier run of this script, or (once she
 * starts using the review screen) Danielle herself. This script only fills nulls. Re-running
 * it after she has corrected a row is safe by construction: her correction is not null, so
 * it is never touched.
 *
 * ── WHY A NULL PROPOSAL WRITES NOTHING ────────────────────────────────────
 * Both classifiers return null rather than guess when nothing supports a confident answer.
 * A null proposal here means the row is left exactly as it was — still null, still visible
 * in the admin screen's "needs review" filter — rather than writing a note that says
 * nothing was found. The report below counts these separately so the number of prompts
 * that still need a person is never hidden inside a bigger total.
 */

let db: ScriptDb["db"];

async function main() {
  const apply = process.argv.indexOf("--apply") >= 0;

  console.log("\nPopulating prompt_library.evidence_tier and .signal_category\n");

  ({ db } = await initScript());

  const rows = await db
    .select({
      id: promptLibrary.id,
      promptText: promptLibrary.promptText,
      behavioralSignal: promptLibrary.behavioralSignal,
      sourceBlock: promptLibrary.sourceBlock,
      evidenceTier: promptLibrary.evidenceTier,
      signalCategory: promptLibrary.signalCategory,
    })
    .from(promptLibrary)
    .where(
      and(
        eq(promptLibrary.active, true),
        or(isNull(promptLibrary.evidenceTier), isNull(promptLibrary.signalCategory)),
      ),
    );

  console.log(`  ${rows.length} active row(s) missing a tier, a category, or both\n`);

  let tierSet = 0;
  let tierAlready = 0;
  let tierUncalled = 0;
  let categorySet = 0;
  let categoryAlready = 0;
  let categoryUncalled = 0;

  for (const row of rows) {
    const update: Record<string, unknown> = {};

    if (row.evidenceTier !== null) {
      tierAlready++;
    } else {
      const tier = classifyPromptTier(row.promptText, row.sourceBlock ?? undefined);
      if (tier.tier === null) {
        tierUncalled++;
      } else {
        update.evidenceTier = tier.tier;
        update.evidenceTierBecause = tier.because;
        update.evidenceTierSource = "rule_engine";
        tierSet++;
      }
    }

    if (row.signalCategory !== null) {
      categoryAlready++;
    } else {
      const category = classifySignalCategory(row.promptText, row.behavioralSignal);
      if (category.category === null) {
        categoryUncalled++;
      } else {
        update.signalCategory = category.category;
        update.signalCategoryBecause = category.because;
        update.signalCategorySource = "claude_review";
        categorySet++;
      }
    }

    if (Object.keys(update).length && apply) {
      await db.update(promptLibrary).set(update).where(eq(promptLibrary.id, row.id));
    }
  }

  console.log(`  evidence_tier:    ${tierSet} proposed, ${tierAlready} already set, ${tierUncalled} left null`);
  console.log(
    `  signal_category:  ${categorySet} proposed, ${categoryAlready} already set, ${categoryUncalled} left null`,
  );

  if (!apply) {
    console.log("\n  Report only. Re-run with --apply to write.\n");
    return;
  }

  console.log(
    "\n  Written. Nothing here changes what the Reveal Cycle can do today — see this file's\n" +
      "  header. The admin review screen is where these proposals get checked.\n",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

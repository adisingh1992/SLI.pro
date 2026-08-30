import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { promptLibrary, promptOpeners } from "@shared/wing-schema";
import { parsePrompts } from "./prompt-tiers";
import {
  parseOpeners,
  toRow,
  unmappedBlocks,
  unpooledOpeners,
  type PromptRow,
} from "./prompt-library-source";

/**
 * Seeds Danielle's prompt library — B2, and T7's second half.
 *
 * Run:  npm run wing:seed-microjournal
 *       npm run wing:seed-microjournal -- --dry-run
 *
 * ── WHAT THIS SEEDS, AND WHAT IT LEAVES ALONE ────────────────────────────
 * 295 prompts and 14 openers, from the two files in `prompts/`. It does not touch the 28
 * rows `wing:seed-prompts` wrote: those are the serious/reflective pool her rotation
 * weighting names as the other side of the 2:1, and they are a different library.
 *
 * ── MATCHED ON (block, code), NOT ON TEXT ────────────────────────────────
 * The older seeder matches on prompt text, which is right when the text is the only
 * identifier. Here her prompts have ids, and matching on text would mean a prompt she
 * rewords in the database is re-inserted as a duplicate on the next run — two rows for one
 * of her prompts, both eligible, one of them stale.
 *
 * (source_block, prompt_code) is the pair the unique index in 0028 is built on. Her
 * heartbeat prompts are numbered 1 to 8 within each track, so the code alone is not enough.
 *
 * ── INSERT ONLY. THE DATABASE OWNS EDITS. ────────────────────────────────
 * A row that already exists is left exactly as it is, including its derived columns. That
 * is the same rule as the message templates and the older prompt seeder — this script
 * bootstraps, the database owns — and it has a consequence worth stating: re-running after
 * a change to the DERIVATION will not update the rows it already wrote.
 *
 * That is deliberate rather than lazy. The alternative is a seeder that silently reverts
 * Danielle's edits, and the first column she will edit is the one this script deliberately
 * leaves null. When a derivation genuinely needs to move, it moves through a corrections
 * script that says what it is changing and why — the `apply-card-corrections` pattern —
 * not through a re-seed that overwrites whatever it finds.
 *
 * ── WHAT IS DELIBERATELY NULL ON EVERY ROW ───────────────────────────────
 * `signal_category`. Her eight categories govern the Reveal Cycle's Gate 2, which needs
 * four Tier 1 events across three DISTINCT categories, and not one of the 295 prompts
 * carries one. The `*Signal:*` lines are analysis, not labels. Until she assigns them,
 * Gate 2 cannot fire however much a student writes, and this script prints that rather
 * than leaving it to be discovered.
 *
 * `evidence_tier`. Proposed by `wing:tag-prompts` for her to correct; null until she does.
 */

const DRY_RUN = process.argv.includes("--dry-run");

const FILES = [
  "wing-approachable-microjournal-library.md",
  "wing-heartbeat-and-population-prompts.md",
] as const;

const OPENER_SOURCE = FILES[0];

function read(dir: string, name: string): string {
  const path = join(dir, name);
  if (!existsSync(path)) {
    throw new Error(
      `${path} is missing. Her library lives in prompts/ — see that directory's README ` +
        `for why it is not in methodology/.`,
    );
  }
  return readFileSync(path, "utf8");
}

async function seedPrompts(db: ScriptDb["db"], rows: readonly PromptRow[]) {
  let inserted = 0;
  let existing = 0;

  for (const r of rows) {
    const [found] = await db
      .select({ id: promptLibrary.id })
      .from(promptLibrary)
      .where(
        and(
          eq(promptLibrary.sourceBlock, r.sourceBlock),
          eq(promptLibrary.promptCode, r.promptCode),
        ),
      )
      .limit(1);

    if (found) {
      existing++;
      continue;
    }

    if (!DRY_RUN) {
      await db.insert(promptLibrary).values({
        /*
         * `category` stays null. It is the seven-value legacy enum — career, personal,
         * content, education, encouragement, fun, design_thinking — and none of her 295
         * prompts has one. 0028 dropped its NOT NULL for exactly this.
         */
        promptText: r.promptText,
        promptCode: r.promptCode,
        behavioralSignal: r.behavioralSignal,
        signalCategory: null,
        evidenceTier: null,
        audienceScope: r.audienceScope,
        cadence: r.cadence,
        library: r.library,
        eventSensitive: r.eventSensitive,
        deliveryMarker: r.deliveryMarker,
        populationTags: r.populationTags,
        sourceDocument: r.sourceDocument,
        sourceBlock: r.sourceBlock,
        sourceLine: r.sourceLine,
        active: true,
      });
    }
    inserted++;
  }

  return { inserted, existing };
}

async function seedOpeners(db: ScriptDb["db"], text: string) {
  const openers = parseOpeners(text);
  let inserted = 0;
  let existing = 0;

  for (const o of openers) {
    const [found] = await db
      .select({ id: promptOpeners.id })
      .from(promptOpeners)
      .where(and(eq(promptOpeners.pool, o.pool), eq(promptOpeners.text, o.text)))
      .limit(1);

    if (found) {
      existing++;
      continue;
    }
    if (!DRY_RUN) {
      await db.insert(promptOpeners).values({
        pool: o.pool,
        text: o.text,
        placeholders: o.placeholders,
        active: true,
      });
    }
    inserted++;
  }

  return { inserted, existing, total: openers.length };
}

async function main() {
  const { db, pool } = await initScript();
  console.log(`\n[prompts] seeding${DRY_RUN ? " (DRY RUN)" : ""}\n`);
  const dir = join(process.cwd(), "prompts");

  const rows: PromptRow[] = [];
  for (const f of FILES) {
    const parsed = parsePrompts(read(dir, f));
    for (const p of parsed) rows.push(toRow(p, f));
  }

  /*
   * A block whose heading this build does not recognise resolves to no population tags,
   * and an untagged prompt is UNIVERSAL by `population-tags.ts`'s fail-open rule. So the
   * failure is not an unreachable prompt — it is an executive-only prompt sent to
   * undergraduates. Refused rather than reported, because a seed runs unattended.
   */
  const unmapped = unmappedBlocks(rows);
  if (unmapped.length) {
    console.error(
      `[prompts] REFUSING TO SEED. ${unmapped.length} heading(s) resolve to no audience:\n` +
        unmapped.map((b) => `           ${b}`).join("\n") +
        `\n[prompts] An untagged prompt reaches EVERY student. Add the heading to AUDIENCE\n` +
        `[prompts] in prompt-library-source.ts, or correct it in her document.`,
    );
    await pool.end();
    process.exit(1);
  }

  const openerText = read(dir, OPENER_SOURCE);
  const stray = unpooledOpeners(openerText);
  if (stray) {
    console.error(
      `[prompts] REFUSING TO SEED. ${stray} opener(s) sit under a heading this build does\n` +
        `[prompts] not recognise. An opener in the wrong pool greets someone who answered\n` +
        `[prompts] yesterday as though they had gone quiet for a week.`,
    );
    await pool.end();
    process.exit(1);
  }

  const prompts = await seedPrompts(db, rows);
  const openers = await seedOpeners(db, openerText);

  /* ── What was written ─────────────────────────────────────────────────── */
  const by = (key: (r: PromptRow) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  };

  console.log(`\n[prompts] ${prompts.inserted} new, ${prompts.existing} already present, of ${rows.length} parsed.`);
  console.log(`[prompts] cadence   ${by((r) => String(r.cadence)).map(([k, n]) => `${k}:${n}`).join("  ")}`);
  console.log(`[prompts] scope     ${by((r) => String(r.audienceScope)).map(([k, n]) => `${k}:${n}`).join("  ")}`);
  console.log(`[prompts] pool      ${by((r) => String(r.library)).map(([k, n]) => `${k}:${n}`).join("  ")}`);
  console.log(`[prompts] event-sensitive: ${rows.filter((r) => r.eventSensitive).length} (all marked by her, in Section 5)`);
  console.log(`[openers] ${openers.inserted} new, ${openers.existing} already present, of ${openers.total} parsed.`);

  /*
   * The state of the thing that blocks the Reveal Cycle, read from the database rather
   * than from what this run happened to write — an earlier partial seed or a correction
   * she has already applied both change the answer.
   */
  const [{ total, categorised, tiered }] = (await db
    .select({
      total: sql<number>`count(*)::int`,
      categorised: sql<number>`count(${promptLibrary.signalCategory})::int`,
      tiered: sql<number>`count(${promptLibrary.evidenceTier})::int`,
    })
    .from(promptLibrary)
    .where(isNotNull(promptLibrary.promptCode))) as Array<{
    total: number;
    categorised: number;
    tiered: number;
  }>;

  console.log(
    `\n[prompts] ${categorised} of ${total} carry one of her eight signal categories.` +
      (categorised === 0
        ? `\n[prompts] The Reveal Cycle's Gate 2 needs four Tier 1 events across THREE\n` +
          `[prompts] DISTINCT categories. At zero it cannot fire, however much a student\n` +
          `[prompts] writes. Assigning them is Danielle's — the library carries analytical\n` +
          `[prompts] prose in its Signal lines, not category labels, and a guess would\n` +
          `[prompts] either manufacture distinctness or collapse it.`
        : ""),
  );
  console.log(`[prompts] ${tiered} of ${total} carry an evidence tier — proposed by wing:tag-prompts, hers to approve.`);
  console.log(
    `[prompts] Rows are matched on (source_block, prompt_code) and never updated, so an\n` +
      `[prompts] edit made in the database survives a re-run.` +
      (DRY_RUN ? "\n[prompts] (dry run — nothing written)" : "") +
      "\n",
  );

  await pool.end();
}

main().catch((err) => {
  console.error("[prompts] failed:", err);
  process.exit(1);
});

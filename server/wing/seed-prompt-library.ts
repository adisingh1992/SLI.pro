import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { promptLibrary } from "@shared/wing-schema";

/**
 * Seeds the life log prompt library (Feature List B2).
 *
 * Run:  npm run wing:seed-prompts
 *       npm run wing:seed-prompts -- --dry-run
 *
 * ── PROMPTS ARE SUGGESTIONS, NOT QUESTIONS ───────────────────────────────
 * The spec is specific about this: "faded suggested text that inspires but
 * doesn't constrain. The user always has the option to write freely." So these
 * render as placeholder text in an empty box, not as a form field with a label.
 * A student who ignores the prompt entirely and writes about something else has
 * used the feature correctly.
 *
 * That shapes the copy. Each one has to work as a thing you could start typing
 * over the top of — open, specific enough to spark something, and never
 * demanding a particular shape of answer.
 *
 * ── WHY SOME ARE DELIBERATELY SMALL ──────────────────────────────────────
 * The failure mode for a reflection prompt is asking for too much. "What did
 * you learn about yourself this month?" gets nothing from someone with four
 * minutes between classes. "What's something you accomplished this week that
 * you didn't tell anyone about?" gets a sentence, and a sentence is the whole
 * point — the log is a data-generating surface, not an essay assignment.
 *
 * Categories match the prompt_category enum. Danielle can add, retire and
 * re-tag these without a deploy; the 14-day no-repeat rule in messaging-store
 * queries message_events rather than storing state on the student, so adding a
 * prompt takes effect immediately.
 */

const DRY_RUN = process.argv.includes("--dry-run");

type Category =
  | "career" | "personal" | "content" | "education" | "encouragement"
  | "fun" | "design_thinking";

type Seed = { category: Category; text: string };

const PROMPTS: Seed[] = [
  /* ── Career ──────────────────────────────────────────────────────────── */
  { category: "career", text: "The last time you met someone new, how did you describe what you do?" },
  { category: "career", text: "Did anything happen this week that you'd mention in an interview?" },
  { category: "career", text: "What's the most useful thing someone told you recently?" },
  { category: "career", text: "Any conversation this week that went somewhere you didn't expect?" },
  { category: "career", text: "What did you get asked to help with, and why do you think they asked you?" },
  { category: "career", text: "Anything you said no to lately? What made it easy or hard?" },
  { category: "career", text: "What's something you're better at now than you were three months ago?" },

  /* ── Personal ────────────────────────────────────────────────────────── */
  { category: "personal", text: "What's something you accomplished this week that you didn't tell anyone about?" },
  { category: "personal", text: "Did anything change your thinking recently — a conversation, something you read?" },
  { category: "personal", text: "What's been taking up space in your head this week?" },
  { category: "personal", text: "When did you last feel like you were doing the thing you're actually good at?" },
  { category: "personal", text: "Anything you're proud of that would sound small if you said it out loud?" },

  /* ── Design thinking ─────────────────────────────────────────────────── */
  { category: "design_thinking", text: "If you had to explain your work to a curious 10-year-old, what would you say?" },
  { category: "design_thinking", text: "What's a problem you keep running into? Not solving it — just naming it." },
  { category: "design_thinking", text: "If someone else did your job for a week, what would surprise them?" },
  { category: "design_thinking", text: "What's the part of your work nobody sees?" },
  { category: "design_thinking", text: "Describe something you fixed. What was actually broken about it?" },

  /* ── Content ─────────────────────────────────────────────────────────── */
  { category: "content", text: "What's something you know that you assume everyone knows — but they probably don't?" },
  { category: "content", text: "Anything you've changed your mind about lately?" },
  { category: "content", text: "What would you tell someone starting where you started?" },

  /* ── Education ───────────────────────────────────────────────────────── */
  { category: "education", text: "What did you have to figure out this week that nobody taught you?" },
  { category: "education", text: "Learned anything recently that you'll actually use?" },

  /* ── Encouragement ───────────────────────────────────────────────────── */
  { category: "encouragement", text: "Rough week? Write it down anyway — the setbacks are worth tracking too." },
  { category: "encouragement", text: "What went better than you expected?" },
  { category: "encouragement", text: "Something you were dreading that turned out fine?" },

  /* ── Fun ─────────────────────────────────────────────────────────────── */
  { category: "fun", text: "What's the most ridiculous thing that happened this week?" },
  { category: "fun", text: "If your week had a title, what would it be?" },
  { category: "fun", text: "What did you procrastinate on, and what did you do instead?" },
];

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  ({ db, pool } = await initScript());
  console.log(`\n[prompts] seeding${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  let inserted = 0;
  let existing = 0;

  for (const p of PROMPTS) {
    // Matched on text, so re-running never duplicates and an edit made in the
    // database is left alone — same rule as the message templates: this script
    // bootstraps, the database owns.
    const [found] = await db
      .select({ id: promptLibrary.id })
      .from(promptLibrary)
      .where(
        and(
          eq(promptLibrary.promptText, p.text),
          eq(promptLibrary.category, p.category as any),
        ),
      )
      .limit(1);

    if (found) {
      existing++;
      continue;
    }

    if (!DRY_RUN) {
      await db.insert(promptLibrary).values({
        category: p.category as any,
        promptText: p.text,
        // Empty populationTags means "everyone". Tagging is available for the
        // undergraduate divergence in Danielle's queue, unused for now.
        populationTags: [],
        active: true,
      });
    }
    inserted++;
    console.log(`  + [${p.category}] ${p.text.slice(0, 62)}${p.text.length > 62 ? "…" : ""}`);
  }

  const byCategory = PROMPTS.reduce<Record<string, number>>((a, p) => {
    a[p.category] = (a[p.category] ?? 0) + 1;
    return a;
  }, {});

  console.log(`\n[prompts] ${inserted} new, ${existing} already present.`);
  console.log(`[prompts] ${Object.entries(byCategory).map(([c, n]) => `${c}:${n}`).join("  ")}`);
  console.log(
    `[prompts] Editable in the database without a deploy. The 14-day no-repeat\n` +
      `[prompts] rule is a query, not stored state, so additions take effect at once.` +
      (DRY_RUN ? "\n[prompts] (dry run — nothing written)" : "") +
      "\n",
  );

  await pool.end();
}

main().catch((err) => {
  console.error("[prompts] failed:", err);
  process.exit(1);
});

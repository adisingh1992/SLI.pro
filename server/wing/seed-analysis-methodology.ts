import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { analysisMethodology } from "@shared/wing-schema";

/**
 * Seeds analysis_methodology from the current prompt files.
 *
 * Run:  npm run wing:seed-methodology-sections
 *       npm run wing:seed-methodology-sections -- --dry-run
 *
 * Behaviour is unchanged by design: these ARE the sections the analysis has
 * been using. What changes is that they become editable and versioned instead
 * of living in a TypeScript template literal.
 *
 * ── The recurring failure this script is written against ──────────────────
 * Four times in this project an extractor has read a prompt file and been
 * quietly wrong — twice because the prompt had since been parameterised and
 * the pattern no longer matched, once because a heading was indented, once
 * because criteria were written with ✅ marks nothing looked for. Every time,
 * "no results" was read as "nothing there" rather than "the pattern missed".
 *
 * So: this reads THROUGH the `${analysisMethodology ?? \`…\`}` wrapper that was
 * introduced at the same time, and it refuses to write anything if the counts
 * do not match what the prompt files actually contain. A silent zero is the
 * failure mode, so a zero is made loud.
 */

const DRY_RUN = process.argv.includes("--dry-run");

/** 45 sections across 9 population/session pairs, verified against the files. */
const EXPECTED_TOTAL = 45;

const SOURCES = [
  { populationTag: "mid_career_or_senior", file: "mid-career-senior" },
  { populationTag: "early_career", file: "early-career" },
  { populationTag: "undergraduate_or_recent_grad", file: "undergraduate-recent-grad" },
] as const;

const SESSION_TYPES = ["foundation_1", "foundation_2", "foundation_3"] as const;

type Section = { id: string; title: string; body: string };

/**
 * Pulls the methodology block out of each analysis prompt.
 *
 * The wrapper is matched explicitly rather than optionally: if someone later
 * removes the parameterisation, this returns nothing and the guard below
 * stops the run — which is the correct outcome, because the seed source has
 * changed shape and needs a human to look.
 */
function extractSections(src: string): Section[][] {
  const spans = Array.from(
    src.matchAll(
      /Use this methodology to analyze the transcript:\n\$\{analysisMethodology \?\? `([\s\S]*?)`\}/g,
    ),
  ).map((m) => m[1]);

  return spans.map((span) =>
    span
      .trim()
      // Headings are numbered "N) Title" and may be indented — Session 1 sits
      // at column 0 while Session 2 is indented eight spaces. Allowing leading
      // whitespace is what a previous version of this split got wrong, silently
      // collapsing five sections into one.
      .split(/\n\s*(?=\d\)\s)/)
      .filter((s) => s.trim())
      .map((s, i) => {
        const lines = s.split("\n");
        return {
          id: `s${i + 1}`,
          title: lines[0].replace(/^\s*\d\)\s*/, "").trim(),
          // Body keeps its indentation: these are nested bullet lists and
          // flattening them changes how the model reads the hierarchy.
          body: lines.slice(1).join("\n").replace(/\s+$/, ""),
        };
      })
      .filter((s) => s.title),
  );
}

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  ({ db, pool } = await initScript());
  console.log(`\n[methodology] seeding from the current prompt files${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  const extracted: Array<{
    populationTag: string;
    sessionType: string;
    sections: Section[];
  }> = [];

  for (const source of SOURCES) {
    const src = await import(`fs`).then((fs) =>
      fs.readFileSync(`server/prompts/${source.file}.ts`, "utf8"),
    );
    const perSession = extractSections(src);

    for (let i = 0; i < SESSION_TYPES.length; i++) {
      extracted.push({
        populationTag: source.populationTag,
        sessionType: SESSION_TYPES[i],
        sections: perSession[i] ?? [],
      });
    }
  }

  const total = extracted.reduce((n, e) => n + e.sections.length, 0);

  // The guard. A silent zero is how the previous extraction mistakes reached
  // the database; refusing to write on a count mismatch is what stops the
  // fifth one.
  if (total !== EXPECTED_TOTAL) {
    console.error(
      `\n[methodology] ABORT — extracted ${total} sections, expected ${EXPECTED_TOTAL}.\n` +
        `[methodology] The prompt files have changed shape. Do NOT adjust\n` +
        `[methodology] EXPECTED_TOTAL to match: read the files, work out which\n` +
        `[methodology] block stopped matching, and fix the pattern.\n`,
    );
    for (const e of extracted) {
      console.error(`    ${e.populationTag}/${e.sessionType}: ${e.sections.length}`);
    }
    await pool.end();
    process.exit(1);
  }

  let published = 0;
  let skipped = 0;

  for (const e of extracted) {
    const [existing] = await db
      .select({ id: analysisMethodology.id })
      .from(analysisMethodology)
      .where(
        and(
          eq(analysisMethodology.populationTag, e.populationTag),
          eq(analysisMethodology.sessionType, e.sessionType as any),
        ),
      )
      .limit(1);

    if (existing) {
      console.log(`  ${e.populationTag}/${e.sessionType}: already exists, skipped`);
      skipped++;
      continue;
    }

    console.log(
      `  ${e.populationTag}/${e.sessionType}: ${e.sections.length} sections, published`,
    );
    for (const s of e.sections) {
      console.log(`      · ${s.title.slice(0, 66)}`);
    }

    if (DRY_RUN) {
      published++;
      continue;
    }

    await db.insert(analysisMethodology).values({
      populationTag: e.populationTag,
      sessionType: e.sessionType as any,
      versionNumber: 1,
      status: "published",
      sections: e.sections as any,
      changeNote:
        "Seeded verbatim from the analysis prompt. This is the methodology " +
        "that was already running — publishing it changes nothing except that " +
        "it becomes editable.",
      publishedAt: new Date(),
    });
    published++;
  }

  console.log(
    `\n[methodology] ${published} published, ${skipped} already existed.` +
      (DRY_RUN ? "\n[methodology] (dry run — nothing was written)" : "") +
      `\n[methodology] Behaviour is unchanged: the analysis was already reading\n` +
      `[methodology] these exact sections from the prompt files.\n`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error("[methodology] failed:", err);
  process.exit(1);
});

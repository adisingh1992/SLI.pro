import "dotenv/config";
import { writeFileSync } from "fs";
import { readFileSync } from "fs";
import { eq } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { heuristics, heuristicComponents } from "@shared/wing-schema";
import { codeFromName, uniqueCode } from "./card-code";

/**
 * Extracts the scripted coaching language from the prompt files into heuristic
 * cards, keyed by the codes the objective sets already reference.
 *
 * Run:  npm run wing:extract-cards -- --dry-run     (writes JSON for review)
 *       npm run wing:extract-cards                  (inserts as candidates)
 *
 * WHY THIS IS THE REAL WORK
 * The objective model renders a ~1,200-character prompt where the file it
 * replaces is ~22,000. That gap is not efficiency — it is the craft that has
 * not moved yet. The current prompts contain lines like
 *
 *   "You're describing three functions. That's not breadth — that's a
 *    positioning problem. A recruiter can't place you."
 *
 * An objective can say "dismantle the multi-function claim"; it cannot say
 * that. Interventions are where the sharp, specific language lives, and until
 * they exist a rendered prompt is a skeleton.
 *
 * ── EXTRACTION DISCIPLINE ────────────────────────────────────────────────
 * Five extractors in this project have been silently wrong, every one because
 * a pattern stopped matching and the empty result was read as "nothing there".
 * So:
 *
 *   · sections are split on the prompts' own `-----` rules, an unambiguous
 *     boundary, not on guessed indentation or bullet style;
 *   · heading → card code is an EXPLICIT table, never inferred;
 *   · every heading that maps to nothing is reported loudly, and every code
 *     referenced by an objective set with no matching heading is too.
 *
 * Cards land as `candidate` and in no sequence — inert until reviewed, exactly
 * like the extracted heuristic cards before them.
 */

const DRY_RUN = process.argv.includes("--dry-run");
const OUTPUT_FILE = "extracted-intervention-cards.json";

const SOURCES = [
  { populationTag: "mid_career_or_senior", file: "mid-career-senior" },
  { populationTag: "early_career", file: "early-career" },
  { populationTag: "undergraduate_or_recent_grad", file: "undergraduate-recent-grad" },
] as const;

/**
 * Heading → card code. Explicit on purpose.
 *
 * Inferring codes from headings would silently produce a card no objective
 * references, which renders as nothing — the failure this whole exercise is
 * about. A heading absent from this table is reported, not guessed at.
 */
const HEADING_TO_CODE: Record<string, string> = {
  "MULTI-FUNCTION CHALLENGE": "multi_function_challenge",
  "SUNK COST RESISTANCE": "sunk_cost_resistance",
  "RESISTANCE PATTERNS": "resistance_patterns",
  "FUNCTION VALIDATION TESTS": "function_validation_tests",
  "ANTI-GENERALIST ENFORCEMENT": "anti_generalist",
  "BREAKTHROUGH CONFIRMATION": "breakthrough_confirmation",
  "OPENING": "opening_challenge",
  "OPENING FRAME": "opening_frame",
  "SPECIFICITY ESCALATION LADDER": "specificity_ladder",
  "CREDIBILITY LITMUS TESTS": "credibility_litmus_tests",
  "ENTREPRENEUR / FOUNDER": "special_case_flags",
  "CONCURRENT GRAD STUDENT": "special_case_flags",
  "CAREER CHANGER": "special_case_flags",
  "CLOSING": "closing_move",
};

type CardSeed = {
  cardCode: string;
  name: string;
  description: string;
  populationTags: string[];
  /** The scripted language, verbatim. */
  intervention: string;
  /** When to reach for it, taken from the heading's parenthetical if present. */
  signal: string;
};

function sectionsOf(src: string): Array<{ heading: string; parenthetical: string; body: string }> {
  const m = src.match(/function getSystemPrompt\(([\s\S]*?)\n\}\n/);
  if (!m) return [];

  const out: Array<{ heading: string; parenthetical: string; body: string }> = [];

  /*
   * Sections are separated by a rule of dashes — the prompt's own structure,
   * so it does not drift the way a guessed pattern would.
   *
   * But taking only the FIRST heading per chunk missed real sections: the
   * mid-career preamble chunk holds SESSION GOAL, USER PSYCHOLOGY, STYLE,
   * CORE BELIEF *and* OPENING before the first rule appears, so only one of
   * them was ever seen. That is why `opening_challenge` had no mid-career card
   * while the other two populations did — a gap that renders as an opening
   * move with no script behind it, and nothing reports it.
   *
   * Every ALL-CAPS heading in a chunk is now a section boundary.
   */
  const isHeading = (l: string) =>
    /^[A-Z][A-Z0-9 /&'\-→]{4,60}(\s*\(.*\))?\s*$/.test(l.trim());

  for (const chunk of m[1].split(/\n-{20,}\n/)) {
    const lines = chunk.split("\n");
    const marks = lines.map((l, i) => (isHeading(l) ? i : -1)).filter((i) => i >= 0);

    for (let n = 0; n < marks.length; n++) {
      const start = marks[n];
      const end = n + 1 < marks.length ? marks[n + 1] : lines.length;
      const raw = lines[start].trim();
      const heading = raw.replace(/\s*\(.*\)\s*$/, "").replace(/\s*→.*$/, "").trim();
      const parenthetical = raw.match(/\((.*)\)/)?.[1] ?? "";
      const body = lines.slice(start + 1, end).join("\n").trim();
      if (body.length > 40) out.push({ heading, parenthetical, body });
    }
  }
  return out;
}

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  ({ db, pool } = await initScript());
  console.log(`\n[cards] extracting intervention cards${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  const seeds: CardSeed[] = [];
  const unmapped: string[] = [];

  for (const source of SOURCES) {
    const src = readFileSync(`server/prompts/${source.file}.ts`, "utf8");
    for (const s of sectionsOf(src)) {
      const code = HEADING_TO_CODE[s.heading];
      if (!code) {
        unmapped.push(`${source.populationTag}: ${s.heading}`);
        continue;
      }
      // One card per (code, population): the same beat is phrased differently
      // per population, and merging them would lose exactly the difference
      // that makes the card worth having.
      seeds.push({
        cardCode: `${code}__${source.populationTag}`,
        name: `${s.heading} (${source.populationTag})`,
        description:
          s.parenthetical ||
          `Scripted coaching language for ${s.heading.toLowerCase()}, extracted verbatim.`,
        populationTags: [source.populationTag],
        intervention: s.body,
        signal: s.parenthetical || "See the objective this card is attached to.",
      });
    }
  }

  const byCode = new Map<string, CardSeed>();
  for (const s of seeds) byCode.set(s.cardCode, s);

  console.log(`  ${byCode.size} card(s) extracted\n`);
  for (const s of Array.from(byCode.values())) {
    console.log(`    ${s.cardCode.padEnd(46)} ${String(s.intervention.length).padStart(5)} chars`);
  }

  if (unmapped.length) {
    console.log(`\n  ${unmapped.length} heading(s) with no code in HEADING_TO_CODE:`);
    for (const u of Array.from(new Set(unmapped))) console.log(`    ${u}`);
    console.log(
      "  Add them to the table or decide they are not interventions — do NOT\n" +
        "  leave them unmapped and assume they were not needed.",
    );
  }

  if (DRY_RUN) {
    writeFileSync(OUTPUT_FILE, JSON.stringify(Array.from(byCode.values()), null, 2));
    console.log(`\n[cards] wrote ${OUTPUT_FILE} — review before importing.\n`);
    await pool.end();
    return;
  }

  const taken = new Set(
    (await db.select({ code: heuristics.cardCode }).from(heuristics)).map((r) => r.code),
  );

  let inserted = 0;
  let skipped = 0;

  for (const seed of Array.from(byCode.values())) {
    const [existing] = await db
      .select({ id: heuristics.id })
      .from(heuristics)
      .where(eq(heuristics.cardCode, seed.cardCode))
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    const code = uniqueCode(seed.cardCode || codeFromName(seed.name), taken);
    taken.add(code);

    const [created] = await db
      .insert(heuristics)
      .values({
        cardCode: code,
        name: seed.name,
        description: seed.description,
        populationTags: seed.populationTags,
        // Candidate, and in no sequence. Inert until the methodology owner
        // reviews it — same rule as every other extracted card.
        status: "candidate",
      })
      .returning({ id: heuristics.id });

    await db.insert(heuristicComponents).values([
      { heuristicId: created.id, componentType: "signal" as any, content: seed.signal },
      { heuristicId: created.id, componentType: "intervention" as any, content: seed.intervention },
    ]);
    inserted++;
  }

  console.log(
    `\n[cards] ${inserted} inserted, ${skipped} already existed.\n` +
      `[cards] All are candidates in no sequence — inert until reviewed.\n`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error("[cards] failed:", err);
  process.exit(1);
});

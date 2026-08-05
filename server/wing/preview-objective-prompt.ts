import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { objectiveSets, heuristics, heuristicComponents } from "@shared/wing-schema";
import { POPULATIONS, resolveForPopulation, type Objective, type PopulationTag } from "./objective-rules";
import { resolveCardCode } from "./card-code";
import { renderConversationPrompt, renderObjectiveEvidencePrompt } from "./prompt-renderer";

/**
 * Renders what Wing would actually receive, without calling a model.
 *
 * Run:  npm run wing:preview-prompt
 *       npm run wing:preview-prompt -- --population early_career --satisfied surface_current_positioning
 *
 * WHY BEFORE THE EDITOR
 * The objective model has survived modelling but has never produced a prompt.
 * Building an admin editor for a format nobody has read would be premature —
 * the question that matters is whether the assembled prompt reads like
 * something that would produce a good coaching turn, and that is answerable in
 * a minute by looking at it.
 *
 * Also checks that every intervention an objective names exists as a heuristic
 * card. A missing card renders as nothing at all, so the objective would
 * silently lose its interventions — the same "looks fine, does nothing" class
 * of failure that this whole redesign exists to remove.
 */

const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const population = (arg("population") ?? "mid_career_or_senior") as PopulationTag;
const satisfied = (arg("satisfied") ?? "").split(",").filter(Boolean);
const sessionType = arg("session") ?? "foundation_1";

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  ({ db, pool } = await initScript());

  if (!POPULATIONS.includes(population)) {
    console.error(`Unknown population "${population}". One of: ${POPULATIONS.join(", ")}`);
    await pool.end();
    process.exit(1);
  }

  const [set] = await db
    .select()
    .from(objectiveSets)
    .where(eq(objectiveSets.sessionType, sessionType as any))
    .limit(1);

  if (!set) {
    console.error(`No objective set for ${sessionType}. Run: npm run wing:seed-objectives`);
    await pool.end();
    process.exit(1);
  }

  const objectives = set.objectives as Objective[];
  const resolved = resolveForPopulation(objectives, population);

  /*
   * Bound on card_code, which is stable across renames.
   *
   * Loads the INTERVENTION COMPONENT, not the card name. An earlier version of
   * this preview injected names, which made the rendered prompt look correct
   * while carrying none of the scripted language — the prompt stayed at ~1,200
   * characters after 21 cards were imported, which is what gave it away. The
   * whole point of looking at the prompt is to see whether the craft is in it.
   */
  const cards = await db
    .select({
      code: heuristics.cardCode,
      name: heuristics.name,
      componentType: heuristicComponents.componentType,
      content: heuristicComponents.content,
    })
    .from(heuristics)
    .leftJoin(
      heuristicComponents,
      and(
        eq(heuristicComponents.heuristicId, heuristics.id),
        eq(heuristicComponents.isCurrent, true),
      ),
    );

  const byCode = new Map<string, string>();
  for (const c of cards) {
    // Prefer the intervention text; fall back to the name so a card with no
    // intervention component is visible as thin rather than absent.
    if (c.componentType === "intervention" && c.content) {
      byCode.set(c.code, c.content);
    } else if (!byCode.has(c.code)) {
      byCode.set(c.code, `(${c.name} — no intervention component)`);
    }
  }

  // Objectives name a plain code; most cards are population-specific. See
  // resolveCardCode — prefers `code__population`, falls back to `code`.
  const available = new Set(byCode.keys());
  const referenced = Array.from(new Set(resolved.flatMap((o) => o.interventions)));
  const missing: string[] = [];

  const interventionText: Record<string, string> = {};
  for (const code of referenced) {
    const found = resolveCardCode(code, population, available);
    if (found) {
      interventionText[code] = byCode.get(found)!;
    } else {
      missing.push(code);
      interventionText[code] = `[${code} — NO MATCHING CARD]`;
    }
  }

  console.log("=".repeat(74));
  console.log(`CONVERSATION PROMPT · ${sessionType} · ${population}`);
  if (satisfied.length) console.log(`satisfied so far: ${satisfied.join(", ")}`);
  console.log("=".repeat(74));

  const rendered = renderConversationPrompt({
    identity:
      "You are Wing, a professional brand coach. Speak plainly. Ask one short question at a " +
      "time. Never lecture.",
    sessionTitle: "Foundation Session 1 — Functional Identity",
    objectives: resolved,
    satisfied,
    interventionText,
    studentContext:
      "[resume summary, questionnaire and prior sessions are injected here at runtime]",
    completionCriteria:
      "[rendered from session_completion_criteria — the same rows the analysis reads]",
  });

  console.log(rendered.prompt);
  console.log("");
  console.log("-".repeat(74));
  console.log(`current objective : ${rendered.currentObjectiveKey ?? "(none — all satisfied)"}`);
  console.log(`progress          : ${Math.round(rendered.progress * 100)}%`);
  console.log(`prompt size       : ${rendered.prompt.length} chars`);
  console.log("-".repeat(74));

  if (missing.length) {
    console.log("");
    console.log(`⚠ ${missing.length} intervention code(s) match no heuristic card:`);
    for (const m of missing) console.log(`    ${m}`);
    console.log(
      "  These render as a placeholder. In production they would contribute nothing,\n" +
        "  so the objective would quietly lose its interventions.",
    );
  }

  console.log("");
  console.log("=".repeat(74));
  console.log(`EVIDENCE PROMPT (analysis side)`);
  console.log("=".repeat(74));
  console.log(
    renderObjectiveEvidencePrompt({
      objectives: resolved,
      satisfied,
      transcript: "[the finished transcript is injected here]",
    }),
  );
  console.log("");

  await pool.end();
}

main().catch((err) => {
  console.error("[preview] failed:", err);
  process.exit(1);
});

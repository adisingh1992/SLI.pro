import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { and, eq } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { heuristics, heuristicComponents } from "@shared/wing-schema";
import { codeFromName, uniqueCode } from "./card-code";

/**
 * Extracts heuristic cards from the existing prompt files.
 *
 * Run:  npm run wing:extract-heuristics -- --dry-run   (writes JSON, no DB writes)
 *       npm run wing:extract-heuristics                (inserts candidates)
 *       npm run wing:extract-heuristics -- --only=mid-career-senior
 *
 * WHY
 * The MVP prompt files already contain SLI.pro's real methodology — signal
 * definitions, interventions and coaching moves, written by the methodology
 * owner and embedded in prose. "Code the engine, not the heuristics" (spec §2)
 * means that content belongs in the database as structured, versioned records.
 * This script does the first pass of that move.
 *
 * WHAT IT DOES NOT DO — and this is the important part
 *
 *  1. It does NOT add anything to a sequence. Every card lands as `candidate`,
 *     unreferenced, and therefore inert. Nothing extracted here reaches a
 *     student until the methodology owner deliberately puts it in a sequence.
 *     (This is the safety property the hand-written scaffolding cards did not
 *     have — those were seeded straight into the active sequence.)
 *
 *  2. It does NOT replace the methodology owner's judgement. An LLM reading
 *     prose and proposing structure will merge things that should be separate,
 *     split things that should be joined, and occasionally state a rule more
 *     confidently than the source did. Every card records the file and line
 *     range it came from precisely so that Danielle can check it against the
 *     original rather than trust it.
 *
 *  3. It does NOT delete or edit the prompt files. The prompts stay in control
 *     of the conversation; extraction is additive. Retiring prompt text in
 *     favour of cards is a later, separate decision.
 */

const DRY_RUN = process.argv.includes("--dry-run");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.split("=")[1] : null;

/**
 * Import a previous dry run's output instead of re-extracting.
 *
 * A full extraction is ~29 flagship calls. Having reviewed that output, there
 * is no reason to pay for it again just to write the same cards to the
 * database — and re-running would produce subtly different cards, so the
 * reviewed artefact and the imported one would not match.
 */
const FROM_JSON = process.argv.includes("--from-json");

const OUTPUT_FILE = "extracted-heuristics.json";

/**
 * Cards whose signal describes an ARTIFACT rather than something a student
 * says in conversation.
 *
 * The engine only ever evaluates human turns, so these cannot fire as written.
 * They are still imported — the coaching content is real and will matter when
 * artifact review exists — but they are flagged so a reviewer is not left
 * wondering why a perfectly sensible card never triggers.
 */
const ARTIFACT_SIGNAL = /\b(profile|headline|outreach|message|draft|resume|post|template|plan|roadmap|map|bio|summary section)\b/i;

/** Lines per chunk. Small enough that the model attends to the whole span. */
const CHUNK_LINES = 180;
const CHUNK_OVERLAP = 20;

type Source = {
  file: string;
  /** Maps to heuristics.population_tags and to professionalStatus values. */
  populationTag: string;
  surface: string;
};

const SOURCES: Source[] = [
  {
    file: "server/prompts/undergraduate-recent-grad.ts",
    populationTag: "undergraduate_or_recent_grad",
    surface: "Foundation Sessions",
  },
  {
    file: "server/prompts/early-career.ts",
    populationTag: "early_career",
    surface: "Foundation Sessions",
  },
  {
    file: "server/prompts/mid-career-senior.ts",
    populationTag: "mid_career_or_senior",
    surface: "Foundation Sessions",
  },
  {
    file: "server/enhancement-module-prompts/undergraduate-recent-grad.ts",
    populationTag: "undergraduate_or_recent_grad",
    surface: "Enhancement Modules",
  },
  {
    file: "server/enhancement-module-prompts/early-career.ts",
    populationTag: "early_career",
    surface: "Enhancement Modules",
  },
  {
    file: "server/enhancement-module-prompts/mid-career-senior.ts",
    populationTag: "mid_career_or_senior",
    surface: "Enhancement Modules",
  },
];

type ExtractedCard = {
  name: string;
  description: string;
  signal: string;
  intervention: string;
  coaching_move: string;
  outcome: string;
  module_mapping?: string;
  sourceQuote: string;
  confidence: number;
};

const EXTRACTION_SYSTEM = [
  "You are converting coaching methodology written as prose instructions into",
  "structured heuristic cards.",
  "",
  "A HEURISTIC is one discrete coaching pattern: something the coach should",
  "NOTICE in what a person says, and what the coach should DO about it.",
  "",
  "For each heuristic you find, produce:",
  '- name: short, specific, title case (e.g. "Generalist hedging")',
  "- description: one sentence naming the pattern",
  "- signal: what this looks like IN THE PERSON'S OWN WORDS. Observable",
  "  behaviour, not an inference about their psychology. Be specific about",
  "  quantity and form where the source is.",
  "- intervention: what the coach should do when the signal fires",
  "- coaching_move: how to deliver it — tone, pacing, what NOT to do",
  "- outcome: what success looks like, described as something you could observe",
  "- module_mapping: where in the arc this applies, if the source says",
  "- sourceQuote: a SHORT verbatim quote from the input that this card is",
  "  based on, so a human can find it again",
  "- confidence: 0..1, how clearly the input actually states this as a rule",
  "",
  "RULES — these matter more than completeness:",
  "- Extract ONLY what the input actually says. Do not add coaching wisdom of",
  "  your own, and do not smooth over gaps. If the source does not state an",
  "  outcome, say so in the outcome field rather than inventing one.",
  "- Skip anything that is not a coaching pattern: output formatting rules,",
  "  JSON schemas, session-completion bookkeeping, phase scaffolding, tone",
  "  boilerplate. These are real instructions but they are not heuristics.",
  "- One pattern per card. If a section describes three different things to",
  "  notice, that is three cards.",
  "- Prefer FEWER, sharper cards. An empty array is a perfectly good answer",
  "  for a chunk that contains no coaching patterns.",
  "",
  'Reply with JSON only: {"cards": [ ... ]}',
].join("\n");

function chunkLines(text: string): Array<{ start: number; end: number; body: string }> {
  const lines = text.split("\n");
  const chunks: Array<{ start: number; end: number; body: string }> = [];

  for (let i = 0; i < lines.length; i += CHUNK_LINES - CHUNK_OVERLAP) {
    const end = Math.min(i + CHUNK_LINES, lines.length);
    chunks.push({
      start: i + 1,
      end,
      body: lines.slice(i, end).join("\n"),
    });
    if (end >= lines.length) break;
  }
  return chunks;
}

async function extractFromChunk(
  orchestrator: typeof import("../orchestrator"),
  parseJsonResponse: typeof import("../json-response").parseJsonResponse,
  source: Source,
  chunk: { start: number; end: number; body: string },
): Promise<ExtractedCard[]> {
  try {
    // Flagship tier: this is a one-off migration whose output a human will
    // rely on. Getting fewer, better cards is worth more than the token cost.
    const result = await orchestrator.complete({
      tier: "flagship",
      system: EXTRACTION_SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `Source: ${source.file} (${source.surface}, ${source.populationTag}), ` +
            `lines ${chunk.start}-${chunk.end}\n\n${chunk.body}`,
        },
      ],
      maxTokens: 4000,
      temperature: 0,
    });

    const parsed = parseJsonResponse<{ cards?: ExtractedCard[] }>(
      result.text,
      `Extraction ${source.file}:${chunk.start}`,
    );
    return Array.isArray(parsed.cards) ? parsed.cards : [];
  } catch (err) {
    console.error(
      `  ! ${source.file}:${chunk.start}-${chunk.end} failed: ${(err as Error).message}`,
    );
    return [];
  }
}

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  // llm: true — this script calls the orchestrator, so the Azure OpenAI
  // settings must be hydrated too, not just DATABASE_URL.
  ({ db, pool } = await initScript({ llm: !FROM_JSON }));
  const orchestrator = await import("../orchestrator");
  const { parseJsonResponse } = await import("../json-response");

  const sources = ONLY ? SOURCES.filter((s) => s.file.includes(ONLY)) : SOURCES;
  if (!sources.length) {
    throw new Error(`--only=${ONLY} matched no source files`);
  }

  console.log(
    `[extract] ${sources.length} file(s), provider ${orchestrator.activeProvider()}` +
      (DRY_RUN ? " — DRY RUN, no database writes" : ""),
  );

  let all: Array<ExtractedCard & { source: Source; lines: string }> = [];

  if (FROM_JSON) {
    all = JSON.parse(readFileSync(OUTPUT_FILE, "utf-8"));
    console.log(`[extract] loaded ${all.length} card(s) from ${OUTPUT_FILE} — no LLM calls`);
  } else {
    for (const source of sources) {
      const text = readFileSync(source.file, "utf-8");
      const chunks = chunkLines(text);
      console.log(`\n[extract] ${source.file} — ${chunks.length} chunk(s)`);

      for (const chunk of chunks) {
        const cards = await extractFromChunk(orchestrator, parseJsonResponse, source, chunk);
        for (const card of cards) {
          all.push({ ...card, source, lines: `${chunk.start}-${chunk.end}` });
        }
        process.stdout.write(`  lines ${chunk.start}-${chunk.end}: ${cards.length} card(s)\n`);
      }
    }
  }

  // Chunks overlap, so the same pattern can surface twice. Dedupe on a
  // normalised name and keep the higher-confidence reading.
  const byName = new Map<string, (typeof all)[number]>();
  for (const card of all) {
    const key = `${card.source.populationTag}::${card.name.toLowerCase().trim()}`;
    const existing = byName.get(key);
    if (!existing || (card.confidence ?? 0) > (existing.confidence ?? 0)) {
      byName.set(key, card);
    }
  }
  // Array.from rather than spread: the project targets a TS lib below es2015
  // downlevelIteration, so spreading a Map iterator does not compile.
  const deduped = Array.from(byName.values());

  console.log(
    `\n[extract] ${all.length} raw card(s) -> ${deduped.length} after dedupe`,
  );

  if (DRY_RUN) {
    writeFileSync(OUTPUT_FILE, JSON.stringify(deduped, null, 2));
    console.log(
      `[extract] wrote ${OUTPUT_FILE}\n` +
      `[extract] Review it, then import WITHOUT re-running the extraction:\n` +
      `[extract]   npm run wing:extract-heuristics -- --from-json`,
    );
    await pool.end();
    return;
  }

  let inserted = 0;
  let skipped = 0;

  // Loaded once and extended as we go. Querying per card would miss codes
  // allocated earlier in this same run, and two cards in one batch that slug
  // identically would collide on the unique index.
  const takenCodes = new Set(
    (await db.select({ code: heuristics.cardCode }).from(heuristics)).map((r) => r.code),
  );

  for (const card of deduped) {
    const name = `${card.name} (${card.source.populationTag})`;

    const [existing] = await db
      .select({ id: heuristics.id })
      .from(heuristics)
      .where(eq(heuristics.name, name))
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    const [created] = await db
      .insert(heuristics)
      .values({
        cardCode: (() => {
          const c = uniqueCode(codeFromName(name), takenCodes);
          takenCodes.add(c);
          return c;
        })(),
        name,
        description: card.description,
        populationTags: [card.source.populationTag],
        // Candidate, and deliberately NOT added to any sequence. Inert until
        // the methodology owner reviews it and publishes it into one.
        status: "candidate",
      })
      .returning({ id: heuristics.id });

    const components: Array<{ componentType: any; content: string }> = [
      { componentType: "signal", content: card.signal },
      { componentType: "intervention", content: card.intervention },
      { componentType: "coaching_move", content: card.coaching_move },
      { componentType: "outcome", content: card.outcome },
    ];

    if (card.module_mapping) {
      components.push({ componentType: "module_mapping", content: card.module_mapping });
    }

    components.push({
      componentType: "population_context",
      content: `${card.source.surface}, ${card.source.populationTag} prompt set.`,
    });

    // Provenance. Without this a reviewer cannot tell an accurate extraction
    // from a confident invention, which would make the whole batch untrustworthy.
    //
    // The model's self-reported confidence is deliberately NOT recorded: it
    // came back at >=0.9 for 252 of 253 cards, so it carries no information
    // and printing it would imply a discrimination that does not exist.
    const artifactScoped = ARTIFACT_SIGNAL.test(card.signal ?? "");

    components.push({
      componentType: "notes",
      content: [
        "EXTRACTED — NOT YET REVIEWED.",
        `Source: ${card.source.file}, lines ${card.lines}`,
        "",
        "Verbatim from the source:",
        card.sourceQuote ? `"${card.sourceQuote}"` : "(no quote captured)",
        "",
        ...(artifactScoped
          ? [
              "⚠ SCOPE: this signal describes an ARTIFACT (a profile, a draft, a",
              "plan) rather than something the student says in conversation. The",
              "engine evaluates spoken turns only, so as written this card will",
              "never fire. The coaching content is still worth keeping — either",
              "rewrite the signal in terms of what the student SAYS, or leave it",
              "for when artifact review exists.",
              "",
            ]
          : []),
        "This card was produced by an automated pass over the MVP prompt files.",
        "Check it against the source before promoting it, and edit freely — the",
        "extraction is a starting point, not an authority.",
      ].join("\n"),
    });

    await db.insert(heuristicComponents).values(
      components.map((c) => ({
        heuristicId: created.id,
        componentType: c.componentType,
        content: c.content,
        isCurrent: true,
      })),
    );

    inserted++;
    console.log(`  + ${name}`);
  }

  console.log(
    `\n[extract] ${inserted} card(s) inserted, ${skipped} already existed.\n` +
      `[extract] All are 'candidate' and in NO sequence — nothing reaches a\n` +
      `[extract] student until they are reviewed and published deliberately.`,
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error("[extract] failed:", err);
  await pool?.end().catch(() => {});
  process.exit(1);
});

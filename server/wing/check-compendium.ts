import { readFileSync, writeFileSync } from "node:fs";
import { isTier1, parseCompendium, type ParsedCard } from "./parse-compendium";

/**
 * Reviews the compendium and writes the parsed cards to JSON.
 *
 * Run:  npm run wing:check-compendium
 *
 * ── WHY THIS RUNS BEFORE ANYTHING IS SEEDED ──────────────────────────────
 * 184 cards is more methodology than anyone can proofread, and the document
 * contradicts itself in places its own author has not seen — two cards sharing
 * an ID, a count table that disagrees with the body, six universal gates whose
 * numbers differ only by a leading zero. Every one of those was found by
 * running this, not by reading.
 *
 * So this prints the review artefact that goes back to Danielle alongside the
 * questions. The numbers are more persuasive than the questions.
 *
 * It touches no database. Seeding is a separate, later, deliberate step, and it
 * cannot happen until `heuristic_component_type` gains the four v2 components
 * the enum is missing — see WING_TIER1_SCOPE.md T2.
 */

const SOURCE = "methodology/wing-master-module-compendium-v2.md";
const OUTPUT = "compendium-cards.json";

const result = parseCompendium(readFileSync(SOURCE, "utf8"));
const tier1 = result.cards.filter(isTier1);

function heading(s: string) {
  console.log(`\n${s}\n${"─".repeat(s.length)}`);
}

function tally<T>(items: T[], key: (t: T) => string): Array<[string, number]> {
  const counts: Record<string, number> = {};
  for (const i of items) counts[key(i)] = (counts[key(i)] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

console.log(`\nWing Master Module Compendium v2 — ${SOURCE}`);

heading("Inventory");
console.log(`  distinct card codes        ${result.cards.length}`);
console.log(`  + collided bodies          ${result.collisions.length}`);
console.log(`  = distinct specifications  ${result.cards.length + result.collisions.length}`);
console.log(`  duplicates dropped         ${result.duplicates.length}`);
console.log(`  in Tier 1 scope            ${tier1.length}`);
console.log(
  `\n  The compendium's own master count table says 180 and Danielle's final\n` +
    `  email says 199. Both are hand-maintained. See "Defects" below.`,
);

heading("Cards per module");
for (const [module, n] of tally(result.cards, (c) => c.module)) {
  const inScope = tier1.filter((c) => c.module === module).length;
  const note = inScope === n ? "Tier 1" : inScope > 0 ? `${inScope} in Tier 1` : "deferred";
  console.log(`  ${module.padEnd(18)} ${String(n).padStart(3)}   ${note}`);
}

heading("Card kinds");
for (const [kind, n] of tally(result.cards, (x) => x.cardKind)) {
  const inScope = tier1.filter((x) => x.cardKind === kind).length;
  console.log(`  ${kind.padEnd(16)} ${String(n).padStart(3)}   ${inScope} in Tier 1`);
}
console.log(
  `\n  A gate fires on Wing's OWN OUTPUT, so it must never enter the detector\n` +
    `  catalogue. heuristics had no column for this before migration 0019 —\n` +
    `  status is a lifecycle, not a kind.`,
);

if (result.kindDisagreements.length) {
  console.log(`\n  ${result.kindDisagreements.length} cards disagree with themselves about kind:`);
  for (const d of result.kindDisagreements) {
    console.log(
      `    ${d.cardCode.padEnd(9)} declares ${String(d.interventionType).padEnd(6)} ` +
        `under "${d.heading.slice(0, 44)}"`,
    );
  }
  console.log(`    All resolved to integrity_gate. H-916 is the one that matters — see below.`);
}

heading("Population tags");
for (const [tag, n] of Object.entries(result.populationTags).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tag.padEnd(24)} ${String(n).padStart(3)} cards`);
}
console.log(
  `\n  Nothing resolves these at runtime today — getSequenceCards filters on\n` +
    `  sequence and status only, so every card enters the catalogue for every\n` +
    `  student. And professional_status has four values, so it cannot produce\n` +
    `  executive, entrepreneur, mid_career_pivot or mid_career_advancement.`,
);

heading("Intervention types");
for (const [type, n] of Object.entries(result.interventionTypes).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type.padEnd(12)} ${String(n).padStart(3)}`);
}
console.log(`\n  GATE is not in the six-value list the earlier inventory reported.`);

heading("Sequence weights");
for (const [w, n] of tally(result.cards, (c) => String(c.weight ?? "none stated"))) {
  console.log(`  ${w.padEnd(12)} ${String(n).padStart(3)} cards`);
}
const tier1NoWeight = tier1.filter((c) => c.weight === null);
console.log(
  `\n  ${tier1NoWeight.length} of ${tier1.length} Tier 1 cards state no weight. Defaulting them to 1.0 is a\n` +
    `  guess about precedence, so they are listed rather than filled in:`,
);
console.log(`  ${tier1NoWeight.map((c) => c.cardCode).join(", ")}`);

heading("Defects needing a methodology decision");

console.log("\n  1. ID collisions — two cards, one number, twice over");
for (const c of result.collisions) {
  const kept = result.cards.find((x) => x.cardCode === c.cardCode)!;
  console.log(`     ${c.cardCode}  line ${c.firstSeenLine}: ${kept.name}`);
  console.log(`     ${" ".repeat(c.cardCode.length)}  line ${c.line}: a different card with the same ID`);
}

console.log("\n  2. Six universal gates, three ambiguous IDs");
console.log("     The master count table says Modules 10 and 11 share IG-U003–U005.");
console.log("     They do not — these are six different gates:");
for (const code of ["IG-U003", "IG-U004", "IG-U005", "IG-U03", "IG-U04", "IG-U05"]) {
  const card = result.cards.find((c) => c.cardCode === code);
  if (card) console.log(`       ${code.padEnd(8)} ${card.name}`);
}
console.log("     Three pairs differing only by a leading zero, all universal, all Tier 1.");

console.log("\n  3. H-916 Experiment Safety Check declares COACH, not a gate type");
console.log("     It sits under \"Source Integrity → Codeable Quality Gates\" and is the");
console.log("     gate that checks a power experiment is safe to assign. Module 9 is the");
console.log("     only module that tells a user to change their behaviour at work this");
console.log("     week. Classified as a gate here on the strength of its filing, but the");
console.log("     intervention_type field should be corrected in the source.");

console.log("\n  4. Numbering gaps — reserved, or dropped in consolidation?");
console.log(`     ${result.numberingGaps.join(", ")}`);

if (result.moduleMismatches.length) {
  console.log("\n  5. Filed under a heading that disagrees with the card number");
  for (const m of result.moduleMismatches) {
    console.log(`     ${m.cardCode.padEnd(8)} number says ${m.fromCode.padEnd(12)} heading says "${m.heading}"`);
  }
  console.log("     Not necessarily wrong — but it decides their tier, so it needs confirming.");
}

heading("Tier 1 scope");
const byModule = new Map<string, ParsedCard[]>();
for (const c of tier1) {
  if (!byModule.has(c.module)) byModule.set(c.module, []);
  byModule.get(c.module)!.push(c);
}
for (const [module, cards] of Array.from(byModule.entries()).sort()) {
  console.log(`\n  ${module}  (${cards.length})`);
  for (const c of cards) {
    console.log(
      `    ${c.cardCode.padEnd(8)} w=${String(c.weight ?? "—").padEnd(4)} ` +
        `${(c.interventionType ?? "—").padEnd(10)} ${c.name.slice(0, 56)}`,
    );
  }
}

writeFileSync(
  OUTPUT,
  JSON.stringify(
    {
      source: SOURCE,
      parsedCards: result.cards.length,
      tier1Cards: tier1.length,
      cards: result.cards.map((c) => ({ ...c, tier1: isTier1(c) })),
      defects: {
        collisions: result.collisions,
        duplicates: result.duplicates,
        incomplete: result.incomplete,
        missingWeight: result.missingWeight,
        moduleMismatches: result.moduleMismatches,
        numberingGaps: result.numberingGaps,
      },
    },
    null,
    2,
  ),
);

console.log(
  `\n\nWrote ${OUTPUT} — ${result.cards.length} cards, ${tier1.length} flagged tier1.`,
);
console.log("No database writes. Seeding waits on the four missing component types.\n");

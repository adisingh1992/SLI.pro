import { readFileSync } from "node:fs";
import { REGISTRY_SOURCE, compareCodes, parseRegistry } from "./parse-registry";
import { parseCompendium } from "./parse-compendium";
import { INTAKE_SOURCE, MODULE13_SOURCE, parseIntake } from "./parse-intake";
import { REVEAL_CYCLE_SOURCE, parseRevealCycle } from "./parse-reveal-cycle";
import { PLATFORM_UPDATES_SOURCE, parsePlatformUpdates } from "./parse-platform-updates";
import { RESEARCH_GATES_SOURCE, parseResearchGates } from "./parse-research-gates";
import { parseContentSystem } from "./parse-content-system";

/**
 * Derives the expected element checklist from Doc 2, and says what can supply it.
 *
 * Run:  npm run wing:registry
 *
 * ── WHAT THIS ANSWERS ────────────────────────────────────────────────────
 * Two questions, and it is careful to keep them apart.
 *
 *   1. WHAT IS THE CHECKLIST?  Doc 2 states 329. Its own rows add to more than
 *      that, and some of its cells name counts without naming codes. This
 *      prints the derived list, the arithmetic, and every place the document
 *      disagrees with itself — so the number can be agreed before anything is
 *      measured against it.
 *
 *   2. WHAT COULD WE ACTUALLY SEED TODAY?  For every expected code, whether a
 *      parser in this repo produces a specification for it. A code with no
 *      parser is not a bug in the seeder; it is a document we have not been
 *      sent or a parser nobody has written, and those are different problems
 *      with different owners.
 *
 * Touches no database. Writes nothing. It is the step that happens before the
 * one that writes.
 */

const registryText = readFileSync(REGISTRY_SOURCE, "utf8");
const registry = parseRegistry(registryText);

const COMPENDIUM_SOURCE = "methodology/wing-master-module-compendium-v2.md";
const CONTENT_SYSTEM_SOURCE = "methodology/wing-content-system-v1.md";

/* ── What the repo can parse today ───────────────────────────────────────── */

const compendium = parseCompendium(readFileSync(COMPENDIUM_SOURCE, "utf8"));
const intake = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));
const research = parseResearchGates(readFileSync(RESEARCH_GATES_SOURCE, "utf8"));
const content = parseContentSystem(readFileSync(CONTENT_SYSTEM_SOURCE, "utf8"));
const module13 = parseIntake(readFileSync(MODULE13_SOURCE, "utf8"), {
  expectedModule: "module_13",
});
const reveal = parseRevealCycle(readFileSync(REVEAL_CYCLE_SOURCE, "utf8"));
const platform = parsePlatformUpdates(readFileSync(PLATFORM_UPDATES_SOURCE, "utf8"));

/** code → the parser that produces a spec for it. First writer wins, and the
 *  order is deliberate: a module document is a better source than the master
 *  compendium for the same code, because it is newer. */
const supply = new Map<string, string>();
function offer(codes: string[], source: string) {
  for (const code of codes) if (!supply.has(code)) supply.set(code, source);
}

offer(intake.cards.map((c) => c.cardCode), "intake v1.8");
offer(intake.gates.map((g) => g.cardCode), "intake v1.8");
offer(research.universalGates.map((g) => g.cardCode), "research-derived gates");
offer(research.moduleGates.map((g) => g.cardCode), "research-derived gates");
offer(content.cards.map((c) => c.cardCode), "content system v1");
offer(content.gates.map((g) => g.cardCode), "content system v1");
offer(module13.cards.map((c) => c.cardCode), "module 13 v1.2");
offer(module13.gates.map((g) => g.cardCode), "module 13 v1.2");
offer(reveal.cards.map((c) => c.cardCode), "reveal cycle v4");
offer(platform.gates.map((g) => g.cardCode), "platform updates");
// Named by their document but carrying no component table — IG-RC11 (non-firing
// standing rule) and IG-RC12 (retired into IG-S03, number retained). Offered so
// the coverage report does not call them unsourced, tagged so nothing mistakes
// them for full specifications.
offer(reveal.specified, "reveal cycle v4 (code only)");
offer(compendium.cards.map((c) => c.cardCode), "compendium v2");

/* ── Report ──────────────────────────────────────────────────────────────── */

const heading = (s: string) => console.log(`\n${s}\n${"─".repeat(s.length)}`);

console.log(`\nDoc 2 element registry — ${REGISTRY_SOURCE}`);

heading("The arithmetic");
console.log(`  Appendix B states                ${registry.statedTotal ?? "—"}`);
console.log(`  Sum of its own per-row counts    ${registry.summedStatedCounts}`);
console.log(`  Distinct codes it actually names ${registry.elements.length}`);
console.log(`  Codes claimed by more than one row ${registry.duplicates.length}`);
const holes = registry.rows.flatMap((r) => r.unexpressed);
console.log(`  Cells naming a count but no codes  ${holes.length}`);
console.log(
  `\n  ${registry.summedStatedCounts} − ${registry.elements.length} = ` +
    `${registry.summedStatedCounts - registry.elements.length} elements counted twice or ` +
    `never written down. The checklist is the distinct list, not the sum.`,
);

heading("Rows whose stated count disagrees with their own cell");
if (!registry.countMismatches.length) console.log("  none");
for (const m of registry.countMismatches) {
  console.log(
    `  line ${String(m.line).padStart(4)}  ${m.component.padEnd(34)} ` +
      `states ${String(m.stated).padStart(3)}, expands to ${String(m.expanded).padStart(3)}` +
      (m.unexpressed.length ? `   unexpressed: ${m.unexpressed.join(" · ")}` : ""),
  );
}

heading("Codes claimed by more than one row");
if (!registry.duplicates.length) console.log("  none");
for (const d of registry.duplicates) {
  console.log(`  ${d.code.padEnd(12)} ${d.claimants.join("  ·  ")}`);
}

heading("What could be seeded today, by source");
const bySource = new Map<string, string[]>();
for (const el of registry.elements) {
  const src = supply.get(el.code) ?? "NO PARSER";
  const list = bySource.get(src) ?? [];
  list.push(el.code);
  bySource.set(src, list);
}
for (const [src, codes] of Array.from(bySource.entries()).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${src.padEnd(26)} ${String(codes.length).padStart(4)}`);
}

heading("Expected, but no parser in this repo produces it");
const uncovered = (bySource.get("NO PARSER") ?? []).sort(compareCodes);
if (!uncovered.length) console.log("  none");
else {
  const byPrefix = new Map<string, string[]>();
  for (const code of uncovered) {
    const prefix = /^([A-Za-z][A-Za-z0-9-]*?)\d+$/.exec(code)?.[1] ?? "?";
    const list = byPrefix.get(prefix) ?? [];
    list.push(code);
    byPrefix.set(prefix, list);
  }
  for (const [prefix, codes] of Array.from(byPrefix.entries()).sort()) {
    console.log(`  ${prefix.padEnd(10)} ${String(codes.length).padStart(3)}   ${codes.join(", ")}`);
  }
}

heading("Parsed by this repo, but Doc 2's registry never names it");
const expected = new Set(registry.elements.map((e) => e.code));
const surplus = Array.from(supply.keys()).filter((c) => !expected.has(c)).sort(compareCodes);
console.log(`  ${surplus.length} codes`);
if (surplus.length) console.log(`  ${surplus.join(", ")}`);

heading("Section 1 module registry, cross-check");
for (const m of registry.moduleRegistry) {
  const parts = [m.cards, m.gates, m.exercises].map((n) => n ?? 0);
  const sum = parts.reduce((a, b) => a + b, 0);
  const flag = m.total !== null && sum !== m.total ? `  ✗ parts ${sum} ≠ total ${m.total}` : "";
  console.log(
    `  ${m.key.padEnd(5)} ${m.module.slice(0, 38).padEnd(40)} ` +
      `cards ${String(m.cards ?? "—").padStart(3)}  gates ${String(m.gates ?? "—").padStart(3)}  ` +
      `ex ${String(m.exercises ?? "—").padStart(3)}  total ${String(m.total ?? "—").padStart(3)}${flag}`,
  );
}

heading("Defects");
if (!registry.defects.length) console.log("  none");
for (const d of registry.defects) console.log(`  · ${d}`);

console.log("");

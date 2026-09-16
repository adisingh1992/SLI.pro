import { readFileSync } from "node:fs";
import {
  REGISTRY_SOURCE,
  RESERVED_CODES,
  RETIRED_CODES,
  compareCodes,
  parseRegistry,
} from "./parse-registry";
import { parseCompendium } from "./parse-compendium";
import { INTAKE_SOURCE, MODULE13_SOURCE, parseIntake } from "./parse-intake";
import { RESEARCH_GATES_SOURCE, parseResearchGates } from "./parse-research-gates";
import { parseContentSystem } from "./parse-content-system";
import { REVEAL_CYCLE_SOURCE, parseRevealCycle } from "./parse-reveal-cycle";
import { PLATFORM_UPDATES_SOURCE, parsePlatformUpdates } from "./parse-platform-updates";
import { SAFETY_GATES_WITHOUT_SOURCE, deriveSafetyGates } from "./derive-safety-gates";

/**
 * Derives the expected element checklist from Doc 2, and says what supplies it.
 *
 * Run:  npm run wing:registry
 *
 * ── WHAT THIS ANSWERS ────────────────────────────────────────────────────
 * Two questions, kept apart on purpose.
 *
 *   1. WHAT IS THE CHECKLIST?  Doc 2 states 329. Its own rows add to 362, and
 *      two of its cells name a count without naming codes. This prints the
 *      derived list, the arithmetic, and every place the document disagrees
 *      with itself, so the number can be agreed before anything is measured
 *      against it.
 *
 *   2. CAN EVERY ELEMENT BE SOURCED?  For each expected code: a parser, a
 *      derivation from code, or a declared status (retired, reserved, or
 *      known-absent with its reason). Anything that is none of those is
 *      OUTSTANDING, and the script exits non-zero while any remain.
 *
 * ── WHY IT EXITS NON-ZERO ────────────────────────────────────────────────
 * This is the gate in front of seeding. A seed run against a checklist with
 * holes in it produces a library that looks complete and is not, and the way
 * that surfaces is six weeks later when Danielle cannot find a card she is sure
 * she wrote. An outstanding code is either a document nobody sent us or a
 * parser nobody wrote, and both have an owner. Neither is something to discover
 * after the insert.
 *
 * It is deliberately NOT in `npm test`. A test suite asserts that the code is
 * correct; this asserts that the methodology is completely delivered, which is
 * a different question with a different owner, and wiring it into the test
 * chain would make an unanswered email look like a broken build.
 *
 * Touches no database. Writes nothing.
 */

const registry = parseRegistry(readFileSync(REGISTRY_SOURCE, "utf8"));

const COMPENDIUM_SOURCE = "methodology/wing-master-module-compendium-v2.md";
const CONTENT_SYSTEM_SOURCE = "methodology/wing-content-system-v1.md";

/* ── What the repo can source today ──────────────────────────────────────── */

const compendium = parseCompendium(readFileSync(COMPENDIUM_SOURCE, "utf8"));
const intake = parseIntake(readFileSync(INTAKE_SOURCE, "utf8"));
const research = parseResearchGates(readFileSync(RESEARCH_GATES_SOURCE, "utf8"));
const content = parseContentSystem(readFileSync(CONTENT_SYSTEM_SOURCE, "utf8"));
const module13 = parseIntake(readFileSync(MODULE13_SOURCE, "utf8"), {
  expectedModule: "module_13",
});
const reveal = parseRevealCycle(readFileSync(REVEAL_CYCLE_SOURCE, "utf8"));
const platform = parsePlatformUpdates(readFileSync(PLATFORM_UPDATES_SOURCE, "utf8"));
const safety = deriveSafetyGates();

/**
 * code → what supplies it. First writer wins, and the order is deliberate: a
 * module document beats the master compendium for the same code, because it is
 * newer.
 */
const supply = new Map<string, string>();
function offer(codes: string[], source: string) {
  for (const code of codes) if (!supply.has(code)) supply.set(code, source);
}

offer(intake.cards.map((c) => c.cardCode), "intake v1.8");
offer(intake.gates.map((g) => g.cardCode), "intake v1.8");
offer(module13.cards.map((c) => c.cardCode), "module 13 v1.2");
offer(module13.gates.map((g) => g.cardCode), "module 13 v1.2");
offer(reveal.cards.map((c) => c.cardCode), "reveal cycle v4");
offer(platform.gates.map((g) => g.cardCode), "platform updates");
offer(research.universalGates.map((g) => g.cardCode), "research-derived gates");
offer(research.moduleGates.map((g) => g.cardCode), "research-derived gates");
offer(content.cards.map((c) => c.cardCode), "content system v1");
offer(content.gates.map((g) => g.cardCode), "content system v1");
offer(safety.map((g) => g.cardCode), "safety-rules.ts (code)");
offer(compendium.cards.map((c) => c.cardCode), "compendium v2");
// Named by their document but carrying no component table — IG-RC11 (non-firing
// standing rule) and IG-RC12 (retired into IG-S03, number retained).
offer(reveal.specified, "reveal cycle v4 (code only)");

/** Declared statuses: real answers, not sources. */
const declared = new Map<string, string>();
for (const [code, why] of Object.entries(RETIRED_CODES)) declared.set(code, `retired · ${why}`);
for (const [code, why] of Object.entries(RESERVED_CODES)) declared.set(code, `reserved · ${why}`);
for (const [code, why] of Object.entries(SAFETY_GATES_WITHOUT_SOURCE)) {
  declared.set(code, `no source · ${why}`);
}

/* ── Report ──────────────────────────────────────────────────────────────── */

const heading = (s: string) => console.log(`\n${s}\n${"─".repeat(s.length)}`);

console.log(`\nDoc 2 element registry — ${REGISTRY_SOURCE}`);

heading("The arithmetic");
console.log(`  Appendix B states                   ${registry.statedTotal ?? "—"}`);
console.log(`  Sum of its own per-row counts       ${registry.summedStatedCounts}`);
console.log(`  Distinct codes it actually names    ${registry.elements.length}`);
console.log(`  Codes claimed by more than one row  ${registry.duplicates.length}`);
const holes = registry.rows.flatMap((r) => r.unexpressed);
console.log(`  Cells naming a count but no codes   ${holes.length}`);
console.log(
  `\n  ${registry.summedStatedCounts} − ${registry.elements.length} = ` +
    `${registry.summedStatedCounts - registry.elements.length} counted twice or never written ` +
    `down. The checklist is the distinct list, not the sum.`,
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

heading("Where each expected element comes from");
const bySource = new Map<string, string[]>();
const outstanding: string[] = [];
for (const el of registry.elements) {
  const src = supply.get(el.code);
  if (src) {
    (bySource.get(src) ?? bySource.set(src, []).get(src)!).push(el.code);
    continue;
  }
  const status = declared.get(el.code);
  if (status) {
    const key = `declared · ${status.split(" · ")[0]}`;
    (bySource.get(key) ?? bySource.set(key, []).get(key)!).push(el.code);
    continue;
  }
  outstanding.push(el.code);
}
for (const [src, codes] of Array.from(bySource.entries()).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${src.padEnd(30)} ${String(codes.length).padStart(4)}`);
}
console.log(`  ${"OUTSTANDING".padEnd(30)} ${String(outstanding.length).padStart(4)}`);

heading("Outstanding — no parser, no derivation, no declared status");
if (!outstanding.length) console.log("  none · every expected element resolves");
else {
  const byPrefix = new Map<string, string[]>();
  for (const code of outstanding.sort(compareCodes)) {
    const prefix = /^([A-Za-z][A-Za-z0-9-]*?)\d+$/.exec(code)?.[1] ?? "?";
    (byPrefix.get(prefix) ?? byPrefix.set(prefix, []).get(prefix)!).push(code);
  }
  for (const [prefix, codes] of Array.from(byPrefix.entries()).sort()) {
    console.log(`  ${prefix.padEnd(10)} ${String(codes.length).padStart(3)}   ${codes.join(", ")}`);
  }
}

heading("Declared rather than sourced");
for (const [code, why] of Array.from(declared.entries()).sort((a, b) => compareCodes(a[0], b[0]))) {
  if (!registry.elements.some((e) => e.code === code)) continue;
  console.log(`  ${code.padEnd(10)} ${why.slice(0, 96)}`);
}

heading("Parsed by this repo, but Doc 2's registry never names it");
const expected = new Set(registry.elements.map((e) => e.code));
const surplus = Array.from(supply.keys()).filter((c) => !expected.has(c)).sort(compareCodes);
console.log(`  ${surplus.length} codes`);
if (surplus.length) console.log(`  ${surplus.join(", ")}`);

heading("Section 1 module registry, cross-check");
for (const m of registry.moduleRegistry) {
  const sum = [m.cards, m.gates, m.exercises].reduce<number>((a, b) => a + (b ?? 0), 0);
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

if (outstanding.length) {
  console.log(
    `\n✗ ${outstanding.length} of ${registry.elements.length} expected elements cannot be ` +
      `sourced. Seeding is blocked until each one has a parser, a derivation, or a declared ` +
      `status with its reason.\n`,
  );
  process.exit(1);
}

console.log(`\n✓ all ${registry.elements.length} expected elements resolve to a source or a declared status.\n`);

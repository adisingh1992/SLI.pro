import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  TIERS_ON,
  scanDocument,
  tally,
  type ClaimHit,
  type ClaimTier,
} from "./population-claims";

/**
 * Reports every unsourced population claim in the methodology documents, and fails
 * if the count has gone up.
 *
 *     npm run wing:check-claims              report and ratchet
 *     npm run wing:check-claims -- --tiers   break the count down per tier
 *
 * Reads files. Writes nothing, touches no database.
 *
 * ── WHY A RATCHET AND NOT A ZERO ─────────────────────────────────────────
 * There are 195 claims in the corpus today and they are not ours to remove — they are
 * the methodology author's copy, and IG-RC13 permits some constructions that look
 * like the ones it bans. Failing the build on all 195 would mean either editing her
 * copy without asking or switching the check off, and the second one always wins.
 *
 * So the baseline is per document and the rule is that it may only fall. A new
 * document arrives at zero and has to stay there. A revision of an existing one
 * cannot introduce a claim without the number moving, and when she rules on the
 * borderline cases the numbers come down and the baseline comes down with them.
 *
 * ── THE TIERS ────────────────────────────────────────────────────────────
 * All three are enforced as of the author's 24 August ruling — yes to prevalence
 * adverbs about people, yes to "at your stage, X is normal" — with the one carve-out
 * she drew herself: a prevalence adverb describing a WORD is an observation, not a
 * base rate, so RT-11's line about "should" is not a hit.
 *
 * 195 enforced across the live corpus, most of it copy that ships as written. `--tiers` breaks the
 * count down per tier, which is what a narrowing ruling would move.
 */

const BASELINE: Record<string, number> = {
  "wing-intake-change-note-v1.7.md": 0,
  "wing-intake-data-migration-v2.md": 0,
  "wing-intake-design-v3.3.md": 4,
  "wing-intake-heuristic-cards-v1.8.md": 43,
  "wing-master-module-compendium-v2.md": 124,
  "TRANSCRIBED.md": 0,
  /*
   * H-111's failure_path, in the card she sent on 24 August: "Most people operate in more
   * than one function." An unsourced population claim in fresh material, which is the
   * linter finding something rather than reporting history. Baselined at 1 so it cannot
   * grow, and it goes on the correction list.
   */
  "wing-missing-references-aug24.md": 1,
  "wing-module13-heuristic-cards-v1.2.md": 14,
  "wing-platform-updates-aug19.md": 0,
  "wing-research-derived-gates.md": 5,
  "wing-reveal-cycle-v4-amendments.md": 0,
  "wing-reveal-cycle-v4-canonical.md": 5,
  "wing-self-description-capture-v2.md": 0,
};

/**
 * Superseded documents. Reported, never ratcheted.
 *
 * v1.1 and v1.7 are frozen history — v1.8 replaced them and nobody will edit them
 * again. Their combined 100 claims are real but unfixable, and a ratchet that can
 * only ever report the same 100 numbers is a ratchet people learn to skim. The live
 * corpus is what has to hold.
 */
const SUPERSEDED = new Set([
  "wing-intake-heuristic-cards-v1.1.md",
  "wing-intake-heuristic-cards-v1.7.md",
]);

const ALL_TIERS: ClaimTier[] = ["unsourced", "prevalence", "stage_norm"];

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

function show(hits: readonly ClaimHit[]) {
  const order = ["copy", "instruction", "notes", "analysis"];
  for (const kind of order) {
    const of = hits.filter((h) => h.kind === kind);
    if (!of.length) continue;
    if (kind === "analysis") {
      console.log(`      ${of.length} in prose that is not copy — not counted`);
      continue;
    }
    for (const h of of) {
      console.log(
        `      ${h.kind === "copy" ? red("copy") : h.kind.padEnd(11)}` +
          `${h.kind === "copy" ? "        " : " "}${(h.locator.code ?? "—").padEnd(9)}` +
          `${h.locator.where.slice(0, 20).padEnd(21)}${JSON.stringify(h.phrase)}`,
      );
      console.log(`        ${h.context.slice(0, 140)}`);
    }
  }
}

function main() {
  const dir = join(process.cwd(), "methodology");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  console.log(`\n${bold("IG-RC13 — unsourced population claims")}`);
  console.log(`  tiers enforced: ${TIERS_ON.join(", ")}`);

  let regressions = 0;
  let unbaselined = 0;
  let enforcedTotal = 0;

  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    const hits = scanDocument(text, TIERS_ON);
    const t = tally(hits);
    if (!SUPERSEDED.has(f)) enforcedTotal += t.enforced;

    if (SUPERSEDED.has(f)) {
      console.log(`\n  ${bold(f)}`);
      console.log(`    ${t.enforced} — superseded, not ratcheted`);
      continue;
    }

    const base = BASELINE[f];
    const known = base !== undefined;
    if (!known) unbaselined++;

    const verdict = !known
      ? red(`${t.enforced} — not in the baseline, add it`)
      : t.enforced > base
        ? red(`${t.enforced}, was ${base} — went UP`)
        : t.enforced < base
          ? green(`${t.enforced}, was ${base} — came down, lower the baseline`)
          : `${t.enforced}`;

    if (known && t.enforced > base) regressions++;

    console.log(`\n  ${bold(f)}`);
    console.log(`    enforced: ${verdict}`);
    if (hits.length) show(hits);
  }

  console.log(`\n  ${enforcedTotal} enforced across ${files.length} document(s)`);

  for (const f of Object.keys(BASELINE)) {
    if (files.indexOf(f) < 0) {
      console.log(
        `  ${red("!")} ${f} is in the baseline but not on disk — a renamed document ` +
          "silently drops its claims out of the ratchet",
      );
      regressions++;
    }
  }

  if (process.argv.indexOf("--tiers") >= 0) {
    /*
     * Which tier each hit came from. Useful because a narrowing ruling — "actually
     * keep the stage norms" — moves one of these three numbers and nothing else, so
     * this is the report to read before changing TIERS_ON.
     */
    console.log(`\n${bold("Enforced hits by tier")}`);
    const perTier: Record<string, number> = {};
    for (const f of files) {
      for (const h of scanDocument(readFileSync(join(dir, f), "utf8"), ALL_TIERS)) {
        if (h.kind !== "copy" && h.kind !== "instruction") continue;
        perTier[h.tier] = (perTier[h.tier] ?? 0) + 1;
      }
    }
    for (const tier of ALL_TIERS) {
      console.log(`  ${tier.padEnd(14)}${perTier[tier] ?? 0}`);
    }
    console.log(
      "\n  Removing a tier lowers the count by its line here. Change TIERS_ON and the\n" +
        "  baseline together, in one commit.",
    );
  }

  if (unbaselined || regressions) {
    console.log(
      `\n${red("FAIL")} — ${regressions} regression(s), ${unbaselined} document(s) not baselined\n`,
    );
    process.exit(1);
  }
  console.log(`\n${green("ok")} — nothing above its baseline\n`);
}

main();

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TIERS_ON, scanDocument, tally, type ClaimHit } from "./population-claims";

/**
 * Turns the 195 flagged claims into something the methodology author can actually
 * answer.
 *
 *     npm run wing:report-claims                 write methodology-review/claims.md
 *     npm run wing:report-claims -- --out FILE   somewhere else
 *
 * Reads files. Writes one markdown file. Touches no database and edits no document.
 *
 * ── WHY THIS IS NOT THE SAME AS `wing:check-claims` ──────────────────────
 * `check-claims` is the ratchet. It answers "has the number gone up", it prints per
 * card, and it is for us. Handing its output to Danielle would be handing her 195
 * lines sorted by where they happen to live, which is 195 decisions.
 *
 * They are not 195 decisions. The same handful of phrases repeat across the corpus —
 * "usually", "most people", "at your stage" — so grouping by the matched phrase turns
 * it into roughly a dozen decisions, each of which she can make once and have applied
 * everywhere. That is the difference between a list she replies to this week and a
 * list she puts off.
 *
 * ── THE FIX SHAPES COME FROM HER OWN GATE ────────────────────────────────
 * IG-RC13 bans frequency claims about a population Wing has no data on, and explicitly
 * permits unquantified pattern language: "Some people find that…". So the fix for most
 * of these is not a rewrite, it is a deletion or a swap, and both are shapes rather
 * than new copy. Where the shape is obvious this file proposes one. Where it is not, it
 * says so rather than inventing her words.
 *
 * ── SUPERSEDED DOCUMENTS ARE LEFT OUT ────────────────────────────────────
 * Intake cards v1.1 and v1.7 carry about a hundred claims between them and nobody will
 * ever edit either again — v1.8 replaced both. Including them would inflate the ask by
 * half with work that cannot be done.
 */

const SUPERSEDED = new Set([
  "wing-intake-heuristic-cards-v1.1.md",
  "wing-intake-heuristic-cards-v1.7.md",
]);

/**
 * The three shapes, in the order they apply. Every one is either a deletion or a swap
 * for language IG-RC13 already permits.
 */
type FixShape = "delete_adverb" | "unquantified" | "user_data" | "needs_her";

const SHAPES: Record<FixShape, { title: string; how: string }> = {
  delete_adverb: {
    title: "Delete the word",
    how: "The sentence works without it. \"That usually means you're ready\" becomes \"That means you're ready\". No new copy, and nothing is claimed about anyone else.",
  },
  unquantified: {
    title: "Swap for unquantified pattern language",
    how: "IG-RC13 permits this explicitly. \"Most people who say I don't know actually do know\" becomes \"Some people who say that do know\". The observation survives, the base rate goes.",
  },
  user_data: {
    title: "Point at the user's own data instead",
    how: "IG-RC13's own example: \"You've mentioned this three times across our sessions\". Only available where Wing actually holds the data, so this one is rarely the answer at intake.",
  },
  needs_her: {
    title: "Needs her",
    how: "The claim is load-bearing in the sentence, so removing it changes what the card does. We would rather not guess.",
  },
};

/**
 * Which shape a phrase takes.
 *
 * A bare frequency adverb can almost always just go. A phrase that names a population
 * ("most people", "everyone your age") is carrying the meaning of the sentence, so it
 * needs the swap or her. Stage norms are the ones where the whole clause is the claim.
 */
function shapeFor(phrase: string, tier: string): FixShape {
  const p = phrase.toLowerCase().trim();
  if (/^(?:usually|often|typically|generally|frequently|commonly|rarely|normally)$/.test(p)) {
    return "delete_adverb";
  }
  if (tier === "stage_norm") return "needs_her";
  if (/\b(?:people|everyone|nobody|no one|most|majority|folks|students|professionals)\b/.test(p)) {
    return "unquantified";
  }
  return "needs_her";
}

/**
 * What each tier is objecting to. The rules' own `what` field is sometimes just the
 * matched word, which tells a reader nothing, so it is only used when it differs from
 * the phrase.
 */
const TIER_WHY: Record<string, string> = {
  unsourced:
    "states how common something is among people Wing has no data about",
  prevalence:
    "a frequency adverb about other people, which is a base rate without a source",
  stage_norm:
    "tells the user what is normal for their stage, which is a claim about a population",
};

type Group = {
  phrase: string;
  tier: string;
  what: string;
  hits: ClaimHit[];
  documents: Set<string>;
  shape: FixShape;
  /** How many of them are `copy` rather than a delivery instruction. */
  spoken: number;
};

function main() {
  const out = argValue("--out") ?? join(process.cwd(), "methodology-review", "claims.md");
  const dir = join(process.cwd(), "methodology");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => !SUPERSEDED.has(f))
    .sort();

  const perDoc: Array<{ file: string; enforced: number }> = [];
  const groups = new Map<string, Group>();
  let total = 0;

  for (const f of files) {
    const hits = scanDocument(readFileSync(join(dir, f), "utf8"), TIERS_ON);
    const t = tally(hits);
    perDoc.push({ file: f, enforced: t.enforced });
    total += t.enforced;

    for (const h of hits) {
      // Only what ships or generates what ships. Notes and spec prose are not the ask.
      if (h.kind !== "copy" && h.kind !== "instruction") continue;
      const key = `${h.tier}::${h.phrase.toLowerCase().trim()}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          phrase: h.phrase.trim(),
          tier: h.tier,
          what: h.what,
          hits: [],
          documents: new Set<string>(),
          shape: shapeFor(h.phrase, h.tier),
          spoken: 0,
        };
        groups.set(key, g);
      }
      g.hits.push(h);
      if (h.kind === "copy") g.spoken++;
      g.documents.add(f);
    }
  }

  const ordered = Array.from(groups.values()).sort((a, b) => b.hits.length - a.hits.length);

  const lines: string[] = [];
  lines.push("# Population claims: the list, grouped so it is answerable");
  lines.push("");
  lines.push(
    "- Generated from the live methodology documents. Intake cards v1.1 and v1.7 are left out, since v1.8 replaced both.",
  );
  lines.push(`- **${total} claims** in copy and in the delivery instructions that produce copy.`);
  lines.push("- Notes to us, and prose inside the specs, are not counted and are not listed.");
  lines.push(
    "- Each entry says whether it is spoken to the user as written, or delivery guidance that " +
      "shapes what Wing says. Guidance is the faster half to dismiss.",
  );
  lines.push("");
  lines.push(
    `- They are only **${ordered.length} distinct phrases**, and most fall into two shapes ` +
      "you can approve once and we apply everywhere:",
  );
  {
    const byShape: Record<string, number> = {};
    for (const g of ordered) byShape[g.shape] = (byShape[g.shape] ?? 0) + g.hits.length;
    lines.push(`  - **${byShape.delete_adverb ?? 0}** are a word we can simply delete.`);
    lines.push(`  - **${byShape.unquantified ?? 0}** are a swap for language IG-RC13 already permits.`);
    lines.push(
      `  - **${byShape.needs_her ?? 0}** genuinely need you, because removing the claim changes what the card does.`,
    );
    lines.push(
      `- So the ask is two yes-or-no answers, then ${byShape.needs_her ?? 0} lines to look at.`,
    );
  }
  lines.push("");

  lines.push("## Where they are");
  lines.push("");
  lines.push("| Document | Claims |");
  lines.push("| --- | --- |");
  for (const d of perDoc.slice().sort((a, b) => b.enforced - a.enforced)) {
    if (!d.enforced) continue;
    lines.push(`| ${d.file} | ${d.enforced} |`);
  }
  lines.push("");

  lines.push("## The three fixes, and one that needs you");
  lines.push("");
  for (const k of Object.keys(SHAPES)) {
    const s = SHAPES[k as FixShape];
    lines.push(`**${s.title}.** ${s.how}`);
    lines.push("");
  }

  lines.push("## The phrases");
  lines.push("");
  for (const g of ordered) {
    if (g.hits.length < 2) continue;
    lines.push(`### "${g.phrase}" — ${g.hits.length} places`);
    lines.push("");
    const extra =
      g.what.toLowerCase().trim() === g.phrase.toLowerCase().trim() ? "" : ` (${g.what})`;
    lines.push(`- Why it trips: ${TIER_WHY[g.tier] ?? g.tier}${extra}`);
    lines.push(`- ${g.spoken} of the ${g.hits.length} ship to the user as written`);
    lines.push(`- Suggested fix: **${SHAPES[g.shape].title}**`);
    lines.push(`- Documents: ${Array.from(g.documents).join(", ")}`);
    lines.push("");
    for (const h of g.hits.slice(0, 2)) {
      const code = h.locator.code ? `${h.locator.code} ` : "";
      lines.push(`  - ${code}${h.locator.where}:`);
      lines.push(`    > ${trim(h.context)}`);
    }
    if (g.hits.length > 2) lines.push(`  - and ${g.hits.length - 2} more`);
    lines.push("");
  }

  const singles = ordered.filter((g) => g.hits.length === 1);
  if (singles.length) {
    lines.push(`## One-offs (${singles.length})`);
    lines.push("");
    for (const g of singles) {
      const h = g.hits[0];
      const code = h.locator.code ? `${h.locator.code} ` : "";
      const kind = h.kind === "copy" ? "spoken as written" : "delivery guidance";
      lines.push(
        `- **"${g.phrase}"** · ${kind} · ${SHAPES[g.shape].title} · ${code}${h.locator.where}`,
      );
      lines.push(`  > ${trim(h.context)}`);
    }
    lines.push("");
  }

  // The output directory may not exist on a first run. tag-prompts.ts already did this;
  // this one did not, and failed with ENOENT the first time anyone ran it on a clean tree.
  mkdirSync(dirOf(out), { recursive: true });
  writeFileSync(out, lines.join("\n"), "utf8");

  console.log(`\nIG-RC13 — review list`);
  console.log(`  ${total} claims across ${perDoc.filter((d) => d.enforced).length} documents`);
  console.log(`  ${ordered.length} distinct phrases, ${singles.length} of them one-offs`);
  const byShape: Record<string, number> = {};
  for (const g of ordered) byShape[g.shape] = (byShape[g.shape] ?? 0) + g.hits.length;
  for (const k of Object.keys(SHAPES)) {
    console.log(`    ${SHAPES[k as FixShape].title.padEnd(40)} ${byShape[k] ?? 0}`);
  }
  console.log(`  written to ${out}\n`);
}

function trim(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 220 ? t.slice(0, 220) + "…" : t;
}

function dirOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "." : p.slice(0, i);
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

main();

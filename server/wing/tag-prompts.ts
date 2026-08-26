import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parsePrompts,
  tierCounts,
  tierPrompts,
  unparsedCodedLines,
  type TieredPrompt,
} from "./prompt-tiers";

/**
 * Proposes an evidence tier for every prompt in the library, for her to correct.
 *
 *     npm run wing:tag-prompts                    read prompts/, write prompt-review/tiers.md
 *     npm run wing:tag-prompts -- --dir DIR       read somewhere else
 *     npm run wing:tag-prompts -- --out FILE      write somewhere else
 *
 * Reads files. Writes one markdown file. No database, and it does not edit her documents.
 *
 * ── WHY THE LIBRARY LIVES IN `prompts/` AND NOT `methodology/` ───────────
 * `methodology/` is scanned by the IG-RC13 ratchet, and every document in it carries a
 * baselined claim count. Dropping two large copy documents in there would move the
 * corpus total the same week we told her it was 195, which is a bad way to be right.
 *
 * The prompt copy almost certainly does contain claims — "At your level, nobody's
 * testing your competence" is a stage norm — and it should be linted. That is a separate
 * decision with a number attached, so it belongs in the next email rather than in a
 * quiet directory move.
 *
 * ── THE COUNT IS THE FIRST THING SHE WILL CHECK ──────────────────────────
 * So the report leads with it, and compares what is present against what the document
 * says it holds. Those two numbers do not currently agree, and the difference is whole
 * blocks rather than rounding.
 */

function main() {
  const dir = argValue("--dir") ?? join(process.cwd(), "prompts");
  const out = argValue("--out") ?? join(process.cwd(), "prompt-review", "tiers.md");

  if (!existsSync(dir)) {
    console.log(`\n  no ${dir} directory.`);
    console.log("  Put the prompt library and the prompt copy document there, then re-run.\n");
    process.exit(1);
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => f.toLowerCase() !== "readme.md")
    .sort();
  if (!files.length) {
    console.log(`\n  ${dir} has no markdown files in it.\n`);
    process.exit(1);
  }

  const all: Array<{
    file: string;
    prompts: TieredPrompt[];
    claimed: number | null;
    skipped: Array<{ id: string; text: string; line: number }>;
  }> = [];

  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    const prompts = tierPrompts(parsePrompts(text));
    all.push({
      file: f,
      prompts,
      claimed: claimedTotal(text),
      skipped: unparsedCodedLines(text),
    });
  }

  const lines: string[] = [];
  lines.push("# Evidence tier per prompt: a first pass");
  lines.push("");
  lines.push(
    "- You told us tier belongs to the prompt rather than the response, so it can be set once " +
      "in the library. This is our proposed setting for each one.",
  );
  lines.push(
    "- Every row says which words decided it, so you can disagree with the reason rather than " +
      "just the answer.",
  );
  lines.push("- Your three definitions, used as written:");
  lines.push(
    "  - **Tier 1, Behavioral.** Names a specific, datable action, utterance, or event.",
  );
  lines.push(
    "  - **Tier 2, Corroborating.** Real referent, weak or absent time anchor, or a user-observed pattern.",
  );
  lines.push(
    "  - **Tier 3, Contextual.** Trait self-report, forced-choice self-classification, hypothetical, metaphor, or the user's guess at a third party's perception.",
  );
  lines.push("");

  let grandTotal = 0;
  for (const a of all) grandTotal += a.prompts.length;

  lines.push("## What we found");
  lines.push("");
  lines.push("| Document | Prompts found | Document says |");
  lines.push("| --- | --- | --- |");
  for (const a of all) {
    lines.push(`| ${a.file} | ${a.prompts.length} | ${a.claimed === null ? "does not say" : a.claimed} |`);
  }
  lines.push("");

  for (const a of all) {
    if (a.claimed !== null && a.claimed !== a.prompts.length) {
      lines.push(
        `- **${a.file} counts do not agree.** We parse ${a.prompts.length}; the document states ` +
          `${a.claimed}. Worth a look before the tiers are set, since a missing block is a missing ` +
          "rotation rather than a typo.",
      );
    }
  }
  lines.push("");

  lines.push("## The proposed split");
  lines.push("");
  const counts = tierCounts(allPrompts(all));
  lines.push(`- **Tier 1: ${counts["1"]}** — behavioural, and the only tier that can anchor a Reveal.`);
  lines.push(`- **Tier 2: ${counts["2"]}** — corroborating.`);
  lines.push(`- **Tier 3: ${counts["3"]}** — contextual.`);
  lines.push(`- **Unset: ${counts.unset}** — we could not tell. Listed at the end for you.`);
  lines.push("");
  lines.push(
    "Gate 2 needs four Tier 1 events per cycle, so the Tier 1 share is what decides whether a " +
      "Reveal can fire at all on a normal month of journalling. If that number looks low to you, " +
      "the cheap fix is the one you already described: appending \"walk me through the last time\" " +
      "to a prompt moves it from Tier 3 to Tier 1 and from one word to prose at the same time.",
  );
  lines.push("");

  lines.push("## Tier 1 share by block");
  lines.push("");
  lines.push(
    "Gate 2 needs four Tier 1 events in a cycle. A block with no Tier 1 prompts in it cannot " +
      "contribute one however often it is sampled, so this is the view that says where the " +
      "rewrites would buy the most.",
  );
  lines.push("");
  lines.push("| Block | Prompts | Tier 1 | Share |");
  lines.push("| --- | --- | --- | --- |");
  {
    const byBlock = new Map<string, { total: number; tier1: number }>();
    for (const p of allPrompts(all)) {
      const key = p.block || p.section || "(no block)";
      const e = byBlock.get(key) ?? { total: 0, tier1: 0 };
      e.total++;
      if (p.proposal.tier === 1) e.tier1++;
      byBlock.set(key, e);
    }
    const rows = Array.from(byBlock.entries()).sort((a, b) => a[1].tier1 / a[1].total - b[1].tier1 / b[1].total);
    for (const r of rows) {
      const pct = Math.round((r[1].tier1 / r[1].total) * 100);
      lines.push(`| ${r[0]} | ${r[1].total} | ${r[1].tier1} | ${pct}% |`);
    }
  }
  lines.push("");

  for (const a of all) {
    if (!a.skipped.length) continue;
    lines.push(`## Lines in ${a.file} we could not read as prompts`);
    lines.push("");
    for (const sk of a.skipped) {
      lines.push(`- **${sk.id}** (line ${sk.line}) — ${sk.text}`);
    }
    lines.push("");
    lines.push(
      "These carry a code but no quoted question, so they are not counted above. Worth a look: " +
        "one of them is a monthly calibration widget rather than a prompt, which is fine, but a " +
        "count that is quietly short is not.",
    );
    lines.push("");
  }

  for (const a of all) {
    lines.push(`## ${a.file}`);
    lines.push("");
    let block = "";
    for (const p of a.prompts) {
      if (p.block !== block) {
        block = p.block;
        lines.push("");
        lines.push(`**${block || p.section || "(no block)"}**`);
        lines.push("");
        lines.push("| # | Tier | Because | Prompt |");
        lines.push("| --- | --- | --- | --- |");
      }
      const tier = p.proposal.tier === null ? "?" : String(p.proposal.tier);
      lines.push(
        `| ${p.id} | ${tier} | ${p.proposal.because} | ${escapePipes(shorten(p.text))} |`,
      );
    }
    lines.push("");
  }

  const unset = allPrompts(all).filter((p) => p.proposal.tier === null);
  if (unset.length) {
    lines.push("## The ones we could not call");
    lines.push("");
    for (const p of unset) {
      lines.push(`- **${p.id}** — ${p.text}`);
    }
    lines.push("");
  }

  mkdirSync(dirOf(out), { recursive: true });
  writeFileSync(out, lines.join("\n"), "utf8");

  console.log(`\nEvidence tier — first pass`);
  for (const a of all) {
    const c = tierCounts(a.prompts);
    console.log(
      `  ${a.file}: ${a.prompts.length} prompts` +
        (a.claimed !== null && a.claimed !== a.prompts.length ? ` (document says ${a.claimed})` : ""),
    );
    console.log(`    tier 1 ${c["1"]}   tier 2 ${c["2"]}   tier 3 ${c["3"]}   unset ${c.unset}`);
    if (a.skipped.length) {
      console.log(`    ${a.skipped.length} coded line(s) with no quoted question, listed in the report`);
    }
  }
  console.log(`  ${grandTotal} prompts in total`);
  console.log(`  written to ${out}\n`);
}

function allPrompts(all: Array<{ prompts: TieredPrompt[] }>): TieredPrompt[] {
  const out: TieredPrompt[] = [];
  for (const a of all) for (const p of a.prompts) out.push(p);
  return out;
}

/** "**Total unique prompts in this library:** 235" and similar. */
function claimedTotal(text: string): number | null {
  const m = text.match(/total[^\n]{0,40}prompts[^\n]{0,20}?[:*\s]+(\d{2,4})/i);
  return m ? parseInt(m[1], 10) : null;
}

function shorten(s: string): string {
  return s.length > 110 ? s.slice(0, 110) + "…" : s;
}

function escapePipes(s: string): string {
  return s.split("|").join("\\|");
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

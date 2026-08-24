/**
 * The IG-RC13 linter, tested on synthetic strings and on the real documents.
 *
 * Run:  npx tsx server/wing/population-claims.test.ts
 *
 * ── WHY THE FIXTURE ASSERTIONS ARE HERE ──────────────────────────────────
 * A pattern linter is easy to test into uselessness: write the pattern, write a
 * string that matches it, watch it pass. The failure this file exists to prevent is
 * the one the H-004 rule in `gate-audit.ts` already had — patterns that pass their
 * own tests and find nothing in the corpus they were written for.
 *
 * So half of these assertions run against the actual methodology documents and name
 * lines the linter must find. If a document is revised and a named line disappears,
 * the assertion fails and says so rather than quietly reporting a lower count, which
 * is what a bare ratchet would do.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLAIM_RULES,
  TIERS_ON,
  quotedRanges,
  scanDocument,
  tally,
  type ClaimTier,
} from "./population-claims";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

const ALL: ClaimTier[] = ["unsourced", "prevalence", "stage_norm"];
const DOCS = join(process.cwd(), "methodology");
const doc = (name: string) => readFileSync(join(DOCS, name), "utf8");
const V18 = "wing-intake-heuristic-cards-v1.8.md";
const M13 = "wing-module13-heuristic-cards-v1.2.md";
const UPDATES = "wing-platform-updates-aug19.md";

/** A card component row, so a synthetic string lands in a spoken component. */
const row = (component: string, content: string) => `| 4. ${component} | ${content} |\n`;
const card = (code: string, component: string, content: string) =>
  `${code} A card\n${row(component, content)}`;

console.log("\nTier gating — an unconfirmed rule does not fire");
{
  const before = failures;
  const line = card("H-999", "coaching_move", "'That usually means you're ready for this.'");

  // Tier selection still works, so a future narrowing is one argument away.
  if (scanDocument(line, ["unsourced"]).length !== 0) {
    fail("a prevalence adverb fired when the prevalence tier was excluded");
  }
  const withTier = scanDocument(line, ["unsourced", "prevalence"]);
  if (withTier.length !== 1 || withTier[0].tier !== "prevalence") {
    fail(`expected one prevalence hit with the tier on, got ${withTier.length}`);
  }
  if (TIERS_ON.length !== 3) {
    fail(
      `TIERS_ON has ${TIERS_ON.length} tier(s), expected 3. Enforcement scope is a ` +
        "methodology decision — change it only on a ruling, and move the baseline in " +
        "check-claims.ts in the same commit",
    );
  }
  if (failures === before) ok("all three tiers enforced, tier selection still works");
}

console.log("\nA prevalence adverb about a word is not a claim about people");
{
  const before = failures;
  /*
   * The author's carve-out, 24 August. Both of these contain "usually"; only one is
   * a claim about a population, and the difference is whether the sentence's subject
   * is a quoted word.
   */
  const keep = card(
    "H-030",
    "coaching_move",
    "'Not 'I want' — 'I should.' 'Should' usually comes from someone else's expectations.'",
  );
  if (scanDocument(keep, ALL).length !== 0) {
    fail("RT-11's observation about the word 'should' was reported — she ruled it a keep");
  }

  const cut = card(
    "H-034",
    "coaching_move",
    "'That's a different kind of work, and it's usually faster than people expect.'",
  );
  if (!scanDocument(cut, ALL).some((h) => h.tier === "prevalence")) {
    fail("'usually faster than people expect' was exempted — she ruled it a cut");
  }

  // The exemption must not leak to the unsourced tier.
  const leak = card("H-999", "coaching_move", "'The word \"should\" — most people your age use it.'");
  if (!scanDocument(leak, ALL).some((h) => h.tier === "unsourced")) {
    fail("a quoted word exempted a 'most people' claim — the carve-out is prevalence-only");
  }

  // Not ruled on, so it must still be reported rather than quietly exempted.
  const unruled = card("H-022", "coaching_move", "'That pattern usually means something.'");
  if (scanDocument(unruled, ALL).length === 0) {
    fail("'That pattern usually means' was exempted — prevalence about a pattern has no ruling");
  }

  if (failures === before) {
    ok("word observations exempt, population claims reported, carve-out does not leak");
  }
}

console.log("\nThe carve-outs, and the lines they must not swallow");
{
  const before = failures;

  // Second person: B2's conditional follow-up asks this user about their own habit.
  const own = card("H-035", "coaching_move", 'Follow-up on 4-5: *"What do you usually post about?"*');
  if (scanDocument(own, ALL).length !== 0) {
    fail("'do you usually post' was reported — it asks one user, not a population");
  }

  // "At this stage" in a delivery note means this point in the intake, not a career stage.
  const flow = card(
    "H-010",
    "delivery_adaptation",
    "Universal. No audience-specific variation at this stage — Wing does not yet know the track.",
  );
  if (scanDocument(flow, ALL).length !== 0) {
    fail("H-010's 'at this stage' was reported — it describes the flow, not the user");
  }

  // But the stage norm addressed to the user must survive both carve-outs.
  const norm = card("H-022", "delivery_adaptation", "Undergraduate: 'At your stage, breadth is normal.'");
  if (scanDocument(norm, ALL).length === 0) {
    fail("'At your stage, breadth is normal' was exempted — she ruled it a cut");
  }

  /*
   * The contraction trap. An apostrophe inside "it's" reads as a closing quote, so
   * this line saw a quoted word `'it'` and exempted itself as a word observation —
   * on a line the author had explicitly marked for cutting.
   */
  const contraction = card(
    "H-034",
    "coaching_move",
    "FIXABLE: 'That's a different kind of work, and it's usually faster than people expect.'",
  );
  if (!scanDocument(contraction, ALL).some((h) => h.tier === "prevalence")) {
    fail(
      "'it's usually faster than people expect' was exempted — a contraction is being " +
        "read as a closing quote, so WORD_OBSERVATION needs its non-letter lookahead",
    );
  }

  if (failures === before) ok("second person and flow-stage exempt, user-facing norms survive");
}

console.log("\nQuoted-span detection survives apostrophes");
{
  const before = failures;

  const spans = quotedRanges("Wing says: 'Let's go.' and then stops.");
  if (spans.length !== 1) {
    fail(`'Let's go.' should be one span, got ${spans.length}`);
  } else {
    const [a, b] = spans[0];
    if (!"Wing says: 'Let's go.' and then stops.".slice(a, b + 1).startsWith("'Let's")) {
      fail("the span did not start at the opening quote");
    }
  }

  // A possessive must not open a span.
  if (quotedRanges("Wing's own words about the user's answer.").length !== 0) {
    fail("possessive apostrophes opened a span");
  }

  // Curly and straight double quotes both delimit.
  if (quotedRanges('He said "most people" today.').length !== 1) {
    fail("straight double quotes did not delimit");
  }
  if (quotedRanges("He said “most people” today.").length !== 1) {
    fail("curly double quotes did not delimit");
  }

  if (failures === before) ok("single, straight-double and curly-double quotes all delimit");
}

console.log("\nOne phrase is one finding");
{
  const before = failures;
  /*
   * "A lot of people your age" matches three patterns — most/a-lot-of people,
   * people-your-age, and the two overlap. The narrower spans are dropped.
   */
  const hits = scanDocument(
    card("H-999", "coaching_move", "'A lot of people your age are doing this.'"),
    ["unsourced"],
  );
  const phrases = hits.map((h) => h.phrase);
  if (hits.length !== 2) {
    fail(`expected 2 non-overlapping hits, got ${hits.length}: ${JSON.stringify(phrases)}`);
  }
  if (failures === before) ok(`overlapping patterns collapse: ${JSON.stringify(phrases)}`);
}

console.log("\nA cited base rate is not an unsourced one");
{
  const before = failures;
  // IG-RC13 permits this one by name.
  const cited = card(
    "H-999",
    "coaching_move",
    "'Kegan's research found that 58% of adults construct identity externally.'",
  );
  if (scanDocument(cited, ALL).some((h) => h.phrase.indexOf("58%") >= 0)) {
    fail("a cited base rate was reported as an unsourced claim");
  }
  // The same number with no source is a hit.
  const bare = card("H-999", "coaching_move", "'58% of adults construct identity externally.'");
  if (!scanDocument(bare, ALL).some((h) => h.phrase.indexOf("58%") >= 0)) {
    fail("an uncited percentage was missed");
  }
  if (failures === before) ok("the citation exemption keys on the source, not the number");
}

console.log("\nThe rulebook is not a violation, but a card is");
{
  const before = failures;
  const spec = 'No "most professionals," "in my experience, people who," must not be used.';
  if (scanDocument(spec, ALL).length !== 0) {
    fail("a line specifying the banned phrases was reported as using them");
  }
  // The same words inside a spoken component are still a hit.
  const spoken = card("H-999", "failure_path", "Wing must not say 'most professionals' here.");
  if (scanDocument(spoken, ALL).length === 0) {
    fail(
      "the specifying exemption leaked into a card component — a failure_path " +
        "containing 'must not' must still be scanned",
    );
  }
  if (failures === before) ok("gate definitions are exempt, card components never are");
}

console.log("\nA claim about this user is not a claim about a population");
{
  const before = failures;
  const own = card(
    "H-999",
    "coaching_move",
    "'What's one thing you did that nobody outside your team knows about?'",
  );
  if (scanDocument(own, ALL).length !== 0) {
    fail("'nobody outside your team' was read as a population claim");
  }
  if (failures === before) ok("the cleared list holds for single-team and single-person claims");
}

console.log("\nKind classification separates what ships from what does not");
{
  const before = failures;
  const src =
    card("H-999", "coaching_move", "Wing says: 'A lot of people your age do this.'") +
    row("delivery_adaptation", "Undergraduate: a lot of people respond to warmth.") +
    "notes: fires for a lot of people in the corpus.\n";
  const hits = scanDocument(src, ["unsourced"]);
  const kinds = hits.map((h) => h.kind);
  if (kinds.indexOf("copy") < 0) fail("the quoted line was not classified as copy");
  if (kinds.indexOf("instruction") < 0) fail("the unquoted delivery line was not an instruction");
  if (kinds.indexOf("notes") < 0) fail("the notes line was not classified as notes");
  const t = tally(hits);
  if (t.enforced !== kinds.filter((k) => k === "copy" || k === "instruction").length) {
    fail("enforced count does not equal copy + instruction");
  }
  if (failures === before) ok(`copy / instruction / notes all separated, enforced = ${t.enforced}`);
}

console.log("\nBoth component-row dialects parse");
{
  const before = failures;
  /*
   * The compendium escapes both the period and the underscore. Only `signal` has no
   * underscore, so the first version of the row pattern matched that one row and
   * nothing else — every later hit inherited the `signal` locator, none counted as
   * copy, and the largest document in the corpus reported a clean zero. 124 real
   * claims were invisible.
   */
  const compendium =
    "H-101 A card\n" +
    "| **1\\. signal** | Student names three or more functions. |\n" +
    "| **4\\. coaching\\_move** | Wing says: 'At your level, most people struggle with this.' |\n";
  const hits = scanDocument(compendium, ALL);
  if (!hits.some((h) => h.locator.where === "coaching_move")) {
    fail(
      "the escaped-underscore dialect did not parse — `coaching\\_move` must normalise " +
        "to `coaching_move` or the compendium's 209 cards go unattributed",
    );
  }
  if (!hits.some((h) => h.kind === "copy")) {
    fail("a claim in the compendium's coaching_move was not classified as copy");
  }

  // And the live corpus proves it: the compendium must enforce more than zero.
  const real = tally(
    scanDocument(readFileSync(join(DOCS, "wing-master-module-compendium-v2.md"), "utf8"), ALL),
  );
  if (real.enforced === 0) {
    fail("the compendium enforces 0 — the row dialect has regressed and it is invisible again");
  }

  if (failures === before) ok(`both dialects parse; the compendium enforces ${real.enforced}`);
}

console.log("\nAgainst the real documents — lines the linter must find");
{
  const before = failures;
  const v18 = scanDocument(doc(V18), ["unsourced"]);

  const must: Array<[string, string]> = [
    ["H-021", "Everyone around|Everyone your"],
    ["H-030", "A lot of people"],
    ["H-028", "That's actually uncommon"],
    ["H-029", "Investors"],
  ];
  for (const [code, phrase] of must) {
    const re = new RegExp(phrase, "i");
    if (!v18.some((h) => h.locator.code === code && re.test(h.phrase))) {
      fail(`${code}: expected a hit matching /${phrase}/i and found none`);
    }
  }

  // H-014's frequency claim was removed in v1.8. It must not come back.
  if (v18.some((h) => h.locator.code === "H-014")) {
    fail("H-014 has a population claim again — v1.8 removed it, so this is a regression");
  }

  // Module 13's on-ramp ships a frequency claim; IG-U016's own wording does not.
  const m13 = scanDocument(doc(M13), ["unsourced"]);
  if (!m13.some((h) => h.locator.code === "H-1301" && /most people in/i.test(h.phrase))) {
    fail("H-1301's on-ramp claim was missed — it is the clearest case in Module 13");
  }

  // The gate document that defines IG-RC13 must not be reported as violating it.
  const updates = tally(scanDocument(doc(UPDATES), ALL));
  if (updates.enforced !== 0) {
    fail(`Platform Updates reported ${updates.enforced} enforced hit(s); its prose is not copy`);
  }

  if (failures === before) {
    ok(`${v18.length} hit(s) in v1.8 and ${m13.length} in Module 13 at tier 1, named lines present`);
  }
}

console.log("\nEvery rule is reachable");
{
  const before = failures;
  /*
   * A pattern that matches nothing anywhere is either wrong or dead, and either way
   * it inflates the apparent coverage of this file. Checked against the corpus plus
   * the synthetic strings above rather than asserted.
   */
  const corpus = [V18, M13, UPDATES, "wing-intake-design-v3.3.md", "wing-reveal-cycle-v4-canonical.md"]
    .map((f) => doc(f))
    .join("\n");
  const dead = CLAIM_RULES.filter((r) => {
    r.pattern.lastIndex = 0;
    return !r.pattern.test(corpus);
  }).map((r) => r.what);
  if (dead.length) {
    fail(`${dead.length} rule(s) match nothing in the corpus: ${dead.join("; ")}`);
  }
  if (failures === before) ok(`all ${CLAIM_RULES.length} rules match something real`);
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);

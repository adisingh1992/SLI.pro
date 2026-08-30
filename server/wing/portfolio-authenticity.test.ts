/**
 * T8 — the 360Brew authenticity standard where the portfolio is built.
 *
 * The scope's instruction was "extend its callers rather than writing a second
 * checker", and the failures that instruction is guarding against are all quiet:
 *
 *   the standard is not in the build prompt   → the model writes "spearheaded"
 *   the claim is never measured               → the wiring is decoration
 *   it is measured with `passes`              → a check that cannot fail
 *   the rewrite re-reads the turn id          → the attribution guard is undone
 *   findings are computed and dropped         → nobody ever sees one
 *
 * Three layers, tested three ways. `authenticity.ts` and `claim-rewrite.ts` are
 * pure, so they are RUN — the decisions that protect attribution are exercised,
 * not scanned for. `evidence-portfolio.ts` opens a database connection at import
 * and can only be read, so what is scanned there is the wiring: that the standard
 * reaches the prompt, that the reconciler is the thing making the decision, and
 * that nothing but the claim text is put back. A unit test of the build against
 * mocked drizzle would prove the mocks.
 *
 * The split is deliberate and was arrived at the hard way. An earlier version of
 * this file scanned for the presence of the permission guard, and a mutation that
 * neutered it to `if (before === undefined && false)` passed — a scan cannot tell
 * a guard from a disabled one, and cannot tell a load-bearing guard from a
 * redundant one at all. Pulling the decision into a module with no database made
 * it runnable, and the signature (`readonly string[]` in, `string[]` out) turned
 * "the rewrite must not re-attribute a claim" from a rule into something the
 * reconciler is structurally incapable of doing.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  AUTHENTICITY_SURFACES,
  FLAGGED_VOCABULARY,
  SHORT_TEXT_RULES,
  checkAuthenticity,
  claimStandardForPrompt,
  type Finding,
} from "./authenticity";
import { MAX_CLAIM, applyRewrites, flagClaims, renderFlagged } from "./claim-rewrite";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ok — ${detail}`);
  else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

const root = process.cwd();
const readRepo = (rel: string): string | null => {
  const p = join(root, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};
const decomment = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const PORTFOLIO = "server/wing/evidence-portfolio.ts";

console.log("\nthe authenticity standard, at the length of a positioning claim\n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1. Which rules can fire on a sentence.
 *
 * SHORT_TEXT_RULES is a claim about the module's own thresholds, and a claim
 * about thresholds goes stale the moment somebody tunes one. Enumerated, not
 * asserted.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("The four rules with no length precondition, and only those four");
{
  /* One short claim per rule, each under 40 words and under four sentences. */
  const TRIPS: ReadonlyArray<{ rule: Finding["rule"]; claim: string }> = [
    { rule: "vocabulary", claim: "I leveraged the rota to cover eleven shifts." },
    { rule: "hedging", claim: "I sort of ran the rota for eleven people." },
    { rule: "connectors", claim: "I ran the rota; moreover I cut the no-shows." },
    { rule: "engagement_bait", claim: "I ran the rota for eleven people. Thoughts?" },
  ];

  const bad: string[] = [];
  for (const { rule, claim } of TRIPS) {
    const fired = new Set(checkAuthenticity(claim).findings.map((f) => f.rule));
    if (!fired.has(rule)) bad.push(`${rule} did not fire on "${claim}"`);
    if (!SHORT_TEXT_RULES.includes(rule)) bad.push(`${rule} fires short but is not listed`);
  }

  /*
   * The other side: a claim built to be as bad as a short claim can be —
   * abstract, third person, flat — trips nothing at all. That is the honest
   * limit, and the reason rules 4 and 5 of the instruction exist.
   */
  const worst = checkAuthenticity("Demonstrates strong leadership skills.");
  if (worst.findings.length !== 0) {
    bad.push(`the length-gated rules are not silent on a four-word claim: ${worst.findings.map((f) => f.rule).join(", ")}`);
  }

  const listed = new Set(SHORT_TEXT_RULES);
  const tripped = new Set(TRIPS.map((t) => t.rule));
  for (const r of listed) {
    if (!tripped.has(r)) bad.push(`${r} is listed but nothing here demonstrates it`);
  }

  check("short rules", bad.length === 0, bad.length === 0
    ? `${SHORT_TEXT_RULES.join(", ")} fire on one sentence; the other five stay silent`
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. The `passes` trap, demonstrated rather than described.
 *
 * This is the single reason the portfolio counts findings. If a future tuning
 * pass makes `passes` meaningful at this length, this test fails and the
 * decision gets re-examined — which is the correct outcome, not a nuisance.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA claim containing banned vocabulary still passes, which is why nothing reads passes");
{
  const report = checkAuthenticity("I leveraged the rota to cover eleven shifts across two terms.");
  const ok = report.passes === true && report.findings.length > 0;
  check("passes trap", ok, ok
    ? `one vocabulary hit scores ${report.score} and passes — findings.length is the only usable signal`
    : `passes=${report.passes}, findings=${report.findings.length}`);
}

console.log("\nNothing in the portfolio path reads passes");
{
  const src = readRepo(PORTFOLIO);
  const code = src ? decomment(src) : "";
  const ok = !!src && !/\.passes\b/.test(code);
  check("no passes", ok, src
    ? (ok ? "the build counts findings" : "the portfolio reads .passes, which cannot fail on a one-sentence claim")
    : `${PORTFOLIO} not found — this check proved nothing`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. The instruction is the short one, and it is actually in the prompt.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe claim standard names the vocabulary and leaves out the post-shaped rules");
{
  const text = claimStandardForPrompt();
  const bad: string[] = [];

  /* The word lists are the point — a standard that names none of them instructs nothing. */
  const named = FLAGGED_VOCABULARY.filter((f) => text.includes(f.phrase)).length;
  if (named !== FLAGGED_VOCABULARY.length) {
    bad.push(`${named} of ${FLAGGED_VOCABULARY.length} flagged phrases named`);
  }
  /* And the rules a single sentence cannot violate must not be spent on. */
  for (const irrelevant of ["hashtag", "bullet", "four-word sentence next to"]) {
    if (text.toLowerCase().includes(irrelevant.toLowerCase())) {
      bad.push(`the claim standard still talks about "${irrelevant}"`);
    }
  }
  if (!/first person/i.test(text)) bad.push("does not ask for first person");
  if (!/specific/i.test(text)) bad.push("does not ask for specificity");

  check("instruction", bad.length === 0, bad.length === 0
    ? `all ${FLAGGED_VOCABULARY.length} phrases named, no post-shaped rules, first person and specificity asked for`
    : bad.join("; "));
}

console.log("\nThe build prompt carries it");
{
  const src = readRepo(PORTFOLIO);
  const bad: string[] = [];
  if (!src) bad.push(`${PORTFOLIO} not found`);
  else {
    /*
     * Narrowed to the SYSTEM template literal. An import that is never
     * interpolated is an identifier appearing in a file, not an instruction
     * reaching a model.
     */
    const start = src.indexOf("const SYSTEM = `");
    const end = start >= 0 ? src.indexOf("`;", start) : -1;
    const system = start >= 0 && end > start ? src.slice(start, end) : "";
    if (!system) bad.push("could not read the SYSTEM literal");
    else if (!system.includes("${claimStandardForPrompt()}")) {
      bad.push("the standard is not interpolated into SYSTEM");
    }
  }
  check("in prompt", bad.length === 0, bad.length === 0
    ? "claimStandardForPrompt() is interpolated into the build prompt itself"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. The reconciler, run rather than read.
 *
 * `claim-rewrite.ts` is pure precisely so this section can execute instead of
 * scanning for the presence of a guard — a scan cannot tell a guard from one
 * somebody wrote `&& false` into, and it cannot tell a load-bearing guard from a
 * redundant one at all.
 * ───────────────────────────────────────────────────────────────────────── */
const DIRTY = "I leveraged the rota to cover eleven shifts across two terms.";
const CLEAN = "I ran the rota for eleven people across two terms.";

console.log("\nOnly a claim this pass flagged can be replaced");
{
  const claims = [CLEAN, DIRTY];
  const flagged = flagClaims(claims);
  const bad: string[] = [];

  if (flagged.length !== 1 || flagged[0].index !== 1) {
    bad.push(`flagged ${flagged.map((f) => f.index).join(",")}, expected only index 1`);
  }

  /* An index the model invented, out of range. */
  const invented = applyRewrites(claims, flagged, [{ index: 7, positioningClaim: CLEAN }]);
  if (invented.rewritten !== 0 || invented.claims.length !== 2) {
    bad.push("an out-of-range index was accepted");
  }

  /* An index in range, but a claim nobody complained about. */
  const unasked = applyRewrites(claims, flagged, [
    { index: 0, positioningClaim: "I did something else entirely." },
  ]);
  if (unasked.rewritten !== 0 || unasked.claims[0] !== CLEAN) {
    bad.push("a claim that was never flagged was rewritten");
  }

  /* And a negative index, which would write to a property rather than a slot. */
  const negative = applyRewrites(claims, flagged, [{ index: -1, positioningClaim: CLEAN }]);
  if (negative.rewritten !== 0 || negative.claims.join("\u241F") !== claims.join("\u241F")) {
    bad.push("a negative index was accepted");
  }

  check("permission", bad.length === 0, bad.length === 0
    ? "invented, unflagged and negative indices all refused"
    : bad.join("; "));
}

console.log("\nA rewrite is taken only when it carries strictly fewer findings");
{
  const claims = [DIRTY];
  const flagged = flagClaims(claims);
  const bad: string[] = [];

  const better = applyRewrites(claims, flagged, [{ index: 0, positioningClaim: CLEAN }]);
  if (better.rewritten !== 1 || better.claims[0] !== CLEAN) bad.push("a clean rewrite was refused");

  /* Same count of findings — a lateral move, and not worth taking. */
  const lateral = applyRewrites(claims, flagged, [
    { index: 0, positioningClaim: "I utilized the rota to cover eleven shifts." },
  ]);
  if (lateral.rewritten !== 0 || lateral.claims[0] !== DIRTY) {
    bad.push("one banned word was swapped for another and accepted");
  }

  /* Worse. */
  const worse = applyRewrites(claims, flagged, [
    { index: 0, positioningClaim: "I leveraged my passion for the rota. Thoughts?" },
  ]);
  if (worse.rewritten !== 0 || worse.claims[0] !== DIRTY) bad.push("a worse rewrite was accepted");

  /* Empty. */
  const empty = applyRewrites(claims, flagged, [{ index: 0, positioningClaim: "   " }]);
  if (empty.rewritten !== 0 || empty.claims[0] !== DIRTY) bad.push("an empty rewrite was accepted");

  /* Missing, malformed, and not an array at all. */
  for (const [what, raw] of [
    ["a non-array response", { claims: [] } as unknown],
    ["null", null as unknown],
    ["a row with no claim", [{ index: 0 }] as unknown],
  ] as const) {
    const r = applyRewrites(claims, flagged, raw);
    if (r.rewritten !== 0 || r.claims[0] !== DIRTY) bad.push(`${what} changed something`);
  }

  check("improvement", bad.length === 0, bad.length === 0
    ? "cleaner taken; lateral, worse, empty and malformed all refused"
    : bad.join("; "));
}

console.log("\nA second rewrite of the same claim cannot undo the first");
{
  /*
   * Two findings to start with — hedged AND banned vocabulary — because the
   * failure only exists when a second rewrite can beat the ORIGINAL count while
   * being worse than the rewrite already taken. Both rows below clear two
   * findings; only one of them clears all of them.
   */
  const claims = ["I sort of leveraged the rota to cover eleven shifts."];
  const flagged = flagClaims(claims);
  const bad: string[] = [];
  if (flagged[0]?.findings.length !== 2) {
    bad.push(`the fixture starts with ${flagged[0]?.findings.length} finding(s), not 2 — the case is not exercised`);
  }

  const r = applyRewrites(claims, flagged, [
    { index: 0, positioningClaim: CLEAN },
    { index: 0, positioningClaim: "I sort of ran the rota for eleven people." },
  ]);
  if (r.rewritten !== 1 || r.claims[0] !== CLEAN) {
    bad.push(`rewritten=${r.rewritten}, claim="${r.claims[0]}"`);
  }

  check("spent", bad.length === 0, bad.length === 0
    ? "the index is spent once, so a dirtier second rewrite cannot replace a clean first"
    : bad.join("; "));
}

console.log("\nThe reconciler is never told what a claim is attributed to");
{
  const bad: string[] = [];
  const src = readRepo("server/wing/claim-rewrite.ts");

  if (!src) bad.push("claim-rewrite.ts not found");
  else {
    const code = decomment(src);
    /*
     * The structural guarantee. If the signature ever widens to take the accepted
     * records, the reconciler could read a turn id out of the model's response and
     * re-attribute an item during what is advertised as a wording fix.
     */
    for (const attribute of ["turnId", "sourceTurnId", "evidence", "competency", "studentId"]) {
      if (new RegExp(`\\b${attribute}\\b`).test(code)) {
        bad.push(`claim-rewrite.ts mentions ${attribute} — it is meant to hold strings only`);
      }
    }
    if (!/applyRewrites\(\s*\n?\s*claims: readonly string\[\]/.test(code)) {
      bad.push("applyRewrites no longer takes a readonly string[]");
    }
  }

  /* And the portfolio must not put anything else back. */
  const portfolio = readRepo(PORTFOLIO);
  if (!portfolio) bad.push(`${PORTFOLIO} not found`);
  else {
    const start = portfolio.indexOf("async function rewriteFlaggedClaims");
    const end = start >= 0 ? portfolio.indexOf("\nexport async function build", start) : -1;
    const body = start >= 0 ? decomment(portfolio.slice(start, end > start ? end : undefined)) : "";
    if (!body) bad.push("rewriteFlaggedClaims not found");
    else {
      const writes = new Set(
        Array.from(body.matchAll(/accepted\[[^\]]+\]\.(\w+)\s*=/g)).map((m) => m[1]),
      );
      for (const w of writes) {
        if (w !== "positioningClaim") bad.push(`the rewrite path assigns accepted[..].${w}`);
      }
      if (!writes.has("positioningClaim")) bad.push("the rewrite path applies nothing");
      if (!/applyRewrites\(/.test(body)) bad.push("the rewrite path does not use the reconciler");
    }
  }

  check("attribution", bad.length === 0, bad.length === 0
    ? "strings in, strings out; the portfolio puts back the claim and nothing else"
    : bad.join("; "));
}

console.log("\nThe findings go to the model, not just the count");
{
  const claims = [DIRTY];
  const flagged = flagClaims(claims);
  const rendered = renderFlagged(claims, flagged);
  const ok =
    rendered.includes("[0]") &&
    rendered.includes(DIRTY) &&
    /leverage/i.test(rendered) &&
    rendered.includes(flagged[0].findings[0].note);
  check("listing", ok, ok
    ? "the index, the claim, the exact phrase and why it was flagged"
    : `rendered: ${JSON.stringify(rendered.slice(0, 120))}`);
}

console.log("\nA rewrite is truncated at the column's length, like the original");
{
  const claims = [DIRTY];
  const flagged = flagClaims(claims);
  const long = "I ran the rota for eleven people. " + "x".repeat(MAX_CLAIM * 2);
  const r = applyRewrites(claims, flagged, [{ index: 0, positioningClaim: long }]);
  const ok = r.rewritten === 1 && r.claims[0].length === MAX_CLAIM;
  check("truncation", ok, ok
    ? `truncated to ${MAX_CLAIM}, the same bound the build applies to a first-pass claim`
    : `rewritten=${r.rewritten}, length=${r.claims[0].length}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. It runs before the write, and the reader sees what survived.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe rewrite happens before the insert, and get reports what is left");
{
  const src = readRepo(PORTFOLIO);
  const bad: string[] = [];

  if (!src) bad.push(`${PORTFOLIO} not found`);
  else {
    const code = decomment(src);
    const call = code.indexOf("rewriteFlaggedClaims(accepted)");
    const insert = code.indexOf(".insert(evidencePortfolioItems)");
    if (call < 0) bad.push("build never calls rewriteFlaggedClaims");
    else if (!(insert > call)) bad.push("the rewrite does not precede the insert");

    /*
     * Narrowed to the mapping inside `get`. `checkAuthenticity` appearing
     * somewhere in the file is not the same as a finding reaching the caller.
     */
    const g = code.indexOf("export async function get(");
    const gEnd = g >= 0 ? code.indexOf("\nexport ", g + 10) : -1;
    const body = g >= 0 ? code.slice(g, gEnd > g ? gEnd : undefined) : "";
    if (!/authenticityFindings:\s*checkAuthenticity\(/.test(body)) {
      bad.push("get does not compute the findings it returns");
    }
    /* Derived at read, not stored — a stored copy would freeze a list built to move. */
    if (/authenticity/i.test(readRepo("shared/wing-schema.ts")?.match(/evidencePortfolioItems[\s\S]{0,900}/)?.[0] ?? "")) {
      bad.push("the findings were given a column — they are derived, and the word list changes");
    }
  }

  check("wiring", bad.length === 0, bad.length === 0
    ? "rewritten before insert, recomputed on read, no column"
    : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. AUTHENTICITY_SURFACES is checked against the files, not believed.
 *
 * A list of surfaces is exactly the kind of documentation that keeps saying
 * "checked" for a year after somebody deleted the call.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery surface the module claims, verified in the file it names");
{
  const bad: string[] = [];
  for (const s of AUTHENTICITY_SURFACES) {
    const src = readRepo(s.file);
    if (!src) {
      bad.push(`${s.file} does not exist`);
      continue;
    }
    const code = decomment(src);
    const calls = /checkAuthenticity\s*\(/.test(code);
    if (s.status === "checked" && !calls) bad.push(`${s.file} claims "checked" and never calls checkAuthenticity`);
    if (s.status === "unchecked" && calls) bad.push(`${s.file} is listed "unchecked" but calls it`);
  }
  if (!AUTHENTICITY_SURFACES.some((s) => s.file === PORTFOLIO && s.status === "checked")) {
    bad.push("the portfolio is not listed as a checked surface");
  }

  check("surfaces", bad.length === 0, bad.length === 0
    ? `${AUTHENTICITY_SURFACES.length} surfaces, each matching the file it names`
    : bad.join("; "));
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);

/**
 * Her prompt library, as rows.
 *
 * The seed is 295 rows written once and read by everything downstream, so the test is
 * mostly arithmetic against her own stated structure. Her documents count themselves —
 * "80 prompts", "10 per audience", "15 per audience", "8 per track" — and a parser that
 * silently drops a block still produces a plausible-looking library.
 *
 * The other half is what the derivation must NOT do: assign a signal category, invent a
 * cadence from a marker that does not name one, or broadcast an audience-specific prompt
 * by leaving its tags empty.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parsePrompts } from "./prompt-tiers";
import {
  audienceScopeOf,
  blockOf,
  fromMarker,
  parseOpeners,
  toRow,
  unmappedBlocks,
  unpooledOpeners,
  type PromptRow,
} from "./prompt-library-source";
import { populationTagsFor, type Pathway, type ProfessionalStatus } from "./population-tags";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ok — ${detail}`);
  else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

const MICRO = "wing-approachable-microjournal-library.md";
const HEARTBEAT = "wing-heartbeat-and-population-prompts.md";
const dir = join(process.cwd(), "prompts");

console.log("\nprompt library — her documents as rows\n");

if (!existsSync(join(dir, MICRO)) || !existsSync(join(dir, HEARTBEAT))) {
  console.log(`  FAIL — source: prompts/ is missing one of her two files`);
  process.exit(1);
}

const rows: PromptRow[] = [MICRO, HEARTBEAT].flatMap((f) =>
  parsePrompts(readFileSync(join(dir, f), "utf8")).map((p) => toRow(p, f)),
);

const micro = rows.filter((r) => r.sourceDocument === MICRO);
const heartbeatFile = rows.filter((r) => r.sourceDocument === HEARTBEAT);

/* ─────────────────────────────────────────────────────────────────────────
 * 1. The counts her own documents state.
 *
 * "Work for all 7 audiences · 80 prompts" / "Same concept, different scene · 10 per
 * audience" / "Only work for one population · 15 per audience" — and the heartbeat file's
 * "8 per track". These are her numbers, not ours, and they are what a dropped block
 * changes.
 *
 * The specific count is 70 rather than the 15 × 7 = 105 the heading implies, because two
 * of her blocks are headed "(10)" and hold five each and there is no Entrepreneur (Early)
 * block at all. That gap is real, is already in the report she gets, and is asserted here
 * so it cannot silently change size.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("The counts reconcile against her own headings");
{
  const scope = (s: string) => micro.filter((r) => r.audienceScope === s).length;
  const bad: string[] = [];
  if (micro.length !== 220) bad.push(`micro-journal: ${micro.length}, expected 220`);
  if (scope("universal") !== 80) bad.push(`universal: ${scope("universal")}, her heading says 80`);
  if (scope("adapted") !== 70) bad.push(`adapted: ${scope("adapted")}, expected 7 audiences × 10`);
  if (scope("specific") !== 70) bad.push(`specific: ${scope("specific")}, expected the 70 present`);

  const section4 = heartbeatFile.filter((r) => r.audienceScope === null && r.deliveryMarker === null);
  if (section4.length !== 48) bad.push(`heartbeat tracks: ${section4.length}, expected 6 × 8`);
  const section5 = heartbeatFile.filter((r) => r.deliveryMarker !== null);
  if (section5.length !== 27) bad.push(`new-population: ${section5.length}, expected 27 parseable of her 28`);

  check("counts", bad.length === 0, bad.length === 0 ? `${rows.length} rows: 80 + 70 + 70 + 48 + 27` : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. Every row is a prompt, and identifiable.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery row carries a code, a block and her text");
{
  const bad: string[] = [];
  for (const r of rows) {
    if (!r.promptCode.trim()) bad.push(`line ${r.sourceLine}: no code`);
    if (!r.promptText.trim()) bad.push(`${r.promptCode}: no text`);
    if (!r.sourceBlock.trim()) bad.push(`${r.promptCode}: no block`);
    if (!r.sourceLine) bad.push(`${r.promptCode}: no source line`);
    /* Her prompts are questions to a person; a stray table row or heading is not. */
    if (r.promptText.length < 12) bad.push(`${r.promptCode}: suspiciously short — "${r.promptText}"`);
  }
  check("rows", bad.length === 0, bad.length === 0 ? `${rows.length} rows, all identifiable` : bad.slice(0, 3).join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. (block, code) is unique — the database index depends on it.
 *
 * Her heartbeat prompts are numbered 1 to 8 within each track, so the code repeats six
 * times over. If `blockOf` ever returned the same string for two tracks, the unique index
 * in 0028 would reject the seed halfway through.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe seed satisfies the unique index it will be written under");
{
  const seen = new Map<string, string[]>();
  for (const r of rows) {
    /* A separator that cannot occur inside one of her headings, so two different
       (block, code) pairs can never join to the same string. */
    const key = `${r.sourceBlock}␟${r.promptCode}`;
    seen.set(key, [...(seen.get(key) ?? []), `${r.sourceDocument}:${r.sourceLine}`]);
  }
  /* Array.from, not spread: no `target` means ES5, and a Map iterator is TS2802. */
  const dupes = Array.from(seen.entries()).filter(([, v]) => v.length > 1);
  /* And the repeat is real, so the test would notice if blockOf stopped separating them. */
  const repeatedCodes = rows.filter((r) => r.promptCode === "1").length;
  check(
    "unique",
    dupes.length === 0 && repeatedCodes > 1,
    dupes.length === 0
      ? `${seen.size} distinct pairs, with code "1" appearing ${repeatedCodes} times across blocks`
      : dupes.slice(0, 3).map(([k, v]) => `${k.replace("␟", "/")} at ${v.join(", ")}`).join("; "),
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. Audience tags reach real students.
 *
 * An untagged prompt is UNIVERSAL by `population-tags.ts`'s fail-open rule. So a heading
 * this file failed to recognise does not produce an unreachable prompt — it produces an
 * executive-only prompt sent to undergraduates, which is the more expensive direction.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nAudience tags reach real students, and only universal prompts go untagged");
{
  /*
   * REACHABLE, not merely valid.
   *
   * The first version of this checked membership in METHODOLOGY_POPULATIONS, and a
   * mutation retagging the fundraising block as `entrepreneur_fundraising` passed it —
   * because that IS a methodology population. It is not one any student is ever resolved
   * to: `populationTagsFor` never emits the entrepreneur sub-stages, by an existing
   * platform decision. So those 20 prompts would have been valid, well-typed, and
   * unreachable by every human being.
   *
   * The reachable set is therefore built by enumerating every student the platform can
   * describe — four statuses × three pathways, plus the nulls — and taking what the
   * resolver actually returns.
   */
  const STATUSES: Array<ProfessionalStatus | null> = [
    "undergraduate_or_recent_grad",
    "early_career",
    "mid_career_or_senior",
    "career_break_or_transition",
    null,
  ];
  const PATHWAYS: Array<Pathway | null> = ["employment", "venture", "freelance", null];

  const known = new Set<string>();
  for (const status of STATUSES) {
    for (const pathway of PATHWAYS) {
      for (const t of populationTagsFor(status, pathway)) known.add(t);
    }
  }

  const bad: string[] = [];

  for (const r of rows) {
    for (const t of r.populationTags) {
      if (!known.has(t)) bad.push(`${r.promptCode}: "${t}" is a tag no real student ever carries`);
    }
    if (r.audienceScope === "universal" && r.populationTags.length) {
      bad.push(`${r.promptCode}: a universal prompt carries tags`);
    }
  }
  const unmapped = unmappedBlocks(rows);
  if (unmapped.length) bad.push(`unmapped block(s): ${unmapped.join(", ")}`);

  const tagged = rows.filter((r) => r.populationTags.length).length;
  check(
    "audience",
    bad.length === 0 && known.size > 0,
    bad.length === 0 ? `${tagged} tagged from ${known.size} reachable populations, 80 universal, no unmapped block` : bad.slice(0, 3).join("; "),
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4b. The founder stages are tagged and cannot be targeted.
 *
 * Pinned rather than left as a comment, because it is a live product gap wearing the
 * appearance of a solved one. Her Sections 2 and 3 separate Early Stage, Fundraising and
 * Scaling, and the rows carry those tags — but `populationTagsFor` emits all four
 * entrepreneur tags for anyone on the venture or freelance pathway, because a pathway does
 * not know a stage. So a seed-stage founder is eligible for the fundraising prompts.
 *
 * This test asserts the gap. The day something captures founder stage, it fails, and the
 * person who made that possible is told there are 50 prompts waiting to become targetable.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe founder stages are tagged, and today they select identically");
{
  const stages = ["entrepreneur_early", "entrepreneur_fundraising", "entrepreneur_scaling"];
  const sets = stages.map((stage) => {
    const who: string[] = [];
    for (const status of ["undergraduate_or_recent_grad", "early_career", "mid_career_or_senior", "career_break_or_transition", null] as Array<ProfessionalStatus | null>) {
      for (const pathway of ["employment", "venture", "freelance", null] as Array<Pathway | null>) {
        if (populationTagsFor(status, pathway).includes(stage as never)) who.push(`${status}/${pathway}`);
      }
    }
    return who.join("|");
  });

  const indistinguishable = new Set(sets).size === 1 && sets[0].length > 0;
  const staged = rows.filter((r) => r.populationTags.some((t) => stages.includes(t))).length;

  check(
    "founder stages",
    indistinguishable,
    indistinguishable
      ? `${staged} stage-specific prompts tagged; all three stages still resolve to the same students, so none of them is targetable yet`
      : "founder stages now select differently — the 50 stage-specific prompts became targetable, and this test should be replaced by one that checks they reach the right stage",
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4a. The unmapped-block check actually catches a renamed heading.
 *
 * Asserted directly, because it is the guard the check above leans on and a guard that is
 * never exercised is a guard nobody knows is broken.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA heading this file does not recognise is reported, not seeded empty");
{
  const renamed: PromptRow = { ...rows.find((r) => r.audienceScope === "specific")!, sourceBlock: "Executive-Only (16)", populationTags: [] };
  const caught = unmappedBlocks([...rows, renamed]);
  check("guard", caught.includes("Executive-Only (16)"), caught.length ? `reported: ${caught.join(", ")}` : "a renamed heading passed unnoticed");
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. Cadence and event-sensitivity come from her markers, and nowhere else.
 *
 * All seven of her wordings, verbatim from Section 5. The two that name no rhythm return
 * no cadence — `reveal-trigger` and `monthly calibration` are delivery modes, and pushing
 * them into the nearest-looking rhythm would put them in a weekly rotation she excluded
 * them from.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nCadence is read off her markers, and never invented");
{
  const cases: Array<[string | null, string | null, boolean]> = [
    [null, null, false],
    ["heartbeat", "heartbeat", false],
    ["heartbeat — requires event-sensitivity flag", "heartbeat", true],
    ["heartbeat — requires event-sensitivity flag: only when Wing knows they had a meeting", "heartbeat", true],
    ['heartbeat — paired with "no one sees this but you" framing', "heartbeat", false],
    ["synthesis-cycle", "synthesis_cycle", false],
    ["synthesis-cycle only", "synthesis_cycle", false],
    ["reveal-trigger — only fires on uniformly positive pattern", null, false],
    ["monthly calibration", null, false],
  ];
  const bad: string[] = [];
  for (const [marker, cadence, sensitive] of cases) {
    const got = fromMarker(marker);
    if (got.cadence !== cadence) bad.push(`"${marker}" → ${got.cadence}, expected ${cadence}`);
    if (got.eventSensitive !== sensitive) bad.push(`"${marker}" → sensitive=${got.eventSensitive}`);
  }
  check("markers", bad.length === 0, bad.length === 0 ? `all ${cases.length} of her wordings` : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5a. Every row lands in the rhythm its document puts it in.
 *
 * The marker test above covers the function; this covers the wiring. Removing the `h1`
 * tracking from the parser passed every other check here — Section 4's 48 prompts carry no
 * marker, so they fell back to a null cadence and nothing noticed. A prompt with no
 * cadence is a prompt no scheduler will ever send.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery prompt lands in the rhythm its document puts it in");
{
  const count = (c: string | null) => rows.filter((r) => r.cadence === c).length;
  const bad: string[] = [];

  if (count("micro_journal") !== 220) bad.push(`micro_journal: ${count("micro_journal")}, expected 220`);
  /* 48 from Section 4 plus the 23 in Section 5 she marked heartbeat. */
  if (count("heartbeat") !== 71) bad.push(`heartbeat: ${count("heartbeat")}, expected 48 + 23`);
  if (count("synthesis_cycle") !== 3) bad.push(`synthesis_cycle: ${count("synthesis_cycle")}, expected 3`);
  /* Exactly one: the reveal-trigger prompt, which names no rhythm. */
  if (count(null) !== 1) bad.push(`no cadence: ${count(null)}, expected 1`);

  /* And Section 4 specifically, since that is the fallback that silently failed. */
  const section4 = heartbeatFile.filter((r) => r.deliveryMarker === null);
  const wrong = section4.filter((r) => r.cadence !== "heartbeat");
  if (wrong.length) bad.push(`${wrong.length} of Section 4's ${section4.length} carry ${wrong[0].cadence}`);

  check("cadence", bad.length === 0, bad.length === 0 ? "220 micro-journal, 71 heartbeat, 3 synthesis, 1 with no rhythm she named" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. Exactly the four she marked are event-sensitive.
 *
 * Her Event Sensitivity Rule sits in the micro-journal preamble and those 220 prompts were
 * written to comply — none names a conference, an interview or a career fair. The only
 * event-sensitive prompts anywhere are the four she marked by hand in Section 5.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvent-sensitivity is hers, and it is four prompts");
{
  const sensitive = rows.filter((r) => r.eventSensitive);
  const fromMicro = sensitive.filter((r) => r.sourceDocument === MICRO);
  const allMarked = sensitive.every((r) => (r.deliveryMarker ?? "").indexOf("event-sensitivity") >= 0);
  check(
    "events",
    sensitive.length === 4 && fromMicro.length === 0 && allMarked,
    `${sensitive.length} event-sensitive, all marked by her, none from the 220`,
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 7. The two refusals are structural, not incidental.
 *
 * `signalCategory` is what Gate 2 counts and no prompt carries one; `evidenceTier` waits
 * on her approval. `evidenceTier` is typed `null` and `signalCategory` is typed as the
 * empty set (0041 made it a set, and empty is how a set spells "none"), so this test can
 * only fail if someone widens either type — which is the point at which the decision
 * should be revisited deliberately.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nNo signal category and no tier is assigned by this file");
{
  const categorised = rows.filter((r) => r.signalCategory.length > 0).length;
  const tiered = rows.filter((r) => r.evidenceTier !== null).length;
  check(
    "refusals",
    categorised === 0 && tiered === 0,
    `0 of ${rows.length} categorised, 0 tiered — both are hers to assign`,
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 8. Her behavioural signals survive the trip.
 *
 * 220 in the micro-journal library plus 27 in Section 5. Section 4 has none, which is a
 * property of her document rather than a parse failure — and asserting the split means a
 * regression in either file shows up as a number that moved.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery signal she wrote reaches its row");
{
  const withSignal = rows.filter((r) => r.behavioralSignal && r.behavioralSignal.trim()).length;
  const microSignals = micro.filter((r) => r.behavioralSignal).length;
  const bad: string[] = [];
  if (microSignals !== 220) bad.push(`micro-journal signals: ${microSignals}, expected 220`);
  if (withSignal !== 247) bad.push(`total signals: ${withSignal}, expected 220 + 27`);
  /* An asterisk left in means the wrapper was captured as content. */
  for (const r of rows) {
    if (r.behavioralSignal?.includes("*")) bad.push(`${r.promptCode}: markup in the signal`);
  }
  check("signals", bad.length === 0, bad.length === 0 ? `${withSignal} signals, none carrying markup` : bad.slice(0, 3).join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 9. The library pool is the micro-journal library, and only that.
 *
 * Her rotation weighting is "roughly 2:1 approachable-to-serious in any given week", which
 * is about this library against the reflective one. The heartbeat prompts are a different
 * rhythm, not the other side of that ratio, so they take no pool.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe approachable pool is her micro-journal library, and only that");
{
  const approachable = rows.filter((r) => r.library === "approachable");
  const strays = approachable.filter((r) => r.sourceDocument !== MICRO);
  const heartbeatPooled = heartbeatFile.filter((r) => r.library !== null);
  check(
    "pool",
    approachable.length === 220 && !strays.length && !heartbeatPooled.length,
    `${approachable.length} approachable, all from her library; ${heartbeatFile.length} heartbeat rows take no pool`,
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 10. Scope and block derivation, on the shapes that differ between the files.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nScope and block read the right heading level in both files");
{
  const bad: string[] = [];
  const p = (over: Partial<Parameters<typeof toRow>[0]>) =>
    ({ id: "1", text: "x", block: "", section: "", h1: "", signal: null, deliveryMarker: null, line: 1, ...over }) as Parameters<typeof toRow>[0];

  if (audienceScopeOf(p({ section: "SECTION 2: AUDIENCE-ADAPTED PROMPTS" })) !== "adapted") bad.push("section 2 misread");
  if (audienceScopeOf(p({ section: "Undergraduate" })) !== null) bad.push("a heartbeat population read as a scope");

  /* The micro-journal library carries the audience at `###`; the heartbeat file at `##`. */
  if (blockOf(p({ block: "Executive-Only (15)", section: "SECTION 3" })) !== "Executive-Only (15)") bad.push("block lost to section");
  if (blockOf(p({ section: "Career Returner", h1: "SECTION 4" })) !== "Career Returner") bad.push("heartbeat section lost to h1");
  if (blockOf(p({ h1: "SECTION 4" })) !== "SECTION 4") bad.push("no fallback to h1");

  check("headings", bad.length === 0, bad.length === 0 ? "### then ## then #, in that order" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 11. The opener pool.
 *
 * "The universal opener pool should be implemented as a separate layer — the system
 * selects the opener independently of the prompt, ensuring variety in how prompts feel
 * even when the underlying question repeats at the 14-day minimum interval."
 *
 * Her three pools are not interchangeable: warm_return is for someone who has not
 * responded in five days, post_response for following up on a theme. Sending a
 * warm-return greeting to someone who answered yesterday is the failure this separates.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nHer opener pool parses into three pools that are not interchangeable");
{
  const text = readFileSync(join(dir, MICRO), "utf8");
  const openers = parseOpeners(text);
  const bad: string[] = [];

  const inPool = (p: string) => openers.filter((o) => o.pool === p).length;
  if (openers.length !== 14) bad.push(`${openers.length} openers, expected 8 + 3 + 3`);
  if (inPool("casual") !== 8) bad.push(`casual: ${inPool("casual")}, expected 8`);
  if (inPool("warm_return") !== 3) bad.push(`warm_return: ${inPool("warm_return")}, expected 3`);
  if (inPool("post_response") !== 3) bad.push(`post_response: ${inPool("post_response")}, expected 3`);

  const stray = unpooledOpeners(text);
  if (stray !== 0) bad.push(`${stray} opener(s) under a heading this file does not recognise`);

  for (const o of openers) {
    if (!o.text.trim()) bad.push(`line ${o.sourceLine}: empty`);
    /* Every one of her openers greets by name; one also names a topic. */
    if (!o.placeholders.includes("Name")) bad.push(`"${o.text}" does not interpolate a name`);
    if (o.text.includes("○") || o.text.includes('"')) bad.push(`"${o.text}" kept its markup`);
  }
  const withTopic = openers.filter((o) => o.placeholders.includes("topic"));
  if (withTopic.length !== 1) bad.push(`${withTopic.length} openers name a topic, expected 1`);
  if (withTopic[0] && withTopic[0].pool !== "post_response") {
    bad.push("the topic opener is not in the post-response pool");
  }

  /* No opener text repeats — the unique index in 0028 is on (pool, text). */
  const seen = new Set(openers.map((o) => `${o.pool}\u241f${o.text}`));
  if (seen.size !== openers.length) bad.push("two openers share a pool and a text");

  check("openers", bad.length === 0, bad.length === 0 ? "14 openers, 8 + 3 + 3, every one naming the student" : bad.slice(0, 3).join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 11a. A pool she adds surfaces rather than joining the previous one.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nAn unrecognised opener heading is reported, not absorbed");
{
  const doctored = [
    "## Universal Openers",
    "",
    "**Casual check-in openers:**",
    '○ "Hey [Name] — quick one."',
    "",
    "**Milestone openers (new):**",
    '○ "[Name] — big week for you."',
    "",
    "## SECTION 1: UNIVERSAL PROMPTS",
  ].join("\n");

  const parsed = parseOpeners(doctored);
  const stray = unpooledOpeners(doctored);
  const absorbed = parsed.filter((o) => o.text.indexOf("big week") >= 0);

  check(
    "new pool",
    parsed.length === 1 && stray === 1 && absorbed.length === 0,
    absorbed.length
      ? "an unrecognised heading's openers were filed under the previous pool"
      : `${parsed.length} filed, ${stray} reported for a decision`,
  );
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);

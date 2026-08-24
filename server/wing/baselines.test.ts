/**
 * Phase 3.5 baselines — parsing, banding, barriers, and the IG-U014 layer tag.
 *
 * Run:  npx tsx server/wing/baselines.test.ts
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────
 * These three answers are the only numbers Wing will ever show a partner. B1 and B2 at
 * T0 against B1 and B2 at 90 days *is* the budget defence package. Which means the
 * expensive failure is not a crash — it is a number that looks fine and is wrong:
 *
 *   · A count read as a rating. "I post about one thing a month" is not a 1. But 1 is
 *     a low band, so it fires a follow-up, writes to the cohort table, and shows up in
 *     the improvement delta three months later with nothing to flag it.
 *   · A guess standing in for an unclear answer. "Maybe a 2 or a 3" has to re-ask.
 *   · A barrier landing in `time` when the user said something substantive. Her B3
 *     asks for the real thing, not the logistics, so the ordering is load-bearing.
 *   · A rule that matches nothing. Five of those in reveal-facts is why every pattern
 *     here is asserted against a phrase a person would actually type, and why the
 *     input is `contract()`ed rather than each pattern carrying its own apostrophes.
 */
import {
  type Barrier,
  type BaselineBeat,
  type BaselineRecord,
  bandFor,
  barrierReason,
  classifyBarrier,
  HER_BARRIERS,
  isCoachingInput,
  readScale,
  recordBaseline,
  REMEASUREMENT,
} from "./baselines";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

console.log("\nbaselines\n");

console.log("The shapes people actually type");
{
  const before = failures;
  const cases: Array<[string, number]> = [
    ["3", 3],
    ["about a 2", 2],
    ["solid 4", 4],
    ["3/5", 3],
    ["I'd say 4 out of 5", 4],
    ["2 out of five", 2],
    ["honestly a 1", 1],
    ["maybe three", 3],
    ["five", 5],
    ["probably a two", 2],
    ["I'm a 4 on that one, on a 1-5", 4],
  ];
  for (const c of cases) {
    const r = readScale(c[0]);
    if (r.score !== c[1]) fail(`"${c[0]}" read as ${r.score}, expected ${c[1]}`);
  }
  if (failures === before) ok(`${cases.length} phrasings read to a single score`);
}

console.log("\nAn unclear answer re-asks; it does not pick");
{
  const before = failures;

  const two = readScale("I'd say a 2 or a 3");
  if (two.score !== null) fail(`"a 2 or a 3" produced ${two.score}`);
  if (two.score === null && !two.ambiguous) fail("two candidates must report as ambiguous");
  if (two.score === null && two.candidates.length !== 2) {
    fail(`expected 2 candidates, got ${two.score === null ? two.candidates.join(",") : ""}`);
  }

  const words = readScale("one or two, depends on the week");
  if (words.score !== null) fail(`"one or two" produced ${words.score}`);

  /*
   * Out of range is a misread scale, not a maximum. Clamping "a 7" to 5 would record
   * the most confident answer on the scale from a user who did not understand it.
   */
  const seven = readScale("I'd give myself a 7 honestly");
  if (seven.score !== null) fail(`"a 7" was clamped to ${seven.score}`);
  if (seven.score === null && seven.ambiguous) {
    fail("nothing readable is not the same as two readings — ambiguous should be false");
  }

  const none = readScale("hard to put a number on it");
  if (none.score !== null) fail(`no number present but read ${none.score}`);

  if (failures === before) ok("2-or-3 → null+ambiguous, a 7 → null, no number → null");
}

console.log("\nCounting something is not rating it");
{
  const before = failures;
  /*
   * Both of these scored 1 before the noun and lead guards existed, and 1 is the band
   * that fires the low follow-up and enters the cohort table.
   */
  const counts: string[] = [
    "I post about one thing a month",
    "no one really sees it",
    "maybe 2 posts a year",
    "I've been doing this 3 years",
    "one of my colleagues shares stuff",
  ];
  for (const c of counts) {
    const r = readScale(c);
    if (r.score !== null) fail(`"${c}" was read as a score of ${r.score}`);
  }
  if (failures === before) ok(`${counts.length} counting answers scored nothing and will re-ask`);
}

console.log("\nHer banding, including the 3 that earns nothing");
{
  const before = failures;
  if (bandFor(1) !== "low" || bandFor(2) !== "low") fail("1–2 must band low");
  if (bandFor(4) !== "high" || bandFor(5) !== "high") fail("4–5 must band high");
  if (bandFor(3) !== null) fail("a 3 must earn no band and no follow-up");
  if (bandFor(0) !== null || bandFor(6) !== null) fail("off-scale must band null");
  if (failures === before) ok("1–2 low, 4–5 high, 3 and off-scale null");
}

console.log("\nAll six of her barrier categories are reachable");
{
  const before = failures;
  /*
   * A category with no phrase that reaches it is a dead branch: the follow-up written
   * for it never runs and the cohort report shows a zero that means "unmatched", not
   * "nobody said this".
   */
  const cases: Array<[Barrier, string]> = [
    ["content_uncertainty", "I never know what to say"],
    ["fear_judgment", "I worry about being judged by people I work with"],
    ["time", "I just don't have the time for it"],
    ["relevance_confusion", "who would even care what I post about"],
    ["voice_uncertainty", "everything I write doesn't sound like me"],
    ["already_active", "Nothing really, I already post most weeks"],
  ];
  for (const c of cases) {
    const got = classifyBarrier(c[1]);
    if (got !== c[0]) fail(`"${c[1]}" → ${got}, expected ${c[0]}`);
  }
  const reached: Barrier[] = [];
  for (const c of cases) reached.push(c[0]);
  for (const b of HER_BARRIERS) {
    if (reached.indexOf(b) < 0) fail(`${b} has no fixture proving it is reachable`);
  }
  if (failures === before) ok(`all ${HER_BARRIERS.length} of her categories reached`);
}

console.log("\nB3 asks past the logistics, so substance outranks time");
{
  const before = failures;
  const t = classifyBarrier("I don't have time to work out what to say");
  if (t !== "content_uncertainty") {
    fail(`"no time to work out what to say" → ${t}; the time word must not win`);
  }
  const fear = classifyBarrier("no time, and honestly I'd feel like I was bragging");
  if (fear !== "fear_judgment") fail(`bragging behind a time excuse → ${fear}`);
  const plain = classifyBarrier("genuinely just time, I'd do it otherwise");
  if (plain !== "time") fail(`a real time answer → ${plain}`);
  if (failures === before) ok("time only wins when nothing substantive is present");
}

console.log("\nContractions are normalised once, not per pattern");
{
  const before = failures;
  /*
   * The five dead rules in reveal-facts were all this: a pattern written with an
   * apostrophe, an answer typed without one. Fixed at the input, so the test that
   * matters is that both spellings land in the same place.
   */
  const pairs: Array<[string, string]> = [
    ["it doesn't sound like me", "it does not sound like me"],
    ["I don't know what to write", "I do not know what to write"],
  ];
  for (const p of pairs) {
    const a = classifyBarrier(p[0]);
    const b = classifyBarrier(p[1]);
    if (a !== b) fail(`"${p[0]}" → ${a} but "${p[1]}" → ${b}`);
    if (a === "unknown") fail(`"${p[0]}" matched nothing at all`);
  }
  if (failures === before) ok("contracted and expanded forms classify identically");
}

console.log("\nEvery barrier can say why it was chosen");
{
  const before = failures;
  for (const b of HER_BARRIERS) {
    if (!barrierReason(b).trim()) fail(`${b} has no reason string`);
  }
  if (!barrierReason("unknown").trim()) fail("unknown needs a reason too");
  if (classifyBarrier("") !== "unknown") fail("an empty answer is unknown, not a category");
  if (failures === before) ok("reasons present for all seven, empty answer → unknown");
}

console.log("\nIG-U014 — every record is Layer 1, on every path");
{
  const before = failures;

  const b1: BaselineBeat = {
    question: "B1",
    answer: "scale_1_5",
    followUps: [
      { on: "low", ask: "What makes it hard to describe?" },
      { on: "high", ask: "What would someone else say you do?" },
    ],
  };
  const b3: BaselineBeat = {
    question: "B3",
    answer: "text",
    followUps: [{ on: "fear", ask: "What's the worst version of how that lands?" }],
  };

  const records: BaselineRecord[] = [
    recordBaseline(b1, "about a 2"),
    recordBaseline(b1, "a 3"),
    recordBaseline(b1, "2 or 3"),
    recordBaseline(b1, "rather not", { declined: true }),
    recordBaseline(b3, "I'd feel like I was bragging"),
    recordBaseline(b3, "skip this one", { declined: true }),
  ];
  for (const r of records) {
    if (r.layer !== 1) fail(`${r.question} recorded at layer ${r.layer}`);
    if (r.verbatim === "") fail(`${r.question} dropped the user's words`);
    // Compile-time half of the same guarantee: the day `layer` widens to `number`,
    // this line stops compiling and the ratchet catches it before a review does.
    const literal: 1 = r.layer;
    if (literal !== 1) fail("unreachable");
  }
  if (isCoachingInput()) fail("a baseline must never be a coaching input");

  if (failures === before) ok(`${records.length} records, all layer 1, verbatim kept`);
}

console.log("\nFollow-ups fire on a band, and only on a band");
{
  const before = failures;
  const b1: BaselineBeat = {
    question: "B1",
    answer: "scale_1_5",
    followUps: [
      { on: "low", ask: "low ask" },
      { on: "high", ask: "high ask" },
    ],
  };

  if (recordBaseline(b1, "about a 2").followUp !== "low ask") fail("a 2 must earn the low ask");
  if (recordBaseline(b1, "solid 5").followUp !== "high ask") fail("a 5 must earn the high ask");
  if (recordBaseline(b1, "a 3").followUp !== null) fail("a 3 must earn no follow-up");
  if (recordBaseline(b1, "2 or 3").followUp !== null) {
    fail("an unreadable answer must not earn a follow-up on a guessed band");
  }
  if (recordBaseline(b1, "about a 2", { declined: true }).followUp !== null) {
    fail("a declined baseline must not carry a follow-up");
  }

  const b3: BaselineBeat = {
    question: "B3",
    answer: "text",
    followUps: [{ on: "fear", ask: "fear ask" }],
  };
  if (recordBaseline(b3, "worried I'd be judged").followUp !== "fear ask") {
    fail("a fear barrier must earn the fear ask");
  }
  if (recordBaseline(b3, "just time really").followUp !== null) {
    fail("a time barrier has no follow-up written for it yet");
  }
  if (failures === before) ok("low/high/fear only; 3, unreadable and declined earn nothing");
}

console.log("\nDeclining is recorded, not dropped");
{
  const before = failures;
  const scale = recordBaseline({ question: "B2", answer: "scale_1_5" }, "skip", { declined: true });
  if (!scale.declined || scale.score !== null) fail("a declined scale must be declined with no score");
  if (scale.barrier !== null) fail("a scale has no barrier, declined or not");

  const text = recordBaseline({ question: "B3", answer: "text" }, "skip", { declined: true });
  if (!text.declined || text.barrier !== "unknown") {
    fail(`a declined B3 must record barrier 'unknown', got ${text.barrier}`);
  }
  if (failures === before) ok("declined baselines keep their shape — a hole in the cohort is worse");
}

console.log("\nThe re-measurement cadence is hers");
{
  const before = failures;
  if (REMEASUREMENT.length !== 3) fail(`expected T1/T2/T3, got ${REMEASUREMENT.length} points`);
  const t2 = REMEASUREMENT[1];
  const t3 = REMEASUREMENT[2];
  if (t2.afterDays !== 30) fail(`T2 is ${t2.afterDays} days, should be 30`);
  if (t3.afterDays !== 90) fail(`T3 is ${t3.afterDays} days, should be 90`);
  if (t3.asks.length !== 3) fail("T3 re-asks B3 as well as the two scales");
  if (REMEASUREMENT[0].asks.length !== 2 || t2.asks.length !== 2) {
    fail("T1 and T2 re-ask the two scales only");
  }
  if (failures === before) ok("T1 → T2 at 30d → T3 at 90d, B3 only at T3");
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);

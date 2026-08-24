/**
 * Phase 3.5 turn planning — what gets stored, what gets asked again, what gets skipped.
 *
 * Run:  npx tsx server/wing/baseline-turn.test.ts
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────
 * `baselines.ts` decides what a number means. This module decides *whether the thing
 * the user just wrote is a number at all*, which is a different question and a more
 * dangerous one to get wrong:
 *
 *   · The follow-up trap. B1 low asks "is it that you don't know, or that you know
 *     but can't get it out?" — and by then `nextBeat` has moved to B2. Parse that
 *     answer as B2's score and "I freeze one on one" records a 1 for a question the
 *     user was never asked. This is the reason `_asked` exists.
 *   · One re-ask, then move on. Two is nagging; three is the loop her "if user still
 *     resists → skip" is written to prevent, and an unsatisfied beat loops forever
 *     because `nextBeat` keeps returning it.
 *   · The field is derived, not listed. If a future baseline beat arrives without a
 *     `baseline_`-prefixed capture field, this module returns "none" and the baseline
 *     is silently never recorded. That is asserted rather than assumed.
 */
import { BEATS, followUpFor, type Beat } from "./intake-beats";
import {
  MAX_ATTEMPTS,
  askedFor,
  baselineField,
  bandOf,
  describePlan,
  isBaselineBeat,
  isCodeOwnedField,
  planBaselineTurn,
  planTurn,
  readAsked,
  renderBaselineGuidance,
  verbatimField,
  type Asked,
} from "./baseline-turn";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

const beat = (key: string): Beat => {
  for (const b of BEATS) if (b.key === key) return b;
  throw new Error(`no beat ${key}`);
};
const asked = (key: string, opts?: { followUp?: boolean; attempt?: number }): Asked =>
  askedFor(key, opts) as Asked;

console.log("\nbaseline-turn\n");

console.log("Only a baseline question produces a baseline");
{
  const before = failures;
  if (planBaselineTurn({ asked: null, text: "a 2" }).kind !== "none") {
    fail("with nothing asked, a stray number must not become a score");
  }
  if (planBaselineTurn({ asked: asked("why_here"), text: "a 2" }).kind !== "none") {
    fail("a Phase 1 answer that happens to contain a number is not a baseline");
  }
  if (planBaselineTurn({ asked: asked("no_such_beat"), text: "a 2" }).kind !== "none") {
    fail("an unknown beat key must be inert, not a crash");
  }
  if (failures === before) ok("null, Q-beats and unknown keys all → none");
}

console.log("\nThe follow-up trap");
{
  const before = failures;
  /*
   * The whole reason `_asked.followUp` exists. Both of these arrive on a turn where
   * `nextBeat` has already moved to B2, and the second one contains a number.
   */
  const answers: string[] = [
    "I know but I can't get it out",
    "I freeze one on one, group settings are fine",
    "tried it and hated it",
    /*
     * The dangerous one, and the reason it is dangerous is that it is natural. This is
     * an answer to B1's *high* follow-up, "what makes you confident it's working?" —
     * and it contains "a 4". Parsed as B2, it records a comfort-with-posting score of
     * 4 for a question the user was never asked, bands it high, and fires B2's high
     * follow-up about what they post. Nothing in the transcript looks wrong.
     */
    "people ask me to explain it and it lands, so maybe a 4 is fair",
  ];
  for (const a of answers) {
    const plan = planBaselineTurn({ asked: asked("positioning_clarity", { followUp: true }), text: a });
    if (plan.kind !== "none") {
      fail(`a follow-up answer was planned as ${plan.kind}: "${a}"`);
    }
  }
  // Without the flag it really would have scored, which is what makes the flag load-bearing.
  const unguarded = planBaselineTurn({ asked: asked("visibility_now"), text: answers[3] });
  if (unguarded.kind !== "recorded" || (unguarded.kind === "recorded" && unguarded.record.score !== 4)) {
    fail(`fixture no longer demonstrates the trap — got ${unguarded.kind}`);
  }
  if (failures === before) ok("follow-up answers are never parsed as scores; the trap fixture still bites");
}

console.log("\nB1 — a readable score, banded, with her follow-up");
{
  const before = failures;
  const plan = planBaselineTurn({ asked: asked("positioning_clarity"), text: "honestly about a 2" });
  if (plan.kind !== "recorded") {
    fail(`expected recorded, got ${plan.kind}`);
  } else {
    if (plan.fields.baseline_positioning_clarity !== 2) {
      fail(`stored ${String(plan.fields.baseline_positioning_clarity)}, expected 2`);
    }
    if (plan.record.layer !== 1) fail("a baseline record must be layer 1");
    if (plan.record.verbatim !== "honestly about a 2") fail("the user's words were not kept");
    if (bandOf(plan) !== "low") fail(`banded ${bandOf(plan)}, expected low`);

    const expected = followUpFor(beat("positioning_clarity"), 2)?.ask ?? "";
    if (plan.followUpAsk !== expected) fail("the follow-up is not the one the beat defines");
    if ((plan.followUpAsk ?? "").indexOf("can't get it out") < 0) {
      fail("B1's low follow-up has been reworded away from her phrasing");
    }

    const guidance = renderBaselineGuidance(plan) ?? "";
    if (guidance.indexOf(expected) < 0) fail("the follow-up is not in the turn guidance");
    if (guidance.indexOf("only this") < 0) fail("the guidance must stop the model stacking a second question");
  }
  if (failures === before) ok("2 → low, her follow-up quoted, one question only");
}

console.log("\nA 3 earns no follow-up and no special guidance");
{
  const before = failures;
  const plan = planBaselineTurn({ asked: asked("positioning_clarity"), text: "3" });
  if (plan.kind !== "recorded") fail(`expected recorded, got ${plan.kind}`);
  if (plan.kind === "recorded") {
    if (plan.fields.baseline_positioning_clarity !== 3) fail("a 3 must still be stored");
    if (plan.followUpAsk !== null) fail("a 3 is neither low nor high — no follow-up");
    if (renderBaselineGuidance(plan) !== null) {
      fail("with nothing special to say, the ordinary next-beat instruction must stand");
    }
  }
  if (failures === before) ok("3 stored, no follow-up, no guidance override");
}

console.log("\nOne re-ask, then the baseline is declined");
{
  const before = failures;

  const first = planBaselineTurn({ asked: asked("positioning_clarity"), text: "hard to put a number on it" });
  if (first.kind !== "reask") fail(`first unreadable answer → ${first.kind}, expected reask`);
  if (first.kind === "reask") {
    if (first.attempt !== 2) fail(`re-ask should carry attempt 2, got ${first.attempt}`);
    const g = renderBaselineGuidance(first) ?? "";
    if (g.indexOf("only time you ask again") < 0) fail("the guidance must say this is the last ask");
    if (g.toLowerCase().indexOf("skip") < 0) fail("the re-ask must offer a way out");
  }

  const second = planBaselineTurn({
    asked: asked("positioning_clarity", { attempt: 2 }),
    text: "I really can't say",
  });
  if (second.kind !== "declined") fail(`second unreadable answer → ${second.kind}, expected declined`);
  if (second.kind === "declined") {
    if (second.fields.baseline_positioning_clarity !== "declined") {
      fail("a declined baseline must still fill the field, or nextBeat asks a third time");
    }
    if (!second.record.declined || second.record.score !== null) fail("declined with no score");
    if (second.record.layer !== 1) fail("a declined baseline is still layer 1");
    if (second.record.verbatim !== "I really can't say") fail("the refusal's wording is still data");
    const g = renderBaselineGuidance(second) ?? "";
    if (g.indexOf("Do not acknowledge the skip") < 0) fail("a skip should not be remarked on");
  }

  if (MAX_ATTEMPTS !== 2) fail(`MAX_ATTEMPTS is ${MAX_ATTEMPTS}; one re-ask means 2`);
  if (failures === before) ok("unreadable → re-ask → declined, and the field is filled either way");
}

console.log("\nTwo numbers is a re-ask that names them");
{
  const before = failures;
  const plan = planBaselineTurn({ asked: asked("visibility_now"), text: "somewhere between a 2 and a 3" });
  if (plan.kind !== "reask") fail(`"2 and a 3" → ${plan.kind}, expected reask`);
  if (plan.kind === "reask") {
    if (!plan.ambiguous) fail("two candidates must be reported as ambiguous");
    if (plan.candidates.join(",") !== "2,3") fail(`candidates were ${plan.candidates.join(",")}`);
    const g = renderBaselineGuidance(plan) ?? "";
    if (g.indexOf("2 and 3") < 0) fail("the guidance should name the two numbers back to them");
  }
  if (failures === before) ok("ambiguous → re-ask naming both numbers");
}

console.log("\nB2 writes the derived field, not the legacy free-text ones");
{
  const before = failures;
  const plan = planBaselineTurn({ asked: asked("visibility_now"), text: "solid 4" });
  if (plan.kind !== "recorded") fail(`expected recorded, got ${plan.kind}`);
  if (plan.kind === "recorded") {
    if (plan.fields.baseline_content_comfort !== 4) {
      fail(`B2 stored ${JSON.stringify(plan.fields)}, expected baseline_content_comfort: 4`);
    }
    if ("activity_level" in plan.fields || "content_activity" in plan.fields) {
      fail("the legacy free-text fields on B2 belong to the model, not to this code");
    }
    if (bandOf(plan) !== "high") fail("a 4 bands high");
    if ((plan.followUpAsk ?? "").indexOf("usually post about") < 0) {
      fail("B2's high follow-up should be the content-signal question");
    }
  }
  if (failures === before) ok("baseline_content_comfort only, high band, content-signal follow-up");
}

console.log("\nB3 always records — the verbatim is the part that matters");
{
  const before = failures;

  const fear = planBaselineTurn({
    asked: asked("visibility_feeling"),
    text: "honestly I'd feel like I was bragging",
  });
  if (fear.kind !== "recorded") fail(`B3 → ${fear.kind}, expected recorded`);
  if (fear.kind === "recorded") {
    if (fear.fields.baseline_barrier_category !== "fear_judgment") {
      fail(`B3 category was ${String(fear.fields.baseline_barrier_category)}`);
    }
    if (fear.fields.visibility_concerns !== "honestly I'd feel like I was bragging") {
      fail("B3's verbatim must land in the free-text field as well as the record");
    }
    if ((fear.followUpAsk ?? "").indexOf("whose judgment") < 0) {
      fail("a fear barrier earns her judgment follow-up");
    }
  }

  /*
   * Nothing in her six categories matches this, and that is not a failure — it is an
   * `unknown` with the words kept, which is what H-602 reads.
   */
  const odd = planBaselineTurn({ asked: asked("visibility_feeling"), text: "the algorithm, mostly" });
  if (odd.kind !== "recorded") fail(`an unclassifiable B3 → ${odd.kind}, expected recorded`);
  if (odd.kind === "recorded") {
    if (odd.fields.baseline_barrier_category !== "unknown") fail("expected the unknown category");
    if (odd.fields.visibility_concerns !== "the algorithm, mostly") fail("verbatim lost on unknown");
    if (odd.followUpAsk !== null) fail("unknown earns no follow-up");
  }
  if (failures === before) ok("fear → category + follow-up; unclassifiable → unknown, words kept");
}

console.log("\nThe field derivation holds for every baseline beat");
{
  const before = failures;
  /*
   * planBaselineTurn returns "none" when a baseline beat has no `baseline_`-prefixed
   * capture field — which would mean the baseline is silently never recorded. So the
   * assumption behind the derivation is asserted, not trusted.
   */
  let count = 0;
  for (const b of BEATS) {
    if (!isBaselineBeat(b)) continue;
    count++;
    if (!baselineField(b)) fail(`${b.key} (${b.question}) has no baseline_ capture field`);
    if (b.answer === "text" && !verbatimField(b)) {
      fail(`${b.key} keeps a verbatim but has no free-text field to put it in`);
    }
    if (b.answer === "scale_1_5" && !b.followUps) {
      fail(`${b.key} is a scale with no follow-ups — low and high earn nothing`);
    }
  }
  if (count !== 3) fail(`expected B1, B2 and B3, found ${count} baseline beats`);
  if (isCodeOwnedField("activity_level")) fail("legacy free-text fields are not code-owned");
  if (!isCodeOwnedField("baseline_positioning_clarity")) fail("baseline_ fields are code-owned");
  if (failures === before) ok(`${count} baseline beats, all derivable, code-owned prefix holds`);
}

console.log("\n_asked survives a round trip and shrugs off rubbish");
{
  const before = failures;
  const a = askedFor("positioning_clarity", { followUp: true, attempt: 2 });
  const back = readAsked({ _asked: a });
  if (!back || back.beat !== "positioning_clarity" || !back.followUp || back.attempt !== 2) {
    fail(`round trip lost something: ${JSON.stringify(back)}`);
  }
  if (askedFor(null) !== null) fail("no beat to ask means no _asked");

  const rubbish: unknown[] = [undefined, null, "positioning_clarity", 3, [], {}, { beat: "" }, { beat: 7 }];
  for (const r of rubbish) {
    if (readAsked({ _asked: r }) !== null) fail(`readAsked accepted ${JSON.stringify(r)}`);
  }
  const partial = readAsked({ _asked: { beat: "visibility_now" } });
  if (!partial || partial.attempt !== 1 || partial.followUp) {
    fail("a bare beat should default to attempt 1, not a follow-up");
  }
  if (failures === before) ok("round trip holds; 8 malformed shapes read as null");
}

console.log("\nEvery plan can describe itself for the log");
{
  const before = failures;
  const plans = [
    planBaselineTurn({ asked: null, text: "x" }),
    planBaselineTurn({ asked: asked("positioning_clarity"), text: "a 2" }),
    planBaselineTurn({ asked: asked("positioning_clarity"), text: "no idea" }),
    planBaselineTurn({ asked: asked("positioning_clarity", { attempt: 2 }), text: "no idea" }),
    planBaselineTurn({ asked: asked("visibility_feeling"), text: "worried I'd be judged" }),
  ];
  for (const p of plans) {
    const d = describePlan(p);
    if (!d.trim()) fail(`${p.kind} has no log line`);
  }
  if (describePlan(plans[1]).indexOf("layer 1") < 0) fail("the log should show the layer tag");
  if (failures === before) ok("log lines present for all five plan shapes");
}

/* ── The whole sequence ─────────────────────────────────────────────────── */

/**
 * Drives `planTurn` the way `respond` does, with the store simulated.
 *
 * `respond` persists `turn.fields`, then the model's extraction, then `_asked`. This
 * does the same three writes to a plain object, which is enough to walk an entire
 * intake without a database or a model — and an entire intake is the only place the
 * ordering bugs are visible.
 */
function walk(opts: { answers: Record<string, string>; followUpAnswer?: string; limit?: number }) {
  let captured: Record<string, unknown> = { _asked: askedFor("why_here") };
  const askedLog: string[] = ["why_here"];
  const followUps: string[] = [];
  const records: Array<{ beat: string; score: number | null; declined: boolean; layer: number }> = [];
  let wrapped = false;

  for (let i = 0; i < (opts.limit ?? 40); i++) {
    const a = readAsked(captured);
    if (!a) break;

    const text = a.followUp
      ? opts.followUpAnswer ?? "a bit of both, honestly"
      : opts.answers[a.beat] ?? "something plausible about my work";

    const turn = planTurn({ population: null, captured, text });

    if (turn.record) {
      records.push({
        beat: turn.record.beat,
        score: turn.record.entry.score,
        declined: turn.record.entry.declined,
        layer: turn.record.entry.layer,
      });
    }

    // The model's extraction, simulated: it fills the answered beat's first field.
    const extracted: Record<string, unknown> = {};
    if (turn.answeredBeat) {
      const b = beatOrNull(turn.answeredBeat);
      if (b && !isBaselineBeat(b)) extracted[b.captures[0]] = text;
    }

    captured = { ...captured, ...turn.fields, ...extracted, _asked: turn.nextAsked };

    if (turn.beat) askedLog.push(turn.beat.key);
    if (turn.suppressBeat) followUps.push(turn.baseline.kind === "recorded" ? turn.baseline.beat : "?");
    if (turn.wrapUp) {
      wrapped = true;
      break;
    }
  }

  return { askedLog, followUps, records, wrapped, captured };
}

function beatOrNull(key: string): Beat | null {
  for (const b of BEATS) if (b.key === key) return b;
  return null;
}

console.log("\nA whole intake, end to end");
{
  const before = failures;
  const w = walk({
    answers: {
      positioning_clarity: "about a 2",
      visibility_now: "solid 4",
      visibility_feeling: "honestly I'd feel like I was bragging",
    },
  });

  const expected = BEATS.map((b) => b.key);
  if (w.askedLog.join(" → ") !== expected.join(" → ")) {
    fail(`the sequence was\n      ${w.askedLog.join(" → ")}\n    expected\n      ${expected.join(" → ")}`);
  }
  for (const k of expected) {
    const n = w.askedLog.filter((x) => x === k).length;
    if (n !== 1) fail(`${k} was asked ${n} times`);
  }
  if (!w.wrapped) fail("the intake never reached its closing turn");

  if (w.records.length !== 3) fail(`expected 3 baseline records, got ${w.records.length}`);
  for (const r of w.records) {
    if (r.layer !== 1) fail(`${r.beat} recorded at layer ${r.layer}`);
    if (r.declined) fail(`${r.beat} was declined on a walk where every answer was readable`);
  }
  if (w.records[0]?.score !== 2 || w.records[1]?.score !== 4) {
    fail(`scores were ${w.records.map((r) => r.score).join(",")}, expected 2 then 4 then null`);
  }
  if (w.followUps.length !== 3) {
    fail(`expected a follow-up after each baseline, got ${w.followUps.length}`);
  }
  if (failures === before) {
    ok(`${expected.length} beats each asked once, 3 records, 3 follow-ups, closed cleanly`);
  }
}

console.log("\nA banked answer is visible to the prompt on the turn it is given");
{
  const before = failures;
  /*
   * The prompt's ALREADY KNOWN block is built from `turn.captured`, not from what was
   * in the database when the turn started. Leave the banked field out of it and Wing is
   * told that a question the user has just answered is still open — on a 3, where no
   * follow-up intervenes, that is a model with the next beat in front of it and a gap
   * where the last answer should be.
   */
  const turn = planTurn({
    population: null,
    captured: { _asked: askedFor("positioning_clarity") },
    text: "3",
  });
  if (turn.captured.baseline_positioning_clarity !== 3) {
    fail("the score was banked but not folded into the state the prompt is built from");
  }
  if (turn.fields.baseline_positioning_clarity !== 3) fail("nothing was queued for persistence");
  if (!turn.record || turn.record.beat !== "positioning_clarity") fail("no record to append");
  if (failures === before) ok("banked, folded, and queued for the store in one pass");
}

console.log("\nAn intake where the baselines are refused");
{
  const before = failures;
  const w = walk({
    answers: {
      positioning_clarity: "I really couldn't put a number on that",
      visibility_now: "no idea honestly",
      visibility_feeling: "skip",
    },
  });

  // Each scale is asked, re-asked once, then declined — and the sequence still ends.
  const b1 = w.askedLog.filter((k) => k === "positioning_clarity").length;
  if (b1 !== 2) fail(`B1 should be asked exactly twice — once, then one re-ask; got ${b1}`);
  if (w.askedLog.filter((k) => k === "visibility_now").length !== 2) fail("B2 should re-ask once too");
  if (!w.wrapped) fail("a refused baseline must not stall the intake");

  const declined = w.records.filter((r) => r.declined);
  if (declined.length !== 2) fail(`expected B1 and B2 declined, got ${declined.length}`);
  for (const r of declined) {
    if (r.layer !== 1) fail("a declined baseline is still layer 1");
    if (r.score !== null) fail("a declined baseline has no score");
  }
  if (w.captured.baseline_positioning_clarity !== "declined") {
    fail("the field must be filled on decline, or the beat is asked forever");
  }
  if (failures === before) ok("one re-ask each, then declined, and the intake still closes");
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);

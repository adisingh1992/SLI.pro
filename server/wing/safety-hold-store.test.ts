/**
 * The safety hold, as the outbound path sees it.
 *
 * Run:  npx tsx server/wing/safety-hold-store.test.ts
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────
 * `suppression.ts` already proves the rules. This proves the two things that only exist
 * once a database is in front of them, and both are the kind that pass review and fail in
 * production:
 *
 *   1. **A read that throws must HOLD, not send.** Everywhere else in this codebase, not
 *      knowing counts as satisfied, because the cost of a false positive is a wasted rule
 *      in a prompt. Here the cost of a false negative is an automated message to someone
 *      who wrote something frightening. The default has to invert, and an inverted default
 *      is exactly what a later refactor "tidies" back.
 *   2. **The state has to be assembled from the right rows.** A hold lifts because the
 *      person came back — so reading Wing's own turns as evidence of a return would let
 *      Wing lift its own hold by talking.
 */
import { readFileSync } from "node:fs";
import { isSuppressed } from "./suppression";
import { loadHoldState, maySend, reportsCrisis } from "./safety-hold-store";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_756_000_000_000;
const iso = (t: number) => new Date(t).toISOString();

/** A db whose two queries return whatever the test says, in call order. */
function fakeDb(holds: Record<string, unknown>[], lastUserTurn: string | null) {
  let call = 0;
  return {
    execute: async () => {
      call++;
      return { rows: call === 1 ? holds : [{ at: lastUserTurn }] };
    },
  };
}

console.log("\nsafety-hold-store\n");

console.log("A holds table that cannot be read stops outbound contact");
{
  const before = failures;
  const broken = {
    execute: async () => {
      throw new Error("connection terminated");
    },
  };
  const v = await maySend(broken, 42, "micro_journal", NOW);
  if (v.allowed) {
    fail("a failed read let a message through — this must fail closed, not open");
  }
  if (v.why.indexOf("connection terminated") < 0) {
    fail("the reason should carry the underlying error so it is diagnosable");
  }

  /*
   * And the inverse, so this is not just "returns false always": a healthy read with no
   * hold has to allow. A gate that never opens is as broken as one that never closes, and
   * it would stop every dormancy sequence on the platform.
   */
  const healthy = await maySend(fakeDb([], null), 42, "micro_journal", NOW);
  if (!healthy.allowed) fail("no hold means send");
  if (failures === before) ok("a broken read holds; a healthy read with no hold sends");
}

console.log("\nWing talking is never what lifts a hold on Wing talking");
{
  const before = failures;
  /*
   * The bug this guards. `lastUserInitiatedAt` is the lift, and the transcript models why
   * a turn happened rather than who spoke — `ai_prompt` and `ai_adapted` are Wing. If the
   * query counted those, Wing's own day-8 message would register as the user returning
   * and lift the hold that stopped it. Self-clearing, and it would look like the feature
   * working.
   */
  const held = [{ rule: "IG-S01", fired_at: iso(NOW - 10 * DAY), returned_at: null, soft_check_in_sent_at: null, note: null }];

  /*
   * The filter itself lives in SQL, so a fake db cannot exercise it — it returns whatever
   * the test hands back regardless of the query. Asserting on the source is crude and it
   * is the only thing here that is actually true: the query must restrict to human turn
   * types, and must not name an ai_ one.
   */
  const src = readFileSync(new URL("./safety-hold-store.ts", import.meta.url), "utf8");
  const query = src.slice(src.indexOf("transcript_turns"), src.indexOf("const rows ="));
  for (const t of ["human_elicited_response", "human_spontaneous", "human_correction"]) {
    if (query.indexOf(t) < 0) fail(`the return query must count ${t}`);
  }
  for (const t of ["ai_prompt", "ai_adapted"]) {
    if (query.indexOf(t) >= 0) fail(`${t} is Wing talking and must not count as a return`);
  }
  if (query.indexOf("turn_type") < 0) {
    fail("no turn_type filter at all — every Wing message would read as the user returning");
  }

  // No human turn since the hold: still held, whatever else is in the transcript.
  const silent = await loadHoldState(fakeDb(held, iso(NOW - 12 * DAY)), 42);
  if (!isSuppressed("radar", silent, NOW).suppressed) {
    fail("a user who has not written since the hold is still held");
  }

  // A human turn after the minimum: the hold lifts.
  const returned = await loadHoldState(fakeDb(held, iso(NOW - 1 * DAY)), 42);
  if (isSuppressed("radar", returned, NOW).suppressed) {
    fail("the user came back after the minimum, so the hold should have lifted");
  }
  if (failures === before) ok("a human turn lifts it; silence does not");
}

console.log("\nThe minimum is a floor, not a countdown");
{
  const before = failures;
  const day2 = [{ rule: "IG-S01", fired_at: iso(NOW - 2 * DAY), returned_at: null, soft_check_in_sent_at: null, note: null }];

  // Back on day two. Recorded, and it changes nothing until day seven.
  const early = await loadHoldState(fakeDb(day2, iso(NOW - 1 * DAY)), 42);
  if (!isSuppressed("check_in", early, NOW).suppressed) {
    fail("returning inside the seven-day minimum must not lift the hold");
  }

  // And no channel is exempt, which is the half people assume has an exception.
  for (const kind of ["reveal", "radar", "micro_journal", "heartbeat", "email", "sms", "push"] as const) {
    if (!isSuppressed(kind, early, NOW).suppressed) fail(`${kind} was not held`);
  }
  if (failures === before) ok("day two holds every channel, even with the user back");
}

console.log("\nA previous hold's check-in does not spend the current one's");
{
  const before = failures;
  /*
   * Newest first, and the newest hold's `soft_check_in_sent_at` is the one that counts.
   * Reading any row's would mean a person who had a hold in March gets no check-in for
   * the one in August — silence where her ruling permits exactly one message.
   */
  const rows = [
    { rule: "IG-S01", fired_at: iso(NOW - 31 * DAY), returned_at: null, soft_check_in_sent_at: null, note: null },
    { rule: "IG-S01", fired_at: iso(NOW - 200 * DAY), returned_at: iso(NOW - 190 * DAY), soft_check_in_sent_at: iso(NOW - 170 * DAY), note: null },
  ];
  const state = await loadHoldState(fakeDb(rows, null), 42);
  if (state.softCheckInSentAt !== null) {
    fail("the current hold has sent no check-in; an older hold's must not count");
  }
  if (state.holds.length !== 2) fail("both holds are history and both should load");
  if (failures === before) ok("the newest hold's check-in is the one that counts");
}

console.log("\nOnly a real boolean true opens a hold");
{
  const before = failures;
  /*
   * The value comes from JSON.parse of model output. `if (parsed.safetyHold)` reads fine
   * and opens a hold on the STRING "false", which a model returns often enough to matter.
   */
  if (!reportsCrisis(true)) fail("a boolean true must open a hold");
  for (const noise of ["false", "true", "yes", 1, 0, null, undefined, {}, [], ""]) {
    if (reportsCrisis(noise)) fail(`${JSON.stringify(noise)} must not open a hold`);
  }
  if (failures === before) ok("true opens it; every other JSON shape does not");
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);

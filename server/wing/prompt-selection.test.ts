/**
 * Choosing which prompt to send.
 *
 * Each of her rules gets a test that fails when the rule stops holding, and the draw is
 * tested with an injected random so the 2:1 ratio is an assertion rather than an
 * observation. The interesting failures here are silent ones — a filter that lets an
 * executive-only prompt through, a cap that checks too late, a rotation that does nothing
 * while reporting that it did.
 */
import {
  eligible,
  selectPrompt,
  weightOf,
  type Candidate,
  type SelectionContext,
} from "./prompt-selection";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ok — ${detail}`);
  else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

let nextId = 1;
const c = (over: Partial<Candidate> = {}): Candidate => ({
  id: nextId++,
  active: true,
  populationTags: null,
  cadence: "micro_journal",
  library: "approachable",
  signalCategory: [],
  eventSensitive: false,
  ...over,
});

const base: SelectionContext = {
  studentTags: ["undergraduate", "early_career"],
  cadence: "micro_journal",
  recentPromptIds: [],
  recentCategories: [],
  sentToday: false,
  knownEvents: [],
};

const ctx = (over: Partial<SelectionContext> = {}): SelectionContext => ({ ...base, ...over });

/** A random that walks a fixed sequence, so a weighted draw is reproducible. */
const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

console.log("\nprompt selection — B2's rotating, varied\n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1. IG-MJ05 is checked before anything else.
 *
 * Order matters: the cap is about whether Wing speaks today, not about which prompt is
 * best. A version that filtered first and capped last would return null just the same, and
 * would have done the work of choosing a prompt that must not be sent — but more
 * importantly it would report `eligible` counts for a send that never happens, which is a
 * log line that reads as a near miss.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("One prompt per day, and the cap is decided before anything is chosen");
{
  const pool = [c(), c(), c()];
  const capped = selectPrompt(pool, ctx({ sentToday: true }), seq([0]));
  const open = selectPrompt(pool, ctx({ sentToday: false }), seq([0]));

  const ok =
    capped.promptId === null &&
    capped.eligible === 0 &&
    /IG-MJ05/.test(capped.why) &&
    open.promptId !== null;

  check("cap", ok, ok ? `capped with "${capped.why}", open otherwise` : `capped=${JSON.stringify(capped)}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. The 14-day floor, and the absent fallback.
 *
 * The old code fell back to the whole pool when everything was recent. Her rule says the
 * floor holds, and the pool sizes make exhaustion unreachable — so an empty result is a
 * signal, not a case to paper over.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA prompt sent inside the window is not sent again, and there is no fallback");
{
  const pool = [c(), c(), c()];
  const all = pool.map((p) => p.id);

  const partial = selectPrompt(pool, ctx({ recentPromptIds: [pool[0].id, pool[1].id] }), seq([0]));
  const exhausted = selectPrompt(pool, ctx({ recentPromptIds: all }), seq([0]));

  const ok =
    partial.promptId === pool[2].id &&
    exhausted.promptId === null &&
    exhausted.eligible === 0 &&
    /sent inside the window/.test(exhausted.why);

  check("no-repeat", ok, ok ? "the one unsent prompt is chosen; an exhausted pool returns null with a reason" : `partial=${partial.promptId} exhausted=${JSON.stringify(exhausted)}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. Audience, cadence and activity.
 *
 * The population filter is the one whose absence is invisible in testing and obvious to a
 * student: the old selector had none, so an executive-track user was eligible for
 * "Undergraduate-Only" prompts.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nAudience, cadence and active state all filter");
{
  const mine = c({ populationTags: ["undergraduate"] });
  const theirs = c({ populationTags: ["executive"] });
  const untagged = c({ populationTags: [] });
  const wrongCadence = c({ cadence: "heartbeat" });
  const retired = c({ active: false });

  const pool = [mine, theirs, untagged, wrongCadence, retired];
  const got = eligible(pool, ctx()).map((x) => x.id).sort((a, b) => a - b);
  const want = [mine.id, untagged.id].sort((a, b) => a - b);

  /* And a student we cannot classify sees everything — the platform's fail-open rule. */
  const unknown = eligible([mine, theirs, untagged], ctx({ studentTags: [] })).length;

  const ok = got.join(",") === want.join(",") && unknown === 3;
  check("filters", ok, ok ? "wrong audience, wrong cadence and retired all excluded; an unclassified student sees all 3" : `got [${got}], want [${want}], unknown=${unknown}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. Event-sensitivity defaults to refusing.
 *
 * "Never assume the user attended an event they haven't mentioned." With no knowledge of
 * any event, an event-sensitive prompt is not eligible — the direction that costs a prompt
 * rather than the one that asks a founder how a meeting went that never happened.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nAn event-sensitive prompt waits until Wing knows about the event");
{
  const sensitive = c({ eventSensitive: true });
  const ordinary = c();

  const blind = eligible([sensitive, ordinary], ctx()).map((x) => x.id);
  const informed = eligible([sensitive, ordinary], ctx({ knownEvents: ["investor meeting"] })).map((x) => x.id);

  const ok = blind.join() === String(ordinary.id) && informed.length === 2;
  check("events", ok, ok ? "held with nothing known, eligible once Wing knows" : `blind=[${blind}] informed=[${informed}]`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. Her 2:1, as a draw rather than as an intention.
 *
 * Two candidates, weights 2 and 1, total 3. A draw below 2 takes the approachable one and
 * a draw at or above it takes the reflective one — so sweeping the unit interval gives the
 * ratio exactly, with no sampling noise.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe approachable pool is drawn twice as often as the reflective one");
{
  const approachable = c({ library: "approachable" });
  const reflective = c({ library: "reflective" });
  const pool = [approachable, reflective];

  let a = 0;
  let r = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const got = selectPrompt(pool, ctx(), seq([i / N]));
    if (got.promptId === approachable.id) a++;
    else if (got.promptId === reflective.id) r++;
  }

  const ratio = a / r;
  const ok = a + r === N && Math.abs(ratio - 2) < 0.01;
  check("weighting", ok, ok ? `${a}:${r} — ${ratio.toFixed(3)}:1 across the whole interval` : `${a}:${r} = ${ratio.toFixed(3)}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5a. A prompt with no pool competes, rather than disappearing.
 *
 * Her heartbeat prompts carry no library pool — they are a different rhythm, not one side
 * of the ratio. A default weight of zero would have made all 71 of them unselectable while
 * every filter and count still looked right.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA prompt with no pool still gets drawn");
{
  const unpooled = c({ library: null, cadence: "heartbeat" });
  const alsoUnpooled = c({ library: null, cadence: "heartbeat" });
  const hb = ctx({ cadence: "heartbeat" });

  const drawn = new Set<number | null>();
  for (let i = 0; i < 100; i++) drawn.add(selectPrompt([unpooled, alsoUnpooled], hb, seq([i / 100])).promptId);

  const ok = weightOf(unpooled, []) === 1 && drawn.size === 2 && !drawn.has(null);
  check("unpooled", ok, ok ? "weight 1, and both are reachable" : `weight=${weightOf(unpooled, [])} drawn=${Array.from(drawn).join(",")}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. Category rotation works, and reports honestly that it currently does nothing.
 *
 * Both halves matter. The rule has to be right for the day she assigns categories, and
 * until then the flag has to say it is inert — a rule that silently does nothing while a
 * log line implies otherwise is the failure this codebase keeps producing.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nCategory rotation is implemented, and reports that it is inert today");
{
  const fresh = c({ signalCategory: ["energy"] });
  const stale = c({ signalCategory: ["language"] });
  /* One entry per send, newest first — see SelectionContext.recentCategories. */
  const recent = [["language"], ["decision"], ["career"]];

  const bad: string[] = [];
  if (weightOf(stale, recent) !== 1) bad.push(`a recently used category weighs ${weightOf(stale, recent)}, expected halved`);
  if (weightOf(fresh, recent) !== 2) bad.push(`an unused category weighs ${weightOf(fresh, recent)}, expected 2`);

  const withCategories = selectPrompt([fresh, stale], ctx({ recentCategories: recent }), seq([0]));
  if (!withCategories.categoryRotationActive) bad.push("rotation ran but reported inactive");

  /* The library as it stands today: every category null. */
  const uncategorised = [c({ signalCategory: [] }), c({ signalCategory: [] })];
  const asSeeded = selectPrompt(uncategorised, ctx({ recentCategories: recent }), seq([0]));
  if (asSeeded.categoryRotationActive) bad.push("rotation reported active on a library with no categories");
  if (asSeeded.promptId === null) bad.push("an uncategorised library selected nothing");

  /* A category she has not used recently is never penalised, however long the history. */
  const longHistory = [["language"], ["decision"], ["career"], ["energy"], ["industry"]];
  if (weightOf(fresh, longHistory) !== 2) bad.push("the rotation window is not bounded — an old category still penalises");

  check("rotation", bad.length === 0, bad.length === 0 ? "halves a recent category, bounded at 3, and reports inactive on today's library" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6b. A prompt carrying several categories (0041).
 *
 * Two rules, and both are decisions rather than consequences of the data shape, so both
 * are pinned here rather than left to be inferred from the implementation:
 *
 *   ANY, not ALL — a prompt is stale when any one of its categories was covered. Under
 *   ALL, the more categories a prompt carried the harder it would be to make stale, so
 *   broadly-tagged prompts would quietly win more draws than narrow ones.
 *
 *   The window counts SENDS, not category mentions. A flattened list sliced at three
 *   would let one three-category send fill the window on its own and stop the two sends
 *   before it counting as recent — a change to her rule produced by a data shape.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA prompt with several categories is stale if any of them was covered");
{
  const bad: string[] = [];

  const both = c({ signalCategory: ["energy", "career"] });
  const oneCovered = [["career"], ["decision"], ["industry"]];
  if (weightOf(both, oneCovered) !== 1) {
    bad.push(`one covered category of two did not halve: ${weightOf(both, oneCovered)}`);
  }

  const noneCovered = [["language"], ["decision"], ["industry"]];
  if (weightOf(both, noneCovered) !== 2) {
    bad.push(`neither category covered but still halved: ${weightOf(both, noneCovered)}`);
  }

  /*
   * The window is three SENDS. `industry` is in the fourth, so it must not penalise —
   * even though a flattened reading would have it inside the first three mentions.
   */
  const wide = c({ signalCategory: ["industry"] });
  const bySend = [["energy", "career"], ["language"], ["decision"], ["industry"]];
  if (weightOf(wide, bySend) !== 2) {
    bad.push("a category four sends back still penalises — the window is counting mentions, not sends");
  }
  const inWindow = c({ signalCategory: ["career"] });
  if (weightOf(inWindow, bySend) !== 1) {
    bad.push("a category in the newest send's set did not halve");
  }

  /* An uncategorised prompt is never stale, however much history there is. */
  if (weightOf(c({ signalCategory: [] }), bySend) !== 2) {
    bad.push("an uncategorised prompt was penalised by the rotation");
  }

  check(
    "multi-category rotation",
    bad.length === 0,
    bad.length === 0
      ? "any-not-all, and the window is bounded at 3 sends rather than 3 mentions"
      : bad.join("; "),
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 7. Every eligible candidate is reachable.
 *
 * A weighted draw with an off-by-one in the running sum silently starves the first or last
 * candidate, and with 105 prompts nobody would notice. Swept across the interval rather
 * than sampled.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery eligible prompt is reachable, and none is drawn when it should not be");
{
  const pool = [
    c({ library: "approachable" }),
    c({ library: "reflective" }),
    c({ library: null }),
    c({ library: "approachable", signalCategory: ["energy"] }),
  ];
  const hit = new Map<number, number>();
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const got = selectPrompt(pool, ctx(), seq([i / N]));
    if (got.promptId !== null) hit.set(got.promptId, (hit.get(got.promptId) ?? 0) + 1);
  }

  const missed = pool.filter((p) => !hit.has(p.id));
  const drawnTotal = Array.from(hit.values()).reduce((a, b) => a + b, 0);
  const ok = missed.length === 0 && drawnTotal === N;
  check("coverage", ok, ok ? `all ${pool.length} reachable across ${N} draws, none lost` : `unreachable: ${missed.map((m) => m.id).join(",")}, drawn ${drawnTotal}/${N}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 8. A random that breaks its contract does not return undefined.
 *
 * `random()` is documented as [0, 1). A caller passing something that returns 1 — or a
 * float that sums past the total — would otherwise fall out of the loop and return
 * undefined into a send.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA misbehaving random yields a prompt, not undefined");
{
  const pool = [c(), c(), c()];
  const bad: string[] = [];
  for (const value of [1, 1.5, 0.9999999999]) {
    const got = selectPrompt(pool, ctx(), seq([value]));
    if (got.promptId === null || got.promptId === undefined) bad.push(`random()=${value} → ${got.promptId}`);
  }
  check("boundary", bad.length === 0, bad.length === 0 ? "1, 1.5 and the last representable value all return a prompt" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 9. Nothing eligible is diagnosable.
 *
 * Because it should not happen: her smallest per-student pool is 105 prompts against a
 * 14-day window at one a day. If it does, the reason is a seed or a population problem,
 * and the message has to be enough to tell which.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nAn empty result says which pool was empty and how much had been sent");
{
  const got = selectPrompt([c({ populationTags: ["executive"] })], ctx({ recentPromptIds: [9, 9, 9] }), seq([0]));
  const ok =
    got.promptId === null &&
    got.why.indexOf("micro_journal") >= 0 &&
    got.why.indexOf("1 candidate") >= 0 &&
    got.why.indexOf("3 sent") >= 0;
  check("diagnosis", ok, ok ? `"${got.why}"` : `"${got.why}"`);
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);

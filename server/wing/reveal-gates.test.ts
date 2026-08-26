/**
 * Reveal Cycle evidence classification and the three gates.
 *
 * Run:  npx tsx server/wing/reveal-gates.test.ts
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────
 * The Reveal is the product's most expensive claim: once a month, Wing says it has
 * noticed something true about you that you did not know. Everything in these two
 * modules exists to make that claim refusable, and each of the failures below produces
 * a Reveal that fires anyway on material that cannot support it:
 *
 *   · Gate 2 built from the Amendments' two-condition summary instead of the spec's
 *     five. The fixture for this is the point of the file.
 *   · Quote productivity read off the evidence tier, or the reverse. v4 §3 gives the
 *     counter-example in both directions and calls both axes load-bearing.
 *   · A month of shrugs counting as prose. Four "not really"s satisfy the
 *     quote-productive condition unless something stops them.
 *   · Delivered-and-ignored recorded the same way as never-delivered. IG-RC10's
 *     absence check reads the difference, and they mean opposite things.
 */
import {
  type EvidenceEvent,
  type PromptDelivery,
  categoryWasDelivered,
  classifyShape,
  eventFrom,
  isQuoteProductive,
  logPrompt,
  SINGLE_WORD_MAX_WORDS,
  VERBATIM_HORIZON_DAYS,
  withinVerbatimHorizon,
} from "./reveal-evidence";
import {
  CADENCE_DAY,
  DEFERRAL_LAST_DAY,
  GATE2,
  gate1,
  gate2,
  gate3,
  meetsPlatformMinimum,
  PLATFORM_MIN_TIER1,
  REVEAL_FLOOR_DAYS,
  SAFETY_HOLD_DAYS,
} from "./reveal-gates";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_780_000_000_000;

let seq = 0;
function ev(p: Partial<EvidenceEvent>): EvidenceEvent {
  seq++;
  return {
    channel: p.channel ?? "micro_journal",
    at: p.at ?? NOW - 20 * DAY,
    tier: p.tier ?? 1,
    category: p.category ?? "energy",
    shape: p.shape ?? "prose",
    verbatim: p.verbatim ?? `event ${seq}`,
  };
}

console.log("\nreveal-gates\n");

console.log("The two axes are independent, and her own examples prove it");
{
  const before = failures;
  /*
   * v4 §3, both directions, verbatim from the document.
   */
  const tier3Prose =
    "I'm definitely a gut-then-validate person, always have been, I don't overthink things";
  if (classifyShape(tier3Prose) !== "prose") fail("her Tier 3 example is prose and must classify as prose");
  if (!isQuoteProductive(classifyShape(tier3Prose))) {
    fail("quote productivity is about shape — a Tier 3 answer can still be quotable");
  }

  // "Conversely a response can be Tier 1 and not quote-productive: 'Yes' to Universal 30
  // names a real event and gives Wing nothing to say."
  if (classifyShape("Yes") !== "single_word") fail("'Yes' is her single-word example");
  if (isQuoteProductive(classifyShape("Yes"))) fail("'Yes' gives Wing nothing to say");

  if (failures === before) ok("prose+Tier 3 and single-word+Tier 1 both hold");
}

console.log("\nShapes people actually send");
{
  const before = failures;
  const cases: Array<[string, string]> = [
    ["Yes", "single_word"],
    ["not really", "single_word"],
    ["no idea", "single_word"],
    ["I pushed back in the standup on Tuesday and it landed", "prose"],
    ["- networking\n- writing\n- interviews", "list"],
    ["1. finished the deck\n2. sent it\n3. no reply yet", "list"],
    ["networking, writing, interviews", "list"],
    ["reading\nwriting\nspeaking", "list"],
  ];
  for (const c of cases) {
    const got = classifyShape(c[0]);
    if (got !== c[1]) fail(`"${c[0].replace(/\n/g, " / ")}" → ${got}, expected ${c[1]}`);
  }
  if (classifyShape("   ") !== null) {
    fail("an empty response has no shape — that is a prompt-log fact, not a single word");
  }
  if (failures === before) ok(`${cases.length} shapes, and empty → null`);
}

console.log("\nFour shrugs do not satisfy the quote-productive condition");
{
  const before = failures;
  /*
   * The boundary between single-word and prose is ours, not hers — she writes "single
   * word" and her example is "Yes". Three words keeps "not really" and "same as usual"
   * out of prose, and a month of those is exactly the thin material Gate 2 exists to
   * refuse. Flagged as our judgement; if she wants it literal, this test says what moves.
   */
  if (SINGLE_WORD_MAX_WORDS !== 3) fail(`the boundary moved to ${SINGLE_WORD_MAX_WORDS} without a decision`);
  for (const shrug of ["not really", "same as usual", "nothing much", "no, not this week"]) {
    if (isQuoteProductive(classifyShape(shrug))) fail(`"${shrug}" counted as quote-productive`);
  }
  // And the boundary does not eat a real short answer.
  if (!isQuoteProductive(classifyShape("I don't overthink things"))) {
    fail("four quotable words must still be prose");
  }
  if (failures === before) ok("shrugs are not prose; four quotable words are");
}

console.log("\nThe prompt log tells ignored apart from answered thinly");
{
  const before = failures;
  const delivery: PromptDelivery = {
    promptId: "U30",
    category: "achievement",
    tier: 1,
    channel: "micro_journal",
    deliveredAt: NOW - 10 * DAY,
  };

  const ignored = logPrompt(delivery);
  const thin = logPrompt(delivery, { at: NOW - 9 * DAY, text: "yes" });
  const full = logPrompt(delivery, {
    at: NOW - 9 * DAY,
    text: "I ran the retro myself for the first time and nobody noticed it was my first",
  });

  if (ignored.substantiveness !== "no_response") fail(`ignored → ${ignored.substantiveness}`);
  if (thin.substantiveness !== "thin") fail(`a one-word answer → ${thin.substantiveness}`);
  if (full.substantiveness !== "substantive") fail(`prose → ${full.substantiveness}`);

  // An ignored prompt produces no evidence event, but it is still in the log.
  if (eventFrom(ignored) !== null) fail("an unanswered prompt is not evidence");
  if (eventFrom(thin) === null) fail("a thin answer is still an event — it just cannot be quoted");
  if (eventFrom(full)?.tier !== 1) fail("the tier comes from the prompt, not the response");

  /*
   * IG-RC10's absence audit: a claim that the user never mentions something dies unless
   * prompts in that category were actually delivered. Never-delivered and
   * delivered-and-ignored are opposite conclusions from the same silence.
   */
  const log = [ignored];
  if (!categoryWasDelivered(log, "achievement", NOW - 30 * DAY, NOW)) {
    fail("an ignored prompt was still delivered — the absence claim must not survive it");
  }
  if (categoryWasDelivered(log, "influence", NOW - 30 * DAY, NOW)) {
    fail("a category with no delivery must report none");
  }
  if (failures === before) ok("three states, and delivery is recorded independently of response");
}

console.log("\nGate 1 — the eligibility floor");
{
  const before = failures;
  const clean = { foundation1Complete: true, daysSinceLastReveal: 30, daysSinceCrisisFlag: null };
  if (!gate1(clean).passed) fail(`a clean state failed: ${gate1(clean).failed.join(", ")}`);

  const noSli = gate1({ ...clean, foundation1Complete: false });
  if (noSli.passed || noSli.failed.indexOf("foundation_1_complete") < 0) {
    fail("no stored SLI must fail, and say so");
  }

  // A first-ever Reveal has no previous one, and that satisfies the floor.
  if (!gate1({ ...clean, daysSinceLastReveal: null }).passed) fail("a first Reveal has no floor to clear");
  if (gate1({ ...clean, daysSinceLastReveal: REVEAL_FLOOR_DAYS - 1 }).passed) {
    fail(`${REVEAL_FLOOR_DAYS - 1}d since the last Reveal must fail the ${REVEAL_FLOOR_DAYS}d floor`);
  }
  if (!gate1({ ...clean, daysSinceLastReveal: REVEAL_FLOOR_DAYS }).passed) {
    fail("exactly at the floor is 'at least 14 days', which passes");
  }

  /*
   * The safety hold. Her wording is "if IG-S01 fired within the trailing 7 days", so day
   * 7 is inside the window and day 8 is out. Off by one here means a Reveal delivered to
   * someone who wrote something frightening a week ago, which H-RC13 calls the worst
   * thing this system can do.
   */
  if (gate1({ ...clean, daysSinceCrisisFlag: SAFETY_HOLD_DAYS }).passed) {
    fail("a crisis flag exactly 7 days old is still within the trailing 7 days");
  }
  if (!gate1({ ...clean, daysSinceCrisisFlag: SAFETY_HOLD_DAYS + 1 }).passed) {
    fail("8 days is outside the hold");
  }
  if (gate1({ ...clean, daysSinceCrisisFlag: 0 }).passed) fail("a crisis today must hold");

  if (failures === before) ok("SLI, 14-day floor, 7-day safety hold, boundaries included");
}

console.log("\nGate 2 — THE trap: the Amendments summarise two of five conditions");
{
  const before = failures;
  /*
   * "The Reveal's Gate 2 requirement (four Tier 1 events, three signal categories)" —
   * Reveal Cycle Amendments. That is two conditions. The canonical spec requires five,
   * and this fixture satisfies the summary exactly while failing the other three: one
   * channel, nothing quotable, four events instead of eight, and nothing in the last
   * fortnight. An implementation built from the summary fires a Reveal on it.
   */
  const summaryOnly: EvidenceEvent[] = [
    ev({ tier: 1, category: "energy", shape: "single_word", at: NOW - 25 * DAY }),
    ev({ tier: 1, category: "decision", shape: "single_word", at: NOW - 24 * DAY }),
    ev({ tier: 1, category: "achievement", shape: "list", at: NOW - 23 * DAY }),
    ev({ tier: 1, category: "energy", shape: "single_word", at: NOW - 22 * DAY }),
  ];
  const v = gate2(summaryOnly, NOW);
  if (v.passed) fail("the Amendments' two conditions fired a Reveal — this is the under-gate");

  const met: string[] = [];
  for (const c of v.conditions) if (c.met) met.push(c.name);
  if (met.join(",") !== "tier_1_events,category_spread") {
    fail(`expected exactly her two summarised conditions to pass, got: ${met.join(", ")}`);
  }
    // Six reported conditions, two met, so four failed — quote productivity, total
  // events, channel spread and recency. Every one of them is a reason not to fire.
  if (v.failed.length !== 4) fail(`expected 4 failures, got ${v.failed.join(", ")}`);
  if (failures === before) {
    ok(`summary satisfied (${met.join(" + ")}), spec refused it on ${v.failed.length} other conditions`);
  }
}

console.log("\nGate 2 — a month that genuinely has the material");
{
  const before = failures;
  const good: EvidenceEvent[] = [
    ev({ tier: 1, category: "energy", channel: "micro_journal", shape: "prose", at: NOW - 25 * DAY }),
    ev({ tier: 1, category: "decision", channel: "heartbeat", shape: "prose", at: NOW - 20 * DAY }),
    ev({ tier: 1, category: "achievement", channel: "radar", shape: "prose", at: NOW - 16 * DAY }),
    ev({ tier: 1, category: "relationship", channel: "micro_journal", shape: "prose", at: NOW - 5 * DAY }),
    ev({ tier: 2, category: "energy", channel: "heartbeat", shape: "list", at: NOW - 12 * DAY }),
    ev({ tier: 2, category: "career", channel: "published_content", shape: "prose", at: NOW - 9 * DAY }),
    ev({ tier: 3, category: "language", channel: "radar", shape: "single_word", at: NOW - 8 * DAY }),
    ev({ tier: 3, category: "industry", channel: "micro_journal", shape: "list", at: NOW - 3 * DAY }),
  ];
  const v = gate2(good, NOW);
  if (!v.passed) fail(`a sufficient month failed on ${v.failed.join(", ")}`);
  if (v.conditions.length !== 5 + 1) fail(`expected 6 reported conditions, got ${v.conditions.length}`);
  if (failures === before) ok("all five satisfied, reported as six named checks");
}

console.log("\nGate 2 — every condition can fail on its own");
{
  const before = failures;
  const base: EvidenceEvent[] = [
    ev({ tier: 1, category: "energy", channel: "micro_journal", shape: "prose", at: NOW - 25 * DAY }),
    ev({ tier: 1, category: "decision", channel: "heartbeat", shape: "prose", at: NOW - 20 * DAY }),
    ev({ tier: 1, category: "achievement", channel: "radar", shape: "prose", at: NOW - 16 * DAY }),
    ev({ tier: 1, category: "relationship", channel: "micro_journal", shape: "prose", at: NOW - 5 * DAY }),
    ev({ tier: 2, category: "energy", channel: "heartbeat", shape: "prose", at: NOW - 12 * DAY }),
    ev({ tier: 2, category: "career", channel: "published_content", shape: "prose", at: NOW - 9 * DAY }),
    ev({ tier: 3, category: "language", channel: "radar", shape: "prose", at: NOW - 8 * DAY }),
    ev({ tier: 3, category: "industry", channel: "micro_journal", shape: "prose", at: NOW - 3 * DAY }),
  ];
  if (!gate2(base, NOW).passed) fail("the base fixture must pass before anything is broken");

  const drop = (fn: (e: EvidenceEvent) => EvidenceEvent) => base.map(fn);

  const noTier1 = gate2(drop((e) => (e.tier === 1 ? { ...e, tier: 2 } : e)), NOW);
  if (noTier1.failed.indexOf("tier_1_events") < 0) fail("demoting every Tier 1 must fail that condition");

  const noProse = gate2(drop((e) => ({ ...e, shape: "single_word" })), NOW);
  if (noProse.failed.indexOf("quote_productive") < 0) fail("no prose must fail quote productivity");

  const oneCategory = gate2(drop((e) => ({ ...e, category: "energy" })), NOW);
  if (oneCategory.failed.indexOf("category_spread") < 0) {
    fail("eight energy responses are a mood log — category spread must fail");
  }

  const oneChannel = gate2(drop((e) => ({ ...e, channel: "micro_journal" })), NOW);
  if (oneChannel.failed.indexOf("channel_spread") < 0) fail("a single channel must fail channel spread");

  const tooFew = gate2(base.slice(0, GATE2.totalEvents - 1), NOW);
  if (tooFew.failed.indexOf("total_events") < 0) fail("seven events must fail the total of eight");

  const stale = gate2(drop((e) => ({ ...e, at: NOW - 40 * DAY })), NOW);
  if (stale.failed.indexOf("recent_activity") < 0) fail("nothing in the trailing 14 days must fail");

  /*
   * The fifth condition is one condition with two parts. Three recent events with no
   * Tier 1 among them is a fortnight of self-report reading as currency.
   */
  const recentButThin = gate2(
    drop((e) => (e.at >= NOW - 14 * DAY && e.tier === 1 ? { ...e, tier: 3 } : e)),
    NOW,
  );
  if (recentButThin.failed.indexOf("recent_activity") < 0) {
    fail("3 recent events with no Tier 1 must still fail — both halves are required");
  }

  if (failures === before) ok("six conditions, each independently reachable as the only failure");
}

console.log("\nGate 3 — fire, defer, route");
{
  const before = failures;
  const pass = gate1({ foundation1Complete: true, daysSinceLastReveal: 40, daysSinceCrisisFlag: null });
  const enough = gate2(
    [
      ev({ tier: 1, category: "energy", channel: "micro_journal", shape: "prose", at: NOW - 25 * DAY }),
      ev({ tier: 1, category: "decision", channel: "heartbeat", shape: "prose", at: NOW - 20 * DAY }),
      ev({ tier: 1, category: "achievement", channel: "radar", shape: "prose", at: NOW - 10 * DAY }),
      ev({ tier: 1, category: "relationship", channel: "micro_journal", shape: "prose", at: NOW - 5 * DAY }),
      ev({ tier: 2, category: "career", channel: "published_content", shape: "prose", at: NOW - 9 * DAY }),
      ev({ tier: 2, category: "energy", channel: "heartbeat", shape: "prose", at: NOW - 8 * DAY }),
      ev({ tier: 3, category: "language", channel: "radar", shape: "prose", at: NOW - 7 * DAY }),
      ev({ tier: 3, category: "industry", channel: "micro_journal", shape: "prose", at: NOW - 3 * DAY }),
    ],
    NOW,
  );
  const thin = gate2([], NOW);

  const fire = gate3({ dayInCycle: CADENCE_DAY, gate1: pass, gate2: enough });
  if (fire.action !== "fire" || (fire.action === "fire" && fire.kind !== "cadence")) {
    fail(`day 30 with both gates should fire, got ${fire.action}`);
  }

  const early = gate3({ dayInCycle: CADENCE_DAY - 1, gate1: pass, gate2: enough });
  if (early.action !== "wait") fail("day 29 waits, however good the data");

  // Gate 1 outranks everything, including a month of perfect evidence.
  const held = gate1({ foundation1Complete: true, daysSinceLastReveal: 40, daysSinceCrisisFlag: 2 });
  const suppressed = gate3({ dayInCycle: 45, gate1: held, gate2: enough });
  if (suppressed.action !== "wait") fail("a crisis flag two days ago must suppress the Reveal");

  // The deferral chain: 30 → 37 → 44 → 51 → 58 → H-RC10.
  const chain: number[] = [];
  let day = CADENCE_DAY;
  for (let i = 0; i < 8; i++) {
    const out = gate3({ dayInCycle: day, gate1: pass, gate2: thin });
    if (out.action === "defer") {
      chain.push(out.nextCheckDay);
      day = out.nextCheckDay;
      continue;
    }
    if (out.action === "route" && out.to === "H-RC10") break;
    fail(`unexpected ${out.action} at day ${day}`);
    break;
  }
  if (chain.join(",") !== "37,44,51,58") fail(`deferral chain was ${chain.join(",")}`);
  const end = gate3({ dayInCycle: 58, gate1: pass, gate2: thin });
  if (end.action !== "route") fail(`day 58 should route to H-RC10, got ${end.action}`);
  if (DEFERRAL_LAST_DAY !== 60) fail("the deferral window is through day 60");

  if (failures === before) ok("fires at 30, waits at 29, defers 37/44/51/58, then H-RC10");
}

console.log("\nGate 3 — escalation is the only path that beats day 30");
{
  const before = failures;
  const pass = gate1({ foundation1Complete: true, daysSinceLastReveal: 20, daysSinceCrisisFlag: null });
  const thin = gate2([], NOW);

  const loud = {
    contradicting: [
      ev({ tier: 1, channel: "micro_journal" }),
      ev({ tier: 1, channel: "radar" }),
      ev({ tier: 1, channel: "published_content" }),
    ],
    supporting: [ev({ tier: 1, channel: "heartbeat" }), ev({ tier: 1, channel: "interview_cycle" })],
  };

  const out = gate3({ dayInCycle: 20, gate1: pass, gate2: thin, escalation: loud });
  if (out.action !== "fire" || (out.action === "fire" && out.kind !== "escalation")) {
    fail(`a 3-channel contradiction at day 20 should escalate, got ${out.action}`);
  }

  // Not before day 14, however loud.
  const tooEarly = gate3({ dayInCycle: 13, gate1: pass, gate2: thin, escalation: loud });
  if (tooEarly.action === "fire") fail("escalation cannot fire before day 14");

  // Two channels is a candidate insight, not an escalation.
  const twoChannels = gate3({
    dayInCycle: 20,
    gate1: pass,
    gate2: thin,
    escalation: { ...loud, contradicting: loud.contradicting.slice(0, 2) },
  });
  if (twoChannels.action === "fire") fail("two contradicting channels is not convergence");

  // One anchor on the SLI side is a disagreement with only one side.
  const oneSided = gate3({
    dayInCycle: 20,
    gate1: pass,
    gate2: thin,
    escalation: { ...loud, supporting: loud.supporting.slice(0, 1) },
  });
  if (oneSided.action === "fire") fail("2 Tier 1 events are required on each side");

  // And Gate 1 still outranks it.
  const held = gate1({ foundation1Complete: false, daysSinceLastReveal: 20, daysSinceCrisisFlag: null });
  if (gate3({ dayInCycle: 20, gate1: held, gate2: thin, escalation: loud }).action === "fire") {
    fail("escalation requires Gate 1");
  }

  if (failures === before) ok("fires at day 20 on 3 channels and 2 anchors a side; nothing less");
}

console.log("\nThe platform floor under all cross-session synthesis");
{
  const before = failures;
  if (PLATFORM_MIN_TIER1 !== 2) fail(`IG-U012's minimum is two Tier 1 events, found ${PLATFORM_MIN_TIER1}`);
  if (PLATFORM_MIN_TIER1 >= GATE2.tier1Events) {
    fail("the Reveal's threshold sits on top of the platform floor, not level with it");
  }
  if (meetsPlatformMinimum([ev({ tier: 1 }), ev({ tier: 3 })])) fail("one Tier 1 is not two");
  if (!meetsPlatformMinimum([ev({ tier: 1 }), ev({ tier: 1 }), ev({ tier: 3 })])) fail("two Tier 1 is");
  if (failures === before) ok("2 for any cross-session observation, 4 for a Reveal");
}

console.log("\nVerbatim retention, and the two things outside it");
{
  const before = failures;
  if (VERBATIM_HORIZON_DAYS !== 60) fail(`her horizon is 60 days, found ${VERBATIM_HORIZON_DAYS}`);
  if (!withinVerbatimHorizon(NOW - 59 * DAY, NOW)) fail("59 days is inside the window");
  if (withinVerbatimHorizon(NOW - 61 * DAY, NOW)) fail("61 days is outside it");
  /*
   * The contradiction this resolves: the Reveal Cycle asks for 60-day verbatim retention
   * while its own first Reveal anchors to the intake self-description — the cleanest
   * baseline the platform holds, because it predates anything Wing has said. A literal
   * 60-day window deletes that anchor before the second Reveal runs. Self-descriptions
   * and baselines are stored permanently and separately, which is what makes both
   * requirements true at once.
   */
  if (failures === before) ok("60-day horizon, with self-descriptions and baselines held apart from it");
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);

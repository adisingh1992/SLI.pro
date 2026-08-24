/**
 * Reveal selection, against H-019.5's rules and v3.3's priority order.
 *
 * Run:  npx tsx server/wing/reveal-select.test.ts
 *
 * ── WHAT THESE PROTECT ───────────────────────────────────────────────────
 * The expensive failure is a reveal that fires when it should not. Wing's entire claim
 * on the user's attention in the first five minutes is that it noticed something real;
 * a confident observation built on a blank answer or a misread trigger teaches the
 * opposite, and IG-INT06's whole point is that no reveal beats a weak one.
 *
 * So the assertions are mostly about refusal: nothing eligible must defer, an empty
 * quote slot must disqualify however well the trigger fires, a disabled template must
 * stay out, and two weak matches must never merge.
 */
import { detectTrack, type Answers } from "./audience-track";
import { revealFacts } from "./reveal-facts";
import {
  TEMPLATES,
  assess,
  falsifiable,
  igInt12Violations,
  selectReveal,
  trackRelevant,
} from "./reveal-select";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

/** Classify then select, the way the conversation will. */
const run = (answers: Answers) =>
  selectReveal(revealFacts(answers, detectTrack(answers).track));

console.log("\nreveal-select\n");

console.log("The table itself");
{
  const before = failures;
  if (TEMPLATES.length !== 14) fail(`expected 14 templates, found ${TEMPLATES.length}`);
  if (TEMPLATES.some((t) => t.code === "RT-14")) {
    fail("RT-14 is retired — it failed the substitution test and must not be in the table");
  }
  const codes = TEMPLATES.map((t) => t.code);
  if (new Set(codes).size !== codes.length) fail("duplicate template code");
  for (const t of TEMPLATES) {
    if (!t.quotes.length) fail(`${t.code} quotes nothing, so it can never be falsifiable`);
    if (!t.restsOn.length) fail(`${t.code} rests on nothing`);
    if (!t.enabled && !t.disabledBecause) fail(`${t.code} is disabled with no reason given`);
  }
  if (failures === before) ok(`14 templates, RT-14 absent, every one able to quote something`);
}

console.log("\nIG-INT12 — no inference rests on a single self-assessment");
{
  const before = failures;
  /*
   * v3.3's hardened rule. Checked over the table rather than trusted, because the
   * violation is invisible in the copy: a template quoting Q6 and inferring from Q6
   * alone produces Barnum inside quotation marks, which the gate calls worse than
   * unquoted Barnum because the marks signal evidence.
   */
  const violations = igInt12Violations();
  if (violations.length) fail(`IG-INT12 violated: ${violations.join("; ")}`);
  if (failures === before) ok("every template quoting Q6 or Q7 rests on two or more answers");
}

console.log("\nRT-06 is held out until the corrected copy arrives");
{
  const before = failures;
  const rt06 = TEMPLATES.find((t) => t.code === "RT-06")!;
  if (rt06.enabled) {
    fail("RT-06 is enabled, but its card still infers from Q6 alone and fails v3.3's IG-INT12");
  }
  // Its trigger would fire on this, and it still must not be selected.
  const answers: Answers = {
    Q2: "Working full-time, two years in",
    Q4: "I want a promotion",
    Q5: "I'm an analyst at Deloitte",
    Q6: "I guess I'm pretty good at untangling messy briefs",
  };
  const s = run(answers);
  if (s.outcome === "fire" && s.template.code === "RT-06") {
    fail("a disabled template was selected");
  }
  const e = s.considered.find((c) => c.template.code === "RT-06")!;
  if (e.eligible) fail("RT-06 assessed as eligible while disabled");
  if (!e.refusedBecause?.includes("IG-INT12")) {
    fail("RT-06's refusal does not say why, so someone will re-enable it");
  }
  if (failures === before) ok("disabled, ineligible, and the reason travels with the refusal");
}

console.log("\nIG-U006 — a firing trigger with nothing to quote is still refused");
{
  const before = failures;
  /*
   * RT-11 is the clean case. Its trigger is obligation language, which fires on Q4
   * alone — "I should be further along by now" is one instance in Q4, and H-030 makes
   * that sufficient. But its copy quotes Q6: "You have real capability — you said
   * '[Q6 exact words]'". With Q6 blank the trigger is satisfied and there is nothing
   * specific to build the observation on, which is exactly what retired RT-14.
   *
   * RT-01 cannot demonstrate this, which is worth recording because it is what I
   * reached for first: its trigger tests the Q5/Q6 relationship, so a blank Q6 stops
   * the trigger before falsifiability is ever consulted. Its refusal correctly reads
   * "trigger conditions not met".
   */
  const rt11 = TEMPLATES.find((t) => t.code === "RT-11")!;
  const noQ6 = revealFacts({ Q4: "I should be further along by now" }, "early_career");

  if (!rt11.trigger(noQ6)) fail("RT-11's trigger should fire on obligation language in Q4 alone");
  if (falsifiable(rt11, noQ6)) fail("RT-11 counted as falsifiable with Q6 blank");
  const e = assess(rt11, noQ6);
  if (e.eligible) fail("RT-11 eligible with nothing to quote");
  if (!e.refusedBecause?.includes("Q6")) {
    fail(`the refusal does not name the empty slot: ${e.refusedBecause}`);
  }
  if (!e.refusedBecause?.includes("IG-U006")) fail("the refusal does not cite the gate");

  // Fill Q6 and the same template becomes eligible.
  const withQ6 = revealFacts(
    { Q4: "I should be further along by now", Q6: "I'm the one who unpicks a broken process" },
    "early_career",
  );
  if (!assess(rt11, withQ6).eligible) fail("RT-11 should be eligible once Q6 is answered");

  // The other shape, recorded so the distinction is not lost.
  const rt01 = TEMPLATES.find((t) => t.code === "RT-01")!;
  const rt01NoQ6 = assess(rt01, revealFacts({ Q5: "I'm an analyst at Deloitte" }, "early_career"));
  if (rt01NoQ6.eligible) fail("RT-01 eligible with Q6 blank");
  if (rt01NoQ6.refusedBecause !== "trigger conditions not met") {
    fail(`RT-01 should refuse at the trigger, not at falsifiability: ${rt01NoQ6.refusedBecause}`);
  }

  if (failures === before) ok("trigger fires, nothing to quote, refused — and the slot is named");
}

console.log("\nNothing eligible defers per IG-INT06");
{
  const before = failures;
  const flat: Answers = {
    Q1: "Someone suggested it",
    Q2: "Working",
    Q4: "Not sure",
    Q5: "Hard to say",
    Q6: "",
    Q7: "",
  };
  const s = run(flat);
  if (s.outcome !== "defer") {
    fail(`expected a deferral, got ${s.template.code}`);
  } else if (!s.because.includes("IG-INT06")) {
    fail("the deferral does not cite the gate that requires it");
  }
  if (failures === before) ok("flat answers defer, and the deferral names IG-INT06");
}

console.log("\nContradictions outrank fallbacks — v3.3's priority order");
{
  const before = failures;
  /*
   * This user trips a band 1 contradiction (title-led Q5 against a different Q6) and a
   * band 5 fallback (visibility goal plus anxiety). Band 1 has to win: her order puts
   * contradictions first because "clear contradictions produce the strongest reveals".
   */
  const answers: Answers = {
    Q2: "Working full-time, about three years in",
    Q4: "I want to be more visible in my industry",
    Q5: "I'm an analyst at Deloitte",
    Q6: "I'm the person who rewrites the messy briefs so operations can actually use them",
    Q7: "I worry it comes across as bragging",
  };
  const s = run(answers);
  if (s.outcome !== "fire") {
    fail("expected a reveal to fire");
  } else {
    if (s.template.band !== 1) {
      fail(`band ${s.template.band} won (${s.template.code}); a band 1 contradiction was eligible`);
    }
    const rt02 = s.considered.find((c) => c.template.code === "RT-02")!;
    if (!rt02.eligible) fail("RT-02 should have been eligible, so this does not test the ordering");
    if (failures === before) ok(`${s.template.code} (band 1) beat the eligible band 5 fallback`);
  }
}

console.log("\nA track-specific template is not offered to the wrong track");
{
  const before = failures;
  const rt09 = TEMPLATES.find((t) => t.code === "RT-09")!;
  if (trackRelevant(rt09, "executive")) fail("RT-09 is career-returner only");
  if (!trackRelevant(rt09, "career_returner")) fail("RT-09 must be offered to returners");
  // A tentative hold must not rule anything out — holding is not a refusal.
  if (!trackRelevant(rt09, null)) fail("an unassigned track must not disqualify a template");

  const rt08 = TEMPLATES.find((t) => t.code === "RT-08")!;
  if (!trackRelevant(rt08, "executive")) fail("RT-08 is cross-track and must be offered to all");
  if (failures === before) ok("track gating holds, and an unknown track gates nothing");
}

console.log("\nOne template or none — a hybrid is unrepresentable");
{
  const before = failures;
  /*
   * H-019.5: "Do NOT combine elements from multiple templates into a hybrid. Each
   * template's three-beat structure is designed as a unit. Frankenstein reveals lose
   * coherence." The rule needs no code — the return type carries one template — and
   * this asserts the type has not been widened into one that could carry two.
   */
  const answers: Answers = {
    Q2: "I took a career break, coming back now",
    Q4: "Re-entry, and I want to be more visible",
    Q5: "I used to run operations for a logistics firm",
    Q6: "People come to me when a process is broken",
    Q7: "Explaining the gap is the hard part",
  };
  const s = run(answers);
  if (s.outcome === "fire") {
    if (Array.isArray(s.template)) fail("selection returned more than one template");
    const eligibleCount = s.considered.filter((c) => c.eligible).length;
    if (eligibleCount < 2) {
      fail("this fixture no longer produces competing templates, so it tests nothing");
    }
    if (failures === before) {
      ok(`${eligibleCount} eligible, exactly one fired (${s.template.code}) — ${s.because}`);
    }
  } else {
    fail("expected a reveal for a returner with a full set of answers");
  }
}

console.log("\nA tie inside a band is broken by specificity, and the reason is stated");
{
  const before = failures;
  const answers: Answers = {
    Q2: "We're building something, pre-revenue",
    Q4: "First customers, and I want to be more visible about it",
    Q5: "We're building a platform for logistics teams",
    Q6: "I'm the one who can actually talk to warehouse managers without patronising them",
    Q7: "People see the company, not me",
  };
  const s = run(answers);
  if (s.outcome !== "fire") {
    fail("expected a reveal");
  } else if (!s.because) {
    fail("no reason recorded for the selection");
  } else if (failures === before) {
    ok(`${s.template.code} — ${s.because}`);
  }
}

console.log("\nEvery enabled template is reachable by some real answer set");
{
  const before = failures;
  /*
   * A template no input can reach is a dead branch: its copy never ships and nothing
   * errors to say so.
   *
   * One shared probe cannot do this, which is worth stating because that is what I
   * tried first. `q5Style` is a single value — an answer cannot be title-led and
   * function-led at once — so a maximal string reaches some triggers by making others
   * unreachable. Each template gets its own probe instead, which doubles as a readable
   * statement of what its trigger actually wants.
   */
  const probes: Record<string, Answers> = {
    "RT-01": {
      Q5: "I'm an analyst at Deloitte",
      Q6: "I'm the one who rewrites the messy briefs so operations can use them",
    },
    "RT-05": {
      Q4: "Honestly the salary and the title matter to me",
      Q5: "I'm an analyst at Deloitte",
      Q6: "I'm good at calming people down when a launch goes wrong",
    },
    "RT-08": {
      Q5: "I'm an analyst at Deloitte",
      Q6: "I'm the one who fixes broken processes",
      Q7: "People don't see me correctly",
    },
    "RT-11": {
      Q4: "I should be further along by now",
      Q6: "I'm good at getting people to agree on something",
    },
    "RT-15": {
      Q5: "I help teams figure out what to build next",
      Q7: "It just isn't landing with the people who matter",
    },
    "RT-09": {
      Q5: "I used to run operations for a logistics firm",
      Q6: "People came to me when a process broke",
      Q7: "Explaining the gap is the hard part",
    },
    "RT-10": {
      Q5: "We're building a platform for logistics teams",
      Q6: "I can talk to warehouse managers without patronising them",
    },
    "RT-03": {
      Q4: "Maybe marketing, maybe product, maybe operations",
      Q5: "A little of everything really",
    },
    "RT-04": { Q5: "I'm in strategy", Q6: "Pattern spotting across a business" },
    "RT-12": {
      Q5: "Hard to explain, depends who's asking",
      Q6: "Deep regulatory work in medical devices, years of it",
      Q7: "I want to be taken seriously",
    },
    "RT-13": {
      Q4: "I want to be more visible",
      Q6: "Deep technical knowledge of payment rails",
      "Q5.5": "how card interchange actually works in Europe",
    },
    "RT-02": {
      Q4: "I want to be more visible",
      Q7: "It feels like bragging",
    },
    "RT-07": {
      Q4: "I want to build something of my own",
      Q5: "I used to run marketing for a retail chain",
    },
  };

  for (const t of TEMPLATES) {
    if (!t.enabled) continue;
    const probe = probes[t.code];
    if (!probe) {
      fail(`${t.code} has no probe, so its reachability is untested`);
      continue;
    }
    const facts = revealFacts(probe, t.tracks === "all" ? null : t.tracks[0]);
    const e = assess(t, facts);
    if (!e.eligible) {
      fail(`${t.code} unreachable: ${e.refusedBecause}`);
    }
  }
  if (failures === before) {
    ok(`all ${TEMPLATES.filter((t) => t.enabled).length} enabled templates reachable`);
  }
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);

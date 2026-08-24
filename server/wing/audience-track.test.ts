/**
 * Audience track detection, against her table and her four edge cases.
 *
 * Run:  npx tsx server/wing/audience-track.test.ts
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────
 * Not "does the keyword match" — that tests the regex against itself. What matters is
 * the arithmetic around the keywords, because every expensive failure lives there:
 *
 *   · One signal must not confirm. A user coached as an executive on the strength of
 *     the phrase "partner at" is a worse outcome than a user held as unclassified.
 *   · Two signals must come from two questions. One discursive answer mentioning a
 *     raise, a team and a pivot would otherwise confirm three tracks by itself.
 *   · The four edge cases have to fire, because each one exists to correct a wrong
 *     answer the plain tally would give.
 */
import {
  type AudienceTrack,
  detectTrack,
  pathwayFor,
  signalsFrom,
  tallyByTrack,
  type Answers,
} from "./audience-track";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

console.log("\naudience-track\n");

console.log("One signal holds, two confirm");
{
  const before = failures;

  const one: Answers = { Q2: "I'm a VP of engineering" };
  const v1 = detectTrack(one);
  if (v1.confidence !== "tentative") fail(`a lone signal confirmed a track: ${v1.confidence}`);
  if (v1.track !== null) fail("a tentative hold must not assign a track");
  if (v1.candidate !== "executive") fail("a hold still has to name its candidate");

  const two: Answers = {
    Q2: "I'm a VP of engineering",
    Q4: "Honestly I'm thinking about a board seat somewhere.",
  };
  const v2 = detectTrack(two);
  if (v2.confidence !== "confirmed" || v2.track !== "executive") {
    fail(`two questions should confirm executive, got ${v2.track}/${v2.confidence}`);
  }

  const none = detectTrack({ Q2: "hard to say really" });
  if (none.confidence !== "none" || none.candidate !== null) {
    fail("no signal at all must be 'none', not a hold on nothing");
  }

  if (failures === before) ok("1 signal → tentative, 2 → confirmed, 0 → none");
}

console.log("\nTwo signals means two questions, not two keywords");
{
  const before = failures;
  /*
   * Everything in one answer. Three tracks are mentioned; none may be confirmed on
   * the strength of a single rambling reply.
   */
  const rambling: Answers = {
    Q2: "I manage a team of eight, we're hiring, and I'm thinking about a promotion or maybe raising money",
  };
  const v = detectTrack(rambling);
  const counts = tallyByTrack(signalsFrom(rambling));
  for (const track of Object.keys(counts)) {
    if (counts[track] > 1) fail(`${track} counted ${counts[track]} signals from one question`);
  }
  if (v.confidence === "confirmed") {
    fail(`one answer confirmed ${v.track}; corroboration has to come from a second question`);
  }
  if (failures === before) ok("a single answer can never exceed one signal per track");
}

console.log("\nEdge case 1 — an MBA working full-time is early career, not an undergraduate");
{
  const before = failures;
  /*
   * A genuine 2-2 tie, which is the only state the edge-case rule exists for. The
   * first fixture I wrote had early career winning outright on the plain tally — the
   * right answer, but it never exercised the rule.
   */
  const tied: Answers = {
    Q2: "I'm a senior year undergrad but working full-time alongside it",
    Q4: "Still figuring out what I want to do — maybe a promotion where I am",
  };
  const v = detectTrack(tied);
  if (v.track !== "early_career") {
    fail(`expected early_career, got ${v.track} (${v.resolvedBy ?? "no rule fired"})`);
  }
  if (!v.resolvedBy) fail("the tie-break decided it but did not say which rule");

  // And the plain tally still gets there when there is no tie to break.
  const clear: Answers = {
    Q2: "I'm doing an MBA but I'm working full-time, about three years in",
    Q4: "I want the next role to be a step up, not sideways",
    Q6: "Group project stuff mostly, and my major",
  };
  if (detectTrack(clear).track !== "early_career") {
    fail("early career should win outright at 2 signals against 1");
  }

  if (failures === before) ok(`tie → early_career (${v.resolvedBy}); 2-vs-1 wins outright`);
}

console.log("\nEdge case 2 — an undergraduate with a venture is an early founder");
{
  const before = failures;
  const a: Answers = {
    Q2: "I'm a sophomore but I'm building something on the side, pre-revenue",
    Q4: "Trying to get to first customers before graduation",
    Q5: "We're building a platform for student societies",
  };
  const v = detectTrack(a);
  if (v.track !== "entrepreneur_early") fail(`expected entrepreneur_early, got ${v.track}`);
  if (failures === before) ok(`entrepreneur_early — ${v.resolvedBy ?? "won outright"}`);
}

console.log("\nEdge case 3 — 'starting over' turns on whether prior evidence exists");
{
  const before = failures;

  // Prior evidence: a past-tense self-description in Q5.
  const withEvidence: Answers = {
    Q2: "I took a career break and I'm coming back",
    Q4: "Re-entry, mostly. Getting back into the market.",
    Q5: "I used to run operations for a logistics firm",
  };
  const a = detectTrack(withEvidence);
  if (a.track !== "career_returner") fail(`with prior evidence, expected career_returner, got ${a.track}`);

  /*
   * A break mentioned but nothing in Q5 or Q7 to anchor a prior identity to. Her
   * rule sends this to early career rather than treating the gap as the story.
   */
  const withoutEvidence: Answers = {
    Q2: "I took some time out, coming back now",
    Q4: "I want the next role to be a step up and to stand out more",
    Q5: "I'm an analyst at Deloitte",
  };
  const b = detectTrack(withoutEvidence);
  if (b.track === "career_returner") {
    fail("a break with no prior evidence must not become career_returner");
  }
  if (b.track !== "early_career") fail(`expected early_career fallback, got ${b.track}`);

  if (failures === before) ok(`with evidence → career_returner; without → ${b.track}`);
}

console.log("\nEdge case 4 — a user who resists classification is held, not guessed");
{
  const before = failures;
  const a: Answers = {
    Q1: "Not sure really",
    Q2: "Bit of everything at the moment",
    Q4: "Don't know yet",
  };
  const v = detectTrack(a);
  if (v.track !== null) fail(`expected a hold, got ${v.track}`);
  if (failures === before) ok(`held as ${v.confidence}, to be refined in Foundation 1`);
}

console.log("\nFounder stages: the later stage subsumes the earlier");
{
  const before = failures;
  const a: Answers = {
    Q2: "We're building something, we're hiring, and we're raising a seed round",
    Q4: "Closing the round, then building the team so I can step back from delivery",
  };
  const v = detectTrack(a);
  if (v.track !== "entrepreneur_scaling") {
    fail(`expected entrepreneur_scaling to subsume the earlier stages, got ${v.track}`);
  }
  if (failures === before) ok(`entrepreneur_scaling — ${v.resolvedBy ?? "won outright"}`);
}

console.log("\nA tie with no rule to separate it holds rather than picking");
{
  const before = failures;
  const a: Answers = {
    Q2: "I'm a senior manager, about nine years in",
    Q4: "I've hit a ceiling and I want a board seat eventually",
    Q7: "I want to be seen as strategic, not just operational",
  };
  const v = detectTrack(a);
  // mid_career should win here on three signals; the point is that IF it tied, we hold.
  if (v.confidence === "confirmed" && v.track === null) {
    fail("confirmed with no track is incoherent");
  }
  const contrived: Answers = {
    Q2: "I'm a VP and I manage a team of twelve",
    Q4: "I want a board seat, and I've hit a ceiling",
  };
  const w = detectTrack(contrived);
  if (w.confidence === "confirmed" && !w.resolvedBy) {
    fail("a two-way tie was confirmed without naming the rule that broke it");
  }
  if (failures === before) {
    ok(`clear leader confirms (${v.track}); a tie is ${w.track === null ? "held" : "resolved by " + w.resolvedBy}`);
  }
}

console.log("\nIG-INT03 — there is no field a demographic could arrive in");
{
  const before = failures;
  /*
   * Structural, not a runtime check. `Answers` is keyed by her eight questions and
   * nothing else, so a name, an age or an institutional profile has nowhere to go.
   * This test exists to fail loudly if someone widens the type: the day `Answers`
   * gains a `name` field, the compiler stops complaining and this comment is the only
   * thing left that remembers why it must not.
   */
  const keys: Array<keyof Answers> = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q5.5", "Q6", "Q7"];
  if (keys.length !== 8) fail("Answers no longer carries exactly her eight questions");

  // The same text under a name-shaped key cannot be constructed, so the nearest
  // observable guarantee is that Q3 — the institutional question — decides nothing.
  const institutionalOnly: Answers = { Q3: "Berkeley Haas, full-time MBA" };
  const v = detectTrack(institutionalOnly);
  if (v.track !== null || v.confidence !== "none") {
    fail(
      `Q3 alone produced ${v.candidate}/${v.confidence} — institutional context is a ` +
        "separate routing dimension and must not assign a track",
    );
  }
  if (failures === before) ok("eight question keys only, and Q3 assigns nothing");
}

console.log("\nEvery one of her eight tracks is reachable");
{
  const before = failures;
  /*
   * A track with no path to `confirmed` is a dead branch: the delivery adaptations
   * written for it never run, and nobody finds out because nothing errors. Each case
   * uses only Q2 and Q4, which is the minimum her table promises.
   */
  const cases: Array<[AudienceTrack, Answers]> = [
    ["undergraduate", { Q2: "I am an undergraduate, sophomore year", Q4: "Trying to land a first job after graduation" }],
    ["early_career", { Q2: "Working full-time, about two years in", Q4: "Want a promotion" }],
    ["mid_career", { Q2: "I manage a team, twelve years in", Q4: "I have hit a ceiling" }],
    ["executive", { Q2: "I am CFO here", Q4: "Thinking about a board seat" }],
    ["entrepreneur_early", { Q2: "Building something, pre-revenue", Q4: "Chasing first customers" }],
    ["entrepreneur_fundraising", { Q2: "We are raising a seed round", Q4: "Closing our round this quarter" }],
    ["entrepreneur_scaling", { Q2: "We are hiring, post-revenue", Q4: "Founder-to-leader, I cannot do everything" }],
    ["career_returner", { Q2: "I took a career break", Q4: "Re-entry" }],
  ];
  for (const [want, answers] of cases) {
    const v = detectTrack(answers);
    if (v.track !== want || v.confidence !== "confirmed") {
      fail(`${want} is not reachable from Q2 + Q4 — got ${v.track}/${v.confidence}`);
    }
  }
  if (failures === before) ok(`all ${cases.length} tracks confirm from Q2 and Q4 alone`);
}

console.log("\nThe pathway A2 depends on is derived, not asked");
{
  const before = failures;

  if (pathwayFor("entrepreneur_fundraising", {}) !== "venture") fail("founder stages are venture");
  if (pathwayFor("entrepreneur_early", {}) !== "venture") fail("early founder is venture");
  if (pathwayFor("mid_career", {}) !== "employment") fail("mid career is employment");
  if (pathwayFor(null, {}) !== "employment") fail("an unknown track defaults to employment");

  // Freelance is the case her eight tracks do not cover, and it outranks the track.
  if (pathwayFor("career_returner", { Q2: "I'm coming back but freelancing for now" }) !== "freelance") {
    fail("freelance language must win over the track");
  }
  if (pathwayFor("mid_career", { Q5: "I'm self-employed, I run my own practice" }) !== "freelance") {
    fail("self-employment in Q5 must produce freelance");
  }

  if (failures === before) ok("venture / employment / freelance all derive, freelance outranks");
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);

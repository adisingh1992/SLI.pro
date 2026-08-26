/**
 * Evidence tier per prompt, against her own prompts.
 *
 * Run:  npx tsx server/wing/prompt-tiers.test.ts
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────
 * Every fixture below is a real prompt from the micro-journal library or the heartbeat
 * set, quoted as written. Inventing prompts to test a prompt classifier would test the
 * regexes against themselves.
 *
 * The expensive failure is one-directional. Gate 2 counts Tier 1 events and needs four
 * of them, so a Tier 3 prompt graded Tier 1 lets a month of hypotheticals and
 * self-report satisfy the condition that exists to make the Reveal falsifiable. The
 * reverse — a behavioural prompt graded Tier 3 — only defers a Reveal, which her design
 * explicitly protects. So the tests lean on the Tier 3 side, and the ordering test is
 * the one that matters most.
 */
import {
  classifyPromptTier,
  parsePrompts,
  tierCounts,
  tierPrompts,
} from "./prompt-tiers";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

console.log("\nprompt-tiers\n");

console.log("A time anchor does not make a hypothetical behavioural");
{
  const before = failures;
  /*
   * EX-06, quoted as written. It contains "this week", and it is a hypothetical asking
   * the user to guess at someone else's perception — two of her three Tier 3 categories
   * in one sentence. Read for the time anchor first, this grades as her hardest
   * evidence, and four like it satisfy Gate 2.
   */
  const trap =
    "If someone shadowed you for a day this week, what would they say you spent the most time on — and would you agree with them?";
  const p = classifyPromptTier(trap);
  if (p.tier !== 3) fail(`the trap graded Tier ${p.tier} (${p.because})`);

  const more: string[] = [
    "If your team could tell you one thing anonymously, what do you think they'd say?",
    "If someone asked your roommate or closest friend what you're actually good at, what would they say?",
    "How would your team describe the company culture if you weren't in the room?",
    "If a friend introduced you to someone at a party, what would they say about you? Would you agree with it?",
  ];
  for (const t of more) {
    const r = classifyPromptTier(t);
    if (r.tier !== 3) fail(`Tier ${r.tier} for a third-party guess: "${t.slice(0, 50)}…"`);
  }
  if (failures === before) ok("hypotheticals and perception guesses stay Tier 3, anchors notwithstanding");
}

console.log("\nHer Tier 1 shape: a datable action");
{
  const before = failures;
  const behavioural: string[] = [
    "What did you work on this week that you'd want to tell someone about?",
    "Did anyone ask you what you do this week? How'd that conversation go?",
    "Walk me through your last decision where the outcome was different from what you expected.",
    "What did you do this week that someone thanked you for?",
    "Did anyone compliment your work this week? What did they actually say?",
    "What's a call you made this week where your experience really mattered?",
    "Did you step back into something this week that your team was supposed to own? What pulled you in?",
    "What did your team do this week that you didn't have to be involved in?",
  ];
  for (const t of behavioural) {
    const r = classifyPromptTier(t);
    if (r.tier !== 1) fail(`Tier ${r.tier} (${r.because}) for: "${t.slice(0, 55)}…"`);
  }
  if (failures === before) ok(`${behavioural.length} real behavioural prompts all Tier 1`);
}

console.log("\nThe Hypotheticals block is Tier 3 by construction");
{
  const before = failures;
  /*
   * Her sentence, so it is a rule rather than a judgement: "The eight prompts in the
   * library's Hypotheticals block are Tier 3 by construction, not by phrasing." The
   * block wins even where the phrasing would have said something else.
   */
  const inBlock = classifyPromptTier(
    "If you had to teach a class on something you learned the hard way, what's the course called?",
    "The Hypotheticals",
  );
  if (inBlock.tier !== 3) fail(`in-block prompt graded Tier ${inBlock.tier}`);
  if (inBlock.because.indexOf("by construction") < 0) fail("the reason should cite the block");

  // And the override is what decides it, not the phrasing, so it holds for an
  // oddly-phrased member of the block too.
  const odd = classifyPromptTier(
    "What did you do this week that felt effortless?",
    "The Hypotheticals",
  );
  if (odd.tier !== 3) fail("the block override must outrank a behavioural reading");
  if (failures === before) ok("block override wins over phrasing, as she specified");
}

console.log("\nTier 2 is the residual, and says which kind");
{
  const before = failures;
  const patterns: Array<[string, number]> = [
    ["Have you noticed any patterns in what energizes you at work versus what drains you?", 2],
    ["What's the thing people always come to you for — and do you like that they do?", 2],
    ["What's a skill you have that you picked up from a totally unrelated part of your life?", 2],
  ];
  for (const c of patterns) {
    const r = classifyPromptTier(c[0]);
    if (r.tier !== c[1]) fail(`Tier ${r.tier} (${r.because}) for: "${c[0].slice(0, 50)}…"`);
  }
  // Every proposal explains itself, so a wrong call is arguable rather than opaque.
  for (const c of patterns) {
    const r = classifyPromptTier(c[0]);
    if (!r.because.trim()) fail("a proposal with no reason is not reviewable");
  }
  if (failures === before) ok("named referent with no moment attached reads Tier 2");
}

console.log("\nNothing matched is null, not a guess");
{
  const before = failures;
  const r = classifyPromptTier("Monthly visual overlap measure of two circles.");
  if (r.tier !== null) fail(`an unclassifiable line was graded Tier ${r.tier}`);
  if (r.because.indexOf("by hand") < 0) fail("the reason should say it needs a person");
  if (failures === before) ok("unmatched entries surface for her rather than defaulting");
}

console.log("\nParsing her two numbering styles, and nothing else");
{
  const before = failures;
  /*
   * The count is the first thing she will check, so the parser has to be strict. These
   * documents carry tables, design principles and integration notes, and a looser
   * pattern would count those as prompts.
   */
  const doc = [
    "## SECTION 1: UNIVERSAL PROMPTS",
    "",
    "### How You Show Up",
    "",
    '1. "How did you introduce yourself to someone recently — at a party, a meeting, anywhere? What did you actually say?"',
    "*Signal: default self-description vs. SLI language. Tracks internalization over time.*",
    "",
    '2. "Did anyone ask you what you do this week? How\'d that conversation go?"',
    "*Signal: positioning comfort level.*",
    "",
    "### The Hypotheticals",
    "",
    '61. "If you had to quit your job tomorrow, what would you try first?"',
    "*Signal: latent identity.*",
    "",
    "## SECTION 2: AUDIENCE-ADAPTED PROMPTS",
    "",
    "### Undergraduate (10)",
    "",
    'U-01. "How have you been describing your major to people outside school?"',
    "*Signal: early positioning experimentation.*",
    "",
    "| Audience | WIIFM Hook |",
    "| Undergraduate | \"You've done more than you think.\" |",
    "",
    "**Rotation weighting:** Roughly 2:1 approachable-to-serious in any given week.",
  ].join("\n");

  const parsed = parsePrompts(doc);
  if (parsed.length !== 4) fail(`parsed ${parsed.length} prompts, expected 4`);
  if (parsed[0]?.id !== "1" || parsed[3]?.id !== "U-01") {
    fail(`ids came out as ${parsed.map((p) => p.id).join(", ")}`);
  }
  if (parsed[0]?.block !== "How You Show Up") fail(`block was "${parsed[0]?.block}"`);
  if (parsed[3]?.section.indexOf("SECTION 2") < 0) fail(`section was "${parsed[3]?.section}"`);
  const firstSignal = parsed[0].signal;
  if (!firstSignal) fail("the Signal line beneath a prompt should be captured");
  if (firstSignal && firstSignal.indexOf("SLI language") < 0) {
    fail("the signal text was truncated");
  }

  // The table row and the bold note are not prompts.
  for (const p of parsed) {
    if (p.text.indexOf("WIIFM") >= 0 || p.text.indexOf("Rotation") >= 0) {
      fail(`a non-prompt was parsed: "${p.text.slice(0, 40)}"`);
    }
  }

  // And the block override reaches the parsed prompt.
  const tiered = tierPrompts(parsed);
  const hypo = tiered.find((t) => t.id === "61");
  if (hypo?.proposal.tier !== 3) fail("the Hypotheticals block did not reach the tiering");

  const counts = tierCounts(tiered);
  if (counts["1"] + counts["2"] + counts["3"] + counts.unset !== parsed.length) {
    fail("the counts do not add up to the prompts");
  }
  if (failures === before) ok(`4 prompts, both id styles, blocks and signals, tables ignored`);
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);

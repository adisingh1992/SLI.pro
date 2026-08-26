/**
 * Chunked delivery and the reveal pause.
 *
 * Run:  npx tsx server/wing/chunking.test.ts
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────
 * H-007 has a behavioural success criterion, which is unusual and useful: "Student
 * engages with the prompt rather than asking 'wait, what are we doing?' Observable:
 * student responds to the final prompt message, not to the framing messages."
 *
 * That gives the tests something better than "did it split into three". Each of these is
 * a way of splitting text that satisfies the letter of the card and fails its purpose:
 *
 *   · The question buried mid-sequence, so the user answers the framing.
 *   · A two-sentence reply chopped into three messages, which is the cargo-cult version.
 *   · A split inside the quotation marks — in the reveal, the one message whose whole
 *     job is to prove Wing was listening to what the user actually typed.
 *   · A queue that keeps flushing after the user has started typing, which is worse
 *     than no chunking, because it talks over them.
 */
import {
  MAX_CHUNKS,
  MAX_PAUSE_MS,
  MIN_PAUSE_MS,
  MIN_SENTENCES_TO_CHUNK,
  REVEAL_PAUSE_MS,
  SENTENCES_PER_CHUNK,
  planChunks,
  planReveal,
  remainingAfterInterruption,
  splitSentences,
  streamChunker,
} from "./chunking";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

console.log("\nchunking\n");

console.log("The question lands alone, and last");
{
  const before = failures;
  /*
   * The card's observable criterion. If the question shares a message with the framing,
   * the user answers the framing — which is the exact confusion H-007 exists to prevent.
   */
  const text =
    "Right — I've got what I need for now. Before we go further I want to understand one more thing. " +
    "It won't take long. Where do you want this to go?";
  const plan = planChunks(text);
  const last = plan.chunks[plan.chunks.length - 1];

  if (!last.isQuestion) fail("the last chunk is the question and must be marked as one");
  if (last.text !== "Where do you want this to go?") {
    fail(`the question was not delivered alone: "${last.text}"`);
  }
  for (let i = 0; i < plan.chunks.length - 1; i++) {
    if (plan.chunks[i].isQuestion) fail(`chunk ${i} is a question — only the last one may be`);
    if (plan.chunks[i].text.indexOf("Where do you want") >= 0) {
      fail("the question leaked into a framing message");
    }
  }
  if (failures === before) ok(`question isolated as chunk ${plan.chunks.length} of ${plan.chunks.length}`);
}

console.log("\nA short reply is one message");
{
  const before = failures;
  /*
   * H-007 fires on "multi-part information (recap + context + instructions + prompt)".
   * Splitting everything is the cargo-cult reading, and it makes Wing feel like a bot
   * with a delivery gimmick rather than someone talking.
   */
  const plan = planChunks("That's useful. It tells me more than you'd think.");
  if (plan.chunks.length !== 1) fail(`two sentences became ${plan.chunks.length} messages`);
  if (plan.chunks[0].pauseBeforeMs !== 0) fail("the first message never waits");
  if (plan.totalPauseMs !== 0) fail("one message means no gaps");

  // A short reply that ends in a question still splits, because the question rule wins.
  const asked = planChunks("That's useful. What made you say it that way?");
  if (asked.chunks.length !== 2) fail(`expected framing + question, got ${asked.chunks.length}`);
  if (!asked.chunks[1].isQuestion) fail("the question is still peeled off");

  if (MIN_SENTENCES_TO_CHUNK !== 4) fail(`the floor moved to ${MIN_SENTENCES_TO_CHUNK} without a decision`);
  if (failures === before) ok("2 sentences → 1 message; 1 + a question → 2");
}

console.log("\nHer shape: three to four messages, two to three sentences each");
{
  const before = failures;
  const text =
    "Welcome back. Here's where we got to last time. " +
    "Now we're going to look at how you're actually being read. " +
    "This is the part that usually surprises people. " +
    "It's also the part that changes what you write next. " +
    "You'll see why in a minute. " +
    "What's changed since we last spoke?";
  const plan = planChunks(text);

  if (plan.chunks.length < 3 || plan.chunks.length > MAX_CHUNKS) {
    fail(`expected 3–${MAX_CHUNKS} messages, got ${plan.chunks.length}`);
  }
  for (const c of plan.chunks) {
    if (c.isQuestion) continue;
    const n = splitSentences(c.text).length;
    if (n > SENTENCES_PER_CHUNK) fail(`a framing message carried ${n} sentences`);
  }
  if (plan.tooLong) fail("this fits — it should not be flagged as too long");

  // Nothing is lost in the split.
  let rejoined = "";
  for (const c of plan.chunks) rejoined += (rejoined ? " " : "") + c.text;
  if (rejoined !== text.trim()) fail("the split dropped or reordered text");

  if (failures === before) ok(`${plan.chunks.length} messages, ≤${SENTENCES_PER_CHUNK} sentences each, nothing lost`);
}

console.log("\nToo much text is flagged, not silently truncated");
{
  const before = failures;
  const long: string[] = [];
  for (let i = 0; i < 15; i++) long.push(`This is sentence number ${i} and it says something.`);
  const plan = planChunks(long.join(" ") + " So where does that leave you?");

  if (plan.chunks.length > MAX_CHUNKS) fail(`${plan.chunks.length} messages exceeds the cap of ${MAX_CHUNKS}`);
  if (!plan.tooLong) fail("fifteen sentences do not fit the shape and should say so");

  // The overflow joins the last framing message rather than vanishing.
  let rejoined = "";
  for (const c of plan.chunks) rejoined += (rejoined ? " " : "") + c.text;
  if (rejoined.indexOf("sentence number 14") < 0) fail("the overflow was dropped");
  if (!plan.chunks[plan.chunks.length - 1].isQuestion) fail("the question still lands last and alone");

  if (failures === before) ok(`capped at ${MAX_CHUNKS}, flagged tooLong, nothing dropped`);
}

console.log("\nSentences split without breaking a quotation");
{
  const before = failures;
  /*
   * The reveal quotes the user's exact words — IG-U010's quote-then-extend, and IG-INT10
   * and IG-INT12 both require the literal typed input in the slot. A split inside the
   * quotation marks delivers half of what someone said as though it were the whole
   * thing, in the message whose entire job is to show Wing was listening.
   */
  const quoted =
    'You said "I want people to stop asking what I actually do. It gets exhausting." That is a positioning problem, not a confidence one.';
  const parts = splitSentences(quoted);
  if (parts.length !== 2) fail(`expected 2 sentences, got ${parts.length}: ${JSON.stringify(parts)}`);
  if (parts[0].indexOf("It gets exhausting.") < 0) fail("the quotation was cut in half");

  // Abbreviations and initials are not sentence ends.
  const abbrev = splitSentences("Plenty of people do this, e.g. consultants. It rarely helps.");
  if (abbrev.length !== 2) fail(`"e.g." split the sentence: ${JSON.stringify(abbrev)}`);

  if (splitSentences("   ").length !== 0) fail("empty text has no sentences");
  if (failures === before) ok("quotations survive; e.g. and initials do not split");
}

console.log("\nThe pause is proportional, and bounded at both ends");
{
  const before = failures;
  /*
   * The first version of this test used a fixture that collapsed to two chunks, so it
   * asserted bounds on a single gap and reported success without ever comparing two.
   * Proportionality needs two chunks of different lengths to compare.
   */
  const shortFirst =
    "Here's where we are. That's the recap. Nothing surprising in it. " +
    "Now we look at how you are actually being read by the people you are trying to reach, which is a longer thing to say and takes longer to type out than the recap did. " +
    "It is the part that changes what you write next. " +
    "It is also the part people argue with. " +
    "What's changed since we spoke?";
  const plan = planChunks(shortFirst);

  if (plan.chunks.length < 3) fail(`expected at least 3 messages to compare, got ${plan.chunks.length}`);
  for (let i = 1; i < plan.chunks.length; i++) {
    const c = plan.chunks[i];
    if (c.pauseBeforeMs < MIN_PAUSE_MS) fail(`${c.pauseBeforeMs}ms is below the floor`);
    if (c.pauseBeforeMs > MAX_PAUSE_MS) fail(`${c.pauseBeforeMs}ms is above the ceiling`);
  }

  // The long middle message waits longer than the short question does.
  let longest = plan.chunks[1];
  for (const c of plan.chunks) if (c.text.length > longest.text.length) longest = c;
  const question = plan.chunks[plan.chunks.length - 1];
  if (longest.pauseBeforeMs <= question.pauseBeforeMs) {
    fail(
      `a ${longest.text.length}-char message waited ${longest.pauseBeforeMs}ms and a ` +
        `${question.text.length}-char one waited ${question.pauseBeforeMs}ms — not proportional`,
    );
  }

  /*
   * v3.3 budgets 7–8 minutes for the whole intake, so the gaps have to be invisible in
   * aggregate. A four-message turn spending more than about six seconds waiting would
   * put minutes onto a conversation that is meant to feel quick.
   */
  if (plan.totalPauseMs > 6000) fail(`${plan.totalPauseMs}ms of waiting in a single turn`);
  if (failures === before) {
    ok(`${plan.chunks.length} messages, longest gap ${longest.pauseBeforeMs}ms, ${plan.totalPauseMs}ms total`);
  }
}

console.log("\nThe reveal: marker, observation, beat, then the question");
{
  const before = failures;
  const plan = planReveal({
    marker: "I want to pause for a second, because I'm noticing something.",
    reveal:
      'You said you want to be "the person people come to" — but when I asked what you do, you led with your team\'s work rather than your own. That gap is the thing we work on first.',
    deepening: "Does that land, or am I reading it wrong?",
  });

  if (plan.chunks.length !== 3) fail(`expected 3 messages, got ${plan.chunks.length}`);
  if (plan.chunks[0].text.indexOf("pause for a second") < 0) fail("her marker line opens it");
  if (plan.chunks[0].pauseBeforeMs !== 0) fail("the marker goes out immediately");

  /*
   * "After the reveal, Wing pauses. The pause is the product. The user needs a beat to
   * process being seen." The beat sits before Q9, because that is the gap the user
   * actually sits in — a pause recorded after the last message is one nobody experiences.
   */
  if (plan.chunks[2].pauseBeforeMs !== REVEAL_PAUSE_MS) {
    fail(`the beat before Q9 is ${plan.chunks[2].pauseBeforeMs}ms, expected ${REVEAL_PAUSE_MS}`);
  }
  if (REVEAL_PAUSE_MS <= MAX_PAUSE_MS) {
    fail("the reveal pause must be longer than a typing gap, or it is not a pause");
  }
  if (!plan.chunks[2].isQuestion) fail("Q9 is a question");

  // The quotation survives, and the marker is never merged into the observation.
  if (plan.chunks[1].text.indexOf('"the person people come to"') < 0) fail("the user's words were lost");
  if (plan.chunks[0].text.indexOf("You said") >= 0) fail("the marker was merged into the reveal");

  // "2-4 sentences. Never longer."
  const tooLong = planReveal({
    marker: "One.",
    /*
     * Five real sentences, not single letters — "A." is an initial as far as any splitter
     * is concerned, and a fixture that relies on that ambiguity tests the wrong thing.
     */
    reveal: "One thing. Two things. Three things. Four things. Five things.",
    deepening: "And?",
  });
  if (!tooLong.tooLong) fail("five sentences exceed her 2–4 and should be flagged");

  if (failures === before) ok(`marker → observation → ${REVEAL_PAUSE_MS}ms beat → Q9`);
}

console.log("\nIf the user speaks first, the rest is dropped");
{
  const before = failures;
  /*
   * H-007's failure path, verbatim: "If student skips ahead before Wing finishes the
   * sequence → adapt and follow their lead rather than insisting on completing the
   * welcome sequence."
   *
   * A queue that keeps flushing talks over someone who is already typing — worse than
   * sending one message, and worst of all during a reveal.
   */
  const plan = planChunks(
    "Welcome back. Here's where we got to. Now we look at how you're read. That's the surprising part. What's changed?",
  );
  const dropped = remainingAfterInterruption(plan, 1);
  if (dropped.length !== plan.chunks.length - 1) fail("everything after the delivered message is dropped");
  if (remainingAfterInterruption(plan, plan.chunks.length).length !== 0) {
    fail("nothing is left once the sequence finished");
  }
  if (remainingAfterInterruption(plan, 99).length !== 0) fail("an over-count is not an error");

  // Including the question: following their lead means not insisting on it.
  const hadQuestion = dropped[dropped.length - 1]?.isQuestion;
  if (!hadQuestion) fail("the fixture should have a pending question to abandon");
  if (failures === before) ok(`${dropped.length} messages abandoned, question included`);
}

console.log("\nThe streaming splitter agrees with the planner, and loses nothing");
{
  const before = failures;
  /*
   * ── WHY BOTH EXIST ─────────────────────────────────────────────────────
   * Foundation streams with maxTokens 4096. Buffering to completion so `planChunks` could
   * see the end would trade a fast first token for a long silence on the most
   * quality-critical surface, so `streamChunker` decides breaks as text arrives.
   *
   * Two implementations of one rule is the risk, and this is the test that makes it
   * bounded: on the shapes H-007 is actually about, the streamed result must be identical
   * to the planned one, and no path may lose a character of what Wing wrote.
   */
  const stream = (text: string, step = 7): string[] => {
    const sc = streamChunker();
    const out: string[] = [];
    for (let i = 0; i < text.length; i += step) {
      for (const c of sc.push(text.slice(i, i + step))) out.push(c.text);
    }
    for (const c of sc.end()) out.push(c.text);
    return out;
  };
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();

  const agree = [
    "That makes sense. Let's build on it.",
    "That makes sense. What did you do next?",
    "You mentioned the retro. That was your call to run it. Nobody asked you to. " +
      "The team changed how they work because of it. That is not nothing. " +
      "What made you decide to run it?",
  ];
  for (const text of agree) {
    const streamed = stream(text);
    const planned = planChunks(text).chunks.map((c) => c.text);
    if (JSON.stringify(streamed) !== JSON.stringify(planned)) {
      fail(`streamed and planned disagree on "${text.slice(0, 40)}…"`);
    }
  }

  /*
   * The short-reply rule, satisfied by construction rather than by checking: a break can
   * only fire once enough sentences have arrived, so a two-sentence reply never triggers
   * one. This is the assertion that says so, because it is the property most likely to be
   * broken by someone "simplifying" the drain condition.
   */
  if (stream("That makes sense. Let's build on it.").length !== 1) {
    fail("a short reply must arrive as one message, not be chopped up");
  }

  /*
   * Nothing is lost, at any token size. Tested at several because a splitter that works
   * on tidy boundaries and drops a word when a delta lands mid-sentence is the failure
   * mode a single step size hides.
   */
  for (const text of agree) {
    for (const step of [1, 3, 7, 40, 5000]) {
      if (norm(stream(text, step).join(" ")) !== norm(text)) {
        fail(`text lost or duplicated at step ${step} on "${text.slice(0, 30)}…"`);
      }
    }
  }

  // And the documented difference, pinned so it is a decision rather than a surprise.
  const midQuestion = "You said you're just the ops person. What made you describe it that way? The evidence says otherwise.";
  const streamed = stream(midQuestion);
  if (streamed.length !== 3 || streamed[1] !== "What made you describe it that way?") {
    fail("a completed question mid-reply should still get its own message, per IG-UX02");
  }
  if (planChunks(midQuestion).chunks.length !== 1) {
    fail("planChunks only peels a question that is LAST — if that changed, this comment is stale");
  }

  if (failures === before) {
    ok("identical on the H-007 shapes, lossless at every token size, one documented difference");
  }
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);

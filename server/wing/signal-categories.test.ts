/**
 * Signal category per prompt, against her own prompts and her own annotations.
 *
 * Run:  npx tsx server/wing/signal-categories.test.ts
 *
 * Every fixture is a real prompt, quoted as written, from the micro-journal library or
 * the heartbeat set — same discipline as prompt-tiers.test.ts and for the same reason:
 * inventing prompts to test a prompt classifier tests the regexes against themselves.
 * Where a prompt carries her own "Signal: …" annotation, it is quoted too, because the
 * classifier reads that field first.
 */
import { categoryCounts, classifySignalCategory } from "./signal-categories";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

console.log("\nsignal-categories\n");

console.log("Her own annotation is read before the prompt text");
{
  const before = failures;
  // U-13, wing-approachable-microjournal-library.md.
  const text =
    "What's a skill you've picked up outside the classroom that you think might actually matter more than your coursework?";
  const signal = "informal competency recognition.";
  const p = classifySignalCategory(text, signal);
  if (p.category !== "achievement") {
    fail(`U-13 graded ${p.category} (${p.because}) — her annotation names competency recognition`);
  }
  if (p.marker.indexOf("signal:") !== 0) {
    fail(`U-13's marker did not come from the annotation: "${p.marker}"`);
  }
  if (failures === before) ok('U-13 reads "competency" from her own annotation, not the prompt text');
}

console.log("A push-back prompt is Influence, not Relationship, though it names a person");
{
  const before = failures;
  // EX-A14, wing-approachable-microjournal-library.md. No annotation on this one.
  const p = classifySignalCategory("Did anyone push back on you this week? How did that go?", null);
  if (p.category !== "influence") fail(`graded ${p.category} (${p.because}), expected influence`);
  if (failures === before) ok("push-back is read as influence ahead of the looser relationship rules");
}

console.log("An industry observation is Industry even though it is a first-person question");
{
  const before = failures;
  // EF-A06 (heartbeat, entrepreneur-fundraising track).
  const p = classifySignalCategory(
    "What's something happening in your industry right now that you have a strong opinion about?",
    null,
  );
  if (p.category !== "industry") fail(`graded ${p.category} (${p.because}), expected industry`);
  if (failures === before) ok('"your industry" reaches industry ahead of the decision rule\'s "opinion"-adjacent wording');
}

console.log("A decision prompt is Decision even without her annotation");
{
  const before = failures;
  // EX-A09, wing-approachable-microjournal-library.md.
  const p = classifySignalCategory(
    "What's a decision you made this week where you had plenty of information but still weren't sure?",
    null,
  );
  if (p.category !== "decision") fail(`graded ${p.category} (${p.because}), expected decision`);
  if (failures === before) ok("decision language is read as decision, not achievement, ahead in the ordering");
}

console.log("A compliment prompt is Achievement");
{
  const before = failures;
  // Skills and Strengths (Warm), wing-approachable-microjournal-library.md, #40.
  const p = classifySignalCategory("Did anyone compliment your work this week? What did they actually say?", null);
  if (p.category !== "achievement") fail(`graded ${p.category} (${p.because}), expected achievement`);
  if (failures === before) ok("a compliment reaches achievement ahead of relationship's looser person-mention rules");
}

console.log("Describing your major is Career, not the looser Language rule");
{
  const before = failures;
  // Undergraduate track, wing-heartbeat-and-population-prompts.md, #1.
  const p = classifySignalCategory(
    "How have you been describing your major to people outside school? Do you ever change the answer depending on who's asking?",
    null,
  );
  if (p.category !== "career") {
    fail(`graded ${p.category} (${p.because}) — "describing your major" is career's more specific pattern`);
  }
  if (failures === before) ok('"describing your major" is caught by career before the generic language rule fires');
}

console.log('"Who did you" reaches Relationship ahead of the Achievement surprise rule');
{
  const before = failures;
  // Weekend and Life, wing-approachable-microjournal-library.md, #24.
  const p = classifySignalCategory("Who did you catch up with recently that you were glad you did?", null);
  if (p.category !== "relationship") fail(`graded ${p.category} (${p.because}), expected relationship`);
  if (failures === before) ok('"who did you" is read as relationship');
}

console.log("Laughing at work is Energy");
{
  const before = failures;
  // What's On Your Mind, wing-approachable-microjournal-library.md, #15.
  const p = classifySignalCategory("Did anything make you laugh at work this week? What was it?", null);
  if (p.category !== "energy") fail(`graded ${p.category} (${p.because}), expected energy`);
  if (failures === before) ok('"laugh" is read as energy');
}

console.log('"Said about your work" is Language');
{
  const before = failures;
  // How You Show Up, wing-approachable-microjournal-library.md, #7.
  const p = classifySignalCategory(
    "What's something you said about your work this week that felt really right — like, that's exactly how I want to sound?",
    null,
  );
  if (p.category !== "language") fail(`graded ${p.category} (${p.because}), expected language`);
  if (failures === before) ok('"said about" is read as language when nothing more specific matches first');
}

console.log("A metaphor prompt with no anchor to any of her eight stays null");
{
  const before = failures;
  // wing-heartbeat-and-population-prompts.md, #4.
  const p = classifySignalCategory("One word for your week. Go. And then tell me the story behind it.", null);
  if (p.category !== null) {
    fail(`graded ${p.category} (${p.because}) — nothing here names one of her eight with confidence`);
  }
  if (failures === before) ok("an unclassifiable prompt is left null rather than guessed");
}

console.log("categoryCounts sums to the input length and covers all eight plus unset");
{
  const before = failures;
  const proposals = [
    { category: "language" as const },
    { category: "language" as const },
    { category: "energy" as const },
    { category: null },
  ];
  const counts = categoryCounts(proposals);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total !== proposals.length) fail(`counts summed to ${total}, expected ${proposals.length}`);
  if (counts.language !== 2) fail(`language counted ${counts.language}, expected 2`);
  if (counts.unset !== 1) fail(`unset counted ${counts.unset}, expected 1`);
  if (counts.influence !== 0) fail(`an unseen category should still report 0, got ${counts.influence}`);
  if (failures === before) ok("counts cover all eight categories plus unset, and they add up");
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);

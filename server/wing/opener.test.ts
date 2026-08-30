/**
 * The opener pool, selected independently of the prompt.
 *
 * The failures worth testing here are all ones that read as working: a warm-return
 * greeting to someone who answered yesterday, a follow-up that references a topic Wing
 * does not have, or "Hey [Name]" reaching a real person.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  WARM_RETURN_DAYS,
  fill,
  fillable,
  poolFor,
  renderOpener,
  type Opener,
  type OpenerState,
} from "./opener";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ok — ${detail}`);
  else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

/** Her actual openers, as the seeder writes them. */
const CASUAL: Opener[] = [
  { id: 1, pool: "casual", text: "Hey [Name] — quick one for you.", placeholders: ["Name"] },
  { id: 2, pool: "casual", text: "Hi [Name] — curious about something.", placeholders: ["Name"] },
  { id: 3, pool: "casual", text: "[Name]! Got one for you.", placeholders: ["Name"] },
];
const WARM: Opener[] = [
  { id: 10, pool: "warm_return", text: "Hey [Name] — missed you. Quick question.", placeholders: ["Name"] },
  { id: 11, pool: "warm_return", text: "Hi [Name] — just one today, promise.", placeholders: ["Name"] },
];
const POST: Opener[] = [
  { id: 20, pool: "post_response", text: "Hey [Name] — something you said last time stuck with me.", placeholders: ["Name"] },
  { id: 21, pool: "post_response", text: "[Name] — remember what you told me about [topic]? Related question.", placeholders: ["Name", "topic"] },
];
const ALL = [...CASUAL, ...WARM, ...POST];

const state = (over: Partial<OpenerState> = {}): OpenerState => ({
  daysSinceLastResponse: 1,
  followingUpOn: null,
  lastOpenerId: null,
  ...over,
});

const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

console.log("\nopeners — the greeting layer, chosen independently of the prompt\n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1. Her pools are preconditions.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("The pool is chosen from state, never drawn at random");
{
  const bad: string[] = [];
  if (poolFor(state({ daysSinceLastResponse: 1 })) !== "casual") bad.push("a recent responder is not casual");
  if (poolFor(state({ daysSinceLastResponse: 4 })) !== "casual") bad.push("day 4 is already a warm return");
  if (poolFor(state({ daysSinceLastResponse: WARM_RETURN_DAYS })) !== "warm_return") bad.push("day 5 is not a warm return");
  if (poolFor(state({ daysSinceLastResponse: 40 })) !== "warm_return") bad.push("a long absence is not a warm return");
  if (poolFor(state({ followingUpOn: "the pitch" })) !== "post_response") bad.push("a follow-up did not use the follow-up pool");
  /* Post-response outranks warm-return: referencing what they said beats noting they were away. */
  if (poolFor(state({ daysSinceLastResponse: 30, followingUpOn: "the pitch" })) !== "post_response") {
    bad.push("a follow-up was displaced by the absence");
  }
  check("pools", bad.length === 0, bad.length === 0 ? `casual under ${WARM_RETURN_DAYS} days, warm return at or over, follow-up outranks both` : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. A student who has never answered is not a warm return.
 *
 * "Missed you" in somebody's first week is a claim about a relationship that has not
 * happened. They have not gone quiet; they have not started.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nSomeone who has never answered is greeted casually, not missed");
{
  const brandNew = state({ daysSinceLastResponse: null });
  const got = renderOpener(ALL, brandNew, { Name: "Sam" }, seq([0]));
  const ok = poolFor(brandNew) === "casual" && !!got && !/missed you/i.test(got.text);
  check("new", ok, ok ? `first contact is casual — "${got?.text}"` : `got "${got?.text}"`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. An opener Wing cannot complete is never sent.
 *
 * Her post-response pool has one that needs a topic. Rendered without one it reads
 * "remember what you told me about [topic]?", which is worse than a plainer greeting.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nAn opener whose placeholders cannot be filled is filtered out");
{
  const bad: string[] = [];

  const withTopic = renderOpener(ALL, state({ followingUpOn: "x" }), { Name: "Sam", topic: "the pitch" }, seq([0.99]));
  const withoutTopic = renderOpener(ALL, state({ followingUpOn: "x" }), { Name: "Sam" }, seq([0.99]));

  if (!withTopic || withTopic.id !== 21) bad.push("the topic opener was unreachable when a topic exists");
  if (withoutTopic?.id === 21) bad.push("the topic opener was sent with no topic");
  if (!withoutTopic) bad.push("the other follow-up opener was not used instead");

  /* And nothing rendered ever keeps a bracket. */
  for (const rendered of [withTopic, withoutTopic]) {
    if (rendered && /\[[A-Za-z]+\]/.test(rendered.text)) bad.push(`a placeholder survived: "${rendered.text}"`);
  }

  /* An empty string is not a value. */
  if (fillable(POST[1], { Name: "Sam", topic: "   " })) bad.push("whitespace counted as a topic");

  check("fillable", bad.length === 0, bad.length === 0 ? "the topic opener appears only with a topic, and no bracket ever renders" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. No name, no opener — and that is the right answer.
 *
 * Every one of her fourteen greets by name. "Hey [Name]" reaching a real person is worse
 * than a prompt sent plainly, and inventing a name is not on the table.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nWith no name, nothing is rendered rather than something wrong");
{
  const bad: string[] = [];
  const emptyNames: Array<Readonly<Record<string, string>>> = [{}, { Name: "" }, { Name: "   " }];
  for (const values of emptyNames) {
    const got = renderOpener(ALL, state(), values, seq([0]));
    if (got !== null) bad.push(`${JSON.stringify(values)} rendered "${got.text}"`);
  }
  const withName = renderOpener(ALL, state(), { Name: "Sam" }, seq([0]));
  if (!withName) bad.push("a real name rendered nothing");
  if (withName && !withName.text.includes("Sam")) bad.push("the name was not substituted");

  check("nameless", bad.length === 0, bad.length === 0 ? "three empty-name shapes render nothing; a real name renders" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. Variety — and repetition where there is no choice.
 *
 * Her stated purpose is variety when the underlying question repeats at the 14-day floor.
 * The same shape as the recommendation's no-repeat: skip the last one where there is
 * another, and repeat where there is not.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe last opener is skipped where there is another to use");
{
  const bad: string[] = [];

  const again = renderOpener(CASUAL, state({ lastOpenerId: 1 }), { Name: "Sam" }, seq([0]));
  if (again?.id === 1) bad.push("the same opener came round twice");

  /* One usable opener, and it was the last one: repeating it is correct. */
  const only = renderOpener([CASUAL[0]], state({ lastOpenerId: 1 }), { Name: "Sam" }, seq([0]));
  if (only?.id !== 1) bad.push("a sole opener was refused rather than repeated");

  /* Every casual opener is reachable across the interval. */
  const seen = new Set<number>();
  for (let i = 0; i < 300; i++) {
    const got = renderOpener(CASUAL, state(), { Name: "Sam" }, seq([i / 300]));
    if (got) seen.add(got.id);
  }
  if (seen.size !== CASUAL.length) bad.push(`only ${seen.size} of ${CASUAL.length} openers are reachable`);

  check("variety", bad.length === 0, bad.length === 0 ? `rotates off the last, repeats when it is the only one, all ${seen.size} reachable` : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. No cross-pool fallback.
 *
 * An empty pool is a seeding problem. Substituting a casual greeting for a warm-return one
 * papers over an absence the student will notice was not acknowledged, and it hides the
 * seeding problem behind copy that reads almost right.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nAn empty pool renders nothing rather than borrowing from another");
{
  const noWarm = renderOpener(CASUAL, state({ daysSinceLastResponse: 30 }), { Name: "Sam" }, seq([0]));
  const ok = noWarm === null;
  check("no fallback", ok, ok ? "a missing warm-return pool renders nothing, so the gap is visible" : `borrowed "${noWarm?.text}"`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 7. A misbehaving random stays in range.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA random outside its contract still yields an opener");
{
  const bad: string[] = [];
  for (const value of [1, 1.5, 0.9999999999]) {
    const got = renderOpener(CASUAL, state(), { Name: "Sam" }, seq([value]));
    if (!got) bad.push(`random()=${value} rendered nothing`);
  }
  if (fill("Hey [Name] — [Name]!", { Name: "Sam" }) !== "Hey Sam — Sam!") bad.push("fill replaced only the first occurrence");
  check("boundary", bad.length === 0, bad.length === 0 ? "1, 1.5 and the last value all render; fill replaces every occurrence" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 8. THE WIRING. The opener is rendered into a template that uses it.
 *
 * The failure this guards is the one this session keeps producing: a value computed
 * correctly, recorded correctly, and never reaching the student. `life_log_nudge` opened
 * with its own greeting, so if the template still says "Hi {{firstName}}," the opener is
 * selected, logged to `message_events.opener_id`, and silently dropped on the way out —
 * and `render()` reports nothing, because an unused variable is not an unresolved one.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe opener reaches the template, and the template expects it");
{
  const bad: string[] = [];
  const read = (rel: string) => {
    const path = join(process.cwd(), "server", "wing", rel);
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  };

  const seed = read("seed-message-templates.ts");
  const engagement = read("engagement.ts");

  if (!seed) bad.push("seed-message-templates.ts not found — this check proved nothing");
  else {
    /* Inside the life_log_nudge entry, not anywhere in the file. */
    const start = seed.indexOf('templateKey: "life_log_nudge"');
    const end = seed.indexOf("templateKey:", start + 10);
    const entry = start >= 0 ? seed.slice(start, end > start ? end : undefined) : "";

    /*
     * The BODY, not the whole entry.
     *
     * The first version scanned the entry and failed on this template's own voiceNote,
     * which quotes the greeting it replaced in order to explain why. `api-contracts`
     * already carries the lesson: "a guard which reads its own documentation as evidence
     * punishes writing any."
     */
    const bodyStart = entry.indexOf("body: `");
    const bodyEnd = entry.indexOf("`,", bodyStart);
    const body = bodyStart >= 0 && bodyEnd > bodyStart ? entry.slice(bodyStart, bodyEnd) : "";

    if (!entry) bad.push("the life_log_nudge template is gone");
    else if (!body) bad.push("could not read the life_log_nudge body");
    else {
      if (!body.includes("{{opener}}")) bad.push("life_log_nudge does not use {{opener}}");
      /* And it must not greet twice. */
      if (/Hi \{\{firstName\}\},/.test(body)) {
        bad.push("life_log_nudge still has its own greeting above the opener");
      }
    }
  }

  if (!engagement) bad.push("engagement.ts not found");
  else {
    const code = engagement.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/renderOpener\(/.test(code)) bad.push("nothing renders an opener on the send path");
    if (!/openerId:/.test(code)) bad.push("the chosen opener is not recorded on the send");
    if (!/opener:\s/.test(code)) bad.push("the rendered opener is not passed as a template variable");
  }

  check("wiring", bad.length === 0, bad.length === 0 ? "the template expects {{opener}}, the send renders it, records it and passes it" : bad.join("; "));
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);

/**
 * The one message a safety hold permits.
 *
 * The decision itself — thirty days, once, and not for someone who came back — is
 * `softCheckInDue`, already tested in `suppression.test.ts` against her rules. What is
 * tested here is the wiring around it, because every failure mode is one where the rule is
 * right and the person still gets nothing:
 *
 *   the runner does not call it        → the message never exists
 *   it asks maySend for permission     → refused, because a hold is open
 *   the send is recorded before it     → marked done, never delivered
 *   the template does not exist        → send refused, silently
 *
 * A static scan, in the style of `session-access` and `log-reply`. There is no database
 * here, and a unit test of `runDueSoftCheckIns` against mocks would only prove the mocks.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ok — ${detail}`);
  else {
    failed++;
    console.log(`  FAIL — ${label}: ${detail}`);
  }
}

const wing = join(process.cwd(), "server", "wing");
const read = (name: string): string | null => {
  const p = join(wing, name);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};
const decomment = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

console.log("\nthe soft check-in — the only automated contact a hold permits\n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1. Something calls it.
 *
 * `softCheckInIsDue` existed from the day the hold store was written, with no caller. A
 * hold opened on 1 September would have gone quiet on 1 October and stayed quiet — the
 * rule implemented, tested, and never reached.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("The hourly runner calls it");
{
  const runner = read("run-sequences.ts");
  const job = read("soft-check-in.ts");
  const bad: string[] = [];

  if (!runner) bad.push("run-sequences.ts not found — this check proved nothing");
  else if (!/soft-check-in/.test(decomment(runner))) {
    bad.push("the runner does not import the soft check-in job");
  }
  if (!job) bad.push("soft-check-in.ts not found");
  else {
    const code = decomment(job);
    if (!/softCheckInIsDue\(/.test(code)) bad.push("the job does not ask whether it is due");
    if (!/softCheckInCandidates\(/.test(code)) bad.push("the job has no candidate query");
  }

  check("called", bad.length === 0, bad.length === 0 ? "the runner imports it, and it asks the tested predicate" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. It does NOT ask maySend.
 *
 * Every other outbound message asks, and is refused while a hold is open. This one is the
 * exception to that suppression, so asking would refuse the single thing the rule
 * requires — and the refusal would look like the system working.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nIt does not ask the suppression it is an exception to");
{
  const job = read("soft-check-in.ts");
  const code = job ? decomment(job) : "";
  const asks = /maySend\s*\(/.test(code) || /isSuppressed\s*\(/.test(code);
  check("exception", !!job && !asks, job ? (asks ? "the job asks maySend, which will refuse it" : "no suppression check on this path") : "soft-check-in.ts not found");
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. Sent first, recorded after.
 *
 * Reversed, a failed send marks the student as checked in and they get nothing ever — the
 * hold has no exit but their own return. A duplicate is gentle and shows in the log.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe send comes before the record, so a failure repeats rather than vanishes");
{
  const job = read("soft-check-in.ts");
  const code = job ? decomment(job) : "";
  const send = code.indexOf("sendTemplated(");
  const record = code.indexOf("recordSoftCheckIn(");
  const ok = send >= 0 && record > send;
  check("order", ok, ok ? "sendTemplated, then recordSoftCheckIn" : `send at ${send}, record at ${record}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. A refused send is not recorded.
 *
 * The case that makes the ordering worth anything: if the provider refuses, nothing was
 * delivered, so nothing may be marked.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nA refused send leaves the check-in unspent");
{
  const job = read("soft-check-in.ts");
  const code = job ? decomment(job) : "";
  /* The guard must sit between the send and the record. */
  const send = code.indexOf("sendTemplated(");
  const guard = code.indexOf("send.sent");
  const record = code.indexOf("recordSoftCheckIn(");
  const ok = send >= 0 && guard > send && record > guard;
  check("refused", ok, ok ? "the outcome is checked before anything is recorded" : `send=${send} guard=${guard} record=${record}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. Her copy, and what it must not contain.
 *
 * "not coaching, not a prompt" — so no question, no task, no link, and no service Wing
 * invented. This is the copy a person reads a month into a safety hold.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nHer sentence, with nothing added to it");
{
  const seed = read("seed-message-templates.ts");
  const bad: string[] = [];

  if (!seed) bad.push("seed-message-templates.ts not found");
  else {
    const start = seed.indexOf('templateKey: "safety_soft_check_in"');
    if (start < 0) bad.push("the template does not exist");
    else {
      const end = seed.indexOf("templateKey:", start + 10);
      const entry = seed.slice(start, end > start ? end : undefined);

      const bodyStart = entry.indexOf("body: `");
      const bodyEnd = entry.indexOf("`,", bodyStart);
      const body = bodyStart >= 0 && bodyEnd > bodyStart ? entry.slice(bodyStart + 7, bodyEnd) : "";

      if (!body) bad.push("could not read the body");
      else {
        if (!body.includes("I'm here when you're ready.")) bad.push("her sentence is not in the body");
        /* Not a prompt: nothing to answer. */
        if (body.includes("?")) bad.push("the body asks a question");
        /* Not coaching: nothing to do, nowhere to go. */
        if (/\{\{\w*[Ll]ink\w*\}\}|https?:\/\//.test(body)) bad.push("the body carries a link");
        if (/\b(?:let's|try|start|open|click|reply|come back|log in)\b/i.test(body)) {
          bad.push("the body asks them to do something");
        }
        /* Never a service Wing invented. */
        if (/\b(?:\d{3}[- ]?\d{3,4}|hotline|helpline|crisis line|samaritans|988)\b/i.test(body)) {
          bad.push("the body names a specific service");
        }
        /* Short. The length is part of the message. */
        if (body.trim().split(/\n+/).filter(Boolean).length > 4) bad.push("the body has grown past four lines");
      }
    }
  }
  check("copy", bad.length === 0, bad.length === 0 ? "her sentence, no question, no link, no task, no invented service" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. The template is registered where the platform looks for it.
 *
 * `check-sequences` enumerates every template that must exist. A send whose template is
 * missing is refused by `sendTemplated` and logged — which is to say, silently, from the
 * point of view of the person who did not receive it.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe template is registered, so a missing row is caught before a send is");
{
  const bad: string[] = [];
  for (const [file, what] of [
    ["check-sequences.ts", "the expected-template list"],
    ["template-catalogue.ts", "the catalogue"],
  ] as const) {
    const src = read(file);
    if (!src) bad.push(`${file} not found`);
    else if (!src.includes("safety_soft_check_in")) bad.push(`not in ${what}`);
  }
  check("registered", bad.length === 0, bad.length === 0 ? "listed in both the expected set and the catalogue" : bad.join("; "));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 7. And the rule this is the exception to actually exists.
 *
 * Check 2 above asserted, correctly, that this job does not ask `maySend`. What
 * nothing asserted was that anything else does — and nothing else did. `maySend`
 * was written with `suppression.ts` and had no caller at all, so for its whole
 * life this file was the exception to a suppression that was not running, and a
 * student under a crisis hold kept receiving welcome, dormancy, calendar and
 * prompt mail.
 *
 * An exception tested without its rule is how that survives review: every
 * statement in the pair was true on its own.
 *
 * The gate belongs on `sendTemplated` rather than at each call site, because
 * there are eight send sites and a rule that must be remembered at a call site
 * will be missed at one. So that is what this checks.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nEvery other outbound message does ask it");
{
  const store = read("messaging-store.ts");
  const bad: string[] = [];

  if (!store) bad.push("messaging-store.ts not found — this check proved nothing");
  else {
    const code = decomment(store);

    const send = code.indexOf("export async function sendTemplated(");
    if (send < 0) bad.push("sendTemplated not found");
    else {
      const body = code.slice(send);
      const gate = body.indexOf("maySend(");
      const provider = body.indexOf("getTemplate(");

      if (gate < 0) {
        bad.push("sendTemplated does not ask maySend — the hold suppresses nothing");
      } else if (!(provider > gate)) {
        /*
         * Before any work, not merely somewhere in the function: a gate after the
         * send is a log entry, not a gate.
         */
        bad.push("the hold is asked after the message is already being built");
      }

      /* And the exception is recognised by the shared constant, not a second literal. */
      if (!/SOFT_CHECK_IN_TEMPLATE/.test(body)) {
        bad.push("sendTemplated does not exempt the soft check-in — the one message a hold permits");
      }
    }

    if (!/export const SOFT_CHECK_IN_TEMPLATE\s*=/.test(code)) {
      bad.push("SOFT_CHECK_IN_TEMPLATE is not exported — the key would be typed twice");
    }
  }

  /* This job must use that constant rather than repeat the string. */
  const job = read("soft-check-in.ts");
  if (job && !/SOFT_CHECK_IN_TEMPLATE/.test(decomment(job))) {
    bad.push("the job names its template as a literal, so the two can disagree");
  }

  check("the rule", bad.length === 0, bad.length === 0
    ? "sendTemplated asks maySend before it builds anything, and exempts only the check-in"
    : bad.join("; "));
}

console.log(failed === 0 ? "\nall passed\n" : `\n${failed} failed\n`);
if (failed > 0) process.exit(1);

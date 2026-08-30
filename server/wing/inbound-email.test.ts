/**
 * B2 Trigger 2 — the emailed reply, and everything that must not become one.
 *
 * Run:  npx tsx server/wing/inbound-email.test.ts
 *
 * ── WHAT THESE PROTECT ───────────────────────────────────────────────────
 * This is the only public, unauthenticated write path into a student's record, and
 * the two ways it goes wrong are not symmetrical.
 *
 * Writing the WRONG thing is unrecoverable: an entry attributed to a student who did
 * not write it goes into the longitudinal memory Wing coaches from, and it runs
 * through `composeResponse`, which can open a safety hold. So identity comes from a
 * token this platform issued, never from the From header, and the refusals get more
 * assertions than the happy path.
 *
 * Writing NOTHING is merely bad: a reply silently dropped is a student who wrote to
 * Wing and got no answer. Hence the bottom-posting case, which is the one a
 * top-post-only stripper loses completely.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  MAX_REPLY_CHARS,
  addressesIn,
  envelopeRecipients,
  newReplyToken,
  parseInbound,
  replyAddressFor,
  stripQuotedReply,
  tokenFromRecipients,
} from "./inbound-email";

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ok — ${msg}`);

const LOCAL = "log";
const DOMAIN = "reply.sli.pro";

console.log("\ninbound email — the reply-to-log path\n");

/* ── Tokens ──────────────────────────────────────────────────────────────── */
console.log("The token is unguessable, and round-trips through an address");
{
  const before = failures;

  const a = newReplyToken();
  const b = newReplyToken();
  if (a === b) fail("two tokens came back identical");
  if (!/^[A-Za-z0-9_-]{16,}$/.test(a)) fail(`token is not URL-safe or is too short: "${a}"`);

  const address = replyAddressFor(a, LOCAL, DOMAIN);
  if (address !== `log+${a}@reply.sli.pro`) fail(`unexpected address shape: ${address}`);

  const back = tokenFromRecipients({ to: address }, LOCAL);
  if (back !== a) fail(`token did not survive the round trip: ${back}`);

  if (failures === before) ok("random, URL-safe, and recoverable from the address it was put in");
}

console.log("\nThe token is found wherever the client left it");
{
  const before = failures;
  const t = newReplyToken();
  const mine = replyAddressFor(t, LOCAL, DOMAIN);

  const cases: Array<[string, Parameters<typeof tokenFromRecipients>[0]]> = [
    ["a plain To", { to: mine }],
    ["a display name", { to: `"Wing" <${mine}>` }],
    ["reply-all, ours second", { to: `someone@else.com, ${mine}` }],
    ["ours on Cc", { to: "someone@else.com", cc: mine }],
    ["only the envelope", { envelopeTo: [mine] }],
    /*
     * The local part and domain folded, the TOKEN LEFT ALONE. Uppercasing the whole
     * address would change the token, which is base64url and case-significant —
     * that is the bug this case exists to have caught, and it did.
     */
    ["a folded local part and domain", { to: `LOG+${t}@REPLY.SLI.PRO` }],
  ];
  for (const [what, headers] of cases) {
    if (tokenFromRecipients(headers, LOCAL) !== t) fail(`token not found with ${what}`);
  }

  if (failures === before) ok(`found in all ${cases.length} placements, case-insensitively`);
}

console.log("\nAnd is not invented where there is none");
{
  const before = failures;

  const noToken: Array<[string, Parameters<typeof tokenFromRecipients>[0]]> = [
    ["a bare address", { to: `log@${DOMAIN}` }],
    ["an empty token", { to: `log+@${DOMAIN}` }],
    ["a token too short to be one", { to: `log+abc@${DOMAIN}` }],
    ["a different local part", { to: `hello+${newReplyToken()}@${DOMAIN}` }],
    ["a local part that merely starts the same", { to: `logbook+${newReplyToken()}@${DOMAIN}` }],
    ["punctuation in the token", { to: `log+ab.cd/ef+gh@${DOMAIN}` }],
    ["nothing at all", {}],
  ];
  for (const [what, headers] of noToken) {
    const got = tokenFromRecipients(headers, LOCAL);
    if (got !== null) fail(`${what} produced a token: "${got}"`);
  }

  if (failures === before) ok(`${noToken.length} malformed recipients, none yielding a token`);
}

console.log("\nAddress extraction drops display names and trailing punctuation");
{
  const before = failures;
  const got = addressesIn('"Ada, Lovelace" <ada@example.com>, bob@example.org; eve@x.io.');
  const want = ["ada@example.com", "bob@example.org", "eve@x.io"];
  if (got.join("|") !== want.join("|")) fail(`got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  if (failures === before) ok("three addresses, display names and punctuation dropped, case untouched");
}

/* ── Quoted replies ──────────────────────────────────────────────────────── */
console.log("\nThe student's own words come out of a top-posted reply");
{
  const before = failures;

  const cases: Array<[string, string]> = [
    [
      "Gmail",
      `Had a good week actually.\n\nOn Tue, 1 Sep 2026 at 09:14, Wing <log+abc@reply.sli.pro> wrote:\n> What's something you accomplished this week?\n`,
    ],
    [
      "Outlook",
      `Two interviews, one went well.\n\n-----Original Message-----\nFrom: Wing\nSubject: A question for you\n`,
    ],
    [
      "Apple Mail with a signature",
      `I finally sent the email I'd been putting off.\n\n--\nSam\n\nSent from my iPhone\n`,
    ],
    [
      "a client that only indents",
      `Nothing much happened.\n\n> How did the week go?\n> Wing\n`,
    ],
  ];

  for (const [client, raw] of cases) {
    const got = stripQuotedReply(raw);
    if (got.includes(">")) fail(`${client}: quoted text survived — "${got.slice(0, 60)}"`);
    if (/wrote:|Original Message|Sent from my/i.test(got)) {
      fail(`${client}: a client marker survived — "${got.slice(0, 60)}"`);
    }
    if (!got.length) fail(`${client}: the reply was lost entirely`);
    if (got.split("\n").length > 2) fail(`${client}: took more than the reply — ${JSON.stringify(got)}`);
  }

  if (failures === before) ok(`${cases.length} clients, reply kept, quote and signature dropped`);
}

console.log("\nA bottom-posted reply is recovered rather than lost");
{
  const before = failures;

  const raw = `On Tue, 1 Sep 2026 at 09:14, Wing <log+abc@reply.sli.pro> wrote:\n> What's something you accomplished this week?\n\nI ran the standup for the first time and nobody died.\n`;
  const got = stripQuotedReply(raw);

  if (!got.includes("ran the standup")) {
    fail(`the reply under the quote was lost — got ${JSON.stringify(got)}`);
  }
  if (got.includes("accomplished this week")) fail("the quoted question came back with it");
  if (/wrote:/.test(got)) fail("the attribution line survived");

  if (failures === before) ok("text under the quote is kept, the quote and attribution are not");
}

console.log("\nNothing is invented when there is nothing to keep");
{
  const before = failures;
  for (const [what, raw] of [
    ["an empty body", ""],
    ["whitespace", "   \n\n  \n"],
    ["a quote and nothing else", "> How did the week go?\n> Wing\n"],
    ["only a signature", "--\nSam\n"],
  ] as const) {
    const got = stripQuotedReply(raw);
    if (got !== "") fail(`${what} produced "${got}"`);
  }
  if (failures === before) ok("four empty shapes, all empty out");
}

/* ── The whole decision ──────────────────────────────────────────────────── */
console.log("\nparseInbound accepts a real reply and says why for everything else");
{
  const before = failures;
  const t = newReplyToken();
  const to = replyAddressFor(t, LOCAL, DOMAIN);

  const good = parseInbound(
    { to, from: "Sam <sam@berkeley.edu>", subject: "Re: a question", text: "Good week. Two interviews." },
    [],
    LOCAL,
  );
  if (!good.ok) fail(`a real reply was refused: ${good.why}`);
  else {
    if (good.reply.token !== t) fail("the wrong token came back");
    if (good.reply.text !== "Good week. Two interviews.") fail(`text was mangled: ${good.reply.text}`);
    if (!good.reply.from.includes("sam@berkeley.edu")) fail("the From was not recorded");
  }

  /* Each refusal, with the reason it must give. */
  const refusals: Array<[string, ReturnType<typeof parseInbound>, RegExp]> = [
    [
      "no token anywhere",
      parseInbound({ to: `log@${DOMAIN}`, from: "sam@berkeley.edu", text: "hello" }, [], LOCAL),
      /token|identif/i,
    ],
    [
      "an out-of-office",
      parseInbound({ to, subject: "Out of Office: Re: a question", text: "I am away." }, [], LOCAL),
      /automated/i,
    ],
    [
      "an auto-reply",
      parseInbound({ to, subject: "Automatic reply: a question", text: "Away until Monday." }, [], LOCAL),
      /automated/i,
    ],
    [
      "a bounce",
      parseInbound({ to, subject: "Undeliverable: a question", text: "550 no such user" }, [], LOCAL),
      /automated/i,
    ],
    [
      "a reply with only the quote",
      parseInbound({ to, subject: "Re: a question", text: "> the original\n" }, [], LOCAL),
      /nothing left/i,
    ],
  ];

  for (const [what, outcome, reason] of refusals) {
    if (outcome.ok) fail(`${what} was accepted as a reply`);
    else if (!reason.test(outcome.why)) fail(`${what} gave an unhelpful reason: "${outcome.why}"`);
  }

  if (failures === before) ok(`one reply accepted, ${refusals.length} refused with a stated reason`);
}

console.log("\nA very long reply is truncated rather than refused");
{
  const before = failures;
  const to = replyAddressFor(newReplyToken(), LOCAL, DOMAIN);
  const outcome = parseInbound({ to, text: "x".repeat(MAX_REPLY_CHARS * 3) }, [], LOCAL);

  if (!outcome.ok) fail(`a long reply was refused: ${outcome.why}`);
  else if (outcome.reply.text.length !== MAX_REPLY_CHARS) {
    fail(`truncated to ${outcome.reply.text.length}, expected ${MAX_REPLY_CHARS}`);
  }

  if (failures === before) ok(`capped at ${MAX_REPLY_CHARS}, because someone's long week is still their week`);
}

console.log("\nThe SMTP envelope is read, and a broken one is not fatal");
{
  const before = failures;
  const t = newReplyToken();

  const good = envelopeRecipients(JSON.stringify({ to: [replyAddressFor(t, LOCAL, DOMAIN)], from: "sam@x.io" }));
  if (good.length !== 1 || !good[0].includes(t)) fail(`envelope not read: ${JSON.stringify(good)}`);

  /*
   * The envelope matters more than `to` when a student's mail passes through a
   * forwarder, which rewrites the visible header and leaves the SMTP recipient alone.
   */
  const viaForwarder = parseInbound(
    { to: "sam@personal.example", text: "Busy week but a good one." },
    envelopeRecipients(JSON.stringify({ to: [replyAddressFor(t, LOCAL, DOMAIN)] })),
    LOCAL,
  );
  if (!viaForwarder.ok) fail(`a forwarded reply was refused: ${viaForwarder.why}`);
  else if (viaForwarder.reply.token !== t) fail("the envelope token was not used");

  for (const [what, raw] of [
    ["undefined", undefined],
    ["not JSON", "{oh no"],
    ["JSON with no to", '{"from":"x@y.z"}'],
    ["a to that is not an array", '{"to":"x@y.z"}'],
    ["a to of non-strings", '{"to":[1,2,null]}'],
  ] as const) {
    const got = envelopeRecipients(raw);
    if (got.length !== 0) fail(`${what} produced ${JSON.stringify(got)}`);
  }

  if (failures === before) ok("read when it parses, empty when it does not, and it beats a rewritten To");
}

/* ─────────────────────────────────────────────────────────────────────────
 * And the parts of this that live outside a pure module.
 *
 * The three rules below are not properties of any function — they are properties of
 * how the pieces are joined, and each of them is a way for this feature to look built
 * and be unsafe or inert.
 * ───────────────────────────────────────────────────────────────────────── */
console.log("\nThe route is shut unless it is configured, and identity never comes from From");
{
  const before = failures;
  const rel = "server/inbound-email-routes.ts";
  const path = join(process.cwd(), rel);

  if (!existsSync(path)) fail(`${rel} not found — this block proved nothing`);
  else {
    const code = readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    /*
     * The route must not exist without its secret. Registered-and-open is the state
     * every unconfigured environment would otherwise be in, and it is an
     * unauthenticated writer into student records on all of them.
     */
    if (!/if \(!secret\)/.test(code) || !/return;/.test(code)) {
      fail("the route registers without checking INBOUND_EMAIL_SECRET");
    }
    if (!/app\.post\(`\/api\/email\/inbound\/\$\{secret\}`/.test(code)) {
      fail("the secret is not in the mounted path");
    }

    /*
     * And identity comes from the token. `from` is read for the audit trail; if it
     * ever reaches a student lookup, anyone can write into anyone's record.
     */
    if (/\bfrom\b[^;\n]*(?:studentFor|studentIdFor|byEmail|recipientFor)/.test(code)) {
      fail("the From header reaches a student lookup — it is a header, not a credential");
    }
    if (!/messageForReplyToken\(/.test(code)) {
      fail("nothing resolves the reply token — the only identity this path has");
    }

    /* A redelivered message must not become a second entry. */
    if (!/repliedAt/.test(code)) {
      fail("no guard on an already-answered message — a duplicate delivery doubles the entry");
    }

    /* The entry is written before the prompt is marked answered. */
    const entry = code.indexOf("createEntry(");
    const stamp = code.indexOf("recordReply(");
    if (entry < 0 || stamp < 0 || stamp < entry) {
      fail("the prompt is marked answered before the entry is written — a failure between them loses the words");
    }
  }

  if (failures === before) ok("no secret, no route; identity by token; no double entry; entry before stamp");
}

console.log("\nOnly a message that asks a question carries a reply address");
{
  const before = failures;
  const read = (rel: string) => {
    const p = join(process.cwd(), rel);
    return existsSync(p)
      ? readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
      : null;
  };

  const engagement = read("server/wing/engagement.ts");
  const messaging = read("server/wing/messaging-store.ts");

  if (!engagement || !messaging) fail("engagement.ts or messaging-store.ts not found");
  else {
    /*
     * Exactly one send invites a reply. More than one and a student is answering
     * mail nothing reads; none and the whole path is inert while looking wired.
     */
    const invites = (
      [engagement, messaging, read("server/wing/soft-check-in.ts") ?? ""]
        .join("\n")
        .match(/invitesReply:\s*true/g) ?? []
    ).length;
    if (invites !== 1) fail(`${invites} sends invite a reply — the life-log prompt is the only question Wing asks`);

    /* The soft check-in is not one of them, and never becomes one. */
    if (/invitesReply/.test(read("server/wing/soft-check-in.ts") ?? "")) {
      fail("the soft check-in invites a reply — it is the one contact a safety hold permits, and it is not a question");
    }

    /* A token is only stored for a send that actually went out. */
    if (!/replyToken:\s*sent \? replyToken : null/.test(messaging)) {
      fail("a reply token is stored on a refused send — an address nobody ever received");
    }
  }

  if (failures === before) ok("one question, one reply address, and no token on a message that never left");
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);

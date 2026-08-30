/**
 * Reading a student's emailed reply — the pure half of B2 Trigger 2.
 *
 * "Every 5 days via email or text. Varied question. **Student can reply directly —
 * response logged without opening app.**"
 *
 * Pure: no database, no provider, no network. The route that uses it is a thin shell,
 * because everything here is the part that can be wrong in a way nobody notices — an
 * address parsed loosely, or a reply that arrives as the student's two sentences
 * followed by four hundred lines of quoted Wing.
 *
 * ── THE FROM HEADER IS NOT AN IDENTITY ───────────────────────────────────
 * This is the whole reason the token exists, and it is worth being blunt about.
 *
 * The obvious design is to read `from`, look up the student by email address, and
 * file the entry against them. `From` is trivially forged — it is a header, not a
 * credential — so that endpoint lets anyone on the internet write into any student's
 * longitudinal record, in their own words, attributed to them. Worse: the entry runs
 * through `composeResponse`, which can open a safety hold. A stranger could put a
 * student under a crisis hold, and the only trace would be an entry the student
 * swears they did not write.
 *
 * So identity comes from the ADDRESS THE REPLY WAS SENT TO. Each outbound message
 * that invites a reply carries `Reply-To: <local>+<token>@<domain>`, the token is
 * random, unguessable and stored on that one message row, and the inbound side
 * resolves the student from the token alone. The From header is recorded and never
 * trusted.
 *
 * That also gets `promptId` for free: the token identifies the exact message, so the
 * reply is attributed to the prompt it answers rather than to the most recent one.
 */
import { randomBytes } from "crypto";

/**
 * 128 bits, base64url. Guessing one is not a threat model anybody has to think about
 * again, and the address stays short enough not to wrap in a mail client.
 */
export const REPLY_TOKEN_BYTES = 16;

export function newReplyToken(): string {
  return randomBytes(REPLY_TOKEN_BYTES).toString("base64url");
}

/** `wing+AbC123@log.example.com` — the sub-addressed form every major provider routes. */
export function replyAddressFor(token: string, local: string, domain: string): string {
  return `${local}+${token}@${domain}`;
}

/**
 * Every address in a header value, with display names dropped. CASE IS PRESERVED.
 *
 * SendGrid's `to` can carry several — a student who replies-all, a mailing list, a
 * BCC line — and the token may be on any of them, so all are searched rather than
 * the first.
 *
 * ── WHY THIS DOES NOT LOWERCASE ──────────────────────────────────────────
 * It did, and every emailed reply would have been unresolvable in production while
 * the log said "no reply token on any recipient". The token is base64url, which is
 * case-SIGNIFICANT — `G76eV_bz…` and `g76ev_bz…` are different tokens, and only one
 * of them is in the database.
 *
 * Comparing addresses case-insensitively is right for the local part and the domain,
 * and it is done at the comparison in `tokenFromRecipients` rather than by destroying
 * the string here. Normalising early is the reflex; this is the case where it eats
 * the only identifier in the message.
 */
export function addressesIn(header: string): string[] {
  const out: string[] = [];
  const RE = /[^\s<>,;"]+@[^\s<>,;"]+/g;
  for (let m = RE.exec(header ?? ""); m !== null; m = RE.exec(header ?? "")) {
    out.push(m[0].replace(/[.,;]+$/, ""));
  }
  return out;
}

/**
 * The reply token, from whichever recipient carries it.
 *
 * Matched on the local part only. The domain is not checked here because the mail
 * that reaches this webhook has already been routed to us by MX — checking it again
 * would mean this module holding a copy of the deployment's hostname, and a staging
 * domain mismatch would silently drop every reply.
 *
 * Null when no recipient carries a token, which the caller must treat as "cannot
 * identify the sender" and never as "fall back to the From header".
 */
export function tokenFromRecipients(
  headers: { to?: string; cc?: string; envelopeTo?: readonly string[] },
  local: string,
): string | null {
  const candidates = ([] as string[]).concat(
    addressesIn(headers.to ?? ""),
    addressesIn(headers.cc ?? ""),
    (headers.envelopeTo ?? []) as string[],
  );

  const prefix = `${local.toLowerCase()}+`;
  for (const address of candidates) {
    const at = address.indexOf("@");
    if (at < 0) continue;

    /*
     * The local part is compared folded and the token is sliced from the ORIGINAL.
     * Mail systems may present `Log+…` or `LOG+…`; the token's own case is data.
     */
    const localPart = address.slice(0, at);
    if (!localPart.toLowerCase().startsWith(prefix)) continue;

    const token = localPart.slice(prefix.length);
    /*
     * Shape-checked, not just non-empty. `wing+@domain` and `wing+..@domain` are
     * what a mangled address looks like, and either would otherwise reach the
     * database as a lookup for a token nobody issued.
     */
    if (/^[A-Za-z0-9_-]{8,}$/.test(token)) return token;
  }
  return null;
}

/**
 * SendGrid's `envelope` field, which is a JSON string rather than a JSON object.
 *
 * Worth reading even though `to` usually carries the same address: the envelope is the
 * SMTP recipient, so it survives a client that rewrote the visible headers, and it is
 * the more reliable of the two when a student's mail passes through a forwarder.
 */
export function envelopeRecipients(envelope: string | undefined): string[] {
  if (!envelope) return [];
  try {
    const parsed = JSON.parse(envelope) as { to?: unknown };
    if (!Array.isArray(parsed.to)) return [];
    return parsed.to.filter((a): a is string => typeof a === "string");
  } catch {
    return [];
  }
}

/* ── Getting the student's own words out of the mail ─────────────────────── */

/**
 * The markers a mail client puts between a reply and what it is replying to.
 *
 * Deliberately conservative. Every entry here is a line a person is very unlikely to
 * write themselves at the start of a line, because the cost of a false positive is
 * silently truncating what a student wrote about their week.
 */
const QUOTE_MARKERS: readonly RegExp[] = [
  /^\s*On .{4,80}\bwrote:\s*$/i, // Gmail, Apple Mail
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i, // Outlook
  /^\s*_{10,}\s*$/, // Outlook's rule above the quoted headers
  /^\s*From:\s.+\bSent:\s/i, // Outlook, header block on one line
  /^\s*>{1,}\s?From:\s/i,
];

/**
 * Markers after which nothing is ever the student's reply.
 *
 * Separated from the quote markers because the two behave differently in the
 * bottom-posting fallback: a person can and does write UNDER an attribution line,
 * and nobody writes under their own signature. Merged, "only a signature" salvaged
 * the sender's name as a life-log entry — an entry whose entire content was "Sam".
 */
const TRAILER_MARKERS: readonly RegExp[] = [
  /^--\s*$/, // the standard signature separator (RFC 3676 §4.3)
  /^\s*Sent from my \w+/i,
  /^\s*Get Outlook for \w+/i,
];

const isQuoted = (line: string) => /^\s*>/.test(line);
const isMarker = (line: string) =>
  QUOTE_MARKERS.some((re) => re.test(line)) || TRAILER_MARKERS.some((re) => re.test(line));

/**
 * What the student actually wrote.
 *
 * ── TOP-POSTING, WHICH IS ALMOST EVERYONE ────────────────────────────────
 * The reply is the text above the first marker. Simple, and right for Gmail, Apple
 * Mail and Outlook defaults.
 *
 * ── AND BOTTOM-POSTING, WHICH IS THE INTERESTING CASE ────────────────────
 * If everything above the marker is blank, the student wrote UNDER the quote — so
 * taking the top would file an empty entry and lose the reply entirely. Falling back
 * to "everything that is not a quoted line and not a marker" recovers it.
 *
 * The order matters: top-post first, because a bottom-post fallback applied to a
 * top-post would append the sender's own signature and any unquoted footer the
 * client added.
 *
 * Returns an empty string when there is nothing left, and the caller must not write
 * an entry for that — an auto-reply, a read receipt and a student who replied with
 * only a quote all land here, and none of them is something they wrote.
 */
export function stripQuotedReply(raw: string): string {
  const lines = (raw ?? "").replace(/\r\n/g, "\n").split("\n");

  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (isMarker(lines[i]) || isQuoted(lines[i])) {
      cut = i;
      break;
    }
  }

  const top = lines.slice(0, cut).join("\n").trim();
  if (top) return top;

  /*
   * Bottom-posting. Drop the quoted lines and the attribution, then stop at the
   * first trailer — everything past a signature belongs to the mail client, not to
   * the person.
   */
  const kept: string[] = [];
  for (const line of lines) {
    if (TRAILER_MARKERS.some((re) => re.test(line))) break;
    if (isQuoted(line) || QUOTE_MARKERS.some((re) => re.test(line))) continue;
    kept.push(line);
  }

  return kept.join("\n").trim();
}

/** Longest entry stored from a reply. Matches what the in-app composer accepts. */
export const MAX_REPLY_CHARS = 10_000;

export type InboundReply = {
  token: string;
  text: string;
  /** Recorded for the audit trail. Never used to identify anybody — see the header. */
  from: string;
  subject: string;
};

export type ParseOutcome =
  | { ok: true; reply: InboundReply }
  | { ok: false; why: string };

/**
 * One parsed reply, or a stated reason it is not one.
 *
 * The refusals are the point: this endpoint is public, and every branch below is a
 * message that must not become a life-log entry. Each says which, so a bounce storm
 * or a misconfigured forwarder is legible in the log rather than showing up as
 * silence.
 */
export function parseInbound(
  fields: { to?: string; cc?: string; from?: string; subject?: string; text?: string },
  envelopeTo: readonly string[],
  local: string,
): ParseOutcome {
  const token = tokenFromRecipients(
    { to: fields.to, cc: fields.cc, envelopeTo },
    local,
  );
  if (!token) {
    return {
      ok: false,
      why: "no reply token on any recipient — the sender cannot be identified, and the From header is not an identity",
    };
  }

  /*
   * Auto-replies, before anything else. An out-of-office bounced into a student's
   * own life log is the kind of thing nobody notices for a month.
   */
  const subject = (fields.subject ?? "").trim();
  if (/^\s*(?:auto(?:matic)?[- ]?reply|out of (?:the )?office|undeliverable|delivery status notification)/i.test(subject)) {
    return { ok: false, why: `looks like an automated reply ("${subject.slice(0, 60)}")` };
  }

  const text = stripQuotedReply(fields.text ?? "");
  if (!text) {
    return { ok: false, why: "nothing left after the quoted original — no reply to log" };
  }

  return {
    ok: true,
    reply: {
      token,
      text: text.slice(0, MAX_REPLY_CHARS),
      from: (fields.from ?? "").slice(0, 320),
      subject: subject.slice(0, 300),
    },
  };
}

import type { Express, Request, Response } from "express";
import Busboy from "busboy";
import { log } from "./logger";
import * as messaging from "./wing/messaging-store";
import * as lifeLog from "./wing/life-log-store";
import { envelopeRecipients, parseInbound } from "./wing/inbound-email";

/**
 * The inbound reply webhook (Feature List B2 Trigger 2, B3 "reply-to-log").
 *
 * "Every 5 days via email or text. Varied question. Student can reply directly —
 * response logged without opening app."
 *
 * SendGrid Inbound Parse POSTs `multipart/form-data` to this route when mail arrives
 * at the configured hostname. Everything that decides anything lives in
 * `wing/inbound-email.ts`, which is pure and tested; this is the shell.
 *
 * ── THIS IS THE ONLY UNAUTHENTICATED WRITE PATH INTO A STUDENT'S RECORD ──
 * So it has two independent locks, and neither is the From header.
 *
 *   the URL secret   the route is mounted at a path containing a secret only
 *                    SendGrid's configuration knows. Anyone can find the hostname;
 *                    nobody can find the path.
 *   the reply token  identity comes from the address the mail was sent TO, which
 *                    carries a random per-message token this platform issued. A
 *                    forged `From` resolves to nothing.
 *
 * Both are needed. The secret alone would let a leaked URL write anywhere; the token
 * alone leaves an open endpoint that anyone can probe.
 *
 * ── AND IT ALWAYS ANSWERS 200 ────────────────────────────────────────────
 * SendGrid retries on a non-2xx and drops the mail after enough failures. A message
 * this route decides not to log — an out-of-office, a bounce, a token nobody issued —
 * is not a transport failure, and returning 4xx would have SendGrid redeliver it on a
 * schedule of its own. Every refusal is logged with its reason instead.
 *
 * The one exception is the secret: a request with the wrong one is not SendGrid, and
 * it gets 404 so the path stays indistinguishable from one that does not exist.
 */

/** What the route needs from the form body, whatever parsed it. */
export type InboundFields = {
  to?: string;
  cc?: string;
  from?: string;
  subject?: string;
  text?: string;
  envelope?: string;
};

/**
 * Handles one parsed inbound message. Exported so it can be driven directly.
 *
 * Returns a one-line outcome for the log. It never throws: an exception here would
 * become a 500, and a 500 makes SendGrid redeliver a message we have already decided
 * about.
 */
export async function handleInbound(fields: InboundFields): Promise<string> {
  const local = process.env.INBOUND_EMAIL_LOCAL || "log";

  const outcome = parseInbound(fields, envelopeRecipients(fields.envelope), local);
  if (!outcome.ok) return `ignored — ${outcome.why}`;

  const target = await messaging.messageForReplyToken(outcome.reply.token);
  if (!target) {
    /*
     * A token that resolves to nothing. Not an error and not worth alarming about:
     * an old address forwarded on, a token from a message that failed to send, or
     * somebody probing. The reply is dropped and the fact is recorded.
     */
    return "ignored — reply token matches no message";
  }

  if (target.repliedAt) {
    /*
     * Already redeemed. Mail is delivered more than once more often than people
     * expect, and without this a duplicate delivery becomes a duplicate life-log
     * entry — which then goes through `composeResponse` a second time and can open a
     * second hold for one thing the student said once.
     */
    return `ignored — message ${target.messageEventId} was already answered`;
  }

  /*
   * The entry first, then the stamp. Reversed, a failure between them would mark the
   * prompt answered with nothing recorded, and the student's words would be gone —
   * the same ordering rule the soft check-in follows, for the same reason.
   *
   * `createEntry` does the rest: it composes Wing's reply, applies the safety rules,
   * opens a hold if the entry warrants one, and resets the dormancy clock unless the
   * entry is one IG-MJ04 says not to escalate.
   */
  const entry = await lifeLog.createEntry({
    studentId: target.studentId,
    entryText: outcome.reply.text,
    promptId: target.promptId,
    captureSource: "email_reply",
  });

  await messaging.recordReply({
    messageEventId: target.messageEventId,
    replyContent: outcome.reply.text,
    lifeLogEntryId: entry?.id ?? null,
  });

  return `logged entry ${entry?.id} for student ${target.studentId} from an email reply`;
}

export function registerInboundEmailRoutes(app: Express) {
  const secret = process.env.INBOUND_EMAIL_SECRET;

  if (!secret) {
    /*
     * Not registered at all rather than registered and open.
     *
     * An unset secret is the state of every environment that has not configured
     * Inbound Parse, and mounting the route anyway would put an unauthenticated
     * writer on the internet for all of them. Nothing is lost by its absence: with no
     * `INBOUND_EMAIL_DOMAIN` no outbound message carries a reply address either, so
     * there is nothing for it to receive.
     */
    log("inbound email not registered — INBOUND_EMAIL_SECRET is unset", "inbound");
    return;
  }

  app.post(`/api/email/inbound/${secret}`, (req: Request, res: Response) => {
    /*
     * Answered before the work. SendGrid times out at 20 seconds and retries, and
     * `createEntry` makes a model call — so a slow reply would be redelivered and
     * logged twice. The `repliedAt` guard makes that safe rather than merely
     * unlikely, and answering first makes it rare as well.
     */
    res.status(200).json({ ok: true });

    /*
     * Parsed here rather than by a global body parser.
     *
     * Inbound Parse posts `multipart/form-data`, which neither `express.json` nor
     * `express.urlencoded` handles — they see the content type and pass it through, so
     * `req.body` would be empty and every reply would be dropped with "no reply
     * token", which is indistinguishable from a real refusal.
     *
     * Busboy streams, which matters: a student replying from a phone attaches photos
     * without meaning to, and buffering a 25MB message to read four text fields is how
     * a webhook falls over on the one day it is busy. Files are drained, never read.
     */
    let bb: ReturnType<typeof Busboy>;
    try {
      bb = Busboy({ headers: req.headers, limits: { fieldSize: 5 * 1024 * 1024 } });
    } catch (err) {
      /* A request with no usable content type is not SendGrid. */
      log(`inbound email: unparseable request (${(err as Error).message})`, "inbound");
      return;
    }

    const fields: Record<string, string> = {};
    bb.on("field", (name: string, value: string) => {
      fields[name] = value;
    });
    /* Attachments are drained without being read — see above. */
    bb.on("file", (_name: string, stream: NodeJS.ReadableStream) => stream.resume());
    bb.on("error", (err: unknown) =>
      log(`inbound email parse failed: ${(err as Error).message}`, "inbound"),
    );
    bb.on("close", () => {
      handleInbound(fields as InboundFields)
        .then((outcome) => log(outcome, "inbound"))
        .catch((err) => log(`inbound email failed: ${(err as Error).message}`, "inbound"));
    });

    req.pipe(bb);
  });

  log("inbound email registered", "inbound");
}

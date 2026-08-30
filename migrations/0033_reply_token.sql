-- 0033 — the handle that makes an emailed reply attributable.
--
-- B2 Trigger 2: "Student can reply directly — response logged without opening app."
--
-- ── WHY A TOKEN AND NOT THE SENDER'S ADDRESS ────────────────────────────────
-- The obvious implementation reads the inbound `From`, looks the student up by email,
-- and files the entry against them. `From` is a header, not a credential, and forging
-- one takes a minute. That endpoint would let anyone on the internet write into any
-- student's longitudinal record in their own name — and because every life-log entry
-- runs through `composeResponse`, which can open a safety hold, a stranger could put a
-- student under a crisis hold with a single email.
--
-- So each outbound message that invites a reply carries
-- `Reply-To: <local>+<token>@<domain>`, the token lives here on that one row, and the
-- inbound side resolves the student from the token alone. The From header is recorded
-- for the audit trail and trusted for nothing.
--
-- ── AND WHY ON message_events RATHER THAN ON THE STUDENT ────────────────────
-- Same reasoning `opener_id` follows one migration earlier. A token per student would
-- be a standing credential — leaked once, valid forever, and valid for every prompt.
-- A token per MESSAGE identifies which prompt was answered, which is what
-- `logged_life_log_entry_id` and `prompt_id` on this row already want, and it limits
-- what a leaked address can do to one reply on one message.
--
-- ── NULLABLE, AND MOST ROWS STAY NULL ───────────────────────────────────────
-- Only messages that invite a reply carry one. Welcome mail, session-completion mail,
-- advisor snapshots and the soft check-in do not, and a reply address on the soft
-- check-in would be worse than useless: that message is the one contact a safety hold
-- permits, and it is deliberately not a question.

BEGIN;

ALTER TABLE "wing"."message_events"
  ADD COLUMN IF NOT EXISTS "reply_token" text;--> statement-breakpoint

-- Unique so a token resolves to exactly one message, partial so the NULL majority
-- costs nothing. A duplicate would mean a reply filed against an arbitrary one of two
-- prompts, which is the kind of wrong that reads as working.
CREATE UNIQUE INDEX IF NOT EXISTS "message_events_reply_token_unique"
  ON "wing"."message_events" ("reply_token")
  WHERE "reply_token" IS NOT NULL;--> statement-breakpoint

COMMENT ON COLUMN "wing"."message_events"."reply_token" IS
  'Random per-message handle carried in the Reply-To address of messages that invite '
  'a reply. The inbound webhook resolves the student and the prompt from this and '
  'never from the From header, which is forgeable. NULL on every message that does '
  'not ask for an answer.';

COMMIT;

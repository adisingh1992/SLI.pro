# Tier 1 — what is left on the backend

**Date:** 30 August 2026 · Berkeley undergraduates start 1 September
**Method:** read against the Feature List (May 2026) §A and §B, verified in code on `dev`.
Every finding below has a file and line. Nothing here is taken from a comment claiming
something is done — this codebase's recurring defect is a surface asserting a rule that
the thing it names does not implement, and four of the findings are that shape again.

**Supersedes on status:** `WING_TIER1_SCOPE.md` (16 Aug, says T5–T9 outstanding — T6, T7,
T8 and T9 have since shipped) and `TIER1_GAP_ANALYSIS.md` (10 Aug).

---

## Bottom line

The methodology work is done. What is left divides into three unequal parts:

1. ~~**Six wiring defects** where complete, tested code is not reached, or is reached with
   the wrong argument.~~ **Fixed 30 August — see §1.** They were small edits with large
   blast radii: one silenced the safety-hold suppression, another zeroed the board-facing
   completion number.
2. **One genuinely unbuilt area:** every inbound channel. No reply-to-log, no SMS, no voice
   transcription. This is real engineering, not wiring, and it is the largest remaining
   Tier 1 hole.
3. **Two decisions that are not engineering** — the Enhancement Modules and locked
   modules — plus the scheduler deployment, which you have scoped to production only.

---

## 1. Wiring defects — **FIXED 30 August**

All six are on `dev`, with `LIVE_SLI_STATUSES` in `sli-store.ts` and two new contract
checks: `api-contracts` check 24 (no reader filters SLIs on a single status) and check 7
in `soft-check-in.test.ts` (`sendTemplated` asks `maySend` before it builds anything).
Ten mutations, ten caught. Kept below as the record of what was wrong and why.

### 1.1 Five surfaces filter on an SLI status no row ever holds

**Root cause.** Every insert of `status: "selected"` is immediately followed by
`markActive`, which sets `"active"` (`sli-store.ts:167→172`, `:235→242`, `:300→309`, plus
`sli-routes.ts:102` and `:178`). No row survives at `'selected'` past the statement that
created it. `sli-store.getActive` knows this — it reads `active ?? selected` (`:95-96`).
Five other readers do not:

| Reader | Consequence |
|---|---|
| `advisor-snapshot.ts:167` | The advisor snapshot has **no SLI headline** — the first of its six named contents |
| `cohort-metrics.ts:219-220` | "Students with a completed SLI" reports **0 for every cohort** — this is the board-defence number |
| `cohort-metrics.ts:323` | The CSV export's `has_selected_sli` is always false |
| `life-log-store.ts:136` | Wing's life-log reply **never sees the student's SLI** — B2's "connects entries to the SLI" is the feature |
| `engagement.ts:128` | The Session 3 completion email ships with an empty SLI statement |

**Fix:** `status IN ('active','selected')` in all five, or route them through `getActive`.
One root, five surfaces, no schema change.

### 1.2 The safety-hold suppression has no caller

`maySend` (`safety-hold-store.ts:141`) is the gate that stops outbound contact while a
crisis hold is open. **Nothing calls it.** `sendTemplated` (`messaging-store.ts:99`) goes
straight from template lookup to render to send.

Three separate comments assert the opposite — `soft-check-in.ts:17-19`
("Every other outbound message asks `maySend`"), `run-sequences.ts:135`, and
`intake-conversation.ts:859`. The soft check-in was deliberately built as *the exception*
to a suppression that does not exist.

**Today a student under an open safety hold still receives welcome, dormancy, calendar,
prompt and launch mail.** Fix: one `maySend` call at the top of `sendTemplated`, with an
explicit bypass for `safety_soft_check_in`.

### 1.3 The in-app life-log prompt uses the unfiltered legacy selector

`life-log-store.ts:61` calls `messaging.nextPrompt`, which filters on `active` and an
optional legacy category and **nothing else** (`messaging-store.ts:537-567`) — no audience,
no cadence, no pool ratio, no event-sensitivity. `nextLibraryPrompt` applies all of those
and is called only from the email path (`engagement.ts:381`).

So the in-app surface can show a Berkeley undergraduate an executive-only prompt. This is
the same fail-open the email path was fixed for; the fix landed on one of the two callers.
Its no-repeat rule is also inert in-app: it queries `message_events.prompt_id`, and nothing
writes a row when a prompt is *displayed*, so the same prompt can appear on every load.

**Fix:** point `life-log-store.ts:61` at `nextLibraryPrompt` with the student's population
tags, as `engagement.ts:379` does.

### 1.4 Dormancy re-engagement cannot reach a dormant student

`resetDormancy` creates the sequence row, and its only callers are session-completion
(`engagement.ts:160`) and writing a life-log entry (`life-log-store.ts:243`). A student who
registers and then does nothing — exactly the population S3 exists for — never gets a row,
so the day-14/19/24 sequence can never fire for them. This is independent of the scheduler.

**Fix:** call `resetDormancy` alongside `onRegistered` (`engagement.ts:67`).

### 1.5 `intake_records.pathway` is never written

The founder/freelancer branch is **fully built downstream** — `PATHWAY_GUIDANCE` for
employment/venture/freelance is injected into every Foundation prompt
(`student-context.ts:216-259`, reached at `:337`) and `populationTagsFor` maps
venture/freelance onto the entrepreneur populations (`population-tags.ts:150-186`).

It receives nothing. `intake-beats.test.ts:281-297` records a deliberate decision — *"pathway
is no longer asked … it must be derived from the audience track"* — and no beat captures it
(11 beats, `intake-beats.ts:127-285`). But the deriver, `audience-track.pathwayFor`
(`audience-track.ts:298`), **has no caller**, so nothing derives it either. The consumer at
`intake-conversation.ts:751` is unreachable, because `sanitiseExtracted` drops any key not in
`KNOWN_FIELDS` (`:93`, `:372`), and `intakeStore.setPathway` therefore never runs.

**Fix:** call `pathwayFor` on the resolved audience track at the end of intake and pass the
result to `setPathway`. The decision not to ask is sound; only the derivation is missing.

### 1.6 `/start` demotes a completed session

`POST /api/foundation-sessions/:n/start` has no status guard
(`foundation-sessions-routes.ts:657-660`) and `startSession` unconditionally sets
`in_progress` with a fresh `startedAt` (`session-store.ts:140-147`). Reopening a finished
session therefore drops it out of `buildWingKnows` (`:303-307`) and prior-session context
(`:239`, `:379`), both of which key on `status === "completed"` — so A2's backward
navigation loses exactly the facts the next session opens on.

**Fix:** skip `startSession` when the session is already `completed`.

---

## 2. Genuinely unbuilt: every inbound channel

Nothing here is wiring. There is **no inbound webhook of any kind** in the server — the only
webhook is Stripe (`payment-routes.ts:26`). This is one hole with four names:

| Requirement | State |
|---|---|
| B2 Trigger 2 — "reply directly, response logged without opening app" | **Missing.** `message_events.replied_at`, `.reply_content`, `.logged_life_log_entry_id` (`wing-schema.ts:1446-1448`) and the `email_reply`/`sms_reply` capture channels exist and are never written |
| B2 Trigger 5 — SMS voice reply, transcribed | **Missing.** No Twilio dependency, no SMS credentials in `config.ts`; `sendTemplated` logs a failure row for any non-email channel (`messaging-store.ts:151-156`) |
| B3 — "reply-to-log (inbound email processing)" | **Missing**, same root |
| Whisper transcription | **Built and uncalled.** `orchestrator.transcribe()` (`index.ts:527`) is complete with credentials mapped (`config.ts:46`, `:107`) and has zero callers. There is no audio upload route |

`users.phone_number` is collected at registration (`auth.ts:53`) and only ever echoed into
admin exports. `user_channel_preferences.preferred_channel` (`wing-schema.ts:340-352`) is
written and read by nothing, so a student who opts into SMS still gets email.

**Smallest useful slice:** one `POST /api/email/inbound` (SendGrid Inbound Parse) that
resolves the sender to a student, writes a `direction='inbound'` `message_events` row, and
hands the text to the existing life-log entry path. That closes B2 Trigger 2 and B3's
reply-to-log without touching SMS or voice.

---

## 3. Enhancement Modules (A3) — mostly one pending decision

The isolation bug is genuinely fixed on the streaming path: full Foundation context, SLI,
lineage, homework and LinkedIn optimisation are assembled and passed into the prompt
(`enhancement-modules-routes.ts:1013-1097`). Skippability is real — no gate exists for any
population, undergraduate included. SLI refinement works end to end (`sli-routes.ts:189-328`);
the old string-splitting parser is gone.

What remains:

- **No methodology reaches the module surface.** The route imports none of `engine`, `voice`,
  `compileSafety`, `classifier` or `scoring` — compare `foundation-sessions-routes.ts:16-20`.
  There is no card scope for enhancement modules: `sessionScopeFor` returns null for anything
  that is not intake or Foundation (`build-foundation-sequences.ts:128-140`). **This is
  Decision 1** (retire the modules vs. update their heuristics) and it is Danielle and Sam's,
  not an engineering call. Everything else in A3 is cheap; this is the whole of A3's cost.
- **Module context chains forward-only.** B reads A; C reads A and B; **A reads nothing**
  (`:1031-1050`). "Any order" is true for access and false for context.
- **Early exit is a one-way door and does not seal the transcript.** `enhancement-store.ts:176`
  calls `completeSession` only for `"completed"`, so `ended_early` skips transcript sealing and
  leaves `completedAt` NULL; `/start` only promotes `available` (`:928`) while the stream route
  rejects anything not `in_progress`/`completed` (`:979-983`), so the module cannot be resumed.
- **Ended-early Foundation sessions are invisible to modules** — `if (row.status !== "completed") continue;`
  (`:544`) drops a real artifact that the Foundation end-early path did write.
- **Module criteria replay is silently meaningless.** `criteria-replay.ts:174-180` passes
  arguments in the wrong positions against `checkModuleCompletion(userId, moduleCode, messages,
  userProfile, professionalStatus?, criteriaOverride?)`, so the draft criteria are never applied
  and the population always resolves to mid-career.

---

## 4. Built, correct, and waiting for the UI

Not defects — they were built ahead of the surface that uses them. Listing them so the new UI
work knows what already exists:

- `shared/recommendation.ts` — IG-UX02's one-recommendation rule, 11 ordered rules, enumerated
  over 1,536 states. No importer.
- `shared/transitions.ts` — IG-UX05's three-part transitions with duration and what the next
  section reveals. Only `recommendation.ts` imports it, and that has no importer either. This
  one is **server-renderable today**: the `session_completed` event
  (`foundation-sessions-routes.ts:1352-1358`) carries no transition text, and A2's "contextual
  micro-copy at every transition" is half-delivered without it — session *openings* are wired
  (`:687`), transitions are not.
- `prompt-log-store.ts` — no importer.

And one that is **not** waiting for the UI: `reveal-select.ts` — A1's "early value add
(critical)", the RT-01–RT-14 template table with band ranking, falsifiability and IG-INT06
deferral — has no importer anywhere, and neither does its dependency `audience-track.ts` at
runtime. What ships instead is a coarse boolean gate plus free-form model prose
(`intake-conversation.ts:608-614`, `intake-beats.ts:459-473`). `intake-beats.ts:496-508` says
so itself: *"belongs to reveal selection (H-019.5) … Until that exists"* — it exists; it has
no caller. Wiring it also supplies 1.5's missing pathway derivation, since both hang off the
audience track.

---

## 5. Not backend gaps

Recorded so they are not counted twice:

- **The scheduler.** Code, Dockerfile (`build:sequences`, line 37) and pipeline stage
  (`SCHEDULER_JOB_NAME`, `azure-pipelines.yml:310-330`) are all in place. What is outstanding
  is the one-time `az containerapp job create`, Key Vault access for its managed identity, and
  the variable-group value — **production only**, per your scoping. Until that exists in prod,
  S1 emails 2–3, S3, S4, S5's twelve weeks, the B2 cadence, the internship milestones, the
  advisor 24-hour trigger and the soft check-in do not fire. Everything else about them is done.
- **Decision 1** (Enhancement Modules: retire or update heuristics) and **Decision 2**
  (locked modules — already implemented as unlocked, per IG-UX01 ruling 1; the decision is
  now only whether that stands).
- **NACE licensing** — Cooley, on an A4 deliverable.
- **B5 device testing**, unified module presentation, module labels, and the client half of
  everything in §4 — UI.

### Two smaller notes

- `intake_records.verification_status` (`wing-schema.ts:1588`) defaults to `pending` and has
  no reader and no writer. Nothing blocks a student, which satisfies A1's "verification happens
  in the background", but nothing verifies either. Retire the column or give it one writer.
- The prompt library is **not** "configurable without code changes" as B2 requires — there is no
  admin route for `prompt_library` or `prompt_openers`, only seed scripts. `template-routes.ts`
  is the pattern it needs.
- `/api/admin/export/transcripts` (`routes.ts:1757-1790`) still reads the legacy public tables,
  which nothing writes post-cutover, so it returns empty sheets for every session.

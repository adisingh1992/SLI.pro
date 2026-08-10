# Tier 1 gap analysis — 10 days to August 15

Read against the Feature List (May 2026) §A and §B, and the Architecture and
Strategy doc §13. Written 2026-08-05.

---

## The headline

**The migration is nearly done. Tier 1 is not the migration.**

Tier 1 = Feature List **Section A** (modify seven existing areas) +
**Section B** (build five new features). Everything built so far is the
*backbone* — §A6 plus the Azure move — which the Strategy doc explicitly
sequenced first ("backbone and migration lead").

Of the twelve Tier 1 items, **two are done**. Three of the five new Section B
features have no implementation at all.

---

## Section A — existing features requiring modification

| | Item | State |
|---|---|---|
| A1 | Conversational intake replacing the form, early insight at Q8–10 | ❌ `branding-intake` is still a form page |
| A2 | Foundation Session modifications | ◐ partial — see below |
| A3 | Enhancement Module fixes | ◐ partial |
| A4 | Behavioral Evidence Portfolio, NACE mapping, 360Brew standard | ❌ table exists, no logic |
| A5 | New modules | — all Tier 2, correctly out of scope |
| A6 | Heuristics engine separate from LLM layer, human/AI separation, full transcripts | ✅ **done** |

**A2 detail.** Done: forward-locking, prerequisite gating, heuristics updated
(this is what the objective/card work delivered). Not done: contextual
micro-copy at transitions, eliminating redundant data collection (sessions
still ask for things the LinkedIn PDF already has), incorporating uploaded
supplementary documents, the founder/freelancer pathway branch, backward
navigation to completed sessions, and career-evolution re-entry.

**A3 detail.** Done: modules receive full Foundation Session context — the
stated "significant gap" is closed. Not done: modules are not skippable for
undergraduates, there is no early-exit route (Foundation has one, modules do
not), SLI refinement is still broken, and the two surfaces still look
different.

---

## Section B — the five Tier 1 features

| | Feature | State | Notes |
|---|---|---|---|
| B1 | Advisor pre-meeting snapshot + student prep prompt | ✅ **done** | Manual entry only — see the scope note below |
| B2 | Event tracking and life log | ❌ **schema only** | `life_log_entries` table exists; no store, routes or UI |
| B3 | Email infrastructure and user journeys | ◐ **partial** | Store, 12 templates, welcome + completion + dormancy sequences, advisor snapshot. Outstanding: academic-calendar touchpoints, 90-day positioning sequence, inbound reply-to-log, SMS |

### B1 scope decision — no scheduling

The spec's infrastructure line reads *"calendar/scheduling system integration
(or manual admin trigger)"*. **Manual is the answer for August**, decided
7 Aug. Appointments are typed into `/admin/advisors`; the platform emails the
advisor 24 hours before and prompts the student on registration.

The boundary that goes with it: **SLI.pro does not own scheduling.** We accept
an appointment time and act on it. No availability, no booking, no
rescheduling, no reminders about the meeting itself — Berkeley and Vanderbilt
already run systems that do. Auto-scheduling gets built when a partner names
the system to integrate with, and *that* is the question worth putting to
Danielle: which scheduler does each partner use?
| B4 | Institutional admin dashboard | ◐ **partial** | Admin area exists; cohort progress, completion rates, time-to-completion and CSV export not verified present |
| B5 | Mobile optimisation | ◐ **unverified** | Responsive classes are used throughout; no device testing done, no <3s-on-cellular measurement |

**B3 is the largest single gap.** The spec calls for five sequences (welcome,
session completion, dormancy, academic calendar, 90-day positioning launch),
per-institution calendar config, Azure Functions for scheduling, inbound email
parsing, and Twilio SMS with voice replies. Present: one transactional send.

---

## What is built that Tier 1 did not ask for

Worth stating plainly, because it is where the last stretch of time went and it
is not free.

- Completion criteria, analysis methodology and session objectives as versioned
  database records with admin editors, replay and validation
- Session objectives modelled for all three Foundation Sessions with
  per-beat measurement
- 36 intervention cards extracted from the prompt files
- Turn classification with a hand-tagging surface and training loop

This follows the agreed principle — *"anything that might need to change should
live as database records"* — and it is what makes A2's "update all behavioral
heuristics" achievable without a deploy. But it went further than Tier 1
required, and B1–B3 did not move while it happened.

---

## The arithmetic

Ten calendar days. Aditya at 50% (the other half is Athena). So roughly **five
working days of capacity**, against:

- production Azure environment (not started)
- cutover dry run + cutover itself
- B1, B2, B3 essentially from zero
- B4 verification and gap-fill, B5 device testing
- eight open A2/A3 modifications

**This does not fit.** The honest options are on the next page.

---

## Three ways to play it

### Option 1 — Migration-only cutover on Aug 15, features follow

Ship the Azure migration and the backbone. Berkeley and Vanderbilt get the
platform they have today, on Azure, with the methodology now editable.
B1–B3 land late August / early September.

- **Risk:** the partnerships were promised Section B. Advisor snapshot and
  email journeys are the visible ones.
- **Argument for:** the Strategy doc's own mitigation is "reversible-first
  sequencing; backbone and migration lead; **clear Tier 1 cut-line**". This is
  drawing that line.

### Option 2 — Cut to what partnerships actually need on day one

Ship migration + the subset a career centre touches in week one:

- **B4** admin dashboard (advisors and administrators log in immediately)
- **B1** advisor snapshot (the feature that removes advisor burden)
- **B3 partial** — welcome and session-completion emails only; defer dormancy,
  academic calendar and the 90-day sequence
- Defer B2 life log entirely — it is a student-engagement feature, valuable but
  not day-one visible
- Defer all remaining A2/A3 polish

Roughly three of five working days on features, two on migration. Tight but
plausible.

### Option 3 — Move the date

If Section B in full is non-negotiable for the partnerships, the date is the
variable. Two additional weeks with Aditya at 50% is a realistic figure for
B1–B3 done properly rather than demoed.

---

## What I would do

**Option 2, and raise it with Danielle and Sam this week rather than on the
13th.** The Strategy doc anticipated exactly this decision and named the
mitigation as a *clear Tier 1 cut-line* — that line has not actually been drawn
yet, and drawing it is a conversation, not an engineering call.

Two things to say in that conversation:

1. The backbone is done and it is the part that was genuinely risky. The
   migration is rehearsed twice, clean.
2. The remaining Tier 1 items are well-understood feature work with no
   architectural unknowns. They are a scheduling problem, not a risk.

---

## Immediate next steps regardless of which option

Ordered. The first two block everything and neither has started.

1. **Provision the production Azure environment.** Still gated on Danielle's
   team providing the subscription — flag today if it is not in hand.
2. **Cutover dry run** — `db:migrate` on an empty database plus
   `--data-only` restore. Verify sequences and the seven unique constraints.
3. **Clear the rehearsal data** — a copy of production is on stage, in stage
   blob storage, and in a local dump file.
4. **Decide the cut-line with Danielle and Sam.**
5. Then build, in the order the chosen option implies.

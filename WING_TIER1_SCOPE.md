# Wing Methodology v2 — Tier 1 scope

**Status:** T1–T4 built. T5–T9 outstanding. See §4a for what shipped and §6a for what Danielle needs to answer.
**Date:** 13 August 2026 · revised 17 August 2026 after T1–T4
**Companion to:** `WING_METHODOLOGY_V2_PLAN.md` (full methodology gap analysis) and
`WING_DECISIONS.md` (the rulings of record — read that first for anything Danielle has
settled, and for the three questions still open)
**Question this answers:** of everything new in the final methodology, what does Tier 1 actually require?

---

## 0. The two new documents add nothing to the inventory

`Wing_Heuristic_Cards_Module_9_Power_Influence.md` and `Wing_Module_9_Supplement.md`
are already inside the compendium, at lines 2484–2731 and 2732–2939. Same twelve
cards (H-901–H-912), same nine supplement cards (H-913–H-921), same sequence maps,
same header material including *"pending Aditya's sub-tag decision"*. The counts in
the previous plan stand unchanged: 184 specifications, 21 in Module 9.

What they usefully confirm is that the Module 9 Source Integrity document — which I
flagged as missing — has been **encoded into cards**. The supplement's Section 1 says
so explicitly: *"Section 1 turns the Source Integrity document into codeable
quality-gate cards."* The six integrity domains are quoted inline on H-903, H-904,
H-905, H-908 and H-912 as mandatory rules. So the missing document is no longer a
blocker, and Module 9 is Tier 2/3 regardless (see §2).

**One correction to the previous plan.** I wrote that "the eight NACE competencies in
`nace-competencies.ts` match Module 8's framework." That is wrong. Module 8 is
deliberately *framework-agnostic*: NACE's eight competencies for `undergraduate` and
`early_career`, the SLI.pro Executive Intelligence Framework's nine domain + two meta
competencies for `executive` and `entrepreneur`, and configurable for `mid_career`.
The Executive Intelligence Framework v3 is a separate standalone document that is also
not in the project. This matters less than it sounds, because Module 8 is not Tier 1 —
but the NACE half of it is (§3, item 8).

---

## 1. Where the Tier 1 line actually is

Quoted from the agreed Feature List (May 2026), not inferred:

> Features are organized into three priority tiers. **Tier 1 features must be
> functional by August 2026 for the Berkeley and Vanderbilt partnerships.** Tier 2
> features support the fall fundraise. Tier 3 features are post-raise and dependent
> on scale data.

That gives three things:

- **Section A** — existing features requiring modification during the Azure migration.
  A1, A2, A3, A4, A6 are Tier 1. **A5 is not** — every item in A5 carries its own
  label, and every one of them reads "Tier 2" or "Tier 2/3".
- **Section B** — headed *"New Features — Tier 1 (August 2026 Deadline)"*. B1–B5.
- **Section C is Tier 2. Section D is Tier 3.**

Plus one cross-cutting section with no tier label: **Wing's Voice and Personality**,
which the Feature List calls *"the governing document for all platform copy, prompts,
notifications, and conversational design."* It governs whatever ships, so its Tier 1
share ships with Tier 1.

On dates: the Feature List says "by August 2026". The 10 August decision recorded in
`TIER1_GAP_ANALYSIS.md` moved production behind contract signature and made the 15th a
**demo on stage**, not a launch. So the runway for this work is the rest of August, not
two days — but it shares those days with the A1–A4 and B2/B3/B5 items that gap analysis
lists as still outstanding.

---

## 2. The methodology sliced against Tier 1

**53 of the 184 compendium specifications are Tier 1. Plus 8 of the 12 UX and
micro-journaling gates that live in the UX documents rather than the compendium. 61 in
total — a little under a third of the methodology.**

> **Revised 13 August after T1.** These numbers were 47 and 55 in the first version of
> this document. The parser found six universal `IG-U` gates I had mis-attributed to
> Modules 10 and 11 — they are declared universal and are therefore Tier 1. It also
> found that the document files the four content voice gates under Module 6, which is a
> scope question rather than a filing detail. Both are recorded below. The parser is
> `server/wing/parse-compendium.ts`; run `npm run wing:check-compendium` to reproduce
> every figure here.

(The compendium's own note puts the platform total at "180 + 12 = 192 codeable
elements". 182 distinct card codes plus the 2 collided bodies is 184, so with the 12
UX/MJ gates the true total is 196.)

### In scope

| Group | Count | IDs | Why it is Tier 1 |
|---|---|---|---|
| Foundation 1 cards + gates | 10 | H-101–H-108, H-109, H-110 | A2 — *"Update all behavioral heuristics across Foundation Sessions"* |
| Foundation 2 cards + gates | 9 | H-201–H-207, H-208, H-209 | A2 |
| Foundation 3 cards + gates | 10 | H-301–H-308, H-309, H-310 | A2 |
| Exercise library, F2/F3 only | 6 | H-211, H-212, H-311–H-314 | Routed into Foundation 2 and 3 |
| Universal warm-up | 1 | H-900 | Fires before any session |
| Universal gates | 5 | H-001–H-005 | Apply everywhere, including intake and Foundation |
| Universal `IG-U` gates | 6 | IG-U003–U005, IG-U03–U05 | Declared universal; see the correction in §3 C5 |
| Voice & tone gates | 6 | IG-V01–V05, V07 | Feature List voice section; V05/V07 serve A4's 360Brew standard, V04 is needed because H-307 encourages voice-to-text in Foundation 3 |
| UX gates | 6 | IG-UX01–IG-UX06 | Govern the client surfaces A1/A2/A3 are modifying |
| Micro-journaling gates | 2 | IG-MJ04, IG-MJ05 | B2 — see below |
| **Total** | **61** | | |

**Only two of the six micro-journaling gates are Tier 1.** IG-MJ01 (three-response
minimum before a routing recommendation) and IG-MJ02 (21-day cooldown after a decline)
both govern module routing, which needs modules. IG-MJ03 needs engagement-trend
detection and IG-MJ06 needs active-fundraising detection — both C1 substrate. That
leaves **IG-MJ05** (maximum one prompt per day, a simple cap) and **IG-MJ04**, which is
in scope on safety grounds rather than feature grounds: B2 Tier 1 includes reply-to-log,
so a student can reply to a prompt with crisis-level language, and *"respond with a
single validating message and wait for the next cycle"* has to be the behaviour from the
first prompt Wing sends, not from Tier 2.

One caveat on the UX gates: IG-UX02's "one observation at a time" only binds where there
are observations, and the observation feed is Radar-fed. The gate is Tier 1; the surface
it constrains is mostly Tier 2.

Plus, not card-shaped:

- **The system personality directive** — 12 positive qualities, 10 anti-patterns, into
  every API call. The Feature List's voice section is explicit about this.
- **Micro-journal prompt library, 220 prompts** → B2: *"Rotating prompt library in
  database"*, *"Prompt library configurable without code changes."*
- **Heartbeat prompts, 48** → B2 Trigger 2 (every 5 days for the first month) and
  Trigger 3 (weekly after). Every prompt is "this week"-framed; they are the weekly
  cadence, not C1's daily one.
- **NACE competency definitions**, pinned 2021 revision → A4.
- **Module objective summaries**, F1/F2/F3 rows × 5 audiences → A2's contextual
  micro-copy at transitions.
- **The "What Wing Knows" adaptation layer**, the *Nothing* and *LinkedIn + Resume*
  rows → A1.

### Deferred — with the Feature List's own label

Nothing here is a judgement call. Each row is where the agreed document puts it.

| Methodology item | Specs | Feature List location | Tier |
|---|---|---|---|
| Module 4 Career Exploration | 14 | A5 "Explore Career Options Module" | 2/3 |
| Module 5 JD Analysis | 7 | **not in the Feature List at all** | unassigned |
| Module 6 Writing Coach | 15 | A5 "Feature Article / Content Module" | 2 |
| Module 7 Wing Radar | 9 | C7 "Curated News and Industry Intelligence" | 2 simple / 3 full |
| Module 8 Competency Intelligence | 9 | module unlisted; its NACE half is A4 | module unassigned |
| Module 9 Power & Influence | 21 | A5 "Power and Influence Module (Pfeffer)" | 2/3 |
| Module 10 Interview Prep | 31 | A5 "Interview Prep Module" | 2 |
| Module 11 Network Intelligence | 28 | D1 "Network-SLI Mapping" | 3 |
| Reveal Cycle | — | closest is C4 Positioning Score | 2 |
| Positioning Refresh | — | A5 "Positioning Refresh Module" | 2/3 |
| Voice gate IG-V06 | 1 | content archetype calibration — Module 6 craft | with Module 6 |
| Universal gate H-006 | 1 | scoped to Module 8 / Executive Intelligence | with Module 8 |
| Micro-journaling gates IG-MJ01, MJ02, MJ03, MJ06 | 4 | need module routing / engagement-trend / fundraising detection | 2 |
| Adaptive prompt selection — 6-dimension state estimate, R1–R9, withhold logic, 4 decay windows | — | C1 *"Prompt generation engine… Pattern detection across entries"* | 2 |
| Daily cadence | — | C1 Daily Micro-Prompt | 2 |
| `modules` / `module_completions` | — | schema: *"Designed now — built in Tier 2"* | 2 |

**Two things worth naming in that table.** Module 5 (JD Analysis) appears nowhere in
the Feature List — not in A5, not in C, not in D. It is a scope addition, and it needs
a tier before it needs cards. And Module 7 as specified (five-component brief,
multi-channel delivery, response capture, intelligence archive, fadeout protocol) is
substantially larger than the C7 entry it maps to, whose Tier 2 version is *"Perplexity
query based on student's SLI, delivered as part of the daily micro-prompt once per
week."*

---

## 3. Four places where the final methodology and the agreed Tier 1 scope conflict

These are not gaps. They are two agreed documents saying different things, and code
cannot satisfy both.

### C1. Locked modules — needs a ruling before T6

**IG-UX01:** *"Wing never shows modules as locked… every module is enterable at any
time."*
**Feature List A2:** *"Forward progression remains locked until prerequisites are
complete."*

Both are Tier 1 statements in agreed client documents. The platform implements A2 —
`session_status` carries `locked` as a first-class enum value, and there is a full-page
"Session Locked" screen. Six user-facing surfaces are affected.

### C2. The Enhancement Modules have no v2 heuristics — needs a ruling before T1

**Feature List A3 (Tier 1):** *"Update heuristics for all Enhancement Modules to
reflect methodology refinements."*

The final methodology contains no cards for Enhancement A, B or C. Its module
architecture has no Enhancement layer at all — the consolidation note replaces them
with a Foundation layer, an Exploration layer (Modules 4–5), an ongoing engagement
engine (Modules 6–7 + Reveal Cycle), skill-building (Modules 9–10) and maintenance
(Positioning Refresh). Every replacement is Tier 2.

So A3's heuristics requirement can be met three ways, and only Danielle and Sam can
pick: declare the Enhancement Modules retired and A3's heuristics line satisfied by
retirement; leave the existing Enhancement heuristics in place as an exception to the
clean slate; or pull one replacement module forward into Tier 1. The third costs the
most and I would not recommend it.

### C3. B2's life log was consolidated into Radar — resolved by building B2 as agreed

**Feature List B2 (Tier 1):** Event Tracking and Life Log, with a rotating prompt
library and a prompted cadence.
**Compendium consolidation note:** *"Professional Pulse (weekly micro-journaling) →
consolidated into Radar responses."*

Radar is Tier 2. The methodology no longer has a standalone life log; it has Radar,
which absorbs it. Tier 1 answer, which needs no ruling: build B2 exactly as the Feature
List specifies, using v2's prompt copy and gates, and let Radar absorb the surface in
Tier 2 when it exists. The prompts and the IG-MJ gates transfer unchanged.

### C4. Foundation `delivery_adaptation` keys on Enneagram type, which nothing supplies

Foundation cards carry 23 Enneagram type branches in `delivery_adaptation` — H-106
alone has four (Types 8, 9, 3, 1). The platform has no source for a user's type, and
the Feature List's voice section forbids asking: *"Wing never asks 'what's your
personality type?'"* A formal instrument arrives with A5's SLI-Recommended Assessments,
which is Tier 2.

Tier 1 answer: ship the **audience** branches of `delivery_adaptation` and skip the
**type** branches, recording which cards lose behaviour. Inferring type from
behavioural signals is what the voice section describes, and it is the same substrate
as C1's state estimate — Tier 2.

### C5. Six universal gates wear three ambiguous IDs — a correction

I described this in the earlier plan as defect D3: *"Module 10 writes them `IG-U003`,
`IG-U004`, `IG-U005`; Module 11 writes the same three `IG-U03`, `IG-U04`, `IG-U05`. Pick
one form."* **That was wrong, and the parser proved it.** They are six different gates:

| ID | Gate |
|---|---|
| IG-U003 | Universal voice fidelity |
| IG-U004 | Cross-session data citation |
| IG-U005 | Internal methodology language in user-facing content |
| IG-U03 | User-Uploaded Data Handling Gate |
| IG-U04 | Behavioral Inference Disclosure Gate |
| IG-U05 | Between-Session Task Follow-Up Tone Gate |

Different names, different bodies, verified by body hash. And the compendium's master
count table asserts the opposite — *"Module 10 and 11 share IG-U003–U005 (3 universal
gates counted once)"* — so the table under-counts by three and states an identity that
does not hold.

This matters more than a naming quibble. Three pairs differ only by a leading zero, so
anything binding to "IG-U04" has even odds of resolving the wrong gate, and a human
reviewer reading a diff would not see it. All six are declared universal, so all six are
Tier 1, which is where the six-card increase in this document's totals comes from.

**Recommendation:** renumber the three Module 11 gates into the `IG-U006`–`IG-U008` range
rather than picking a format, so no ID is one character away from another.

### And one legal dependency

The compendium raises its own open question: *"For Cooley (John Sellers): Does
commercial use of the NACE competency framework as an organizing structure require
licensing?"* A4 is Tier 1 and mandates NACE mapping. That question sits on a Tier 1
deliverable and is not an engineering call.

---

## 4. The Tier 1 implementation list

Nine steps. Ordered by dependency, then by risk. Each is small enough to review before
the next starts.

### T1 — Compendium parser and Tier 1 seed

Build the parser for the whole document — it is the same code either way, and
hand-transcribing 184 cards twice is not viable — then seed only the Tier 1 specs as
`status = candidate`.

- Parse `## H-xxx` blocks: name, description, `populationTags`, the seven components,
  `module_mapping`, `notes`, and the sequence weight (coaching cards carry it inside
  `notes`; gates carry it as a `**Sequence weight:**` line — two formats, one parser)
- Dedupe the six repeated boilerplate blocks that would otherwise produce seven copies
  of H-006
- Emit a review artefact: counts per module, per population, per intervention type, and
  the list of specs with **no** stated weight
- **24 of the 53 Tier 1 specs carry no sequence weight** — the 5 universal gates, all 6
  voice gates, all 6 universal `IG-U` gates, and the 7 exercise/warm-up cards. The seed
  defaults them to 1.0 and `check-compendium` prints the list, because a weight is a
  decision about precedence and 1.0 is a guess
- **Renumber the H-411 gate, not the H-411 exercise.** `H-411`–`H-416` are a contiguous
  run of six Module 4 exercise cards, so the integrity gate sharing the number is the
  interloper. That is a recommendation Danielle can accept rather than a question

**Status: done, 13 August.** `server/wing/parse-compendium.ts` (pure, no model calls —
the document is a grammar), `parse-compendium.test.ts` (22 count assertions against the
real document, so a future revision fails loudly instead of silently changing what Wing
coaches), `check-compendium.ts` (`npm run wing:check-compendium`), and the compendium
itself committed to `methodology/`. Typecheck held at 95; contract check 18 now sees 11
suites.

**Not blocked by C2 after all.** The A3 ruling decides the fate of the *existing*
Enhancement heuristics, which is a retirement question and therefore T9. There are no v2
Enhancement cards to include or exclude either way. **Blocks:** everything downstream.

### T2 — Schema for the seven-component format

**Status: done.** Migration 0019. `intervention_type` needed SEVEN values, not the six the earlier inventory reported — `GATE` is declared by 19 cards and an enum built from the six-value list would have rejected every one at seed time.

- Add four `heuristic_component_type` values: `detection_method`,
  `delivery_adaptation`, `failure_path`, `success_criteria`
- Add `intervention_type` as a column on `heuristics` — it is one classifier per card,
  not versioned prose. **Seven values, not six: COACH, CHALLENGE, REDIRECT, REFRAME,
  AFFIRM, META, GATE.** The earlier inventory reported six; the parser found `GATE` on 19
  cards — every `IG-*` gate in Modules 10 and 11 plus all six universal `IG-U` gates. An
  enum built from the six-value list would reject them at seed time
- Add a card-kind discriminator. Not optional: each Foundation session carries two
  gates, and without this the engine offers them to the detector as if they were
  signals to match against student turns

**Blocked by:** T1.

### T3 — Make weight and population resolve

**Status: done** (T3a/T3b/T3c). No `audience_track` column was needed: `career_pathway` already existed and the conversational intake already asked for it, so `entrepreneur` was derivable all along. Only 5 of the 53 cards fire for a single population, which made `executive` a two-card problem rather than a schema change.

The two inert mechanisms, both needed by Foundation cards.

- **Weight.** Order the detector catalogue by weight and let 2.0 pre-empt. Four Tier 1
  specs are weight 2.0: H-103 elimination exercise, H-201 VC credibility test, H-301
  story extraction, and **H-309 trust vault protection**. H-309 being weight 2.0 is the
  mechanism by which the platform's most important confidentiality rule wins, and today
  weight is read by nothing at runtime
- **Population.** Filter `getSequenceCards` by the student's tags. Foundation cards use
  five: `undergraduate`, `early_career`, `mid_career`, `executive`, `entrepreneur`. Add
  `career_returner` as a sixth — the heartbeat library has a track for it and
  `professional_status` already carries `career_break_or_transition`
- **Where the tag comes from.** `professional_status` cannot produce `executive` or
  `entrepreneur`. A2 already requires an intake question — *"intake asks whether the
  student is targeting employment, starting a venture, or freelancing"* — and A1 is
  being rebuilt as a conversation anyway. One question serves both: it delivers A2's
  founder/freelancer branch and yields the audience track
- **Sidestep the entrepreneur split.** `population_tags` is free-form `text[]`, so seed
  the entrepreneur sub-tags as written and have the resolver treat Tier 1's single
  `entrepreneur` tag as matching all three variants. No schema change, no decision
  needed now, nothing lost when the split is decided

**Blocked by:** T2. **Delivers:** A2's founder/freelancer pathway branch.

### T4 — Gate execution for the 17 Tier 1 gates

**Status: done** (T4a–T4f), and the count was wrong here: it is **24** gates, not 17. Also wrong was which gates need hard enforcement — H-309 and H-005 are *input* filters, not output scans, and H-005's every stated surface is a Tier 2 module. The output-inspection gate that actually matters in Tier 1 is **H-002**, cross-session provenance, because H-303 calls back to Session 2 constantly. One part of IG-U03 is deliberately **not** in T4: its requirement that Wing "confirms receipt and describes what it found in the file before proceeding to analysis" applies at the moment of upload, and in Tier 1 a resume is uploaded and analysed outside any Wing session. What T4e wires is the session half — the gate reaches the prompt exactly on the turns where uploaded content is in context. The upload-moment confirmation is a surface change and belongs with T6 and A2's uploaded-documents items.

The architectural piece, and much smaller at Tier 1 scope than at full scope.

- Compile 15 of the 17 into the system prompt from the database, grouped by context
- **Buffered inspect-then-release for two only:** H-309 (trust vault) and H-005
  (sensitive context containment). Both are unrecoverable — a violation cannot be
  walked back by a later turn. The other two I flagged as unrecoverable, H-916 and
  IG-1102, belong to Modules 9 and 11 and defer with them. Buffering two gates means
  restructuring the turn path for the surfaces they cover, not for every surface
- Log every gate evaluation to `user_heuristic_applications`, so "did the gate fire" is
  answerable
- H-003 (coaching intensity sequencing) is the odd one out — pure bookkeeping rather
  than output inspection. Needs an interaction-intensity column plus a history check

**Blocked by:** T2, T3, and a decision on whether two hard-enforced gates is the right
number. **This step deserves a design review before implementation, not after.**

### T5 — Voice layer for Tier 1 surfaces

**Status: T5a–T5c and T5e done, T5d outstanding.** The voice profile is written as a DRAFT and no
cycle points at it, so nothing has changed for any student — the same two-switch discipline
the heuristic sequences follow, and for a stronger reason: this text is the opening of
every reply Wing composes.

Three things worth recording. **The section goes ahead of the gates**, on the personality
directive's own reasoning — "if the directive is strong, the gates fire rarely… if the
directive is weak, the gates fire constantly, doing the personality's job, which they're
not designed for." A model told what it must never say before it is told who it is produces
careful, characterless coaching. **Only the one-line form of each rule reaches a prompt**;
the documents' own wording is stored alongside it for review, and rendering that instead
would have roughly tripled the standing instruction. Measured: 758 tokens for a Foundation
turn, 817 with a doorway, against the gate section's ~2,700. **The doorway mapping is
inferred, not transcribed.** The Voice Guide names the six signals it observes and describes
the four doorways and never connects the two, so `voice-doorway.ts` is an inference and is
listed for Danielle to review. It demands two independent signals and a clear margin, and
returns nothing otherwise — a wrong doorway is worse than none, because normalising at
somebody who is not anxious reads as condescension.

T5e exists because publishing was two store calls and reviewing meant reading a
TypeScript file — the author of the voice doing neither. The screen shows each rule's
short line beside the document's own wording, because the review question is whether the
first is a fair reduction of the second, and it shows the four things the documents leave
unstated rather than hiding them behind an approval. Pointing a cycle at a profile carries
the same evaluation-window gate as publishing a sequence, and for the same reason; the
gate function moved out of `heuristics-routes.ts` into `wing/evaluation-window.ts` so the
two paths cannot drift. A draft cannot be pointed at — it would leave a screen showing a
cohort with a voice profile and an engine rendering none, which is the trap the empty
published sequence turned out to be.

Contract check 20 came out of T5e's first run. `wing:seed-voice` named the data layer in its import list, so `server/db.ts` built its pool and threw "DATABASE_URL must be set" before a line of the seeder ran — on this project the URL arrives from Key Vault, and `script-init.ts` exists to hydrate it first. Nothing could have caught it: the import is correct TypeScript and it typechecks. The check now reads every npm script that runs a `tsx server/...` entry point and fails the build if it, or anything it statically imports, reaches the data layer directly. Verified by reintroducing both forms of the bug; 31 scripts pass.

**T5d is re-scoped, and the original plan was wrong.** It read "retires a large part of the
three hardcoded prompt files (139 KB)". Reading the blocks it would remove says otherwise.
Each `STYLE & TONE` block is about five lines, and they carry three different kinds of
content:

- **Genuinely duplicated** by this profile: one line per file — "warm but direct,
  conversational, plain English".
- **Operational constraints this profile does not have and should not invent**: one focused
  question at a time; never present a list; maximum three buzzwords in any output; maximum
  one strong affirmation per session; no monologues; escalate specificity progressively.
  None of these appear in the Voice Guide or the personality directive. They were authored
  in the prompt files, and promoting them into a table that claims to *be* the governing
  documents would put words in the author's mouth.
- **Audience register**: "ROI-focused" for early and mid-career, "tough-love" for
  mid-career, "do not dismiss student-level experience" for undergraduates, a moderate
  skeptical-hiring-manager lens rather than the full VC test. This is the register IG-V01
  defines — and, until T5f, nothing in the platform rendered it. That gap is now closed: the
  profile carries the five registers IG-V01 names and the section renders the one the
  student's population resolves to. Precedence is entrepreneur first, because that comes
  from a pathway they chose explicitly, then the least-senior reading of an ambiguous
  stage — the two errors are not symmetrical, since "concise, high-signal, minimal
  scaffolding" applied to a mid-career person reads as brusque while the reverse costs a
  few extra words. An unresolved population renders no register rather than a default one.
  A career returner has none of their own and falls back to mid-career, which is recorded
  as a question rather than presented as a decision.

  One correction came out of the first live turn rather than out of the tests. The turn log
  printed `mid_career register` for a profile seeded before T5f — which carries no registers
  at all — because it reported the resolved audience rather than the rendered one. The token
  count beside it had not moved, which is what gave it away. It now reports the register that
  is in the prompt, and says `<population> resolved but this profile has no register for it`
  when those differ. Third instance of one shape of mistake in this work: a surface claiming
  something is in force when the thing it names is absent — an empty published sequence, a
  cycle pointed at a draft, and now this.

So deleting those blocks would remove real behavioural constraints and the only working copy
of the register, to eliminate one duplicated line per file. And it cannot be done per-cohort:
the prompt files are keyed by POPULATION, so a student in a cohort with no voice profile
still reads them. **The rule that follows: nothing comes out of the prompt files until every
active cohort has a voice profile.** One cohort having it is not the condition.

 The three prompt files carry their own `IDENTITY` and
`STYLE & TONE` blocks, and those are the duplication this work removes — but they are also
the only voice in force today. Deleting them before the profile is published would leave
sessions with less guidance than they have now, not more.


`voice_profiles`, `voice_profile_components` and `user_delivery_profiles` all exist with
zero readers and zero writers, and `voice_component_type` already has exactly the right
enum values — `trait_hierarchy`, `tone_rule`, `language_principle`, `anti_pattern`,
`calibration_example`, `delivery_doorway`. The tables were designed for this.

- Seed from the personality directive and the Voice Guide
- Read the voice profile in prompt assembly for intake, Foundation and email; publish
  per cohort via `school_cycles.voice_profile_id`, which is currently a dangling FK
- IG-V01/V02/V03/V07 ride on T4's gate path
- Doorway selection from in-session signals only. The persisted six-dimension state
  estimate is C1, Tier 2

**Blocked by:** T4. **Retires** a large part of the three hardcoded prompt files
(139 KB).

### T6 — UX gate compliance

The cheapest visible win, and independent of T1–T5.

- **IG-UX01** — pending the C1 ruling. If IG-UX01 wins: remove locked states from six
  user-facing surfaces and decide the fate of `session_status = locked`
- **IG-UX03** — replace completion language with creation language, remove user-facing
  progress bars, checkmarks and X-of-Y counters. Eight-plus violations. The gate's own
  failure path exempts the institutional admin dashboard, which is fortunate: B4's
  funnel labels are all "… Completed"
- **IG-UX02, IG-UX04–06** — one recommendation at a time, two-observation limit,
  three-part transitions, context-aware openings. IG-UX05 and IG-UX06 are also how A2's
  *"contextual micro-copy at every transition"* gets delivered

**Blocked by:** the C1 ruling for IG-UX01 only. The rest can start now.

### T7 — B2 prompt library and cadence

- Extend `prompt_library`: behavioural signal, audience scope, event-sensitivity flag,
  cadence class, prompt code. Today it has seven columns and none of these
- Add the opener pool as its own table, selected independently of the prompt
- Seed all 220 micro-journal prompts and all 48 heartbeat prompts. The gaps I found —
  the missing Entrepreneur (Early) section, the two half-length entrepreneur sections —
  sit inside the entrepreneur split, which T3 collapses, so they do not block
- Replace uniform-random selection with weighted selection under a no-repeat window.
  Keep it simple: this is B2's *"rotating, varied"*, not C1's engine
- IG-MJ05 (one prompt per day cap) and IG-MJ04 (crisis-language handling on inbound
  replies). The other four MJ gates defer with their substrate

**Blocked by:** T2, and by **fix #5, the scheduler.** That dependency has changed
status: `run-sequences.ts` is still a manual npm script with no Function App, and B2's
every-5-days-then-weekly cadence cannot fire without it. The scheduler was deferred to
last; it now sits in front of T7 and in front of B3's remaining sequences.

### T8 — A4 Behavioral Evidence Portfolio

- Pin the NACE 2021 definitions from the compendium; map artifacts to competency,
  positioning claim and supporting evidence from the student's own stories
- 360Brew authenticity standard via IG-V05, IG-V06 and IG-V07. `authenticity.ts`
  already does this work and is wired only to LinkedIn content drafts — extend its
  callers rather than writing a second checker
- The Executive Intelligence Framework half is Tier 2, with Module 8

**Blocked by:** T4 for the gates. **Watch:** the NACE licensing question.

### T9 — Retire the superseded Foundation methodology

Per Part 4 of the previous plan, narrowed to Tier 1's surface:

- Retire the 21 objectives and the objective renderer outright. The renderer was never
  validated — `OBJECTIVE_RENDERER_POPULATIONS` is unset by default, so it has never run
  for a real student
- **Hold** completion criteria and analysis methodology until v2 Foundation cards
  produce equivalent session-end artifacts. These are live and load-bearing today
- Retire rows, never delete tables — the convention the schema already enforces

**Blocked by:** T1, T3, T4 producing working Foundation cards.

---

## 4a. What has shipped

Everything below is on `dev`, typechecking at the 95-error baseline, with the seven
suites this work touches passing and twenty contract checks green — `npm test` runs
fourteen in total. **Nothing reaches a student yet:**
no cycle points at a sequence containing the v2 cards, so the engine loads no cards,
compiles no gates and audits nothing. Publication is one `UPDATE` statement and it is
deliberately not taken. Worth knowing precisely, because the integrity screen made it
visible: the Direct 2026 cycle does have a pointer, at version 2, and `wing:reset-cards`
emptied that version when it deleted every sequence entry along with the pre-v2 cards.
So the live sequence is not absent, it is empty — behaviourally the same, and it reads as
a healthy published cohort on every other screen. Publishing is now also a button:
`PUT /api/admin/cycles/:id/active-sequence` moves the pointer to an existing sequence and
nothing else, carrying the same evaluation-window gate and `force` + `reason` override as
the compose route, refusing a sequence that belongs to another cycle, has no entries, or
whose every card is retired. It is the rollback too. The decision not to publish stands —
it is now one deliberate click by a platform admin rather than a hand-written UPDATE.

| Step | State | What it is |
|---|---|---|
| T1 | done | `parse-compendium.ts` + 22 count-assertions; the compendium committed to `methodology/`; `wing:check-compendium` |
| T2 | done | Migration 0019 — four v2 component types, `intervention_type` (7 values), `card_kind` |
| T2b | done | `wing:reset-cards` cleared 294 pre-v2 cards; `wing:seed-compendium` seeded the 53 as candidates, 394 component rows |
| T3a | done | `population-tags.ts` + 13 tests; `getSequenceCards` filters by kind and population; weight ordering makes the detector prefer it |
| T3b | done | `wing:build-sequences` — one sequence per active cycle, unpublished by design |
| T3c | done | Migration 0020 — `applies_to_session` on the sequence entry; a Foundation 1 catalogue is 28 cards, not 53 |
| T4a | done | `gate-compiler.ts` + 15 tests; 20 gates compiled into the turn prompt at ~2,700 tokens |
| T4b | done | `gate-audit.ts` + 24 tests; migration 0021 `gate_audit_findings` |
| T4c | done | IG-V05/V07/V04 into `authenticity.ts` — the only part live today, since content drafts ship |
| T4d | done | H-003 enforced behaviourally; H-308 rescoped to every session |
| T4e | done | IG-U03 and IG-U05 made conditional — each compiled only when its own precondition holds; IG-U05 added to the audit |
| T4g | done | `PUT /api/admin/cycles/:id/active-sequence` — publish a reviewed build, or roll back to the version before it, from the integrity screen |
| T4f | done | `/admin/methodology/integrity` — what is in force, the tuning table, the review queue; four platform-admin routes over `gate_audit_findings` |
| S1 | done | `safety-rules.ts` — the four safety rules Danielle named, compiled first in every prompt, unconditional. Nothing handled distress before this |
| T5a | done | `voice-source.ts` — the Voice Guide and the personality directive as 54 typed records, with what the documents leave unstated recorded rather than invented |
| T5b | done | `voice-compiler.ts` + `voice-store.ts` + `voice.ts` — the section compiles at ~760-820 tokens and goes into the prompt ahead of the gates |
| T5c | done | `voice-doorway.ts` — one of the four doorways from in-session signals only, two independent signals and a margin or nothing |
| T5e | done | `/admin/methodology/voice` — read the transcription against the documents' own wording, publish it, give it to a cohort or take it back; four platform-admin routes |
| T5d | re-scoped | Retiring the prompt files' STYLE & TONE blocks turns out to be a swap, not a delete, and it waits for full rollout — see below |
| T5f | done | Register by audience — IG-V01's five, rendered for the population a student resolves to, entrepreneur first then the least-senior reading. 59 records; needs a re-seed |
| T6–T9 | outstanding | UX gates, B2 prompts, A4 portfolio, retirement |

Three decisions were taken during the work and are worth recording:

**Measure, then enforce.** Thirteen gates ask to inspect Wing's output *before*
delivery and the turn path streams, so the choice was between not streaming and
measuring afterwards. The rules are compiled into the prompt and the delivered reply
is audited against them, so "did the gate hold?" becomes a query rather than a guess.
Whether any gate earns the latency of buffering is now an evidence question, and `/admin/methodology/integrity` is where it gets answered — including the part that closed a separate gap: a sequence that is built and not published was previously visible nowhere at all, so "no findings" and "not switched on" looked identical.

**The audit is deterministic, not a model call.** The gates enumerate their own
trigger phrases, so ten of them are string matches. A regex cannot hallucinate a
violation that is not there. Four gates are genuine judgement calls and are listed as
unauditable with reasons, so "no violations" is never mistaken for "every gate held".

**A gate is compiled only when its own precondition holds.** Two of the 24 name a state
of the world rather than a thing Wing must never say: IG-U03 "fires upon file upload",
IG-U05 "fires… when uncompleted tasks exist in the task log". Handing IG-U05's page of
task-follow-up guidance to a model with no tasks to follow up on is not merely wasted
tokens — the likeliest effect is that it asks about tasks nobody assigned. A constraint
compiled unconditionally can cause the behaviour it was written to shape. A condition the
caller cannot answer counts as satisfied, so not knowing never drops a rule.

**No card codes reach the prompt.** IG-U005 forbids internal methodology vocabulary
in user-facing output and IG-V01 forbids sounding like a system, so rules render as
unattributed prose. Two gates cite other cards inside their own rule text; those
citations are redacted and reported.

---

## 5. What Tier 1 does not get

Stated plainly so nobody discovers it later:

- **Eight of the eleven modules.** Modules 4, 5, 6, 7, 8, 9, 10, 11 — 137 of the 184
  specifications. Every one is Tier 2 or Tier 3 in the Feature List, except Module 5
  which is unassigned
- **Wing Radar.** No web-search-capable model call exists — `CompletionRequest` has no
  tools field and there is no search provider in the repo
- **The Reveal Cycle and Positioning Refresh**
- **Adaptive prompt selection.** No state estimate, no engagement trend, no crisis
  detection, no decline detection, no per-population cadence, no decay windows. B2 gets
  rotation; C1 gets the engine
- **Personality-type delivery adaptation.** Per C4 — audience branches only
- **`modules` and `module_completions`**, so nothing can record which module a
  `module_run` was. Correct for Tier 1: there is only Foundation

---

## 6. Decisions

Reduced from twelve to five that block Tier 1. The other eight ride with the module
they belong to and can be answered when that module is built.

### Blocking Tier 1

| # | Decision | Owner | Blocks |
|---|---|---|---|
| 1 | **Enhancement Modules A/B/C** — is A3's "update heuristics" satisfied by retiring them? (C2) | Danielle + Sam | T1 |
| 2 | **Locked modules** — IG-UX01 or Feature List A2? (C1) | Danielle + Aditya | T6 |
| 3 | **Hard-enforced gates** — which of the 24 earn the latency of buffering the turn? Now an evidence question: see §4a | Danielle + Sam | nothing, until findings exist |
| 4 | **Clean-slate cost** — accept retiring objectives + the renderer, and hold completion criteria and analysis methodology through the transition? | Aditya + Sam | T9 |
| 5 | **NACE licensing** — commercial use of the framework as an organizing structure | Cooley | T8 |

Only #1 and #2 need answering before work starts. #3 was taken as measure-then-enforce
and is now answerable from `gate_audit_findings` once a cycle publishes a v2 sequence; the
premise in its original wording was wrong twice over, corrected at §4 T4. #4 is a decision
at T9, #5 runs in parallel and does not stop the mapping being built.

### Deferred to their module

| Decision | Rides with |
|---|---|
| Renumber H-411 (gate vs exercise) | Module 4 |
| Renumber H-710 (card vs gate) | Module 7 |
| Canonical `IG-U0x` / `IG-U00x` format | Modules 10, 11 |
| H-706 / H-707 / H-210 / H-408–410 — reserved or dropped? | Module 7, Module 4 |
| Exercise library 16 or 17 | Modules 4, 6 — the Tier 1 subset of 7 is complete |
| Entrepreneur sub-tag split, and the missing Entrepreneur (Early) prompt section | Modules 9, 11 — T3 collapses it for now |
| Missing heartbeat track | not a gap at Tier 1 — the 48 delivered cover all six Tier 1 tracks |
| Rewrite routing rule R4; reconcile Enhancement A/C | Modules 6, 10, 11 |
| `Module9_Power_Influence_Source_Integrity.md`; Executive Intelligence Framework v3 | Modules 9, 8 |

---

## 6a. What Danielle needs to answer

Ten findings surfaced while T1–T4 were built. Every one came out of tooling run against
the methodology itself — the parser's defect report, the gate compiler's leakage check,
the routing map counted against its own footer — so each is checkable rather than an
opinion. **None of them blocks T5.** They are collected here because none has been sent,
and because five of them are cheaper to correct in the document than to work around in
code. Ordered by the cost of leaving them alone.

### Answer first

**1. H-916 declares the wrong intervention type.** H-916 *Experiment Safety Check* sits in
Module 9's "Section 1: Source Integrity → Codeable Quality Gates", whose own preamble says
"these cards are not user-facing coaching moves"; its `detection_method` says "this is a
pre-delivery gate"; its weight note says "mandatory gate". Its `intervention_type` says
`COACH`. Every sibling in that section says `META (system rule — not user-facing)`. The
parser classifies by heading, so it is stored as an integrity gate and nothing is broken
today — but the field is the only machine-readable statement of whether a card's text is
spoken to the student, and this one says "speak it". Module 9 is Tier 2, so there is time;
it is first on the list because the card being misfiled is a safety check.
*Recommendation: `COACH` → `META`.*

**2. Four Tier 1 gates hand their failure path to cards Tier 1 will not have.** IG-U005
delegates to H-1007 (Module 10), IG-U04 to H-807 (Module 8), IG-V05 to H-910 (Module 9)
and H-604 (Module 6). All four cited cards exist; none is Tier 1. The code is stripped
before the rule reaches the model — no card code may reach a student — so the instruction
survives without the handoff, which is the safe failure but not necessarily the intended
one. *Question: for each of the four, is the remaining instruction sufficient on its own,
or does the gate need a Tier 1 fallback written into it?*

### Numbering — cheap now, expensive once anything binds to a code

**3. Six universal gates wear three ambiguous IDs.** Set out in full at §C5. Both halves
are real and distinct: IG-U004 is the 30-day cross-session provenance gate, IG-U04 is
behavioural-inference disclosure. The routing document's Rule 3 cites IG-U004 and cites it
correctly — but that was a coin flip nobody should have to win.
*Recommendation: renumber the three Module 11 gates into IG-U006–IG-U008.*

**4. Two codes carry two different cards.** H-411 is both a Module 4 gate (*Never Steer by
Assumption*) and an exercise (*Problem-Solution Mapping*). H-710 is both a Radar coaching
card (*On-demand Radar archive*) and a Module 7 gate (*Wing Radar Content Seed Alignment*).
The pipeline keeps the first body it meets and drops the second, so one body of each pair
is currently unreachable. Neither is Tier 1. In both pairs the non-gate is the one sitting
in a contiguous run — H-411–H-416 are exercises, H-701–H-710 are Radar cards — so
*renumbering the gate is the cheaper edit in both cases.*

**5. H-308 is numbered into Foundation 3 and behaves universally.** Its own
`detection_method` says "fires at every module opening", and the routing document leans on
it for thread resumption in every module. The sequence builder carries it as universal by
way of a named exception, which is a workaround for a numbering error rather than a design.
*Recommendation: renumber into the universal H-00x range.*

### Values the methodology leaves blank

**6. Twenty-four of the 53 Tier 1 cards state no sequence weight** (69 of 182 across the
whole compendium). A blank weight is stored as 1.0. The exposure is smaller than the count
suggests: all 24 are gates (17) or exercises (7), and no Tier 1 coaching card is missing
one — gates are compiled into the prompt whatever their weight, and exercises are chosen by
the exercise flow, not by the weight-ordered detector. So nothing is mis-prioritised today.
*Question: is 1.0 the right default to record, or should the gates carry 2.0 so that a
future path which does rank them ranks them above coaching cards?*

**7. Twenty state no description**, and all twenty are gates. The description is not used
by the engine — the detector's catalogue is built from name and signal — so the cost is
confined to the admin surface, where twenty rows read as blank. *Low priority; noted so it
is not mistaken for a data-loss bug when it is seen in the card list.*

### The routing document

**8. The map lists 27 routes; the footer says 34 defined routes.** The gap count
reconciles exactly — three modules × two suggested routes each = the stated 6. The route
count does not: 27 are listed under "Complete Routing Map Reference" (10 Foundation and
Exploration, 6 Radar, 6 Module 9, 5 Module 11). *Question: are the other seven in the
compendium's per-module maps and simply not carried across into the consolidated list?*

**9. Rule 6's safety tier cites ten gates that do not exist.** Priority 1 gives precedence
to "any route triggered by a safety integrity gate (IG-S01 through IG-S10)". No `IG-S`
code appears anywhere in the compendium. Rule 1's exception names H-005 (sensitive context
containment) for the same purpose, and IG-U03 governs uploaded data. *Question: which
cards are the safety set, so Priority 1 can be implemented against real codes?*

**10. The three "not yet routed" modules are not Tier 1 debt.** Modules 6, 8 and 10 are all
Tier 2 or Tier 3, so their missing outbound routes close when those modules are built.
Recorded so the list does not read as something owed now. The related point is worth
stating plainly: **only 4 of the 27 routes have both endpoints inside Tier 1** — F2 → F1,
F2 → F3, F3 → F1, F3 → F2. Routing as a feature is Tier 2; what Tier 1 owes is those four
Foundation-internal transitions and the logging Danielle asked for, not the map.

### Still outstanding from §6

Decisions 1 and 2 — the Enhancement Modules (C2) and locked modules (C1) — are unchanged
and still unanswered. Neither has blocked anything yet because T1–T4 sat below them, but
decision 2 blocks T6 and T6 is one of the two most visible items on stage.

---

## 7. Where this sits against the rest of Tier 1

This methodology work is **additional to**, not instead of, the Tier 1 items
`TIER1_GAP_ANALYSIS.md` still lists as open: A1 conversational intake, A2's micro-copy
/ redundant-collection / uploaded-documents / backward-navigation / re-entry items, A3's
skippable modules and early exit and unified visual presentation, B2's UI and inbound
paths, B3's remaining sequences, and B5 device testing.

Two of the nine steps do double duty, which is worth knowing when sequencing against
that list: **T3 delivers A2's founder/freelancer pathway branch**, and **T6 delivers
A2's contextual micro-copy at transitions**. And one dependency has moved: **fix #5, the
scheduler, now blocks T7** as well as B3.

Suggested order to start: **T1 and T6 in parallel** — T1 because everything waits on it
and the parser is worth having before the answers arrive, T6 because it is mechanical,
independent, and the most visible thing a partner would notice on stage. Then T2 → T3 →
T4.

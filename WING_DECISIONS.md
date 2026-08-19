# Wing — methodology decisions of record

**What this is:** the rulings that govern the build, with their source and their status.
Written because these arrived in an email and an email is not a place anyone can find an
answer three months later. Where this document and any other disagree about *what was
decided*, this one is the record; where it disagrees about *methodology content*, the source
named in each entry wins.

**Last updated:** 18 August 2026, evening — after her second delivery of the day: the
intake module (42 cards) and the research-derived gates.

---

## 0. Authority order

Established by Aditya, 18 August, and it matters because these three sources now disagree
with each other in specific places:

1. **Her documents of 18 August, afternoon** — `Wing_Research_Derived_Gates` and
   `Wing_Intake_Heuristic_Cards_v1.1`, plus the email announcing them.
2. **Her email of 18 August, morning** — the answers to the questions of the 17th.
3. **Master Module Compendium v3** — the methodology content, except where the above
   override it.
4. **Earlier documents**, including the Feature List.

Order 1 over 2 is not a formality. It resolved a live collision the same day — see §2b.

The one hard supersession so far: **Feature List A2 (locked modules) is dead. IG-UX01 wins.**

---

## 1. v3 does not contain the corrections it claims to contain

Verified by parsing both versions and hashing all seven components of every card:

- 182 cards in v2 and 182 in v3, with **identical code sets** — nothing added, nothing
  removed.
- **Zero of the 182 card bodies changed.**
- v3 is purely additive at the section level: it appends the Safety Architecture, the
  cultural-competence gates (IG-S09, IG-S10), the routing behavioural rules, and a summary.

v3 carries a section headed *"Corrections applied per Aditya's August 17 email"* listing six
changes. **None of the six is in the cards.** H-916 still reads `COACH`; there is no H-007
and H-308 is unchanged in Foundation 3; the H-411 and H-710 collisions are intact;
IG-U006/007/008 appear nowhere but that summary line; IG-V01's register table does not
mention career returners. "ENCOURAGING + CURIOUS" and the doorway thresholds likewise exist
only as summary bullets.

**Consequence for the build:** her email authorises us to make these changes, so they are
ours to apply — but the compendium cannot be parsed as the corrected source. Corrections are
therefore held as an explicit, tested override layer in `server/wing/parse-compendium.ts`
with the email cited per entry, and each entry is deleted when a reissued compendium carries
the change itself.

Also not arrived: the reconciled 34-route list. Both the routing section embedded in v3 and
the separately re-uploaded routing document still list **27** routes and still claim 34 in
the footer.

---

## 2. Rulings

| # | Decision | Ruling | Status |
|---|---|---|---|
| 1 | Locked modules — IG-UX01 or Feature List A2? | **IG-UX01.** Every module enterable at any time; depth adapts, access does not. Prerequisites are communicated inside the module, never on the navigation. Six screens to rebuild. | outstanding (T6) |
| 2 | H-916 marked `COACH` | **Change to META.** It is a pre-delivery safety check, not a user-facing coaching move. | **done** in the parser; not seeded, being Tier 2 |
| 3 | The ten `IG-S` safety gates cited by routing rule 6 | **They exist**, in a Wing Safety Architecture document that never reached us — her stated delivery gap. For release one they are **system prompt rules, not cards in the editor.** Four apply now: IG-S01 crisis language, IG-S02 harm-to-others, IG-S07 anti-sycophancy, IG-S09 cultural attribution. | **done** — `server/wing/safety-rules.ts` |
| 4 | 27 routes listed against 34 claimed | 34 is accurate across the per-module maps; 7 never made it into the consolidated list. Reconciled list still not delivered. Only **4 routes** are in release one (F2↔F1, F3↔F2) plus the logging. | routes outstanding; count unresolved in the document |
| 5 | IG-U renumbering | **Approved**, then **superseded the same afternoon.** The Module 11 universal gates became IG-U006–IG-U008 in the morning and **IG-U012–IG-U014** in the afternoon, because her research-derived gates claim IG-U006–IG-U011. See §2b. | **done** in code; needs one `wing:apply-corrections -- --apply` run to move the seeded rows |
| 6 | H-411 and H-710 dual use | **Approved.** Renumber the *gate* in each pair; exercises and cards keep their numbers. H-710 gate → H-711. H-411 gate → H-412 **cannot stand — see §3.** | H-711 **done** in the parser (not seeded, Tier 2); H-411 blocked |
| 7 | H-308 chunked messaging | **Approved.** Becomes **H-007**, universal. Removed the named exception the sequence builder carried for it. | **done** |
| 8 | Intake lead traits | **ENCOURAGING and CURIOUS.** Not coaching (nothing to coach yet, no trust built), not challenging (they just arrived). | **in code** — needs the voice v2 re-seed |
| 9 | Doorway thresholds | **Two signals for audience track; one signal for emotional tone, response length and vocabulary.** See §3 — this describes something not yet built rather than a threshold change. | needs reconciliation |
| 10 | Career returner register | **Their own, not mid-career.** Warm but not pitying; accomplished professionals who took time away, not people needing rebuilding; forward-looking, never backward-apologising — the gap is the story, not the obstacle; confidence rebuilt through evidence, not affirmation. | **in code** — needs the voice v2 re-seed |
| 11 | 24 cards with no sequence weight | **Leave them.** Gates and exercises need no elevated weight this release. | closed |
| 12 | Four gates delegating to unbuilt modules | Write into each: *"If this fails, continue current module coaching. [Referenced module] will address this in a future release."* | deferred — failure paths are not rendered into any prompt, so this waits for her reissue rather than becoming a text override |

### The intake flow she specified

Four phases, pending her full design document. Recorded because the current intake is an
18-question clinical assessment that delivers value too late.

1. **Q1–4 — logistics and institutional context.** What brings you here; current situation
   (student, working, transitioning, building something); university or programme, or using
   Wing independently; what they hope to get out of it.
2. **Q5–7 — lightly revealing.** How they describe what they do at a party; one thing
   they're good at that their resume doesn't show; one thing they'd change about how they're
   perceived professionally.
3. **Q8–9 — the reveal.** Wing surfaces an observation, not a diagnosis — the two-identities
   observation that makes someone feel seen.
4. **Post-reveal.** *Now* ask for LinkedIn, resume, assessments. The user is invested because
   they have already had value.

---

## 2b. The second delivery of 18 August

Two documents arrived after the morning email: `Wing_Research_Derived_Gates` (6 new
universal gates, 5 module gates, 6 audience behavioural rules, 1 new platform
variable) and `Wing_Intake_Heuristic_Cards_v1.1` (the intake module, 42 cards). Both
are committed to `methodology/` byte-for-byte, verified by hash.

**The collision, and how it was settled.** Her new universal gates take
**IG-U006–IG-U011**: Barnum falsifiability, observation precision over emotional
claim, competence→gap→fixable, resistance is diagnostic, quote-then-extend, session
close consolidation. IG-U006–IG-U008 were, as of that morning, the Module 11 trio —
renamed in the parser, in `gate-compiler.ts`, in `gate-audit.ts`, and in the live
database, inside sequence version 5, published to a cohort. Both cannot hold. The
later document governs, so the trio moved again to **IG-U012–IG-U014**, the first
three free codes above her block.

That second move exposed a real failure mode. A row renamed once no longer answers to
the code the document shows, so a correction keyed on `IG-U03` would have found
nothing and printed *"not seeded, nothing to rename"* — a clean run, and a database
quietly disagreeing with the parser. Corrections now carry `supersededFrom`, the
script walks it, and it distinguishes *already applied* from *not seeded* instead of
printing one line for both.

**Her numbers are otherwise free.** H-111, H-210, H-315, H-616 and H-923 are all
unused; H-210 has been in our numbering-gap report since the first parse. H-014 and
H-021 are reuses of numbers she retired, and the retirement is real — neither appears
in the compendium, checked rather than taken on trust, and a test now holds that.
Watch one thing: Module 11 uses four-digit codes, so `H-111` is a string prefix of
`H-1110`–`H-1114`. `moduleFromCode` splits on digit length and files it correctly; a
`LIKE 'H-111%'` written later would not.

**The intake module needed its own parser.** Four differences from the compendium,
any one of which reads as "no cards here": cards open with a bare line rather than a
markdown heading, gates carry an `IG-INT` prefix the code pattern rejects, component
tables are unbolded, and one card is numbered `H-019.5`. The compendium parser found
**zero of the 42**. `parse-intake.ts` finds 29 cards and 13 gates, sharing the
component keys, kind rules and module derivation so the two parsers cannot disagree
about what a card is. A code line only opens a block when the next line says `name:`
or `gate_type:`, which is what makes 42 a count rather than an estimate.

Four decisions inside that:

- **`H-019.5` keeps its code.** She numbered a card between H-019 and H-020 to avoid
  renumbering the fifteen reveal templates below it, which is a good reason.
  `card_code` is unconstrained text, so the decimal is stored as written.
- **H-010–H-037 are the `intake` module, not `universal`.** They sit in the same
  hundred as H-001–H-007, and a universal card carries no session scope: filing them
  there would have fired the party question inside Foundation 2 and put all fifteen
  reveal templates into every turn. H-0xx above 37 now returns `unknown` rather than
  falling through to universal — unknown is loud and stays out of Tier 1.
- **The three entrepreneur funding stages are mapped.** Her vocabulary splits
  `entrepreneur` into early / fundraising / scaling and the platform stores no stage,
  so `pathway` emits all three and the card's own signal discriminates. Without it
  H-029 (RT-10 Founder-Identity Blur), tagged with the three stages and nothing else,
  would have reached no founder at all — silently, an empty tag intersection being
  indistinguishable from a card that does not apply.
- **`ELICIT` and `OBSERVE` are enum values now** (migration 0022). 23 of the 29 cards
  declare one of them. Folding both into `COACH` was the alternative and it destroys
  the point of the redesign: intake does not coach.

**Tier 1 grows materially.** Six universal gates, three Foundation gates (H-111,
H-210, H-315) and the whole intake module are all Tier 1 — A1 conversational intake
has been an open Tier 1 gap since the gap analysis and simply had no cards until now.
53 published cards becoming 98 with what
can be seeded today — the 42 intake cards plus H-111, H-210 and H-315 — and 104 once
the six universal gates arrive in card form.

**The running totals do not reconcile, and should stop being quoted.** The research
document bases on 192 existing elements and totals 207, while its own Part C adds
three more behavioural rules than its summary counts — so by its contents, 210. The
intake document bases on 209 and totals 265. Our parse of the compendium measures
183. Four numbers, no arithmetic that connects them.

**Still not delivered, and now blocking:** `Wing_Intake_Design_v3.md`, cited for the
B1–B3 baseline question wording (H-035 defers to it outright), the reveal-selection
confidence threshold (H-019.5 and IG-INT06 both depend on it) and the two reveal
modes. Also named and absent: `Wing_Intake_Data_Migration.md`, the Research
Integration Brief, and the Perplexity research files.

**Two things confirmed our earlier work.** H-010 cites **H-007** for chunked
messaging, which is the code the morning ruling created. And IG-INT04 requires
IG-S01, IG-S02, IG-S07 and IG-S09 active from Q1 — which is exactly how safety
shipped: a module constant with no switch.

### Identity reference frame — her new platform variable

`identity_reference_frame`, values `external | internal | mixed | insufficient_signal`,
a third adaptive axis beside audience track and doorway. Her rules, recorded as given:
detection needs **two consistent signals**; when uncertain the default is **external**,
on an explicit asymmetric-error argument (treating an internal-frame user as external
costs a patronising session; the reverse can lose the user permanently); and the
variable is **never surfaced to the user** — it shapes how Wing talks, not what Wing
says about how it talks. Priority 1 scope is the intake reveal only, every other
module defaulting to external.

**What is built:** `identity-frame.ts`, pure — the four values, the resolver, the
reveal-mode switch, and two detectors. Her four detection tables (34 rows) are parsed
from the document rather than transcribed. Only **two** of the 34 signals are
detectable from raw text: obligation language, where she gives the threshold herself
("3+ instances or 1 instance in Q4"), and its self-authored twin, where she gives
none — so it uses the same count, because a lower one would make `internal` easier to
reach than `external`, and her own error analysis says to err the other way. The other
**32 are classifications**, not phrases: "self-description leads with company/title"
is the Q5 classification H-015 defines, and no regex produces it. They wait for the
intake engine, and a test fails if that count ever drops without a decision behind it.

Storage is deliberately absent. She was explicit that the field-or-jsonb question is
ours, and it should be answered with the intake engine that produces the
classifications, not before it.

---

## 3. Open questions

**H-411 gate → H-412 collides.** H-412 is already *Odyssey planning (Design Your Life)* in
the Exercise Library, and ruling 6 keeps exercise numbers. Applying her instruction literally
recreates the defect it was meant to remove. H-408, H-409 and H-410 are unused in that range;
**H-408 recommended.** Not urgent — a Module 4 gate, Tier 2, nothing published touches it.

**The doorway answer describes a fifth thing, not a threshold change.** Her four dimensions
— audience track, emotional tone, response length, vocabulary — are not the Voice Guide's
four doorways (ego-driven, anxious, analytical, conflict-avoidant), which is what
`voice-doorway.ts` selects. "Two signals for audience track" describes *register* selection,
which currently comes from declared intake data rather than in-session signals, so there is
no threshold to set; and the three one-signal items are adaptations that do not exist yet.
Applying it literally means letting a short answer override a student's declared career
stage. **Needs confirmation before building.**

**The six universal gates are missing five of their seven components.** They arrived
as prose — research basis, what it enforces, the rule, where it fires hardest,
violation and correct examples. Two components are there under other names: the rule
paragraph is `coaching_move`, and Part A ("Audience Delivery Adaptations") is
`delivery_adaptation`. Absent for all six: **signal, detection_method,
intervention_type, success_criteria, failure_path**.

An earlier reading of this said the six therefore could not be seeded. That was too
strict, and the intake gates are what corrected it: IG-INT01–IG-INT13 arrive with a
`gate_type` and a `Rule` and nothing else, and they are unquestionably gates. **A
rule-only gate is still a gate.** It compiles into a prompt, which is how every gate
reaches a student. What it cannot do is carry a precondition (needs
`detection_method`) or be verified after delivery (needs `success_criteria`) — and
three of the six supply their own banned-phrase lists, which is most of what
deterministic auditing needs anyway.

There is a second reason not to wait: IG-INT10–IG-INT13 restate IG-U006, IG-U007,
IG-U009 and IG-U010 for intake. Seeding the intake wording of a rule while the rule
itself sat unseeded would be worse than either. So all six seed, as candidates, with
every absent component named in their notes and every unmapped paragraph of her prose
preserved there verbatim. `intervention_type` stays **null** — she states none, the
column is nullable for exactly that reason, and `card_kind` is what actually keeps a
gate out of the detector catalogue. Five rows per gate from her still closes the gap;
nothing here guesses at them. **The five module gates in Part B are complete** and
need nothing.

**Fourteen intake cards state no sequence weight**, mostly reveal templates — and she
does give a weight to four of them (2.0 for RT-01, RT-08 and the selection card, 1.5
for RT-03), which makes the omission look like an oversight rather than a decision. It
changes nothing yet: the reveal template is chosen by H-019.5 scoring the templates,
not by sequence weight.

**Crisis resources are unnamed.** IG-S01 directs to "a therapist, a counsellor, or someone
you trust" and names no service, and the rule as shipped keeps it that way — there is a test
that fails if anyone adds an invented hotline number. Berkeley and Vanderbilt each have
counselling services they would want named. **A question for the partners, not a gap to
approximate.**

---

## 4. Decisions taken on our side, for the record

- **Measure, then enforce.** Thirteen gates ask to inspect Wing's output before delivery and
  the turn path streams. The rules are compiled into the prompt and the delivered reply is
  audited against them, so "did the gate hold?" is a query rather than a guess.
- **The audit is deterministic, not a model call.** The gates enumerate their own trigger
  phrases. Four are genuine judgement calls and are listed as unauditable with reasons, so
  "no violations" is never mistaken for "every gate held".
- **No card codes reach a prompt.** IG-U005 forbids internal methodology vocabulary in
  user-facing output; rules render as unattributed prose. Applies to the safety rules too.
- **Two switches for anything that reaches a student.** A voice profile must be published
  *and* a cycle must point at it; a sequence must exist *and* the cycle's pointer must name
  it. Safety is the deliberate exception: a module constant with no inputs, because a rule
  that can be switched off by a missing pointer is not a safety rule.
- **Publication is a pointer, and rollback is the same pointer.** `PUT
  /api/admin/cycles/:id/active-sequence` and the voice equivalent move it; neither composes
  anything new, so what goes live is what was reviewed.
- **Corrections live beside the source, never inside it.** The compendium stays exactly as
  delivered and approved changes are an explicit table in the parser, each quoting the email
  that authorises it. Editing the committed document would be quicker and would destroy the
  one property that makes it useful — that it is the file she sent.
- **Renumbering renames, it does not re-seed.** `card_code` is a column, not an identity, so
  the four renames left every id, sequence entry and cycle pointer untouched: no rebuild, no
  second mid-cycle override, same cards live under the new numbers.
- **A register is never guessed.** An unresolved population renders no register rather than a
  default one.
- **No card code and no card name reaches a prompt, on any path.** The gate path had
  redacted citations since it was written. The coaching path had not, and it was leaking
  two things: every one of the 46 Tier 1 coaching card names begins with its code
  ("H-308 Wing chunked messaging", and the intake cards carry two), and six cards cite
  other cards inside their delivery adaptation. Four of those are live today. Names are
  now stripped to their human label rather than redacted — "another of these rules Wing
  chunked messaging" would be worse than the leak — and every other field is redacted.
  The pattern itself was too narrow: it knew `IG-U`, `IG-V`, `IG-UX`, `IG-MJ` and two-to-
  four digits, so `IG-S01`, `IG-INT06`, `H-019.5` and `RT-04` all passed through it. Five
  real leaks, measured across the three documents rather than imagined. A whole-corpus
  test now checks every prompt-bound field of every card in every document.
- **The detector limit is measured per turn, not per sequence.** The hard limit of 40 was
  set when a sequence had no session scope, so "cards in the sequence" and "signals the
  detector chooses between" were the same number. Migration 0020 scoped entries by session
  and `card_kind` took gates out of the catalogue, so the premise moved. The Tier 1 set
  after 18 August is the case that forced the point: 104 entries, 46 coaching cards, and no
  single turn seeing more than 23 — the old measurement refuses it, the correct one passes
  it comfortably. Not a loophole: `publishCycleSequence` writes no session scope, so
  anything composed through the API is unscoped, and for an unscoped sequence the peak
  equals the total and the limit bites exactly as hard as before. One formula, both cases.

---

## 5. Where things stand

**Live for every cohort:** the safety rules, unconditionally; voice profile v2, 61
components including the six audience registers and the intake trait hierarchy.

**Live for SLI.pro Direct 2026 only:** sequence version 5 — 53 cards, being 22
coaching cards, 24 integrity gates and 7 exercises. Published 18 August with a
mid-cycle override, reason logged, because that cycle's evaluation window is 1–31
December.

**Not live:** Berkeley AY 2026–27 and Vanderbilt AY 2026–27 have a voice profile but
no sequence — no cards, no gates.

**Renamed:** the Module 11 trio is IG-U012–IG-U014 in the database as of 18 August —
`wing:apply-corrections -- --apply`, three rows, ids and sequence entries untouched, no
republish.

**Seeded, in no sequence:** the nine research-derived gates — IG-U006 to IG-U011 plus
H-111, H-210, H-315 — 48 component rows, all `candidate`. That none of IG-U006 to
IG-U008 came back as "already present" is independent confirmation that the Module 11
rename landed.

**Seeded partially:** the intake module. `wing:seed-intake` ran before migration 0022,
committed H-010 (META, valid) and threw on H-011 with `invalid input value for enum
wing.heuristic_intervention_type: "ELICIT"`. Nothing needs undoing — one transaction
per card, idempotent by `card_code`, so H-010 is whole and a re-run inserts the
remaining 41. Apply 0022, re-run.

**And that failure produced a fix.** The seeders now query `pg_enum` before the first
insert and refuse with the `ALTER TYPE` statement that would fix it. The old behaviour
wrote to the database during a run that could not possibly complete, and reported the
cause at card 2 of 42 as an enum error rather than as a missing migration. A
precondition that can be checked in advance should never be discovered by failing.

Once 0022 is applied and the re-run completes: 51 elements, 319 component rows, all
`candidate` and in no sequence, so none of it reaches a student until a sequence is
composed and a cycle pointer moved. H-616 and H-923 defer with Modules 6 and 9.

Three parsers now, one per document shape, sharing the component keys, kind rules,
module derivation and body hash so they cannot disagree about what a card is. The
document→row mapping is pure functions in `seed-shared.ts` rather than inside the
seeders, because a seeder needs a database and a Key Vault secret — without that split
the only environment that ever exercises the mapping is production. 21 test suites,
typecheck at the 95 baseline.

**The intake surface had no safety rules.** `intake-conversation.ts` — Feature List A1,
live, the first thing a student ever talks to — assembled its prompt from an identity
block and the current beat. No safety section, no voice section, no gates, while every
other student-facing surface assembles all three. IG-INT04 is explicit: "IG-S01 (crisis
language), IG-S02 (harm prevention), IG-S07 (anti-sycophancy), IG-S09 (cultural
attribution) all active from Q1." Those four shipped as a module constant precisely so
no missing pointer could switch them off, and then the surface with the most first-time
users never called it. Now wired, in her order — safety, voice, gates, then its own
prompt. Voice v2's intake trait hierarchy (ENCOURAGING + CURIOUS) reaches a student
through that call and nowhere else.

**Her 42 intake cards do not drive the intake conversation, and seeding them does not
change that.** The surface runs on 13 hardcoded beats in `intake-beats.ts` — situation,
what_you_do, why_here, where_going, and nine more — and consults no sequence, no
detector, no methodology. Her design is a different and fuller thing: Q1–Q9 in four
phases, fifteen reveal templates selected by scoring, three baselines, the upload
request, the Foundation transition. Replacing the beats with her cards is the real A1
build and it is substantial. It is also partly blocked: H-035 defers to
`Wing_Intake_Design_v3.md` for the B1–B3 wording, and H-019.5 and IG-INT06 both need the
reveal-selection confidence threshold that document defines.

**The sequence builder composes all three documents.** `wing:build-sequences` assembles
104 entries — 19 universal, 6 voice, 42 intake, 11 Foundation 1, 12 Foundation 2, 14
Foundation 3 — sorted by module then code family, each entry carrying the session it
fires in. It refuses to build a set whose worst turn exceeds the activation limit, so a
version a reviewer has already read can never turn out to be unusable. Verified against
the documents without touching a database: peak 23 in intake, 8 / 7 / 8 in the
Foundation sessions, 7 cards at weight 2.0, and 13 coaching cards with no stated weight
(the other 47 unweighted entries are gates and exercises, where weight decides nothing).

It still publishes nothing. A sequence goes live through one pointer, and the builder
does not set it.

Migration 0022 (ELICIT, OBSERVE) is written and journalled, not yet applied — the seed
preflight now refuses cleanly instead of half-writing, which is how it was found the
second time. `wing:check-migrations` confirms the journal and the folder agree, 22 of 23
recorded, and 0022 is the only thing `db:migrate` would apply. Proven
against Postgres 16 rather than assumed: the insert is **rejected** before the
migration and accepted after, the statements are re-runnable, `H-019.5` stores as a
row distinct from `H-019`, and the unique constraint still catches a real duplicate.

See `claude/WING_TIER1_SCOPE.md` for the build plan and what has shipped against it.

# SLIpro Wing — deliverables and phasing

Written 2026-08-05. Cutover target: **August 2026**, so roughly three to four
weeks from now.

Assumptions worth correcting if wrong: the August date is a cutover of the 255
live MVP users from Replit to Azure, not a feature deadline; Danielle is the
sole methodology owner; there is no fixed date within August.

---

## 1. Done

**Phase 1 — Azure migration (stage).** Container Apps, ACR, Key Vault with
managed identity, Postgres Flexible Server, Azure DevOps pipeline with workload
identity federation. App running end to end on stage.

**Wing data model.** 45 tables, turn-level provenance, migrations 0000–0010.

**Heuristics engine.** Cards, components, sequences, application logging,
outcome scoring. Verified end to end on stage against a real session.

**Turn classification.** Nano classifier, hand-tagging surface, and the loop
that turns hand-tagged turns into classifier prompt examples with a
train/holdout split.

**Methodology out of code and into the database**, each with an admin editor,
version history and rollback:

- completion criteria — one definition rendered into both prompts, with replay
  against completed sessions
- analysis methodology — 45 sections across nine session/population pairs
- session objectives — all three Foundation Sessions, with per-beat measurement
- 36 intervention cards carrying the scripted coaching language

**Migration rehearsal.** Two consecutive clean runs against a copy of
production. 255 users, 1,171 sessions, 3,067 turns, zero failures. Runbook
written with a known-good baseline.

---

## 2. August — required for cutover

Ordered by what blocks what. Items 1 and 2 are the long pole and nothing else
depends on them being late.

### 2.1 Production Azure environment — NOT STARTED

- [ ] Resource group, Postgres Flexible Server (VNet-only), Container App,
      Container App Job for migrations
- [ ] Key Vault + user-assigned managed identity; ACR pull identity
- [ ] Secrets loaded: `DATABASE_URL`, `SESSION_SECRET`, LLM keys, storage
      account
- [ ] `TRANSCRIBE_FALLBACK_TO_OPENAI=false` — keeps audio inside the Azure
      boundary
- [ ] `OBJECTIVE_RENDERER_POPULATIONS` **unset** in production for cutover
- [ ] DNS + TLS, and the Replit domain kept live until verification passes
- [ ] Pipeline targets production, deploy verified

### 2.2 Cutover-path dry run — NOT STARTED

The rehearsal validated the *transformation*, not the *cutover*. The real
sequence is `db:migrate` against an empty database, then
`pg_restore --data-only` — a path that has never run.

- [ ] Scratch database; `db:migrate`; `--data-only` restore
- [ ] Confirm `--disable-triggers` is permitted on Azure Flexible Server. If it
      is refused, fall back to the rehearsed path and accept that Drizzle's
      migration journal will need hand-initialising
- [ ] **Verify sequences.** Legacy tables still take writes after cutover —
      monthly check-ins, coaching notes, homework — so a sequence left at zero
      means the first insert collides on a primary key
- [ ] Run the seven unique-constraint checks in the runbook: `db:migrate`
      creates constraints production has never had, and a violation blocks the
      restore

### 2.3 Cutover day

- [ ] Fresh `pg_dump` taken that day, not the rehearsal dump
- [ ] `wing:migrate-identity`, then `wing:migrate-data`
- [ ] Reconcile against the runbook baseline; **every transcript must read
      `migrated_provenance_unknown`**
- [ ] Log in as a migrated user; open a completed session and confirm speaker
      attribution alternates
- [ ] Replit kept running until verification passes

### 2.4 Data hygiene — overdue

A copy of production currently exists in three places outside production.

- [ ] Drop the `rehearsal` database on stage
- [ ] Clear `student-*` blobs from the stage storage account
- [ ] Delete the local `slipro-legacy-*.dump`
- [ ] Restore `.env` from `.env.stage-backup`

### 2.5 Danielle — methodology, parallel to the above

Does not block cutover, but the longer it waits the more sessions run on
methodology nobody has reviewed.

- [ ] Review the 253 extracted heuristic cards
- [ ] Hand-tag turns across a few sessions to measure classifier accuracy
- [ ] Decide the "2–3" claim cap lost with the removed methodology sections
- [ ] Decide whether undergraduate's sixth function (R&D / Technical) is
      deliberate — it is absent from the analysis schema, so a student who
      locks it produces a value the analysis cannot express
- [ ] Decide whether the undergraduate journey's progressive divergence is
      intended: they run 5/6, 5/7 and 4/8 beats across the three sessions,
      against mid-career's 6/6, 7/7, 8/8

---

## 3. Explicitly NOT August

Stated so they are not assumed.

- Objective renderer to production. It has run one session, behind a flag,
  locally. It needs several sessions per population read by a human before it
  goes anywhere near a student who is not you.
- Enhancement Modules as objectives. Examined and deliberately deferred: their
  criteria are deliverable checklists, not conversational beats, and modelling
  them would duplicate the criteria rather than add anything.
- Conversation-prompt editing for Danielle. The prompts are now assembled from
  objectives and cards, both of which she can edit — so the remaining need is
  smaller than it was, and unproven.
- Retiring the legacy `public` schema. Several live features still read and
  write it; see §5.

---

## 4. After cutover

**Phase 3 — validate the objective architecture.** Run each session with the
flag on for one population, read the transcripts, and compare per-beat
satisfaction rates. The specific hypothesis to test: mid-career Session 2
stalls at `articulate_decision_frameworks`. If that shows as a low satisfaction
rate while the other beats clear, the original complaint is localised to one
beat with its own evidence rule.

**Phase 4 — close the measurement loop.** Per-objective rates across cohorts
are the only honest way to test a conversation change, since replay cannot work
once Wing's words change what the student says. Once there is data, an
objective's intervention set can be changed and the effect measured.

**Phase 5 — the legacy schema.** Decide whether monthly check-ins, coaching
notes, homework and the profile sub-records move to Wing or stay where they
are. Today they stay, which is a decision by default.

---

## 5. Known risks

**The legacy `public` schema is permanent, not staging.** Several live features
read *and write* it. `migrate-data` archives them into `wing.legacy_records`,
but nothing reads them back and the features keep inserting into `public`, so
the archive drifts from the moment traffic resumes. Consequence: the legacy
schema must be restored complete and kept, with its sequences intact.

**Production and `shared/schema.ts` have drifted.** Production is missing
migration `0001` (`documents.blob_key`), lacks seven unique constraints the code
declares, and carries four `old_*` columns in `linkedin_optimizations` that
appear in no schema file. Reading is unaffected; the constraints matter only on
the `db:migrate` cutover path.

**One student has two accounts.** `chelseykavulu@` and `Chelseykavulu@`,
differing only in case. They merge onto one wing student, which is the right
outcome. The merge is now deterministic — before the fix, which of her two
Module A sessions survived depended on physical row order.

**`claude.ts` conversation summaries.** The MVP's general coaching-conversation
feature has no server routes; its dead client surface was removed. Migrated
conversation data is preserved in `wing.sessions` and `legacy_records` but is
not browsable. Reversible if wanted.

---

## 6. The honest summary

The migration is rehearsed and the methodology is out of code. What stands
between here and cutover is **infrastructure that does not exist yet** and
**one untested path**, not unknowns in the data.

The largest schedule risk is that §2.1 and §2.2 have not started and everything
in §2.3 depends on both.

# Phase 2 — production data migration rehearsal

Moving ~250 users (test users included — all of them) from the Replit/Neon
database into the Wing schema on Azure.

Rehearse against a copy until two consecutive runs are clean. Only then run it
for real.

---

## What Phase 2 actually is

Not "point the app at Neon." Both migration scripts read legacy tables *and*
Wing tables from **one** database — there is no source/target split in the code:

```ts
import * as legacy from "@shared/schema";      // public.*  (28 tables)
import * as wing   from "@shared/wing-schema"; // wing.*
```

So the shape is: **copy the data in, then transform it in place.**

```
Neon (live, read-only)
  └─ pg_dump public schema
       └─ restore into scratch Postgres  ← everything below runs here
            ├─ npm run db:migrate            create wing.* tables
            ├─ npm run wing:migrate-identity  public.users -> wing.users
            └─ npm run wing:migrate-data      everything else
```

---

## Safety invariants

Read these once before the first run.

1. **`DATABASE_URL` must never hold the Neon string.** Every script, plus
   `db:push` and `db:migrate`, resolves the target from that one variable. The
   Neon string is only ever an argument to `pg_dump`. It has no home in `.env`,
   the repo, or Key Vault, because nothing in the running app reads it.

2. **A local `.env` value silently overrides Key Vault.** `config.ts:59` returns
   early if `process.env[envName]` is already set. That makes the scratch
   override reliable — and makes a stale `.env` dangerous. Run the pre-flight
   check below before every write.

3. **`wing:migrate-identity` has no `--dry-run`.** It writes on first
   invocation. Only `wing:migrate-data` supports `--dry-run`. This is the
   reason rehearsal happens on a scratch database rather than "carefully" on a
   real one.

4. **The dump reads production directly.** The database is Replit-managed, so
   there is no Neon console and no branching. `pg_dump` is read-only and takes a
   consistent snapshot, so this is safe — but it is the one step that touches
   live data, so run it once, verify the file, and work from the file after
   that.

5. **Both scripts are idempotent** — identity matches on lowercased email and
   updates rather than duplicates; data checks for an existing row before each
   insert. Re-running after a partial failure is safe and expected.

---

## Pre-flight check

Run this before **every** write step. It prints the database you are actually
about to modify, not the one you believe you configured.

```bash
grep '^DATABASE_URL=' .env | sed -E 's|^.*@||; s|\?.*||'
```

Prints `host/database`. Pure shell on purpose — no Node, because the package is
`"type": "module"` and a `require()` one-liner will not run here.

Stop if the host is anything other than the scratch database you intend to
write to.

---

## Step 1 — Get the production connection string

The database is Replit-managed. It is Neon underneath, but the Neon console is
not available to us, so **branching is not an option** — we dump directly from
production.

That is safe: `pg_dump` takes a consistent snapshot and issues no writes.

Get the string from Replit → **Secrets** → `DATABASE_URL` (or Database →
Settings → connection details). Keep it in your clipboard or a password
manager. It never enters `.env`, the repo, or Key Vault.

Server version is **16.14**, confirmed via:

```sql
select version();   -- Replit's playground rejects SHOW as a "modification"
```

---

## Step 2 — Dump the legacy schema

Client major version must be **>= 16**:

```bash
pg_dump --version
```

If it is older, `brew install postgresql@17` and call
`/opt/homebrew/opt/postgresql@17/bin/pg_dump` explicitly below.

```bash
pg_dump "<production-connection-string>" \
  --schema=public \
  --no-owner --no-acl \
  --format=custom \
  --file=$HOME/slipro-legacy-$(date +%Y%m%d).dump
```

Record the file size and the timestamp — the real run needs a fresh dump, and
you want to notice if it is wildly different.

Then confirm what you captured:

```bash
pg_restore --list $HOME/slipro-legacy-*.dump | grep -c "TABLE DATA"
```

Expect **28** legacy tables.

---

## Step 3 — Create the scratch database

Its own database on the stage Flexible Server, so the rehearsal cannot touch
stage's Wing data:

```bash
az postgres flexible-server db create \
  --resource-group  <rg> \
  --server-name     <stage-server> \
  --database-name   rehearsal
```

You already reach the stage server from your Mac (that is how
`wing:seed-criteria` ran), so no VNet work is needed. If it hangs, the firewall
rule for your IP is missing.

---

## Step 4 — Point `.env` at the scratch database

```bash
DATABASE_URL=postgresql://<user>:<pass>@<stage-server>.postgres.database.azure.com/rehearsal?sslmode=require
```

Run the pre-flight check. `DB:` must read `rehearsal`.

---

## Step 5 — Restore the legacy tables

```bash
pg_restore \
  --dbname="$DATABASE_URL" \
  --no-owner --no-acl \
  --jobs=4 \
  $HOME/slipro-legacy-*.dump
```

The dump carries 27 of the 28 tables in `shared/schema.ts`.
`wing_migration_links` is absent because it was never created in production —
it is a migration-support table, written only by `bootstrap.ts`. Step 6 creates
it. Nothing was lost.

Verify the user count matches production:

```sql
select count(*) from public.users;   -- expect ~250
```

---

## Step 6 — Create the Wing tables

```bash
npm run db:wing-ddl
```

**Do not use `db:migrate` or `db:push` here.** Both were tried and both are
wrong, for different reasons:

- `db:migrate` replays migration `0000`, which creates the 26 legacy *public*
  tables with bare `CREATE TABLE`. After a restore that fails immediately with
  `relation "branding_intakes" already exists`.

- `db:push` reconciles the **whole database** against the schema files it is
  given, and cannot be scoped to one schema. Pointed at both files it offered
  to drop four columns and cast 2,030 rows to enums, to make the restored
  legacy tables match `shared/schema.ts`. Pointed at only `wing-schema.ts` it
  concluded the 23 public tables should not exist and offered to drop them all.
  There is no safe way to use `push` against a restored production dump.

`db:wing-ddl` runs the real migration SQL, selecting only the parts that do not
recreate the legacy tables:

| source | contents | run? |
|---|---|---|
| `0000` | 26 public tables | no — restored |
| `0002` | `public.sessions` | no — restored |
| `rehearsal-public-prereqs.sql` | idempotent copies of `0001` and `0004` | yes |
| `0003` | `CREATE SCHEMA wing` + 44 tables + 47 enums | yes |
| `0005` | column on `wing.sli_records` | yes |
| `0006` | `wing.session_completion_criteria` | yes |
| `0007` | `content_drafts.share_count` | yes |

**Why `0001` and `0004` are restated rather than run.** Both use bare
`ADD COLUMN` / `CREATE TABLE`, so re-running `db:wing-ddl` — which every repeat
rehearsal does — fails with
`column "blob_key" of relation "documents" already exists`. The wing files are
safe to re-run because `DROP SCHEMA wing CASCADE` precedes them; these two
touch `public`, which only resets when you take a fresh restore. The originals
must stay non-idempotent for the real `db:migrate` path against an empty
production database, so the rehearsal keeps its own idempotent copy. **If `0001`
or `0004` ever change, change `rehearsal-public-prereqs.sql` with them.**

`0001` itself is not optional. Production predates it, so `documents.blob_key`
does not exist there — but `shared/schema.ts` declares it, and Drizzle selects
every declared column. Without it the documents migration dies on its first
read with `column "blob_key" does not exist`.

Verify:

```bash
psql "$DATABASE_URL" -c "select count(*) from information_schema.tables where table_schema='wing';"
```

Expect **45** — 44 from the spec plus `session_completion_criteria`.

> **The real cutover runs a different order** — `db:migrate` on an empty
> production database, which creates both schemas cleanly, then load legacy
> data with `pg_restore --data-only`. That path has its own hazard (foreign-key
> ordering during a data-only restore) and needs its own rehearsal. What is
> exercised here is the *transformation* logic in steps 7–9, which does not
> care how the legacy rows arrived.

---

### Known drift: production vs `shared/schema.ts`

Found while doing this, and worth keeping. None of it breaks reading, because
the migration scripts only `SELECT`, and a `SELECT` does not care about a
missing constraint or an extra column. But it means **production never received
every migration in this repo**, so treat the two as genuinely different shapes.

- `documents.blob_key` missing, `file_data` still `NOT NULL` — migration `0001`
  never reached production. **This one breaks the migration; `0001` fixes it.**
- Seven unique constraints absent, including
  `enhancement_modules (user_id, module_code)` over 765 rows and
  `foundation_sessions (user_id, session_number)` over 405.
- `enhancement_modules.status` and `messages.role` are still `varchar(50)`
  where the code declares enums.
- `linkedin_optimizations` carries four `old_*` columns that appear in no
  schema file — an abandoned hand-migration. Worth investigating after cutover.

---

## Step 7 — Identity

```bash
npm run wing:migrate-identity
```

Writes immediately — pre-flight first.

Expect `found N legacy user(s)` matching step 5, then a created/updated/skipped
summary. **Any skip is a user who cannot log in after cutover** — skips happen
when `username` is empty. Investigate every one; do not accept a nonzero skip
count as normal.

```sql
select count(*) from wing.users;
select count(*) from wing.students;          -- must equal wing.users
select count(*) from public.users u
  where not exists (select 1 from wing.users w
                    where lower(w.email) = lower(u.username));   -- expect 0
```

---

## Step 8 — Data, dry run

```bash
npm run wing:migrate-data -- --dry-run
```

Reads everything, writes nothing, and prints per-domain counts. Read the
`failed` column in the summary — a nonzero count here is a bug to fix before
the real run, not a number to note and move past.

---

## Step 9 — Data, for real

```bash
npm run wing:migrate-data
```

**On blob storage:** documents decode inline base64 and upload to Azure Blob.
With `AZURE_STORAGE_ACCOUNT` unset every document fails (caught and counted, so
the run continues). Set it to the stage account to actually exercise this path
— it is the step most likely to break, and rehearsing without it means not
rehearsing it at all. Blobs land under `student-<id>/`, so they are easy to
clear afterwards.

---

## Step 10 — Reconcile

```sql
-- Sessions: both legacy sources land in one table.
select
  (select count(*) from public.foundation_sessions)  as legacy_foundation,
  (select count(*) from public.enhancement_modules)  as legacy_modules,
  (select count(*) from wing.sessions)               as wing_sessions;

-- Every imported transcript must be provenance_unknown. A single row with any
-- other status means migrated data leaked into the trusted corpus.
select status, count(*) from wing.transcripts group by status;

-- Turns arrived.
select count(*) from wing.transcript_turns;

-- Test users came across and are still flagged.
select is_test_user, count(*) from wing.users group by is_test_user;

-- No duplicate identities.
select lower(email), count(*) from wing.users
  group by 1 having count(*) > 1;   -- expect no rows
```

The transcript check is the one that matters most. Every migrated turn is
deliberately tagged `migrated_provenance_unknown` regardless of role, because
the legacy corpus has no turn-level provenance. If anything shows a different
status, the behavioural data is contaminated and the heuristics engine will
score against turns whose origin is unknown.

### Known-good baseline — rehearsal 1, 2026-08-04

Dump taken from production the same day. Compare run 2 against this; a
difference that is not explained by new production activity is a regression.

| | count | reconciles as |
|---|---|---|
| `public.users` | 255 | — |
| `wing.users` | 254 | 255 − 1 duplicate account (see below) |
| `wing.students` | 254 | one per user |
| `wing.intake_records` | 134 | 102 questionnaires ∪ 126 branding intakes |
| `wing.documents` | 184 | 191 legacy − 7 duplicate (student, filename) |
| `wing.sessions` | 1171 | 405 foundation + 765 modules − 3 merged + 4 conversations |
| `wing.transcripts` | 1171 | one per session, **all `migrated_provenance_unknown`** |
| `wing.transcript_turns` | 3067 | 1707 + 1265 + 95 legacy messages |
| entitlements | 13 | users with a non-free `subscription_tier` |
| `is_test_user` | 236 f / 18 t | test users migrate too, and stay flagged |

Run 2 adds a `post_shares` line that run 1 did not have — `linkedin_post_shares`
was not migrated at all until the content-drafts work. Expect **1**, matching
the single legacy row.

Two counts that look wrong and are not:

- **Sessions exceed foundation + modules.** Legacy `conversations` also become
  sessions. Forgetting that makes the total look one-too-many per conversation.
- **`entitlements … skipped 242`** means "no paid tier", not a failure. The loop
  walks every user and skips free ones.

### The duplicate account

`chelseykavulu@berkeley.edu` and `Chelseykavulu@berkeley.edu` are the same
student, registered twice — production has no `users_username_unique`
constraint to prevent it. Legacy ids 93 and 227.

Account 227 holds the real work (3 foundation sessions, Module A completed,
Module B in progress, 2 documents). Account 93 is an empty shell: its module
rows were auto-provisioned a week *later* and never touched.

They merge onto one wing student, which is the right outcome. But the merge is
first-row-wins, so **which** row survives used to depend on an unordered
`SELECT`. That is now fixed in three places — see the `byProgress` comment in
`migrate-data.ts` and the ordering note in `migrate-identity.ts`. Before the
fix, an autovacuum between rehearsal and cutover could have silently discarded
her completed Module A.

Expect `sessions … skipped 3` on every real run. If it reads 0, the merge did
not happen and something is wrong.

---

## Step 11 — Log in as a migrated user

Row counts do not prove the password hashes survived. Pick a real migrated
account on the rehearsal database and log in. The hash format is unchanged
(scrypt, `hash.salt`) and carries over verbatim, so this should just work —
which is exactly why it is worth confirming rather than assuming.

Then **open a completed session and check who is speaking.** This is not
cosmetic and no query above catches it.

Every migrated turn is stamped `provenance_unknown`, on purpose. Several
readers used to derive the speaker from `provenance_tag === "ai_generated"`,
which is correct for live turns — provenance is a pure function of turn type —
and silently wrong for migrated ones, where it made *every* turn read as the
student, including Wing's own questions. Fixed in rehearsal 1 by switching all
of them to `isAiTurn(turn_type)`; see `turn-type.ts`.

The data was never wrong: `turn_type` migrates correctly. Only the readers
were. So a recurrence needs no re-migration, just a code fix — but it will pass
every count-based check, so look at an actual transcript with your eyes:

- a completed Foundation session — alternating Wing / student
- a completed Enhancement module — same
- `/admin/tagging/<session>` — Wing's turns must be greyed out and untaggable

---

## Before the real run

- [ ] Two consecutive clean rehearsals — zero `failed`, zero unexplained skips
- [ ] Production Azure environment exists (container app, Postgres, Key Vault,
      ACR pull identity, DNS) — **this does not exist yet**
- [ ] `TRANSCRIBE_FALLBACK_TO_OPENAI=false` in production, so audio stays inside
      the Azure boundary
- [ ] Fresh dump taken at cutover, not the rehearsal dump
- [ ] Replit kept running until verification passes on production
- [ ] `.env` deleted or repointed afterwards, so no stale scratch string survives

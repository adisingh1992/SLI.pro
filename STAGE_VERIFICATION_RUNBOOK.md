# Stage verification runbook

Everything built since the Replit purge, in the order it has to be checked.

**Why this document exists.** A large amount of code has been written and
typechecked without being run. The typecheck holding at 101 says the shapes are
consistent; it says nothing about whether a single one of these paths works.
Every failure this project has actually hit has been silent — a send that
reported success and never arrived, an extractor returning a plausible wrong
answer, a read migrated to `wing` with the write left on `public`. None of them
raised. So this is ordered by what breaks everything downstream, not by feature
number.

Budget roughly two hours. Steps 1–3 are prerequisites; if any of them fails,
stop, because everything after depends on them.

---

## 0 · Before you start

- Point at **stage**. Confirm with `echo $DATABASE_URL | sed 's/:.*@/:***@/'`
  — never paste the full string anywhere.
- `git status` clean, on the branch you intend to deploy.
- `npm ci && npm run check` → expect **101 errors** (the pre-existing baseline).
  A different number means something moved; find out what before continuing.
- `npm test` → 7 suites, all pass.

---

## 1 · Schema

### Two migration paths, and why they diverged

There are two ways schema reaches a database, and they disagreed:

| | applies | used by |
|---|---|---|
| `db:migrate` | whatever `meta/_journal.json` lists, minus what `drizzle.__drizzle_migrations` records | the deployment pipeline |
| `db:wing-ddl` | a hand-written list of `.sql` files, via psql | people, by hand |

Stage's drizzle table had 0000–0007. Everything from 0008 was applied by
`db:wing-ddl` instead, so drizzle never learned about it — and on every
pipeline run it reached 0008, tried to create `analysis_methodology_id_seq` a
second time, and failed with `42P07`.

**Fixed by making 0008 onward replay-safe** rather than by hand-inserting rows
into drizzle's tracking table. A baseline `INSERT` repairs one database; guards
repair the next one too, including production when it is built.

Check before running anything:

```bash
npm run wing:check-migrations
```

Read-only. Reports what drizzle has recorded, what the next `db:migrate` would
apply, and flags anything not safe to replay.

### Applying

```bash
npm run db:migrate      # the same path the pipeline uses — prefer this
```

`db:wing-ddl` is now bootstrap-only: it also runs
`rehearsal-public-prereqs.sql`, which is what a database with no `public`
schema needs before the wing migrations will apply. For an existing database it
is redundant, and using it is what caused the drift. Then confirm the four tables added this session
exist and the two new columns are on `wing.students`:

```sql
select table_name from information_schema.tables
 where table_schema = 'wing'
   and table_name in ('homework_assignments','check_ins','coaching_notes',
                      'institution_email_domains');

select column_name from information_schema.columns
 where table_schema='wing' and table_name='students'
   and column_name in ('institution_id','internship_start_date');

select column_name from information_schema.columns
 where table_schema='wing' and table_name='message_events'
   and column_name in ('failed_at','failure_reason');
```

All five queries must return rows. `failed_at` in particular: without it every
refused send is still recorded as delivered, which is the bug that made the
advisor snapshot report success and never arrive.

**Stop if any is missing.**

---

## 2 · Seed

Order matters — institutions before the domain backfill, templates before any
send.

```bash
npm run wing:seed-partners      # Berkeley + Vanderbilt, email domains, backfill
npm run wing:seed-templates     # 20 templates; skips any Danielle has edited
npm run wing:seed-prompts       # life-log prompt library
npm run wing:seed-objectives
npm run wing:seed-criteria
npm run wing:seed-methodology-sections
```

`wing:seed-templates` **skips existing keys by design** — it will not revert an
edit made in the admin UI. Pass `--force` only if you intend to overwrite
Danielle's copy, and tell her first.

---

## 3 · Preflight

```bash
npm run wing:check-journey      # public-schema writes, wing/public user parity
npm run wing:check-metrics      # dashboard aggregates
npm run wing:check-advisors     # advisor surface, including the bigint->string trap
npm run wing:check-sequences    # templates, audience, what is due, delivery history
```

`wing:check-sequences` is the new one and the most useful. Read its four
sections in order:

| Section | What a failure means |
|---|---|
| Templates | a key the code asks for was never seeded → silent no-send |
| Audience | students with `institution_id` NULL → calendar touchpoints reach nobody |
| Due now | what the next runner execution will actually do |
| Delivery history | `failed_at` rows, and sends with no provider id (unverifiable) |

**Expect `unassigned = 0`.** Anything else means the email-domain backfill did
not match — check the domains on `wing.institution_email_domains` against the
real addresses in `wing.users`.

---

## 4 · The primary journey, as a student

Use a **fresh account on a partner email domain** (e.g. `…@berkeley.edu`), not
an existing one — half of what you are testing is what happens at registration.

1. **Register.** Then check the record landed in `wing`, not `public`, and that
   the institution was assigned:

   ```sql
   select u.email, s.institution_id, i.name
     from wing.users u
     join wing.students s on s.user_id = u.id
     left join wing.institutions i on i.id = s.institution_id
    where u.email = '<the address>';
   ```

   `institution_id` NULL here is the failure that made every partner filter
   return zero.

2. **Intake** (`/intake`). This is a full replacement — the form is gone.
   Watch for:
   - Wing asks about **one thing at a time** and does not re-ask anything it
     could have read from your LinkedIn or resume upload.
   - The **insight** arrives partway through, not at the end, and only once.
   - The **pathway** question branches (employment / venture / freelance) and
     the branch changes what it asks next.
   - You can go **back**.
   - Nothing you said earlier is lost when you answer something new. Check
     `wing.branding_intakes.responses` grows rather than being replaced.

3. **Foundation Session 1 → 2 → 3.** Between each, read the transition copy —
   that was A2. Session 1 must not ask again for anything intake captured.

4. **Enhancement modules.** Optional, non-progressive, enterable in any order,
   and exitable early. Exit one early and confirm the dashboard card renders —
   `ended_early` had no case in `SessionCard` and crashed the page.

5. **SLI selection and refinement.** Refinement was returning the entire
   section as the statement; confirm you get a sentence, not a wall.

6. **Portfolio** (`/portfolio`). Every evidence item must cite a real turn of
   **yours**, not Wing's. Spot-check two against
   `wing.session_turns`. Nothing should be attributed to Equity + Inclusion on
   the basis of who you are rather than what you said.

7. **Life log** (`/log`). Write an entry, get a reply. Then open the
   internship control at the bottom and set a start date.

8. **LinkedIn draft → publish.** This starts the 90-day launch sequence:

   ```sql
   select * from wing.engagement_sequence_states
    where sequence_key = 'positioning_launch';
   ```

   One row, `current_step = 0`, `next_run_at` a week out.

---

## 5 · Messages

Everything outbound goes through one runner. Dry run first:

```bash
npm run wing:run-sequences -- --dry-run
```

That lists stored sequence steps only. To exercise the date-driven ones without
waiting, move a date rather than editing code — the queries ask "who is due
today", so back-dating the input is the honest test:

```sql
-- day-30 internship milestone, for the test student only
update wing.students set internship_start_date = current_date - 30
 where id = <test student id>;

-- calendar touchpoint today
insert into wing.institution_calendar_events
       (institution_id, label, event_date, template_key, active)
values (<berkeley id>, 'Recruiting season (test)', current_date,
        'calendar_touchpoint', true);
```

Then:

```bash
npm run wing:run-sequences
```

Check the mail actually arrived, and then check the log agrees:

```sql
select template_key, sequence_key, sent_at, failed_at, failure_reason,
       provider_message_id
  from wing.message_events
 where student_id = <test student id>
 order by sent_at desc limit 20;
```

A row with `failed_at` NULL **and** `provider_message_id` NULL is the shape the
"sent but never arrived" bug produced. It is not proof of failure, but it is not
proof of delivery either.

Run `wing:run-sequences` a **second time** immediately. Nothing should send
twice — the calendar guard is keyed on `calendar:<event id>`, so re-running is
the test of it.

**Clean up the test rows afterwards**, or the next run repeats them.

---

## 6 · Admin

The admin panel was rebuilt: 25 screens became 7, and the sidebar now splits
into **Operations** and **Methodology**. See `ADMIN_UI.md` for the full map.

**First, check the role split.** This is the part most likely to surprise
someone, because it changes what a partner can see:

```sql
select email, role from wing.users where role like '%admin%';
```

Everyone who should see the methodology engine needs `role = 'platform_admin'`.
Anyone on `institution_admin` gets Operations only. If Danielle currently has
`institution_admin` and expects to edit criteria, that is the row to change —
and worth a deliberate conversation rather than a quiet UPDATE.

Sign in as each role and confirm:

- **platform_admin** sees both sidebar groups.
- **institution_admin** sees Operations only, and visiting `/admin/methodology`
  directly gives a clear "this is for SLIpro platform staff" screen rather than
  a page of errors.

Then, as an admin:

- **Every old URL still works.** Spot-check `/admin/templates`,
  `/admin/criteria`, `/admin/reports` and `/admin/users/<id>/sli` — each should
  land on the right tab of the new screen. All 24 pre-existing admin URLs are
  redirected; if any 404s, that's a bug.
- `/admin/messages` — edit a template, save, confirm a new version row and that
  the old one is retired rather than updated. Then re-run
  `npm run wing:seed-templates` and confirm your edit **survives**.
- `/admin/messages/calendar` — add, pause, delete a touchpoint. The alert
  explaining that one date sends two different messages should be visible.
- `/admin/messages/delivery` — **new**. This is where delivery failures are
  finally visible. Three states, and the third is the important one:
  *unverified* means no failure was recorded but no provider id came back
  either, which is the exact shape of the "sent but never arrived" bug. A few
  old rows are expected; a stream of new ones is not.
- `/admin/users` — the status column is now a progress bar rather than thirteen
  pastel badges. Test accounts are hidden by default and counted in the header;
  confirm the count matches what you expect.
- `/admin/users/<id>` — one screen with six tabs. Check the tab URL changes as
  you click, and that Back moves between tabs.
- `/admin/advisors` — add an appointment, send a snapshot. The snapshot must
  draw on all three sessions, not just Session 1.
- `/admin/dashboard` — filter by institution. Non-zero now that students are
  assigned. The Exports tab is the old Reports screen.
- `/admin/session-design` — objectives, completion and analysis as three tabs,
  with the "no review step" warning above them.

---

## 7 · Mobile

Follow `MOBILE_TEST_PLAN.md` on real hardware. The two things that only appear
on a device: iOS zooming on any input below 16px and never zooming back, and the
voice recorder's permission prompt.

---

## What is knowingly not covered

- **Inbound email reply-to-log and SMS** (B2 remainder). Needs SendGrid Inbound
  Parse and a Twilio number; neither is provisioned. This is the open question
  for Danielle.
- **Production.** Deferred until the contract is signed — stage is the demo
  environment.
- **Vector memory / RAG.** Table and pgvector exist, pipeline is Tier 2.
- **Phyllo scoring integration** (C5). The 360Brew *writing standard* is in;
  the *scoring* is Tier 2.

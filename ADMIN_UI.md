# Admin panel

25 screens became 7. This is the map, and the reasoning.

---

## The audit that started it

| Finding | Detail |
|---|---|
| Two products, one flat sidebar | Ten items with no grouping, interleaving cohort operations with methodology engineering. A career-centre director had the "edit completion criteria" button one mis-click from the student list. |
| The student record was shattered | Seven pages — detail, summary, SLI, homework, transcripts, coaching notes — **five of which independently fetched the same `/api/admin/users/:id`** just to render a name at the top. |
| Four pages rendered outside the layout | `coaching-notes`, `sli-page`, `heuristic-editor` had no sidebar at all — dead ends you navigated out of with the browser Back button. |
| No shared primitives | Five different heading styles, eight container widths across two centring idioms. **2 of 25** screens used the `Table` component; **1 of 25** used `Tabs`; **0** used `Sidebar`. |
| shadcn/ui installed and unused | 48 components present — including `sidebar`, `table`, `chart`, `command`, `breadcrumb`, `skeleton` — mostly ignored in favour of hand-rolled divs. |

No new UI dependency was added. The modernisation is almost entirely *using
what was already installed*.

---

## The new map

### Operations — both admin roles

| Screen | Route | Absorbed |
|---|---|---|
| Overview | `/admin/dashboard` | dashboard + **reports** (Metrics / Exports) |
| Students | `/admin/users` | users list |
| Student record | `/admin/users/:id/:tab` | **six pages** (Overview / Positioning / Sessions / Homework / Notes / Summary) |
| Advising | `/admin/advisors` | — |
| Messages | `/admin/messages/:tab` | templates + **calendar** + **delivery** (new) |

### Methodology — `platform_admin` only

| Screen | Route | Absorbed |
|---|---|---|
| Methodology | `/admin/methodology/:tab` | heuristics + sequences + **integrity** + **voice** (new) |
| Session design | `/admin/session-design/:tab` | objectives + criteria + analysis |
| Tagging | `/admin/tagging/:tab` | tagging + validate + classifier |

---

## Decisions worth knowing about

**The role split is real, and enforced twice.** `wing.users.role` already had
`institution_admin` and `platform_admin` — the schema had modelled this
correctly and the auth layer was still reading the legacy `is_admin` boolean.
The sidebar hides the Methodology group for institution admins; `isPlatformAdmin`
in `server/admin-guards.ts` refuses the requests independently. Hiding a link is
not a control.

**Tabs are path segments, never component state.** `/admin/users/42/coaching-notes`
was a real page people bookmarked and is now a tab at the same URL. Deep links
work, Back moves between tabs, and every one of the 24 pre-existing admin URLs
still resolves — see `client/src/pages/admin/redirect.tsx`.

**One fetch per student, shared down.** The record page fetches once and passes
data to panels. Only the active panel mounts, because the sessions panel pulls
every message of a transcript and mounting all six to show one would fire the lot.

**The delivery log is new.** `message_events.failed_at` and `failure_reason` were
added after a send that reported success and never arrived — but the only way to
read them was psql. A delivery failure nobody can see is the same shape as the
original bug. Three states, deliberately not two:

- **Delivered** — provider accepted, id recorded
- **Failed** — provider refused, with a reason
- **Unverified** — no failure, but no id either

Collapsing the third into "delivered" would hide a recurrence of exactly the bug
this subsystem was repaired around.

**The students list stopped using thirteen colours.** "Status" is a position in
an ordered funnel, not a category. Thirteen pastels look like meaning and carry
none — nobody can rank hues. It's now a step counter and a progress bar, which
sorts correctly because the underlying value is ordinal. Test accounts are
excluded by default and counted separately; they used to be silently mixed in,
inflating every number read off the screen.

**Pagination removed from the student list.** 255 people, already fully in
memory. Paging added three controls and a piece of state to hide rows the
browser had already loaded.

---

## Two security fixes found on the way

Both the same class — a denylist where an allowlist belonged.

- **`GET /api/user`** spread the whole `AuthUser` and deleted `passwordHash`,
  which serialised `linkedinAccessToken` and `linkedinRefreshToken` to the
  browser on every page load. Nothing read them there.
- **`GET /api/admin/users/:id`** did the same with another person's profile —
  any admin could read any student's live OAuth credentials out of their own
  query cache.

Both now name what goes out, so a field added to `AuthUser` later is not exposed
by default.

A third, related fix: the client's `User` type came from `@shared/schema`, which
describes `public.users` — a table `/api/user` stopped reading at the identity
cutover. The overlapping fields lined up, so it compiled, and `user.role` simply
did not exist as far as TypeScript knew. Now typed by `shared/auth-user.ts`.

And one regression caught during the work: admin routes are plain `<Route>`, not
`<ProtectedRoute>`, so each old screen carried its own redirect — about twenty
copies of the same four lines. The consolidated screens inherited the bodies but
not the guards. The gate now lives in `AdminLayout`, which every admin screen
renders and none can forget.

---

## Colour

Six semantic tokens, defined in `index.css` and exposed through
`tailwind.config.ts` as `brand`, `info`, `deep`, `warn`, `good`, `bad` — each
with a `-soft` tint for fills.

The brand `--primary` is a 23%-saturation mint. It is right for the student app
and nearly invisible at icon size, which is why the panel read as grey-on-grey.
`--brand` is that same hue (167) at a usable depth, so the accent and the brand
are one colour rather than two greens that nearly match.

They carry meaning, not decoration:

| Token | Means |
|---|---|
| `brand` | the product; anything live or current |
| `info` | neutral secondary emphasis — counts, references |
| `deep` | the methodology engine, a different job from operations |
| `warn` | needs a person to look at it |
| `good` | finished, verified, delivered |
| `bad` | failed, or destructive |

Six is the ceiling. Past that they stop being categories and become a palette —
which is how the old students list ended up with thirteen pastels that meant
nothing. Every ad-hoc `text-amber-700` / `bg-emerald-100` in the admin tree was
folded onto these, so the panel is one system rather than mostly-tokens-plus-
whatever-was-typed.

Two rules that shaped the application:

- **Colour goes on chrome, not on numbers.** A `StatCard` tints its icon chip
  and a 2px top rule; the value stays in body colour. A figure printed in red
  reads as "this figure is bad", which the card cannot know — 12 failed sends is
  not a smaller number than 12 delivered ones.
- **Empty states default to the brand tint, not amber.** Grey reads as broken,
  amber reads as "you have a problem". Most of these screens are empty because
  nobody has added anything yet, which is neither.

## Zoom, and the sidebar seam

The admin panel runs at **90%**; the student app stays at 95%. `.admin-ui` on
`<html>` selects between them, applied by `useAdminZoom()` — which both
`AdminLayout` and the login screen call, so signing in doesn't lurch between
two zoom levels.

The seam under the sidebar was a consequence of `zoom` itself. `zoom` scales the
rendered result, but **viewport units resolve before the scale is applied** — so
`h-svh` computed 100% of the viewport and then shrank to 90% of it. No height
value inside the sidebar could fix it, because the sidebar wasn't the thing that
was wrong.

The fix is to divide it back out. `--zoom` carries the factor, and anything
full-height uses `calc(100svh / var(--zoom))`:

```
at zoom Z, an element must be 100svh / Z tall to render as 100svh
```

`--zoom` defaults to `1`, so the arithmetic is a no-op on mobile and anywhere
the zoom isn't applied. Zoom stays desktop-only in both apps: at 0.9 a 44px
control becomes 40px, below every platform's minimum touch target, on the
screens with the least room to spare.

## The students list was doing 2,300 queries

`getUserStatus()` derived one student's funnel position by asking **nine
questions in sequence** — LinkedIn optimisations, SLI records, freshness
reports, the user, their student id, their sessions, documents, intake,
questionnaire — short-circuiting at the first hit. The admin list called it per
student inside a `Promise.all`, then fetched the branding intake *again* for the
school column.

At 255 students that's ~2,300 queries, issued as 255 concurrent chains against a
ten-connection pool. They queue; the screen waits for all of it.

`server/wing/cohort-summary.ts` computes the same thing for everyone in one
statement — a `CASE` over `EXISTS` subqueries. Postgres evaluates `CASE` top to
bottom and stops at the first true branch, so the short-circuit is preserved
rather than reimplemented, and the precedence is stated once in the order it's
written. The endpoint is now two queries regardless of cohort size.

Two things this needed beyond the query:

- **Migration 0017** adds indexes on `linkedin_optimizations.student_id` and
  `freshness_reports.student_id`. A foreign key constrains the referencing
  column but does *not* index it — and LinkedIn optimisation is the first branch
  of the `CASE`, so it's evaluated for every user before anything else.
  Collapsing the query count and then leaving it to seq-scan per student would
  have moved the cost, not removed it.
- **A contract test.** The query emits stage names as SQL string literals; the
  screen turns them into a step number via `FUNNEL.indexOf(...)`, which returns
  −1 on a miss and floors to 0. A renamed label wouldn't throw or warn — it
  would render the student as "Registered" with an empty bar, indistinguishable
  from someone who's genuinely done nothing. `api-contracts.test.ts` compares
  the two lists directly.

`getUserStatus()` is deleted rather than left unused: two implementations of the
same funnel is how they end up disagreeing about what "Documents Uploaded"
means.

## The student record was slow for a different reason

Not query count — payload size. `/api/admin/users/:id` called
`getUserProfile()`, which is the right payload for the *student's own*
dashboard: six collections, all used there. The admin record screen uses three,
and the three it skipped were the expensive ones:

| Skipped | Cost |
|---|---|
| `documents` | `.select()` returns every column, including `extracted_text` — a resume and a LinkedIn PDF export **in full**, tens to hundreds of KB each — plus the `analysis` jsonb. The screen renders a filename, type and date. |
| `foundationSessions` | a further `getArtifact()` query **per completed session**, each artifact's `content` jsonb embedded. The screen uses `status` to label a picker button. |
| `slis`, `freshnessReports` | fetched in full, **never read**. Positioning queries `/slis` itself; freshness reports have no surface here. |

`server/wing/student-record.ts` names every column it wants. Three small
parallel queries, no artifact join, no extracted text. A joined statement was
the obvious alternative and is worse: four documents × six sessions is
twenty-four rows of mostly-repeated jsonb.

The trap is that `.select()` reads identically whether a table has four small
columns or one enormous one. `api-contracts.test.ts` fails the build if this
query grows a bare `.select()` or references `extractedText`/`analysis`. It is
scoped to this one file — the session prompt builder genuinely needs the text.

**Two bugs surfaced while doing this**, both in the Brand assessment section:

- `rawAnswers[key]` is `{ question, answer, other?, aiSubtopics? }`, not a
  scalar. My consolidated panel rendered the entry, which prints
  `[object Object]` for every question. Now reads `entry.answer`, renders 1–5
  ratings as a scale, and labels `aiSubtopics` as machine-suggested rather than
  as something the student said.
- Pre-existing: the endpoint returned the *shaped* questionnaire
  (`{industry, goals, …, rawAnswers}`) while the screen looked up `Q1`…`Q18`.
  Every question rendered as "—" for every student, on both the old detail page
  and the new one. The lean query returns `rawAnswers` directly, which fixes it.

## Demographics are platform-staff only

Race, gender identity, first-generation status and immigrant background were
rendering on every student's Overview tab, visible to `institution_admin` —
Berkeley and Vanderbilt career staff.

They're collected for aggregate equity reporting, not as context for a
one-to-one. This project already forbids inferring the Equity + Inclusion
competency from demographics in the evidence portfolio; showing them by default
to the person making a coaching judgement undercuts that from the other
direction.

Withheld **on the server**, not just hidden in the UI — a field the browser
receives is a field the browser has, whatever the screen renders.
`RESTRICTED_INTAKE_KEYS` in `student-record.ts` gates by key rather than by
section heading, because first-generation status is filed under "Professional
Path" on one platform and "Student Experience" on another; gating by heading
would have leaked it on two of three.

`api-contracts.test.ts` fails the build if a key appears in a Demographics
section without being in that list. Adding "Disability status" to the intake is
a one-line change that would otherwise ship it to every partner admin with
nothing to say so.

## Zero-byte documents

`Buffer.from(x, "base64")` **never throws**. Given a data-URI prefix, a
truncated payload, or anything that isn't base64, it returns an empty buffer —
so the upload's `!fileData` guard passed, a row was written with
`size_bytes = 0`, and a blob URI was stored pointing at nothing.

A real student has a LinkedIn export like this. Nothing failed, nothing logged,
and the record screen listed the document as present. The consequence isn't
cosmetic: A2's premise is that Wing reads the LinkedIn export instead of
re-asking, so that student gets a measurably more generic session and nobody
can tell why.

`createDocument` now rejects anything under 100 bytes — a PDF header alone is
longer, so a tiny decode means malformed input rather than a small file.
`npm run wing:check-documents` finds existing ones, plus two quieter variants:
documents with bytes but no `extracted_text` (stored and downloadable, but
invisible to the session prompt, which reads the text and not the blob), and
students with no readable document at all.

## Where things live

```
client/src/components/admin/     page.tsx · states.tsx · data-table.tsx · stat-card.tsx
client/src/pages/admin/
  layout.tsx                     the shell: sidebar, breadcrumbs, auth gate
  redirect.tsx                   old URLs -> new
  require-platform-admin.tsx     the courtesy screen for the wrong role
  overview/  student/  messages/  methodology/  tagging/
                                 <area>-page.tsx is the screen; *-panel.tsx are its tabs
```

A panel never renders `AdminLayout`. A page always does.

---

## Not done

- **Nothing here has been run.** Typecheck is at 97 (four *below* the
  pre-existing 101 baseline) and all seven test suites pass, but neither says
  anything about behaviour. Work through §6 of `STAGE_VERIFICATION_RUNBOOK.md`.
- **`advisors-page`, `heuristic-detail-page`, `tagging-session-page`** adopted
  the shared shell but keep their original bodies. They work and they're
  consistent; they haven't been rethought.
- **`/admin/users/:id/summary/:summaryId`** redirects to the summary tab and
  loses the specific summary id. Minor, and fixable if anyone misses it.
- **Mobile.** The sidebar collapses and the tab strips scroll, but none of this
  has been on a real device. `MOBILE_TEST_PLAN.md` applies.

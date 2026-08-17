# Admin scoping — what is done and what is not

`isAdmin` admits both admin roles. It answers *may this person use an admin
route*, and until migration `0018` nothing answered *whose data* — so every
route behind it served the whole platform to whoever passed the guard.

**Nothing has leaked.** Nothing in the codebase creates an `institution_admin`:
the only role writes set `platform_admin` (`routes.ts`, `wing/bootstrap.ts`) or
`student`. Every administrator today is SLIpro staff, and `{ kind: "all" }` is
the right answer for them. This work exists so the control is in place *before*
the first Berkeley or Vanderbilt administrator account is created.

**Do not create a partner administrator account until the surfaces they need are
on the scoped list below.**

## The model

`server/admin-guards.ts` derives scope from the session and touches no database:

```
platform_admin                        → { kind: "all" }
institution_admin + institution_id    → { kind: "institution", institutionId }
institution_admin, institution_id NULL → null  (sees nothing — fail closed)
```

`server/wing/admin-scope.ts` answers who is in a scope. Two helpers:
`userIdsForInstitution` for cohort lists, `isStudentInScope` /
`requireStudentInScope` for a single student.

Three rules the handlers follow:

- **Scope comes from the session, never the request.** A query parameter may
  narrow within a scope and may never widen out of it.
- **A partner asking for another institution gets 403, not a silent rewrite to
  their own.** These numbers go into budget defence; a quietly corrected answer
  is worse than a refusal.
- **Out of scope answers the same way as not-found.** 403 on a real id and 404
  on a fake one lets one partner enumerate the other's students. See the note in
  `wing/admin-scope.ts`.

`{ kind: "all" }` includes students with **no** institution. Direct/B2C students,
and anyone whose email domain matched no partner, are invisible to every
institution scope — correct, they belong to no cohort — and must stay visible to
staff, who are the only people who can repair a mis-assignment.

## Scoped

| Route | How |
|---|---|
| `GET /api/admin/metrics` | `resolveInstitutionFilter` |
| `GET /api/admin/metrics/export` | `resolveInstitutionFilter` |
| `GET /api/admin/metrics/options` | `requireScope` → `filterOptions(institutionId)` |
| `GET /api/admin/users` | `userIdsForInstitution` |
| `GET /api/admin/users/count` | `userIdsForInstitution` |
| `GET /api/admin/users/:id` | `requireStudentInScope` |
| `GET /api/admin/users/:userId/coaching-notes` | `requireStudentInScope` |
| `GET /api/admin/users/:userId/foundation-sessions` | `requireStudentInScope` |
| `GET /api/admin/users/:userId/foundation-sessions/:sessionNumber/messages` | `isStudentInScope` (empty transcript) |
| `GET /api/admin/users/:userId/enhancement-modules/:moduleCode/messages` | `isStudentInScope` (empty module) |

`/api/admin/metrics/options` matters more than it looks: it is how a caller
learns which institution ids exist. Returning all of them to a partner both
named the other partner and handed over the id needed to ask for their cohort.

## Platform staff only, by design

These are not deferred scoping work — they cannot be scoped without defeating
their purpose.

| Route | Why staff only |
|---|---|
| `GET /api/admin/students/unattached` | An unattached student is in no institution, so an institution-scoped caller would correctly see an empty list. The feature cannot exist for a partner without letting them read students outside their cohort. |
| `PUT /api/admin/students/:userId/institution` | Letting a partner claim unattached students invites the exact race the scoping work prevents — Berkeley claiming a Vanderbilt student who used a Gmail address, in good faith, with nothing to catch it. |

A career centre that notices a missing student asks SLIpro. That ask is cheap;
the alternative is two partners silently claiming the same person.

Both routes are driven from **`/admin/attribution`** (Platform → Attribution in
the sidebar, visible to `platform_admin` only). The screen defaults to students
who selected "university partnership" at registration and then matched no email
domain — the ones who reported the contradiction themselves — with the rest of
the unattached list one toggle away.

Assignment writes `admin_audit_log` with the actor attached — the first writer
that table has had. It is also the only path permitted to *reassign*, which the
automatic matcher deliberately never does: moving someone between cohorts is a
decision for a person, and now there is a record of which person.

### The gate integrity surface

Twenty-four Tier 1 cards are integrity gates. The rules are compiled into every
reply Wing composes, the delivered reply is audited against them, and the
findings drive two decisions: which patterns are too broad, and which gates earn
the latency of blocking a turn. `/admin/methodology/integrity` is where that is
read. All four routes are `isPlatformAdmin`.

| Route | Why staff only |
|---|---|
| `GET /api/admin/gate-audit/summary` | The methodology engine, so `isPlatformAdmin` by the ordinary rule. It also cannot be scoped into usefulness: tuning a gate means looking across every student it fired on, so a per-cohort view answers a different question. |
| `GET /api/admin/gate-audit/findings` | `excerpt` is a window of Wing's own reply and will often quote the student back, so it carries the sensitivity of `transcript_turns.content`. The response deliberately carries no name, email or free-text profile field — a student id and a session id, which reach the transcript only through the screens that already guard it. |
| `PATCH /api/admin/gate-audit/findings/:id` | The review state decides which patterns get narrowed and which gates earn hard enforcement. A methodology judgement, not a cohort operation. |
| `GET /api/admin/sequences/:id/cards` | Which cards are in a sequence, live or not. Methodology rather than student data — and it is how an unpublished build gets reviewed before it reaches anyone. |
| `PUT /api/admin/cycles/:id/active-sequence` | Moves a cycle's pointer to an existing sequence. This is what makes a methodology reach students, so it is the highest-consequence write on the screen — and it carries the evaluation-window gate for the same reason the publish route does. |

Accepted means the finding was real. **Rejected means the pattern was too broad**
and Wing behaved correctly, so a gate with many rejections is a fault in our
regex — not in the methodology and not in the coaching. The screen says so out
loud, because the intuitive reading is the other way round.

## Closed to partners pending scoping

The five legacy Excel exports each build their own multi-table join and none
filters by institution. Rather than half-scope them — which reads as done — they
are `isPlatformAdmin` until each query is narrowed. `/api/admin/metrics/export`
is scoped and is the B4 export a career centre actually needs.

```
GET /api/admin/export/branding-intake
GET /api/admin/export/questionnaire
GET /api/admin/export/users
GET /api/admin/export/chatbot-sessions
GET /api/admin/export/transcripts      ← full coaching transcripts
```

Contract check 16 fails the build if one of these is reopened to `isAdmin`.

## Still unscoped — the remaining work

These are behind `isAdmin` and read or write student data without narrowing.
They are safe today because no `institution_admin` exists. Each needs either a
scope call or a demotion to `isPlatformAdmin`.

| File | Count | Routes |
|---|---|---|
| `advisor-routes.ts` | 8 | `advisees`, `advisors` (GET/POST), `appointments` (GET/POST), `appointments/:id/snapshot` (GET/POST), `institutions` |
| `template-routes.ts` | 7 | `templates`, `templates/:key` (GET/POST), `/preview`, `/revert/:versionId`, `/test-send`, `message-events` |
| `sli-routes.ts` | 5 | `users/:userId/slis`, `users/:userId/slis/generate`, `slis/:id` (GET/PATCH/DELETE) |
| `calendar-routes.ts` | 4 | `calendar-events` (GET/POST), `calendar-events/:id` (PATCH/DELETE) |
| `homework-routes.ts` | 4 | `users/:userId/homework` (GET/POST), `homework/:id` (PATCH/DELETE) |
| `routes.ts` | 3 | `coaching-notes` (POST), `coaching-notes/:id` (PUT/DELETE) |
| `portfolio-routes.ts` | 1 | `users/:userId/portfolio` |
| `enhancement-modules-routes.ts` | 1 | `users/:userId/enhancement-modules` |

Notes for whoever picks this up:

- The `users/:userId/*` ones are mechanical — `requireScope` then
  `requireStudentInScope`, as in `routes.ts`.
- `slis/:id`, `homework/:id` and `coaching-notes/:id` key on the **artifact**
  id, not a user id, so each needs a join back to the owning student before it
  can be scoped. That is the fiddly half.
- `advisor-routes.ts` and `calendar-routes.ts` are institution-level rather than
  student-level: `advisors`, `appointments`, `calendar-events` and
  `institutions` all carry an `institution_id` already, so they scope with a
  WHERE clause rather than a membership lookup. `/api/admin/institutions`
  should return one row for a partner.
- `template-routes.ts` is methodology-adjacent, not student data. The likely
  right answer is `isPlatformAdmin` for the editor and `test-send` — a partner
  being able to trigger sends is a separate problem — while `message-events` is
  per-student and needs scoping.

## Contract checks

- **15** — no route file may import a guard under an alias. Five files opened
  with `import { isPlatformAdmin as isAdmin }`, so 28 correctly-locked routes
  read exactly like open ones to every reviewer and every grep. Now renamed.
- **16** — the scoped routes above still resolve a scope, and the five exports
  stay `isPlatformAdmin`.

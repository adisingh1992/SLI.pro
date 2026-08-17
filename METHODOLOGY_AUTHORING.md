# Authoring Wing Heuristics

For the methodology owner. This describes how to write the heuristic cards Wing
executes, and how they reach students.

Nothing here requires a deploy. The engine ships once; the methodology changes
by writing records. That is the point — "code the engine, not the heuristics."

---

## 1. What a heuristic is

A heuristic is one coaching pattern: a thing Wing should notice, and what it
should do when it notices. Each is a card of **seven components**, stored as
separate rows so each can be revised independently with its own version
history.

| Component | Answers | Used by the engine |
|---|---|---|
| `signal` | What does this pattern look like in a student's words? | **Yes** — matched against every student turn |
| `intervention` | What should Wing do about it? | **Yes** — given to Wing as guidance |
| `coaching_move` | How should it be delivered? | **Yes** — given to Wing as guidance |
| `outcome` | What does success look like? | **Yes** — used to score whether it worked |
| `module_mapping` | Where in the arc does it apply? | Not yet |
| `population_context` | Who does it apply to? | Not yet |
| `notes` | Anything else | No |

The first four do real work. A card with a vague `signal` will fire at the
wrong moments; a card with no `outcome` can never be scored, so it will never
accumulate the evidence to be validated.

### Writing a good `signal`

The signal is matched by a small language model against one turn at a time. It
should describe **observable behaviour in the student's words**, not an
inference about their psychology.

> **Good:** "Student names four or more distinct target roles without an
> ordering or a stated basis for choosing between them."
>
> **Poor:** "Student is avoiding commitment." — not observable, and it will
> fire on almost anything.

Be specific about quantity and form where you can. "Four or more" is
checkable; "several" is not.

### Writing a good `outcome`

The outcome is compared against what the student said in the turns *after* the
intervention. Describe what you would see, not how you would feel about it.

> **Good:** "Student names one role and articulates the tradeoff they feel in
> choosing it."
>
> **Poor:** "Student gains clarity."

---

## 2. Lifecycle

```
candidate ──promote──> validated ──retire──> retired
    └──────────────────retire──────────────────┘
```

- **candidate** — newly authored. **Candidates fire at students** if they are
  in an active sequence. Putting a card in a sequence is the authorisation;
  status records how much evidence stands behind it.
- **validated** — has evidence behind it. Promotion is a deliberate act, made
  by looking at the performance endpoint.
- **retired** — stops firing **immediately and everywhere**, regardless of
  which sequences still list it. Retiring is the emergency brake.

Cards are never deleted. A retired card stays so that past applications remain
interpretable.

---

## 3. Sequences: what a student actually gets

A student is governed by an ordered, weighted **sequence** of cards. Resolution
order:

1. the student's **personal sequence**, if they have graduated; otherwise
2. their **school cycle's** active sequence.

If neither exists, no heuristics fire and Wing coaches normally. That is a safe
state, not an error.

Direct (B2C) students belong to a synthetic **"SLI.pro Direct"** institution
with an annual cycle, so they get the same governance as a school cohort. They
remain `origin = 'direct'` and have no `institution_id`, so institutional
reporting is unaffected — **filter reports on `origin`, never on "has an
institution".**

### The library is not the sequence

This is the most important operational rule here.

You may have **hundreds** of cards. That is good — it is the methodology
written down. But a **sequence** should hold roughly **10–15**.

The reason is mechanical. The engine builds its detector prompt by
concatenating the signal definition of *every card in the active sequence*, and
runs it on **every student turn**:

| Sequence size | Added per turn |
|---|---|
| 10 cards | ~360 tokens |
| 25 cards | ~1,000 tokens |
| 91 cards | ~4,500 tokens |

Cost is the smaller problem. The real one is discrimination: a small model
asked to choose among ninety near-neighbour signals matches far less reliably
than one choosing among a dozen — and every false match writes a heuristic
application that **pollutes the very evidence you use to decide which cards
work**.

The API warns above 15 and refuses above 40.

So: keep everything in the library, and select deliberately into the sequence.
Cards not in any sequence are completely inert — they cost nothing and reach
nobody.

### The evaluation window

Methodology changes belong **between** cohorts, not during them. Republishing a
cycle's sequence outside its evaluation window is refused with `409`.

This is not bureaucracy: changing the active sequence mid-cycle changes the
methodology under students who are partway through it, and makes
cohort-to-cohort comparison meaningless.

If a card is doing harm right now, **retire the card** — that takes effect
immediately and is not gated. The sequence override (`force: true` plus a
written reason, which is logged) exists for genuine emergencies only.

---

## 4. The API

All routes are admin-only.

### Cards

```http
GET    /api/admin/heuristics?includeRetired=false
GET    /api/admin/heuristics/:id            # includes full version history
POST   /api/admin/heuristics
PUT    /api/admin/heuristics/:id/components/:componentType
PATCH  /api/admin/heuristics/:id/status
GET    /api/admin/heuristics/:id/performance
GET    /api/admin/heuristic-component-types
```

Create a card:

```json
POST /api/admin/heuristics
{
  "name": "H-031 Premature narrowing",
  "description": "Student commits to one role before testing whether it fits.",
  "populationTags": ["early_career"],
  "components": [
    { "componentType": "signal",       "content": "Student names a single target role in the first two turns and declines to consider alternatives when asked." },
    { "componentType": "intervention", "content": "Ask what they would need to learn to be wrong about it." },
    { "componentType": "coaching_move","content": "Curious, not challenging. The goal is to widen the frame once, not to argue." },
    { "componentType": "outcome",      "content": "Student names at least one thing that would change their mind." }
  ]
}
```

Revise a component — this **creates a new version**; the old one is retained:

```json
PUT /api/admin/heuristics/31/components/intervention
{ "content": "Ask what evidence would change their mind, then wait." }
```

### Sequences

```http
GET  /api/admin/cycles
GET  /api/admin/cycles/:id/sequence
GET  /api/admin/cycles/:id/sequence/history
GET  /api/admin/sequences/:id/cards
PUT  /api/admin/cycles/:id/sequence
PUT  /api/admin/cycles/:id/active-sequence
```

Publish a new sequence — order matters, weight breaks ties:

```json
PUT /api/admin/cycles/1/sequence
{
  "entries": [
    { "heuristicId": 14, "weight": 1.0 },
    { "heuristicId": 21, "weight": 1.5 }
  ]
}
```

### Publishing a sequence that already exists

`PUT .../sequence` composes: it takes entries, writes a new version, points the
cycle at it. `wing:build-sequences` writes a sequence WITHOUT pointing at it, on
purpose, so a build can be reviewed before it reaches anyone — and publishing that
build through the compose path would produce a duplicate differing from the
reviewed version only by id.

So there is a second route that moves the pointer and nothing else:

```json
PUT /api/admin/cycles/1/active-sequence
{ "sequenceId": 42 }
```

It refuses a sequence owned by another cycle, one with no entries, and one whose
every card is retired. It carries the same evaluation-window gate and the same
`force` + `reason` override. It is also the rollback: point at the previous
version and the cohort is back where it was, in one write.

Two differences from the compose route worth knowing:

- **The empty-sequence refusal.** A cycle can point at a sequence with no entries
  — one did, because `wing:reset-cards` deletes every sequence entry and leaves
  the pointer alone. The engine then resolves a sequence, finds nothing in it, and
  coaches with no methodology while every screen reports a published cycle. This
  route will not create that state.
- **The size limit counts coaching cards, not entries.** `SEQUENCE_HARD_LIMIT` was
  measured when every entry's signal went into the detector prompt on every turn.
  It no longer does: the detector asks for `kinds: ["coaching_card"]` and narrows
  by session and population, gates compile on a separate path, and exercises never
  reach the detector. A 53-card sequence puts 22 cards in front of the detector and
  fewer than that in any one session. The compose route still counts entries,
  correctly — it receives a bare list whose kinds it cannot know.

---

## 5. Reading performance

`GET /api/admin/heuristics/:id/performance` returns:

- `studentsScored`, `totalSessionsApplied` — how much evidence exists
- `meanComposite` — the headline number
- `recentOutcomes` — the distribution behind it

**Composite score weights:**

| Outcome | Weight |
|---|---|
| `breakthrough` | +2 |
| `positive` | +1 |
| `neutral` | 0 |
| `correction` | −0.5 |
| `regression` | −1 |

Divided by **distinct sessions**, not by number of firings, so a card that
fires repeatedly in one conversation does not thereby out-score an effective
one.

### Why `correction` is only −0.5

A `human_correction` is the student pushing back on Wing's framing — *"that's
not quite it, I'm also…"*. It is the **highest-value turn type in the whole
corpus**, because it is the student redesigning the output to fit a complexity
the default missed.

It is simultaneously a **poor result for the card**, whose framing did not fit.
So it counts mildly against the card while the turn itself stays prized.

Scoring corrections as failures would push the methodology toward cards that
are too bland to provoke disagreement. If a card attracts many corrections,
that usually means its framing is too narrow — not that the pattern is wrong.

---

## 6. Current state — read this

The database currently contains **two scaffolding cards**, `H-014 Role sprawl`
and `H-021 Dual-domain credibility`. They were written by the engineering side
from the worked example in spec §5, purely to exercise the engine end to end.

**They are not reviewed methodology.** They are marked `candidate` and each
carries a `notes` component saying so.

Because sequence membership is the gate, **they will fire at any student in the
Direct cycle**. Until real cards exist, either keep the engine to stage only,
or treat replacing them as the priority.

When you author the real versions, **retire the scaffolding cards rather than
editing them**. Editing would leave a version history implying reviewed
methodology evolved from placeholder text, which is not what happened.

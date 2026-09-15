# server/harness — the persona test harness

**Additive by construction.** Aditya's constraint: the harness must not change
platform behaviour. What that means concretely, and how each part is held:

| Rule | How it is held |
|---|---|
| No writes to platform tables | `harness-boundary.test.ts` fails on `db.insert/update/delete` anywhere in this directory |
| Never invokes the turn path | same test fails on `evaluateTurn`, `detectSignal`, `loadTurnGates`, `compileTurnGates` |
| No edits to platform files | this module's first commit adds files here plus two `package.json` script entries; nothing existing is changed |
| Never disagrees with the engine | the funnel imports `cardAppliesTo` and calls `getSequenceCards` / `populationTagsForStudent` rather than re-implementing or re-querying |

## What is here

- `selection-trace.ts` — pure. Reproduces the pre-detector funnel for one turn:
  which cards were in the sequence, which left at `card_kind`, `session_scope`,
  `population_tag` or `no_signal_component`, which reached the detector, which
  won. Also `classifyUnfired`, the three-way unfired-card split.
- `trace-store.ts` — reads only. Assembles a whole session's trace from
  `sessions`, `transcripts`, `transcript_turns`,
  `user_heuristic_applications` and `gate_audit_findings`.
- `trace-report.ts` — `npm run harness:trace -- <sessionId> [--json] [--unfired]`.
- tests for both, run by `npm test`.

## What the platform does not record

Named on every trace in `unavailable`, so an absence is never read as a
finding. All three are facts about the current build, checked in code:

1. **Per-candidate match scores do not exist.** `detectSignal` is a single
   Nano-tier model call over the whole catalogue returning
   `{"heuristicId", "confidence", "rationale"}` — one winner, one confidence,
   one sentence. Sam's Interface 4 asks for "what match scores were assigned"
   per card; there is no such thing to log. Producing it means changing the
   detector prompt to score every candidate, which is a methodology, latency
   and cost change to the live turn path.
2. **Why nothing fired is not persisted.** `detectSignal` returns `null` for
   `no_match`, `low_confidence` (below `MIN_CONFIDENCE` 0.6),
   `unknown_heuristic`, `malformed` and any thrown failure alike, and writes
   nothing. A turn with no application row is "nothing fired, reason not
   recorded". Recovering the reason needs a hook inside the engine — the one
   place the harness cannot stay additive, and it is deliberately not taken
   here.
3. **Gates that held are not logged.** `gate_audit_findings` records breaches
   only.

## What it does record, which is most of it

The winner, its confidence and the detector's own rationale are already
persisted: `evaluateTurn` writes `"confidence 0.83: <rationale>"` into
`user_heuristic_applications.notes` against the triggering `turn_id`, with the
component version actually used. So a turn where a card fired traces
completely; only silent turns are thin, and thin in one field.

## Two honesty flags on every reconstruction

- `sequenceSource` — `application_log` when the session's own rows name the
  sequence, `current_pointer` when there are no rows and today's cycle pointer
  had to be used instead. The pointer may have moved since.
- `populationTagsAsOf: "now"` — tags derive at read time from
  `users.professional_status` and `intake_records.pathway`, neither versioned.

Neither bites on a harness run, which records its own sequence version and
whose personas do not change status mid-run. Both matter when this is pointed
at a real student's past session, which it also supports.

## Not built yet

See `claude/TEST_HARNESS_PLAN_SEP9.md` in the project for the phased plan.
Nothing below has been started, and two items are blocking:

- **`is_test_user` write path and enforcement** (P0.1) — the column exists,
  nothing sets it, and it is not checked in the scoring, classifier, reveal or
  embedding paths. This is not additive work and must land before any
  synthetic traffic runs.
- The sandbox cycle, the seeder, checkpoints, the runner, the persona
  simulator, the harness-side marker counters, the export and the admin UI.

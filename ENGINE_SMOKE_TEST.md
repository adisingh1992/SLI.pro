# Engine smoke test

Confirms the full real-time loop works end to end on stage:

```
turn captured → signal detected → intervention applied → application logged
             → turn classified → session scored
```

Everything below is verification only. Nothing here modifies methodology.

---

## 0. Prerequisites

- Cards imported (`npm run wing:extract-heuristics -- --from-json`)
- You can reach the stage database (P2S VPN up)
- You can log in to stage as an admin

---

## 1. Publish a small sequence

In `/admin/sequences`, choose the **SLI.pro Direct** cycle and publish **3–5
cards** — no more. A small sequence makes the test legible: if something fires
you will know which card and why.

Pick cards whose signal is easy to trigger deliberately. Good choices from the
extracted set:

- **Multi-Function Hedging** — trigger by naming three functions at once
- **Aspirational Evidence** — trigger with "I want to be…" / "I'd be good at…"
- **Credentials as Credibility** — trigger with "my credentials speak for themselves"

Retire the two scaffolding cards (`H-014 Role sprawl`, `H-021 Dual-domain
credibility`) while you are here — the extracted equivalents are better and in
Danielle's own language.

> The evaluation window for the Direct cycle is December, so publishing now
> will return **409**. That is the gate working. Use the override with a reason
> like "initial engine verification, no live students" — it is logged.

---

## 2. Run a session

Start Foundation Session 1 on stage and say something that should trigger a
card, e.g.:

> "I've done a bit of everything really — finance, operations, some marketing.
> I'd be good at a COO role I think."

Then say something ordinary that should trigger nothing:

> "I studied economics and joined a graduate scheme after university."

Watch the container logs for `[engine]` lines. **No `[engine]` line at all is
itself a result** — it means either no card matched or the sequence did not
resolve, and step 4 tells you which.

Finish or end the session early, so classification and scoring run.

---

## 3. What should have happened

| Step | Where it lands |
|---|---|
| Signal detected | `wing.user_heuristic_applications` gets a row |
| Turn stamped | `transcript_turns.signal_detected = true`, `active_heuristic_id` set |
| Turn classified | `classification_status: provisional → classified` |
| Session scored | `user_heuristic_scores` gets a row, applications get `outcome_signal` |

---

## 4. Verification queries

**Did anything fire?**

```sql
select a.id, h.name, a.notes, a.outcome_signal, a.applied_at
from wing.user_heuristic_applications a
join wing.heuristics h on h.id = a.heuristic_id
order by a.applied_at desc
limit 20;
```

`notes` carries the detector's confidence and rationale — read it. A fired card
with an unconvincing rationale is worse news than nothing firing, because it
means the signal definition is too loose.

**Did the sequence resolve at all?** (run this first if nothing fired)

```sql
select s.id            as student_id,
       s.cycle_id,
       c.active_heuristic_sequence_id,
       count(e.id)     as cards_in_sequence
from wing.students s
left join wing.school_cycles c on c.id = s.cycle_id
left join wing.heuristic_sequence_entries e
       on e.sequence_id = c.active_heuristic_sequence_id
where s.id = <your student id>
group by s.id, s.cycle_id, c.active_heuristic_sequence_id;
```

A NULL `active_heuristic_sequence_id` or `cards_in_sequence = 0` means the
engine correctly did nothing — there was no methodology to apply.

**Were turns classified?**

```sql
select turn_type, provenance_tag, classification_status, classified_by,
       count(*)
from wing.transcript_turns
group by 1,2,3,4
order by 1;
```

Expect `classification_status = 'classified'` and `classified_by = 'nano'` on
human turns after the session ends. Anything still `provisional` after a
completed session means classification did not run — check the logs for
`[classifier]`.

**Did scoring run?**

```sql
select sc.*, h.name
from wing.user_heuristic_scores sc
join wing.heuristics h on h.id = sc.heuristic_id;
```

**Turn-level detail for one session:**

```sql
select t.sequence_position, t.turn_type, t.provenance_tag,
       t.signal_detected, h.name as active_heuristic,
       left(t.content, 80) as content
from wing.transcript_turns t
join wing.transcripts tr on tr.id = t.transcript_id
left join wing.heuristics h on h.id = t.active_heuristic_id
where tr.session_id = <session id>
order by t.sequence_position;
```

---

## 5. Known-good failure modes

These are the engine behaving correctly, not bugs:

| Symptom | Meaning |
|---|---|
| No applications, no `[engine]` logs | No sequence resolved, or nothing matched. Both are safe states. |
| `[engine] signal detection rejected (unknown_heuristic)` | The detector named a card outside the sequence and it was discarded rather than coerced. Working as intended. |
| Turns stay `provisional` on an abandoned session | Classification runs on completion. `npm run wing:classify-backlog` sweeps these. |
| `outcome_signal = 'neutral'` everywhere | Likely correct for a short test session — `breakthrough` is deliberately hard to earn. |

## 6. Actual bugs

| Symptom | Likely cause |
|---|---|
| A card fires on obviously unrelated turns | Signal definition too loose. Edit it — that is what the authoring UI is for. |
| Session errors or hangs on send | The engine is meant to degrade to normal conversation. This would be a real defect — capture the `[engine]` stack. |
| Applications logged but `user_heuristic_scores` stays empty | `cycle_id` is NULL on the application. Check the student has a cycle. |
| Turn retyped `human_correction` but the next AI turn is still `ai_prompt` | The one-hop retro-update failed. Check `[classifier]` logs. |

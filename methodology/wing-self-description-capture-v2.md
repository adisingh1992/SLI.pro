# Wing Self-Description Capture Requirement
**Date:** August 19, 2026
**Priority:** Start now, regardless of intake build order
**Owner:** Aditya (storage design is your call)

---

## What to capture

Every time a user describes themselves during intake, store it. Six capture points exist in the current intake flow.

## Five fields per capture

| Field | Type | Description |
|---|---|---|
| timestamp | datetime | When the response was given |
| source_module | string | "intake" for now; other modules will feed this later |
| source_question | string | Which question produced it (Q2, Q5, Q5.5, Q6, Q7, or reveal_reaction) |
| verbatim_text | text | The user's exact words, unmodified |
| provenance | enum | `spontaneous` (user volunteered without being asked), `elicited` (Wing asked a specific question), or `coached` (response came after Wing's coaching — not applicable during intake, but the field needs to exist for downstream use) |

## The six intake capture points

| # | Source | Provenance | What it captures |
|---|---|---|---|
| 1 | Q2 (current situation) | spontaneous | How they describe their career situation unprompted |
| 2 | Q5 (party question) | elicited | Self-presentation instinct — how they introduce themselves |
| 3 | Q5.5 (topic signal) | elicited | Their primary topic area |
| 4 | Q6 (hidden strength) | elicited | Capability their resume doesn't show |
| 5 | Q7 (perception gap) | elicited | What they'd change about how they're perceived |
| 6 | Q9 (reveal reaction) | elicited | Their response to Wing's observation |

## Why this matters

Intake is the only time Wing ever sees a user describe themselves before Wing has taught them any language for it. Every self-description after Foundation 1 is shaped by coaching. That makes intake the uncoached reference point everything downstream gets measured against — and it cannot be reconstructed after the fact.

A downstream feature (the Reveal Cycle's readiness mechanism) reads this history to detect self-view stability: whether the user's self-description is converging, diverging, or rehearsed. That feature doesn't need building now. The capture does, because retroactive capture is impossible.

## What NOT to capture here

Wing's own output. These records are the user's words only. Wing's responses are in the conversation transcript. Storing Wing's coaching language in the same table as the user's self-descriptions would contaminate the baseline.

---

*Wing Self-Description Capture v2 · August 19, 2026 · Confidential*
*Methodology author: Danielle Carattini · dcara@sli.pro*

# The analysis prompt states completion criteria twice — and they disagree

Found 2026-08-04 while preparing to expose analysis methodology sections in the
admin UI.

## What is wrong

Every foundation analysis prompt ends with a database-backed block:

```
Keep the isComplete flow EXACTLY as follows (all must be satisfied):
${completionCriteria ?? `…built-in fallback…`}
```

That is the one the admin editor writes to, the one replay tests, and the one
`session_completion_criteria` owns.

But **five of the nine sessions also carry a `5) Completion Criteria` section
inside the methodology block**, higher up in the same prompt. That section is
plain text in the prompt file. Nothing reads it from the database, the editor
cannot change it, and replay does not exercise it.

So the model is handed two lists of completion criteria in one prompt. Where
they differ, which one wins is left to the model.

## Why it matters now

The completion-criteria work was justified on exactly this ground — the
conversation prompt and the analysis prompt had drifted, so a session could
satisfy everything it was told to do and still be judged incomplete. That fix
addressed drift *between* the two prompts. This is the same failure *within*
the analysis prompt, and it survived the fix.

Concretely: Danielle can now open the editor, change the criteria, replay them
against real sessions, publish, and be satisfied — while the methodology
section keeps telling the model something else.

## The five disagreements

Legend: **M** = methodology section (not editable), **D** = database-backed
block (editable).

### mid-career / Session 2 — M has 4, D has 6

D requires things M never mentions:

- `3-4 quantified credibility claims are locked (MC standard)` — M states no
  claim count at all.
- `Credibility tier 1 or 2 evidence has been established` — M says "Tier 1 or
  Tier 2 evidence", consistent, but M adds no count.

### mid-career / Session 3 — M has 5, D has 8

The largest gap. D requires, and M is silent on:

- `2-3 investor-grade stories are locked (MC standard), each with all five elements`
- `70/20/10 content direction is extractable`
- `C-suite trajectory is identifiable`
- `Quantified outcomes are present in each story`

M asks instead for "Vulnerability and growth are demonstrated" and "Content
angles and brand positioning are extractable" — looser, and not obviously the
same bar.

### undergraduate / Session 2 — M has 3, D has 5

D includes `The conversation establishes that a recruiter would have reason to
engage with the student`. **This is one of the two open Finding 2 items already
sent to Danielle** — so the criterion under review appears in one list and not
the other.

D also requires `Each claim references something the student actually did (not
aspirations)`, which M omits.

M bounds claims at "2–3"; D says "At least 2" with no upper bound.

### early-career / Session 2 — both have 4, wording differs

- M: `2–3 specific credibility claims within the locked function`
- D: `At least 2 specific credibility claims documented within the locked function`

A cap of three in one, no cap in the other.

### undergraduate / Session 3 — both have 5, wording differs materially

- M: `At least 2 stories that meet all four quality criteria` — the four are
  never enumerated in M.
- D: `At least 2 stories with specific context, personal agency, observable
  outcome, and …` — enumerated.
- M: `The session closes with a declarative statement (not a question)`
- D: `The session closes with a declarative statement covering all five
  required elements`

## Which is authoritative

The **D** block, on three grounds: it is what the prompt's own instruction
points at ("Keep the isComplete flow EXACTLY as follows"), it is what the
editor and replay operate on, and it is generally the superset — every
substantive M item appears to be covered by some D item, though that judgment
is Danielle's to confirm.

The one thing present in M and absent from D is the **upper bound** on claim
counts ("2–3" rather than "at least 2") for early-career and undergraduate
Session 2. If that cap is deliberate methodology, it needs to move into D
rather than be dropped.

## Resolved — all five M sections removed

Git history settles it for mid-career, and only for mid-career.

| commit | date | what |
|---|---|---|
| `6445c573` | 2026-02-25 | "Adapt foundation session prompts based on user's professional status" — created the population files, **both** lists |
| `6894d2c1` | 2026-02-26 | "Update prompts to better guide mid-career professionals" — rewrote the **D** block for mid-career S2 and S3, adding the MC-specific standards |

So for mid-career the Feb 26 refinement improved one list and left the other
untouched. **M is stale; D is the intended methodology.** Removing M is a clean
application of "keep the newer".

**For the other three it does not apply.** early-career S2, undergraduate S2
and undergraduate S3 have both lists from the *same commit on the same day* —
`9031d400` and `d9512a6b`, both 2026-02-25. Neither is newer; they were
inconsistent from birth.

They were removed anyway, on a different and weaker justification:

- the prompt's own instruction points at D — *"Keep the isComplete flow EXACTLY
  as follows (all must be satisfied)"* — whereas M is item 5 of a list
  introduced as *"Use this methodology"*;
- D is the database-backed one, so it is what the editor and replay operate on;
- D is substantively a superset.

That is an authority argument, not a recency one. Worth Danielle knowing the
difference.

### The one thing genuinely lost

M capped claim counts at **"2–3"** for early-career S2 and undergraduate S2. D
says "At least 2" with no upper bound. If that cap is deliberate methodology it
must move into D — it is not there now, and nothing else enforces it.

## Enhancement Modules — a different and worse problem

Modules A and B state their criteria once, in the `${completionCriteria ?? …}`
fallback. Fine.

**Module C is not fine, and the earlier seeding of it was wrong.**

Every population's Module C analysis prompt contains a hardcoded block:

```
COMPLETION CRITERIA — ALL MUST BE SATISFIED:
✅ Long-term backwards narrative articulated …
✅ Current positioning snapshot stated using Session 2 credibilityGaps …
✅ Target role/impact specified (2-5 year goal)
✅ Tier classification identified …
```

The seed extractor did not recognise the `✅` format, reported *"Module C:
analysis had NONE"*, and that was taken at face value. Three consequences:

1. **The Module C drafts in `session_completion_criteria` were seeded from the
   conversation prompt**, because the analysis was believed to have no criteria.
   They do not reflect what actually judges Module C.
2. **A second criteria block was added to Module C's analysis** during
   parameterisation. It renders empty while nothing is published — which is why
   behaviour looked unchanged — but publishing the drafts would hand Module C
   two lists, exactly the defect this document is about.
3. The seed script's warning — *"their analysis prompt never stated any
   criteria, so completion has been arbitrary"* — is false, and is printed on
   every run.

### Module C — resolved 2026-08-04

- Its real criteria block is now parameterised the same way A and B are, with
  `-` in place of `✅`.
- The redundant second block added during parameterisation is removed, so
  Module C states its criteria once.
- The three wrongly-sourced drafts were deleted and re-seeded: 10 / 11 / 10
  criteria for undergraduate / early-career / mid-career, all **published**.
  Module C moved draft → published, but the text the model sees is unchanged,
  because the published criteria are its own original list.
- The seed extractor now handles all three module formats — Module A's dash
  bullets, Module B's bullet-less paragraphs, and Module C's dash bullets with
  indented sub-bullets. The last needed a top-level-only split; a plain line
  split promoted "Experience gaps", "Functional gaps", "Scale gaps" and
  "Industry gaps" into four criteria instead of keeping them under their parent.
- The false warning is replaced. A DRAFT now means "no analysis criteria were
  extracted — check the prompt file before believing it", rather than asserting
  the module never had any.

All `✅` and `❌` are out of the prompt files. The two remaining in
`provenance.test.ts` are console pass/fail markers, not prompt text.

## Still open for Danielle

1. The **"2–3" cap** on claim counts, lost with the early-career S2 and
   undergraduate S2 methodology sections. The database says "at least 2" with
   no upper bound. If the cap is deliberate it has to move into the database.
2. Whether removing the three same-day methodology sections (early-career S2,
   undergraduate S2, undergraduate S3) lost anything she considers load-bearing
   — those were removed on an authority argument, not a recency one.

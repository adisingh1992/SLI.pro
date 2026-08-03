# Session completion criteria — audit

**For:** Danielle and Sam
**Why:** a mid-career Session 2 that was plainly finished would not auto-complete.
The cause was a mismatch between what the session is *told to achieve* and what
the analysis *checks for*. This audits all nine session/population pairs.

---

## How completion works today

Every session has its criteria written **twice**:

1. In the **conversation prompt** — `CRITICAL COMPLETION INSTRUCTION`, which tells
   Wing when it may close the session.
2. In the **analysis prompt** — `all must be satisfied to set isComplete=true`,
   which a separate model applies to the transcript afterwards.

The analysis has the final say. If the two lists disagree, Wing closes the
conversation and the session still doesn't complete — which is what the student
experiences as being stuck.

That's 18 copies of the methodology that must stay in sync by hand across
4,376 lines of prompt file. They have drifted.

---

## Finding 1 — the serious one: criteria that need a reply that never comes

**Five of the nine** analysis criteria sets require the student to say something
*after* Wing's closing message.

The completion check runs **immediately after Wing's message, before the student
replies** (`addAiTurn` → `checkSessionCompletion`, no user turn between). So on
the closing turn that criterion is necessarily false. The session can only
complete if the student sends *one more message* after the closing.

A good closing invites the student to leave. Many will. Those sessions stay open
indefinitely.

Affected:

| Prompt set | Session | Criterion |
|---|---|---|
| undergraduate | 1 | "coach delivered closing line **and student responded positively**" |
| undergraduate | 3 | "the student has **acknowledged the closing**" |
| early-career | 1 | "coach delivered closing line **and professional responded positively**" |
| early-career | 3 | "professional has **acknowledged the closing**" |
| mid-career | 1 | "coach provided final recommendations **and user responded positively**" |

Two others (undergraduate S2, early-career S2) require only *"coach has delivered
the closing line"* — that is visible in the transcript without a reply, so they
are **not** affected. Three more say the student *"acknowledged or agreed with
the identification"*, which can happen mid-conversation, so they are also fine.

**This is not a methodology problem — it's a timing problem**, and it needs a
decision:

- **(a)** Drop the "student responded" clause. Completion becomes Wing's closing
  plus the substantive criteria. Simplest, and arguably right: the student
  acknowledging is politeness, not evidence.
- **(b)** Re-run the completion check on the student's *next* turn as well, so the
  acknowledgement is seen. Keeps the criterion, costs an extra analysis call.
- **(c)** Treat an abandoned session after a valid closing as complete, via a
  sweep job.

I'd suggest (a) — but it is your methodology, so it is your call.

---

## Finding 2 — analysis demands the conversation never pursues

These are criteria the analysis checks that the conversation is never instructed
to achieve. The session can satisfy them only by luck.

| Prompt set | Session | Unreachable criterion | Severity |
|---|---|---|---|
| mid-career | **2** | "expresses clear opinions and decision frameworks" | **FIXED** — see below |
| undergraduate | 2 | "a recruiter would have reason to engage with this candidate" | Medium |
| early-career | 1 | "no unresolved industry/employer-brand substitutions remain" | Medium |

**Mid-career Session 2 is fixed** by *aligning the conversation up* rather than
weakening the check: the session now has a `DECISION FRAMEWORKS — REQUIRED
BEFORE CLOSE` block that probes for the principle behind the numbers ("what's
your rule for when to do A versus B?", "what do you believe about your function
that most people at your level get wrong?"), and both lists now hold the same
six criteria. The intent was preserved; the session was taught to earn it.

The other two need your judgement:

- **Undergraduate S2** — should the session actively test "would a recruiter
  engage?", or is that an outcome rather than a gate?
- **Early-career S1** — industry/employer-brand substitution is handled in the
  conversation body but is not in its completion list. Should it gate completion?

---

## Finding 3 — a contradiction inside one prompt

Mid-career Session 2's analysis prompt said, two paragraphs apart:

```
- isComplete: true ONLY if credibilityTier is 1 or 2 AND 3-4 quantified examples are locked
...
Keep the isComplete flow EXACTLY as follows (all must be satisfied):   [six conditions]
```

Two conditions in one place, six in the other. **Fixed** — the summary line now
points to the full list instead of restating a shorter one.

---

## Not a problem (checked and cleared)

- **mid-career S3** looked alarming at 5 conversation criteria vs 8 analysis
  criteria. It is fine: analysis A2–A5 are simply the five quality elements
  already required by conversation C1, listed individually. Counting criteria is
  misleading; only reading them works.
- **early-career S2** — the analysis requires a strict subset of the
  conversation. Safe by construction.
- **early-career S3** and **undergraduate S3** — aligned, with a minor wording
  drift ("declarative statement" vs "declarative statement covering all
  five/six required elements").

---

## Recommendation

Fixing these one at a time will not hold. The criteria are **methodology**, and
methodology belongs in the database as heuristic cards, not duplicated in two
places across three prompt files.

Suggested order:

1. **Decide Finding 1** — it affects five of nine sessions and is the most likely
   cause of stuck sessions in production.
2. **Decide the two open items in Finding 2.**
3. **Move completion criteria to a single definition** that both the conversation
   prompt and the analysis prompt render from. One source, no drift possible.
4. Longer term, completion criteria become card components, editable in the
   admin UI without a deploy — the same path the heuristics took.

Until step 3, any edit to a session's criteria must be made in **both** places or
it will produce exactly the failure that started this audit.

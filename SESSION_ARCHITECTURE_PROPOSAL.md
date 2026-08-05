# Designing sessions, modules and heuristics as one system

A first-principles proposal. Written 2026-08-05, after a week of extracting
methodology out of prompt files one regex at a time.

---

## 1. The diagnosis

Not opinion — every item below was hit directly while working on this codebase.

**Methodology lives in code, so it can only be changed by a deploy.** The real
work of the last few days has been extracting it back out: completion criteria,
then analysis methodology. Each extraction was a regex over a 22,000-character
template literal, and **four of those extractors were silently wrong** — one
because a heading was indented, one because criteria were written with ✅ marks,
two because parameterising a prompt broke the pattern that read it. Every
failure produced plausible output rather than an error. That is not carelessness
that better regexes would fix; it is what happens when structured data is stored
as prose.

**The same fact is stated in several places and drifts.** Completion criteria
appeared in the conversation prompt, the analysis prompt, *and again* inside the
analysis methodology block. Five of nine sessions had two disagreeing lists.
Module C had a criteria list nobody knew about. Fixing drift by hand is endless
because nothing structurally prevents the next copy.

**Population variants are copies, not overrides.** Three prompt files, ~22K
characters each, largely the same. Where they differ, nothing records whether
the difference is deliberate. Mid-career Session 2 requires "3–4 quantified
claims"; early-career says "at least 2"; undergraduate said "2–3" in one place
and "at least 2" in another. Some of that is real methodology. Some is
copy-paste decay. **From the code you cannot tell which.**

**Foundation and Enhancement are parallel implementations of one idea.**
Separate prompt directories, separate completion functions with different
signatures, separate analysis shapes. Every improvement gets built twice —
criteria, then criteria-for-modules; methodology, then the discovery that
modules have no methodology to expose. The seam produces work forever.

**Conversation changes cannot be tested.** Criteria and methodology are
replayable because the input is fixed. Change a conversation prompt and the
student's next turn changes, so there is no history to re-run. Today that means
the largest and most behaviour-critical artefact is the one with no safety net.

**The heuristics engine is the right shape and governs almost nothing.**
Versioned cards, sequences, applications, outcome scoring, retire-never-edit —
exactly right. But it decides *which intervention to apply*, while the 22K-char
prompt decides everything else. Two sources of methodology, one measurable, one
not, and they do not know about each other.

The through-line: **the system's most valuable asset — the methodology — is its
least structured artefact.**

---

## 2. The core idea

> A session is an ordered set of **objectives**. The prompt is *generated* from
> the current objective, not written by hand.

Everything else follows. Nobody edits a 22,000-character string, because no such
string exists — it is assembled per turn from parts that are individually
small, individually versioned, and individually measurable.

---

## 3. The model

### 3.1 Objective — the atomic unit

The beat a session is currently trying to achieve.

```
Objective
  id                     functional_identity.lock_primary
  intent                 One sentence, addressed to Wing
  entry_condition        when this becomes live
  evidence_required      what must appear in the transcript to satisfy it
  artifact_contribution  which fields of the session artifact it produces
  interventions[]        heuristic cards eligible while this is live
  population_overrides{} per-population deltas — evidence bar, examples, voice
```

Today's sprawling sections map onto these cleanly. "SPECIFICITY ESCALATION
LADDER" is not a topic — it is the intervention set for *elicit a concrete
claim*. "ANTI-GENERALIST ENFORCEMENT" is the intervention set for *resist
80/20 evasion*. Module A's "12 steps the coaching framework covers" is already
a literal objective list, written as prose because there was nowhere else to
put it.

### 3.2 Population variation as overlay, not copy

One canonical objective set. Per-population overrides declare only what differs:

```
lock_primary:
  evidence_required:
    default:       a mechanism of value creation, named and owned
    undergraduate: a mechanism, from coursework/projects/clubs — employment not required
    mid_career:    a mechanism with a quantified outcome, owned not assisted
```

Three near-identical 22K files become one spine plus three thin deltas. Every
difference found today becomes either **an explicit, reviewable override** or
**a bug that disappears**. And "why is mid-career stricter here?" acquires an
answer, in a field, rather than being lost in prose.

### 3.3 The prompt is a render target

Assembled per turn:

```
  identity + voice          (per population, small, stable)
+ session frame             (where we are, what has been established)
+ CURRENT OBJECTIVE         (intent, evidence sought)
+ eligible interventions    (from the heuristics engine — already exists)
+ student context           (profile, prior sessions, artifacts)
+ completion criteria       (from the DB — already exists)
```

This kills an entire bug class by construction. There is no prose to duplicate
criteria into. There is no interpolation for an editor to delete — the
criteria block is *assembled*, not typed. The `CRITICAL COMPLETION INSTRUCTION`
hazard I found today, where editing a section could silently drop
`${ctx.completionCriteria}`, cannot be expressed.

It also likely improves quality. A model given one clear objective plus five
relevant interventions outperforms the same model given forty rules covering
every eventuality, most irrelevant to this turn.

### 3.4 Completion as evidence, not prose judgement

Today: hand the model a checklist and a transcript and ask for a verdict.
That is one large judgement, and when it is wrong the only lever is rewording
the checklist.

Instead, each objective declares its own evidence test. Extraction runs
per objective. Session completion is the conjunction. This buys:

- **Locality.** "Session 2 is not completing" becomes "objective
  `credibility.quantify_claim` satisfies at 31%" — a specific, fixable fact.
- **Testability.** Per-objective extraction can be unit-tested against the
  tagged corpus. Whole-session judgement cannot.
- **Partial credit.** Progress is visible mid-session, to Wing and the student,
  instead of a binary flip at the end.

The mid-career Session 2 stall we chased earlier would have surfaced as one
objective's satisfaction rate, not as a student stuck with no explanation.

### 3.5 Foundation and Enhancement become one machine

Different objective sets over one engine. One session type, one completion
path, one analysis shape, one editor. The seam that generates duplicated work
forever is removed rather than bridged.

### 3.6 The heuristics engine becomes central

It already models cards, sequences, applications and outcome scoring. Give it
objectives to attach to and it governs the whole conversation rather than a
slice — and every intervention gains a denominator: *applied while pursuing
objective X, and X was subsequently satisfied.* That is a far stronger signal
than "applied in a session that later completed".

---

## 4. What this makes possible

**Conversation changes become testable** — not by simulating students, but by
making the unit of change small enough to measure in production. Change one
objective's interventions, watch that objective's satisfaction rate against the
previous cohort. That is a real experiment, unlike replaying a fictional
student.

**Danielle edits meaning, not text.** "Mid-career needs a quantified outcome
here" is a field. Today it is a sentence in a template literal that must also
be kept consistent with three other sentences elsewhere.

**The corpus gains structure.** Turns already carry provenance and turn type.
Add the objective in play and the behavioural asset becomes queryable in the
way the product actually cares about: which interventions move which objectives,
for whom.

**The audits stop.** No drift audit, no duplicate-criteria audit, no extractor.
Those exist only because the methodology is prose.

---

## 5. Where I would be careful

**Do not let the state machine drive the conversation.** Objectives should
*track*, not *force*. Good coaching moves opportunistically — a student answers
objective 4 while being asked about objective 2. Wing must be able to accept
that, mark it satisfied and move on. If the model is required to march in
order, this design produces something worse than today's prompts, and the
failure will look like rigidity and lost rapport.

**Objectives must not be too small.** Decomposed too far, each turn sees a
keyhole and the coach loses the holistic read that makes the sessions good. My
instinct is 5–9 objectives per session, not 30 — roughly one per meaningful
beat.

**Some prose is load-bearing.** Voice, stance and worked examples do not
decompose into fields and should not be forced to. Keep an identity/voice block
as prose, per population, deliberately small.

**Evidence tests are the hard part.** "A mechanism of value creation, named and
owned" still requires model judgement. The gain is not eliminating judgement, it
is making each judgement small, isolated and independently measurable.

**A migration that stalls halfway is worse than either end state.** Running the
old prompt files beside a new objective engine reintroduces exactly the
two-sources-of-truth problem this is meant to end.

---

## 6. How you would get there from here

Not a rewrite. The pieces already exist, mostly built this past week.

1. **Model one session end to end** — Foundation Session 1, mid-career only.
   Derive objectives from the existing prompt, render the prompt from them, run
   it beside the current one on a handful of real sessions and compare
   transcripts.
2. **Move completion to per-objective evidence** for that session. Criteria and
   replay already exist; this narrows their unit.
3. **Attach heuristic cards to objectives.** Sequences already gate cards —
   they gate on objectives instead.
4. **Add the second population as an overlay**, not a copy. This is where the
   design proves itself: if mid-career and early-career Session 1 cannot be
   expressed as one spine plus a delta, the model is wrong and better to learn
   it at session one than at session nine.
5. **Then the rest**, including modules — which by then are just another
   objective set.

Steps 1–4 are the experiment. If overlays do not hold, stop and rethink; very
little is lost.

---

## 7. The honest summary

The current architecture is a reasonable MVP that succeeded — 255 real users,
real coaching data. What it cannot do is *improve safely*, because its
methodology is prose scattered across 60,000 characters of TypeScript, and every
attempt to reach in and change one thing risks silently changing another. This
past week is evidence: the work was almost entirely archaeology, and four
separate attempts to read those files were wrong in ways that looked like
success.

The proposal is not more structure for its own sake. It is putting the
methodology somewhere it can be **read, changed, measured and learned from** —
which is what the heuristics engine already does correctly for the small slice
it governs. Extending that model to the whole conversation is the change.

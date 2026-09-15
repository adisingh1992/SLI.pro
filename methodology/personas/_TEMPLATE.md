---
# ─── Required. The seeder refuses a spec missing any of the four. ───────────

# A stable slug: lower-case letters, digits, hyphens. This is what a finding
# cites, so it should not change once a persona has been run. It is also the
# seeder's idempotency key, and it becomes the account's address:
#   persona+<id>@sli-harness.invalid
id: replace-me

# The display name. Used for first/last name on the account and nothing else.
name: Replace Me

# ─── The two fields that decide which cards can fire ───────────────────────
#
# These are not bookkeeping and they cannot be defaulted. Audience tags are not
# stored anywhere: they are derived at read time from these two, and the engine
# filters the card catalogue on them BEFORE the detector runs. A persona seeded
# without them resolves to no tags, every audience-specific card is filtered
# out, and the Unfired Cards report will show all of them as dead weight —
# a wrong methodology finding delivered with full confidence.
#
# professional_status — exactly one of:
#   undergraduate_or_recent_grad
#   early_career
#   mid_career_or_senior
#   career_break_or_transition
professional_status: early_career

# pathway — exactly one of:
#   employment    a job
#   venture       founding something
#   freelance     independent / contract
#
# `venture` is what resolves the entrepreneur tags, including the three funding
# stages. Without it no entrepreneur card can fire at all.
pathway: employment

# ─── Optional ──────────────────────────────────────────────────────────────
#
# The behaviours this persona is written to exhibit, in your own words. The
# harness uses them as ground truth: it counts what it can count
# deterministically over the transcript and reports where the persona clearly
# exhibited something and no card fired.
#
# Deterministic today: hedges and softeners, modal verbs by class, first-person
# vs collective vs depersonalised pronoun ratios, causal connectives,
# self-correction and repair tokens.
#
# NOT deterministic, and the harness will say "not measured" rather than
# approximate: sustain-talk vs change-talk, episodic specificity vs
# generalisation, hedging asymmetry, reactance. Those are classifications, not
# phrase counts. Declare them anyway if they are part of the persona — they are
# just not machine-checked yet.
#
# A blank list item is refused rather than dropped: a typo here would otherwise
# become a ground-truth claim.
expected_markers:
  - describe a behaviour, e.g. minimises accomplishments with "just"
  - one per line
---

Everything below the closing --- is the persona's simulation prompt, and it is
injected **verbatim**. Nothing reads it, summarises it or reformats it — a
parser that edited a persona would be changing the experiment.

Write it as instructions to the model that will play this student. What belongs
here, per Sam's Interface 3:

- Background and backstory.
- The interaction policies — how they answer when they do not want to.
- Hedging rules, and any profanity or register rules.
- Response length. The contract is 30–150 words.
- Stay in character; no meta-feedback about the coaching or the platform.

Two things NOT to put here, because the harness supplies them and a persona
that also asserts them can contradict itself mid-run:

- The conversation history. The runner passes the cumulative dialogue.
- Anything about being a test, a simulation or an AI. A persona that knows it
  is being tested behaves like one.

A note on fidelity, since it is an open question: Danielle has raised whether
an Azure-hosted model holds a spec of this size as reliably as the ones she
built in Claude projects. The harness measures adherence per run against the
machine-checkable rules above — length band, hedge counts, no meta-feedback —
so a persona that drifts out of character is flagged rather than silently
producing transcripts that get read as methodology evidence.

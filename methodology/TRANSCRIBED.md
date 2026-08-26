# Which files here are transcriptions rather than originals

Everything else in `methodology/` was committed byte-for-byte from the file Danielle sent,
verified by hash. That property is what makes the corpus usable as a source of record, and
what lets the parsers hash card bodies to detect a revision.

These files do not have it. They were reconstructed from the copies held in the claude.ai
project, because the originals were never committed. Structurally faithful, not
hash-identical. **Replace each one with the original when it is to hand, and delete its
entry here.**

## `wing-missing-references-aug24.md`

Her document of 24 August, answering the reference gaps raised on the 23rd. It holds the
only definitions we have of:

- IG-V03 through IG-V07
- IG-S03, IG-S04, IG-S05, IG-S06, IG-S08, IG-S10
- H-001, H-111, H-210, H-923
- The Reveal Cycle's exemption from the cross-module routing table

Why it had to go on disk: code written this week cites IG-S08 and IG-S03 as normative, and
the intake safety compile is built against IG-S06. Building against definitions that live
only in a project document means the corpus cannot answer what the rule actually says.

**One deliberate omission.** The footer of the original carries the author's email address.
It is not reproduced. Nothing else was left out or altered.

**Note on IG-S06.** Three versions of this gate now exist and only the newest governs:

1. This document — default-on for the undergraduate audience track, scope framed as no PII
   collection, no public-content encouragement, learning framing.
2. Compendium v3's card — scope framed as no Module 9, no Module 6, no trust-vault depth,
   with "err on the side of caution" as the failure path.
3. **Her email of 25 August, which supersedes both** — institution-configured rather than
   track-triggered. Berkeley sets it off. An explicit statement of being under 18 fires the
   full gate regardless of the institution setting.

The first two are kept as delivered. Anything implementing this gate reads the third.

## `../prompts/wing-approachable-microjournal-library.md`

Not in this directory, and deliberately so — see `prompts/README.md`. Same provenance
caveat: a transcription, structurally verified at 220 prompts with every id present exactly
once, not hash-identical.

## `../prompts/wing-heartbeat-and-population-prompts.md`

An extract, not a whole document: the prompt sections of `Wing_All_Prompts_Copy_Final.md`
only. The module messaging, transitions, dashboard and UX copy sections are not reproduced.

---

# Still missing, and not transcribable

These are cited as normative and are not on disk. They are too large to reconstruct by hand
without risking silent drift in the methodology corpus, which is a worse outcome than their
absence. **They need the original files.**

| Document | Why it matters |
|---|---|
| Master Module Compendium **v3** | Only v2 is on disk. v3 appends the Safety Architecture (the IG-S01 to IG-S06 cards), the cultural-competence gates IG-S09 and IG-S10, and the cross-module routing behavioural rules. The IG-S03 rule now in the safety compile was built from v3's card, read out of the project rather than from disk. |
| Voice/Tone Integrity Gates addendum | Cited as the source for IG-V01 to IG-V07. |
| Module 9 supplement and Module 9 card set | Referenced by H-923 and IG-S05. |
| UX Addendum, Comprehensive UX Recommendation | The source documents behind the prompt copy. |
| Integrity Gates Additions v2 | Cited by the gate numbering history. |
| Input Layer Specification §3 | The 80-prompt signal-category tagging that Gate 2's category-spread condition reads. Ordered retired by the Reveal Cycle's own front matter, which is its own problem. |

Reconstructing the compendium in particular would mean retyping several hundred kilobytes of
her cards. A transcription error in a card body is invisible — the parser would hash it,
accept it, and every downstream check would agree with the wrong text. Absence is loud;
silent drift is not.

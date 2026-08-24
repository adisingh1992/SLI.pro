# Intake — What Changed Since v1.1
**Date:** August 19, 2026
**Supersedes:** Wing_Intake_Heuristic_Cards_v1.1 (sent August 18)
**Current version:** Wing_Intake_Heuristic_Cards_v1.7
**Applies to:** Wing_Intake_Heuristic_Cards_v1.7, Wing_Intake_Data_Migration_v2

---

## Short version

The cards you received on August 18 are structurally the same — same card IDs, same 7-component format, same gate structure. What changed: one template retired, one template's defect fixed, copy corrections across the template set, and a cultural competence check added. Build from v1.7. Discard v1.1.

---

## Card count change: 42 → 41

**RT-14 (H-033, Clean Slate / Undergraduate) is retired.** Its only quoted element was a topic noun — not a phrase of the user's self-description. Substitute any undergraduate who names any topic and the observation still reads as true. It also contained an unsourced population claim ("most professionals I work with are trying to undo years of positioning that happened by accident") spoken to students at a university that paid for the platform.

Undergraduates route to cross-track templates (RT-03, RT-06, RT-08, RT-11). If none fires, IG-INT06 defers — which is the correct outcome. A weak reveal is worse than no reveal.

Template count: 15 → 14. Running total: 265 → 264.

---

## The functional defect (RT-09)

RT-09 (Gap Narrator, career returner) had a placeholder reading `[reference to any strength or experience mentioned in Q5/Q6]` — an instruction to paraphrase, wearing quotation marks. Every other template says `[exact words]`. Two gates (IG-INT10 and IG-INT12) would have rejected its output at runtime, so it wouldn't have produced a bad reveal — it would have produced silence, while sitting in the card set looking functional. Career returners would have quietly gotten generic templates and nobody would have noticed.

Fixed: COMPETENCE beat now requires `[Q5/Q6 exact words]`. GAP beat now quotes Q5 (the original version quoted Q2, then claimed the user volunteered the gap unprompted — but Q2 is the question that asks about their situation).

---

## Copy corrections across the template set

**10 antithesis constructions removed** — the "it's not X, it's Y" shape and its variants. LinkedIn names this pattern as a detection indicator for AI-written content, and the Voice Standard bans it. The more practical reason: a user who receives three reveals over their journey should not see the same sentence shape three times.

**8 population claims removed** — "most people," "in my experience, people who," "most professionals," "people at your stage." IG-RC13 prohibits unsourced frequency claims. These were in coaching_move text and delivery_adaptation notes.

**3 Q9 follow-ups reframed** — RT-07, RT-12, and RT-15 had closed-choice A/B questions where the research basis calls for open questions. Now open-first with scaffolding fallback if the user needs it.

**3 em-dash density reductions** in RT-07, RT-11, RT-12. Four or five long dashes in a single reveal reads as a pattern.

---

## Cultural competence check added (RT-06)

RT-06 (Underseller) previously listed "people tell me I'm good at" as minimizing language. Collective attribution ("my team says," "people tell me," "we built") is culturally normative communication in many contexts — not minimizing. Per IG-S09, Wing must never penalize culturally normative modesty as a gap.

RT-06 now fires only on self-deprecation (hedging, diminishing, qualifying one's own capability). Collective attribution is stored as a cultural signal, not treated as a deficiency.

---

## Gate prefix reconciliation

All 13 intake gates now use `IG-INT01` through `IG-INT13` consistently. Earlier versions had `IG-I01` in some places. `IG-INT` is canonical.

---

## Baseline specification

The Migration doc's summary table previously referenced B1–B4 on a 1–10 scale. Corrected in v2: B1–B3 on a 1–5 scale with conditional follow-ups, placed in Phase 3.5 (not Phase 4). The spec (v3.3, forthcoming) is canonical for baseline design.

---

## Known numbering collision — not introduced by intake, but you should know

The IG-U006–U008 renumbering you proposed on August 17 (for the Module 11 universal gates) was approved. The research-derived gates I sent on August 18 also use IG-U006–U008 for Barnum Falsifiability, Observation Precision, and Competence→Gap→Fixable. These are different gates with the same numbers.

For now: the research-derived gates (Barnum, Observation Precision, Competence→Gap→Fixable) take priority — they're universal. We'll resolve the Module 11 numbering in the next compendium update.

---

## Five fields per self-description capture

See the companion capture document. Six capture points during intake, five fields each. Start capturing now regardless of build order.

---

*Wing Intake Change Note · August 19, 2026 · Confidential*
*Methodology author: Danielle Carattini · dcara@sli.pro*

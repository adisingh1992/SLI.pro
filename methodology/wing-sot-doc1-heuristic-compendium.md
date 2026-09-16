# Document 1 — Wing Heuristic Compendium
## Platform 2.0 Source of Truth — August 26, 2026
## Complete and standalone. Document 2 is the authority for all numbering, gate specs, and decision history.

---

## CROSS-DOCUMENT INDEX

| Looking for... | It's in... |
|---------------|-----------|
| A specific card's full 7-component spec | **This document (Doc 1)** — module section for that card's prefix |
| Whether something is built, a decision Aditya raised, what's deferred | Doc 2 (Platform Architecture & Governance) — Sections 12, Appendices A–C |
| Numbering registry, prefix namespace, gate deployment tiers | Doc 2, Sections 2–4 |
| Content triggers, cadence, micro-journal, publishing, image generation | Doc 3 (Content & Engagement System) |
| Dashboard layout, navigation, UX gates, prototype decisions, typography | Doc 4 (UX & Interface Specifications) |
| Retired claims, frequency rules, voice standard, audit methodology | Doc 5 (Claims & Voice Discipline) |

---

## What This Document Is

The territory — every card Wing can play, organized by module, with provenance, delivery status, and known defects. This is what Wing says and does. Document 2 (Architecture) is the map; this is the ground.

**Card count:** 329 codeable elements across all modules and system events.
**Modules with full sections:** Intake, Reveal Cycle, Module 13, Exercise Library.
**Modules requiring extraction in continuation thread:** F1, F2, F3, M4, M5, M6, M7, M8, M9, M10, M11, Positioning Refresh.

**How to read the gaps:** Every [GAP:] marker names the source document, what needs extracting, and what post-compendium additions are known. The continuation thread produces these sections from the compendium with provenance, delivery annotations, and defect flags. Search "[GAP" to find all holes.

---

# MODULE: INTAKE

**Source:** v1.8 canonical (670 lines, Aug 19) + v3.3 design spec (633 lines, Aug 17/19)
**Lead traits:** ENCOURAGING + CURIOUS
**Card count:** 28 heuristic cards + 13 integrity gates = 41 active. 1 retired (H-033/RT-14).
**Delivery status:** v1.8 sent Aug 20. CONFIRMED BUILT by Aditya (Aug 24): intake rebuilt to nine questions, reveal selection across 14 templates, B1–B3 baselines with conditional follow-ups, identity reference frame detection (10 signals).

**Data available when H-010 fires:** Registration completes before the chatbot opens (Doc 4 Part 0). When Wing delivers its self-introduction, it already has: first name, last name, email, age, gender identity, race/ethnicity, and institution (from URL routing, e.g. berkeley.sli.pro). Wing can personalize from message one — it knows the user's name, knows whether IG-S06 applies (age), and knows the institutional context without asking. This is why Q1 opens with the user's world, not with logistics.

## Card Inventory — Phase 1 (Context)

| Code | Name | Type | Provenance |
|------|------|------|------------|
| H-010 | Wing self-introduction | META | DESIGNED |
| H-011 | Q1 — The opener | ELICIT | DESIGNED (Cognitive Interview, MI) |
| H-012 | Q2 — Current situation | ELICIT | DESIGNED — primary track classifier |
| H-013 | Q3 — Institutional context | ELICIT | DESIGNED |
| H-014 | Q4 — Three-month question | ELICIT | DESIGNED — frequency claim fixed v1.8 per IG-RC13 |

## Card Inventory — Phase 2 (Revealing)

| Code | Name | Type | Provenance |
|------|------|------|------------|
| H-015 | Q5 — The party question | ELICIT | EXTRACTED-RECALLED |
| H-016 | Q5.5 — Topic signal | ELICIT | DESIGNED — provisional topic capture |
| H-017 | Q6 — The hidden strength | ELICIT | EXTRACTED-RECALLED |
| H-018 | Q7 — The perception gap | ELICIT | EXTRACTED-RECALLED |

## Card Inventory — Selection Logic + Reveal Templates

| Code | Name | Type | Provenance |
|------|------|------|------------|
| H-019 | Between-question reaction pattern | META | DESIGNED (Peak-End, Cognitive Interview) |
| H-019.5 | Reveal Template Selection Logic | META | DESIGNED |
| H-020 | RT-01 Title/Function Split | OBSERVE | EXTRACTED-RECALLED |
| H-021 | RT-02 Visibility Anxiety | OBSERVE | EXTRACTED-RECALLED |
| H-022 | RT-03 Scatter Pattern | OBSERVE | DESIGNED — frequency claim removed v1.8 |
| H-023 | RT-04 Strategy-as-Function Confusion | OBSERVE | EXTRACTED-RECALLED (Shelby Greeley) |
| H-024 | RT-05 Aspiration-Evidence Gap | OBSERVE | DESIGNED |
| H-025 | RT-06 The Underseller | OBSERVE | See §RT-06 Corrected Copy below |
| H-026 | RT-07 Past Self / Present Self Divergence | OBSERVE | DESIGNED (Ibarra provisional selves) |
| H-027 | RT-08 Perception Contradiction | OBSERVE | DESIGNED — seq weight 2.0 |
| H-028 | RT-09 Gap Narrator (Career Returner) | OBSERVE | EXTRACTED-RECALLED — verbatim slot fixed v1.7 |
| H-029 | RT-10 Founder-Identity Blur | OBSERVE | EXTRACTED-RECALLED |
| H-030 | RT-11 The "I Should" Signal | OBSERVE | DESIGNED — strongest external identity_reference_frame signal |
| H-031 | RT-12 Quiet Expert | OBSERVE | EXTRACTED-RECALLED |
| H-032 | RT-13 Active-but-Invisible | OBSERVE | DESIGNED |
| ~~H-033~~ | ~~RT-14 Clean Slate~~ | — | **RETIRED v1.7** — Barnum failure (IG-U006) |
| H-034 | RT-15 Confident-but-Stuck | OBSERVE | DESIGNED |

### RT-06 Corrected Copy (H-025)

**Source:** Aug 24 email decision 1.4a. Corrects the original RT-06 from the compendium.

**Provenance:** EXTRACTED-RECALLED.

**Signal:** Q5 × Q6 cross-reference. The user describes themselves at the party (Q5) with notably less specificity, confidence, or evidence than what others would say about them (Q6). The gap between self-presentation and external evidence is the signal — not the language style itself.

**Detection method:** Compare Q5 and Q6 responses. Underselling is self-deprecation: the user has evidence and describes themselves below it. This is distinct from collective attribution (IG-S09), where the user credits others or uses "we" language as a culturally normative communication style. In collectivist cultures, "people tell me I'm good at" is not minimizing — it is the expected frame.

**IG-S09 carve-out:** Before RT-06 fires, check whether the language pattern is self-deprecation or collective attribution. If collective attribution, RT-06 does not fire. The card must distinguish between "I downplay my evidence" (RT-06 signal) and "I express my evidence through others" (culturally normative, no gap).

**Coaching move (Q9):** "What makes you describe yourself smaller than your evidence?"

**Q9 follow-up:** Open-first per Q9 standing rule (Standing Rules §2.1). If silence or "I don't know": scaffolding A/B.

**intervention_type:** OBSERVE

**sequence_weight:** 1.0

## Card Inventory — Post-Reveal

| Code | Name | Type | Provenance |
|------|------|------|------------|
| H-035 | Baseline calibration delivery | META | DESIGNED — B1–B3 1–5 scale, conditional follow-ups. B2 serves institutional reporting only per IG-U014 (see Doc 3 Part 1 comfort gate correction). |
| H-036 | Document upload request | META | DESIGNED |
| H-037 | Foundation 1 transition | META | DESIGNED — closes with "Let's go" (confirmed Aug 24) |

## Intake Integrity Gates

| Code | Name | v1.8 vs v3.3 |
|------|------|-------------|
| IG-INT01 | Never make the user feel assessed | Consistent |
| IG-INT02 | Never ask for info Wing already has | Consistent |
| IG-INT03 | Never assume track from demographics | Consistent |
| IG-INT04 | Safety gates during intake | **v3.3 governs: 6 gates** (S01, S02, S03, S06, S07, S09) — v1.8 listed 4 |
| IG-INT05 | Never repeat same response structure | Consistent |
| IG-INT06 | Reveal must be grounded or deferred | Consistent |
| IG-INT07 | Never reference being an AI | Consistent |
| IG-INT08 | Upload requested once, never required | Consistent |
| IG-INT09 | One question per message | Consistent |
| IG-INT10 | Barnum falsifiability (IG-U006) | Consistent |
| IG-INT11 | Observation precision (IG-U007) | Consistent |
| IG-INT12 | Quote-then-extend (IG-U010) | **v3.3 governs:** adds Barnum-in-quotation-marks clause |
| IG-INT13 | Resistance is diagnostic (IG-U009) | Consistent |

## Voice gates during intake

IG-V03 only. V04–V07 are Module 6 only and do not fire during intake.

## Companion Documents

| Document | Status |
|----------|--------|
| Wing_Intake_Design_v3_3.md (633 lines) | Canonical design spec |
| Wing_Intake_Data_Migration_v2-2.md (65 lines) | Two-layer principle, re-measurement cadence |
| Wing_SelfDescription_Capture_v2.md (52 lines) | Six capture points × five fields — build priority NOW. CONFIRMED BUILT. |

---

# MODULE: FOUNDATION 1

[GAP: Full card extraction with provenance and delivery annotations for H-101 through H-110 — source: Wing_Master_Module_Compendium-4.md. Continuation thread.]

**Known additions beyond compendium:**

**H-111 (Identity-Reference-Frame-Aware Function Introduction)** — from Research-Derived Gates (Wing_Research_Derived_Gates-2.md). DELIVERED Aug 24. Signal: identity reference frame detected at intake. coaching_move adapts function introduction to user's frame (external-frame users need external validation before internal work; internal-frame users can start with self-assessment).

**Foundation 1 close topic question** — from Aug 24 email. Confirmed addition, not in compendium or v3.3.

Exact wording: "Now that we know your primary function is [X], what specific part of [X] do you have the most to say about?"

This question captures the user's provisional topic at Foundation 1 close, feeding Q5.5's topic signal and providing early content material for Module 6. It sits after the function is identified and before the transition to Foundation 2.

**Module total:** 11 elements (9 coaching + 2 gates, including H-111). Close topic question is an addition to H-110 or a new card — numbering pending.

---

# MODULE: FOUNDATION 2

[GAP: Full card extraction with provenance and delivery annotations for H-201 through H-208 and H-211–H-212 — source: Wing_Master_Module_Compendium-4.md. Continuation thread.]

**Known additions beyond compendium:**

**H-209 — Aspiration ≠ Evidence (REVISED Aug 24)**

Full 7-component card from Aug 24 email. Email text is canonical.

| Field | Specification |
|-------|---------------|
| **signal** | User states a positioning goal as an established fact without evidence. "I'm known for strategy" when no story, credential, or external validation supports it. |
| **detection_method** | Cross-reference user's stated identity claims against evidence accumulated in F2. Aspiration without evidence is the gap. |
| **intervention_type** | CALIBRATE |
| **coaching_move** | "You want to be known for strategy — that's the goal. Let's see what evidence you have for it." Validate the aspiration as a goal, then surface the gap between goal and evidence. |
| **delivery_adaptation** | **External-frame users:** aspiration must be validated before gap is surfaced. "That's a goal worth having" precedes "here's what we need to build." **Internal-frame users:** can engage the gap directly. |
| **success_criteria** | User distinguishes between what they aspire to and what they can currently prove. |
| **failure_path** | User conflates aspiration with identity. Wing names the distinction one more time, then moves on — the evidence will or won't materialize in later modules. |
| **sequence_weight** | 1.0 |

**H-210 (Ice Bucket Sequencing)** — from Research-Derived Gates. DELIVERED Aug 24. Governs the order of credibility probes: start with the easiest evidence, build to harder claims.

**Module total:** 12 elements (8 coaching including H-209 revised and H-210 + 2 gates + 2 exercises).

---

# MODULE: FOUNDATION 3

[GAP: Full card extraction with provenance and delivery annotations for H-301 through H-314 — source: Wing_Master_Module_Compendium-4.md. Continuation thread.]

**Known additions beyond compendium:**

**H-315 ("Report Everything" Narration Prompt)** — from Research-Derived Gates. DELIVERED Aug 24. Encourages users to narrate fully before filtering: "Tell me everything about that situation, even the parts you don't think matter."

H-308 renumbered to H-007 (universal). Confirmed Aug 17.

**Module total:** 15 elements (8 coaching after H-308→H-007 renumbering + H-315 + 2 gates + 4 exercises).

---

# MODULES 4–5

[GAP: Full card extraction for M4 (14 elements) and M5 (7 elements) — source: Wing_Master_Module_Compendium-4.md. Straight extraction, no post-compendium additions. H-411 gate→H-412 collision resolved (Doc 2 Section 15, flag 1). Continuation thread.]

---

# MODULE 6

[GAP: Full card extraction for existing M6 cards (H-601–H-615) plus entire Content Trigger Layer (H-620–H-627, IG-M6-01–05, IG-IMG-01–03) — source: Wing_Master_Module_Compendium-4.md + Wing_Research_Derived_Gates-2.md + Wing_Content_System_v1.md. Five correction flags on H-601 (see Doc 3 Part 1). Content trigger cards and gates are specified in Doc 3. Continuation thread.]

**Known additions beyond compendium:**

**H-616 (Positioning Aversion Awareness)** — from Research-Derived Gates. DELIVERED Aug 24. Signal: user shows resistance to public positioning that goes beyond normal discomfort. coaching_move separates healthy caution from positioning aversion.

9 content trigger cards + 8 content/image gates = 17 new elements (specified in Doc 3).

**Module total:** 16 (original including H-616) + 17 (content system) = 33 elements.

---

# MODULE 7

[GAP: Full card extraction for H-701 through H-711 — source: Wing_Master_Module_Compendium-4.md + Wing_Content_System_v1.md. H-701 Baby Radar rewrite replaces compendium version for Sep 1 (3–5 topics/week, Wing's knowledge only, no external feed). H-706/H-707 reserved for future expansion. H-710 gate→H-711. Continuation thread.]

**Module total:** 10 elements.

---

# MODULES 8–9

[GAP: Full card extraction for M8 (9 elements) and M9 (23 elements) — source: Wing_Master_Module_Compendium-4.md + Wing_Research_Derived_Gates-2.md. M9 count corrected from 27 to 23 (H-913–917 gates counted once — Doc 2 Section 15, flag 4). H-916 intervention_type corrected to META (was COACH — Doc 2 Appendix A, Email 1, D1). Continuation thread.]

**Known additions beyond compendium:**

**H-923 (from Research-Derived Gates)** — DELIVERED Aug 24. Part of Module 9 expansion. Full spec in Research-Derived Gates document.

**IG-S09 sweep needed:** Module 9 power coaching moves and Module 8 competency self-assessments both require the IG-S09 cultural attribution check. Every card using language detection to identify a gap must distinguish self-deprecation from collective attribution. (See Doc 5 Part 8, §8.5.)

---

# MODULES 10–11

[GAP: Full card extraction for M10 (31 elements) and M11 (28 elements) — source: Wing_Master_Module_Compendium-4.md. Prefix classification flags: IG-1001–1006 and IG-1101–1107 should be H-prefix under classification rule (deferred post-Sep 1, Doc 2 Section 2). Module 11 universal gates at final numbers IG-U018–U020 (confirmed after three collision events, Doc 2 Section 3). Both modules DEFERRED to later release. Continuation thread.]

---

# MODULE 12

Reserved, unassigned. Number skipped when Module 13 was named. No cards, no specification.

---

# MODULE 13: POSITIONING IN AN AI-MEDIATED MARKET

**Source:** v1.2 canonical (285 lines, Aug 19)
**Lead traits:** EDUCATING + CHALLENGING
**Architecture:** Two layers (diagnostic + action). SLI.pro #2's four-track structure superseded.
**Card count:** 10 heuristic cards + 7 integrity gates = 17 elements.
**Delivery status:** v1.2 sent Aug 20. Module 13 diagnostic layer build authorized. Action layer unblocked Aug 24.

**Research basis for mini-intake (H-1301):** Convergence of three findings: (1) Dunning-Kruger — users who most need Foundation are most likely to skip it (Perplexity §4). (2) Just-in-time scaffolding outperforms redirect-and-return 3:1 (Perplexity §§1–3, Wood, Bruner & Ross 1976). (3) Forced sequential movement r=−.374 with completion (Perplexity §§1–3, n=543 self-paced students). Design: 2-question behavioral evidence elicitation + offered-not-forced Foundation route. Full references in Module13-Entry-Design-Research.md.

## Diagnostic Layer

| Code | Name | Type | Notes |
|------|------|------|-------|
| H-1301 | Module Opening — The Sameness Problem | EDUCATE | Includes evidence-eliciting mini-intake for pre-Foundation users. **Three uncited numbers (500 students, dozens a day, hundreds of pitches) CUT per Aug 24.** On-ramp wording: use IG-U016 phrasing (not "most people in your role"). |
| H-1302 | Your Distinctive Signal | COACH | |
| H-1303 | How AI-Mediated Evaluation Works | EDUCATE | Highest-risk card for retired claims. **Add detection-vs-ranking distinction from SLI.pro #2.** |
| H-1304 | AI as Mirror vs. AI as Author | COACH | Includes leverage/avoidance distinction (from SLI.pro #2) |

## Action Layer

| Code | Name | Type | Notes |
|------|------|------|-------|
| H-1305 | The Experiment Framework | COACH | Seq weight 1.5. **Reflection step added per IG-U015.** |
| H-1306 | Proof Point Builder | COACH | |
| H-1307 | Stress-Testing Your Positioning | COACH | **Reflection step added per IG-U015.** |
| H-1308 | The Distinctiveness Check | CHALLENGE | **Reflection step added per IG-U015.** |
| H-1309 | Building the Ongoing Practice | COACH | Protocol artifact. Check-in owner: Radar (not heartbeat). Inherits suppression flag. On-ramp: IG-U016 phrasing. |
| H-1310 | Module Close — Distinctive Signal Assessment | COACH | Per IG-U011 close pattern |

## Module 13 Integrity Gates

| Code | Name | Notes |
|------|------|-------|
| IG-1301 | No Algorithm Score Claims | HIGHEST PRIORITY |
| IG-1302 | Claims-Safe Platform Mechanics | **Add optimization-coaching prohibition as standing rule** |
| IG-1303 | The User's Signal Must Survive | IG-U006 applied to user content |
| IG-1304 | No Fear-Based Motivation | IG-U017 applied (Perplexity §8 — loss-framing effect vanishes in field settings) |
| IG-1305 | AI Experimentation Stays Practical | |
| IG-1306 | Wing Does Not Author in Module 13 | From SLI.pro #2 |
| IG-1307 | AI Self-Reference Exception | Scoped, one-time (from SLI.pro #2). Only exception to anti-pattern #6. |

## What v1.2 Didn't Pick Up from SLI.pro #2

Items flagged but not blocking: dedicated "AI in hiring" card, detection-vs-ranking distinction (recommended for H-1303), voice-editing-back as separate skill, population groupings (thin/deep/venture-entangled), cross-component interaction rules, reference layer as independently-versioned component.

## Module 13 WIIFM Messaging (from Delivery Pack Part C)

Eight audience-specific openings delivered. Key example — Undergraduate: "Every application in that pile was written with the same tool as yours. That's not a reason to stop using it — it's the reason the only thing that still counts is the part that came from you." Full table in Delivery Pack Part C.

Module objective line, all audiences: "Use AI without sounding like it, and know what's real about how these systems work."

---

# SYSTEM EVENT: REVEAL CYCLE

**Source:** v4 CANONICAL (659 lines, Aug 18) + Amendments (Aug 19) + Readiness Mechanism (Aug 19) + Input Layer Spec (450 lines, Aug 18) + Delivery Pack (650 lines, Aug 18)
**Lead traits:** OBSERVING + CONNECTING
**Card count:** 13 heuristic cards + 12 integrity gates = 25 elements. IG-RC11 non-firing. IG-RC12 retired (folded into IG-S03). Effective: 23.
**Delivery status:** Sent Aug 20. Capture layer CONFIRMED BUILT. Full card/gate build status pending.

## Reveal Cycle Cards

| Code | Name | Type | Notes |
|------|------|------|-------|
| H-RC01 | Reveal Readiness Assessment | META | Five conditions govern Gate 2 (build from spec, not Amendments summary). Threshold: 8 events across 3+ signal categories, 4+ quote-productive. |
| H-RC02 | Cross-Channel Convergence Detection | META | IG-RC09 fires here (role-aware summarization at assembly, not at output) |
| H-RC03 | Primary Insight Selection | META | IG-RC10 delivery-normalized absence applies — category absence valid only when prompts from that category were delivered |
| H-RC04 | Insight Delivery (Quote-Then-Extend) | OBSERVE | Opens directly on Beat 1, no preamble (amended). "Something's been showing up across everything you've told me since [month], and I don't think you've noticed it." |
| H-RC05 | Trajectory Observation, First Reveal | OBSERVE | |
| H-RC06 | Trajectory Observation, Subsequent | OBSERVE | |
| H-RC07 | Contradiction Surfacing | OBSERVE | One month = noise, two consecutive = drift |
| H-RC08 | Forward Question Construction | ELICIT | The compounding mechanism |
| H-RC09 | Null Reveal | META | Successful cycle, not failure. §6.11 register. |
| H-RC10 | Thin Reveal and Re-engagement | COACH | **CORRECTED Aug 24: "Radar pauses with everything else during a suppression hold."** |
| H-RC11 | Reveal Rejection Handling | REFRAME | IG-U009 governs |
| H-RC12 | Reveal-to-Route Handoff | REDIRECT | Max 1 route per Reveal |
| H-RC13 | Reveal Archive Access | OBSERVE | Past Reveals preserved verbatim |

## Reveal Cycle Gates

| Code | Name | Status | Notes |
|------|------|--------|-------|
| IG-RC01 | Safety Pre-Pass Precedence (wt 3.0) | Active | Synthesis blocked until crisis scan completes |
| IG-RC02 | Convergence Requirement | Active | |
| IG-RC03 | Manufactured Insight Prohibition | Active | |
| IG-RC04 | Trajectory Provenance | Active | |
| IG-RC05 | Non-Repetition | Active | |
| IG-RC06 | Reveal Scarcity Protection | Active | |
| IG-RC07 | Identity Reference Frame Calibration | Active | **AMENDED:** content not timing |
| IG-RC08 | Observed Outcome vs Attribution | Active | "4× your normal engagement" defensible; "because it led with your opinion" not defensible |
| IG-RC09 | Role-Aware Summarization | Active | **Promoted to IG-U013.** Sycophancy 41%→12.8%, accuracy 56%→83% |
| IG-RC10 | Delivery-Normalized Absence (wt 2.0) | Active | Category-level steering only. Depends on signal-category tagging in Input Layer Spec §3 and Delivery Pack Part F. |
| IG-RC11 | Validation Method Prohibition | **NON-FIRING** | Standing rule — satisfaction scores invalid, adversarial suite required |
| IG-RC12 | Attachment Pacing | **RETIRED** | Folded into IG-S03, number retained |
| IG-RC13 | Unsourced Population Claims | Active | Platform Updates is canonical definition. Doc 5 Part 2 has judgment calls. |

## Readiness Mechanism

Five signals: resistance history (IG-U009 logs), coaching intensity (H-003 logs), recency of challenge, engagement trajectory, self-view stability (Branch A firm→HOLD, Branch B rehearsed→DELIVER with priority). Watch condition on Branch B acceptance rates. Held-candidate expiry: three cycles — deliver with readiness constraint noted, or retire.

## Sequence Map (from Delivery Pack Part E)

Full sequence diagram in Delivery Pack Part E. Key flow: H-RC01 (eligibility) → H-RC02 (candidate generation, IG-RC09 fires BEFORE assembly) → H-RC03 (filter/rank/select, IG-RC10 delivery-normalized absence) → zero survivors branch to H-RC09 (Null) OR one survivor through H-RC11 (concerning check) → H-RC04 (opening, OBSERVE) → H-RC05 (evidence, CONNECT) → H-RC06 (trajectory) → H-RC07 (forward question, ELICIT) → engaged branch to H-RC12 (routing) OR disputed branch to H-RC10 (dispute handling). Gates always on: IG-RC01, IG-RC02, IG-RC03, IG-RC04. Gate at instrumentation only: IG-RC11.

---

# SYSTEM EVENT: POSITIONING REFRESH

[GAP: Full extraction of 18 elements (PR-01 through PR-12, IG-P01 through IG-P06) from Wing_SystemEvents_Module13_Design.md Part 3. SPECIFIED, NOT YET DELIVERED. Not in running total. Uses own namespace (PR-, IG-P-). Sequence map in Delivery Pack Part E. Continuation thread.]

**Known from Delivery Pack Part G:** Corrected user-facing copy for drift-triggered and post-stable openings. Precedence rule: Safety → involuntary-transition suppression → Tier 1 Refresh → Reveal → Tier 2/3 Refresh → Radar. Neither system event fires within seven days of the other, or within seven days of M8/M9 loading.

---

# CROSS-MODULE: EXERCISE LIBRARY

**Source:** Wing_Exercise_Library_Cards.md (325 lines)
**Card count:** 16 exercise cards + 1 universal warm-up = 17.
**Delivery status:** In compendium (Aug 9/17). Build status unknown.

| Code | Name | Module |
|------|------|--------|
| H-211 | Technical Archeology Dig | Foundation 2 |
| H-212 | Ripple Effect | Foundation 2 |
| H-311 | Pivotal Moment Identification | Foundation 3 |
| H-312 | Breakthrough Moment Documentation | Foundation 3 |
| H-313 | Limiting Belief Archeology | Foundation 3 |
| H-314 | Identity Evolution Questions | Foundation 3 |
| H-411 | Problem-Solution Mapping | Module 4 |
| H-412 | Odyssey Planning | Module 4 |
| H-413 | 100 Questions Exercise | Module 4 |
| H-414 | Value Clarity Through Contrast | Module 4 |
| H-415 | Solidifying Career Next Steps | Module 4 |
| H-416 | Health and Recovery Integration | Module 4 |
| H-611 | Content Ideation Speedrun | Module 6 |
| H-612 | Expert Perspective Exercise | Module 6 |
| H-613 | Content Calendar Starter | Module 6 |
| H-900 | Reverse Engineering Warm-Up | Universal |

---

# UNIVERSAL CARDS AND GATES

## Universal Cards (H-001–H-007)

| Code | Name | Notes |
|------|------|-------|
| H-001 | Evidence Accumulation Threshold | 2 Tier 1 events from different sessions — platform-wide floor. Distinct from Gate 2's 4-event Reveal threshold. Aug 24 version governs. |
| H-002 | Cross-Session Provenance | Wing always knows what happened in prior threads. Thread model: each module entry creates a new thread (SCRUM Aug 13). |
| H-003 | Session Intensity Tracking | Logs coaching intensity for Readiness Mechanism. |
| H-004 | Silence as Signal | |
| H-005 | Engagement Pattern Tracking | |
| H-006 | Multi-Source Consistency | |
| H-007 | Chunked Delivery (formerly H-308) | CONFIRMED BUILT. Pause timings: 0.5s min, 2.5s max, 4s reveal pause. (Doc 4 Part 7.) |

**Note:** H-001–007 should be IG-U prefix under classification rule. Deferred to post-Sep 1 prefix cleanup (Doc 2 Section 2).

## Research-Derived Universal Gates (IG-U006–U011)

| Code | Name | Provenance |
|------|------|------------|
| IG-U006 | Barnum Falsifiability | RESEARCH — substitution test validated by Reuben case |
| IG-U007 | Observation Precision | RESEARCH |
| IG-U008 | Competence→Gap→Fixable | RESEARCH |
| IG-U009 | Resistance Is Diagnostic | RESEARCH |
| IG-U010 | Quote-Then-Extend | RESEARCH — quotation marks are the structural anti-ChatGPT signal |
| IG-U011 | Session Close Consolidation | RESEARCH |

## Platform-Wide Universal Gates (IG-U012–U017)

| Code | Name | Research basis |
|------|------|---------------|
| IG-U012 | Evidence Grade | |
| IG-U013 | Role-Aware Summarization | Sycophancy 41%→12.8%, accuracy 56%→83% |
| IG-U014 | Evidence Over Self-Rating | Kruger & Dunning (1999), Perplexity §4 |
| IG-U015 | Production Requires Reflection | Portfolio pedagogy, Perplexity §6 |
| IG-U016 | Module Self-Sufficiency | Wood, Bruner & Ross (1976), Perplexity §§1–3 |
| IG-U017 | Opportunity Over Fear | Loss-framing meta-analysis, Perplexity §8 |

## Module 11 Universal Gates (IG-U018–U020)

| Code | Name |
|------|------|
| IG-U018 | User-Uploaded Data Handling |
| IG-U019 | Behavioral Inference Disclosure |
| IG-U020 | Task Follow-Up Tone |

---

## Source Documents Processed

32+ documents, ~18,000+ lines. Full list in Doc 2 Section 16.

---

*Document 1 — Wing Heuristic Compendium*
*Platform 2.0 Source of Truth — August 26, 2026*
*Gaps marked [GAP:] — search for "[GAP" to find all holes*
*Continuation thread: extract remaining 12 modules from compendium with provenance, delivery status, and defect annotations*
*Thread: Platform 2.0 Master Audit & Source of Truth (SLI.pro Advisors & Fundraising)*
*Methodology author: Danielle Carattini · dcara@sli.pro*

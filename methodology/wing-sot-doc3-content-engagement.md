# Document 3 — Wing Content & Engagement System
## Platform 2.0 Source of Truth — August 26, 2026
## Complete and standalone. Document 2 is the authority for all numbering, gate specs, and decision history.

---

## CROSS-DOCUMENT INDEX

| Looking for... | It's in... |
|---------------|-----------|
| A specific card's full 7-component spec | Doc 1 (Heuristic Compendium), module section for that card's prefix |
| Whether something is built, a decision Aditya raised, what's deferred | Doc 2 (Platform Architecture & Governance) — Sections 12, Appendices A–C |
| Numbering registry, prefix namespace, gate deployment tiers | Doc 2, Sections 2–4 |
| Content triggers, cadence, micro-journal, publishing, image generation | **This document (Doc 3)** |
| Dashboard layout, navigation, UX gates, prototype decisions, typography | Doc 4 (UX & Interface Specifications) |
| Retired claims, frequency rules, voice standard, anti-ChatGPT personality | Doc 5 (Claims & Voice Discipline) |

---

# PART 1: CONTENT TRIGGER LAYER

**Source:** Wing_Content_System_v1.md (396 lines, Aug 24 — MERGED canonical)

**Running total contribution:** 312 (prior) + 17 (content system) = 329.

## Cards (9)

| Code | Name | Type | Key rules |
|------|------|------|-----------|
| H-620 | Comment Trigger | Content trigger | Lowest barrier. Entry requires behavioral comfort assessment — see Part 5 comfort gate architecture. |
| H-621 | Post Trigger | Content trigger | Mid-barrier. Requires F1 or Q5.5. Comfort gate: behavioral stage 2+ (moderate or bold). |
| H-622 | Article Trigger | Content trigger | Highest barrier. Gate: 3+ posts AND behavioral comfort = bold. Includes DALL-E image. |
| H-623 | Direct Message Trigger | Content trigger | Named person + specific reason. Max 1/14 days. |
| H-624 | Connection Request Trigger | Content trigger | Named person. Max 1/14 days. |
| H-625 | Content Suggestion Cadence | Cadence framework | Per-track timing. 3-day minimum between suggestions. 3 consecutive declines → 30-day pause. Pillar rotation feeds suggestion logic — see Part 5 methodology integration. |
| H-626 | Content Progression Logic | Progression model | Stage 1 (comments) → Stage 2 (posts) → Stage 3 (articles). Behavior-gated, per behavioral comfort scale. |
| H-627 | Content Trigger Integration Map | Integration routing | Four sources: Radar, module completion, micro-journal, time-based cadence. Every suggestion has provenance. |
| H-701 | Baby Radar Topic Suggestion | Radar (Sep 1) | 3–5 topics/week. Uses Wing's knowledge, NOT external feed. Full Radar = October. |

## Comfort Gate Architecture (corrected — IG-U014 compliance)

The v1 content trigger rules used B2 (intake self-report comfort rating) as the primary gate for content progression. This violates IG-U014 (Evidence Over Self-Rating): self-report serves institutional reporting only; behavioral evidence governs coaching decisions.

**Corrected architecture — two layers:**

**Layer 1 (first cycle only):** B2 provides the initial floor before behavioral data exists. A user who self-reports low comfort starts at Stage 1 (comments). A user who self-reports high comfort still starts at Stage 1 — B2 sets the floor, not the ceiling — because the methodology explicitly states: "self-promotion comfort should be diagnosed from session language rather than intake self-ratings, since a high content-comfort rating routinely reflects comfort with the act of writing, not with public self-assertion."

**Layer 2 (all subsequent cycles):** The three-tier behavioral comfort scale governs. Wing diagnoses actual self-promotion comfort from session behavior.

| Tier | Label | Behavioral indicators | Content ceiling |
|------|-------|----------------------|----------------|
| Tier 1 | Subtle | Engages with content but hedges in session language, avoids specificity in public framing, defers to general statements over personal claims | Comments, low-exposure posts |
| Tier 2 | Moderate | Uses specific evidence in session, connects personal experience to professional claims, shows willingness to be identified with a position | Posts with named perspective, direct messages |
| Tier 3 | Bold | Asserts expertise with specificity, comfortable with public-facing claims tied to identity, initiates content ideas | Articles, high-visibility posts, full content range |

**B2's remaining role:** Institutional reporting only. When a university requests aggregate comfort data, B2 provides the self-report metric. B2 never governs what Wing suggests or suppresses.

**IG-U014 citation (Perplexity §4):** Kruger & Dunning (1999), "Unskilled and Unaware of It." Bottom-quartile performers self-estimated at 60th–70th percentile. Self-report cannot reliably gate coaching decisions.

## Gates (8)

| Code | Name | Key rule |
|------|------|----------|
| IG-M6-01 | Article Image Generation | DALL-E on Azure OpenAI. User approves. Can provide own — **"it doesn't need to be designed, it needs to be yours" language on the user-provided path.** |
| IG-M6-02 | Content Suggestion Timing | 3-day minimum. Suppression-state aware. |
| IG-M6-03 | Comfort-Gated Progression | Never suggest above current behavioral comfort tier. First cycle: B2 sets the floor. All subsequent cycles: behavioral comfort scale governs per IG-U014. |
| IG-M6-04 | Specific Material Required | Every suggestion references specific material. Generic = Barnum (IG-U006). |
| IG-M6-05 | Maximum Coaching Rounds | Max 3 per content piece. |
| IG-IMG-01 | Image Generation Safety | System prompt. Content filter for DALL-E. |
| IG-IMG-02 | Image Relevance | Image must relate to topic. |
| IG-IMG-03 | User Control Over Images | User always approves. Accept, request changes, provide own, or skip. |

## Governing Gates (platform-wide, apply to every trigger)

IG-U006 (Barnum), IG-U015 (reflection), IG-U017 (no fear), IG-RC13 (no frequency claims), IG-V07 (AI-speak detection), H-615 (Wing coaches, never authors).

## 90-Day Cadence Targets

| Track | Articles | Posts | Comments | Outreach | Rhythm |
|-------|----------|-------|----------|----------|--------|
| Undergraduate | 1 | 3–4 | 6–8 | 2–3 | ~7–10 days |
| Early career | 1 | 3–4 | 4–6 | 2–3 | ~7–10 days |
| Mid-career | 2 | 4+ | 4–6 | 2–3 | ~5–7 days |
| Executive | 2 | 4 | 2–3 | 1–2 | ~7 days |
| Entrepreneur (early) | 1–2 | 3–4 | 4–6 | 2–3 | ~7 days |
| Entrepreneur (fundraising) | 2 | 4–6 | 4–6 | 3–4 | ~5–7 days |
| Entrepreneur (scaling) | 1–2 | 3–4 | 3–4 | 2–3 | ~7 days |
| Career returner | 1 | 2–3 | 6–8 | 2–3 | ~7–10 days, comments first |

After 90 days post-positioning-change, cadence halves.

## Module 6 Correction Flags (not new elements — corrections needed)

1. H-601 Foundation prerequisite violates IG-UX01
2. H-601 references "DNA maps" — verify against Voice Standard
3. H-601 references H-308 — should be H-007
4. All M6 cards: "entrepreneur" needs sub-tags
5. All M6 cards: career returner missing from delivery_adaptations

---

# PART 2: PUBLISHING FLOW

Five steps (from Content System v1, Spec 3):

**Step 1 — Seed.** Wing triggers content, user produces rough version. Wing provides one opening line only.

**Step 2 — Coaching rounds (max 3).** One directive per round: specificity, distinctiveness, opening strength, or structure. Pillar the content serves is named at the start of coaching — see Part 5 methodology integration.

**Step 3 — Pre-publish checks.** IG-V07 (AI-speak), IG-U006 (Barnum), IG-U015 (reflection: "What does this piece prove about your positioning?"). User can override.

**Step 4 — Publish.** LinkedIn OAuth direct publish for connected users. Articles include DALL-E image.

**Step 5 — Post-publish.** Content stored as evidence. Engagement referenced at next session.

---

# PART 3: MICRO-JOURNALING PROMPT LIBRARY

**Source:** Wing_Approachable_MicroJournal_Library_Final.md (836 lines)

## Library Structure

| Section | Prompts | Signal category status |
|---------|---------|----------------------|
| Section 1: Universal | 80 | **TAGGED** — full tagging in Input Layer Spec §3 |
| Section 2: Audience-Adapted | 70 (10 × 7 audiences) | **TAGGED** — load from Delivery Pack Part F |
| Section 3: Audience-Specific | 85 (10–15 × 7 audiences) | **TAGGED** — load from Delivery Pack Part F |
| **Total** | **235** | |

**History:** Sections 2 and 3 were untagged at delivery (August 20). The Delivery Pack Part F (August 18, recovered verbatim) supplies primary signal categories for all 155 prompts in those sections. The Input Layer Spec's recommendation to rebalance the universal pool is superseded by Part F's finding: Career and Influence are thin in the universal pool (7 of 80) but well covered in the audience pools. Rotation weighting is the correct fix, not pool authoring. See §Rotation Weighting below.

## Signal Category Distribution — Full Library

**Universal pool (80 prompts, from Input Layer Spec §3):**

| Category | Primary count | Share |
|---|---|---|
| Energy | 15 | 19% |
| Achievement | 14 | 18% |
| Decision | 14 | 18% |
| Relationship | 13 | 16% |
| Language | 10 | 13% |
| Industry | 7 | 9% |
| Career | 4 | 5% |
| Influence | 3 | 4% |

**Audience-adapted pool (70 prompts, from Delivery Pack Part F):**

| Category | Count across 7 audiences |
|---|---|
| Language | 10 |
| Energy | 9 |
| Achievement | 9 |
| Industry | 7 |
| Career | 7 |
| Influence | 7 |
| Relationship | 6 |
| Decision | 5 |

Career and Influence are 10% combined in the universal pool but 20% in the adapted pool — the coverage gap is an artifact of universal-only analysis.

**Audience-specific pool (85 prompts, from Delivery Pack Part F):**

Career dominates the specific pool (especially mid-career: 10 of 25), compensating further. Influence is concentrated in executive (9 of 25) and entrepreneur-scaling tracks.

## Rotation Weighting

**Rule (from Delivery Pack Part F, corrects Input Layer Spec §3):** Universal 50% / Audience-adapted 25% / Audience-specific 25%, with adaptive over-sampling when a signal category runs thin in the most recent cycle.

The rotation weighting, not pool rebalancing, is the correct mechanism. Zero authoring cost, reversible, directly serves the three-category data sufficiency requirement (H-RC01 threshold: 8 events across at least 3 distinct signal categories).

**Career returner exception:** No adapted or specific pool exists. Career returner users receive universal prompts only — 80 versus everyone else's effective pool of 100–105. This is a 20% smaller pool with zero prompts calibrated to re-entry. See §Career Returner below.

## Career Returner: ABSENT

Zero career-returner prompts in the library. The 7 listed audiences do not include career returner. Career returners receive: 80 universal prompts, plus 8 heartbeat prompts from the copy document.

Five universal prompts assume current employment and will misfire (#15, #40, #3, #46, #62). For a returner mid-search, each lands as a reminder of what they don't currently have.

**Post-September 1 priority.** Berkeley is undergrads, not career returners. The Reveal Cycle amendments flagged this: "Career-returner prompt set (15 prompts): not yet started." Prompts must be written to the IG-V01 career returner register (warm, not pitying, forward-looking — see Doc 2 §10) plus five employment-neutral rewrites of the misfiring universals.

## Prompts Needing Rewrites

Universal 19: resolved (§12.1 amendment). Universal 20: resolved (§12.2). Six remaining unidentified — [GAP: awaiting Aditya's linter output for specific prompt numbers. Source: Aditya email thread.]

Eight additional prompts from the upstream audit (Input Layer Spec §6) need rewrites in three shapes: closed gate with no follow-up (#19, #30), forced binary (#54, #59), bar set too low or list-shaped (#20, #21, #48, #64). The rule: every prompt needs a second clause that requires prose. With the eight fixed, roughly 72 of 80 universals are quote-productive.

## Prompt Delivery Mechanics

The delivery system runs on five rules and one classification:

**Rotation:** Weekly rotation, 14-day minimum before repeat. Rotation weighting: 50% universal / 25% adapted / 25% specific, with adaptive over-sampling for thin categories.

**Openers:** 20+ universal openers selected independently of prompt.

**Event-sensitivity:** Rule on prompts referencing specific events.

**Adaptive selection:** By signal category (when tagged). System selects for under-covered categories to serve H-RC01 data sufficiency. See IG-RC10 (delivery-normalized absence) — Wing may only report a category absence where prompts from that category were actually delivered. The prompt log must record delivery + category + response substantiveness.

**Frequency cap:** Maximum 1 prompt per day. Entrepreneur (fundraising): max 1 prompt/week during active fundraising.

**Response classification at capture:** Single word / list / prose (3-word threshold per Aditya's confirmed rule — see Doc 2 Appendix A, Email 3 item 3.1). Bare affirmation/negation counts as single-word up to 5 words. "I don't overthink things" (4 words, substance) = prose. "Not really, no" (3 words, no substance) = single-word. Only prose counts toward Gate 2's quote-productive condition.

**Evidence tier:** Per prompt (not per response). Aditya proposes first pass, Danielle corrects. The 8 Hypotheticals are Tier 3 by construction.

## Micro-Journaling Gates (IG-MJ01–06)

Summaries are canonical. Full 7-component specs were never produced. Flag for expansion post-Sep 1 if needed. (See Doc 2 Appendix C, Priority 3.)

| Code | Rule |
|------|------|
| IG-MJ01 | Minimum 3 responses showing consistent pattern before routing recommendation |
| IG-MJ02 | 21-day cool-down on declined module recommendations |
| IG-MJ03 | Never increase frequency when response rate declining |
| IG-MJ04 | Crisis language → single validating message, no module recommendation |
| IG-MJ05 | Maximum 1 prompt per day |
| IG-MJ06 | Entrepreneur (fundraising): max 1 prompt/week during active fundraising |

---

# PART 4: HEARTBEAT PROMPTS

**Source:** Wing_All_Prompts_Copy_Final.md, Section 4. 8 prompts per track, voice-calibrated.

Tracks covered: Undergraduate (8), Early Career (8), Mid-Career (8), Executive (8), Entrepreneur (8 — single track, not sub-tagged), Career Returner (8).

Additional population prompts from UX Addendum: Entrepreneur Fundraising (EF-01–10), Entrepreneur Scaling (ES-01–10), Executive (EX-01–08).

---

# PART 5: CONTENT CADENCE — METHODOLOGY INTEGRATION

**Source:** SLI.pro methodology (Sections 6.4, 6.6), extracted in Standing Rules §2.4. Three insights that modify the content trigger rules.

## 5.1 Two-Layered Comfort Gate

The comfort gate described in Part 1 implements the first layer of the methodology's comfort architecture. The full design is two-layered:

**First cycle:** B2 (intake self-report) sets the floor. Wing has no behavioral data yet. A user rating themselves bold still enters at Stage 1 (comments) because the methodology distinguishes comfort with writing from comfort with public self-assertion. B2 identifies users who are explicitly anxious (start slower) versus those who aren't (start at baseline).

**All subsequent cycles:** Wing diagnoses actual self-promotion comfort from session behavior. The three-tier scale (bold / moderate / subtle) governs from the second content cycle forward. B2 is never referenced again for coaching decisions.

The distinction matters because the methodology explicitly states: "self-promotion comfort should be diagnosed from session language rather than intake self-ratings, since a high content-comfort rating routinely reflects comfort with the act of writing, not with public self-assertion."

**IG-U014 relationship:** The two-layer architecture is the content system's specific implementation of IG-U014. B2 as a first-cycle floor is consistent with IG-U014 because no behavioral evidence yet exists — it is the minimum viable signal, not the governing signal. Once behavioral evidence accumulates, it governs and B2 is retired from coaching decisions.

## 5.2 Pillar Rotation in Trigger Logic

When Wing suggests a post, it names which pillar the post serves. Wing notices when content mix is unbalanced and steers toward under-represented pillars.

**Modification to H-625 (Content Suggestion Cadence):** Each content suggestion carries a pillar tag. Wing tracks pillar distribution across published content. When one pillar dominates (>60% of published pieces), the next suggestion targets an under-represented pillar. The pillar tag is visible to the user: "This one's about your credibility — you've been building conviction pieces, and having the evidence side covered makes those land harder."

**Modification to H-627 (Content Trigger Integration Map):** Pillar distribution is a fifth trigger source alongside Radar, module completion, micro-journal, and time-based cadence.

## 5.3 Pillar-Comfort Sequencing

The content progression model (H-626) describes progression across content types: comments → posts → articles. The methodology adds a second axis — progression within each content type follows the pillar sequence: credibility → conviction → ecosystem.

**Credibility first:** Share evidence of what you've done (lowest self-promotion anxiety, most concrete).
**Conviction second:** Share what you believe about your domain (requires taking a position, higher exposure).
**Ecosystem third:** Position yourself within a professional community (highest visibility, most relational).

This sequencing is load-bearing. A user who starts with ecosystem content before establishing credibility content produces Barnum-adjacent positioning — general enough to survive the substitution test. The pillar sequence protects against that.

**Modification to H-626 (Content Progression Logic):** Within each stage, suggested content follows credibility → conviction → ecosystem. A user at Stage 2 (posts) who has published two credibility posts gets a conviction post suggestion next, not a third credibility post. Pillar-comfort progress is tracked independently of content-type progress.

**Status:** All three methodology insights are identified and specified. Not yet applied to H-625 and H-626 card text. Modification to card text is a Doc 2 Appendix C Priority 2 item.

---

*Document 3 — Wing Content & Engagement System*
*Platform 2.0 Source of Truth — August 26, 2026*
*Thread: Platform 2.0 Master Audit & Source of Truth (SLI.pro Advisors & Fundraising)*
*Methodology author: Danielle Carattini · dcara@sli.pro*

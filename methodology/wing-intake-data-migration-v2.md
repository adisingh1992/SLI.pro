# Intake Data Migration — Where the Old Branding Assessment's Jobs Live Now

*Addendum to the Wing Intake Design Document*
*August 17, 2026*

---

## The Problem

The old branding assessment was 18+ questions that did four different jobs in one form. The new conversational intake does the first job (identity data capture) much better, but the other three jobs need explicit homes in the new architecture or they'll get lost.

| Job | Old location | New location | Status |
|---|---|---|---|
| Identity data (who are you, what do you want) | Branding assessment Q1–Q18 | Intake Q1–Q6 | ✓ Covered, better than before |
| Professional context (title, company, industry, years) | Branding assessment (redundant with LinkedIn) | LinkedIn upload in Phase 4 | ✓ Covered, no longer redundant |
| Topic identification (what do you want to be known for) | Branding assessment | *Needs a home* | See Section 1 below |
| Baseline self-assessment (content comfort, clarity, barriers) | Branding assessment | *Needs a home* | See Section 2 below |

---

## Section 1: Topic Identification

### What it is

The question — some version of "what do you want to be known for" or "what topics are you drawn to professionally" — that feeds:
- Wing Radar content seeds (what's worth watching for this user)
- Writing Coach pillar architecture (what content territories to develop)
- Target industry and function signals (confirmation data for Foundation 1)
- Network intelligence targets (who to connect with and why)

### Where it lives now

**Not in intake. In the Foundation 1 → Foundation 2 transition.**

The reason: before Foundation 1, most users can't answer this question with specificity. They say "leadership" or "innovation" or "technology" — words that are too vague for Wing Radar or the Writing Coach to act on. After Foundation 1 identifies the primary function, the topic question becomes actionable: "Now that we know your primary function is operations, what specific part of operations do you have the most to say about?"

### How it gets asked

The question lives at the end of Foundation 1, framed as a natural next step after function identification:

"Okay — so your primary function is [X]. That's the lane. Now let me ask you something different: within [X], what are the specific topics you could talk about for an hour without preparing? The things you actually have opinions about, not just experience in."

This produces:
- **Specific topic tags** (e.g., "supply chain resilience," "healthcare operations," "retail process design") rather than vague category labels
- **Wing Radar search terms** — the topics become the keywords Wing watches for in the user's industry feed
- **Writing Coach content territories** — the topics map directly to the pillar architecture (credibility anchor, conviction anchor, ecosystem anchor)
- **Function confirmation signal** — if the topics don't align with the identified function, that's diagnostic data for Foundation 2

### The intake exception

If a user volunteers topic-specific language during intake (e.g., "I want to be known for AI ethics" during Q4 open narration), Wing captures it and stores it as a provisional topic signal. This is volunteered data, not asked. It confirms or accelerates Foundation 1 without adding a question to the intake.

Wing can reference it in the Foundation 1 transition: "You mentioned AI ethics during our first conversation. Let's see which function that maps to — it could sit in product, in policy, or in marketing depending on which angle is yours."

---

## Section 2: Baseline Metrics

### The institutional reporting need

Berkeley's renewal conversation needs before/after improvement data at the cohort level. The budget defense package (Feature List item 3.3) requires metrics that answer the dean's question: "What changed because students used this platform?"

The most compelling before/after metrics for institutional reporting:
- **Positioning clarity** — how clear is the user about their professional positioning?
- **Content comfort** — how comfortable are they putting themselves out there professionally?
- **Visibility confidence** — how confident are they that the right people can find and understand what they do?
- **Articulation readiness** — can they describe what they do in a way that's specific, memorable, and evidenced?

### The methodological tension

The Methodology Content Guidance (Section 6.4) explicitly states: self-promotion comfort should be "diagnosed from session language rather than intake self-ratings, since a high content-comfort rating routinely reflects comfort with the act of writing, not with public self-assertion."

This means self-report baselines measure something — the user's *perception* of their own clarity and comfort — but not the thing Wing actually changes. A user can rate themselves 8/10 on positioning clarity at intake and still be unable to name their function. The self-report is useful for institutional reporting (it shows perceived improvement, which is what the user experiences) but unreliable for coaching (Wing should diagnose from behavior, not from self-assessment).

### The two-layer solution

**This section is superseded by Wing_Intake_Design_v3.md, Phase 3.5.**

V3 specifies: three baselines (B1–B3) on a 1–5 scale with conditional follow-ups per score band, framed as "Quick — three numbers." The v3 specification is canonical for baseline design. What follows in this section is retained only as historical context for how the two-layer architecture was derived. If any detail below conflicts with v3, v3 governs.

**The two-layer principle remains valid:**
○ Layer 1 (self-report, B1–B3 at 1–5): for institutional reporting — the numbers Berkeley sees
○ Layer 2 (behavioral, computed from session data): for Wing's internal coaching calibration — what Wing actually uses

Re-measurement cadence: T1 post-Foundation, T2 30 days, T3 90 days. The 90-day number is the budget defense package metric.

For the full baseline specification including question wording, conditional follow-ups, and framing language, see v3 Phase 3.5.

---

## Section 3: What Stays Out of Intake

The following data needs, which the old branding assessment captured, are now captured elsewhere. They should NOT be added back to intake.

| Data need | Why not intake | Where it lives now |
|---|---|---|
| Current title and company | Redundant with LinkedIn upload | LinkedIn extraction in Phase 4 |
| Years of experience | Often volunteered in Q2; formal capture from LinkedIn | LinkedIn extraction + Q2 volunteered data |
| Target industry | Too vague pre-Foundation; becomes specific post-Foundation 1 | Foundation 1 → Foundation 2 transition |
| Target role/title | Same problem — vague pre-Foundation | Module 4 (Career Exploration) or Foundation 2 |
| Skills self-assessment | Self-report unreliable for skills; behavioral data is better | Module 8 (Competency Intelligence) |
| Personality type (MBTI, Enneagram, etc.) | Was folded into the SLI Recommended Assessment module, now eliminated and folded into onboarding | Optional supplementary document upload in Phase 4 or Module integration (Tier 2) |
| Academic program details | Captured in intake Q3 | Intake Q3 |
| How they heard about Wing | Administrative, not coaching | Registration form (separate from intake conversation) |

---

## Summary: The New Data Capture Architecture

| When | What gets captured | Who it serves |
|---|---|---|
| **Registration (pre-intake)** | Email, name, institutional link, how they heard about Wing | Operations, analytics |
| **Intake Phase 1–3 (conversational)** | Motivation, situation, institutional context, open narration, behavioral identity signals, hidden strengths, reveal reaction | Wing's coaching engine, audience track assignment, identity reference frame detection |
| **Intake Phase 3.5 (post-reveal)** | Baseline self-assessment B1–B3 on a 1–5 scale with conditional follow-ups — see v3.3 Phase 3.5 | Institutional reporting (baselines) |
| **Intake Phase 4 (upload + transition)** | Document uploads (LinkedIn, resume), urgency signals | Wing's coaching engine (document data) |
| **Foundation 1 close** | Primary function, topic identification, function confidence level | Wing Radar, Writing Coach, network intelligence, Foundation 2 opening move |
| **Foundation 2** | Credibility assessment, evidence inventory, positioning clarity (behavioral) | Coaching engine, institutional reporting (behavioral layer) |
| **Foundation 3** | Stories, content comfort (behavioral), self-promotion comfort (initial behavioral read) | Writing Coach, content strategy, coaching calibration |
| **T1 re-measurement (post-Foundation)** | B1–B3 re-asked | Institutional reporting (first improvement data point) |
| **T2 (30 days)** | B1–B3 re-asked + identity adoption metric | Institutional reporting (sustained improvement) |
| **T3 (90 days)** | B1–B3 re-asked | Budget defense package, institutional dashboard |

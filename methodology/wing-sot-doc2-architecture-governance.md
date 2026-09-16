# Document 2 — Wing Platform Architecture & Governance
## Platform 2.0 Source of Truth — August 26, 2026
## Complete and standalone. No cross-references required.

---

## CROSS-DOCUMENT INDEX

| Looking for... | It's in... |
|---------------|-----------|
| A specific card's full spec | Doc 1 (Heuristic Compendium), module section for that card's prefix |
| Whether something is built | This document, Section 12 (Build Reconciliation) |
| A decision Aditya raised | This document, Appendix A (Decision Log) |
| What's deferred post-Sep 1 | This document, Appendix C (Platform 2.5 Backlog) |
| Element-by-element build status | This document, Appendix B (Build Status Tracker) |
| Registration form fields and IG-S06 age trigger | This document, Section 1A (Pre-Intake: Registration) |
| Content triggers, cadence, micro-journal | Doc 3 (Content & Engagement) |
| Dashboard layout, navigation, UX gates | Doc 4 (UX & Interface) |
| Retired claims, frequency rules, voice | Doc 5 (Claims & Voice Discipline) |

---

# SECTION 1: MODULE REGISTRY

**User journey sequence:** Registration → Intake → Foundation → Modules (+ system events)

| # | Module | Purpose | Cards | Gates | Exercises | Total | Layer | Sep 1? |
|---|--------|---------|-------|-------|-----------|-------|-------|--------|
| REG | Registration | Account creation + institutional demographics (form, not conversation) | — | — | — | 0 | Pre-entry | **BUILT** (Platform 1.0 form, age field added) |
| IN | Intake | Opening conversation — identity capture, track assignment, reveal, baselines | 28 | 13 (IG-INT) | — | 41 | Entry | **BUILT** |
| F1 | Foundation 1 — Functional Identity | Identify primary function from the Big Five | 9 | 2 | — | 11 | Foundation | **BUILT** |
| F2 | Foundation 2 — Credibility Assessment | Extract evidence of credibility (VC credibility test) | 8 | 2 | 2 | 12 | Foundation | **BUILT** |
| F3 | Foundation 3 — Story Development | Extract real experiences for content and interviews | 9 | 2 | 4 | 15 | Foundation | **BUILT** |
| M4 | Module 4 — Career Exploration | Career ideas through honest education | 7 | 1 (H-412) | 6 | 14 | Exploration | **BUILT** |
| M5 | Module 5 — JD Analysis | Personalized job description fit assessment | 6 | 1 | — | 7 | Exploration | **BUILT** |
| M6 | Module 6 — Writing Coach + Content System | Content coaching + trigger layer + publishing flow + image generation | 11 | 10 (2 original + 5 M6 + 3 IMG) | 3 | 33 | Engagement | Later |
| EX | Exercise Library | Design thinking exercises routed to modules | — | — | 17 | 17 | Cross-module | **BUILT** |
| M7 | Module 7 — Wing Radar | Weekly briefs, topic suggestions, engagement monitoring | 8 | 2 | — | 10 | Engagement | **Baby Radar** |
| M8 | Module 8 — Competency Intelligence | Surface and develop professional competencies | 5 | 4 | — | 9 | Skill-building | Later |
| M9 | Module 9 — Power & Influence | Influence coaching, power dynamics, resistance detection | 17 | 6 | — | 23 | Skill-building | Later |
| M10 | Module 10 — Interview Prep | Make positioning survive live evaluative pressure | 22 | 9 | — | 31 | Skill-building | Later |
| M11 | Module 11 — Network Intelligence | Network audit, gap analysis, strategic outreach | 18 | 10 | — | 28 | Skill-building | Later |
| M12 | *Reserved, unassigned* | Number skipped when Module 13 was named | — | — | — | — | — | — |
| M13 | Module 13 — AI-Mediated Market | Positioning in an AI-mediated landscape | 10 | 7 | — | 17 | Skill-building | If time |
| RC | Reveal Cycle | Cross-module synthesis engine (system event) | 13 | 12 | — | 25 | System event | Capture BUILT |
| PR | Positioning Refresh | Detect and resolve positioning drift (system event) | 12 | 6 | — | 18 | System event | SPECIFIED only |

**Running total:** 329 codeable elements. Positioning Refresh (18) is SPECIFIED but excluded from running total — not yet delivered to engineering.

**Running total reconciliation:** 209 (compendium through all V+S gates) → 250 (intake +41) → 264 (research-derived +14) → 281 (Module 13 +17) → 287 (platform updates +6) → 312 (Reveal Cycle +25) → 329 (content system +17). Each step verified against source documents.

---

# SECTION 1A: PRE-INTAKE: REGISTRATION

**Source:** Wing_Registration_Form_Spec.md (August 26, 2026). SPECIFIED — not yet delivered to Aditya.

**Design principle:** Registration collects what the institution requires. Intake collects what Wing requires. Registration is a form. Intake is a conversation. Wing never references registration data in coaching — it flows to the institutional reporting dashboard only.

Platform 1.0 had a five-step registration (43% stalled at submit). Steps 1–3 (academic context, career goals, student experience) moved into the conversational intake. What remains is account creation plus institutional demographics.

### Registration Fields — One Screen

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| First name | Text | Yes | |
| Last name | Text | Yes | |
| Email | Text | Yes | |
| Phone | Text | Optional | Needed for SMS (heartbeat, micro-journal) |
| **Age** | Number (16–65+) | **Yes** | **NEW.** Data source for IG-S06. Under 18 triggers IG-S06 silently. |
| Gender identity | Radio + text | Yes | Woman / Man / Non-binary / Prefer to self-describe / Prefer not to say |
| Race/Ethnicity | Multi-select | Yes | IPEDS categories. Unchanged from Platform 1.0. |
| How did you hear | Dropdown | Optional | |
| Privacy acknowledgment | Checkbox | Yes | |
| Marketing opt-in | Checkbox | Optional (default unchecked) | |

### Three Architectural Contributions

**1. IG-S06 age trigger.** Registration — not audience track inference — is the data source for IG-S06. The age field provides a definitive signal. Under 18 triggers IG-S06 silently without explaining why it's collected. This resolves the Aditya-flagged problem: Wing never asks age during intake (IG-INT03), so for undergraduates, age was never established. Registration captures it before the conversation begins.

**2. Institution URL routing.** The URL (berkeley.sli.pro) handles institutional routing. No university field needed in registration or intake. Institution configuration (which modules are available, which demographic fields are required, IG-S06 on/off) flows from the URL, not from a form field.

**3. User journey sequence.** Registration → Intake → Foundation → Modules. Submit leads directly to the chatbot (intake H-010, Wing's self-introduction). No progress bar. No "step 1 of 5." One screen.

### Institution Configuration

| Setting | Default | Berkeley |
|---------|---------|---------|
| IG-S06 (minor protection) | ON | **OFF** (cohort certified 18+) |
| Gender/Race fields | Required | Required |
| Age | Required | Required |
| Custom fields | None | TBD (up to 3) |

### What Moved Out of Registration into Conversation

Professional situation → Intake Q2. University/program details → Intake Q3 + URL routing. Career goals → Intake Q4 + Foundation 1. First-gen status → Foundation 1 or 2 (when trust is established). Intersectional identity question ("Do any of these shape how you show up professionally?") → Foundation 1 or 2, connected to IG-S09/IG-S10 (coaching-relevant, not reporting-relevant — feels clinical in a form, natural in a conversation).

### D2C and Enterprise Variants

D2C: age stays (IG-S06), everything else drops or becomes optional. Enterprise: different demographic requirements (department, employee ID) — configuration layer handles this.

---

# SECTION 2: PREFIX NAMESPACE (11 categories)

| Prefix | Meaning | Deployment | Example |
|--------|---------|------------|---------|
| H-### | Coaching card or module-specific gate, numbered by module | Card library (contextual) | H-101, H-614, H-1301 |
| IG-U### | Universal integrity gate — applies in every module | Card library (contextual) | IG-U006, IG-U014 |
| IG-S## | Safety gate | System prompt (S01,S02,S07,S09,S10) or card library | IG-S01, IG-S06 |
| IG-INT## | Intake-specific integrity gate | Card library (contextual) | IG-INT01–IG-INT13 |
| RT-## | Reveal template (shorthand within H-020+ range) | Card library | RT-01–RT-13, RT-15 |
| IG-V## | Voice/tone integrity gate | System prompt (V01–V03) or card library (V04–V07) | IG-V01, IG-V07 |
| IG-UX## | UX integrity gate | Card library | IG-UX01–IG-UX06 |
| IG-MJ## | Micro-journaling integrity gate | Card library | IG-MJ01–IG-MJ06 |
| IG-RC## | Reveal Cycle integrity gate | Card library | IG-RC01–IG-RC13 |
| PR-## | Positioning Refresh card | Card library | PR-01–PR-12 (SPECIFIED) |
| IG-P## | Positioning Refresh gate | Card library | IG-P01–IG-P06 (SPECIFIED) |

**Classification rule:** H-prefix for module-specific cards and gates. IG-prefix for gates crossing module boundaries. Three sets misclassified under this rule (H-001–007 should be IG-U; IG-1001–1006 should be H-; IG-1101–1107 should be H-). Deferred to post-Sep 1.

---

# SECTION 3: NUMBERING REGISTRY — IG-U ALLOCATION

| Band | Purpose | Codes | Status |
|------|---------|-------|--------|
| IG-U003–U005 | Module 10 universal gates | Voice fidelity, Data provenance, Methodology language leakage | Active |
| IG-U006–U011 | Research-derived universal gates | Barnum Falsifiability (U006), Observation Precision (U007), Competence→Gap→Fixable (U008), Resistance Is Diagnostic (U009), Quote-Then-Extend (U010), Session Close Consolidation (U011) | Active |
| IG-U012–U017 | Platform-wide gates | Evidence Grade (U012), Role-Aware Summarization (U013), Evidence Over Self-Rating (U014), Production Requires Reflection (U015), Module Self-Sufficiency (U016), Opportunity Over Fear (U017) | Active |
| IG-U018–U020 | Module 11 universal gates (final destination) | User-Uploaded Data Handling, Behavioral Inference Disclosure, Task Follow-Up Tone | Active |
| IG-U021+ | Future universal gates | Reserved | — |

**Numbering ownership:** Danielle owns all numbering. Allocation rule established August 24 after three collision events.

**Intentional gaps:** H-706, H-707 (reserved for Module 7 expansion). Module 12 (reserved, unassigned).

---

# SECTION 4: GATE DEPLOYMENT — TWO TIERS

**System-prompt gates (always-on, every turn, every module):**

| Gate | Function |
|------|----------|
| IG-S01 | Crisis Language Detection (priority 3.0) |
| IG-S02 | Harm-to-Others Prevention (priority 3.0) |
| IG-S07 | Anti-Sycophancy (priority 2.0) — Wing never validates without evidence |
| IG-S09 | Cultural Attribution Style Recognition (priority 2.0) |
| IG-S10 | Backlash-Aware Coaching (priority 1.5) |
| IG-V01 | Wing Voice Consistency — sharp-friend test |
| IG-V02 | Trait Hierarchy by Context — personality emphasis shifts by session type |
| IG-V03 | Collaborative vs. Observational Language — "let's" for action, "I" for observation |
| System Personality Directive | 12 qualities + 10 anti-patterns (see Section 11) |

**Card-library gates (contextual, per-turn selection when signal matches):**
All IG-U gates, all H-prefix module-specific gates, IG-S03–S06/S08, IG-V04–V07 (Module 6 only), IG-UX, IG-MJ, IG-RC, IG-INT families, and all coaching cards/exercises.

---

# SECTION 5: SAFETY GATES — IG-S SERIES

| Code | Name | Priority | Deployment | Status | Notes |
|------|------|----------|------------|--------|-------|
| IG-S01 | Crisis Language Detection | 3.0 | System prompt | **BUILT** | Triggers platform-wide suppression (Section 6) |
| IG-S02 | Harm-to-Others Prevention | 3.0 | System prompt | **BUILT** | Wing names the boundary, redirects |
| IG-S03 | Unhealthy Attachment Detection | 2.0 | Card library | **BUILT** (response only) | Detector (session frequency counting) deferred post-Sep 1 |
| IG-S04 | Obsessive Engagement Detection | 1.5 | Card library | DELIVERED | |
| IG-S05 | Power Coaching Scope Limitation | 1.5 | Card library | DELIVERED | Module 9 only |
| IG-S06 | Minor User Protection | 2.5 | Card library | **BUILT** | **INSTITUTION-CONFIGURED.** Berkeley OFF. Undergraduate = career stage, not age. Lighter tone, modules open. Full IG-S06 fires only if user explicitly states under 18. |
| IG-S07 | Anti-Sycophancy | 2.0 | System prompt | **BUILT** | Wing never validates without evidence |
| IG-S08 | Content Harm to Third Parties | 1.5 | Card library | DELIVERED | Safety Architecture governs (not "evidence fabrication" — that was a reconstruction error in Missing References) |
| IG-S09 | Cultural Attribution Style Recognition | 2.0 | System prompt | **BUILT** | Never penalize collective attribution as a gap without context check |
| IG-S10 | Backlash-Aware Coaching | 1.5 | Card library | DELIVERED | Not active during intake. Fires in M6/M9/M10 visibility coaching. Tactic menu required for all assertiveness coaching. |

**Gates active during intake:** Six (S01, S02, S03, S06, S07, S09). v3.3 governs over v1.8's four.

---

# SECTION 6: PLATFORM-WIDE SUPPRESSION STATE

**Source:** Danielle → Aditya, August 24 evening email. Supersedes all prior suppression references.

**Trigger:** IG-S01 fires for a user.

**Scope:** ALL Wing-initiated contact pauses: Radar, micro-journal prompts, SMS, email, re-engagement triggers (H-709), dashboard notifications, baseline re-measurement, Module 13 check-ins, Positioning Refresh triggers. No exceptions.

**Rules:**
- 7-day minimum hold — a floor, not a duration.
- Does NOT auto-lift. Holds until the user re-engages on their own (opens app, starts session). Auto-resume IS a scheduled re-contact, which is what the hold exists to prevent.
- After 30 days without return: ONE soft welfare check — "I'm here when you're ready." Not coaching, not a prompt. The only automated contact during a hold.
- No escalation of frequency. No response to welfare check → no further contact.
- User can always: open the app, start a session. Suppression applies to what Wing initiates, never to what the user opens.

**H-709 inversion (OPEN):** H-709 fires on engagement decay — the exact behavioral pattern of crisis-related silence. During suppression, H-709 must NOT fire. Interim: Radar pauses with everything else. Full specification (detection sensitivity, institutional notification, escalation protocol) remains open — requires Cooley input before enterprise deployment.

**CONFIRMED BUILT:** Interim suppression flag with 7-day hold, one owner, Radar pauses. Built by Aditya since August 24.

---

# SECTION 7: PLATFORM VARIABLES

| Variable | Values | Detection | Default | Notes |
|----------|--------|-----------|---------|-------|
| Audience track | 8 tracks (undergraduate, early_career, mid_career, executive, entrepreneur_early/fundraising/scaling, career_returner) | 2-signal threshold | Hold tentatively on 1 signal | Multi-valued — parent + sub-tag hierarchy |
| Doorway | 4 dimensions (audience track, emotional tone, response length, vocabulary) | 2-signal for track; 1-signal for tone, length, vocabulary | Per Aug 17 email | Aditya's conservative default (2-signal for all) corrected |
| Identity reference frame | external, internal, mixed, insufficient_signal | 2-signal threshold from intake, refined over sessions | Default to external (safer — false conservative costs slower session; false aggressive costs a user) | Full signal tables in Research-Derived Gates doc |

**Personality type (Enneagram):** Compendium delivery_adaptation fields reference "Type" labels but personality type is not a documented platform variable. May not be a populated field at runtime. Delivery_adaptation branches referencing Type may be unreachable. Needs confirmation from Aditya.

---

# SECTION 8: CROSS-MODULE ROUTING

### 10 Behavioral Rules

| # | Rule | Key principle |
|---|------|---------------|
| 1 | Never interrupt mid-conversation | Queue at natural transition points. Safety is the only exception. |
| 2 | User can always decline | 14-day cool-down on declined routes. Declined routes visible in module library. |
| 3 | Session state preserved | Thread model: each module entry creates a new thread (SCRUM Aug 13 decision, confirmed in Prototype Review). Preserved indefinitely. Chunked recap on return. |
| 4 | Priority resolution (6 levels) | **Safety → user-stated need → backward over forward → most specific over most general → sequence weight → recency.** Max 2 options if genuinely tied. "Backward over forward" is load-bearing — Foundation misalignment undermines everything downstream. |
| 5 | User-initiated switching wins | Via conversation or UI. Wing brings cross-module context but never resists. |
| 6 | Automated touchpoint routing | Lower-pressure rules for Radar/journal/dashboard. 3-response minimum for journal triggers. |
| 7 | **One route per session maximum** | After a route is accepted, all further triggers queued. Safety exempt. (Adopted from later Behavioral Rules doc — simpler than 3-route limit in earlier Cross-Module doc.) |
| 8 | Trigger transparency | Every suggestion names the specific behavioral observation. No "Based on your profile, I recommend Module 9." |
| 9 | Queued routes on dashboard | Wing's Recommendation section. 30-day expiration. One surfaced per session. |
| 10 | Reveal Cycle exempt | Cross-module synthesis IS its purpose. Doesn't receive routing. Output seeds future routing. |

### Route Summary

34 total designed. 6 gaps (M6, M8, M10 — no outbound routes). **4 routes in first release:** F2↔F1 and F3↔F2 (bidirectional Foundation circular routes). Remaining 30 are later release. Logging infrastructure built.

---

# SECTION 9: STANDING RULES

### Platform standing rules

1. **Cross-thread gate checking.** Any material entering a component from outside must be checked against the component's gate list. One pass. (Adopted after intake research collided with Reveal thread gates.)
2. **Forward tagging at authorship.** Three tags per card at creation: external provenance, internal authorship, card provenance (EXTRACTED-DOCUMENTED / EXTRACTED-RECALLED / DESIGNED).
3. **Scrutiny asymmetry.** Externally-sourced material checked harder than internally-developed.
4. **Held-candidate expiry.** Three cycles. Deliver with readiness constraint noted, or retire.
5. **Q9 open-first principle.** Follow-up questions open-ended first, A/B scaffolding only if user needs it. (MI + Cognitive Interview basis. Applied to RT-07, RT-12, RT-15. Should apply to all future coaching_move follow-ups.)
6. **Construction ban scoping.** Bans are scoped by whether the instance is load-bearing (structural work) vs ornamental. Load-bearing instances kept or recast. When a ban produces a gate violation or loses semantic content, the instance is load-bearing and the ban does not apply. Flag for human judgment rather than auto-fixing.

### IG-S09 reusable pattern

Every card using language detection to identify a gap must be checked against IG-S09. If the detected pattern could be culturally normative, the card must either exclude the pattern or add a detection step distinguishing self-deprecation from collective attribution. Future sweep needed: Module 9 power moves, Module 8 self-assessments, Module 6 archetype calibration.

---

# SECTION 10: IG-V01 CAREER RETURNER REGISTER

**Source:** Danielle → Aditya email, August 17. NOT in compendium v3 — the addition was promised but did not make it into the version on file. IG-V01's delivery_adaptation lists five audiences; career returner is missing.

**Career returner register (canonical):**

Warm but not pitying. Wing treats career returners as accomplished professionals who took time away, not people who need rebuilding. Forward-looking, never backward-apologizing. The gap is the story, not the obstacle. Confidence-rebuilding through evidence, not affirmation — "look at what you actually did before you stepped away. That evidence is still yours."

Practical differences from mid-career: Foundation 2 probes for evidence from before the gap. Module 10 preps the gap narrative. Module 6 starts with lower-pressure content. The re-entry itself is content material.

**Banned framings:** "How do we address the gap?" / "Employers will want to know why you stepped away." Pre-output blocked strings.

**Correct framings:** "What did the time away clarify for you?" / "What's different about what you want now?" / "I stepped away for [X years]. Here's what I see now that I couldn't see when I was in it."

---

# SECTION 11: SYSTEM PERSONALITY DIRECTIVE

### 12 Positive Qualities

1. Thinks out loud — shows reasoning, not conclusions
2. Genuinely curious — "Wait — you said X but that's the third time Y"
3. Dry, contextual humor — born from shared context, never at user's expense
4. Sits with complexity — doesn't rush to resolve
5. Remembers and callbacks — references prior sessions naturally
6. Celebrates specifically — names the specific thing
7. Challenges with evidence — "Your own stories show X, and it doesn't match"
8. Gives space to disagree — takes disagreement seriously
9. Matches user's energy — adapts without commenting
10. Knows when to shut up — brevity is confidence
11. Notices what the user doesn't say — "Not one story mentions your team"
12. **Connects dots across the platform** — the defining trait, the retention argument in one sentence

### 10 Anti-Patterns

1. Never validate before responding (no "Great question!")
2. Never restate the question
3. Never default to lists or bullets
4. Never repeat same response structure
5. Never close with service prompt (no "Anything else?")
6. Never reference being an AI (exception: M13 IG-1307)
7. Shift emotional register within sessions
8. Reference the shared relationship
9. Have opinions — Wing commits to a read
10. Use silence and brevity

---

# SECTION 12: DELIVERY & BUILD RECONCILIATION

### Delivery Timeline

| Date | From→To | What | Running total |
|------|---------|------|---------------|
| Aug 17 | Danielle→Aditya | Compendium v3, routing rules, answers to blocking questions | 209 |
| Aug 18 | Danielle→Aditya | Intake v1.1 + research-derived gates (14) | 265 (v1.1) |
| Aug 19 | Danielle→Aditya | v1.7 intake (discard v1.1) | 264 |
| Aug 20 | Danielle→Aditya | **MASTER DELIVERY:** v1.8, v3.3, Platform Updates, RC v4+amendments, M13 v1.2, data migration, self-description capture (8 attachments) | 312 |
| Aug 24 | Danielle→Aditya | Missing References, all 32 decisions answered, IG-S06/suppression amendments, H-209/RT-06/H-RC10 corrections, allocation rule | 312 (+content system = 329) |

### Build Status Summary (August 24)

| Status | What | Count |
|--------|------|-------|
| **CONFIRMED BUILT** | Original 53 cards+gates, intake (9 questions, 14 templates, reveal selection, baselines, identity frame, 10 signals), 6 safety gates in system prompt, self-description capture, chunked delivery, reveal pause, suppression hold, IG-RC13 linter, Reveal Cycle capture layer, 4 routing routes+logging, 32 test suites | ~130 |
| **DELIVERED** (build unknown) | Research-derived gates, Module 13, platform updates (IG-U014 confirmed applied to baselines), Reveal Cycle cards/gates, content system | ~140 |
| **DEFERRED** (later release) | Modules 6–11 full build, full Radar, content system triggers/publishing/images, Positioning Refresh, remaining 30 routes | ~59 |
| **SPECIFIED** (not delivered) | Positioning Refresh (18 elements from SLI.pro #2) | 18 |

**September 1 holds.** Confirmed by Aditya August 24.

---

# SECTION 13: RESEARCH CITATIONS FOR DESIGN DECISIONS

### IG-U014 — Evidence Over Self-Rating

Kruger & Dunning (1999), "Unskilled and Unaware of It." Bottom-quartile performers self-estimated at 60th–70th percentile. Self-report (B1–B3) serves institutional reporting only; behavioral evidence governs coaching decisions. Source: Perplexity deep research §4.

### IG-U015 — Production Requires Reflection

Portfolio pedagogy: four-level reflection model (learning moments → recognition → transformation → professional identity). Systematic scoping review: checklist-oriented ePortfolio designs produced superficial engagement; purpose-driven designs with reflection promoted identity development. Production without reflection builds documentation, not identity. Sources: European Centre for Research on Professional Learning (2024); BMJ Open (2023); PubMed (2025). Perplexity §6.

### IG-U016 — Module Self-Sufficiency

Wood, Bruner & Ross (1976) contingent tutoring: effective tutors calibrate help to moment-to-moment performance rather than redirecting. Just-in-time vs just-in-case: in-context support outperforms stop-and-fix remediation ~3:1. Non-linear entry: n=543 self-paced students, completing assignments out of sequence positively associated with completion; forced sequential movement r=−.374. BetterUp uses assessment-driven routing, not prerequisite locking. Perplexity §§1–3.

### IG-U017 — Opportunity Over Fear

Meta-analysis of loss-framed incentive contracts: 0.4 SD lab / 0.0 SD field — effect vanishes in real-world settings. Gain-framed messages trigger more reactance in some contexts. Opportunity framing is the lower-risk default for voluntary coaching. Perplexity §8. Key citations: loss-framing meta-analysis (working paper); APA PsycNET doi:10.1037/a0034415; NBER Working Paper 29828.

### Module 13 Mini-Intake (H-1301)

Convergence of three findings: (1) Dunning-Kruger — users who most need Foundation are most likely to skip it. (2) Just-in-time scaffolding outperforms redirect-and-return 3:1. (3) Forced sequential movement r=−.374. Design: 2-question behavioral evidence elicitation + offered-not-forced Foundation route. Perplexity §§1–4. Full references in Module13-Entry-Design-Research.md.

---

# SECTION 14: DESIGN DECISIONS FROM PROTOTYPE REVIEW

**Source:** Wing_Prototype_v1_Design_Review.md (August 18, 2026). Confirmed decisions, not proposals.

### Dashboard Layout

| Position | Component | Purpose |
|----------|-----------|---------|
| Top (full width) | SLI Card | Identity anchor — positioning statement, function, status |
| Upper left | Micro-Journal Prompt | Lowest-friction engagement — one answer, under 60 seconds |
| Upper right | Wing Recommends | Deeper engagement — one action, one reason, one button |
| Bottom left | Wing's Observations | Ambient intelligence — 1–2 observations from Radar/Reveal |
| Bottom right | What You've Built | Portfolio view — creation language, not completion |

### Thread Model (SCRUM August 13 decision)

Each time a user enters a module, it starts a new conversation thread. Wing opens with context from everything it knows, but it's a fresh thread. Users access previous threads from the sidebar. Multiple threads within a module is normal. Wing always knows what happened in prior threads regardless of which one the user is in. (H-002 cross-session provenance.)

### Typography

Charter (serif) → identity, authority, brand moments: SLI statement on dashboard, section headers in module library, identity-level labels. Montserrat (sans-serif) → body text, UI, chat: Wing's messages, user's messages, navigation, buttons, prompts. Two fonts, two functions.

### Color Hierarchy

Midnight (#303454) → primary structural accent: section headers, module library categories, dashboard labels. Wine (#391920) → sidebar, dark backgrounds, supporting authority. Aqua (#BED6D1) → Wing's chat bubbles. Salmon (#D35C4A) → CTA buttons (with carve-out: never on error/warning states). Sand (#b3b19c) → de-emphasis, secondary cards.

---

# SECTION 15: RESOLVED FLAGS

| # | Flag | Resolution | Date |
|---|------|------------|------|
| 1 | H-411/H-412 collision | Gate→H-412, exercises keep numbers | Aug 17 |
| 2 | IG-U leading-zero collision | Three renumberings → IG-U018–020. Allocation rule. | Aug 17–24 |
| 3 | 209 vs 207 | 209 correct. S07/S08 in standalone Safety Architecture, not compendium inline. | Aug 25 |
| 4 | Module 9 count | 23 (not 27). H-913–917 gates counted once. | Aug 25 |
| 5 | IG-S08 definitions | Safety Architecture governs: content harm to third parties. | Aug 25 |
| 6 | H-001 version | Aug 24 governs: Evidence Accumulation Threshold (2 Tier 1 events). | Aug 25 |
| 7 | IG-S06 institution-configured | Berkeley OFF. Lighter tone, modules open. | Aug 24 |
| 8 | Routing chaining | 1 route/session + 6-level priority. | Aug 25 |
| 9 | Suppression state | 7-day minimum, user-initiated return, 30-day welfare, no auto-resume. | Aug 24 |
| 10 | H-916 intervention_type | Changed to META (was COACH). | Aug 17 |
| 11 | IG-S07/S08 gaps | Both exist in standalone Safety Architecture. Not intentional gaps. | Aug 25 |
| 12 | Module 12 | Reserved, unassigned. | Aug 25 |
| 13 | H-706/H-707 | Reserved for future Module 7 expansion. | Aug 25 |
| 14 | PR-/IG-P- namespace | Own prefix pair. Eleven categories total. | Aug 25 |

---

# SECTION 16: SOURCE DOCUMENTS PROCESSED

32 documents, ~18,000 lines:

Wing_Master_Module_Compendium-4.md (6,232) · Wing_Platform_Updates_Aug19.md (158) · Wing_2_0_Architecture_Explainer_v2.pdf (~12pp) · SLIpro_Cross_Project_Continuity_Brief §XIII (74) · Wing_Voice_Tone_Integrity_Gates.md (388) · Wing_Safety_Architecture.md (305) · Wing_Cultural_Competence_Gates.md (99) · Wing_Integrity_Gates_Additions_v2-2.md (169) · Wing_Missing_References_for_Aditya.md (120) · Wing_Research_Derived_Gates-2.md (665) · Wing_Cross_Module_Routing_Rules-2.md (212) · Wing_Routing_Behavioral_Rules.md (194) · Wing_Intake_Heuristic_Cards_v1_8.md (670) · Wing_Intake_Design_v3_3.md (633) · Wing_Intake_Data_Migration_v2-2.md (65) · Wing_SelfDescription_Capture_v2.md (52) · Wing_Reveal_Cycle_System_Event_v4_CANONICAL.md (659) · Wing_Reveal_Cycle_v4_Amendments.md (~100) · Reveal_Readiness_Mechanism_For_Aditya.md (~130) · Wing_Module13_Heuristic_Cards_v1_2.md (285) · Wing_SystemEvents_Module13_Design.md (1,458) · Wing_SystemEvents_Module13_VoiceStandard_v2_Revision_Brief.md (221) · Wing_Content_System_v1.md (396) · Wing_Content_Trigger_Rules_v1.md (265) · Wing_Approachable_MicroJournal_Library_Final.md (836) · Wing_Comprehensive_UX_Recommendation-2.md (749) · Wing_UX_Addendum_Final.md (521) · Wing_All_Prompts_Copy_Final.md (439) · Wing_Exercise_Library_Cards.md (325) · SLIpro_Voice_Standard_v2-3.md (534) · Wing_Risk_Register_for_Adi.md (~150) · Aditya email thread (17 messages, ~15pp) · Standing_Rules_Engineering_Decisions.md (195) · Wing_RevealCycle_InputLayer_Spec-2.md (~450) · Wing_SystemEvents_Module13_DeliveryPack-2.md (365) · Wing_Prototype_v1_Design_Review.md (220) · Wing_Registration_Form_Spec.md (~75)

---

# APPENDIX A: CONSOLIDATED DECISION LOG

## Aditya Email 1 — August 17

| # | Question | Resolution |
|---|----------|------------|
| BLOCKER | Modules locked or not? | IG-UX01 governs. Rebuild 6 screens. |
| D1 | H-916 mislabeled | META, not COACH. |
| D2 | Safety gates (IG-S01–S10) | Exist in standalone doc. Four in system prompt for first release. |
| D3 | Route count 27 vs 34 | 34 total. 4 in first release. |
| T1 | IG-U leading-zero | Module 11 → IG-U006–008 (then collided twice more). |
| T2 | H-411/H-710 dual use | Gate versions renumbered. |
| T3 | H-308 to universal | Becomes H-007. |
| V1 | Intake lead traits | ENCOURAGING + CURIOUS. |
| V2 | Doorway thresholds | 2-signal track, 1-signal tone/length/vocabulary. |
| V3 | Career returner register | Own register, not mid-career default. |

## Aditya Email 2 — August 24 (12 decisions)

| # | Question | Resolution |
|---|----------|------------|
| 1 | Module 11 collision at U012–014 | IG-U018–020. Danielle owns all numbering. |
| 2 | Q5.5 location | Both correct, different jobs. v3.3 missing F1 close. |
| 3 | IG-INT12 wording | v3.3 governs. RT-06 cross-reference fix. |
| 4 | IG-INT04 gate count | Six (v3.3), not four (v1.8). |
| 5a | "Usually" frequency claim | Yes when population claim. No for linguistic observation. |
| 5b | "At your stage" | Cut. |
| 5c | Eight specific claims | Cut all. H-025 gendered line cut. |
| 6 | IG-RC13 source | Platform Updates canonical. |
| 7 | Running total 312 | Provisional. Hold 11 as research count. |
| 8 | Missing documents | Attached (Missing References). |
| 9 | Input Layer Spec | Keep. |
| 10 | Suppression hold | 7 days, everything pauses including Radar. |
| 11a | M13 reflection steps | Add to H-1307, H-1308, H-1309. |
| 11b | M13 check-in owner | Radar. Inherits suppression flag. |
| 11c | M13 on-ramp wording | Use IG-U016 phrasing. |
| 11d | H-1301 uncited numbers | Cut all three. |
| 12 | Three v1.8 items | All confirmed. "Let's go." |

## Aditya Email 3 — August 24 (20 items)

| # | Question | Resolution |
|---|----------|------------|
| 1.1 | IG-S06 undergraduates | Institution-configured. Berkeley OFF. |
| 1.2 | 195 linter findings | Send the list. Pending. |
| 1.3 | Module 11 collision again | IG-U018–020 confirmed. |
| 1.4a | RT-06 corrected copy | Provided — Q5×Q6 cross-reference. |
| 1.4b | H-209 missing | Written — Aspiration ≠ Evidence. |
| 1.4c | H-RC10 "Radar continues" | Corrected — "Radar pauses." |
| 2.1 | Six safety gates | Six is correct. |
| 2.2 | Radar during hold | Radar stops. |
| 2.3 | Hold duration | AMENDED: 7-day minimum, user-initiated return, 30-day welfare. |
| 2.4 | IG-S03 response before detector | Correct order. |
| 2.5 | Gate 2 conditions | Five govern. |
| 2.6 | H-001 vs Gate 2 | H-001 at 2, Gate 2 at 4. Both correct. |
| 3.1 | Prose threshold | Keep (3 words). |
| 3.2 | Pause timings | Keep (0.5–2.5s). Tune after cohort. |
| 4.1 | Gates during intake | S08 yes, S05 M9 only, S10 not intake, V03 only. |
| 4.2 | IG-S10 intake | No. Intake does no visibility coaching. |
| 4.3 | M13 check-in + suppression | 7-day hold enough. Radar inherits. |
| 4.4 | Evidence tier tagging | Aditya proposes first pass. Danielle corrects. |
| 4.5 | Untagged prompts | Store null, backfill later. → **CORRECTED: 155 tags now available in Delivery Pack Part F.** |

---

# APPENDIX B: BUILD STATUS TRACKER — ALL 329 ELEMENTS

| Component | Codes | Count | Status |
|-----------|-------|-------|--------|
| Foundation 1 | H-101–110 | 10 | **BUILT** (original 53) |
| Foundation 1 addition | H-111 | 1 | DELIVERED Aug 24 |
| Foundation 2 | H-201–209, H-211–212 | 11 | **BUILT** (original 53). H-209 REVISED Aug 24. H-210 DELIVERED Aug 24. |
| Foundation 3 | H-301–310 (excl 308→007), H-311–314 | 13 | **BUILT** (original 53). H-315 DELIVERED Aug 24. |
| Module 4 | H-401–407, H-412 gate, H-411–416 exercises | 14 | **BUILT** |
| Module 5 | H-501–507 | 7 | **BUILT** |
| Module 6 original | H-601–615 | 15 | **BUILT**. H-616 DELIVERED Aug 24. |
| Module 6 content system | H-620–627, IG-M6-01–05, IG-IMG-01–03 | 17 | DELIVERED. Build status unknown. |
| Exercise Library | 16 cards + H-900 | 17 | **BUILT** |
| Module 7 | H-701–711 | 10 | **BUILT**. H-701 Baby Radar rewrite DELIVERED. |
| Module 8 | H-801–809 | 9 | **BUILT** |
| Module 9 | H-901–923 | 23 | **BUILT** (H-901–922). H-923 DELIVERED Aug 24. |
| Module 10 | H-1001–1022, IG-1001–1006, IG-U003–005 | 31 | DELIVERED. **DEFERRED** to later release. |
| Module 11 | H-1101–1114, EX-1101–1104, IG-1101–1107, IG-U018–020 | 28 | DELIVERED. **DEFERRED** to later release. |
| Universal gates | H-001–007 | 7 | **BUILT** |
| Safety gates | IG-S01–S10 | 10 | 6 **BUILT** (S01,S02,S03,S06,S07,S09). 4 DELIVERED. |
| Voice/tone gates | IG-V01–V07 | 7 | V01–V03 **BUILT** (system prompt). V04–V07 DELIVERED. |
| UX gates | IG-UX01–06 | 6 | DELIVERED. UX01 enforced (6 screens rebuilt). |
| MJ gates | IG-MJ01–06 | 6 | DELIVERED. |
| Intake | H-010–037, IG-INT01–13 | 41 | **BUILT** — rebuilt to 9 questions. |
| Research-derived universal | IG-U006–U011 | 6 | DELIVERED. |
| Research-derived module cards | H-111, H-210, H-315, H-616, H-923 | 5 | DELIVERED Aug 24. |
| Research-derived behavioral rules | 3 rules | 3 | DELIVERED. |
| Module 13 | H-1301–1310, IG-1301–1307 | 17 | DELIVERED. Diagnostic building. Action unblocked. |
| Platform updates | IG-U012–U017 | 6 | DELIVERED. IG-U014 **CONFIRMED** applied to baselines. |
| Reveal Cycle | H-RC01–13, IG-RC01–13 | 25 | DELIVERED. Capture layer **BUILT**. Full cards pending. |
| Content System | H-620–627, H-701 rewrite, IG-M6-01–05, IG-IMG-01–03 | 17 | DELIVERED. Build status unknown. |
| **TOTAL** | | **329** | ~130 BUILT, ~140 DELIVERED, ~59 DEFERRED |

---

# APPENDIX C: PLATFORM 2.5 BACKLOG (Post-September 1)

### Priority 1 — Blocks next cohort or enterprise readiness

| Item | Source |
|------|--------|
| 195 frequency claim fixes (CUT/KEEP/REWRITE) | Aditya linter output, pending |
| IG-S03 detector (session frequency counting) | Safety Architecture |
| Suppression state full specification (detection, institutional notification, escalation) | Cooley input needed |
| H-709 inversion fix (check crisis state before firing) | Platform-wide suppression |
| IG-S06 institutional configuration UI | Admin panel |

### Priority 2 — Completes designed-but-unbuilt features

| Item | Source |
|------|--------|
| Career returner micro-journal prompts (15 new) | Doc 3 gap |
| Positioning Refresh (18 elements, PR-/IG-P- namespace) | SLI.pro #2 design doc |
| Foundation 1 close topic question spec | Migration doc + Aug 24 email |
| Module 13 action layer (if not built by Sep 1) | Doc 1 |
| 6 unidentified prompt rewrites | Aditya linter |
| Content cadence methodology integration (behavioral comfort scale, pillar rotation, pillar-comfort sequencing) | Standing Rules §2.4 |

### Priority 3 — Quality and completeness

| Item | Source |
|------|--------|
| IG-MJ01–06 expansion to 7-component format | Summaries canonical, expansion optional |
| Evidence tier tagging for 235 prompts | Aditya first pass, Danielle corrects |
| Personality type field confirmation | Aditya |
| IG-V01 career returner addition to compendium | Aug 17 email governs |
| H-/IG- prefix retroactive cleanup | ~20 reclassifications |
| IG-S09 sweep: M9 power, M8 self-assessments, M6 archetype | Standing Rules §2.3 |

### Priority 4 — Full platform build

| Item | Elements |
|------|----------|
| Module 6 (Writing Coach) full build | 33 |
| Module 7 (full Radar with feed) | 10 |
| Module 8 (Competency Intelligence) | 9 |
| Module 9 (Power & Influence) | 23 |
| Module 10 (Interview Prep) | 31 |
| Module 11 (Network Intelligence) | 28 |
| Content System full build | 17 |
| Remaining 30 routing routes | 30 |

---

*Document 2 — Wing Platform Architecture & Governance*
*Platform 2.0 Source of Truth — August 26, 2026*
*Complete and standalone. 32 source documents processed, ~18,000 lines.*
*Thread: Platform 2.0 Master Audit & Source of Truth (SLI.pro Advisors & Fundraising)*
*Methodology author: Danielle Carattini · dcara@sli.pro*

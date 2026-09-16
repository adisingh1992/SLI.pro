# Wing Micro-Journaling & Adaptive Routing — Research-Informed Update
## Addendum to the Comprehensive UX Recommendation
### August 9, 2026

---

## What This Document Is

This updates the Comprehensive UX Recommendation sent earlier. That document specified 56 audience-specific heartbeat prompts, 6 UX integrity gates, and behavioral requirements across all 11 modules. Since then, three things have changed:

1. The micro-prompt library grew to 130+ prompts across three separate documents. This document consolidates the behavioral requirements for delivering them.
2. Research was conducted on four areas the original document didn't cover: adaptive prompt selection, population-specific engagement design for three underserved audiences (entrepreneur-fundraising, entrepreneur-scaling, executive), routing logic from prompt signals to module recommendations, and enterprise data aggregation constraints.
3. The research surfaced specific design principles — grounded in named studies with sample sizes — that replace the intuitive design rules in the original document.

This document has two sections:

**For Aditya (Section A):** Behavioral requirements for the micro-journaling engine, adaptive prompt selection, routing logic, population-specific delivery rules, and new prompt sets. Describes what the system needs to do. Does not describe how to build it.

**For Sneha (Section B):** UX/UI specifications for prompt delivery, pattern-reveal presentation, module recommendation cards, population-specific visual adaptations, and notification design.

---

# SECTION A: BEHAVIORAL REQUIREMENTS FOR ENGINEERING

---

## A1. Adaptive Prompt Selection — Replacing Fixed Rotation

The original spec described a 14-day no-repeat rotation with category-based sequencing rules. The research supports replacing this with adaptive selection.

**What the system should do:**

○ Select the next micro-prompt based on which prompt would most reduce uncertainty about the user's current state, not based on a fixed rotation schedule. The concept from the research literature is called JITA-EMA (Just-in-Time Adaptive Ecological Momentary Assessment): rather than cycling through a full library on a preset order, the system evaluates which prompt is most informative given what it already knows about this user right now.

○ Maintain a "state estimate" for each user across several tracked dimensions. The dimensions that matter for prompt selection are:
  ○ Positioning clarity (is the SLI internalized or still performed?)
  ○ Identity drift direction (converging with SLI or diverging?)
  ○ Energy-role alignment (stable, declining, or improving?)
  ○ Competency development trajectory (per Module 8 competency map, if completed)
  ○ Career event status (stable, approaching a transition, or in active transition?)
  ○ Engagement level (response rate trending up, flat, or declining?)

○ After each prompt response, update the state estimate and select the next prompt that would be most informative given the current estimate. In practice, this means: if the system is uncertain whether the user's positioning is drifting, serve a drift-detection prompt. If it already has strong drift data from the last three responses, serve a prompt in a different dimension where uncertainty is higher.

○ Preserve the 14-day no-repeat rule as a floor constraint — no prompt appears twice in 14 days regardless of what the adaptive algorithm recommends.

**Why it matters:** The fixed rotation treats all prompts as equally valuable at all times. The adaptive approach ensures that when Wing detects a signal (drift, competency gap, identity-role mismatch), it follows up with the right prompts to confirm or disconfirm the pattern before recommending action.

---

## A2. Routing Logic — Prompt Signals to Module Recommendations

The original spec did not specify what happens when a prompt response reveals a pattern. The research provides a framework.

**The core architecture: stepped care with accumulation thresholds.**

○ Micro-prompts are the baseline continuous intervention. They run for every active user.
○ A module recommendation is the step-up intervention. It fires only when a pattern emerges across multiple prompt responses — never on a single response.
○ The minimum observation window before recommending a module is **3 prompt responses showing a consistent pattern**. A single response that mentions drift, frustration, or a career event is noted but does not trigger a recommendation. Three responses in the same direction do.
○ Every routing decision point must include a "do nothing" option. Not every pattern requires a module. Some patterns just need to be tracked.

**Routing rules (behavioral descriptions, not code):**

Each rule follows the structure: IF [pattern detected across N responses] THEN [recommend module] UNLESS [withhold condition].

**Rule R1 — Positioning Drift → Foundation Refresh or Positioning Refresh**
○ IF: Three or more consecutive prompt responses use language that diverges from the user's stored SLI (detected through the introduction-replay, borrowed-vocabulary, or hedge-detector prompts)
○ THEN: Recommend Positioning Refresh module
○ UNLESS: The user has completed a Foundation module within the past 30 days (in which case, the language may still be settling — track but don't escalate)

**Rule R2 — Energy-Role Mismatch → Career Exploration**
○ IF: Three or more energy-tracking prompt responses show consistent energy drain in the user's stated primary function
○ THEN: Recommend Module 4 (Career Exploration)
○ UNLESS: The user has explicitly flagged this as a temporary situation (project deadline, organizational change) — track but hold for two more cycles

**Rule R3 — Competency Gap Detected → Module 8 (Competency Intelligence)**
○ IF: Competency evidence prompts (oblique or literal) show consistent low scores or gaps in a specific competency domain across three or more responses
○ THEN: Recommend Module 8 (Competency Intelligence) with the specific competency domain pre-loaded
○ UNLESS: The user is currently mid-cycle in a Module 8 engagement (don't stack)

**Rule R4 — Career Event Detected → Event-Specific Module**
○ IF: A prompt response mentions a new job, new role, new manager, interview, recruiter outreach, promotion, layoff, or organizational change
○ THEN: Recommend the most relevant module:
  ○ New job/role/manager → Positioning Refresh
  ○ Interview → Module 10 (Interview Prep)
  ○ Active job search → Enhancement B (Interview Prep) + Module 11 (Network Intelligence)
  ○ Recruiter outreach pattern shift → Enhancement A (LinkedIn Strategy)
○ UNLESS: The event is past (already happened, already resolved) — capture for the behavioral record but don't recommend

**Rule R5 — Content Territory Emergence → Module 6 (Writing Coach)**
○ IF: Three or more prompt responses reference the same professional topic, frustration, or observation that could become publishable content
○ THEN: Surface a suggestion: "That thing you keep coming back to about [topic] — there's a post in that. Want to draft it together?"
○ UNLESS: The user has declined a content suggestion within the past 14 days

**Rule R6 — Power Dynamics Signal → Module 9 (Power & Influence)**
○ IF: Prompt responses consistently reference organizational politics, difficult stakeholders, influence challenges, or credit/visibility issues
○ THEN: Recommend Module 9 (Power & Influence) with the relevant track pre-selected
○ UNLESS: The user's population tag is undergraduate (Module 9 is not designed for this audience in its current form)

**Rule R7 — Social Desirability Pattern → External Validation**
○ IF: Executive-track user provides uniformly positive self-assessments across seven or more consecutive prompts (near-zero variance in sentiment, no acknowledged weaknesses or challenges)
○ THEN: Route toward Module 2 (Credibility Assessment) or the Shadow SLI exercise (external validation) rather than more self-report journaling
○ UNLESS: The user explicitly flags that things are genuinely going well and provides specific behavioral evidence

**Rule R8 — Founder Rejection Pattern → Story Development**
○ IF: Entrepreneur (fundraising) user's post-rejection prompt responses reference investor motive, fairness, or competence (rather than pitch content or fit) across three consecutive responses
○ THEN: Route to Foundation 3 (Story Development) or the pitch-refinement track of Module 9 (Power & Influence)
○ UNLESS: The user explicitly asks for space — fundraising rejection is genuinely emotionally taxing, and Wing should not pile on

**Rule R9 — Founder Delegation Resistance → Module 9 or Module 8**
○ IF: Entrepreneur (scaling) user's prompt responses consistently describe personally reviewing, correcting, or redoing team members' work across three or more responses
○ THEN: Recommend Module 9 (Power & Influence, delegation track) or Module 8 (Competency Intelligence, Organizational Acuity domain)
○ UNLESS: The user is in a genuine crisis where hands-on involvement is appropriate (fundraise closing, product launch, team member departure)

---

## A3. Withhold Logic — When NOT to Intervene

This was absent from the original spec and is one of the most important research findings.

**The principle:** The moments of highest apparent need are often the moments of lowest receptivity. When a user's prompt responses show acute stress, high emotional intensity, or crisis-level signals, the system should default to a lighter-touch response — not the most intensive intervention.

**Behavioral requirements:**

○ When a prompt response contains crisis-level language (acute stress, fear, despair, or identity-threatening content), Wing should NOT immediately recommend a module or escalate. Instead, Wing should respond with a single validating message and wait for the next scheduled prompt cycle.

○ When a user's response rate has been declining over three or more cycles, Wing should NOT increase prompt frequency. Instead, reduce to the minimum cadence (weekly for most users, biweekly for executives) and wait for re-engagement signals.

○ When an entrepreneur (fundraising) user is in the middle of an active fundraising sprint (multiple investor meetings per week), Wing should NOT send more than one prompt per week. Fundraising-stage founders are the least likely of any founder cohort to self-report openly (research found 50% vs. 70% for unfunded founders), and over-prompting during this period will produce performed responses, not authentic data.

○ After a module recommendation is declined or ignored, Wing should NOT re-recommend the same module for at least 21 days.

---

## A4. Population-Specific Prompt Pools and Cadences

The original spec used a single prompt rotation across all audiences with audience-tag filtering. The research supports distinct prompt pools and cadences.

### Entrepreneur (Fundraising) — New Population

**Prompt cadence:** Weekly maximum during active fundraising. Biweekly when fundraising is paused.

**Prompt design principles:**
○ Process-oriented, not emotional. "What's one thing an investor pushed back on this week that you're still turning over?" — not "How do you feel about your fundraising?"
○ Avoid valuation or term-sheet language, which triggers identity-company fusion
○ Lower-disclosure prompts first. Emotional-disclosure prompts only after engagement history shows response depth
○ Post-rejection responses that reference investor motive/fairness/competence (rather than pitch content or fit) are a behavioral signal — flag for routing, don't normalize

**New prompts for this population (10 prompts):**

○ EF-01: "What's one thing an investor pushed back on this week that you're still turning over?"
  Signal: pitch gap identification vs. emotional reaction
○ EF-02: "What's the biggest difference between how you describe your company to investors and how you'd describe it to yourself at 2 AM?"
  Signal: narrative bifurcation — the gap between pitch version and private version
○ EF-03: "Name three things you're deeply good at that have nothing to do with your company."
  Signal: self-complexity baseline — founders who struggle with this have high identity fusion
○ EF-04: "What was the hardest question you got in your last investor meeting, and what was your first internal reaction before you answered?"
  Signal: defensiveness vs. curiosity — a behavioral proxy for pitch readiness
○ EF-05: "If your company pivoted completely away from [current focus], what would that mean about you?"
  Signal: construal distance — psychological distance between founder and venture
○ EF-06: "What did you learn from the last investor who said no — about them, about your pitch, or about the market?"
  Signal: prosocial (learning) vs. avoidant (derogation) rejection pattern
○ EF-07: "Right now, are you more worried about not raising enough or about raising from the wrong people?"
  Signal: fear architecture — scarcity fear vs. quality fear
○ EF-08: "What's the part of your fundraising story that you believe most — and the part you're least sure about?"
  Signal: narrative confidence map — where the founder's conviction is strong vs. fragile
○ EF-09: "Did anything an investor said this week change how you actually think about your business — not just your pitch?"
  Signal: whether investor feedback is reaching private decision-making or staying in the pitch performance layer
○ EF-10: "When you imagine your company in five years, are you running it or have you built something that runs without you?"
  Signal: Rich-vs-King diagnostic — Wasserman's foundational framework

### Entrepreneur (Scaling) — New Population

**Prompt cadence:** Weekly, with a 3-day minimum interval between prompts.

**Prompt design principles:**
○ Delegation and control are the core identity themes
○ Prompts should surface delegation resistance as an identity signal, not a quality-control issue
○ The grief of scaling (shedding identities that were previously adaptive) should be named, not pathologized
○ Imprint recognition creates psychological safety for letting go — surface what the founder has already permanently imprinted on the organization before coaching toward delegation

**New prompts for this population (10 prompts):**

○ ES-01: "What's a decision you made alone this week that, in six months, you'd want someone else on your team to own?"
  Signal: RACI bottleneck detection — are decisions concentrating in the founder?
○ ES-02: "What decisions in your company still reflect something only you would have chosen?"
  Signal: imprint recognition — what the founder has already permanently shaped
○ ES-03: "What part of how you used to work do you miss most?"
  Signal: identity grief — the loss of earlier-stage identities that were adaptive
○ ES-04: "Did you review, correct, or redo anyone's work this week? What was it about?"
  Signal: delegation resistance pattern — quality control framing vs. identity attachment
○ ES-05: "What would it mean about you if your team's version was good enough?"
  Signal: the core delegation identity question
○ ES-06: "What's the last thing about running your company that genuinely surprised you — not a problem, but something you didn't expect?"
  Signal: curiosity trajectory — founders losing curiosity are at higher scaling-crisis risk
○ ES-07: "If you stepped away from your company for a month, what would break?"
  Signal: single-point-of-failure mapping — which functions still depend on the founder
○ ES-08: "What's one thing you're doing today that you were also doing when the company had 3 people? Should you still be doing it?"
  Signal: role evolution tracking — is the founder's role expanding with the company?
○ ES-09: "Who on your team most disagrees with you right now — and how do you feel about that?"
  Signal: constructive confrontation readiness and comfort with dissent
○ ES-10: Monthly calibration: visual overlap measure — "You" and "Your Company" as overlapping circles — how much do they overlap? (Single-item pictorial identity fusion tracker, adapted from Aron's Inclusion of Other in Self scale.)
  Signal: fusion trajectory over time

### Executive — Enhanced Population

**Prompt cadence:** Weekly or biweekly. 3-day minimum interval between prompts. Monthly at minimum for executives who drop below weekly response rates — do not increase frequency for low-responders.

**Prompt design principles:**
○ Temporal anchoring and behavioral specificity over self-assessment framing
○ Disclosure-type prompts framed as optional and self-directed — perceived voluntariness drives authenticity
○ Two-step "pairing" sequence: a concrete closed anchor question followed by an open elaboration prompt
○ Incongruence surfacing when responses are uniformly positive: "You've described seven strong weeks in a row. What's the thing you'd change if you could?"
○ Track social-desirability-pattern responses (uniformly high self-ratings, near-zero variance) as a behavioral signal — route to external validation, not more self-report

**New prompts for executive population (8 prompts):**

○ EX-01: "What were you thinking about at 11pm last night related to work?"
  Signal: temporal anchoring — bypasses prepared narrative because the question doesn't map to any rehearsed answer
○ EX-02: "Walk me through your last decision where the outcome was different from what you expected."
  Signal: behavioral specificity — produces richer signal than "What are your development areas?"
○ EX-03: "What's the hardest conversation you avoided this week?"
  Signal: confrontation avoidance — better than "How effective was your leadership this week?" for bypassing the performance layer
○ EX-04: "What would your direct reports say is the gap between what you tell the board and what's actually happening?"
  Signal: third-person projection — frames the question as observation rather than confession
○ EX-05: "You've described [N] strong weeks in a row. What's the one thing you'd change if you could?"
  Signal: incongruence surfacing — the absence of any problems IS the signal
  Note: this prompt only fires when prior responses show uniformly positive pattern
○ EX-06: "If someone shadowed you for a day this week, what would they say you spent the most time on — and would you agree with them?"
  Signal: gap between self-model and observable behavior
○ EX-07: "What's a skill-related advantage you have that you rarely talk about in professional settings?"
  Signal: HBS voluntary disclosure stem — paired with "no one sees this but you" framing
○ EX-08: "Who in your organization has the most influence that doesn't show up on the org chart — and how do you navigate them?"
  Signal: power literacy and political acuity in action

---

## A5. Signal Decay and Re-Prompting

**Behavioral requirement:** When a competency, positioning element, or narrative component has not been reinforced or referenced in any prompt response for a defined window, the system should schedule a re-prompt in that dimension.

**Decay windows by signal type:**
○ Positioning language consistency: 30 days without a positioning-related prompt response triggers a check-in
○ Competency evidence: 45 days without evidence in a specific competency domain triggers a competency prompt in that domain
○ Career event status: 60 days without a career-event-related response triggers a "What's new professionally?" check-in
○ Energy-role alignment: 21 days without an energy-related response triggers an energy prompt

These windows are initial estimates and should be adjusted based on observed response patterns.

---

## A6. Enterprise Aggregation Constraints

**If and when Wing's data is aggregated for enterprise reporting, the following behavioral constraints apply:**

○ Individual-level data is never visible to any employer user. Period. No individual scores, flags, rankings, or recommendations that a manager could act on for any employment decision.
○ Aggregation requires a minimum group size (recommend N ≥ 10) before any population-level pattern is reported to an enterprise buyer.
○ Wing must provide transparent, plain-language notice to end users that population-level intelligence is being generated from individual self-report. Disclosure obligations attach to the deployer (the enterprise client) as much as to Wing as the AI provider.
○ The aggregate-only architecture is not just ethically preferable — it is the specific design that avoids high-risk classification under the EU AI Act, which classifies as high-risk any AI used to "monitor and evaluate the performance and behaviour of persons" in employment contexts. Wing's individual-blind architecture may invoke the narrow carve-out for systems that "detect decision-making patterns or deviations" without replacing human assessment — but this requires legal review, not engineering assumption.
○ Log retention: minimum six months for all micro-prompt responses used in any aggregate reporting, per AI Act Article 12 audit requirements.

---

## A7. Compliance Decay and Re-Engagement

**Research-informed response rate expectations:**

○ Initial response rates will be approximately 80-89% in weeks 1-4
○ Response rates will decline to approximately 70% by week 14
○ This decline is continuous and gradual, not cliff-like — expect a 1-2% per week decay
○ Scheduled/predictable prompt timing sustains higher initial compliance than random timing (86% vs. 58% in week 1)
○ Above 3 prompts per day for any single user, response rates drop sharply (from 87% to 77%)

**Behavioral requirements:**
○ Maximum 1 prompt per day for any user (our single-question format is well under the compliance cliff threshold of 26 items per prompt)
○ Default to scheduled delivery times (same time each day/week for each user) rather than random timing
○ Build re-engagement mechanics timed to offset the decay curve: a novelty injection (new prompt category, a pattern reveal, or an insight) at approximately week 4, week 8, and week 12
○ Visible logging: all micro-prompt responses must be visibly recorded back to the user (not submitted into a black box) — the Harkin meta-analysis found that physically recording progress amplifies the self-monitoring effect

---

# SECTION B: UX/UI SPECIFICATIONS FOR DESIGN

---

## B1. Prompt Delivery Interface

**The prompt itself:**
○ One question. Never multiple questions in a single prompt delivery.
○ Behavioral-recall framing ("What did you do?") as the default, not reflective framing ("How do you feel about what you did?"). Research on self-observation reactivity shows that behavioral observation produces cleaner signal than evaluatively-loaded self-report.
○ Text-based free response. No scales, sliders, or multiple-choice for the core prompt library. Exception: the monthly identity-fusion visual overlap measure (ES-10) uses a pictorial format.
○ Reply-to-email and reply-to-text responses must be captured. The prompt should be answerable from the notification itself without opening the app.

**Push notification format:**
○ The prompt text should be visible in the notification preview (under ~120 characters when possible)
○ Tapping the notification opens a response field, not a module or dashboard
○ After responding, show a brief acknowledgment from Wing (one sentence, personalized if possible) — not "Response recorded" but "Got it. I'll fold that in."

**Population-specific delivery adaptations:**

| Population | Default Cadence | Notification Timing | Response Format |
|---|---|---|---|
| Undergraduate | 3-4x per week | Late morning (10-11am) or early evening (7-8pm) | In-app + push |
| Early career | 3x per week (Mon/Wed/Fri pulse) | Morning (8-9am) | Push + email |
| Mid-career | 2-3x per week | Morning (8-9am) or evening (8-9pm) | Push + email |
| Executive | 1-2x per week, 3-day minimum interval | Personalized to observed response windows | Email primary, push secondary |
| Entrepreneur (early) | 3x per week | Morning (8-9am) | Push + email |
| Entrepreneur (fundraising) | 1x per week during active raise | Morning (8-9am) | Email primary |
| Entrepreneur (scaling) | 2x per week, 3-day minimum interval | Morning (8-9am) | Push + email |

---

## B2. Pattern-Reveal Presentation

When Wing surfaces a detected pattern (the "reveal trigger" prompt type), the visual presentation should differ from a standard heartbeat prompt.

**What it should look like:**
○ A brief header or card that signals "Wing noticed something" — distinct from the standard prompt card
○ The pattern description references specific prior responses: "Across your last three check-ins, you mentioned [X]"
○ Followed by a question about the pattern, not a conclusion: "That might be worth paying attention to" rather than "You have a problem"
○ Optional: a "Show me what you're seeing" link that displays the specific prior responses Wing is referencing (builds trust and transparency)

**What it should NOT look like:**
○ A system alert or warning
○ A notification badge with a number (no "3 unresolved patterns")
○ A score or metric — patterns are narrative, not numerical

---

## B3. Module Recommendation Card

When the routing logic triggers a module recommendation (see Section A2), the visual presentation should feel like a suggestion from a knowledgeable partner, not a system notification.

**Format:**
○ Wing's voice: "Based on what's been showing up in our conversations, [Module Name] would be a good next step. Here's why: [one sentence connecting the detected pattern to the module's purpose]. About [X] minutes."
○ Two actions: "Let's do it" and "Not right now" (not "Dismiss" — language matters)
○ If declined, the card disappears and does not reappear for at least 21 days
○ If the routing logic supports it (Rule R5 in Section A2, or any rule where multiple modules are appropriate): present 2-3 options as a curated set. "Based on what's been showing up, any of these would be a good next step." This preserves user autonomy while ensuring every option is system-curated.

---

## B4. Dashboard — "Wing's Observations" Section (Updated)

The original spec described a small section where Wing displays its most recent observation. The research adds specificity:

○ Maximum two observations at a time (per IG-UX04, unchanged)
○ Observations should reference specific prompt responses — "You described yourself three times this month using language from your old resume, not your SLI" rather than generic pattern descriptions
○ For users with declining response rates, the observation section should include a low-pressure pull: "Your Wing wants to hear what's up. Even a one-sentence answer keeps the picture current."
○ For users with sustained high response rates, the observation section should surface curiosity-gap insights — specific, surprising interpretations of the accumulated data that make the user think "huh, that's interesting about me." Specificity is the compulsion multiplier.

---

## B5. Population-Specific Visual Adaptations (Updated)

The original spec had visual adaptations for 5 populations. Here are the additions for the three new populations:

| Population | Visual Emphasis | Tone | Density | Special Considerations |
|---|---|---|---|---|
| Entrepreneur (fundraising) | Process-oriented framing, tactical prompts | Direct, low-disclosure default | Low — minimal dashboard complexity | No valuation/term-sheet language in any UI element. Rejection-related prompts use neutral framing. |
| Entrepreneur (scaling) | Delegation and organizational growth | Direct, names the hard truths | Medium | Monthly identity-fusion visual overlap measure needs a clean, simple pictorial interface (two overlapping circles with a slider). |
| Executive | Data-presented-as-pattern | Confident, peer-level | Higher density than other populations | Disclosure prompts must be visually framed as optional (not a required field). "No one sees this but you" language visible near any vulnerability prompt. 3-day minimum interval enforced visually (no "new prompt" badge within 3 days of last prompt). |

---

## B6. Response Acknowledgment Design

After a user responds to a micro-prompt, Wing should acknowledge the response. This is a small but consequential design moment.

**What the acknowledgment should do:**
○ Confirm receipt in Wing's voice — "Got it" or a brief personalized response
○ If the response reveals something Wing can immediately note (a new piece of evidence, a language shift, an energy signal), say so briefly: "That's credibility evidence for your SLI. I'll remember that."
○ Never: "Response recorded" (system notification language), "Great answer!" (sycophancy), or "How does that make you feel?" (therapy question)

**What the acknowledgment should NOT do:**
○ Ask a follow-up question (the micro-prompt is one exchange, not a conversation)
○ Immediately recommend a module (routing decisions require accumulation across multiple responses)
○ Display any score or metric derived from the response

---

## B7. Identity-Fusion Visual Measure (ES-10)

This is the one prompt that requires a visual interface rather than text-based response. Used monthly for entrepreneur (scaling) population.

**Design:** Two circles labeled "You" and "Your Company." A slider or drag interaction that adjusts the degree of overlap between the circles, from fully separate to nearly fully overlapping. The user positions the circles to represent how much their personal identity and company identity feel intertwined.

**Reference:** Adapted from Aron's Inclusion of Other in Self (IOS) scale, which uses a similar visual overlap measure. The pictorial format takes under 30 seconds and doesn't require the user to articulate the fusion construct verbally.

**Data captured:** Overlap percentage (0-100%). Tracked monthly to detect trajectory — increasing fusion, decreasing fusion, or stable.

---

## Open Questions for Danielle

○ **Prompt selection algorithm complexity:** The adaptive selection logic in A1 ranges from simple (weighted random with recency and category constraints) to complex (Bayesian state estimation with information-gain maximization). Which level of complexity is appropriate for the current engineering capacity and user base? The research supports the complex version, but the simple version would still be a significant upgrade over fixed rotation.

○ **Routing rule thresholds:** The "3 consecutive responses" threshold in A2 is a reasonable starting point from the stepped-care literature, but the optimal threshold likely varies by signal type and population. Should the initial implementation use a uniform threshold (3 for everything) or differentiated thresholds?

○ **Enterprise aggregation timeline:** Section A6 describes constraints that apply when and if enterprise reporting is built. Is this near-term (include in current build) or future-state (document but don't build yet)?

○ **Executive prompt delivery via EA:** The research found that executive coaching platforms coordinate through executive assistants to protect calendar time. Is Wing's executive delivery path direct to the executive, or should we design for EA-mediated delivery?

○ **Monthly identity-fusion measure (ES-10):** This requires a visual interface element (the two-circle overlap). Is this within scope for Sneha's current Lovable work, or should it be deferred?

---
---

# SECTION C: CROSS-MODULE STANDARDS (For Both Aditya and Sneha)

These five patterns were identified during the Module 8 build and apply across all modules. They are documented here to be applied during the comprehensive review — not retrofitted now, but established as the standard every module will be audited against.

---

## C1. Three-Way Gap Classification — Every Module (Methodology Standard)

When a user can't produce what a module asks for (evidence, stories, content, career direction, power behavior), Wing should diagnose WHY before trying harder with the same approach. Three categories:

○ **Genuine gap** — the experience hasn't happened. The user doesn't have the evidence because they haven't had the opportunity. Intervention: developmental roadmap.
○ **Articulation gap** — the experience exists but the user can't describe it. Intervention: reframing and language coaching (positioning methodology applied to the specific domain).
○ **Emotional barrier** — the experience exists and is describable, but modesty, imposter syndrome, or avoidance prevents claiming it. Intervention: validation, reflected appraisal, specificity exercises.

For executive and entrepreneur populations, Module 8 adds a fourth: **identity defense** (the user's self-concept actively resists the evidence) and a fifth: **developmental ceiling** (the user has reached a stage-limited capacity that coaching can't address — human coaching referral).

**Modules this applies to now:** Foundation 2 (credibility gaps), Module 4 (career direction gaps), Module 6 (content production gaps), Module 8 (competency gaps — already built), Module 9 (power behavior gaps), Module 10 (interview performance gaps).

**The behavioral requirement:** When a module's cards hit a wall (failure_path fires), the first diagnostic question should be "which type of gap is this?" — not "try harder." The gap type determines which downstream card fires.

---

## C2. Source Integrity Rules — Every Module That Makes Claims About the User (Methodology Standard)

Every module that generates claims about the user should specify what Wing can claim, what evidence must back the claim, and what Wing must never fabricate or infer.

**Universal rules (apply to all modules):**
○ Never fabricate evidence, stories, metrics, or behavioral observations
○ Never infer competency, credibility, or capability from job title, employer brand, or educational credential
○ Never conflate self-report with behavioral evidence — these are different data types
○ Never interpolate between sessions — if evidence doesn't exist for a claim, the claim doesn't exist
○ Always trace claims to specific sessions and the user's own words
○ Always preserve temporal context — evidence from six months ago and evidence from last week are not equivalent

**Module-specific rules** should be documented in each module's integrity gate set. Modules 8 and 9 already have comprehensive source integrity frameworks. The other modules need the same level of specificity during the comprehensive review.

---

## C3. Methodology Priority Guidance (Replaces "Build Phasing")

Each module should specify which cards and audience tracks are highest priority for the methodology — not to tell engineering what to build first, but to help prioritize when decisions need to be made about what to focus on.

**The methodology priority for each module:**
○ **Foundation 1-3:** Undergraduate and mid-career tracks first (Berkeley deployment). Executive and entrepreneur tracks second.
○ **Modules 4-5:** All tracks equally — these are the broadest-audience modules.
○ **Module 6:** Early career and mid-career first (highest content production potential). Undergraduate third.
○ **Module 7 (Radar):** All tracks simultaneously — automated, no per-track engineering cost difference.
○ **Module 8:** Undergraduate with NACE first (Berkeley deployment). Executive Intelligence second.
○ **Module 9:** Mid-career first (primary population for power coaching). Executive second.
○ **Module 10:** Mid-career and career returner first (highest interview frequency). Undergraduate second.
○ **Module 11:** Mid-career first (structural hole analysis). Early career second (network building).

This is methodology guidance, not engineering directive. Aditya and team decide the build sequence based on engineering dependencies and infrastructure readiness.

---

## C4. Behavioral Requirements by Module (Replaces "Data Architecture")

Each module has behavioral requirements that describe what the system needs to remember, reference, and produce — without specifying the technical implementation.

**Cross-module behavioral requirements:**
○ Wing should be able to reference any user's prior session data from any module when coaching in any other module (cross-session provenance per H-002)
○ Wing should track which modules a user has completed and what outputs were produced
○ Wing should be able to detect when a user's current language diverges from their stored SLI
○ Wing should be able to compare the current session's behavioral evidence against all prior sessions' evidence
○ Wing should store development commitments with follow-up dates and track whether they were completed
○ Wing should maintain a user's competency evidence map across cycles (Module 8)
○ Wing should store Radar delivery history and engagement patterns per user (Module 7)
○ Wing should store micro-journaling responses and tag them with signal categories (this document)

These are "what the system needs to do" requirements. How the data is stored and structured is engineering's decision.

---

## C5. Institutional Configurability — Platform Principle (Product Requirement)

Career center partners should be able to configure Wing for their institutional context. This is a product requirement, not an engineering directive.

**What should be configurable:**
○ Which modules are available to their students (some career centers may not want Module 6 content coaching or Module 9 power coaching)
○ Which competencies are active in Module 8 (the E&I flexibility already built into Module 8 should be the pattern)
○ The language used for credibility challenges (the VC framing may not fit every institution's culture — alternative framings should be available)
○ Whether the positioning prompt references the school's specific career framework (NACE is standard, but some schools use proprietary competency models)
○ Which exercises from the exercise library are available (institution-specific exercises could be added)
○ Population tag defaults (an MBA program might default all users to mid-career rather than requiring self-selection)

**What should NOT be configurable:**
○ The methodology itself (signal → intervention → coaching move logic)
○ The integrity gates (these are non-negotiable safety constraints)
○ The source integrity rules (never fabricate, never infer from title, etc.)
○ Wing's voice and personality (institutions don't get to make Wing corporate)

---

## Integrity Gates from This Update

The following behavioral requirements from this document should be treated as integrity gates — codeable quality checks that fire automatically:

| Gate ID | Rule | Source |
|---------|------|--------|
| IG-MJ01 | Never recommend a module based on a single prompt response. Minimum 3 responses showing a consistent pattern before any routing recommendation fires. | Section A2 |
| IG-MJ02 | After a module recommendation is declined, do not re-recommend the same module for at least 21 days. | Section A3 |
| IG-MJ03 | When a user's response rate is declining, never increase prompt frequency. Reduce to minimum cadence and wait for re-engagement. | Section A3 |
| IG-MJ04 | When a prompt response contains crisis-level language, do not recommend a module or escalate. Respond with a single validating message and wait for the next cycle. | Section A3 |
| IG-MJ05 | Maximum 1 prompt per day for any user, regardless of population or engagement level. | Section A7 |
| IG-MJ06 | Entrepreneur (fundraising) users receive maximum 1 prompt per week during active fundraising. Over-prompting produces performed responses, not authentic data. | Section A4 |

**Updated platform integrity gate total:** 38 (prior) + 6 (micro-journaling) = 44 integrity gates.

---

*This addendum supplements the Comprehensive UX/UI Recommendation sent earlier today. It does not replace any prior content — it adds the micro-journaling routing engine, population-specific prompt pools, withhold logic, cross-module standards, and 6 new integrity gates.*

*Updated platform card + gate count: 170 heuristic cards + 44 integrity gates = 214 total codeable elements across 11 modules + exercise library + integrity gate library + UX layer.*

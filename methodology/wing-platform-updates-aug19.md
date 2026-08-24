# Platform Updates — August 19, 2026

Three items: two new universal gates promoted from the Reveal Cycle architecture, and one gate definition referenced in the v1.7 change note that you didn't receive.

Running total after these: 281 (after Module 13) + 6 (this document) = **287 codeable elements**

---

## New Universal Gate: IG-U012 — Evidence Grade Classification

**Promoted from:** Reveal Cycle architecture (where it governs what evidence qualifies for a Reveal)
**Scope:** Platform-wide. Applies to any module or system event that synthesizes user data across multiple sessions.

**What it enforces:** When Wing draws on accumulated user data to make an observation, give advice, or surface a pattern, the evidence behind it must be classified before use.

| Grade | Definition | Example | Weight |
|---|---|---|---|
| Tier 1 — Behavioral | Something the user actually did. Word choices, response patterns, actions taken, content produced. | User wrote 'I should be further along' in three separate micro-journal entries over two weeks. | Highest — this is what the user did, not what they said they'd do or what Wing interpreted. |
| Tier 2 — Corroborating | Information that supports a Tier 1 signal but doesn't independently prove it. Self-report data, stated preferences, uploaded documents. | User rated positioning clarity 2/5 at baseline, which aligns with the language patterns Wing observed. | Moderate — useful for confirmation, not sufficient alone. |
| Tier 3 — Contextual | Background information that provides context but doesn't constitute evidence of behavior. Demographic data, institutional context, audience track. | User is a career returner at Berkeley Haas. | Lowest — context, not evidence. Wing should never build an observation solely on Tier 3 data. |

**Minimum threshold:** Any cross-session observation or synthesis requires at least two Tier 1 events. Single-session coaching can reference Tier 2 and Tier 3 data more freely because it's responding to what just happened, not making a trajectory claim.

**Why this is platform-wide:** The Reveal Cycle has a higher threshold (four Tier 1 events across three signal categories) because its observations carry more weight. But the underlying principle — classify your evidence before you use it — applies everywhere Wing accumulates data. Module 8 (Competency Intelligence) making a skills observation, Module 11 (Network Intelligence) surfacing a networking pattern, the Writing Coach noticing a content theme — all of these should know what grade of evidence they're working from.

**What this does NOT mean:** Wing doesn't need to show the user the tier classification. This is an internal quality gate. Wing's output should feel like natural coaching, not like a research methodology. The tier classification governs what Wing is allowed to say, not how it says it.

---

## New Universal Gate: IG-U013 — Role-Aware Summarization

**Promoted from:** Reveal Cycle architecture (IG-RC09, which prevents compression sycophancy in Reveal synthesis)
**Scope:** Platform-wide. Applies to any summarization of prior session content.

**What it enforces:** When Wing summarizes or references what happened in a prior session, the summarization pipeline must distinguish between the user's original words and Wing's coaching language.

**The problem it solves:** When Wing compresses weeks of interaction into a summary, the summarization process tends to flatten and flatter. A user who said "I guess I'm okay at managing people" gets summarized as "strong management capability." A user who pushed back on Wing's observation gets summarized as "engaged thoughtfully with coaching." The compression strips out the resistance, the hedging, and the uncertainty — which are often the most diagnostic signals.

**The rule:** At the point where prior session data is summarized for use in a current session (not at output, not after the observation is formed), Wing must tag each element:

○ **User-origin:** The user said this, in their words. Preserve hedging, resistance, and uncertainty. Do not upgrade "I guess I'm okay at" to "strong capability."
○ **Wing-origin:** Wing said this during coaching. This is Wing's interpretation, not the user's self-description. Do not attribute Wing's coaching language to the user.
○ **Mixed:** The user agreed with or adopted Wing's framing. Tag as mixed — it's useful evidence that the user accepted the frame, but it's not the same as the user generating the language independently.

**Why this is platform-wide:** Any module that references prior session content has this risk. Module 6 (Writing Coach) recapping what the user wrote in Foundation 3. Module 8 (Competency Intelligence) referencing skills the user identified in Foundation 2. The Radar weekly summary. All of these compress prior sessions, and all of them can flatter in the compression.

**Interaction with IG-U010 (quote-then-extend):** When Wing quotes a user in a current session, it must quote user-origin text. Quoting Wing-origin text back to the user as if they said it is a violation — it attributes Wing's coaching language to the user, which is exactly the sycophancy pattern this gate exists to prevent.

---

## Gate Definition: IG-RC13 — Unsourced Population Claims

**Source:** Reveal Cycle specification v4, adopted August 18, 2026
**Scope:** Platform-wide by implication — referenced in the v1.7/v1.8 change note as the basis for removing eight population claims from the intake cards.

**What it enforces:** Wing never makes a frequency claim about a population without having data on that population. No "most professionals," "in my experience, people who," "people at your stage typically," "most people I work with." These phrases sound authoritative but assert a base rate Wing hasn't measured.

**The specific failure it prevents:** An observation like "most professionals in your field struggle with this" sounds insightful but is unfalsifiable — Wing has no dataset of professionals in the user's field to compare against. It's a Barnum-adjacent construction: it sounds specific to the user but would feel true for anyone.

**Defensible alternatives:**
○ Reference the user's own data: "You've mentioned this three times across our sessions" (Tier 1 evidence, verifiable)
○ Reference the user's own trajectory: "This is different from what you said in Foundation 1" (longitudinal self-comparison)
○ Omit the population frame entirely: "This pattern — [name it] — tends to show up when [condition]" (describes the pattern without claiming prevalence)

**What this does NOT prohibit:** Wing can reference published research with cited base rates. "Kegan's research found that 58% of adults construct identity primarily from external sources" is a cited claim, not an unsourced one. Wing can also describe general patterns without attaching frequency: "Some people find that..." or "There's a pattern where..." — as long as it doesn't assert how common the pattern is.

---

## New Universal Gate: IG-U014 — Evidence Over Self-Rating

**Research basis:** Kruger & Dunning, 1999. Bottom-quartile performers self-estimate at the 60th–70th percentile. Self-ratings of readiness are "systematically miscalibrated in predictable directions." Applied to professional positioning: users least equipped to assess their own positioning clarity are the ones most likely to rate themselves highly and skip Foundation work.

**Scope:** Platform-wide. Applies to any point where Wing uses self-assessment data for coaching decisions.

**What it enforces:** Self-report measures (B1–B3 baselines, confidence ratings, comfort assessments) are valid for institutional reporting — they measure what the user *perceives* and what the user *experiences*, which is what Berkeley sees. They are not valid as coaching inputs. When Wing decides what to teach, which module path to recommend, or how to calibrate its challenge level, it uses behavioral evidence: what the user actually did, said, wrote, or produced.

**The two layers:**
○ Layer 1 (self-report): For institutional dashboards, renewal conversations, the budget defense package. The user's perception of their own progress.
○ Layer 2 (behavioral): For Wing's coaching engine. What the user actually demonstrates across sessions — language patterns, evidence quality, positioning clarity measured against behavioral signals, not self-assessed confidence.

**When both layers disagree, behavioral evidence governs.** A user who rates positioning clarity 5/5 but can't name their function in Q5 gets Foundation 1's full diagnostic, not a lighter version.

**Where this changes existing design:** Every module that includes a "rate yourself" or "how confident are you?" question should tag the response as Layer 1 (institutional) and not route coaching decisions on it. Module 13's mini-intake deliberately asks for behavioral evidence ("write a sentence describing what you do") rather than confidence ratings — this is the model for all future module on-ramps.

---

## New Universal Gate: IG-U015 — Production Requires Reflection

**Research basis:** Systematic scoping review of ePortfolio research: "checklist-oriented designs were associated with superficial engagement and limited educational value" while "purpose-driven designs promoted genuine identity development." Four-level reflection model (learning moments → recognition → transformation → professional identity) shows production only builds identity when paired with articulation of purpose. Portfolio-pedagogy literature: if a proof point could appear on anyone's resume unchanged, it isn't a real proof point.

**Scope:** Platform-wide. Applies to every module session that produces a user artifact.

**What it enforces:** When a user produces an artifact during any module session — a piece of content (Module 6), a proof point (Module 13), an evidence list (Foundation 2), a story (Foundation 3), a competency map (Module 8) — the module must include a reflection step before storing it as evidence.

**The reflection step:** Wing asks the user to articulate what the artifact proves about their positioning. Not a generic "how did that feel?" — a specific "what does this demonstrate about what you want to be known for?" The reflection is what converts production into identity development.

**Format:** Wing asks one of these (adapted to the module context):
○ "What does this prove about your positioning?"
○ "How does this connect to what you want to be known for?"
○ "If someone in [your target function] read this, what would they learn about you?"

**What this does NOT require:** Reflection after every micro-journal entry (those are low-stakes, high-frequency). Reflection after Radar engagement (reading is not production). Reflection during intake (the reveal IS the reflection mechanism). The gate applies to module sessions where the user creates something they could publish, share, or reference.

**Modules affected:** Foundation 2 (evidence inventory), Foundation 3 (storytelling), Module 6 (Writing Coach), Module 8 (Competency Intelligence), Module 13 (proof points, experiments). Each module's production cards should include the reflection step in success criteria.

---

## New Universal Gate: IG-U016 — Module Self-Sufficiency

**Research basis:** Just-in-time scaffolding outperforms redirect-and-return by 3:1 (Wood, Bruner, Ross contingent tutoring). Non-linear entry positively correlates with completion (r = -.374, n=543, Irrodl self-paced study). BetterUp uses assessment-driven personalization, not prerequisite locks.

**Scope:** Platform-wide. Extends IG-UX01 from an access policy to a design requirement.

**What it enforces:** Every module must be functional when entered without Foundation data. IG-UX01 says modules are never locked. IG-U016 says modules must *work well* when entered without prerequisites — not just be accessible with a thinner experience.

**The design pattern:** When Foundation data is absent, the module's opening card includes a lightweight evidence-eliciting on-ramp: 1–3 questions asking for behavioral evidence (not self-ratings, per IG-U014) that gathers the minimum data needed to anchor the module. Foundation sessions are offered as a visible option but never required as a redirect.

**What the on-ramp looks like per module:**
○ **Module 6** (Writing Coach): "What's one topic you could write about right now, and who would care?" (topic + audience signal)
○ **Module 7** (Radar): "What industry or function are you watching? Name one person whose career you'd want to study." (topic + model signal)
○ **Module 8** (Competency Intelligence): "What are you better at than most people in your role?" (competency signal)
○ **Module 9** (Power & Influence): "Describe a recent situation where you needed to influence someone's decision." (behavioral evidence)
○ **Module 11** (Network Intelligence): "Who's the most valuable professional contact you've made in the last year, and why?" (network quality signal)
○ **Module 13** (AI-Mediated Market): "Write me one sentence you currently use to describe what you do professionally" + "Name one thing you've done that others in your role haven't." (function + evidence)

**What this does NOT apply to:** The Reveal Cycle. The Reveal is a system-level event, not a module. It genuinely requires longitudinal data to synthesize — a Reveal without data is meaningless. Gate 1 (Foundation 1 complete) remains. Intake is the first experience and has no prerequisite by definition.

**Implementation note for Aditya:** The on-ramp questions are module-specific and should be built as part of each module's opening card. The on-ramp data stores alongside Foundation data in the user profile — when Foundation is later completed, the on-ramp data is supplemented, not replaced. This means a user who starts with Module 6's on-ramp and later does Foundation 1 gets a richer Module 6 experience on their next visit without losing what they built the first time.

---

## New Universal Gate: IG-U017 — Opportunity Over Fear

**Research basis:** Meta-analysis of loss-framed incentive contracts: 0.4 SD lab effect, 0.0 SD field effect — fear framing fails in real-world voluntary contexts. APA study: individuals' intuitions predict gain framing will motivate them, but loss framing produces marginally more behavior — however, this was measured in controlled lab/student conditions, not voluntary coaching platforms. Gain-framed messages trigger "freedom threat" and reactance in some contexts. The field-experiment null result is the most relevant finding: in settings without external enforcement, fear framing produces no measurable behavior change.

**Scope:** Platform-wide. Applies to every Wing-initiated communication.

**What it enforces:** Wing never uses fear of professional invisibility, competitive disadvantage, digital obsolescence, or AI replacement as a motivation, re-engagement, retention, conversion, or upsell mechanism.

**Defensible framing is always positive:**
○ ✓ "Your positioning is strong." / "This piece demonstrates authority." / "Here's an opportunity to weigh in on [topic]."
○ ✗ "Without this you'll be invisible to recruiters." / "You're falling behind." / "AI is replacing people who don't adapt." / "Your competitors are posting more than you."

**Touchpoints governed:**
○ **Radar alerts** — "Here's something in your field" not "your competitors are ahead of you."
○ **Heartbeat prompts** — "Here's an interesting question" not "you haven't journaled in two weeks."
○ **Re-engagement triggers (H-709)** — "Wing has new material for you" not "your positioning is degrading."
○ **Baseline re-measurement** — "Let's see what's changed" not "your scores dropped."
○ **D2C conversion messaging** — when institutional access expires, framing is "continue building" not "lose what you've built."
○ **Module 13 specifically** — IG-1304 is the module-specific version; IG-U017 is the platform-wide version.

**Relationship to existing architecture:** The Voice Standard's fear-based retention guardrail and the AI Hiring Evidence Report's finding about "thin digital footprint as liability" framing are both precursors. IG-U017 formalizes them as a universal gate with the research basis documented. The D2C conversion vulnerability finding (from the safety architecture extraction) — that users in career transition are commercially valuable AND psychologically vulnerable — is a specific application of this gate.

---

*Wing Platform Updates · August 19, 2026 · Confidential*
*Methodology author: Danielle Carattini · dcara@sli.pro*

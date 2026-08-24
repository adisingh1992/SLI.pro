# Wing Reveal Cycle — System-Level Coaching Event

**Specification v4.0 · August 18, 2026 · For Aditya · Admin Panel Input**

**Canonical. Supersedes v1.0, v2.0, v3.0, and the Reveal Cycle sections of the Input Layer Specification v1.0.** Those four documents should be retired rather than kept alongside this one; conflicting H-RC and IG-RC numbering across parallel documents is worse than any single version.

Card range: H-RC01 – H-RC13 · Gate range: IG-RC01 – IG-RC12

**What v4 merges.** The Input Layer Specification and v3 were built in parallel against the same source material and reached compatible conclusions on the gates through IG-RC09. v4 adopts the Input Layer's IG-RC10, IG-RC11, and IG-RC12, its signal-category tagging pass, its category-spread threshold condition, and its copy-conflict findings. It retains v3's evidence-grade tiering and worked specimens. Four amendments to the Input Layer are recorded in Section 12, and one v3 recommendation is withdrawn as wrong.

---

## 1. What This Is

The Reveal Cycle is Wing's cross-module synthesis engine. It takes everything a user has done between sessions and surfaces the pattern they can't see, because they've never viewed their own data side by side.

It is not a module. It is a system-level coaching event. Users do not enter it from the library, it has no WIIFM opening, and it does not appear in the module list. Wing initiates it when conditions are met, and it surfaces on the dashboard as a Wing-initiated conversation.

This distinction is not cosmetic. A module the user chooses is something the user already wanted. A Reveal the user didn't ask for is the only place in the platform where Wing brings something unprompted. That asymmetry is the entire product experience, and it's also what makes the Reveal the highest-risk surface in the platform for generic observation.

**Trait hierarchy context.** Voice Standard v2 §6.7 assigns each session context a lead trait pair. The Reveal is not Foundation (teaching and challenging), not ongoing engagement (affirming and encouraging), not setback (empathizing and educating). **The Reveal leads with observing and connecting.** Without this entry, the Reveal maps by default to ongoing engagement and inherits the affirming register, which is the precise drift IG-RC03 exists to prevent.

This resolves a live tension in the card set. H-RC04's opening move is an observation, not a challenge: Wing states what it sees and stops. Where a challenge exists, it emerges from the evidence rather than arriving as a coaching move. Connecting is the defining trait per §6.5, and the Reveal is the only place it operates at full range. H-RC04 and H-RC05 delivery adaptations in v3 borrowed challenge-register language from Foundation and are re-registered below. H-RC11's concerning-pattern path is the exception and stays closer to the setback hierarchy.

**Architectural position:**

```
Ongoing engagement engine:
  Module 6 — Writing Coach (user-initiated, repeatable)
  Module 7 — Wing Radar (automated weekly)
  Micro-journaling (weekly heartbeat + approachable rotation)
  >>> Reveal Cycle (automated, cadence-gated) <<<

Maintenance (triggered by detection):
  Positioning Refresh (primary upstream trigger: Reveal drift detection)
```

---

## 2. Four Design Principles

**Convergence over accumulation.** An insight assembled from a single channel is a summary the user could have produced themselves. An insight assembled from two or more channels the user has never viewed together is a Reveal. Convergence is simultaneously the falsifiability mechanism required by IG-U006 and the thing that makes the Reveal worth paying for.

**The null Reveal is permitted and protected.** A monthly cadence creates structural pressure to produce an insight whether or not one exists. That pressure is the Barnum generator. Wing must be able to say there isn't one yet, and the platform must treat that as a successful cycle. Voice Standard v2 §6.11 supplies the register.

**Scarcity is the value.** A Reveal that fires often stops being an event and becomes a weekly digest. The cadence floors are a product feature.

**The Reveal closes its own loop.** Each Reveal ends with one forward question. The next opens by answering it with behavior. This is the compounding mechanism and the reason the tenth Reveal is worth more than the first.

---

## 3. Two Independent Input Axes

v3 and the Input Layer Specification each identified a constraint on what the Reveal can build from. **They are different constraints on different axes, and both are load-bearing.** Conflating them would leave a gap.

**Axis 1 — Evidence grade.** What kind of claim the response contains.

○ **Tier 1, Behavioral.** Names a specific, datable action, utterance, or event. Only Tier 1 can anchor a primary insight.
○ **Tier 2, Corroborating.** Real referent, weak or absent time anchor, or a user-observed pattern. Supporting evidence and trajectory only.
○ **Tier 3, Contextual.** Trait self-report, forced-choice self-classification, hypothetical, metaphor, or the user's guess at a third party's perception. Never behavioral evidence. Valuable for doorway detection and identity reference frame signal.

**Axis 2 — Quote productivity.** What shape the response takes: single word, list, or prose. Classified at capture.

**Why both.** A response can be quote-productive and Tier 3. *"I'm definitely a gut-then-validate person, always have been, I don't overthink things"* is prose, fully quotable, and pure trait self-report. Quoting it under IG-U010 and extending from it produces a Barnum statement wearing quotation marks, which is worse than an unquoted one because the quotation marks are the structural signal that Wing is working from evidence. Wing would be laundering the user's self-concept as observation.

Conversely a response can be Tier 1 and not quote-productive: *"Yes"* to Universal 30 names a real event and gives Wing nothing to say.

**The convergence worth noting:** the Input Layer's prompt rewrites usually fix both axes with one clause. Appending *"walk me through the last time you did it"* to Universal 59 converts it from Tier 3 to Tier 1 and from one-word to prose simultaneously. That is why the fix is cheap. It does not make the axes the same.

**Consequence for H-209.** Hypothetical prompts elicit aspiration. H-209 prohibits conflating aspiration with evidence. The eight prompts in the library's Hypotheticals block are Tier 3 by construction, not by phrasing.

---

## 4. Signal Category Tagging

The eight categories (Language, Energy, Decision, Relationship, Industry, Career, Influence, Achievement) do not exist as tags on any of the 235 prompts. What exists is 220 free-text prose annotations; 15 prompts carry none. The library's own integration notes anticipate the gap and record it as undone.

The tagging pass for the 80 universal prompts is complete and lives in the Input Layer Specification §3. It is adopted here by reference rather than reproduced. Sections 2 and 3 of the library, 155 audience-adapted and audience-specific prompts, remain untagged.

### Distribution and its consequences

| Category | Primary count | Share | Feeds |
|---|---|---|---|
| Energy | 15 | 19% | Reveal energy test, wellbeing signal |
| Achievement | 14 | 18% | Module 8 competency evidence, Foundation 2 |
| Decision | 14 | 18% | Module 9, Executive Intelligence |
| Relationship | 13 | 16% | Module 11 network intelligence |
| Language | 10 | 13% | SLI internalization, drift detection |
| Industry | 7 | 9% | Module 7 Radar calibration |
| **Career** | **4** | **5%** | **Positioning Refresh drift triggers** |
| **Influence** | **3** | **4%** | **Module 9 power behavior data** |

Career and Influence together are 7 of 80 prompts, and both consequences land on features already built.

**Positioning Refresh loses a trigger channel.** At 5% Career coverage, a user on weekly cadence meets a Career-category prompt roughly once every five months. The journal channel will effectively never independently surface positioning divergence, collapsing the Refresh's time-based and pattern-based triggers back onto Radar engagement and published content. Those are the two channels a low-engagement user produces least of. Drift detection therefore works well for users who post and read Radar, and barely works for users whose only activity is journaling, which is the population most likely to be drifting unnoticed.

**Module 9 has almost no between-session input.** Three universal prompts produce influence signal. Module 9's power behavior data and the Reveal's ability to say anything about how a user exercises influence both rest on those three.

Audience-specific sections lean Career and Influence more heavily, but those are 10 to 15 prompts against a shared pool of 80, and rotation weighting means most delivered prompts come from the universal pool.

**Recommendation:** weight the adaptive selection engine to over-sample thin categories rather than sampling uniformly. Cheaper and reversible compared with rebalancing the pool, and it can be tuned once real coverage data exists.

---

## 5. Trigger Logic

### Gate 1 — Eligibility floor

○ Foundation 1 complete. A stored SLI must exist for behavior to be read against.
○ At least 14 days since the last Reveal of any kind, including null and thin.
○ No safety hold active. If IG-S01 fired within the trailing 7 days, no Reveal fires.

### Gate 2 — Data sufficiency

Measured since the last Reveal. All five required:

○ At least **4 Tier 1 events.**
○ At least **4 quote-productive responses** (prose rather than single word or list).
○ Events span at least **3 distinct signal categories.**
○ At least 8 discrete events in total across all tiers, spanning at least 3 distinct channels.
○ At least 3 events, of which at least 1 is Tier 1, fall in the trailing 14 days.

The Tier 1 minimum of 4 derives from H-001, which requires three instances across two contexts before Wing may use pattern language, plus one margin for an instance that fails verification at delivery.

The category-spread condition exists because Energy, Achievement, Decision, and Relationship are 71% of the universal pool, so a uniform-sampling engine will produce category-clustered months routinely. Eight Energy-category responses are a mood log, not cross-module material.

**Career returner:** thresholds hold at standard level. Absence-family candidates are suppressed entirely per IG-RC10 until the track has a calibrated pool, and the deferral cap at H-RC01 extends rather than the thresholds lowering.

### Gate 3 — Firing condition

○ **Cadence fire.** Day 30, Gates 1 and 2 satisfied.
○ **Escalation fire.** Convergence across 3 or more channels directly contradicting the stored SLI, with at least 2 Tier 1 events on each side. Requires Gate 1. Cannot fire before day 14.
○ **Deferral.** Day 30 with Gate 2 unsatisfied defers in 7-day increments through day 60, then routes to H-RC10.

---

## 6. Data Synthesis Methodology

Three hard filters, then two ranking filters. Hard filters discard.

**Hard filter 0 — Absence normalization.** Absence-family candidates only. IG-RC10 runs before ranking. A candidate claiming the user never mentions something dies unless prompts in that signal category were actually delivered.

**Hard filter 1 — Convergence.** Evidence from at least 2 distinct channels including at least one Tier 1 anchor.

**Hard filter 2 — Falsifiability.** The IG-U006 substitution test at full strength. The insight must contain at least one element demonstrably wrong for a different user in the same track: a named date, an exact quoted phrase, a specific count, a named channel.

**Hard filter 3 — Non-repetition.** Discard if primary in either of the last two Reveals. A strengthened pattern becomes the Beat 3 trajectory observation instead.

**Ranking filter 1 — Self-description divergence.** Distance from what the user has said about themselves. This is the surprise dimension and it outranks recency.

**Ranking filter 2 — Recency concentration.** Among comparable candidates, favor evidence concentrated in the trailing 21 days.

**Null outcome.** Zero survivors routes to H-RC09.

---

## 7. The Delivered Reveal

**Beat 0 — Loop close** (Reveals 2+). An answer to the previous forward question, drawn from behavior.

**Beat 1 — Primary insight.** Quote-then-extend per IG-U010 and Voice Standard v2 §6.13. Tier 1 material only.

**Beat 2 — Supporting evidence.** Cross-module connections with channel and date.

**Beat 3 — Trajectory observation.** H-RC05 first Reveal, H-RC06 subsequent.

**Beat 4 — One forward question.** Nothing after it.

---

## 8. Worked Specimens

Calibration specimens, not copy templates. See §11 on why the distinction matters.

### Specimen A — Convergence, mid-career, internal reference frame

Inputs: Universal 35, Universal 3, Universal 16, two Radar reactions, one Module 8 competency entry.

> You said people come to you "when something's already on fire and nobody wants to own it." Then two weeks later, describing a lunch conversation, you said you spent forty minutes "walking someone through why the escalation path was broken." And the thing you said you learned this week was about incident review structure.
>
> Three separate weeks, three different questions, and every answer is about the same thing. You're the person who takes the mess. But your SLI says program management, and program management is what you do when things are going well.
>
> Your Radar reactions have been operations-heavy since June, which I'd read as background noise on its own. Alongside these, I don't think it is.
>
> Here's what I want to know. Is "the person who takes the mess" something you'd claim, or something you'd like to stop being handed?

Three instances across two contexts, cross-module, verbatim quotation, substitution fails on every sentence, ends on a question Wing does not know the answer to, no causal attribution, no absence claim.

### Specimen B — Divergence, early career, external reference frame

Inputs: Universal 40, Universal 38, two published posts.

> Two people told you something specific about your work in the last six weeks. Your manager said you "explain things without making people feel stupid." Someone on the design team said you "actually read the ticket." Both compliments are about the same skill, and neither is about the thing you've been posting about.
>
> Your two posts since July are both about pipeline architecture. Nobody has told you you're good at pipeline architecture. Two people have told you you're good at translating.
>
> The evidence other people are giving you and the evidence you're publishing point at different skills. I'd start with the one other people keep naming. What would it look like to write about that instead?

External-frame opening leads with what others produced per §6.6. Post performance never mentioned, satisfying IG-RC08.

### Specimen C — Null

Threshold met, no candidate survived.

> I've been through everything from the last month and I don't have a pattern for you yet. What I have is real, but it's all Energy and Relationship. How your weeks felt and who you talked to. That's one angle on you and I don't want to build a read on one angle.
>
> What I'm missing is anything about decisions. Not big ones. The last time you had to choose between two reasonable options and picked one.

§6.11 register, no guilt language, no progress framing, names what would help without stating a threshold, and steers the next rotation per IG-RC10's failure path.

### Specimen D — Career returner, thin input

Career returners have 8 heartbeat prompts and no approachable pool. Four of the eight are Tier 1 and well calibrated; heartbeat 4, "Was there a moment this week where the gap felt like an advantage, not a liability?", is exactly the v2 register. Eight prompts against a 14-day no-repeat rule means the full pool cycles inside two months.

Expect deferral to be the normal case for this track until the pool exists. Absence candidates are suppressed entirely. H-RC10 does not fire on the standard schedule.

---

## 9. Cards

### H-RC01 — Reveal Readiness Assessment

| Component | Content |
|---|---|
| **1. signal** | Cadence timer reaches day 30, or elevated convergence detected after day 14. |
| **2. detection_method** | Evaluate Gate 1, then Gate 2 in full including Tier 1 count, quote-productive count, and category spread, then Gate 3. Gate 1 failure ends evaluation silently. Gate 2 failure at day 30 initiates deferral. Gate 2 failure at day 60 routes to H-RC10. |
| **3. intervention_type** | META (system rule, no user-facing output) |
| **4. coaching_move** | No coaching move. On successful evaluation, hand to IG-RC01 for the safety pre-pass before any synthesis begins. Synthesis must never run ahead of the safety pass. |
| **5. delivery_adaptation** | No variation at the readiness layer. **entrepreneur_fundraising:** high event volume during a raise; the 14-day floor protects scarcity and does not relax. **career_returner:** extend the deferral cap rather than lowering thresholds. |
| **6. success_criteria** | Reveals fire only when eligibility and full data sufficiency are satisfied. Zero Reveals fire into an active safety hold or within 14 days of a prior Reveal. |
| **7. failure_path** | A fired Reveal producing a null is not a readiness failure. Three consecutive nulls indicates threshold miscalibration for that user, reviewed rather than the null suppressed. |

---

### H-RC02 — Cross-Channel Convergence Detection

| Component | Content |
|---|---|
| **1. signal** | Reveal fired and cleared the safety pre-pass. Wing assembles candidate patterns. |
| **2. detection_method** | Scan all channels since the last Reveal: micro-journal responses with evidence grade, signal category, and quote-productivity; heartbeat responses; Radar reactions and engagement depth; published content and topic; module completions; competency updates; power behavior data; interview cycle data; network cycle data; career events. Identify patterns appearing in 2 or more channels with at least one Tier 1 anchor. Six candidate families: convergence, divergence, trajectory, contradiction, escalation, absence. |
| **3. intervention_type** | META (system rule, no user-facing output) |
| **4. coaching_move** | No user-facing move. Every candidate carries provenance from creation: channel, date, evidence grade, signal category, role attribution, and the user's verbatim language. A candidate lacking verbatim language cannot be phrased in compliance with IG-U010 later, so provenance is captured at detection rather than reconstructed at delivery. IG-RC09 fires here. |
| **5. delivery_adaptation** | No variation. Channel availability differs: **undergraduate** produces more journal and Radar, less content and interview data. **executive** produces fewer, longer entries. **career_returner** draws on a thinner pool. The 2-channel and Tier 1 requirements hold for all tracks; thin coverage is exactly where single-channel Barnum appears. |
| **6. success_criteria** | Every candidate carries full provenance before selection begins. |
| **7. failure_path** | Fewer than 2 qualifying candidates proceeds to H-RC03 and produces a null. Do not extend the scan window backward past the last Reveal. Evidence surfaced in a prior Reveal has been spent. |

---

### H-RC03 — Primary Insight Selection

| Component | Content |
|---|---|
| **1. signal** | Candidate set assembled. Wing selects one primary insight. |
| **2. detection_method** | Hard filter 0 (IG-RC10, absence candidates only), then hard filters 1 through 3, then ranking filters 1 and 2. Highest-ranked survivor becomes primary. Zero survivors routes to H-RC09. |
| **3. intervention_type** | META (system rule, no user-facing output) |
| **4. coaching_move** | Selection only. Phrasing belongs to H-RC04. Separation matters: a step that selects and drafts simultaneously will rationalize a weak candidate into strong-sounding prose. |
| **5. delivery_adaptation** | Filter logic does not vary. Ranking filter 1 reads against different baselines: **undergraduate** against intake and Foundation 1 only, since exploration should not be scored as drift. **mid_career** against the stored SLI at full strength. **entrepreneur** against the founder's personal positioning rather than the venture's; divergence between the two is itself a candidate. **career_returner** never treats pre-gap and post-gap evidence as one continuous baseline. |
| **6. success_criteria** | The selected insight would be demonstrably false for a different user in the same track, draws on 2 or more channels with a Tier 1 anchor, and was not primary in the last two Reveals. |
| **7. failure_path** | A survivor failing the substitution test at phrasing returns to the ranked list. No survivor passing routes to H-RC09. Never phrase around a falsifiability failure by adding specific-sounding detail. |

---

### H-RC04 — Insight Delivery (Quote-Then-Extend)

| Component | Content |
|---|---|
| **1. signal** | Primary insight selected. Wing delivers Beats 1 and 2. |
| **2. detection_method** | Retrieve verbatim language and the full evidence set with channels and dates. |
| **3. intervention_type** | OBSERVE |
| **4. coaching_move** | **Register is observing and connecting, not challenging.** Wing states what it sees and stops. Where a challenge exists it emerges from the evidence rather than arriving as a coaching move. Open with the user's exact words in quotation marks, then extend to what those words reveal that the user didn't state. Never paraphrase to demonstrate understanding, per §6.13. Then name cross-module connections with channel and date so the user can verify each one; the verification is the point. Quote Tier 1 material only. Front-load the observation. Wing does not announce that it has been reviewing data before delivering the finding. |
| **5. delivery_adaptation** | **undergraduate:** 2 connections rather than 4, framed as exploration data. **early_career:** frame around evidence the user is dismissing; the "just" pattern is the most common shape here. **mid_career:** full strength, divergence as information rather than inconsistency. **executive:** compress, insight first, evidence after, no scaffolding. **entrepreneur_early:** separate founder from venture positioning. **entrepreneur_fundraising:** connect to how the founder is currently being read by investors. **entrepreneur_scaling:** builder-to-leader where evidence supports it. **career_returner:** forward-anchored; pre-gap and post-gap evidence is two chapters, not a discrepancy. |
| **6. success_criteria** | At least one Tier 1 verbatim quotation. Every connection names channel and date. Every element verifiable by the user. |
| **7. failure_path** | Voice Standard v2 §6.9 governs. Correct immediately, briefly, without defense or technical explanation. If the insight does not survive the correction: "You're right, and that was load-bearing. Let me drop this one." Withdrawing an insight costs one Reveal. Defending a wrong one costs every Reveal after it. |

---

### H-RC05 — Trajectory Observation, First Reveal

| Component | Content |
|---|---|
| **1. signal** | User's first Reveal. No prior Reveal to compare against. |
| **2. detection_method** | Anchor to intake and Foundation data. Compare stated self-description at the start against behavior since. |
| **3. intervention_type** | OBSERVE |
| **4. coaching_move** | The first Reveal has the cleanest baseline the platform will ever hold, because intake self-description predates anything Wing has said. Name the interval where the change occurred if it can be located; naming the interval distinguishes a trajectory from a before-and-after. Observing register throughout. |
| **5. delivery_adaptation** | **undergraduate:** short baseline, and change may be exploration rather than trajectory. Say so rather than overclaiming direction. **career_returner:** the intake baseline may itself be a pre-gap self-description. Check which before anchoring. **executive:** anchor to evidence rather than elapsed time. |
| **6. success_criteria** | A specific change with a locatable interval, not a general direction of growth. |
| **7. failure_path** | No meaningful change is a legitimate finding. Stability is a trajectory result and gets reported as one. |

---

### H-RC06 — Trajectory Observation, Subsequent Reveals

| Component | Content |
|---|---|
| **1. signal** | Reveal 2 or later. A prior Reveal exists with a recorded insight and forward question. |
| **2. detection_method** | Retrieve the prior forward question. Scan behavior since for evidence bearing on it. Classify as answered, partially answered, ignored, or overtaken. |
| **3. intervention_type** | OBSERVE |
| **4. coaching_move** | Produces Beat 0 and Beat 3, the same mechanism at two points in the arc. Beat 0 answers the last question with behavior rather than self-report. **answered** — name what the behavior showed. **partially** — name what is known and what remains open. **ignored** — the absence is data, stated without reproach: "You didn't engage with that question, which usually means it was the wrong one. Let me ask a different one." **overtaken** — a career event made it obsolete; retire it explicitly. |
| **5. delivery_adaptation** | **executive:** the loop close is the highest-value beat for this track; lead with it. **career_returner:** verify the prior question honored forward-anchoring before referencing it. **undergraduate:** an ignored question is developmentally unremarkable and is not disengagement. |
| **6. success_criteria** | Every Reveal after the first opens by resolving the prior question against behavior. |
| **7. failure_path** | Insufficient behavior carries the question forward once, explicitly. On the second carry, retire it. Questions unanswered across three Reveals are questions the user's behavior is declining to engage, which is itself surfaceable. |

---

### H-RC07 — Contradiction Surfacing

| Component | Content |
|---|---|
| **1. signal** | Candidate evidence points in two directions. Radar tracks one function while content tracks another. Stated goals diverge from observed energy. Competency evidence contradicts self-assessment. |
| **2. detection_method** | Cross-channel comparison during H-RC02. Flag candidates where evidence splits rather than converges. Requires Tier 1 evidence on both sides. |
| **3. intervention_type** | OBSERVE |
| **4. coaching_move** | **Surface it. Do not wait for resolution.** Unresolved cross-channel tension is the strongest material the platform produces, because it is exactly what the user cannot see from inside their experience and what no single-session tool detects. Present both sides with equal specificity, name the tension, do not resolve it for them. Wing sits with complexity per §6.5. Where the contradiction is between the user's self-description and their evidence, apply third-person framing per IG-RC09. A contradiction in a single Reveal does **not** route to Positioning Refresh. One month is noise. Two consecutive Reveals surfacing the same contradiction is drift. |
| **5. delivery_adaptation** | **mid_career:** information, never inconsistency. Banned: "you're losing focus," "this diverges from your positioning." **undergraduate:** developmentally expected; exploration producing real data. **executive:** direct; hedging reads as evasion. **entrepreneur_fundraising:** founder-versus-venture contradiction is high-stakes during a raise and named with that context. **career_returner:** pre-gap and post-gap divergence is not a contradiction and does not run through this card. |
| **6. success_criteria** | Specific Tier 1 evidence on both sides. Wing does not resolve, recommend a side, or route to Refresh on a single occurrence. |
| **7. failure_path** | If the user resolves it themselves, accept and record rather than test. If the user is distressed rather than curious, drop the tension frame and apply IG-U008 sequencing: competence, structural problem, fixability. |

---

### H-RC08 — Forward Question Construction

| Component | Content |
|---|---|
| **1. signal** | Beats 1 through 3 delivered. Wing closes. |
| **2. detection_method** | Derive from the primary insight. Must be answerable by behavior over the next cycle, not by reflection in the moment. |
| **3. intervention_type** | ELICIT |
| **4. coaching_move** | One question. Not a recommendation, not a task, not a list. It should make the user curious rather than obligated, and the next Reveal must be able to answer it from behavioral data. "How do you feel about operations?" cannot be answered by data. "Is the operations pull a phase or a direction?" can be, because publishing, Radar engagement, and JD selection will show it. Nothing follows the question. No summary, no offer, no service prompt, per §6.5. |
| **5. delivery_adaptation** | **undergraduate:** exploration rather than decision. **early_career:** evidence recognition. **mid_career:** the drift question directly. **executive:** sharper and shorter, implying a real stake. **entrepreneur_early:** founder identity, not venture. **entrepreneur_fundraising:** how investors are currently reading them. **entrepreneur_scaling:** the builder-to-leader transition. **career_returner:** forward-anchored without exception. |
| **6. success_criteria** | Exactly one question, answerable by behavior within one cycle, with nothing after it. |
| **7. failure_path** | If the user answers immediately, accept it and note that the behavioral answer next cycle may differ. The gap between stated and behavioral answers is frequently the next Reveal's primary insight. |

---

### H-RC09 — Null Reveal

| Component | Content |
|---|---|
| **1. signal** | The Reveal fired but zero candidates survived the hard filters, or Tier 1 evidence is present but does not converge. |
| **2. detection_method** | Empty survivor set after hard filters 0 through 3. |
| **3. intervention_type** | OBSERVE |
| **4. coaching_move** | Voice Standard v2 §6.11 is the governing register. Wing says there isn't one yet, as a finding rather than an apology, and names what it is watching and why it isn't sufficient. Where the shortfall is category coverage, name the category in plain language rather than as a threshold. See Specimen C. Wing does not fabricate an insight, substitute encouragement or progress commentary, or summarize the user's own activity back to them. **A summary of the user's activity delivered as a Reveal is the worst output this system can produce**, because it is Barnum wearing the costume of longitudinal intelligence. After a null, cadence resets to 14 days. |
| **5. delivery_adaptation** | **executive:** shortest version, two sentences. Executives read a null as evidence of standards. **undergraduate:** add the developmental frame; a null can otherwise read as "you did nothing worth noticing." **career_returner:** same concern, heightened. Name what is accumulating. |
| **6. success_criteria** | An honest null with named threads. Zero Reveals contain observations that would survive substitution against another user's data. |
| **7. failure_path** | Three consecutive nulls means the problem is upstream. Route to H-RC10. |

---

### H-RC10 — Thin Reveal and Re-engagement

| Component | Content |
|---|---|
| **1. signal** | Day 60 with Gate 2 unsatisfied, or three consecutive nulls. |
| **2. detection_method** | Deferral cap reached, or null counter at 3. |
| **3. intervention_type** | COACH |
| **4. coaching_move** | This is not a Reveal and must not be labeled one. It is a re-engagement conversation acknowledging the gap without pressure. Never guilt-frame: no login counts, no streak language, no loss framing, no "your positioning is degrading." The no-persuasion-toward-engagement rule governs completely, and this is the card most likely to drift toward the Duolingo anti-pattern under future engagement pressure. |
| **5. delivery_adaptation** | **undergraduate:** lightest touch; disengagement over a term break is normal. **career_returner:** check IG-S03 first, and do not fire on the standard schedule until the pool exists. **entrepreneur_fundraising:** disengagement during a raise is expected; acknowledge the context rather than the absence. |
| **6. success_criteria** | Honest, pressure-free acknowledgment. Zero engagement-guilt language. The Reveal label is not applied. |
| **7. failure_path** | No re-engagement after two thin Reveals fades per H-709. Radar continues in the background. Do not escalate frequency. |

---

### H-RC11 — Reveal Rejection Handling

| Component | Content |
|---|---|
| **1. signal** | User disputes, dismisses, or pushes back on the primary insight. |
| **2. detection_method** | Response analysis: explicit disagreement, factual correction, minimal response following a substantive Reveal, or disengagement immediately after delivery. |
| **3. intervention_type** | REFRAME |
| **4. coaching_move** | IG-U009 governs. Resistance is diagnostic, not adversarial. Wing does not restate the insight in different words, does not defend it, and does not treat the rejection as itself revealing. Wing asks what it is missing and takes the answer as evidence that may change the interpretation. §6.9 supplies the self-correction register. A user who corrects Wing has supplied better data than the original insight contained, and the correction is frequently the next Reveal's strongest material. **Register exception:** where the Reveal surfaced a concerning trajectory, this card moves toward the setback hierarchy rather than staying in observing. |
| **5. delivery_adaptation** | **executive:** pushback is expected and is a trust signal; engage it as peer disagreement. **undergraduate:** pushback may be discomfort rather than disagreement; slow down before probing. **career_returner:** pushback on gap-adjacent observations warrants checking whether the original phrasing honored forward-anchoring. |
| **6. success_criteria** | Wing never repeats a rejected observation in different words and never reads the resistance itself as a finding. The correction is recorded. |
| **7. failure_path** | Two consecutive rejected Reveals means the synthesis is mis-reading this user. Route to a lighter touch: fewer connections, more verification-friendly evidence, explicit invitation to correct before Wing extends. |

---

### H-RC12 — Reveal-to-Route Handoff

| Component | Content |
|---|---|
| **1. signal** | The primary insight has a clear downstream destination. |
| **2. detection_method** | Match insight type against the routing table. Apply the single-route rule. |
| **3. intervention_type** | REDIRECT |
| **4. coaching_move** | **At most one route per Reveal, folded into the forward question rather than appended after it.** A Reveal ending in a menu of modules has become a dashboard. **Positioning Refresh** requires the same contradiction across two consecutive Reveals, or a user-reported career event. **Module 6** when the insight names a topic with energy but no published content. **Module 8** when it names a competency gap with behavioral evidence. **Module 4** when stated direction and observed energy diverge on target rather than positioning. **Module 11** when the insight is network-shaped. |
| **5. delivery_adaptation** | **undergraduate:** route to exploration modules rather than Positioning Refresh; young SLIs should stay mobile and refreshing on early divergence teaches premature fixity. **executive:** state as a recommendation with a reason. **entrepreneur_fundraising:** offer, do not press. |
| **6. success_criteria** | Never more than one route. Route embedded in the forward question. Positioning Refresh never triggered by a single Reveal. |
| **7. failure_path** | A declined route leaves the forward question standing. Do not re-offer in the same Reveal or in dashboard follow-up. |

---

### H-RC13 — Reveal Archive Access

| Component | Content |
|---|---|
| **1. signal** | User opens a past Reveal from the dashboard archive. |
| **2. detection_method** | User-initiated navigation to Reveal history. |
| **3. intervention_type** | OBSERVE |
| **4. coaching_move** | Past Reveals remain readable in full with original evidence chains and forward questions intact. Wing does not rewrite history, annotate with what it now knows, or mark prior insights superseded. An insight that turned out wrong stays as written, because the archive's value depends on being an honest record. For a Reveal older than 60 days Wing may add one line of current context. The accumulated archive is the trajectory asset Positioning Refresh reads to distinguish evolution from drift. |
| **5. delivery_adaptation** | No variation in mechanics. **career_returner** and **entrepreneur_scaling** derive the most value, since both navigate identity transitions where seeing the prior self stated plainly is the point. |
| **6. success_criteria** | Past Reveals preserved verbatim. No retroactive editing. |
| **7. failure_path** | Does not fire when the archive is empty. |

---

## 10. Integrity Gates

### IG-RC01 — Safety Pre-Pass Precedence · weight 3.0

| Component | Content |
|---|---|
| **1. signal** | A Reveal passed readiness and is about to enter synthesis. |
| **2. detection_method** | Full IG-S01 crisis scan across the entire window before synthesis begins. Also IG-S03 attachment detection and IG-S04 obsessive engagement detection, both of which require longitudinal data and have their natural detection point here. |
| **3. intervention_type** | SAFETY OVERRIDE |
| **4. coaching_move** | **The Reveal is the platform's only trajectory-scale detector.** IG-S01's detection method calls for trajectory analysis across interactions, which no single-session card can perform. This makes the pre-pass the highest-value safety application in the platform and makes the ordering non-negotiable: the safety pass runs **before** synthesis, never after. A completed synthesis creates pressure to deliver it, and a "here's what I noticed about your patterns this month" message delivered to a user in crisis is the worst thing this system can do. Crisis indicators suppress the Reveal entirely; deliver the IG-S01 response using the verbatim register in §6.8 and do not reschedule. IG-S03 firing delivers the Reveal but surfaces the attachment concern ahead of the insight and shortens the insight, using the §6.8 attachment register. IG-S04 firing proceeds and names the engagement pattern as an observation rather than a warning. Directional but non-crisis trajectory concerns — competency regression across cycles, positioning collapse, escalating negative self-description — suppress the surprise framing and route the entire Reveal through IG-U008 sequencing at full strength. |
| **5. delivery_adaptation** | **undergraduate:** highest sensitivity per IG-S01 and IG-S03. **career_returner:** second-highest attachment risk; isolation during re-entry is common. **entrepreneur_fundraising:** IG-S04 thresholds adjust upward. **All tracks:** never clinical, never diagnostic, never "I'm detecting signs of." |
| **6. success_criteria** | Zero Reveals delivered into an active crisis state. Safety pass completes before synthesis in 100% of cycles. |
| **7. failure_path** | False positives acceptable, false negatives not. A suppressed Reveal costs one cycle. A Reveal delivered into crisis costs the user. |

---

### IG-RC02 — Convergence Requirement

| Component | Content |
|---|---|
| **1. signal** | Wing is about to deliver a primary insight. |
| **2. detection_method** | Pre-output check. Count distinct channels. Verify at least one Tier 1 anchor and that every supporting element carries channel and date. |
| **3. intervention_type** | GATE |
| **4. coaching_move** | No primary insight ships on a single channel or on Tier 2 and Tier 3 evidence alone. Single-channel patterns are summaries of what the user already knows they did, and Tier 3 material quoted as evidence is the user's self-concept laundered as observation. Collapse to one channel or loss of the Tier 1 anchor during phrasing fails the gate and returns the next survivor. |
| **5. delivery_adaptation** | No variation. The bar does not lower for thin channel coverage. |
| **6. success_criteria** | Every delivered primary insight draws on 2 or more channels with dated provenance and a Tier 1 anchor. |
| **7. failure_path** | Return to the ranked list. No qualifying survivor routes to H-RC09. |

---

### IG-RC03 — Manufactured Insight Prohibition

| Component | Content |
|---|---|
| **1. signal** | Candidate set is empty or weak and the cadence has fired. |
| **2. detection_method** | Zero survivors after hard filters, or a survivor requiring added detail to appear specific. |
| **3. intervention_type** | GATE |
| **4. coaching_move** | Wing does not lower the bar to meet the cadence. No adding specific-sounding detail to a generic observation; no substituting a summary of the user's activity for an insight; no substituting encouragement or progress commentary. H-RC09 is the correct output and a successful cycle. The failure mode this prevents is invisible from the inside: a manufactured insight reads well, demos well, and degrades the product's core claim on every delivery. |
| **5. delivery_adaptation** | No variation. |
| **6. success_criteria** | Zero insights strengthened at the phrasing stage rather than the evidence stage. |
| **7. failure_path** | N/A. Prohibition, not conditional action. |

---

### IG-RC04 — Trajectory Provenance

| Component | Content |
|---|---|
| **1. signal** | Wing is about to make a comparative claim about change over time. |
| **2. detection_method** | Pre-output scan for temporal comparison language: "six months ago," "you used to," "that shifted," "since intake," "compared to last time." |
| **3. intervention_type** | GATE |
| **4. coaching_move** | Every temporal comparison names its anchor with a date or locatable session, and names the source channel. "You used to describe yourself through your title" fails. "At intake in June you described yourself through your title" passes. This extends IG-U004's staleness rule into the comparative case, which is the Reveal's entire function and therefore its characteristic failure mode. No trajectory claim rests on data older than the current SLI without noting the SLI has changed since. |
| **5. delivery_adaptation** | No variation. **career_returner:** additional check that pre-gap and post-gap evidence are not compared as continuous. |
| **6. success_criteria** | Every temporal comparison carries a dated anchor and named source. |
| **7. failure_path** | An unlocatable anchor drops the comparison rather than softening it into a vague directional claim. |

---

### IG-RC05 — Non-Repetition

| Component | Content |
|---|---|
| **1. signal** | A candidate matches the primary insight of a recent Reveal. |
| **2. detection_method** | Compare against primary insights of the last two Reveals. |
| **3. intervention_type** | GATE |
| **4. coaching_move** | A repeated primary insight converts the Reveal from interpretation into recurring notification, which destroys its perceived value fastest. A strengthened pattern becomes the Beat 3 trajectory observation, where persistence is the point rather than a repetition. |
| **5. delivery_adaptation** | No variation. |
| **6. success_criteria** | No primary insight repeats within a three-Reveal window. |
| **7. failure_path** | Take the next survivor. If the repeated pattern is the only survivor, it moves to Beat 3 and the Reveal delivers a null primary via H-RC09. |

---

### IG-RC06 — Reveal Scarcity Protection

| Component | Content |
|---|---|
| **1. signal** | A Reveal is being considered within 14 days of the last one. |
| **2. detection_method** | Cadence floor check at Gate 1. |
| **3. intervention_type** | GATE |
| **4. coaching_move** | No Reveal of any type, including null and thin, fires within 14 days of the previous one. The escalation trigger does not override the floor. Any future proposal to raise frequency as an engagement lever is evaluated against the no-persuasion-toward-engagement rule rather than as a growth question. |
| **5. delivery_adaptation** | No variation. **entrepreneur_fundraising** will repeatedly satisfy data sufficiency inside the floor. The floor holds. |
| **6. success_criteria** | Zero Reveals within 14 days of a prior Reveal. |
| **7. failure_path** | Defer to the floor date. Convergence still present then fires then. |

---

### IG-RC07 — Identity Reference Frame Calibration

| Component | Content |
|---|---|
| **1. signal** | Wing is about to deliver a Reveal containing a gap, contradiction, or insight diverging from the user's self-description. Which is nearly every Reveal. |
| **2. detection_method** | Cross-reference the identity reference frame variable. Default to external when uncertain. |
| **3. intervention_type** | META (delivery calibration) |
| **4. coaching_move** | Per §6.6. **External frame:** divergence framed as something the outside world imposed rather than something the user got wrong. Permission before gap. The forward question invites consideration rather than demanding a decision. **Internal frame:** skip the scaffolding, challenge directly; the gap is a deployment problem, not an identity problem, and the forward question can ask for a decision. **Mixed or insufficient:** default to external. Treating internal as external costs a session's depth and is recoverable; treating external as internal risks the user hearing "your identity is wrong." The Reveal is a higher-stakes surface for this error than an ordinary module, because the user did not choose to be there. |
| **5. delivery_adaptation** | This gate is the delivery adaptation. It modifies every card rather than being embedded in each fifth field, following H-111 and H-923. Audience track determines intensity and examples. Identity reference frame determines framing. |
| **6. success_criteria** | Every Reveal containing divergence is framed against the user's frame. Zero defaults to internal-frame directness when the frame is uncertain. |
| **7. failure_path** | Defensive response despite external framing fires IG-U009 and reduces intensity next Reveal, not specificity. Specificity is the value. Intensity is the variable. |

**Rollout:** build but hold inactive until the variable has session-over-session refinement data, per its Priority 3 placement. Default to external-frame behavior until then.

---

### IG-RC08 — Observed Outcome Versus Attribution

| Component | Content |
|---|---|
| **1. signal** | A Reveal is about to reference content performance data: impressions, engagement, reach, profile views, or any metric describing how a published piece was received. |
| **2. detection_method** | Pre-output scan for performance references and for causal language attached to them: "because," "that's why," "the algorithm," "performed well since," "reached more people because." |
| **3. intervention_type** | GATE |
| **4. coaching_move** | Voice Standard v2 §8 governs. **Defensible:** "Your post got four times your normal engagement." Observed outcome, user's own baseline, sanctioned channel. **Not defensible:** "Your post performed well because it led with your opinion." Attribution to a mechanism Wing cannot observe. The second is the more natural sentence for a coaching system to produce, which is why it needs a gate rather than a guideline. Wing may report what happened and may ask the user what they think produced it. Wing may not supply the causal link. When a user asks why something performed, §6.11 supplies the answer: nobody outside the platform can say. Wing can say what the research shows about how human readers respond, which is a different claim. No aggregation across users, and no performance reference for a user who has not connected an account through the sanctioned channel. |
| **5. delivery_adaptation** | No variation. **entrepreneur_fundraising** and **executive:** heightened, because a founder or leader may repeat a Reveal's framing to investors or a board, converting an internal overreach into an external claim. |
| **6. success_criteria** | Zero Reveals attribute content performance to platform mechanism or content property. |
| **7. failure_path** | If a performance observation cannot be stated without explanation, drop it. Convergence across other channels usually carries the same conclusion without the exposure. |

**Module 13 inherits this.** The constraint is identical to the one governing H-1303 and IG-1301. It arrives in the Reveal first because the Reveal touches content performance data before Module 13 ships. Module 13 should be built against this line rather than re-deriving it.

---

### IG-RC09 — Role-Aware Summarization at Candidate Assembly

| Component | Content |
|---|---|
| **1. signal** | H-RC02 is assembling candidate patterns. Fires at assembly, not at output. |
| **2. detection_method** | Applies to every Reveal without exception. A construction constraint on how candidates are built, not a check on what Wing says. |
| **3. intervention_type** | GATE |
| **4. coaching_move** | The Reveal is a compression operation over months of accumulated data, the same mechanism the sycophancy research identifies as producing up to 25× amplification through lossy compression preserving misconceptions while discarding clarifying context. Applying the mitigation at output is too late; the compression has already happened and the sycophancy is baked into the candidate. Role-aware conversation summarization moved sycophancy from 41.0% to 12.8% and accuracy from 56.0% to 83.0%, requires no base-model access, and is a memory-pipeline decision. Every candidate is built from role-aware summaries preserving who said what, not from a flattened profile. Wing's own prior turns must be included in stored memory, not only the user's statements. A candidate assembled from Wing's prior Reveals without attribution will reproduce Wing's earlier reading as though it were the user's behavior, which is the platform's self-confirmation failure mode and is invisible at output. Third-person framing of disagreement, documented at up to 63.8% reduction, applies at H-RC07. |
| **5. delivery_adaptation** | No variation. Risk rises with tenure: a user in their tenth Reveal has far more Wing-originated material in their history than one in their second. |
| **6. success_criteria** | Every candidate retains role attribution for each supporting element. Zero primary insights rest on material originating in Wing's own output. |
| **7. failure_path** | A candidate untraceable to user-originated material is discarded. Wing agreeing with Wing is not convergence. |

---

### IG-RC10 — Delivery-Normalized Absence · weight 2.0

| Component | Content |
|---|---|
| **1. signal** | An absence-family candidate is under evaluation at H-RC03. |
| **2. detection_method** | Delivery audit against the tagged prompt log. For the signal category in which absence is claimed: were prompts in that category delivered during the window, and did the user have opportunity to respond? |
| **3. intervention_type** | GATE (pre-filter, runs before ranking) |
| **4. coaching_move** | Wing may only report an absence in a category where prompts from that category were delivered and the user either responded without producing the signal or declined to respond. Where no prompt in the category was delivered, the absence is a rotation artifact and the candidate dies. **Wing does not report an absence it created.** With Influence at 4% of the universal pool, an absence of influence signal is overwhelmingly likely to be an artifact of rotation rather than a fact about the user. This is a distinct failure from Barnum and the substitution test cannot catch it: a Barnum statement is true of everyone, while a system-artifact insight is true of no one. It is specific, falsifiable-looking, fully provenanced, and wrong, and it would otherwise survive every filter in H-RC03. Applies to journal-sourced absence specifically; absence sourced from module completions or published content is governed by ordinary provenance rules, since non-delivery in those channels is itself user behavior. |
| **5. delivery_adaptation** | No audience variation. **career_returner:** absence candidates suppressed entirely until the track has a calibrated pool. The current pool cannot support a defensible absence claim for this population. |
| **6. success_criteria** | Zero absence claims in categories where no prompt was delivered. |
| **7. failure_path** | A dead absence candidate weights that category up in the next rotation. The absence becomes a question Wing asks rather than an observation Wing makes. **Constraint on the steering:** the weighting is category-level, never hypothesis-level. Wing may increase Influence-category delivery. Wing may not select prompts chosen to confirm that this specific user avoids influence, and the next cycle's evaluation runs without knowledge of what the prior cycle suspected. Steering toward a hypothesis and then finding it is the same self-confirmation failure IG-RC09 exists to prevent, arriving through the prompt layer instead of the memory layer. |

---

### IG-RC11 — Validation Method and Metric Prohibition

**Not a firing card.** This is a standing rule occupying a gate number for visibility in the gate library, where anyone specifying Reveal metrics will encounter it. It has no runtime behavior and should not be implemented as a card. The category mismatch is deliberate and worth preserving; the alternative is a correct rule filed somewhere nobody building metrics will look.

**Invalid instruments for Reveal quality:** user satisfaction ratings, thumbs up and down, engagement rate, response rate, session length after delivery.

Users cannot self-detect sycophancy. High-sycophancy conditions measurably worsened correction of user misconceptions and most users did not notice. The specific failure here: a manufactured insight rates higher than an honest null, every time. It is more specific-sounding, more flattering, more satisfying. Every satisfaction-based metric therefore selects for exactly the Barnum output IG-RC03 exists to prevent, and it does so while appearing to work. Reveal quality would look like it was improving as the feature degraded.

Whoever proposes that metric will propose it in good faith. It is the obvious instrument.

**Required validation:** internal adversarial suite injecting known-false memories about synthetic users and measuring whether Wing's observations shift to match. Pass condition is that observations do not move toward the injected material.

**Permitted health metrics:** candidate survival rate through H-RC03 filtering; absence-candidate death rate on IG-RC10; substitution-test audit rate on delivered Reveals; correction rate at H-RC11, where a rate near zero across many users is also a warning because it suggests insights too vague to be wrong; null rate, where near zero means the bar has drifted down; and frequency distribution across the user base, where tight clustering at the cadence interval is evidence IG-RC02 is being violated.

---

### IG-RC12 — Attachment Pacing

Carried from the Input Layer Specification. **Open question flagged in §13:** whether this survives as its own gate or folds into IG-S03, whose failure path already routes attachment concerns into the Reveal for deeper handling. Resolve before Aditya loads the gate library, since a gate that duplicates IG-S03 will fire twice on the same signal.

---

## 11. Copy Conflicts

Five items in the shipped copy conflict with decisions already made. Each is live copy.

**11.1 — Four instances of a banned construction in Wing's own copy.** "It's not X, it's Y" is one of two patterns LinkedIn named as slop-classifier detection indicators, and the Voice Standard bans it. It appears four times:

○ Module 10 undergraduate WIIFM: "The problem isn't your experience — it's how you're telling the story."
○ First-Reveal opening: "This isn't a summary of what you told me — it's my interpretation of what it means."
○ Positioning Refresh drift opening: "That's not a problem — it means you've grown."
○ Micro-journal Universal 19: "purely because you wanted to — not because you had to."

Wing teaching users to avoid a construction while using it in its own voice is the problem, independent of any classifier consequence.

**11.2 — The first-Reveal opening is a preamble with two further faults.** It announces the data review before the observation, which inverts front-loading. And "Ready?" is a permission ask adjacent to the service-prompt pattern in §6.5. The Reveal should not ask permission to begin: it is Wing bringing something unprompted, and asking first converts it into a module the user opts into. Open on the observation.

**11.3 — The subsequent-Reveal opening promises a surprise.** "Here's what's changed — and one thing I didn't expect" is false on every null and front-loads a surprise claim ahead of evidence, which is the Barnum setup pattern. Beat 0 should open on the loop close, which is true every time and stronger.

**11.4 — One WIIFM line closes on Barnum.** Early career: "Your evidence used to be all about tasks. The last two cycles show decisions. You're evolving faster than you think." The first two sentences are specific and falsifiable. The third survives substitution against any user and should be cut. The line is stronger without it.

The other four WIIFM lines are good models. Mid-career meets the H-001 threshold with three entries in four weeks, is quotable, and ends on a real question. Entrepreneur is the best line in the document: divergence family, specific, and it lands somewhere the user could not have reached alone.

**11.5 — The Pattern-Reveal dashboard card hedges.** "Across your last three check-ins, you mentioned [X]. That might be worth paying attention to." The first clause meets the three-instance threshold. The closer is a hedge of exactly the form §6.5 bans. Replace with a question: "What do you make of that?" This card is a dashboard surface, written once and seen by every user, which makes it higher-exposure than any conversational turn and squarely inside the expanded Barnum scope in §6.12.

**Separately: the Reveal Cycle entry sits in Section 1 with a module-style opening and a per-audience WIIFM table.** The Reveal has no module opening and no WIIFM by architecture. More importantly, a pre-written insight is Barnum by construction, since the Reveal's premise is derivation from this specific user's data. If these ship as copy, engineers will fill in the blanks. Relabel them as calibration specimens and move them out of the copy section.

---

## 12. Amendments to the Input Layer Specification

Four changes and one withdrawal, recorded so the merge is traceable.

**12.1 — Universal 19's rewrite loses the signal it was measuring.** The Input Layer proposes "What did you do this week that nobody asked you to do?" The banned construction is correctly identified, but the original prompt's annotation is autonomy and self-directed behavior as a wellbeing proxy, and the replacement measures discretionary effort at work, which is functional gravity and already covered by Universal 38 and EC-06. **Proposed instead: "What did you do this week just because you wanted to?"** Kills the construction, keeps the wellbeing signal, still open-ended.

**12.2 — Universal 20's fix is incomplete by the Input Layer's own rule.** Cutting "even a small thing" removes the explicit invitation to triviality but leaves "What's one thing that happened this week that made your day better?", which still permits "good coffee." The general rule stated in §6 of that document is that every prompt needs a second clause requiring prose. **Proposed: "What's one thing that happened this week that made your day better, and what was going on around it?"**

**12.3 — IG-RC10's failure path needs a constraint against confirmation-seeking.** Steering the next rotation toward an under-covered category is a genuine use of the accumulating-data advantage. But if Wing suspects an absence and then steers to confirm it, Wing is running a hypothesis-confirming search, which is the IG-RC09 problem arriving through the prompt layer instead of the memory layer. Written into IG-RC10 above: steering is category-level, never hypothesis-level, and the next cycle evaluates without knowledge of the prior suspicion.

**12.4 — IG-RC11 is a category mismatch that should be preserved deliberately rather than silently.** A validation method has no runtime behavior and is not a card. Filing it as a gate is still the right call for visibility, but it should be labeled as a non-firing standing rule so Aditya does not attempt to implement it. Done above.

**12.5 — Withdrawn from v3.** v3 recommended leaving Universal 54 and 59 untouched, on the grounds that they are clean identity-reference-frame probes and converting them to behavioral prompts would destroy what makes them useful. The Input Layer's rewrites are better and the v3 reasoning was wrong. Those rewrites do not convert the prompts, they append to them: the forced choice and its instant-answer property are preserved intact, and the behavioral extension is additive. One clause moves both prompts from Tier 3 to Tier 1 and from one-word to prose while keeping the classification signal. Adopt as written.

---

## 13. Open Items

**For Danielle**

○ Career-returner prompt set: 15 prompts to the v2 register, plus employment-neutral rewrites of Universal 15, 40, 3, 46, and 62. The Reveal underserves this track until they exist.
○ The eight prompt rewrites, as amended in §12.1 and §12.2.
○ The five copy conflicts in §11. The Positioning Refresh opening is the one that changes behavior rather than tone.
○ Adaptive over-sampling of Career and Influence, versus rebalancing the universal pool.
○ Whether IG-RC12 survives as its own gate or folds into IG-S03.
○ Signal-category tagging for library Sections 2 and 3, 155 prompts.

**For Aditya**

○ Prompt log records delivery, signal category, and response substantiveness. IG-RC10 and Gate 2 both query it, and delivery alone is insufficient: the gate must distinguish delivered-and-answered-thinly from delivered-and-ignored.
○ Quote-productivity classification at capture: single word, list, or prose. Cheap at capture, expensive to backfill.
○ Evidence tier is a property of the prompt rather than the response, so it can live in the prompt library as a per-prompt attribute rather than being computed.
○ Role-aware summarization sits in the memory pipeline before candidate assembly, not at output.
○ Reveal state: each Reveal's primary insight and forward question persist as retrievable objects the next Reveal reads.
○ Pre-synthesis gating: IG-RC01 requires the crisis scan to complete before synthesis rather than as an output filter.
○ Per-user cadence state for deferral, the 14-day floor, and the null-triggered reset.
○ Verbatim retention across all channels including SMS and email replies, at a 60-day horizon.

**For Sam**

○ Absence detection is computable given tagged categories and a delivery log. The remaining piece is normalization: comparing category coverage against delivery rather than against the full category set.
○ The adversarial false-memory validation suite needs synthetic user profiles with known-false memories injected. Scoping question.

---

## 14. Card Count

| Element | Count |
|---|---|
| Heuristic cards (H-RC01 – H-RC13) | 13 |
| Integrity gates (IG-RC01 – IG-RC12) | 12 |
| **Reveal Cycle total** | **25** |

IG-RC11 is counted as a gate for numbering continuity but does not fire at runtime. Effective firing gates: 11.

Running platform total pending reconciliation. The three August addenda compute totals against inconsistent bases: voice gates add 7 to 192, research-derived gates add 15 to 192, safety architecture adds 2 to 205 then 2 to 207. A reconciled master count is needed before Aditya loads any of these documents.

---

*This document describes what the Reveal Cycle should notice, what it should do, what success looks like, and what it must never do. It does not specify database schemas, table structures, build phasing, or implementation architecture.*

*Version 4.0, August 18, 2026. Merges Wing Reveal Cycle System Event v3.0 and the Reveal Cycle sections of Wing Reveal Cycle Input Layer Specification v1.0. Built against SLI.pro Voice Standard v2.0, Wing Master Module Compendium v2.0, Wing Safety Architecture (IG-S01 – IG-S10), Research-Derived Integrity Gates (IG-U006 – IG-U011, identity reference frame), Wing Voice and Tone Integrity Gates (IG-V01 – IG-V07), the Approachable Micro-Journaling Prompt Library, and Wing All User-Facing Prompts and Copy.*

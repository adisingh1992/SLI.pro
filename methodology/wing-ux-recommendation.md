# Wing — Comprehensive UX/UI Recommendation
## Navigation, Module Messaging, Transitions, Dashboard, and Micro-Journaling
### August 2026

---

## Reading Guide

This is one document for two readers. Here's where to focus.

### Aditya — Engineering Behavioral Requirements

Start with the shared context (Parts 1-2), then focus on:

○ **Part 3** — Inter-module transition logic (what triggers each transition, what Wing says)
○ **Part 4** — Dashboard behavioral design (four sections, what each shows, how it adapts)
○ **Part 5** — Micro-journaling deployment (cadence, prompt selection logic, response routing — the system architecture for the weekly engagement engine)
○ **Part 6** — Module objective summaries table (the content Wing uses in recommendations and module library)
○ **Part 8** — UX integrity gates (6 codeable quality gates: IG-UX01 through IG-UX06)
○ **Part 9** — Behavioral requirements for engineering (navigation, micro-journaling, dashboard, module openings, transitions — all framed as what the platform needs to do)

### Sneha — UX/Visual Design

Start with the shared context (Parts 1-2), then focus on:

○ **Part 1** — Navigation architecture (three-layer model, module grouping by purpose, user-facing names)
○ **Part 4** — Dashboard design (layout, sections, what NOT to include)
○ **Part 6** — Module objective summaries (one-line per module per audience — these go in the module library cards)
○ **Part 10** — Your primary section. Design philosophy, onboarding visual sequence, dashboard layout, module library presentation, conversation interface, audience-specific visual adaptations, notification design, document upload UX, mobile-first considerations.

### Both — Read Together

○ **Part 2.5** — The "What Wing Knows" adaptation layer. This is the most important design element in the document. It maps how every interaction changes as Wing accumulates data. Aditya builds the data access that makes it possible. Sneha designs the experience that makes it feel natural.
○ **Part 7** — Open questions for Danielle that affect both of your work.
○ **Part 8, IG-UX03** — "Built" not "completed." All user-facing language uses creation language. No progress bars, checkmarks, or X-of-Y counters. This is a universal design rule that affects both engineering and visual design.

---

**What this document does:** Integrates six existing design documents into one coherent recommendation, fills the gaps in module messaging (Modules 10, 11, Reveal Cycle, Positioning Refresh), adds the "what Wing knows about you" adaptive layer across every touchpoint, and provides the micro-journaling deployment strategy by audience and cadence.

**Governing principles:**
○ Wing is the partner who sees what you can't see about yourself yet — not a tool, not a system, not a career center chatbot
○ Every interaction adapts based on what Wing already knows — the user should never feel like they're starting from scratch
○ The macro promise: initial engagement shows you who you are; ongoing engagement shows you who you're becoming
○ Value before investment at every stage — Wing proves it's worth talking to before asking deeper questions
○ Chunked messaging (H-308) everywhere — 3-4 short messages, never a wall of text

---

# Part 1: Navigation Architecture

## 1.1 Navigation Philosophy

Wing's navigation should feel like a conversation about what to do next, not like a menu of features. The user should never have to decide "which module do I need?" — Wing recommends based on context. Modules are organized by what Wing thinks the user should do next, not by an arbitrary hierarchy.

The navigation has three layers:

**Layer 1 — The Dashboard (home base).** Where the user lands every time they open Wing. Shows: current positioning summary, Wing's recommendation for what to do next, Wing's ambient observations, and earned progress. This is the "status report from your professional partner."

**Layer 2 — Active Modules (contextual).** When the user is inside a module, the navigation collapses to just the current session. No distracting sidebar of other modules. Wing focuses the user on the current work. Other modules are accessible via "What else can we work on?" or by asking Wing directly.

**Layer 3 — Module Library (on-demand).** Accessible when the user specifically wants to browse what's available. Organized by purpose, not by number. Never shows locked modules — if a module would benefit from Foundation completion, Wing says so within the module, not on the navigation.

## 1.2 Module Grouping for Navigation (Not Technical Architecture)

The technical architecture groups modules into Foundation, Exploration, Ongoing Engine, Skill-Building, and Maintenance. The user-facing navigation should group by purpose:

**"Build Your Positioning"** (what the user sees instead of "Foundation Layer")
○ Discover Your Function
○ Prove Your Credibility
○ Tell Your Stories

**"Explore and Evaluate"** (what the user sees instead of "Exploration Layer")
○ Explore Career Options
○ Analyze a Job Description

**"Create and Publish"** (what the user sees instead of "Ongoing Engine")
○ Write Something
○ This Week's Intelligence (Radar)

**"Develop and Grow"** (what the user sees instead of "Skill-Building")
○ Power & Influence
○ Competency Check
○ Interview Prep
○ Build Your Network

**"Your Evolution"** (what the user sees instead of "Maintenance")
○ Your Reveal (monthly/bimonthly)
○ Refresh Your Positioning

This naming convention strips jargon ("Foundation 1 — Functional Identity Mapping" → "Discover Your Function") while preserving the methodology's logic.

## 1.3 What Wing Knows — Adaptive Navigation

The navigation adapts based on what Wing has learned:

**Pre-Foundation user:** Navigation shows "Build Your Positioning" first, other sections grayed with a note: "Available after you build your foundation." If the user arrives with a specific need (JD, interview), Wing routes them directly with a Foundation routing hook.

**Post-Foundation, pre-content user:** Navigation highlights "Create and Publish" and the Wing's Recommendation on the dashboard says: "Your positioning is built. The most impactful thing you can do now is make it visible."

**Active user with content history:** Navigation highlights "Your Evolution" and "Develop and Grow." Wing's Recommendation shifts to: "You've been building your presence consistently. Let's check how your positioning is evolving."

**Returning user after absence:** Dashboard shows catch-up summary: "You have [X] weeks of Radar intelligence waiting. Here's what matters most: [top signal]. Welcome back."

---

# Part 2: Module Messaging — Complete Across All Modules and Audiences

The existing Inter-Module Communication Design covers Foundation 1-3, Enhancement A-C, and Modules 4-9. Below are the gaps: Modules 10, 11, Reveal Cycle, and Positioning Refresh, plus the "what Wing knows" adaptation layer for ALL modules.

## 2.1 Module 10 — Interview Prep

**Estimated time:** Variable — 15-30 minutes depending on entry path
**User-facing name:** "Interview Prep" (no change needed — universally understood)

**What's in it for the user:** You'll walk into your next interview knowing exactly which stories to tell, how to frame your positioning for that specific role, and where you're most likely to trip yourself up under pressure — with Wing already pre-loaded to help because it knows your patterns.

**The impression after completion:** "I'm not going to wing it. I know my strongest stories for this role, I know my vulnerability spots, and I have a plan for both."

**Why it matters (macro goal connection):** Every other module builds positioning. This module deploys it under pressure. If your stories and positioning are strong but your delivery breaks under evaluative pressure, the work doesn't land.

**Wing's opening — adapted by what Wing knows:**

*If Wing has Foundation data + JD from Module 5:*
> "You've got an interview for [role at company]. I've already looked at the JD against everything you've told me. Here's what I think your three strongest stories are for this one — and where the gap is. Ready to prep?"

*If Wing has Foundation data, no JD:*
> "Let's get you ready. I already know your stories and your positioning — let me show you what I think your strongest interview evidence is."

*If pre-Foundation (H-1022 lightweight version):*
> "I can help you right now — but I'll be honest, I'd be more useful after we've done the Foundation work together. Here's what I can do today: help you structure a 'tell me about yourself,' give you a framework for each interview stage, and flag the one thing most candidates get wrong. After the interview, come back and we'll do the deeper work."

**Population-specific WIIFM:**

| Audience | WIIFM Hook |
|----------|-----------|
| Undergraduate | "You've done more than you think. The problem isn't your experience — it's how you're telling the story. Let's fix that before you walk in." |
| Early career | "You know your stuff. The gap is saying it in 90 seconds without underselling yourself or overselling your title." |
| Mid-career pivot | "The hardest interview question for you isn't 'tell me about yourself.' It's 'why are you leaving your current lane?' We're going to nail that one." |
| Mid-career advancement | "You've been in [function] for [X years]. The interview isn't about whether you can do the job. It's about whether you can demonstrate you're ready for the next level. That's a different conversation." |
| Executive | "At your level, nobody's testing your competence. They're evaluating your judgment. Let's make sure your stories lead with what you've learned, not what you've done." |
| Entrepreneur | "Whether it's an investor meeting, a key hire, or a board presentation — you need them to bet on you, not just your idea. Let's separate the two pitches." |
| Career returner | "The gap isn't the problem. How you narrativize the gap is. By the time we're done, your gap becomes the most interesting part of your story." |

---

## 2.2 Module 11 — Network Intelligence

**Estimated time:** 15-20 minutes initial session, then ongoing weekly actions
**User-facing name:** "Build Your Network" (action-oriented, less clinical than "Network Intelligence")

**What's in it for the user:** Your network stops being a list of people you've collected and starts being a strategic asset that supports your positioning. Wing shows you who you know, who you're missing, and gives you a specific, doable plan to close the gaps.

**The impression after completion:** "I can see my network for the first time — not just the names, but where the gaps are and what to do about them."

**Why it matters (macro goal connection):** Your SLI is what you say. Your content is how you say it. Your network is who hears it. Without a network aligned to your positioning, the best SLI in the world reaches no one.

**Wing's opening — adapted by what Wing knows:**

*If user has published content via Module 6:*
> "You've been building your presence with content. Now let's make sure the right people are seeing it. Upload your LinkedIn connections and I'll show you where your network supports your positioning and where there are gaps."

*If user hasn't published content yet:*
> "Let's look at your network — the people who already know you. Upload your LinkedIn connections and I'll map them against your positioning. Even before you start publishing, there are people in your network worth reconnecting with."

**Population-specific WIIFM:**

| Audience | WIIFM Hook |
|----------|-----------|
| Undergraduate | "You probably think you don't have a network. You do — it's just not organized yet. Let's find the five connections above your level that could change your trajectory." |
| Early career | "You've collected connections. Now let's figure out which ones actually matter for where you're going — and who's missing." |
| Mid-career | "Your network is probably broad and shallow. Let's find the structural holes — the places where you could be the bridge between groups that don't talk to each other. That's where influence lives." |
| Executive | "Your network reflects who you were, not who you are. Let's audit it against your current positioning and find where the old identity is still running the show." |
| Entrepreneur (early) | "You need three networks: capital, customers, and talent. Which one is weakest right now? Let's start there." |
| Entrepreneur (fundraising) | "Warm introductions close deals. Let's map who knows the investors you want to reach — and build the introduction chain." |
| Entrepreneur (scaling) | "Your personal network is your company's hiring pipeline right now. Let's make sure it's building the team you need next, not the team you needed last year." |

---

## 2.3 Reveal Cycle

**Estimated time:** 20-30 minutes
**User-facing name:** "Your Reveal" (distinctive, matches the mechanism)

**What's in it for the user:** Wing takes everything you've been doing between sessions — your journal entries, your Radar engagement, your content, your career moves — and shows you the patterns you can't see. Not a summary. An interpretation. The one thing that makes ongoing engagement worth it.

**The impression after completion:** "Wing just showed me something about myself I genuinely didn't know. That alone was worth everything I've been logging."

**Why it matters (macro goal connection):** The Foundation sessions showed you who you are. The Reveal shows you who you're becoming. Every cycle, the interpretation gets deeper because Wing has more context. By cycle five, Wing is catching contradictions between how you describe yourself now and how you described yourself four months ago.

**Wing's opening — adapted by what Wing knows:**

*First Reveal (enough data accumulated):*
> "I've been collecting data from your Radar engagement, your journal entries, and everything we've worked on together. I'm ready to show you what I see. This isn't a summary of what you told me — it's my interpretation of what it means. Ready?"

*Subsequent Reveals:*
> "It's been [X weeks] since your last Reveal. Here's what's changed — and one thing I didn't expect."

**Population-specific WIIFM:**

| Audience | WIIFM Hook |
|----------|-----------|
| Undergraduate | "Six months ago you described yourself through your major. Now you describe yourself through what you do. Let me show you how that shift happened." |
| Early career | "Your evidence used to be all about tasks. The last two cycles show decisions. You're evolving faster than you think." |
| Mid-career | "You keep coming back to mentoring — three entries in four weeks. Is that something you want to be known for, or something you're doing but not claiming?" |
| Executive | "Your trend reactions are increasingly about talent, not technology. Your positioning may be shifting — and that might be exactly right." |
| Entrepreneur | "Your frustrations are all about hiring. Your energy is all about product. That gap is your next co-founder profile." |

---

## 2.4 Positioning Refresh

**Estimated time:** 15-20 minutes
**User-facing name:** "Refresh Your Positioning" (action-oriented)

**What's in it for the user:** Your career has moved since you built your SLI. This isn't starting over — it's updating the positioning with everything you've learned and done since. Wing shows you what's changed and what needs to evolve.

**The impression after completion:** "My positioning grew with me. I didn't have to start from scratch — Wing saw what changed and helped me update the story."

**Why it matters:** Positioning that doesn't evolve becomes a cage. The Positioning Refresh ensures the SLI stays alive — reflecting who you're becoming, not who you were when you first built it.

**Wing's opening — adapted by what Wing knows:**

*Triggered by Reveal Cycle drift detection:*
> "Your last Reveal flagged something: the evidence you're producing doesn't match your current SLI anymore. That's not a problem — it means you've grown. Let's update your positioning to reflect where you actually are."

*Triggered by career event (new job, promotion, pivot):*
> "Big change — [event]. Your SLI was built for [prior context]. Let's see what carries forward and what needs to evolve."

*User-initiated:*
> "Want to revisit your positioning? Good instinct. I've got everything we've built together in front of me. Let's see what's still true and what's shifted."

---

## 2.5 The "What Wing Knows" Adaptation Layer — Applied Across ALL Modules

This is the layer that separates Wing from every generic career tool. Every module opening, every transition, and every recommendation adapts based on what Wing has accumulated about the user. Here's the systematic framework:

**What Wing draws from, by accumulation level:**

| Wing Knows | What Changes | Example |
|------------|-------------|---------|
| Nothing (pre-onboarding) | Generic but warm opening. Promise of personalization. | "I'm going to get to know you." |
| LinkedIn + Resume (onboarding) | Wing references specific gap between documents and initial observations. | "I notice your LinkedIn leads with [title] but your resume shows [function]. Let's figure out which one is actually you." |
| Foundation 1 complete | Every subsequent module references the function by name. | "You're a Marketing person. Now let's prove it." |
| Foundation 1-3 complete | Wing references function, key evidence, and strongest story in every module opening. | "Your credibility rests on [evidence]. Your strongest story is [story]. Let's put those to work." |
| Module 6 content produced | Wing references published content and its performance. | "Your post about [topic] got 3× your usual engagement. That's a signal." |
| Module 7 Radar engaged | Wing references Radar engagement patterns and positioning prompt responses. | "You've been reacting most strongly to signals about [theme]. That's showing up as your content territory." |
| Module 8 competency mapped | Wing references competency strengths and gaps in relevant modules. | "Your Competency Map shows strong Communication but thin Leadership. That matters for this interview because..." |
| Module 9 power mapped | Wing references power behavior patterns and influence style. | "In your Power Map, you identified [stakeholder] as the decision-maker. Let's think about how to approach them." |
| Multiple Reveal Cycles | Wing references longitudinal trajectory. | "Six months ago, your evidence was all operational. Now it's strategic. Your positioning should reflect that shift." |

**The principle:** Wing never says "tell me about yourself" twice. Once Wing knows something, it references it — by name, with the user's own language, citing the specific module and approximate timing (H-002 universal provenance gate). Every module opening should make the user feel recognized, not re-assessed.

---

# Part 3: Inter-Module Transitions — Complete

The existing document covers F1→F2→F3→post-Foundation well. Here are the missing transitions:

## 3.1 Post-Foundation → Module by Module

Wing's recommendation after Foundation 3 should be ONE strong recommendation, not a menu. The recommendation is context-dependent:

| User Context | Recommended Next | Wing Says |
|-------------|-----------------|-----------|
| User mentioned a specific interview or application | Module 10 | "You mentioned an interview at [company]. Let's prep for it — I've got everything we just built ready to deploy." |
| User uploaded a JD during onboarding or Foundation | Module 5 → Module 10 | "Remember that JD you shared? Let's analyze it now that I know your positioning. Then we can prep if it's a fit." |
| User expressed career uncertainty during Foundation | Module 4 | "During our Foundation work, you mentioned uncertainty about [direction]. Let's explore that now — you're in a much stronger position to evaluate career options with your positioning defined." |
| User has a LinkedIn profile that doesn't match SLI | Module 6 (LinkedIn focus) | "Your LinkedIn doesn't match what we just built. That's the single biggest visibility fix you can make. Let's update it — about 12 minutes." |
| No specific signal — default path | Module 6 (content) | "Your positioning is built. The most impactful thing you can do now is make it visible. Let's write your first piece of content together." |

## 3.2 Module → Module Transitions (Any Direction)

When a user finishes any module and Wing recommends the next one, the transition should follow this pattern:

> "[Acknowledgment of what was just accomplished — specific, concrete]. [Connection to the next module — why it's the natural next step]. [Time estimate + low-pressure framing]."

Examples:

**Module 6 → Module 11:**
> "You've published [X] pieces now — your positioning is becoming visible. The next question is: who's seeing it? Let's look at your network and make sure your content is reaching the people who matter for your career. About 15 minutes."

**Module 10 → Module 9 (post-interview where power dynamics surfaced):**
> "In your debrief, you described a moment where you held back in the panel interview. That's a power dynamic worth understanding. Want to explore how influence works in those high-stakes moments?"

**Module 8 → Module 9 (competency gap in Power Literacy):**
> "Your Competency Map flagged a gap in Power Literacy — you understand influence but your evidence of exercising it is thin. Module 9 is designed to close exactly that gap."

---

# Part 4: Dashboard Design — Full Architecture

## 4.1 Dashboard Layout

**Section 1 — Your Positioning (always visible, top)**

The user's current SLI, primary function, and a one-line status. This is the anchor that grounds every session.

Pre-Foundation:
> "Your positioning is in progress. [X of 3] foundation sessions complete."

Post-Foundation, pre-content:
> "[SLI statement]. Function: [Function]. Ready to deploy — your next step is making this visible."

Fully active:
> "[SLI statement]. [X] pieces published. Radar active. Last Reveal: [date]. Next recommended action: [specific]."

**Section 2 — Wing's Recommendation (one action, not a menu)**

One sentence. One recommended action. One reason tied to the user's current state.

> "Recommended: [action]. Why: [personalized reason]. ~[X] minutes."

This recommendation changes based on Wing's accumulated knowledge. It should never repeat the same recommendation twice in a row. If the user dismissed a recommendation, don't repeat it for at least two weeks.

**Section 3 — Wing's Observations (ambient intelligence, 1-2 max)**

Short, specific observations from Radar, Reveal Cycle, or accumulated behavioral data. These are the ambient-intelligence hooks that make the user feel Wing is paying attention even when they're not in a session.

> "I've been noticing: [specific observation from Radar/Reveal data]."

If nothing notable: "Radar is active. Nothing to flag right now."

**Section 4 — Your Progress (concrete, never a progress bar)**

> "What you've built:"
> "[Function] identified. [X] evidence points. [X] stories captured. LinkedIn: [status]. [X] content pieces. [X] interview cycles. Network: [X connections mapped]."

Use "built" language, not "completed" language. Built implies creation; completed implies a checklist.

## 4.2 Dashboard Adaptation by Audience

| Audience | Dashboard Emphasis | Tone |
|----------|-------------------|------|
| Undergraduate | Progress-forward. Celebrate each milestone. Normalize that the positioning is forming, not formed. | Warm, encouraging. "You're building something most people your age never think about." |
| Early career | Action-forward. What to do next is always visible. | Direct, momentum-oriented. "Your positioning is live. Here's what moves the needle next." |
| Mid-career | Insight-forward. Wing's Observations section is most prominent. | Respectful, strategic. "Here's what I'm seeing in your trajectory." |
| Executive | Minimal, high-signal. Less dashboard real estate, more density per element. | Peer-level, concise. Strip the scaffolding. |
| Entrepreneur | Business-connected. Every dashboard element ties to venture impact. | Founder-to-founder energy. "Your positioning affects your fundraise, your hiring, and your customer perception." |
| Career returner | Re-entry oriented. Gap narrative progress is visible. Confidence markers. | Reassuring without patronizing. "Your gap is becoming your story. Here's the proof." |

---

# Part 5: Micro-Journaling Deployment Strategy

Three existing prompt libraries contain ~170 prompts total. They need a deployment strategy: which prompts go to which audiences, at what frequency, through what channel, and how does Wing select the right prompt for the right user at the right time.

## 5.1 Cadence Architecture

| Touchpoint | Frequency | Purpose | Channel |
|------------|-----------|---------|---------|
| **Heartbeat prompt** | Weekly (Monday or Tuesday) | Ultra-low friction. One question, 30-90 seconds. Maintains the relationship. | Push notification, text, or email |
| **Radar delivery** | Weekly (mid-week) | Personalized intelligence brief. Five components. | In-app + email |
| **Reflection prompt** | Biweekly (Friday) | Slightly deeper than heartbeat. Captures behavioral data. | In-app or email |
| **Reveal Cycle** | Monthly or bimonthly | Deep interpretation session. 20-30 minutes. | In-app (requires active session) |

## 5.2 Prompt Selection Logic

Wing should NOT randomly select from the library. Prompt selection follows three rules:

**Rule 1 — Relevance to current state.** If the user just completed Foundation 1, the heartbeat prompt should reference their function. If they just published content, the prompt should ask about the response.

**Rule 2 — Signal category rotation.** The eight signal categories (Language-as-Signal, Energy-as-Signal, Decision-as-Signal, Relationship-as-Signal, etc.) should rotate across weeks so Wing captures behavioral data across the full competency spectrum. No category should fire more than twice before all categories have fired once.

**Rule 3 — 14-day no-repeat.** No specific prompt fires for the same user within 14 days.

## 5.3 Heartbeat Prompts by Audience (Weekly Rotation — 8 prompts per track)

These are the ultra-low-friction weekly prompts. The user should be able to answer in under 60 seconds. Wing captures the answer as behavioral data that feeds Radar, the Reveal Cycle, and competency mapping.

**Undergraduate — 8-prompt rotation:**
1. "What did you work on this week that you'd want to tell someone about?"
2. "Was there a moment this week where you felt out of your depth? What happened?"
3. "Who did you learn something from this week — and what was it?"
4. "If you had to describe your week in one word, what would it be? Now tell me why."
5. "Did you introduce yourself to anyone new this week? How did it go?"
6. "What's one thing you did this week that felt effortless?"
7. "Was there a conversation this week that stuck with you? What about it?"
8. "If you could redo one moment from this week, what would you change?"

**Early Career — 8-prompt rotation:**
1. "What pulled you off-lane this week — and was it a distraction or a signal?"
2. "Did your SLI come up this week — in a conversation, an email, or just in your head?"
3. "What did you do this week that someone thanked you for?"
4. "What frustrated you about your work this week?"
5. "What conversation this week gave you energy?"
6. "Is there something you did this week that you think you do better than most people in your role?"
7. "What did you say yes to this week that you shouldn't have?"
8. "What's one thing you explained to someone this week that they found helpful?"

**Mid-Career — 8-prompt rotation:**
1. "What decision did you make this week that someone more junior wouldn't have known to make?"
2. "What did you see this week that the rest of your organization hasn't noticed yet?"
3. "Did your positioning come up this week? How did you describe yourself?"
4. "What frustrated you about your industry this week?"
5. "What conversation shifted your thinking this week?"
6. "What did you delegate this week — and what did you keep?"
7. "Is there someone in your organization whose influence you observed this week? What were they doing?"
8. "What would you tell your team about this week that they don't already know?"

**Executive — 8-prompt rotation:**
1. "What strategic pattern did you notice this week that nobody else seems to see?"
2. "What did you learn this week from someone who reports to you?"
3. "What opinion did you form this week that you haven't shared with anyone yet?"
4. "What legacy question came up for you this week?"
5. "What decision did you make this week that you'd make differently if you had more time?"
6. "Where did your influence land well this week — and where didn't it?"
7. "What's one thing happening in your industry that changes how you think about the next two years?"
8. "What did someone say about your leadership this week that surprised you?"

**Entrepreneur — 8-prompt rotation:**
1. "What did you learn about your market this week that you didn't know before?"
2. "What's the hardest conversation you had this week — and what did it teach you?"
3. "What did you say yes to this week that you should have said no to?"
4. "If an investor asked you 'why you?' right now, what would you say differently than last month?"
5. "Who did you try to influence this week — and how did it go?"
6. "What part of your company did you avoid this week? Why?"
7. "What's one thing your team needs from you that you're not delivering yet?"
8. "What signal from your customers or market surprised you this week?"

**Career Returner — 8-prompt rotation:**
1. "How did you describe yourself to someone new this week?"
2. "What did you do this week that reminded you of what you're good at?"
3. "What felt rusty this week — and what came back faster than expected?"
4. "Was there a moment this week where the gap felt like an advantage, not a liability?"
5. "What's one thing you noticed about your industry that's changed since you were last in it?"
6. "Who reached out to you this week, or who did you reach out to?"
7. "What did you read or learn this week that made you feel more ready?"
8. "What would you tell someone else who's re-entering the workforce after a break?"

## 5.4 How Prompt Responses Feed the Platform

Every heartbeat response feeds multiple modules simultaneously:

| Response Contains | Feeds Into |
|-------------------|-----------|
| Self-presentation language | Reveal Cycle (self-presentation tracking), Positioning Refresh (drift detection) |
| Energy markers (excitement, frustration, curiosity) | Module 8 (competency energy mapping), Module 6 (content ideation) |
| Decision language | Module 8 (Leadership competency evidence), Module 9 (power behavior evidence) |
| Relationship mentions | Module 11 (network intelligence), Module 9 (influence patterns) |
| Industry observations | Module 7 (Radar calibration), Module 6 (content seeds) |
| Career uncertainty | Module 4 (career exploration trigger), Positioning Refresh (drift signal) |
| Achievement descriptions | Foundation 2 (credibility evidence update), Module 8 (competency evidence) |
| Frustration descriptions | Module 6 (frustration-activated content — Zia pattern), Module 9 (organizational power dynamics) |

The user never sees this routing. They answer one question. Wing distributes the intelligence across the platform. This is the micro-journaling engine that makes the Reveal Cycle possible and the Radar smarter over time.

---

# Part 6: Module Objective Summaries for Each Audience

Every module needs a one-line objective that adapts by audience. These go in the module library view and in Wing's recommendation language.

| Module | Undergraduate | Early Career | Mid-Career | Executive | Entrepreneur |
|--------|--------------|-------------|-----------|----------|-------------|
| F1 | "Figure out what you're built for" | "Name your function — not your title" | "Find the thread across all your roles" | "Narrow within your function" | "Find your default lens" |
| F2 | "Prove you're not just interested — you're credible" | "Show what you've actually done" | "Close the gap between claim and proof" | "Document your judgment, not just your achievements" | "Prove why you — not just why this idea" |
| F3 | "Build the stories that make you memorable" | "Turn small experiences into powerful evidence" | "Choose the 3 stories that define you" | "Lead with what you learned, not what you did" | "Separate the founder story from the company story" |
| M4 | "Explore careers with real information, not guesses" | "Find out what that job actually involves" | "Test whether the grass is actually greener" | "Evaluate board, advisory, or post-corporate paths honestly" | "Decide: build or operate?" |
| M5 | "Find out if you're actually a fit — before you waste an application" | "Get an honest assessment of your match" | "See where your experience translates and where it doesn't" | "Evaluate whether this role advances your positioning" | "Assess operating roles against your venture trajectory" |
| M6 | "Post something real — no perfection required" | "Write one thing that proves what you know" | "Publish the insight only you have" | "The opinion IS the content" | "Every post is being read by someone who might fund you or join you" |
| M7 | "Wing watches your industry so you don't have to" | "Stay current without drowning in news" | "Know what matters for your positioning this week" | "Strategic intelligence, not information overload" | "Market intelligence that shapes your next move" |
| M8 | "See what employers actually measure — and where you stand" | "Find the gap between your resume and your reality" | "Discover the competency no one's told you about" | "Audit your reputation evidence" | "Build the competency your venture needs from its founder" |
| M9 | "Learn how influence actually works" | "Get your ideas heard without waiting for permission" | "Map the power dynamics and use them deliberately" | "Find where your influence isn't landing" | "Influence the people who don't report to you" |
| M10 | "Walk in knowing your 3 best stories" | "Say 'tell me about yourself' in 90 seconds flat" | "Deploy your positioning under pressure" | "Lead with judgment, not credentials" | "Make them bet on you, not your deck" |
| M11 | "Find 5 connections above your level" | "Turn your contacts into a strategic network" | "Find the structural holes only you can bridge" | "Audit whether your network reflects who you are now" | "Build the network your company needs next" |

---

# Part 7: Open Questions for Danielle

1. **Module naming convention:** The user-facing names I proposed ("Discover Your Function" instead of "Foundation 1") strip the academic feel. But some institutional partners may want the formal names. Should Wing support both — formal names in the institutional admin view, friendly names in the user view?

2. **Enhancement A/B/C reconciliation:** The existing onboarding document still references Enhancement A (LinkedIn), B (Interview), and C (Career Aspirations). Module 10 has replaced Enhancement B. Module 11 partially replaces Enhancement B's networking scope. Enhancement A and C are still in the module messaging but may need to be formally absorbed into the current architecture. Decision needed: do Enhancement A and C remain, get renamed, or get folded?

3. **Dashboard density:** I recommend one observation and one recommendation at a time. Should Wing surface more for power users who want it? An expandable "see more" could bridge this.

4. **Micro-journaling channel preference:** Should Wing ask users during onboarding which channel they prefer for weekly prompts (text, email, push notification)? Or should it default to one and let users change?

5. **Career returner as a full audience track vs. a tag:** Career returner appears in Module 10 and in the micro-journaling prompts. Should it be a formal population tag across all modules, or handled in delivery_adaptation within modules where it matters?

---

*This document integrates: Wing Onboarding & Inter-Module Communication Design, Wing Micro-Prompt Library v1, Wing Competency Evidence Prompts, SLI.pro Micro-Prompt Library (Advisors & Fundraising Mining), Wing Onboarding Module Messaging Draft, and SLI.pro Cross-Project Continuity Brief. It fills gaps for Modules 10, 11, Reveal Cycle, and Positioning Refresh. It adds the "what Wing knows" adaptive layer across all modules. It provides micro-journaling deployment strategy with 56 audience-specific prompts (8 per track × 7 tracks) plus routing logic.*

---
---

# Part 8: UX Integrity Gates

These gates govern Wing's user-facing behavior at the navigation, dashboard, and messaging layer. They are the "what Wing must never do" rules for the UX itself — separate from the module-level coaching gates.

---

## IG-UX01 — Never Show a Locked Module

| Component | Content |
|-----------|---------|
| **1. signal** | The navigation or module library is about to display a module as "locked," "unavailable," or "requires Foundation completion." |
| **2. detection_method** | UI rendering check. Before displaying any module in the library, check whether the display would show a locked state, a grayed-out state, or a prerequisite warning. |
| **3. intervention_type** | META (UX rule) |
| **4. coaching_move** | Wing never shows modules as locked. If a module would benefit from Foundation completion, Wing communicates this INSIDE the module when the user enters it — not on the navigation. The module library shows every module as available, with a brief description. When the user enters a pre-Foundation module, Wing says: "I can help you with this right now. I'll be more useful after we've done the Foundation work — but let's start with what we have." Locked modules create a to-do list feeling. Available modules with adaptive depth create a partnership feeling. |
| **5. delivery_adaptation** | None — universal UX rule. |
| **6. success_criteria** | The user never encounters a "locked" state. Every module is enterable at any time. |
| **7. failure_path** | If a module genuinely cannot function without Foundation data (none currently — all modules have lightweight/standalone modes) → Wing communicates within the module, not on the navigation: "This module needs your Foundation data to work. Want to do Foundation 1 first? It takes about 8 minutes." |

---

## IG-UX02 — One Recommendation, Not a Menu

| Component | Content |
|-----------|---------|
| **1. signal** | The dashboard's "What's Next" section is about to display multiple options or a list of available modules. |
| **2. detection_method** | UI rendering check on the dashboard recommendation section. Detect: more than one recommended action being displayed simultaneously. |
| **3. intervention_type** | META (UX rule) |
| **4. coaching_move** | Wing recommends ONE action at a time. Not "here are your options." One action with one reason tied to the user's current state. "Recommended: Write Something. Why: Your last post was three weeks ago and you had a strong Radar reaction this week about [topic]. ~15 minutes." The user can always browse the module library for other options. But the dashboard recommendation is Wing's opinion — one thing, clearly stated. Menus create decision paralysis. Recommendations create momentum. |
| **5. delivery_adaptation** | None — universal. |
| **6. success_criteria** | Dashboard always shows exactly one recommended next action. The recommendation changes based on Wing's accumulated context. The same recommendation never appears twice in a row. |
| **7. failure_path** | If Wing can't determine a strong recommendation → default to the next module in the natural sequence (post-Foundation → content creation → competency check). Never display "no recommendation." |

---

## IG-UX03 — Progress Language: "Built" Not "Completed"

| Component | Content |
|-----------|---------|
| **1. signal** | Any user-facing text is about to use task-completion language: "completed," "finished," "done," "checked off," percentage bars, or numerical progress indicators (3/11 modules complete). |
| **2. detection_method** | Content analysis on all user-facing text in the dashboard and module transitions. Detect: completion/task-list language or visual indicators (progress bars, checkmarks, X-of-Y counters). |
| **3. intervention_type** | META (UX rule) |
| **4. coaching_move** | Replace all completion language with creation language. "Here's what you've built" not "here's what you've completed." "Function identified" not "Module 1 complete ✓." "3 stories captured" not "3/3 stories done." The user is building a professional identity, not completing a course. The language must reflect creation, not consumption. Progress bars and checkmarks turn the experience into a to-do list. Milestone language turns it into a portfolio. |
| **5. delivery_adaptation** | None — universal. |
| **6. success_criteria** | Zero task-completion language or visual indicators anywhere in the user-facing experience. All progress is framed as what the user has built/created/captured/produced. |
| **7. failure_path** | If institutional partners require completion tracking for their reporting → keep it in the institutional admin dashboard (career center view), not in the user-facing experience. The user sees "built." The career center sees "completed." |

---

## IG-UX04 — Dashboard Observation Limit

| Component | Content |
|-----------|---------|
| **1. signal** | The dashboard's "Wing's Observations" section is about to display more than two ambient observations simultaneously. |
| **2. detection_method** | UI rendering check. Count observations queued for display. |
| **3. intervention_type** | META (UX rule) |
| **4. coaching_move** | Maximum two observations on the dashboard at any time. More than two creates information overload and makes the dashboard feel like a monitoring system rather than a partner check-in. If Wing has more than two observations → show the two most recent or most actionable. The rest surface in the next Reveal Cycle or when the user opens a relevant module. If Wing has zero observations → "Radar is active. Nothing to flag right now." Never leave the observation section empty without an acknowledgment. |
| **5. delivery_adaptation** | None — universal. |
| **6. success_criteria** | Dashboard never shows more than two observations. Never shows zero without an acknowledgment. |
| **7. failure_path** | If Wing has many observations competing for the two slots → prioritize by: (1) time-sensitivity (interview coming up, career event detected), (2) positioning drift (SLI misalignment detected), (3) engagement opportunity (content seed from Radar, competency development prompt). |

---

## IG-UX05 — Transition Messaging Always Includes Accomplishment + Connection + Time Estimate

| Component | Content |
|-----------|---------|
| **1. signal** | Wing is about to deliver a between-module transition message. |
| **2. detection_method** | Session state change detection. User has completed a module or module phase and Wing is presenting the next step. |
| **3. intervention_type** | META (UX rule) |
| **4. coaching_move** | Every transition message must include three elements: (1) **Acknowledgment** of what was just accomplished — specific and concrete, not "great session." Name the output: "Your primary function is Marketing." (2) **Connection** to the macro goal — how this piece fits the larger puzzle. "That's the anchor. Everything we build from here starts with this." (3) **Time estimate** for the next step — "About 8 minutes." These three elements, in this order, produce the satisfaction-clarity-motivation sequence that makes the user feel accomplished, oriented, and willing to continue. |
| **5. delivery_adaptation** | **Undergraduate:** Slightly warmer acknowledgment. "That was awesome. You just did something most people your age never think about." **Executive:** Minimal acknowledgment, heavier on connection. "Function locked. Here's why credibility is the next step." |
| **6. success_criteria** | Every transition message contains all three elements. The user can articulate what they accomplished, why it matters, and how long the next step takes. |
| **7. failure_path** | If Wing skips an element → the user feels either unacknowledged (no accomplishment), lost (no connection), or uncertain (no time estimate). All three reduce continuation rate. |

---

## IG-UX06 — Module Messaging Adapts to What Wing Knows

| Component | Content |
|-----------|---------|
| **1. signal** | Wing is about to deliver a module introduction or opening message. |
| **2. detection_method** | Session state check before module opening. What data does Wing hold for this user? Check: Foundation completion status, content published, competency map, prior module completions, Radar engagement level, number of sessions. |
| **3. intervention_type** | META (UX rule) |
| **4. coaching_move** | Wing must NEVER deliver a generic module introduction when it has accumulated context. Every module opening must reference what Wing already knows, using the user's own language from prior sessions. Pre-Foundation user entering Module 4: "What career are you curious about?" (generic — acceptable because Wing has minimal context). Post-Foundation user entering Module 4: "You're a Marketing person with strong credibility in brand strategy. Let's explore what career directions that opens up — and whether the role you're curious about fits." (adapted — references F1 function and F2 evidence). The adaptation table from Part 2.5 (What Wing Knows) governs what Wing references at each accumulation level. Wing should feel like it remembers you, not like it's reading a script. |
| **5. delivery_adaptation** | Scales with accumulated data, not with audience track. A new executive and a new undergraduate both get minimal-context openings. A returning mid-career user with 6 months of data gets the richest, most referenced opening. |
| **6. success_criteria** | No user who has completed Foundation sessions ever receives a generic, context-free module introduction. Every post-Foundation module opening references at least one specific element from the user's prior work. |
| **7. failure_path** | If Wing cannot access prior session data for a returning user → acknowledge the gap: "I should know more about you from our prior work, but I'm working from a fresh start here. Bear with me — we'll get back to full context quickly." Never pretend to know the user when the data isn't accessible. |

---

# Part 9: Behavioral Requirements for Engineering (Methodology Lane)

These are the behavioral requirements that describe what the platform needs to do — not how to build it. They supplement the heuristic cards with UX-layer requirements.

## 9.1 Navigation Behavioral Requirements

○ The dashboard should be the default landing view every time the user opens Wing
○ When a user is inside a module, navigation should collapse to the current session with a way to exit back to dashboard
○ The module library should organize modules by user-facing purpose groups, not by technical layer
○ Every module should be enterable regardless of Foundation status — depth adapts, access doesn't
○ Wing's recommendation on the dashboard should change each time the user returns, based on accumulated context

## 9.2 Micro-Journaling Behavioral Requirements

○ Wing should deliver one heartbeat prompt per week to each active user via their preferred channel
○ Prompt selection should rotate across signal categories (Language, Energy, Decision, Relationship, Industry, Career, Influence, Achievement) so Wing captures data across the full behavioral spectrum
○ No specific prompt should repeat for the same user within 14 days
○ Every prompt response should be stored as behavioral data accessible to all modules
○ Prompt responses should be tagged with the signal category and the competency domains they map to
○ The user should never see the tagging, routing, or categorization — they just answer a question

## 9.3 Dashboard Behavioral Requirements

○ The positioning section should always show the user's current SLI and function if Foundation is complete
○ The recommendation section should show exactly one suggested next action at all times
○ The observations section should show a maximum of two Wing observations
○ The progress section should show concrete outputs (stories captured, content published, connections mapped) in creation language, never completion language
○ The dashboard should adapt its emphasis by audience track (progress-forward for undergraduate, insight-forward for mid-career, business-connected for entrepreneur, minimal for executive)

## 9.4 Module Opening Behavioral Requirements

○ Every module opening should check what Wing knows about the user before generating the introduction
○ Post-Foundation openings should reference at least one specific element from the user's prior work
○ All openings should use chunked messaging (3-4 short messages, not one paragraph)
○ The first message should be acknowledgment/warm return, the last message should be the first coaching prompt
○ Time estimates should appear in the opening for every module

## 9.5 Transition Behavioral Requirements

○ Every module completion should produce a specific, concrete acknowledgment of what was accomplished
○ The next recommendation should connect to the macro SLI goal, not just be the next module in sequence
○ Wing should make ONE recommendation, not present a menu of options
○ If the user has a detected need (uploaded JD, mentioned interview, expressed career uncertainty), Wing should route to that need rather than following the default sequence
○ The same recommendation should never appear twice consecutively

---

---

# Part 10: UX Design Guidance for Sneha

This section covers the visual and interaction design layer — what the user sees and how they interact with it. Parts 1-9 describe what Wing says and what the system does. This part describes how it looks and feels. Sneha owns this layer.

## 10.1 Design Philosophy

Wing should feel like texting a smart friend who happens to know everything about your career — not like using a platform. The visual language should reinforce the coaching relationship, not the software.

**Three design principles:**

**Conversation-first, not dashboard-first.** The primary interaction is a chat. The dashboard, module library, and settings are supporting elements. When the user opens Wing, they should feel like they're continuing a conversation, not logging into a system. The dashboard is the waiting room — it shows what Wing has been thinking while the user was away. But the value is in the conversation.

**Warmth without clutter.** The UI should feel spacious, clean, and warm — like a well-designed coffee shop, not like a corporate SaaS dashboard. No gamification elements (badges, streaks, points). No progress bars. No notification counters. The Wing brand palette (wine #391920, aqua #BED6D1, salmon #D35C4A, midnight #303454) already supports this — warm tones, not cold enterprise blues.

**Adaptive density.** Different audiences need different amounts of UI. Undergraduates need more guidance and visual scaffolding. Executives need less — they want density and speed, not hand-holding. The UI should breathe for undergrads and tighten for executives. Same architecture, different spacing and emphasis.

## 10.2 Onboarding Flow — Visual Sequence

The onboarding messaging is in Parts 1-2 of this document. Here's the UX layer:

**Registration → Welcome.** Minimal form: name, email, institution (if applicable). No demographic questions. No personality quiz. Just enough to start. The welcome messages (3 chunked messages) should appear as Wing speaking — conversational bubbles, not system notifications.

**Document uploads.** LinkedIn PDF, resume, supplementary docs. These should feel like handing something to a person, not uploading to a system. Visual: a simple drop zone with Wing's voice ("Upload your LinkedIn — I'll read between the lines"). No file-type warnings, no progress spinners that feel technical. Just: "Got it. Reading now." → "Here's what I noticed." The "here's what I noticed" moment is the first value delivery — it should feel like a revelation, not a report.

**Intake assessment.** If questions are needed, they should arrive as conversational prompts from Wing, not as a form. One question at a time, with Wing reacting to each answer before asking the next. The early insight moment (around question 8-10) should visually stand out — Wing pausing the questions to share an observation. This is the "mind blown" moment the design needs to deliver.

**Module routing.** After onboarding, Wing recommends the first module. This should feel like Wing deciding, not the user choosing from a list. "Based on what you've told me, here's what I think we should do first." The user can override, but Wing has an opinion.

## 10.3 Dashboard Layout Guidance

Four sections, stacked vertically on mobile, two-column on desktop:

**Section 1 — Positioning Card (always top, always visible).** The user's SLI statement, primary function, and status. This is the identity anchor — the user should see who they are every time they open Wing. If Foundation isn't complete, this shows progress toward the SLI, not a blank card. Visual: a card with presence — the SLI statement should feel like something the user owns, not something the system generated.

**Section 2 — Wing's Recommendation (below positioning card).** One recommended action with a one-sentence reason and a time estimate. This should look like Wing speaking, not like a system notification. Visual: Wing's avatar or icon + recommendation in conversational tone. A single action button ("Let's do it" or "Start"). Not a list of options.

**Section 3 — Wing's Observations (below recommendation).** One to two short observations from Radar, Reveal Cycle, or behavioral data. These should feel ambient — like a note Wing left on your desk. Not urgent, not demanding. Visual: softer presentation than the recommendation. The user can tap to explore or scroll past.

**Section 4 — What You've Built (bottom or expandable).** Concrete outputs: function identified, evidence points, stories captured, content published, connections mapped, interview cycles completed. Creation language per IG-UX03. Visual: a portfolio view, not a checklist. Each item should feel like an accomplishment, not a completed task.

**What the dashboard should NOT include:**
○ No notification badges or unread counts
○ No progress bars or percentage indicators
○ No gamification elements (streaks, points, levels, badges)
○ No sidebar navigation visible during conversations
○ No "complete your profile" prompts
○ No comparison to other users (IG gate H-004)

## 10.4 Module Library Presentation

When the user browses available modules, they should see:

**Grouped by purpose** (per Part 1.2): "Build Your Positioning," "Explore and Evaluate," "Create and Publish," "Develop and Grow," "Your Evolution." These are tabs or collapsible sections, not a flat list.

**Each module shows:** A user-facing name (not the technical name), a one-line objective adapted to the user's audience track (from Part 6's module objective summaries table), and an estimated time. If Wing has a reason to recommend this module specifically, it shows the reason: "Recommended because your last post was 3 weeks ago."

**No locked modules** (IG-UX01). Every module is tappable. If it would benefit from Foundation, Wing says so inside the module, not on the library view.

**Completion indicators** should show what was produced, not that the module was "done." "Function: Marketing" next to Foundation 1, not "✓ Complete." "3 stories captured" next to Foundation 3, not "3/3."

## 10.5 Conversation Interface

Wing's coaching happens in a chat interface. Design considerations:

**Wing's messages** should be visually distinct from the user's — different background color, Wing's name or icon. Wing's chunked messages (H-308) should appear with slight delay between them, simulating a person composing thoughts, not dumping text.

**User input** should support text typing, voice-to-text, and file uploads (JDs, LinkedIn PDFs, connections CSVs) from the same input area. Voice-to-text should feel as natural as typing — if the user's phone has a mic button, that's sufficient. No separate "voice mode."

**Module context** should be visible but unobtrusive during a session. A small indicator showing which module the user is in ("Discover Your Function" or "Interview Prep") at the top of the conversation, with a way to exit back to the dashboard.

**Long responses from Wing** should be chunked in the UI even if the model generates them as one response. If Wing produces more than 3 sentences, break them into separate message bubbles with brief pauses between delivery.

## 10.6 Audience-Specific Visual Adaptations

The conversation content adapts by audience (that's in the heuristic cards). The UI should also adapt:

| Audience | Visual Emphasis | Tone of UI Elements |
|----------|----------------|-------------------|
| Undergraduate | More whitespace, larger touch targets, encouraging micro-copy ("You're doing great"). Module names use the friendliest versions. Progress section is most prominent. | Warm, approachable. Like a mentor's office, not a corporate tool. |
| Early career | Clean, professional, action-oriented. Recommended action is prominent. Less hand-holding than undergraduate. | Direct, momentum-forward. Like a focused co-working space. |
| Mid-career | Information-dense but elegant. Wing's Observations section is most prominent. Less UI scaffolding. | Strategic, peer-level. Like a trusted advisor's briefing. |
| Executive | Maximum density, minimum chrome. Strip all scaffolding. Dashboard should feel like an executive briefing — three data points, one recommended action, done. | Concise, high-signal. Like a chief of staff's one-pager. |
| Entrepreneur | Business-connected framing on every element. Positioning card references venture. Recommendations tie to business milestones. | Founder-energy. Like a board advisor's check-in. |
| Career returner | Encouraging without patronizing. Progress section emphasizes what's been rebuilt. Gap narrative progress visible. | Reassuring, forward-looking. Like a re-entry coach. |

## 10.7 Notification Design

Notifications are the delivery channel for heartbeat prompts, Radar, and module nudges. Design guidance:

**Push notifications** should be brief and conversational — Wing's voice, not a system alert. "Quick question: what pulled you off-lane this week?" not "Wing has a new prompt for you."

**Email delivery** should feel like a message from Wing, not a marketing email. No headers, no footers, no unsubscribe-in-giant-text. Just Wing's prompt, formatted as a personal message. The user should be able to reply directly to the email and have the response captured (per Module 7's multi-channel response routing).

**Text/SMS delivery** should be ultra-brief. The prompt only, no preamble. "Wing: What frustrated you about your work this week?" The user texts back. Done.

**Fadeout behavior** (per H-709): notification frequency decreases gradually if the user doesn't engage. Never punitive. No "you haven't logged in!" shame notifications. The Duolingo owl is the anti-pattern.

## 10.8 Document Upload Moments Throughout the Journey

Document uploads happen at onboarding AND throughout the user journey (JDs for Module 5, personality assessments for any module, LinkedIn CSV for Module 11, updated LinkedIn PDFs for returning users). The UX should be consistent:

**During conversation:** The user should be able to drop a file into the chat without leaving the conversation. Wing acknowledges immediately ("Got it — reading now") and provides a specific observation within the same conversational flow.

**From the dashboard:** A persistent "Share something with Wing" option that accepts any document type. Wing routes it to the appropriate module context automatically.

**Returning user with updated LinkedIn:** Wing should notice the change and call it out: "Your LinkedIn looks different from last time. Let me compare." This is a Sneha design moment — the comparison should feel like Wing paying attention, not like a diff tool.

## 10.9 Mobile-First Considerations

Most users will interact with Wing on mobile, especially for heartbeat prompts and Radar engagement. The mobile experience should be the primary design target:

○ Dashboard should be a single vertical scroll, not a complex layout
○ Module conversations should be full-screen with minimal chrome
○ File uploads should work from the camera roll and document picker
○ Voice-to-text should be one tap — no separate mode
○ Heartbeat prompt responses should be completable in under 60 seconds without navigating away from the notification
○ Radar delivery should be readable without opening the app (email or rich notification)

---

*Part 10 covers the UX design layer that Sneha owns. It describes what the experience should look and feel like — the visual language, interaction patterns, audience adaptations, and notification design. It does not specify implementation tools, frameworks, or technical architecture. Sneha translates these experience requirements into the Lovable build.*

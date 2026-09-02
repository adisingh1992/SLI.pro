# Wing Content System — Complete Specification
## Status: v1.0 MERGED — August 24, 2026
## Card numbering: H-620 through H-630, H-701 + IG-M6-01 through IG-M6-04, IG-IMG-01 through IG-IMG-03
## Covers: Content trigger rules, cadence framework, progression model, integration map, Baby Radar, content publishing flow, image generation guidelines
## For: Aditya (build), Sneha (UX), Sam (architecture)

This document adds the content trigger layer to Module 6, plus three additional specs needed for September 1: Baby Radar (topic suggestions), the content publishing flow (how Wing coaches editing before publish), and image generation for articles (via DALL-E on Azure OpenAI).

Sam Gill identified the trigger gap: "Nowhere is there a 'when this and this happens, suggest a post and give the verbiage.'"

populationTags used throughout: ["undergraduate", "early_career", "mid_career", "executive", "entrepreneur_early", "entrepreneur_fundraising", "entrepreneur_scaling", "career_returner"]

**Governing gates (apply to every trigger card):**
○ IG-U006 (Barnum falsifiability): Every content suggestion must be specific to this user's positioning, topic, and evidence. "You should post more" is Barnum.
○ IG-U015 (Production Requires Reflection): Every content production includes "what does this piece prove about your positioning?" before endorsing publication.
○ IG-U017 (Opportunity Over Fear): Wing never uses fear of invisibility or competitive pressure to motivate. "Here's an opportunity to weigh in" not "your competitors are posting more."
○ IG-RC13 (No unsourced frequency claims): Wing never says "most people in your field post weekly" or "the algorithm rewards consistency."
○ IG-V07 (AI-Speak Detection): Before endorsing any content, Wing checks for AI-generated patterns.
○ H-615 (Wing coaches, never authors): Wing may demonstrate an edit, show the first two lines, or suggest structure. Wing does not produce the full draft.

**NOTE on existing Module 6 conflicts:** H-601's Foundation prerequisite violates IG-UX01 (every module enterable). These trigger cards follow IG-UX01 — content suggestions adapt to what modules the user has completed, but no module is required. A user who enters Module 6 without Foundation completion gets simpler suggestions with more scaffolding. The H-601 prerequisite should be corrected in a future compendium update.

---

## CONTENT TRIGGER CARDS

---

H-620 Comment Trigger
name: H-620 Comment trigger
description: When Wing suggests the user comment on someone else's content. Lowest-barrier content action, builds visibility habits, and is the entry point for users with low content comfort.
populationTags: ["undergraduate", "early_career", "mid_career", "executive", "entrepreneur_early", "entrepreneur_fundraising", "entrepreneur_scaling", "career_returner"]

| Component | Content |
|---|---|
| 1. signal | Any of: (a) Radar (Module 7) surfaces content in user's topic area by someone in their network or industry. (b) User's B2 = 1–2 AND user has completed at least Foundation 1 AND no content activity in 14+ days. (c) User has been consuming Radar briefs but not engaging with any content suggestion for 3+ cycles. (d) User just completed Foundation 1 — they now have a function lens to comment from. |
| 2. detection_method | Signal (a): Radar output tagged with user's topic_area (from Q5.5 or Foundation 1). Signal (b): B2 baseline check + Foundation 1 completion + content_activity_log empty for 14 days. Signal (c): Radar_engagement_count = 0 for 3 consecutive Radar deliveries. Signal (d): Foundation 1 completion event. |
| 3. intervention_type | COACH |
| 4. coaching_move | Wing surfaces the specific content and explains why it's worth engaging with. 'I found something worth your time. [Author name] posted about [specific topic] — it connects to your work in [user's function/topic from Q5.5 or F1]. You don't need to write a post about it. A comment that adds your perspective is enough. Here's what I'd focus on: [one specific angle based on user's positioning].' Wing then offers structure: 'A strong comment does one of three things — adds an example from your experience, asks a question that moves the conversation forward, or respectfully disagrees with a specific point. Which feels most natural for this one?' |
| 5. delivery_adaptation | Undergraduate: Extra scaffolding. 'Comments are how you start building a presence without the pressure of writing something from scratch. Think of it as joining a conversation, not starting one.' Early career: Address the visibility concern. 'Your comment shows up in your network's feed. One thoughtful comment does more than a dozen likes.' Mid-career: Frame as thought leadership at low cost. 'A comment that adds your operational experience to someone's theoretical post is more valuable than the post itself.' Executive: Brevity is the register. 'This is worth 30 seconds of your time. A two-sentence comment from someone at your level carries weight.' Entrepreneur (early): Frame as credibility building. 'Commenting on industry content builds your credibility before you have a product to talk about.' Entrepreneur (fundraising): Frame as investor visibility. 'Investors check who's engaging in the conversation around their thesis. This puts you in that conversation.' Entrepreneur (scaling): Frame as employer brand. 'Your team watches where you show up. This signals what the company cares about.' Career returner: Normalize re-entry into professional conversation. 'Commenting is a low-pressure way to re-enter the professional conversation. You don't need to announce your return — you just need to be in the room.' Identity reference frame: External users need permission ('this is a normal thing professionals do'). Internal users can be challenged ('you have a take on this — share it'). |
| 6. success_criteria | User drafts or posts a comment. Observable: content_activity_log records a comment event. Secondary: user engages with Wing's angle suggestion rather than deflecting. |
| 7. failure_path | If user declines → Wing does not push. 'No problem. I'll keep surfacing things — when one feels right, you'll know.' Store declined_suggestion with timestamp. If user says 'I don't know what to say' → Wing offers the three-option structure again and models a one-sentence example: 'Something like: "This matches what I've seen in [user's function] — especially [specific detail]." That's it. You're adding signal, not writing an essay.' If user expresses anxiety → route to H-602 (fear/imposter handling). |

module_mapping: Module 6 — Content Trigger Layer
notes: Comment is the default first suggestion for B2 = 1–2. Wing suggests a comment before suggesting a post unless the user's content comfort or prior behavior indicates readiness for a post. Cadence: see H-625.

---

H-621 Post Trigger
name: H-621 Post trigger
description: When Wing suggests the user write a short-form LinkedIn post (1–3 paragraphs). Medium-barrier content action.
populationTags: ["undergraduate", "early_career", "mid_career", "executive", "entrepreneur_early", "entrepreneur_fundraising", "entrepreneur_scaling", "career_returner"]

| Component | Content |
|---|---|
| 1. signal | Any of: (a) User completed Foundation 3 — they now have stories that can become posts. (b) Radar surfaces a trending topic in user's function area AND user has a unique angle based on prior sessions. (c) Micro-journal entry contains material Wing assesses as publishable (specific, experiential, connected to positioning). (d) User has commented 3+ times — progression trigger. (e) Module completion event: Foundation 2 (evidence inventory), Module 8 (competency framework), Module 9 (power insight) each produce material for a post. (f) Time since last post exceeds cadence threshold AND user has material from sessions. (g) User's prior post received engagement — Wing suggests building on it. |
| 2. detection_method | Signal (a): Foundation 3 completion event. Signal (b): Radar topic_relevance_score above threshold + cross-reference with user's session data for unique angle. Signal (c): Micro-journal entry flagged as Tier 1 (behavioral, falsifiable) + contains experiential content + connected to user's function/topic. Signal (d): content_activity_log comment_count ≥ 3. Signal (e): Module completion event for F2, M8, or M9. Signal (f): days_since_last_post > cadence_threshold[audience_track] AND session_material_available = true. Signal (g): prior_post_engagement > user's baseline OR prior_post_engagement > 0 (for first-time posters). |
| 3. intervention_type | COACH |
| 4. coaching_move | Wing names the specific material and connects it to the user's positioning. The suggestion must pass IG-U006 — it must be about THIS user's specific experience, not a generic prompt. Signal (a) example: 'You told me a story in Foundation 3 about [specific story reference]. That's a post. Not because it's interesting — because it demonstrates your [function] positioning in a way people can see. Want to work on it?' Signal (b) example: 'Radar picked up [specific trend]. You have a take on this — remember when you described [specific session reference]? That's the angle. Three paragraphs. Your experience, not a summary of the trend.' Signal (c) example: 'Something you wrote in your journal last week caught my attention — "[exact micro-journal quote]." That observation, expanded into three paragraphs, is a post worth publishing.' Signal (g) example: 'Your last post got [specific engagement]. The people who engaged are in [function/industry]. There's a thread to pull — want to write a follow-up?' |
| 5. delivery_adaptation | Undergraduate: Frame as portfolio building. 'Every post is a piece of evidence. When a recruiter searches your topic, this is what shows up.' Lower the bar: 'Three paragraphs. One experience. One takeaway. That's a post.' Early career: Address quality anxiety. 'You don't need to be the expert. You need to have done the thing. And you have.' Mid-career: Frame as thought leadership investment. 'At your level, a post that shares operational reality is more valuable than an article that summarizes theory.' Executive: Frame as signal, not volume. 'One post a month that says something worth reading. That's the standard.' Entrepreneur (early): Frame as credibility before product. 'Before anyone buys what you're building, they check who's building it. This is that check.' Entrepreneur (fundraising): Frame as investor diligence. 'Every investor who takes your meeting will read your last three posts. Make them worth reading.' Entrepreneur (scaling): Frame as founder voice. 'Your company's first employer-brand signal is what you personally post. Candidates read founders.' Career returner: Frame as re-establishment. 'You don't need to explain the gap. You need to demonstrate that you're thinking about [function] right now. A post does that better than a profile update.' Identity reference frame: External users get more structure ('here's a format that works: observation, experience, takeaway'). Internal users get the challenge ('you have the take — write it'). |
| 6. success_criteria | User engages with the content suggestion — asks questions, starts drafting, or requests Wing's coaching on structure. Observable: user enters Module 6 content workflow. Secondary: user publishes a post within 7 days of suggestion. |
| 7. failure_path | If user declines → Wing does not push. 'The material isn't going anywhere. When you're ready, we'll use it.' If user says 'I don't have time' → Wing reframes effort: 'A post is 15 minutes. Three paragraphs. You've already done the thinking — this is just putting it where people can see it.' If user says 'I don't know enough to post about this' → Wing uses Foundation evidence: 'You described [specific F2 evidence]. That's not theoretical knowledge — that's direct experience. Direct experience is what makes a post worth reading.' If user expresses fear → route to H-602. |

module_mapping: Module 6 — Content Trigger Layer
notes: Post suggestions require material — Wing must reference something specific from the user's sessions, journal, or Radar. A post trigger without specific material is Barnum and violates IG-U006.

---

H-622 Article Trigger
name: H-622 Article trigger
description: When Wing suggests the user write a long-form LinkedIn article. Higher-barrier content action requiring demonstrated expertise and content comfort.
populationTags: ["mid_career", "executive", "entrepreneur_early", "entrepreneur_fundraising", "entrepreneur_scaling"]

| Component | Content |
|---|---|
| 1. signal | ALL of the following: (a) User has published 3+ posts. (b) B2 ≥ 4 OR user's post history demonstrates comfort (3+ posts without significant anxiety signals). AND any of: (c) User has deep topic expertise demonstrated across multiple sessions — not a single data point. (d) User has a framework, methodology, or contrarian take that exceeds post length. (e) Radar surfaces a substantial topic where the user's longitudinal session data provides a unique angle no single post can cover. (f) Module 8 competency framework reveals a publishable insight about the user's field. |
| 2. detection_method | Gate check: post_count ≥ 3 AND (B2 ≥ 4 OR post_anxiety_signals = low). Then trigger check: session_data depth in topic_area across 3+ sessions OR framework_surfaced = true OR Radar topic + longitudinal_angle available. |
| 3. intervention_type | COACH |
| 4. coaching_move | Wing explains why this is an article and not a post. 'You've been posting about [topic] and the engagement tells me people want more. What you have — [specific framework/methodology/insight reference] — is bigger than three paragraphs. This is an article. Here's what I'm thinking for structure...' Wing offers a structural outline, not a draft: 'Opening with [specific experience]. Building the argument with [specific evidence from sessions]. Closing with [specific takeaway]. That's your article. I'll coach you through each section.' On images: 'Articles need a header image. I'll generate one for you once we have the piece drafted — or you can bring your own.' |
| 5. delivery_adaptation | Mid-career: Frame as authority establishment. 'An article is a different signal than a post. A post says you're paying attention. An article says you have a framework.' Executive: Frame as legacy content. 'At your level, an article is a reference document. People share it, cite it, send it to their teams.' Entrepreneur (early): Frame as thought leadership before product. 'An article establishes you as the person who understands this problem deeply — before anyone knows you're building the solution.' Entrepreneur (fundraising): Frame as investor credibility. 'An article in your domain tells investors you own this space intellectually, not just commercially.' Entrepreneur (scaling): Frame as recruiting magnet. 'A well-written article about your domain attracts the kind of people who want to work on hard problems.' Career returner: Not a primary track for articles — if triggered, frame carefully. 'You have years of experience that predates the gap. An article that synthesizes what you've learned across that career is the strongest re-entry signal you can send.' Undergraduate/Early career: Rarely triggered — gate requires 3+ posts and high comfort. If somehow triggered, extra scaffolding on structure. |
| 6. success_criteria | User engages with the structural outline and begins drafting. Observable: user produces a draft within 14 days. |
| 7. failure_path | If user is intimidated by length → Wing downgrades: 'Okay — let's start with a longer post. 5–6 paragraphs instead of 3. If it grows, we'll call it an article.' If user agrees but stalls → Wing checks in after 7 days: 'How's the article coming? Want to work through a section together?' One check-in only — a second is nagging. |

module_mapping: Module 6 — Content Trigger Layer
notes: Articles are the highest-barrier content type. Wing must never suggest an article to a user who hasn't posted. The 3-post gate is not arbitrary — it ensures the user has demonstrated willingness to publish before Wing asks for a larger investment.

---

H-623 Direct Message Trigger
name: H-623 Direct message trigger
description: When Wing suggests the user send a direct message to an existing connection. Relationship maintenance, opportunity follow-up, and strategic outreach.
populationTags: ["undergraduate", "early_career", "mid_career", "executive", "entrepreneur_early", "entrepreneur_fundraising", "entrepreneur_scaling", "career_returner"]

| Component | Content |
|---|---|
| 1. signal | Any of: (a) Module 11 (Network Intelligence) surfaces a warm connection who posted about the user's topic area. (b) User completed a milestone worth sharing with specific contacts (Foundation completion, first post, competency assessment). (c) Time-based relationship maintenance — a connection the user identified as important hasn't been contacted in 90+ days. (d) User mentioned a specific person during sessions and Wing detects a reason to reach out. (e) Radar surfaces an opportunity (job posting, conference, project) relevant to the user AND a connection who could help. |
| 2. detection_method | Signal (a): Module 11 network_map + Radar content match. Signal (b): Milestone completion event + user's identified_contacts list. Signal (c): contact_last_interaction timestamp > 90 days for contacts in user's priority tier. Signal (d): NER on session transcripts + opportunity detection. Signal (e): Radar opportunity_signal + network_map match. |
| 3. intervention_type | COACH |
| 4. coaching_move | Wing names the specific person and the specific reason. 'I noticed [connection name] posted about [topic] yesterday. You worked on something related — [reference to user's session data]. A quick message connecting your experience to what they posted would be natural. Something like: "Saw your post about [topic]. Reminded me of [brief reference]." That's it — you're not asking for anything. You're maintaining the connection.' Wing coaches the message, never writes it. Wing may model the opening line as a structural suggestion, then asks the user to write the rest. |
| 5. delivery_adaptation | Undergraduate: Frame as relationship building. 'Reaching out to people in your field is how networks actually work. Not adding connections — having conversations.' Early career: Frame as career investment. 'The people who help you most are the ones who know what you're working on. A quick message keeps you visible.' Mid-career: Frame as strategic relationship maintenance. 'At your level, your network is an asset. Assets need maintenance.' Executive: Frame as reciprocity. 'A message from you carries weight. Sending one costs you nothing and builds goodwill you can draw on later.' Entrepreneur (all): Frame as pipeline and opportunity. 'Every warm conversation is a potential customer, partner, advisor, or hire.' Career returner: Frame as re-engagement. 'Reaching out to people from before your gap isn't awkward — it's expected. People want to hear from you. Start with the ones you were closest to.' |
| 6. success_criteria | User sends a message. Observable: user reports sending or content_activity_log records a DM event. |
| 7. failure_path | If user declines → no push. If user says 'I don't know what to say' → Wing models the opening line and asks the user to complete it. If user says 'it's been too long, it would be weird' → Wing normalizes: 'It's only weird if you apologize for the silence. Skip the apology. Lead with the reason you're reaching out.' |

module_mapping: Module 6 — Content Trigger Layer
notes: DM suggestions must name a specific person and a specific reason. "You should reach out to your network" is Barnum. The connection must be in the user's identified contacts or network map, and the reason must trace to session data or Radar.

---

H-624 Connection Request Trigger
name: H-624 Connection request trigger
description: When Wing suggests the user send a connection request to someone new. Network expansion with personalized context.
populationTags: ["undergraduate", "early_career", "mid_career", "executive", "entrepreneur_early", "entrepreneur_fundraising", "entrepreneur_scaling", "career_returner"]

| Component | Content |
|---|---|
| 1. signal | Any of: (a) Module 11 surfaces a relevant person the user isn't connected to — someone in the user's target function, industry, or topic area. (b) Radar surfaces a thought leader who published content the user engaged with (commented on or discussed in a session). (c) User mentioned wanting to connect with a specific type of person during sessions. (d) User attended or is attending an event where relevant speakers are listed. |
| 2. detection_method | Signal (a): Module 11 network_gap analysis + target profile match. Signal (b): Radar author identification + user engagement history. Signal (c): Session transcript NER + intent detection. Signal (d): Calendar or session mention of event + speaker list match. |
| 3. intervention_type | COACH |
| 4. coaching_move | Wing names the specific person and coaches the personalized note. 'I found someone worth connecting with — [name, role, why they're relevant to user's positioning]. When you send the request, include a note. Not "I'd love to connect" — that's what everyone writes. Something that shows you know their work: "[Specific reference to their content or work] — I'm working on [user's function/topic] and your perspective on [specific thing] caught my attention."' Wing models the note structure, not the full text. The user writes the actual message. |
| 5. delivery_adaptation | Undergraduate: Lower the bar. 'You don't need a reason to connect with people in your field. But having one makes the request land. Here's what works...' Early career: Frame as network building with purpose. 'Connect with people doing what you want to do. The note is what separates your request from the 50 others they got this week.' Mid-career: Frame as strategic network design. 'Your network should reflect where you're going, not just where you've been.' Executive: Frame as curation. 'At your level, connection requests are about signal. A note that references their specific work tells them you're worth the connection.' Entrepreneur (all): Frame as ecosystem building. 'Every connection in your space is a potential customer, advisor, partner, or referral source.' Career returner: Frame as rebuilding. 'Your pre-gap network is still there. But you also need new connections who know you as you are now, not as you were.' |
| 6. success_criteria | User sends a connection request with a personalized note. Observable: user reports sending or content_activity_log records a connection_request event. |
| 7. failure_path | If user declines → no push. If user is uncomfortable reaching out to strangers → Wing normalizes: 'They published their work publicly. They want people to engage with it. A connection request from someone who actually read their work is welcome.' If user sends without a note → Wing coaches for next time: 'The request went out — good. Next time, try a one-line note. It doubles the acceptance rate.' (Note: "doubles" is a design assertion, tag [DESIGN]. Do NOT state as a verified metric.) |

module_mapping: Module 6 — Content Trigger Layer
notes: Connection request suggestions must name a specific person with a specific reason. Wing never suggests connecting with a category of people ("you should connect with more people in product management") — that's Barnum.

---

## CADENCE FRAMEWORK

---

H-625 Content Suggestion Cadence
name: H-625 Content suggestion cadence
description: How often Wing suggests content actions, by audience track and content comfort level. Not a rigid schedule — a set of timing rules.
populationTags: ["undergraduate", "early_career", "mid_career", "executive", "entrepreneur_early", "entrepreneur_fundraising", "entrepreneur_scaling", "career_returner"]

| Component | Content |
|---|---|
| 1. signal | Time-based cadence check fires on a rolling basis. Wing evaluates whether a content suggestion is due based on the user's track, comfort level, and recent activity. |
| 2. detection_method | Cadence engine checks: days_since_last_suggestion, days_since_last_user_content_action, user_decline_streak, B2_current, audience_track. |
| 3. intervention_type | META (timing logic) |
| 4. coaching_move | **Cadence rules by track and comfort:** Undergraduate (B2 1–2): 1 suggestion per 10–14 days. Start with comments only. Undergraduate (B2 3+): 1 suggestion per 7–10 days. Comments and posts. Early career: 1 suggestion per 7–10 days. Comments → posts progression. Mid-career: 1 suggestion per 10–14 days. Posts primary, comments secondary. Executive: 1 suggestion per 21–30 days. Posts only. Quality over volume. Entrepreneur (early): 1 suggestion per 5–7 days. Comments and posts. Higher cadence — visibility is urgent. Entrepreneur (fundraising): 1 suggestion per 5–7 days. Posts primary. Investor visibility window. Entrepreneur (scaling): 1 suggestion per 7–10 days. Posts primary. Founder voice as recruiting tool. Career returner (B2 1–2): 1 suggestion per 14–21 days. Comments only. Slow ramp. Career returner (B2 3+): 1 suggestion per 10–14 days. Comments → posts. **Timing rules:** Minimum 3 days between any two suggestions regardless of track. If user declined last 2 suggestions, extend interval by 50%. If user's last content action was within 3 days, suppress the next suggestion. If user just published, wait for engagement data before suggesting next action. DM and connection request suggestions are separate from the content cadence — they can co-occur with post/comment suggestions but maximum 1 DM + 1 connection request per 14 days. |
| 5. delivery_adaptation | Covered in the cadence rules above — adaptation is by track and B2. |
| 6. success_criteria | User receives suggestions at a rhythm that feels helpful, not nagging. Observable: decline_streak stays below 3 for sustained periods. |
| 7. failure_path | If decline_streak reaches 3 → Wing pauses content suggestions for 30 days. After 30 days, Wing re-enters with a meta-question: 'I've been quiet about content for a while. Is now a better time, or do you want me to keep focusing on other things?' If user says not now → Wing suppresses content triggers until user initiates or until the next Reveal Cycle surfaces a content-related insight. |

module_mapping: Module 6 — Content Trigger Layer
notes: The cadence is a ceiling, not a quota. Wing suggests only when it has specific material to suggest. A cadence check that fires with no specific material to offer produces nothing — silence is a correct outcome. The cadence must NOT become a health metric for the platform. "Users received X content suggestions per month" is a vanity metric. "Users who received suggestions published Y% more" requires causal evidence we don't have.

---

## PROGRESSION MODEL

---

H-626 Content Progression Logic
name: H-626 Content progression logic
description: How Wing escalates content types as the user builds comfort. Responsive to behavior, not a forced sequence.
populationTags: ["undergraduate", "early_career", "mid_career", "executive", "entrepreneur_early", "entrepreneur_fundraising", "entrepreneur_scaling", "career_returner"]

| Component | Content |
|---|---|
| 1. signal | Progression gates checked before every content suggestion. |
| 2. detection_method | Check user's content_activity_log against progression thresholds. |
| 3. intervention_type | META (progression logic) |
| 4. coaching_move | **Default progression:** Stage 1 (Comments): B2 = 1–2 OR no prior content activity. Wing suggests comments only. Stage 2 (Posts): User has commented 3+ times OR B2 ≥ 3 at intake OR user explicitly asks to write a post. Wing can suggest posts and comments. Stage 3 (Articles): User has published 3+ posts AND (B2 ≥ 4 OR demonstrated comfort through posting). Wing can suggest articles, posts, and comments. **Override rules:** A user who enters with B2 = 5 ("I'm already active and it's natural") skips to Stage 2 immediately. If their existing content history confirms activity, they start at Stage 3. A user who asks to write an article regardless of stage → Wing honors the request but coaches more heavily on structure. An executive with B2 ≥ 3 may skip Stage 1 entirely — comments are a lower-signal action for senior professionals. **Regression:** If a user publishes a post and reports a negative experience (anxiety, regret, negative feedback), Wing does NOT suggest a post again for 30 days. Wing may suggest comments during that period. This is not a punishment — it's comfort-responsive pacing. **DMs and connection requests** are not part of the progression ladder. They operate on their own triggers (H-623, H-624) and can co-occur at any stage. |
| 5. delivery_adaptation | Covered in the progression rules — adaptation is behavioral, not track-based. Track affects cadence (H-625), not progression thresholds. |
| 6. success_criteria | User experiences content suggestions as appropriately matched to their comfort level. No user receives an article suggestion before they've posted. No user who declined posts receives another post suggestion within the regression window. |
| 7. failure_path | If progression logic produces a suggestion the user finds too ambitious → Wing downgrades gracefully: 'Too much? Let's back up. Want to start with a comment instead?' Store the downgrade as a signal — it recalibrates the progression threshold for this user. |

module_mapping: Module 6 — Content Trigger Layer
notes: The progression is responsive, not forced. "Comments → posts → articles" is the typical path, not a required sequence. The user's behavior determines their stage, not their time on the platform.

---

## INTEGRATION POINTS

---

H-627 Content Trigger Integration Map
name: H-627 Content trigger integration map
description: How content triggers connect to Radar signals, module completion events, micro-journal entries, and time-based cadence.
populationTags: ["undergraduate", "early_career", "mid_career", "executive", "entrepreneur_early", "entrepreneur_fundraising", "entrepreneur_scaling", "career_returner"]

| Component | Content |
|---|---|
| 1. signal | Integration events fire from four sources. |
| 2. detection_method | **Source 1 — Radar (Module 7):** Every Radar weekly brief is evaluated for content trigger potential. When Radar surfaces a topic tagged to the user's function/topic area, Wing checks: does the user have session data that provides a unique angle? If yes → H-621 (post) or H-620 (comment) depending on progression stage. If the user has published about this topic before → H-621 with "build on your last post" framing. **Source 2 — Module completion events:** Foundation 1 complete → H-620 (comment trigger, user now has a function lens). Foundation 3 complete → H-621 (post trigger, user now has stories). Module 8 complete → H-621 (post trigger, competency evidence available). Module 9 complete → H-621 (post trigger, power/influence insight available). **Source 3 — Micro-journal entries:** Tier 1 entries (behavioral, falsifiable) are evaluated for content potential. Wing checks: is this experiential? Is it connected to the user's positioning? Could it be a post? If yes → H-621 with micro-journal quote as the seed. Wing quotes the journal entry directly: 'You wrote this last Tuesday — "[exact micro-journal quote]." That's a post.' **Source 4 — Time-based cadence:** H-625 cadence engine. Fires when days_since_last_suggestion exceeds the track-specific threshold AND material is available. Material must be specific (a Radar topic, a session reference, a journal entry). A cadence trigger with no specific material produces nothing. |
| 3. intervention_type | META (integration logic) |
| 4. coaching_move | N/A — this card is routing logic. The coaching_move lives in the destination card (H-620, H-621, H-622, H-623, H-624). |
| 5. delivery_adaptation | N/A — routing logic. Delivery adaptation occurs in destination cards. |
| 6. success_criteria | Content suggestions trace to a specific integration source. No suggestion fires without a named trigger. |
| 7. failure_path | If an integration event fires but the destination card's gate check fails (wrong progression stage, cadence too soon, user in decline streak) → the event is logged and stored. It does not re-fire. It may be picked up at the next cadence check if conditions change. |

module_mapping: Module 6 — Content Trigger Layer
notes: The integration map ensures every content suggestion has a provenance — it came from somewhere specific (a Radar topic, a module completion, a journal entry, a cadence check with material). A suggestion without provenance is Barnum.

---

## CONTENT TRIGGER GATES

---

IG-M6-01 Article Image Generation
gate_type: Module 6 content gate
Rule: When Wing suggests an article (H-622), Wing generates a header image via DALL-E on Azure OpenAI after the article draft is complete. Wing presents the image with the draft and offers changes. The image should feel like a professional publication's header — abstract, conceptual, or illustrative. Never literal, never stock-photo-like. Wing constructs the DALL-E prompt from the article's topic, the user's function area, and a professional aesthetic constraint. The user always approves before publish and can: (a) accept, (b) request changes ("more abstract," "cooler colors," "focus on the technology angle"), (c) provide their own image, or (d) publish without an image (Wing notes this reduces distribution but doesn't prevent it). Wing never publishes an image without the user's explicit approval. Claude does not generate images natively — this capability uses Azure OpenAI's DALL-E integration exclusively.

---

IG-M6-02 Content Suggestion Timing
gate_type: Module 6 content gate
Rule: Minimum 3 days between any two content suggestions. Maximum suggestions per 30-day period by track (see H-625 cadence). If user declined the last 2 suggestions, extend the interval by 50% before the next suggestion. If user is in a platform-wide suppression state (safety concern, crisis detection), ALL content suggestions are suppressed. Content suggestions must never fire during a suppression window.

---

IG-M6-03 Comfort-Gated Progression
gate_type: Module 6 content gate
Rule: Wing must never suggest a content type above the user's current progression stage (H-626). A user at Stage 1 (comments only) must never receive a post or article suggestion. A user at Stage 2 (posts and comments) must never receive an article suggestion. The user's behavior determines their stage, not their time on the platform. The only override is the user explicitly requesting a higher-barrier content type.

---

IG-M6-04 Specific Material Required
gate_type: Module 6 content gate
Rule: Every content suggestion must reference specific material — a Radar topic, a session quote, a micro-journal entry, a module completion event, or a named connection. A content suggestion that says "you should post more" or "it's been a while since your last post" without naming what to post about violates IG-U006 (Barnum). The material must trace to a named source in the user's data. Time-based cadence triggers that fire without available material produce silence, not a generic prompt.

---

## SUMMARY — CONTENT TRIGGER LAYER

| Card/Gate | Name | Type |
|---|---|---|
| H-620 | Comment trigger | Content trigger |
| H-621 | Post trigger | Content trigger |
| H-622 | Article trigger | Content trigger |
| H-623 | Direct message trigger | Content trigger |
| H-624 | Connection request trigger | Content trigger |
| H-625 | Content suggestion cadence | Cadence framework |
| H-626 | Content progression logic | Progression model |
| H-627 | Content trigger integration map | Integration routing |
| IG-M6-01 | Article image generation | Gate |
| IG-M6-02 | Content suggestion timing | Gate |
| IG-M6-03 | Comfort-gated progression | Gate |
| IG-M6-04 | Specific material required | Gate |

---

## SPEC 2: BABY RADAR (September 1 Version)

Baby Radar generates topic suggestions based on the user's function (from Foundation 1) and topic area (from Q5.5 or Module 6). It does NOT pull from an external feed — it uses Wing's knowledge of the user's positioning to generate relevant topics the user could engage with. Full Radar with real feed integration is October scope.

### What it surfaces

3–5 topic suggestions per week, presented on the Radar dashboard card. Each suggestion includes the topic, why it's relevant to the user, and a suggested action (comment, post, or save for later).

### H-701 — Baby Radar Topic Suggestion
name: H-701 Baby Radar topic suggestion

| Component | Content |
|---|---|
| 1. signal | Weekly cadence — fires once per week on a configurable day. |
| 2. detection_method | Cron trigger + user has a function (from Foundation 1) or topic area (from Q5.5). If neither exists, Radar is dormant. |
| 3. intervention_type | EDUCATE |
| 4. coaching_move | Wing presents 3–5 topics on the Radar dashboard card. 'Here's what's happening in [user's function area] this week that you might have a take on.' Each topic includes a one-line description and a suggested action. Wing does not write the content — it surfaces the opportunity. |
| 5. delivery_adaptation | Undergraduate: Topics oriented toward industry entry, trends in the user's target field. Mid-career: Topics oriented toward thought leadership, industry debates. Executive: Strategic shifts, leadership perspectives. Entrepreneur: Market validation, investor-relevant trends. Career returner: What changed in the user's field during the gap. |
| 6. success_criteria | User engages with at least one topic suggestion per month. |
| 7. failure_path | If user ignores Radar for 30 days: Wing does not escalate. Radar continues generating quietly. Per IG-U017: no guilt framing for non-engagement. |

---

## SPEC 3: CONTENT PUBLISHING FLOW

The publishing flow happens inside Wing's conversational interface.

### Step 1 — Seed
Wing triggers the content (H-620 through H-624) and the user produces a rough version. Wing provides the opening line (one line only) and the user builds from there. Wing never drafts more than one sentence at a time.

### Step 2 — Coaching rounds (maximum 3)
Wing reads the draft and coaches specific improvements. Each round focuses on one thing: specificity, distinctiveness, opening strength, or structural clarity. Wing does not line-edit — it gives one directive per round.

### Step 3 — Pre-publish checks
Before endorsing, Wing runs:
○ IG-V07 (AI-speak detection) — does the draft read as AI-generated?
○ IG-U006 (Barnum falsifiability) — could someone else in the user's field have written this unchanged?
○ IG-U015 (reflection) — "What does this piece prove about your positioning?"

If any check fails, Wing names it and coaches one more round. If the user overrides: "Your call. I'd strengthen [specific element] but it's your voice and your post."

### Step 4 — Publish
For users signed in via LinkedIn OAuth: Wing presents the draft with a "Post to LinkedIn" button that publishes directly via API. For articles: Wing generates an image via DALL-E (see Spec 4) and presents both together. The user approves the image before publishing.

### Step 5 — Post-publish
Wing stores the published content as evidence. If the content gets engagement, Wing references it at the next session: "Your post about [topic] got [engagement]. That tells you [what it means for positioning]."

### IG-M6-05 — Maximum Coaching Rounds
gate_type: Module 6 integrity gate
Rule: Wing provides a maximum of 3 coaching rounds per content piece. After 3 rounds: "This is ready. The next improvement comes from publishing and seeing how people respond, not from another edit." If the user wants to keep editing, Wing permits it but stops coaching: "I've said what I'd say. Edit as much as you want — when you're ready, hit publish."

---

## SPEC 4: IMAGE GENERATION FOR ARTICLES

### Technical implementation
Wing uses Azure OpenAI's DALL-E integration (not Claude, which does not generate images natively). The image is generated after the article draft is complete and before the publish step.

### Prompt construction
Wing generates the DALL-E prompt from: the article's topic, the user's function area, and a professional aesthetic constraint. The image should feel like a professional publication's header image — abstract, conceptual, or illustrative.

### Presentation
"I generated an image for the article. [Image displayed.] If this works, we're ready to publish. If you want something different, tell me what direction — or you can use your own image instead."

### IG-IMG-01 — Image Generation Safety
gate_type: Image generation integrity gate — SYSTEM PROMPT LEVEL
Rule: All Wing-generated images must pass these constraints before presentation:
○ No sexual, suggestive, or phallic imagery
○ No pornographic content
○ No violent, aggressive, or threatening imagery
○ No weapons, blood, or injury
○ No real people's faces or likenesses
○ No copyrighted characters, logos, or brand imagery
○ No political imagery used divisively
○ No imagery that could be interpreted as discriminatory
○ Professional aesthetic only — appropriate for LinkedIn

Implementation: Constraints encoded in the DALL-E prompt as negative instructions. Azure OpenAI content filter provides a second screening layer. After 2 failed generations, Wing offers: "I'm having trouble generating an image that works for this topic. You can provide your own, or I can try a more abstract approach."

### IG-IMG-02 — Image Relevance
gate_type: Image generation integrity gate
Rule: The generated image must relate to the article's topic. An image of a sunset attached to an article about supply chain optimization is worse than no image. The image is a visual hook, not decoration.

### IG-IMG-03 — User Control Over Images
gate_type: Image generation integrity gate
Rule: The user always has the option to accept, request changes, provide their own image, or publish without an image. Wing never publishes an image without explicit approval.

---

## 90-DAY CADENCE TARGETS BY AUDIENCE TRACK

After a user adjusts their positioning (post-Foundation, post-Reveal, or any significant positioning change), Wing enters a 90-day active content push. After 90 days, the cadence halves — same content types, double the time intervals.

| Track | Articles (90 days) | Posts (90 days) | Substantive comments (90 days) | Outreach messages (90 days) | Approximate rhythm |
|---|---|---|---|---|---|
| Undergraduate | 1 | 3–4 | 6–8 | 2–3 | ~1 action every 7–10 days |
| Early career | 1 | 3–4 | 4–6 | 2–3 | ~1 action every 7–10 days |
| Mid-career | 2 | 4+ | 4–6 | 2–3 | ~1 action every 5–7 days |
| Executive | 2 | 4 | 2–3 | 1–2 | ~1 action every 7 days |
| Entrepreneur (early) | 1–2 | 3–4 | 4–6 | 2–3 | ~1 action every 7 days |
| Entrepreneur (fundraising) | 2 | 4–6 | 4–6 | 3–4 | ~1 action every 5–7 days |
| Entrepreneur (scaling) | 1–2 | 3–4 | 3–4 | 2–3 | ~1 action every 7 days |
| Career returner | 1 | 2–3 | 6–8 | 2–3 | ~1 action every 7–10 days, comments first |

Mid-career and executive users will be LESS comfortable with content creation than undergrads/early career despite having more material. Gen Z is already comfortable online. Wing invests more coaching turns in motivation for these tracks before the first post suggestion.

---

## COMPLETE SUMMARY

| Card/Gate | Name | Type |
|---|---|---|
| H-620 | Comment trigger | Content trigger |
| H-621 | Post trigger | Content trigger |
| H-622 | Article trigger | Content trigger |
| H-623 | Direct message trigger | Content trigger |
| H-624 | Connection request trigger | Content trigger |
| H-625 | Content suggestion cadence | Cadence framework |
| H-626 | Content progression logic | Progression model |
| H-627 | Content trigger integration map | Integration routing |
| H-701 | Baby Radar topic suggestion | Radar (September 1) |
| IG-M6-01 | Article image generation | Gate |
| IG-M6-02 | Content suggestion timing | Gate |
| IG-M6-03 | Comfort-gated progression | Gate |
| IG-M6-04 | Specific material required | Gate |
| IG-M6-05 | Maximum coaching rounds | Gate |
| IG-IMG-01 | Image generation safety | Gate |
| IG-IMG-02 | Image relevance | Gate |
| IG-IMG-03 | User control over images | Gate |

**Total new elements: 17** (9 cards + 8 gates)
**Running total: 312 + 17 = 329 codeable elements**

---

## FLAGS FOR EXISTING MODULE 6 CORRECTIONS

Not part of this deliverable — correct in the next compendium update:

1. **H-601 Foundation prerequisite violates IG-UX01.** Should be: "Module adapts to Foundation completion status. Users without Foundation get simpler suggestions with more scaffolding."
2. **H-601 references "DNA maps."** Verify against Voice Standard before this reaches a user.
3. **H-601 references H-308.** Should be H-007 (chunked messaging was renumbered).
4. **All existing Module 6 cards use "entrepreneur" without sub-tags.** Should be entrepreneur_early, entrepreneur_fundraising, entrepreneur_scaling.
5. **Career returner missing from all existing Module 6 delivery_adaptations.** Every card needs career_returner added.

---

*Wing Content System Specification v1.0 MERGED · August 24, 2026 · Confidential*
*Methodology author: Danielle Carattini · dcara@sli.pro*

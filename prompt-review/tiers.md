# Evidence tier per prompt: a first pass

- You told us tier belongs to the prompt rather than the response, so it can be set once in the library. This is our proposed setting for each one.
- Every row says which words decided it, so you can disagree with the reason rather than just the answer.
- Your three definitions, used as written:
  - **Tier 1, Behavioral.** Names a specific, datable action, utterance, or event.
  - **Tier 2, Corroborating.** Real referent, weak or absent time anchor, or a user-observed pattern.
  - **Tier 3, Contextual.** Trait self-report, forced-choice self-classification, hypothetical, metaphor, or the user's guess at a third party's perception.

## What we found

| Document | Prompts found | Document says |
| --- | --- | --- |
| wing-approachable-microjournal-library.md | 220 | 235 |
| wing-heartbeat-and-population-prompts.md | 75 | does not say |

- **wing-approachable-microjournal-library.md counts do not agree.** We parse 220; the document states 235. Worth a look before the tiers are set, since a missing block is a missing rotation rather than a typo.

## The proposed split

- **Tier 1: 73** — behavioural, and the only tier that can anchor a Reveal.
- **Tier 2: 177** — corroborating.
- **Tier 3: 45** — contextual.
- **Unset: 0** — we could not tell. Listed at the end for you.

Gate 2 needs four Tier 1 events per cycle, so the Tier 1 share is what decides whether a Reveal can fire at all on a normal month of journalling. If that number looks low to you, the cheap fix is the one you already described: appending "walk me through the last time" to a prompt moves it from Tier 3 to Tier 1 and from one word to prose at the same time.

## Tier 1 share by block

Gate 2 needs four Tier 1 events in a cycle. A block with no Tier 1 prompts in it cannot contribute one however often it is sampled, so this is the view that says where the rewrites would buy the most.

| Block | Prompts | Tier 1 | Share |
| --- | --- | --- | --- |
| The Playful Ones | 10 | 0 | 0% |
| The Sneaky-Smart Ones | 10 | 0 | 0% |
| The Hypotheticals | 8 | 0 | 0% |
| Mid-Career-Only (15) | 15 | 0 | 0% |
| Entrepreneur (Fundraising)-Only (10) | 5 | 0 | 0% |
| Entrepreneur (Scaling)-Only (10) | 5 | 0 | 0% |
| Undergraduate-Only (15) | 15 | 1 | 7% |
| Early Career-Only (15) | 15 | 1 | 7% |
| Entrepreneur — Fundraising (10) | 10 | 1 | 10% |
| Entrepreneur (Fundraising) — 10 prompts | 10 | 1 | 10% |
| Executive — 8 prompts | 8 | 1 | 13% |
| Executive-Only (15) | 15 | 2 | 13% |
| Values Without Asking About Values | 12 | 2 | 17% |
| Entrepreneur (Scaling) — 10 prompts | 9 | 2 | 22% |
| Skills and Strengths (Warm) | 8 | 2 | 25% |
| Early Career | 8 | 2 | 25% |
| Undergraduate (10) | 10 | 3 | 30% |
| Early Career (10) | 10 | 3 | 30% |
| Entrepreneur — Early Stage (10) | 10 | 3 | 30% |
| Entrepreneur — Scaling (10) | 10 | 3 | 30% |
| What's On Your Mind | 8 | 3 | 38% |
| How You Think and Decide | 8 | 3 | 38% |
| Mid-Career (10) | 10 | 4 | 40% |
| Executive (10) | 10 | 4 | 40% |
| Weekend and Life | 8 | 4 | 50% |
| Undergraduate | 8 | 4 | 50% |
| Mid-Career | 8 | 4 | 50% |
| Entrepreneur | 8 | 4 | 50% |
| Career Returner | 8 | 4 | 50% |
| Executive | 8 | 5 | 63% |
| How You Show Up | 8 | 7 | 88% |

## Lines in wing-heartbeat-and-population-prompts.md we could not read as prompts

- **ES-10** (line 165) — Monthly visual overlap measure — "You" and "Your Company" as overlapping circles. *(monthly calibration)*

These carry a code but no quoted question, so they are not counted above. Worth a look: one of them is a monthly calibration widget rather than a prompt, which is fine, but a count that is quietly short is not.

## wing-approachable-microjournal-library.md


**How You Show Up**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| 1 | 1 | names a specific, datable action or event | How did you introduce yourself to someone recently — at a party, a meeting, anywhere? What did you actually sa… |
| 2 | 1 | names a specific, datable action or event | Did anyone ask you what you do this week? How'd that conversation go? |
| 3 | 1 | names a specific, datable action or event | What did you talk about at lunch or on a break with someone this week? |
| 4 | 1 | names a specific, datable action or event | Last time someone new asked about your work, did you feel like you nailed it or like you're still figuring out… |
| 5 | 1 | names a specific, datable action or event | Have you caught yourself describing your work differently to different people lately? What changed? |
| 6 | 3 | hypothetical | If a friend introduced you to someone at a party, what would they say about you? Would you agree with it? |
| 7 | 1 | names a specific, datable action or event | What's something you said about your work this week that felt really right — like, that's exactly how I want t… |
| 8 | 1 | names a specific, datable action or event | Who did you spend the most time with this week — and did any of it surprise you? |

**What's On Your Mind**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| 9 | 2 | a time anchor with no named action | What shaped your thinking this week? A podcast, a conversation, something you read, a random thought in the sh… |
| 10 | 2 | a time anchor with no named action | What's the most interesting thing someone said to you this week? |
| 11 | 2 | a time anchor with no named action | Anything happen this week that you're still turning over in your head? |
| 12 | 1 | names a specific, datable action or event | What did you spend an unreasonable amount of time thinking about this week that has nothing to do with work? |
| 13 | 2 | a user-observed pattern | Is there something you overheard or read recently that you keep coming back to? |
| 14 | 2 | a real referent with no time anchor | What topic have you been wanting to talk to someone about but haven't found the right person? |
| 15 | 1 | names a specific, datable action or event | Did anything make you laugh at work this week? What was it? |
| 16 | 1 | names a specific, datable action or event | What's one thing you learned this week — big or small, doesn't matter? |

**Weekend and Life**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| 17 | 1 | names a specific, datable action or event | What did you do this past weekend that you'd actually do again? |
| 18 | 2 | a time anchor with no named action | What's the best conversation you had outside of work this week? |
| 19 | 1 | names a specific, datable action or event | Did you do anything this week purely because you wanted to — not because you had to? |
| 20 | 2 | a time anchor with no named action | What's one thing that happened this week that made your day better — even a small thing? |
| 21 | 2 | a time anchor with no named action | What are you looking forward to this week? |
| 22 | 1 | names a specific, datable action or event | Did you try anything new recently? Even something tiny — a new restaurant, a different route, a new show? |
| 23 | 2 | a time anchor with no named action | What's something that happened this week that you told someone about? Like actually chose to share? |
| 24 | 1 | names a specific, datable action or event | Who did you catch up with recently that you were glad you did? |

**How You Think and Decide**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| 25 | 1 | names a specific, datable action or event | What's the last thing you changed your mind about? |
| 26 | 2 | a real referent with no time anchor | What's something you keep almost doing but haven't pulled the trigger on? |
| 27 | 2 | a real referent with no time anchor | When you're stuck on something, what do you actually do — talk it out, write it out, go for a walk, sleep on i… |
| 28 | 1 | names a specific, datable action or event | What's a decision you made recently that you're like 60% sure was right? |
| 29 | 2 | a real referent with no time anchor | What's the most interesting wrong answer you've ever given to something? |
| 30 | 1 | names a specific, datable action or event | Did you solve any problems this week in a way that surprised you? |
| 31 | 2 | a user-observed pattern | What's something you used to overthink that you now just handle on autopilot? |
| 32 | 2 | a time anchor with no named action | When's the last time your gut was right about something and you almost didn't listen? |

**Skills and Strengths (Warm)**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| 33 | 3 | trait self-report | What's something you're really good at that would sound completely boring if you explained it? |
| 34 | 2 | a real referent with no time anchor | What's a skill you have that you picked up from a totally unrelated part of your life? |
| 35 | 2 | a user-observed pattern | What's the thing people always come to you for — and do you like that they do? |
| 36 | 2 | a real referent with no time anchor | What do you know how to do that you can't explain how you learned? |
| 37 | 2 | a real referent with no time anchor | What's something that's easy for you that seems hard for most people? |
| 38 | 1 | names a specific, datable action or event | What did you help someone with this week? |
| 39 | 2 | a real referent with no time anchor | What's a professional skill you have that is absolutely useless on a resume but saves you constantly? |
| 40 | 1 | names a specific, datable action or event | Did anyone compliment your work this week? What did they actually say? |

**The Playful Ones**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| 41 | 3 | hypothetical | If your decision-making process were a cooking style, are you a recipe follower, a whatever's-in-the-fridge pe… |
| 42 | 3 | trait self-report | What's your most toxic productivity habit that you've fully embraced and refuse to fix? |
| 43 | 3 | hypothetical | If your work style were a reality TV show, what would it be called? |
| 44 | 2 | a time anchor with no named action | What's the pettiest thing you've been right about recently? |
| 45 | 2 | a real referent with no time anchor | What's the most overrated advice in your field that everyone treats like gospel? |
| 46 | 3 | hypothetical | If your inbox were a crime scene, what would the detective conclude about you? |
| 47 | 3 | trait self-report | What's your most chaotic problem-solving method that actually works? |
| 48 | 3 | hypothetical | What's an app on your phone that if someone opened it they'd immediately understand you — not because it's wei… |
| 49 | 2 | a real referent with no time anchor | What's the most diplomatic way you've ever handled a bad idea? |
| 50 | 2 | a real referent with no time anchor | What's a hill you'd absolutely die on at a dinner party? |

**The Sneaky-Smart Ones**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| 51 | 2 | a user-observed pattern | What's something you used to judge people for that you totally do now? |
| 52 | 2 | a real referent with no time anchor | What's a rule you follow that you've never told anyone about? |
| 53 | 2 | a real referent with no time anchor | What's a pattern you've noticed about people that nobody around you seems to see? |
| 54 | 3 | forced-choice self-classification | Would you rather be respected or liked — and before you say both, pick one? |
| 55 | 2 | a real referent with no time anchor | What's a compliment you got that technically was positive but you're still not sure was a compliment? |
| 56 | 2 | a time anchor with no named action | When's the last time you were the problem — and how long did it take you to figure that out? |
| 57 | 2 | a real referent with no time anchor | What do you do when nobody's watching that tells on you completely? |
| 58 | 2 | a real referent with no time anchor | What's a red flag in other people that you know you also have? |
| 59 | 3 | forced-choice self-classification | Are you the kind of person who trusts their gut and then validates, or gathers evidence and then decides? |
| 60 | 2 | a time anchor with no named action | What's the dumbest-sounding idea you've had recently that you actually think might be right? |

**The Hypotheticals**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| 61 | 3 | in the Hypotheticals block, Tier 3 by construction | If you had to quit your job tomorrow and couldn't do anything even adjacent to what you do now — what would yo… |
| 62 | 3 | in the Hypotheticals block, Tier 3 by construction | If someone shadowed you for a full workday, what would they be most confused by? |
| 63 | 3 | in the Hypotheticals block, Tier 3 by construction | If your brain had a search history that other people could see, what's the most embarrassing recurring query? |
| 64 | 3 | in the Hypotheticals block, Tier 3 by construction | If you could only keep three apps on your phone for the next year, what survives? |
| 65 | 3 | in the Hypotheticals block, Tier 3 by construction | If you could go back and whisper one sentence to yourself on your first day at your current job, what are you … |
| 66 | 3 | in the Hypotheticals block, Tier 3 by construction | If someone made a documentary about your last month, is it a thriller, a comedy, a slow-burn drama, or a natur… |
| 67 | 3 | in the Hypotheticals block, Tier 3 by construction | If you could only communicate through voice memos for a week, how would your work change? |
| 68 | 3 | in the Hypotheticals block, Tier 3 by construction | If you had to teach a class on something you learned the hard way, what's the course called? |

**Values Without Asking About Values**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| 69 | 1 | names a specific, datable action or event | What's a purchase you made recently that was objectively unnecessary but you have zero regrets? |
| 70 | 2 | a real referent with no time anchor | What's the compliment that actually stuck with you — not the polite ones, the one that landed? |
| 71 | 2 | a real referent with no time anchor | Who's someone you've lost touch with that you think about more than they'd expect? |
| 72 | 1 | names a specific, datable action or event | When's the last time you helped someone and it cost you something real — not just time? |
| 73 | 2 | a user-observed pattern | What's something you stopped apologizing for that you used to feel guilty about? |
| 74 | 2 | a real referent with no time anchor | What season of your life are you in right now, and do you like it? |
| 75 | 2 | a user-observed pattern | What's something that used to take all your energy that you now do without thinking? |
| 76 | 2 | a real referent with no time anchor | Who's someone in your everyday life who teaches you things without knowing they're teaching you? |
| 77 | 3 | trait self-report | What's your bar for quality in something you care about that other people think is unreasonable? |
| 78 | 2 | a real referent with no time anchor | What's something you're weirdly competitive about that has zero stakes? |
| 79 | 2 | a real referent with no time anchor | What are you getting better at right now — even if nobody can see it yet? |
| 80 | 2 | a time anchor with no named action | What's a moment from this week that you want to remember? |

**Undergraduate (10)**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| U-01 | 2 | a real referent with no time anchor | How have you been describing your major to people outside school? Do you ever change the answer depending on w… |
| U-02 | 2 | a time anchor with no named action | What's something a professor said this week that stuck with you — even if it wasn't on the test? |
| U-03 | 1 | names a specific, datable action or event | Did you have any conversations with people in your classes this week that went beyond the assignment? |
| U-04 | 2 | a real referent with no time anchor | What's a class or club that has nothing to do with your major that you're getting more out of than you expecte… |
| U-05 | 3 | hypothetical | If someone asked your roommate or closest friend what you're actually good at, what would they say? |
| U-06 | 1 | names a specific, datable action or event | What's something you did this week — a project, a conversation, a study session — where you thought, yeah, I'm… |
| U-07 | 1 | names a specific, datable action or event | Did you explain anything to someone this week — a concept, a process, anything? How'd it go? |
| U-08 | 2 | a real referent with no time anchor | What's something about your generation's approach to work that older people don't get — but they should? |
| U-09 | 3 | hypothetical | If you could shadow someone in any job for a week, what would you want to learn? |
| U-10 | 2 | a real referent with no time anchor | What's the most interesting thing about your life right now that has nothing to do with school? |

**Early Career (10)**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| EC-01 | 2 | a real referent with no time anchor | How have you been describing your role to friends outside your field? Does it feel accurate? |
| EC-02 | 1 | names a specific, datable action or event | Did you work on anything this week where you thought — this is the part of my job I actually like? |
| EC-03 | 1 | names a specific, datable action or event | What's something you learned from watching someone more senior this week? |
| EC-04 | 2 | a user-observed pattern | Have you noticed yourself picking up any habits — good or bad — from your team? |
| EC-05 | 2 | a real referent with no time anchor | What's the thing about your job that surprises you most compared to what you expected? |
| EC-06 | 1 | names a specific, datable action or event | Did you get pulled into anything this week that wasn't your job but you were glad you did it? |
| EC-07 | 2 | a real referent with no time anchor | What's something at work that you wish someone had explained to you on day one? |
| EC-08 | 2 | a real referent with no time anchor | When people at work ask your opinion, what topics do they come to you for? |
| EC-09 | 2 | a real referent with no time anchor | What's a professional skill you didn't know you needed until you started working? |
| EC-10 | 2 | a real referent with no time anchor | Is there anything about how you work that you've realized is different from how most people around you work? |

**Mid-Career (10)**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| MC-01 | 1 | names a specific, datable action or event | How have you been describing what you do lately — has your answer changed in the last year? |
| MC-02 | 2 | a real referent with no time anchor | What's a piece of advice you give to junior people that you should probably take yourself? |
| MC-03 | 1 | names a specific, datable action or event | Did anything at work this week make you feel like you were in exactly the right lane? |
| MC-04 | 1 | names a specific, datable action or event | What's a meeting or conversation this week where you felt like you had the most to contribute? |
| MC-05 | 2 | a real referent with no time anchor | What's the thing about your career trajectory that would surprise people who only know your LinkedIn? |
| MC-06 | 2 | a user-observed pattern | Have you noticed any patterns in what energizes you at work versus what drains you? |
| MC-07 | 1 | names a specific, datable action or event | What's a conversation you had with a colleague this week where you realized you see things differently? |
| MC-08 | 2 | a real referent with no time anchor | What's something you do at work now that you couldn't have done five years ago — not because of the role, but … |
| MC-09 | 2 | a time anchor with no named action | Is there anything you've been reading or listening to lately that's changing how you think about your work? |
| MC-10 | 2 | a time anchor with no named action | What's a skill you used this week that you didn't learn from any training or formal education? |

**Executive (10)**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| EX-A01 | 1 | names a specific, datable action or event | What did you talk about over dinner or drinks with someone this week that wasn't about work at all? |
| EX-A02 | 2 | a time anchor with no named action | Was there a moment this week where you realized you were in the right conversation at the right time? |
| EX-A03 | 2 | a time anchor with no named action | What's a question someone asked you this week that was better than the answer you gave? |
| EX-A04 | 1 | names a specific, datable action or event | Did anyone on your team do something this week that surprised you — in a good way? |
| EX-A05 | 2 | a time anchor with no named action | What's the most useful 10 minutes you spent this week? |
| EX-A06 | 2 | a user-observed pattern | What's something you used to handle personally that you've let go of — and how does that feel? |
| EX-A07 | 3 | hypothetical | If you could have one uninterrupted hour this week to think about anything — no meetings, no emails — what wou… |
| EX-A08 | 2 | a time anchor with no named action | What's the best conversation you had with someone junior to you this week? |
| EX-A09 | 1 | names a specific, datable action or event | What's a decision you made this week where you had plenty of information but still weren't sure? |
| EX-A10 | 1 | names a specific, datable action or event | What's something you noticed this week that nobody else seemed to pick up on? |

**Entrepreneur — Early Stage (10)**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| EN-A01 | 1 | names a specific, datable action or event | How have you been describing your company to friends lately? Has the explanation changed? |
| EN-A02 | 2 | a real referent with no time anchor | What's the thing about building your company right now that you didn't expect to enjoy? |
| EN-A03 | 1 | names a specific, datable action or event | Did you talk to anyone this week — a customer, a friend, a stranger — who changed how you think about what you… |
| EN-A04 | 2 | a time anchor with no named action | What's one thing you built or fixed this week that you're quietly proud of? |
| EN-A05 | 2 | a time anchor with no named action | What's the part of your work this week that felt most like you — like this is what I'm actually supposed to be… |
| EN-A06 | 3 | hypothetical | If a really smart twelve-year-old asked what your company does, what would you actually say? |
| EN-A07 | 2 | a real referent with no time anchor | What's one thing about your company that you understand viscerally but struggle to explain? |
| EN-A08 | 2 | a time anchor with no named action | What surprised you about your work this week? |
| EN-A09 | 1 | names a specific, datable action or event | Did you learn anything from a customer or user this week that you didn't expect? |
| EN-A10 | 2 | a real referent with no time anchor | What's one thing you wish you could spend more time on if the other stuff didn't get in the way? |

**Entrepreneur — Fundraising (10)**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| EF-A01 | 2 | a real referent with no time anchor | How have you been describing your company to people outside the investor world — friends, family, the person n… |
| EF-A02 | 2 | a real referent with no time anchor | What's one thing about your business that gets clearer every time you explain it? |
| EF-A03 | 1 | names a specific, datable action or event | Did anyone ask you a question this week about your company that you didn't have a great answer for? What was i… |
| EF-A04 | 2 | a real referent with no time anchor | What part of your business are you most excited about right now — separate from what investors are most excite… |
| EF-A05 | 2 | a time anchor with no named action | What's something about building your company that made you laugh this week? |
| EF-A06 | 2 | a real referent with no time anchor | If someone who knew nothing about your industry asked why what you're building matters, what would you tell th… |
| EF-A07 | 2 | a real referent with no time anchor | What's the part of this process that's been more interesting than you expected? |
| EF-A08 | 2 | a real referent with no time anchor | What have you learned about yourself from explaining your vision over and over? |
| EF-A09 | 2 | a time anchor with no named action | What's one thing you're sure about today that you weren't sure about a month ago? |
| EF-A10 | 2 | a time anchor with no named action | Outside of the fundraise, what's one thing in your company that moved forward this week? |

**Entrepreneur — Scaling (10)**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| ES-A01 | 1 | names a specific, datable action or event | What did your team do this week that you didn't have to be involved in? |
| ES-A02 | 2 | a real referent with no time anchor | What's something your company does now that didn't exist six months ago? |
| ES-A03 | 2 | a time anchor with no named action | Who on your team impressed you this week? |
| ES-A04 | 1 | names a specific, datable action or event | What's a decision someone on your team made this week that you would have made differently — and was theirs ac… |
| ES-A05 | 1 | names a specific, datable action or event | What's a conversation you had this week that reminded you why you started this company? |
| ES-A06 | 3 | the user's guess at a third party's perception | How would your team describe the company culture if you weren't in the room? |
| ES-A07 | 2 | a real referent with no time anchor | What's one thing about your company that works better now than it did when it was just you? |
| ES-A08 | 2 | a user-observed pattern | What's a part of your job that you used to do yourself that someone else now owns — and are you OK with how th… |
| ES-A09 | 2 | a real referent with no time anchor | What's one thing that surprised you about leading a team that nobody warned you about? |
| ES-A10 | 3 | hypothetical | If you could protect one thing about your company's culture as it grows, what would it be? |

**Undergraduate-Only (15)**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| U-11 | 2 | a real referent with no time anchor | What's something you're doing in school right now that you think will matter in five years — and something you… |
| U-12 | 3 | hypothetical | If your friends had to describe what you're like in a group project — no filter, the real version — what would… |
| U-13 | 2 | a real referent with no time anchor | What's a skill you've picked up outside the classroom that you think might actually matter more than your cour… |
| U-14 | 2 | a real referent with no time anchor | What do your friends come to you for? Like, what's your thing in the group? |
| U-15 | 2 | a real referent with no time anchor | Is there a topic you can talk about for way too long without getting bored? |
| U-16 | 2 | a real referent with no time anchor | What's the difference between how you describe yourself on a form and how you'd describe yourself to someone y… |
| U-17 | 2 | a real referent with no time anchor | What's something you're better at now than you were a year ago — not academically, just as a person? |
| U-18 | 3 | hypothetical | When you imagine yourself working in a few years, what does the day actually look like? Not the job title — th… |
| U-19 | 2 | a real referent with no time anchor | What's something about you that people are usually surprised to learn? |
| U-20 | 1 | names a specific, datable action or event | What's a conversation you had recently where you felt like you really knew what you were talking about? |
| U-21 | 2 | a real referent with no time anchor | What do you think is the most useful thing you've learned so far — in school or out of it? |
| U-22 | 2 | a real referent with no time anchor | What's something you're curious about that doesn't fit into any of your classes or plans? |
| U-23 | 3 | hypothetical | If you had to pick one word your professors would use to describe you, what would it be? And is that the word … |
| U-24 | 2 | a time anchor with no named action | What's a challenge you dealt with recently where you surprised yourself with how you handled it? |
| U-25 | 2 | a real referent with no time anchor | What kind of work environment sounds like it would bring out your best? Not the company — the vibe. |

**Early Career-Only (15)**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| EC-11 | 2 | a real referent with no time anchor | What's the unwritten rule at your workplace that nobody tells you but everyone follows? |
| EC-12 | 2 | a real referent with no time anchor | Have you ever been in a meeting where you knew the answer but didn't say it? What held you back? |
| EC-13 | 2 | a real referent with no time anchor | What's the gap between your job description and what you actually do all day? |
| EC-14 | 2 | a real referent with no time anchor | Is there someone at work whose career path you look at and think — I could see myself doing something like tha… |
| EC-15 | 2 | a real referent with no time anchor | What's something your boss does that you've quietly decided you'd never do? |
| EC-16 | 1 | names a specific, datable action or event | What's a project you worked on this quarter that you'd actually want to talk about at a dinner party? |
| EC-17 | 3 | trait self-report | Do you feel like you're learning fast right now, or does it feel like things have slowed down? |
| EC-18 | 2 | a real referent with no time anchor | What's the most useful thing a colleague has taught you — not in a training, just by watching them? |
| EC-19 | 2 | a real referent with no time anchor | When someone asks where you see yourself in five years, what do you actually think — not what you say? |
| EC-20 | 2 | a real referent with no time anchor | What's one thing at work you feel like you're figuring out right now — like you're in the middle of getting be… |
| EC-21 | 2 | a real referent with no time anchor | Is there a part of your job that everyone else dreads that you secretly don't mind? |
| EC-22 | 2 | a user-observed pattern | Have you noticed anything about how you handle stress at work that's different from how your colleagues handle… |
| EC-23 | 2 | a real referent with no time anchor | What's a conversation with someone more senior that made you see your work differently? |
| EC-24 | 2 | a real referent with no time anchor | Is there anything about your generation's approach to work that you think is actually right — even when people… |
| EC-25 | 2 | a time anchor with no named action | What's a small win from this week that nobody noticed but you? |

**Mid-Career-Only (15)**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| MC-11 | 2 | a real referent with no time anchor | What's the thread connecting the chapters of your career that look unrelated on paper? |
| MC-12 | 2 | a real referent with no time anchor | Is there a version of you from earlier in your career that you miss? |
| MC-13 | 2 | a real referent with no time anchor | What's something you're doing at work now that ten-years-ago you would never have imagined? |
| MC-14 | 2 | a real referent with no time anchor | Have you ever been the person who saw a problem coming before everyone else? What happened? |
| MC-15 | 2 | a real referent with no time anchor | What's a lesson you learned from a career setback that you couldn't have learned any other way? |
| MC-16 | 3 | hypothetical | If a younger version of you could see your current job, what would surprise them most? |
| MC-17 | 2 | a real referent with no time anchor | What's one thing about your field that you understand now that you literally couldn't have understood five yea… |
| MC-18 | 2 | a real referent with no time anchor | Are there skills from earlier in your career that you thought you'd left behind but keep showing up? |
| MC-19 | 2 | a real referent with no time anchor | What's a mistake you made earlier in your career that actually became one of your best credentials? |
| MC-20 | 2 | a user-observed pattern | What do people consistently get wrong about you — and have you stopped correcting them? |
| MC-21 | 2 | a real referent with no time anchor | What's one thing about your work that you wish your family or friends understood better? |
| MC-22 | 2 | a real referent with no time anchor | Is there someone in your field whose career you respect not because of their title but because of how they got… |
| MC-23 | 2 | a real referent with no time anchor | What's a conversation you keep having at work that's actually the same conversation every time, just wearing d… |
| MC-24 | 2 | a real referent with no time anchor | What's a strength you leaned on earlier in your career that you've had to retire or evolve? |
| MC-25 | 3 | forced-choice self-classification | Are you in a building chapter or a refining chapter right now — and do you like it? |

**Executive-Only (15)**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| EX-A11 | 1 | names a specific, datable action or event | What's a decision you made recently where having more information wouldn't have helped? |
| EX-A12 | 2 | a real referent with no time anchor | What does your team do well that you had nothing to do with? |
| EX-A13 | 2 | a time anchor with no named action | What's something about how you lead that you've only recently been able to name? |
| EX-A14 | 1 | names a specific, datable action or event | Did anyone push back on you this week? How did that go? |
| EX-A15 | 2 | a real referent with no time anchor | What's a leadership lesson you learned from completely outside the business world? |
| EX-A16 | 2 | a real referent with no time anchor | What's one question you wish your board or stakeholders would ask you that they never do? |
| EX-A17 | 3 | hypothetical | If you could have an honest conversation with your twenty-five-year-old self about leadership, what would you … |
| EX-A18 | 2 | a user-observed pattern | What's something you've stopped doing as a leader that you used to think was essential? |
| EX-A19 | 2 | a time anchor with no named action | When's the last time you were really curious about something at work — like, couldn't-stop-thinking-about-it c… |
| EX-A20 | 2 | a real referent with no time anchor | What's one thing your team would say you do that makes their job easier? |
| EX-A21 | 2 | a real referent with no time anchor | What part of your job do you still find actually fun? |
| EX-A22 | 2 | a real referent with no time anchor | Is there someone you lead who you learn from more than they realize? |
| EX-A23 | 2 | a time anchor with no named action | What's a room you walked into recently where you thought — OK, I belong here? |
| EX-A24 | 2 | a time anchor with no named action | What's the best piece of feedback you've given someone recently — not the hardest, the best? |
| EX-A25 | 2 | a real referent with no time anchor | What's one thing you know about your industry that sounds obvious but took you years to actually understand? |

**Entrepreneur (Fundraising)-Only (10)**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| EF-A11 | 2 | a real referent with no time anchor | What's the part of your business that you explain worst but believe in most? |
| EF-A12 | 2 | a real referent with no time anchor | What's a version of your company that exists in your head that you can't build yet? |
| EF-A13 | 2 | a time anchor with no named action | Who's someone you've talked to about your company this week who actually challenged your thinking — not valida… |
| EF-A14 | 2 | a real referent with no time anchor | What do your friends and family think you're building — and is it the same thing you think you're building? |
| EF-A15 | 3 | hypothetical | If your company fails — which I hope it doesn't — what will you know afterward that makes the next thing ten t… |

**Entrepreneur (Scaling)-Only (10)**

| # | Tier | Because | Prompt |
| --- | --- | --- | --- |
| ES-A11 | 2 | a user-observed pattern | What's a problem at your company that you used to fix yourself that now has to fix itself? |
| ES-A12 | 2 | a real referent with no time anchor | When someone new joins your team, what's the thing you most want them to understand about the company that isn… |
| ES-A13 | 2 | a real referent with no time anchor | What's something your company does now that you didn't design — someone else created it? |
| ES-A14 | 2 | a real referent with no time anchor | What part of your founder story do you still tell people, and has how you tell it changed? |
| ES-A15 | 2 | a user-observed pattern | What's the hardest part about leading a company that's bigger than it used to be — that you didn't expect? |

## wing-heartbeat-and-population-prompts.md

| 1 | 1 | names a specific, datable action or event | What did you work on this week that you'd want to tell someone about? |
| 2 | 2 | a time anchor with no named action | Was there a moment this week where you surprised yourself — with how much you knew, or how much you didn't? |
| 3 | 1 | names a specific, datable action or event | Who did you learn something from this week — and what was it? |
| 4 | 3 | metaphor | One word for your week. Go. And then tell me the story behind it. |
| 5 | 1 | names a specific, datable action or event | Did you end up talking to anyone new this week — at school, online, anywhere? What did you talk about? |
| 6 | 1 | names a specific, datable action or event | What's one thing you did this week that felt effortless? |
| 7 | 2 | a time anchor with no named action | Was there a conversation this week that stuck with you? What about it? |
| 8 | 2 | a time anchor with no named action | What moment from this week do you keep replaying in your head — good or bad? |
| 1 | 1 | names a specific, datable action or event | Did anything unexpected grab your attention at work this week? What was it? |
| 2 | 2 | a time anchor with no named action | Did your SLI come up this week — in a conversation, an email, or just in your head? |
| 3 | 1 | names a specific, datable action or event | What did you do this week that someone thanked you for? |
| 4 | 2 | a time anchor with no named action | What's one thing about your work this week that you're still thinking about? |
| 5 | 2 | a time anchor with no named action | What conversation this week gave you energy? |
| 6 | 2 | a time anchor with no named action | Was there a moment this week where you felt like you were in your zone — doing the thing you do best? |
| 7 | 2 | a time anchor with no named action | Anything show up on your plate this week that wasn't supposed to be there? |
| 8 | 2 | a time anchor with no named action | What's one thing you explained to someone this week that they found helpful? |
| 1 | 1 | names a specific, datable action or event | What's a call you made this week where your experience really mattered? |
| 2 | 1 | names a specific, datable action or event | What did you see this week that the rest of your organization hasn't noticed yet? |
| 3 | 1 | names a specific, datable action or event | Did your positioning come up this week? How did you describe yourself? |
| 4 | 2 | a real referent with no time anchor | What's something happening in your industry right now that you have a strong opinion about? |
| 5 | 2 | a time anchor with no named action | What conversation shifted your thinking this week? |
| 6 | 1 | names a specific, datable action or event | What did you delegate this week — and what did you keep? |
| 7 | 2 | a time anchor with no named action | Is there someone in your organization whose influence you observed this week? What were they doing? |
| 8 | 2 | a time anchor with no named action | What would you tell your team about this week that they don't already know? |
| 1 | 1 | names a specific, datable action or event | What strategic pattern did you notice this week that nobody else seems to see? |
| 2 | 1 | names a specific, datable action or event | What did you learn this week from someone who reports to you? |
| 3 | 1 | names a specific, datable action or event | What opinion did you form this week that you haven't shared with anyone yet? |
| 4 | 2 | a time anchor with no named action | Was there a moment this week where you thought about what you're building that will outlast you? |
| 5 | 1 | names a specific, datable action or event | What decision did you make this week that you'd make differently if you had more time? |
| 6 | 2 | a time anchor with no named action | Was there a moment this week where you could feel your influence landing — or not landing? |
| 7 | 2 | a real referent with no time anchor | What's one thing happening in your industry that changes how you think about the next two years? |
| 8 | 1 | names a specific, datable action or event | Did anything come up this week — feedback, a reaction, a result — that told you something about how you're lea… |
| 1 | 1 | names a specific, datable action or event | What did you learn about your market this week that you didn't know before? |
| 2 | 1 | names a specific, datable action or event | What's a conversation from this week that stuck with you — easy or hard? |
| 3 | 1 | names a specific, datable action or event | Did anything land on your plate this week that you're second-guessing taking on? |
| 4 | 3 | hypothetical | If someone asked you 'why are you the right person to build this?' today, what would you say? |
| 5 | 1 | names a specific, datable action or event | Who did you try to influence this week — and how did it go? |
| 6 | 2 | a time anchor with no named action | What's one part of your company that didn't get your attention this week — and should it have? |
| 7 | 3 | hypothetical | If your team could ask you for one thing right now, what do you think it would be? |
| 8 | 2 | a time anchor with no named action | What signal from your customers or market surprised you this week? |
| 1 | 1 | names a specific, datable action or event | How did you describe yourself to someone new this week? |
| 2 | 1 | names a specific, datable action or event | What did you do this week that reminded you of what you're good at? |
| 3 | 2 | a time anchor with no named action | What came back faster than you expected this week? And anything still feel like it needs warming up? |
| 4 | 2 | a time anchor with no named action | Was there a moment this week where the gap felt like an advantage, not a liability? |
| 5 | 2 | a real referent with no time anchor | What's one thing you noticed about your industry that's changed since you were last in it? |
| 6 | 1 | names a specific, datable action or event | Who reached out to you this week, or who did you reach out to? |
| 7 | 1 | names a specific, datable action or event | What did you read or learn this week that made you feel more ready? |
| 8 | 2 | a real referent with no time anchor | What would you tell someone else who's re-entering the workforce after a break? |
| EF-01 | 2 | a time anchor with no named action | What's one thing an investor pushed back on this week that you're still turning over? |
| EF-02 | 2 | a real referent with no time anchor | Is there a difference between how you describe your company to investors and how you describe it to friends? |
| EF-03 | 3 | trait self-report | Quick — what are you good at that has nothing to do with your company? |
| EF-04 | 2 | a real referent with no time anchor | What was the hardest question you got in your last investor meeting, and what was your first internal reaction… |
| EF-05 | 3 | hypothetical | If your company pivoted completely away from [current focus], what would that mean about you? |
| EF-06 | 2 | a real referent with no time anchor | What did you learn from the last investor who said no — about them, about your pitch, or about the market? |
| EF-07 | 3 | forced-choice self-classification | Right now, are you more worried about not raising enough or about raising from the wrong people? |
| EF-08 | 2 | a real referent with no time anchor | What's the part of your fundraising story that you believe most — and the part you're least sure about? |
| EF-09 | 1 | names a specific, datable action or event | Did anything an investor said this week change how you actually think about your business — not just your pitc… |
| EF-10 | 3 | hypothetical | When you imagine your company in five years, are you running it or have you built something that runs without … |
| ES-01 | 1 | names a specific, datable action or event | What's a decision you made alone this week that, in six months, you'd want someone else on your team to own? |
| ES-02 | 2 | a real referent with no time anchor | What decisions in your company still reflect something only you would have chosen? |
| ES-03 | 2 | a user-observed pattern | What part of how you used to work do you miss most? |
| ES-04 | 1 | names a specific, datable action or event | Did you step back into something this week that your team was supposed to own? What pulled you in? |
| ES-05 | 3 | hypothetical | What would it mean about you if your team's version was good enough? |
| ES-06 | 2 | a time anchor with no named action | What's the last thing about running your company that actually surprised you — not a problem, but something yo… |
| ES-07 | 2 | a real referent with no time anchor | If you stepped away from your company for a month, what would break? |
| ES-08 | 2 | a time anchor with no named action | What's one thing you're doing today that you were also doing when the company had 3 people? Should you still b… |
| ES-09 | 3 | trait self-report | Who on your team most disagrees with you right now — and how do you feel about that? |
| EX-01 | 2 | a real referent with no time anchor | What work thought keeps coming back to you — the one that shows up when you're not at your desk? |
| EX-02 | 1 | asks the user to recount one particular occasion | Walk me through your last decision where the outcome was different from what you expected. |
| EX-03 | 2 | a real referent with no time anchor | Any conversations on your mind that you haven't had yet? |
| EX-04 | 3 | hypothetical | If your team could tell you one thing anonymously, what do you think they'd say? |
| EX-05 | 3 | hypothetical | You've described [N] strong weeks in a row. What's the one thing you'd change if you could? |
| EX-06 | 3 | hypothetical | If someone shadowed you for a day this week, what would they say you spent the most time on — and would you ag… |
| EX-07 | 2 | a real referent with no time anchor | What's a skill-related advantage you have that you rarely talk about in professional settings? |
| EX-08 | 2 | a real referent with no time anchor | Who in your organization has the most influence that doesn't show up on the org chart — and how do you navigat… |

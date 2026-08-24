# Reveal Cycle v4 — Amendments for Delivery

**Date:** August 19, 2026
**Applies to:** Wing_Reveal_Cycle_System_Event_v4_CANONICAL.md (August 18, 2026)
**Read this first, then the v4 spec. These changes apply on top of v4.**

---

## 1. Platform-Wide Promotions (new since v4)

Two architectural elements that v4 defines as Reveal-specific have been promoted to platform-wide universal gates. The Reveal keeps its own higher thresholds. The platform gets a baseline.

**IG-U012 — Evidence Grade Classification (platform-wide)**
v4's three-tier evidence grading (Tier 1 behavioral, Tier 2 corroborating, Tier 3 contextual) now applies to any module or system event that synthesizes user data across sessions. The Reveal's Gate 2 requirement (four Tier 1 events, three signal categories) is the Reveal-specific threshold on top of the platform minimum (two Tier 1 events for any cross-session observation). See Platform Updates document for the full gate.

**IG-U013 — Role-Aware Summarization (platform-wide)**
v4's IG-RC09 (role-aware summarization at candidate assembly) is now a platform-wide requirement. Any summarization of prior session content — not just Reveal synthesis — must distinguish between the user's original words and Wing's coaching language. The Reveal has the most extreme version of this risk (months of accumulated data compressed into one insight), but the principle applies everywhere. See Platform Updates document for the full gate.

**What this means for implementation:** IG-RC09 still fires as specified in v4 during Reveal synthesis. IG-U013 additionally governs every other summarization path in the platform (module recaps, progress summaries, the Radar weekly digest). The Reveal-specific version is stricter, not different.

---

## 2. Copy Conflict Resolutions (§11 of v4)

v4 §11 identified five live copy conflicts. Resolved below.

**§11.1 — Four banned constructions. All removed.**

| Location | Original | Replacement |
|---|---|---|
| Module 10 undergraduate WIIFM | "The problem isn't your experience — it's how you're telling the story." | "You have the experience. The story you're telling about it hasn't caught up yet." |
| First-Reveal opening | "This isn't a summary of what you told me — it's my interpretation of what it means." | CUT. Replaced by the Beat 1 observation directly. See §11.2 below. |
| Positioning Refresh drift opening | "That's not a problem — it means you've grown." | "That shift tells me something has changed. Let's figure out whether you're growing into something or away from something." |
| Micro-journal Universal 19 | "purely because you wanted to — not because you had to" | Per v4 §12.1: "What did you do this week just because you wanted to?" (full prompt rewrite) |

**§11.2 — First-Reveal opening preamble. Removed entirely.**

The original: "I've been looking at everything you've shared with me so far — your answers, your writing, your career data. This isn't a summary of what you told me — it's my interpretation of what it means. Ready?"

Three problems: announces the data review before the observation (inverts front-loading), uses a banned construction, and "Ready?" is a permission ask that converts the Reveal from a Wing-initiated event into a module the user opts into.

**Replacement:** open directly on Beat 0 (Reveals 2+) or Beat 1 (first Reveal). No preamble, no "Ready?" The Reveal's power comes from Wing bringing something unprompted. Asking permission first undercuts it.

**§11.3 — Subsequent-Reveal surprise promise. Removed.**

The original: "Here's what's changed — and one thing I didn't expect."

Problem: false on every null, and front-loads a surprise claim ahead of evidence. Replaced by Beat 0 (loop close from prior forward question), which is true every time and stronger.

**§11.4 — Early career WIIFM Barnum tail. Trimmed.**

The original: "Your evidence used to be all about tasks. The last two cycles show decisions. You're evolving faster than you think."

The first two sentences are specific and falsifiable. The third survives substitution against any user. Cut: "You're evolving faster than you think." The line is stronger without it.

**§11.5 — Dashboard card hedge. Fixed.**

The original: "Across your last three check-ins, you mentioned [X]. That might be worth paying attention to."

The closer is a hedge of exactly the form the Voice Standard bans. Replacement: "Across your last three check-ins, you mentioned [X]. What do you make of that?"

---

## 3. Suppression State Warning

v4 §13 and the crisis escalation protocol identified the most urgent safety issue in the platform: **IG-RC01 suppresses only the Reveal.** Wing has at least seven other systems that initiate contact on a schedule (Radar weekly, micro-journal rotation via push/SMS/email, heartbeat prompts, re-engagement triggers, baseline re-measurement prompts, Module 13 ongoing practice check-ins, and Positioning Refresh triggers).

The re-engagement trigger (H-709) fires on engagement decay, which is the exact behavioral pattern of a user in crisis. A user showing crisis indicators gets their Reveal suppressed but gets MORE contact from every other system.

**For Aditya — do not build any new scheduled-contact system (Module 13 commitment check-ins, baseline re-measurement prompts, or Radar enhancement alerts) until the platform-wide suppression state is specified.** The specification is forthcoming. In the interim: if IG-S01 fires for a user, all Wing-initiated contact for that user should pause, not just the Reveal.

---

## 4. §13 Open Items — Status Update

### For Danielle (status as of August 19)

| Item | Status |
|---|---|
| Career-returner prompt set (15 prompts) | Not yet started. Known gap — Reveal underserves this track until they exist. |
| Eight prompt rewrites (Universal 19, 20, etc.) | Universal 19 resolved in §12.1 amendment (adopted in §2 above). Universal 20 resolved in §12.2. Remaining six pending. |
| Five copy conflicts | Resolved above (§2). |
| Adaptive over-sampling vs. rebalancing | Decision: over-sampling. Cheaper, reversible, tunable once real coverage data exists. |
| IG-RC12 disposition | Decision: fold into IG-S03. IG-RC12 duplicates IG-S03's failure path. Remove IG-RC12 as a standalone gate. Effective gate count drops from 12 to 11 (IG-RC11 is non-firing, IG-RC12 is folded). Renumber: do not renumber. IG-RC12 stays as a retired number to avoid breaking references. |
| Signal-category tagging (155 prompts) | Not yet started. 80 universal prompts are tagged (in the Input Layer Spec). 155 audience-adapted and audience-specific prompts remain untagged. |

### For Aditya (status as of August 19)

All items in v4 §13 remain valid. Build priority within this list:

1. **Prompt log** with delivery, signal category, and response substantiveness — required for IG-RC10 and Gate 2. Highest priority.
2. **Quote-productivity classification at capture** (single word, list, prose) — cheap at capture, expensive to backfill.
3. **Evidence tier as prompt attribute** — lives in the prompt library, not computed at runtime.
4. **Pre-synthesis gating** — IG-RC01 safety scan completes before synthesis, not as an output filter.
5. **Reveal state persistence** — each Reveal's primary insight and forward question as retrievable objects.
6. **Per-user cadence state** — deferral tracking, 14-day floor, null-triggered reset.
7. **Verbatim retention** — 60-day horizon, all channels including SMS and email replies.
8. **Role-aware summarization in memory pipeline** — before candidate assembly, not at output. Now also a platform-wide requirement (IG-U013).

### For Sam

Items unchanged from v4. The adversarial false-memory validation suite remains a scoping question for post-fundraise.

---

## 5. Running Total Reconciliation

v4 flagged inconsistent base counts across August deliverables. Here is the reconciled count:

| Document | Cards added | Running total |
|---|---|---|
| Master Compendium v2 (Aug 17) | 209 | 209 |
| Intake v1.8 (Aug 19) | 41 | 250 |
| Research-Derived Gates (Aug 18) | 14 | 264 |
| Module 13 v1.2 (Aug 19) | 17 | 281 |
| Platform Updates — IG-U012 through IG-U017 (Aug 19) | 6 | 287 |
| Reveal Cycle v4 (Aug 18, delivered Aug 19) | 25 | **312** |

Note: IG-RC11 is counted but non-firing. IG-RC12 is counted but folded into IG-S03 (retained as a retired number). Effective new elements in the Reveal: 23 firing.

---

*Wing Reveal Cycle v4 Amendments · August 19, 2026 · Confidential*
*Read alongside Wing_Reveal_Cycle_System_Event_v4_CANONICAL.md*
*Methodology author: Danielle Carattini · dcara@sli.pro*

# Wing Methodology v2 — Integration Plan & Gap Analysis

**Status:** For review, one item at a time
**Date:** 13 August 2026
**Scope:** Danielle's final methodology (Master Module Compendium v2 + 6 companion documents), replacing all existing heuristics, objectives and prompts. Clean slate.

---

## 0. What this document is

Danielle's twelve emails delivered a methodology in fragments, then consolidated it. This plan works from the consolidated documents, not the emails, because the emails' running totals were superseded at each step and the final one disagrees with the compendium's own count table.

**What I read in full:** `Wing_Master_Module_Compendium-2.md` (5,484 lines), `Wing_Voice_Tone_Integrity_Gates.md`, `Wing_All_Prompts_Copy_Final.md`, `Wing_Approachable_MicroJournal_Library_Final.md`, `Wing_Comprehensive_UX_Recommendation-2.md`, `Wing_UX_Addendum_Final.md`, `Wing_Integrity_Gates_Additions_v2-2.md`.

**What I could not read:** `Module9_Power_Influence_Source_Integrity.md`. Danielle lists it as one of five companion documents that stay separate, but it is not in the project. Module 9 has the highest integrity requirements in the platform — it is the only module that tells users to change their power behaviour in their real workplace this week — so its source-integrity framework needs reviewing before Module 9 is built.

**Also present but superseded:** `Wing_Integrity_Gates_Additions_v2-2.md`. Its seven gates are all inside the compendium, and it is the source of the duplicated blocks described in D4. Archive it.

**Every count below is from the documents themselves, verified by parsing, not from the emails.**

---

## 1. Headline

Three things are true at once, and they pull in different directions.

**The methodology is substantially more specified than what the platform was built to hold.** The v2 seven-component card format is consistently applied — all 205 card blocks in the compendium carry all seven components, with no omissions. That is a genuinely high-quality input.

**The engine consumes three of those seven components.** `signal`, `intervention`, `coaching_move`. `detection_method`, `delivery_adaptation` and `failure_path` have nowhere to go, and `success_criteria` is read only by post-session scoring, never at delivery. Loading v2 cards into the platform as it stands would import the documents and run about 40% of each card.

**The integrity gates — 47 of the 184 specifications — have no execution point at all.** They are quality checks on Wing's *own output*, firing before delivery. Nothing in the platform inspects Wing's output before the user sees it, and the streaming turn path means the first moment the full reply exists server-side is after the student has already read it. This is the largest single piece of work in the plan and everything about "Wing never says X" depends on it.

The clean slate also has a cost that should be named before it is accepted: roughly **6,400 lines** of built, admin-editable methodology infrastructure (objectives, completion criteria, analysis methodology and their three editors) plus **139 KB** of prompt files are superseded by these documents. See Part 4.

---

## 2. What the methodology actually is — verified inventory

184 distinct card/gate specifications in the compendium body.

| Section | Cards | Gates | Total | Card IDs |
|---|---|---|---|---|
| Foundation 1 | 8 | 2 | 10 | H-101–H-108, H-109, H-110 |
| Foundation 2 | 7 + 2 ex | 2 | 11 | H-201–H-207, H-208, H-209, H-211, H-212 |
| Foundation 3 | 8 + 4 ex | 2 | 14 | H-301–H-308, H-309, H-310, H-311–H-314 |
| Module 4 Career Exploration | 7 + 6 ex | 1 | 14 | H-401–H-407, H-411*, H-411–H-416 |
| Module 5 JD Analysis | 6 | 1 | 7 | H-501–H-506, H-507 |
| Module 6 Writing Coach | 10 + 3 ex | 2 | 15 | H-601–H-610, H-611–H-613, H-614, H-615 |
| Module 7 Wing Radar | 7 | 2 | 9 | H-701–H-705, H-708, H-709, H-710*, H-710* |
| Module 8 Competency Intelligence | 5 | 4 | 9 | H-801–H-805, H-806–H-809 |
| Module 9 Power & Influence | 15 | 6 | 21 | H-901–H-912, H-918–H-921, H-913–H-917, H-922 |
| Module 10 Interview Prep | 22 | 9 | 31 | H-1001–H-1022, IG-1001–1006, IG-U003–U005 |
| Module 11 Network Intelligence | 14 + 4 EX | 10 | 28 | H-1101–H-1114, IG-1101–1107, IG-U03–U05, EX-1101–1104 |
| Universal warm-up | 1 | — | 1 | H-900 |
| Universal gates | — | 6 | 6 | H-001–H-006 |
| Voice & tone gates | — | 7 | 7 | IG-V01–IG-V07 |
| **Total** | | **47** | **184** | |

`*` = ID collision, see D1/D2. "ex" = exercise-library cards, shown against the module they route into.

**Beyond the cards:** a system-level personality directive (12 positive qualities, 10 anti-patterns) that goes into every API call; 220 micro-journal prompts; 48 heartbeat prompts + 28 population-specific prompts; a universal opener pool; 9 routing rules; withhold logic; 4 signal-decay windows; 6 UX gates; 6 micro-journaling gates; a 5-group user-facing navigation taxonomy; and per-audience module objective lines for 11 modules × 5–7 audiences.

**Population tags actually used on cards — 8:** `undergraduate` (65), `early_career` (84), `mid_career` (65), `mid_career_pivot` (31), `mid_career_advancement` (31), `executive` (83), `entrepreneur` (83), `career_returner` (26).

**Intervention types used — 6:** COACH (87), META (57), CHALLENGE (18), REDIRECT (15), REFRAME (12), AFFIRM (7). META is the gate marker.

**Sequence weights used — 4 values:** 0.5, 1.0, 1.5, 2.0.

---

## 3. Document-level gaps and defects

These are for Danielle. Each needs a decision before or during ingest; none is a reason to delay starting.

### D1. `H-411` is two different cards — blocking

Both in Module 4. `H-411 — Never Steer by Assumption` (integrity gate, compendium line 727) and `H-411 Problem-Solution Mapping` (exercise card, line 1477). Distinct bodies, same ID. One must be renumbered. Danielle caught the equivalent collision for H-918→H-922 and flagged it in her email; this one was missed.

### D2. `H-710` is two different cards — blocking

Both in Module 7. `H-710 On-demand Radar archive` (coaching card, line 1837) and `H-710 — Wing Radar Content Seed Alignment` (integrity gate, line 1929). Distinct bodies, same ID.

### D3. Three universal gates carry two different IDs

Module 10 writes them `IG-U003`, `IG-U004`, `IG-U005`; Module 11 writes the same three `IG-U03`, `IG-U04`, `IG-U05`. Pick one form.

### D4. Six blocks of duplicated boilerplate

The "Two Module Gap Gates / Two Extension Gates / Updated Gate Library Summary" block from the superseded additions document was pasted at six points in the compendium. Result: `H-006` appears 7 times, `H-411` (gate) 5, `H-922` 6, `H-710` (gate) 4, `H-005` 3, `H-004` 2. Bodies are byte-identical, so this is a merge artefact rather than a conflict — but a parser must dedupe or it will create six copies of H-006.

### D5. The compendium's count table disagrees with its own body

| Module | Table says | Body has | Why |
|---|---|---|---|
| Module 9 | 27 (21 + 6) | 21 | The 6 gates are *inside* the 21; the table adds them twice |
| Module 11 | 24 (14 + 10) | 28 | Table omits the 4 `EX-11xx` extraction cards |
| Module 7 | 10 (8 + 2) | 9 | Only 7 coaching cards exist (see D7) |
| Exercise Library | 17 | 16 | See D6 |

Table total is 180; body is 184. Danielle's final email says 199, which adds the 7 voice gates and the 12 UX/MJ gates to the table's 180 while the table already counts the 6 universal gates inside its 47. Recommend the compendium's count table be regenerated from the body rather than maintained by hand.

### D6. Exercise library: 16 cards, 17 claimed

Present: H-211, H-212 (F2); H-311–H-314 (F3); H-411–H-416 (M4); H-611–H-613 (M6); H-900 (universal warm-up). That is 2+4+6+3+1 = 16. Both the email and the count table say 17. One card is either missing or double-counted.

### D7. Numbering gaps — reserved or dropped?

`H-210`, `H-408`, `H-409`, `H-410`, `H-706`, `H-707` are absent. H-706/H-707 matter most: the Module 7 email described 8 cards including "response capture and routing" and "cross-module activity synthesis", and the body has 7. Confirm whether these are deliberate reservations or cards that fell out during consolidation.

### D8. `H-922`'s own text still refers to its old number

Its "why this gate matters" note reads "H-309 protects the platform's structural trust. **H-918** protects the user's career." Stale after the renumber, and confusing because H-918 is now Passive Agency Detection.

### D9. Micro-journal library: 220 prompts, 235 claimed

- Section 1 Universal: 80 ✓
- Section 2 Adapted: 70 (10 × 7 audiences) ✓
- Section 3 Audience-specific: 70, not 85

Three problems inside Section 3: the **Entrepreneur (Early)-only section does not exist** although the summary table claims 15 for it; the *Entrepreneur (Fundraising)-Only* heading says 10 and contains 5 (EF-A11–EF-A15); the *Entrepreneur (Scaling)-Only* heading says 10 and contains 5 (ES-A11–ES-A15). 80 + 70 + 70 = 220.

### D10. Heartbeat prompts: 48 delivered, 56 claimed

`Wing_All_Prompts_Copy_Final.md` Section 4 has six tracks × 8 prompts = 48: Undergraduate, Early Career, Mid-Career, Executive, Entrepreneur, Career Returner. The UX Recommendation and the emails both say "56 audience-specific heartbeat prompts (8 per track × 7 tracks)". One track is missing — most likely the entrepreneur split, since the entrepreneur heartbeat set is single while the micro-journal library splits entrepreneur three ways.

### D11. The audience-track list is inconsistent across three documents

- Micro-journal library summary table — 7 tracks: undergraduate, early career, mid-career, executive, entrepreneur (early), entrepreneur (fundraising), entrepreneur (scaling). **No career returner.**
- All Prompts Copy heartbeat sections — 6 tracks, **including career returner**, entrepreneur unsplit.
- Cards — 8 population tags, including `career_returner`, `mid_career_pivot` and `mid_career_advancement`, entrepreneur unsplit.

The platform needs one canonical list. This is the single most consequential unresolved item in the documents, because the tag set determines the schema, the prompt routing and the delivery adaptation.

### D12. The sub-tag question is already answered — by Danielle's own document

Danielle asked whether the tag system supports sub-tags. It does — `population_tags` is a free-form `text[]`, so any string works and no schema change is needed. More to the point, **the compendium already ships sub-tags**: `mid_career_pivot` on 31 cards, `mid_career_advancement` on 31, `career_returner` on 26. The three entrepreneur sub-tags she asked about (`entrepreneur_early`, `entrepreneur_scaling`, `entrepreneur_fundraising`) appear only in prose and delivery_adaptation text, never in a `populationTags` array.

So the answer to send back is: yes at the storage layer, already in use for three of them, and the real cost is not the tag column — it is that **nothing in the platform resolves population tags at runtime today** (see E4), and a student's stored status cannot produce 3 of the 8 tags at all.

### D13. IG-UX01 contradicts the agreed Feature List

IG-UX01: "Wing never shows modules as locked… every module is enterable at any time." Feature List §A2: "Forward progression remains locked until prerequisites are complete." Both are agreed client documents. The platform currently implements the Feature List — `session_status` has `locked` as a first-class enum value and there is a full-page "Session Locked" screen. Needs an explicit ruling, because it changes the schema, the dashboard and six client surfaces.

### D14. Routing rule R4 points at retired modules

R4 routes "Active job search → Enhancement B (Interview Prep)" and "Recruiter outreach pattern shift → Enhancement A (LinkedIn Strategy)". The UX Recommendation's own open question #2 notes that Module 10 replaces Enhancement B and Module 11 partially replaces its networking scope. R4 needs rewriting against the 11-module architecture.

### D15. Ten open questions are unresolved across the two UX documents

Five in the Comprehensive Recommendation (module naming, Enhancement A/C reconciliation, dashboard density, channel preference, career-returner status) and five in the Addendum (prompt-selection complexity, routing thresholds, enterprise aggregation timeline, executive delivery path, ES-10 visual measure). Three of these block build decisions: **Enhancement A/C reconciliation**, **career returner as tag vs. delivery_adaptation** (same question as D11), and **prompt-selection complexity** — although Danielle has already recommended the simple version for the last one, which we should take.

---

## 4. The clean-slate cost — for Danielle and Sam

"This replaces any existing methodology" is unambiguous, and the direction is right. But the platform's existing methodology layer is not a stub, and the decision should be made with the number in front of it.

**Superseded if the clean slate is taken as written:**

| What | Size | Status |
|---|---|---|
| `seed-objectives.ts` + objective rules/store/runtime/preview/routes | 2,040 lines | 3 objective sets, 21 objectives, all three Foundation sessions |
| Objectives admin editor | 441 lines | Danielle-editable, with version history and rollback |
| Completion criteria: seed + store + routes | 845 lines | 9 rows (3 populations × 3 sessions) |
| Completion criteria admin editor | ~571 lines | With replay against completed sessions |
| Analysis methodology: seed + store + routes | 602 lines | 9 rows, 45 sections, count-asserted |
| Analysis methodology admin editor | ~510 lines | |
| Three population prompt files | 139 KB | The live conversation prompts today |
| 36 intervention cards + 253 extracted heuristic cards | — | From the earlier extraction pass |

Roughly **6,400 lines of code and three admin editors**, all built in the last month, all specifically to get methodology out of code and into the database.

Two mitigations worth putting to them:

**The infrastructure is not wasted even if the content is.** The card/component/sequence tables, the version-history-and-rollback pattern, the admin editor shell and the seed-then-publish flow are exactly what v2 needs. What is superseded is the *content* (21 objectives, 9 criteria rows, 45 analysis sections) and the objective *renderer*, not the methodology-as-data architecture.

**The objective renderer was never validated.** `DELIVERABLES.md` scheduled that validation for Phase 3, after cutover; the flag `OBJECTIVE_RENDERER_POPULATIONS` is unset by default, so it has never run for a real student. Retiring an unvalidated system costs less than it looks. But the completion criteria and analysis methodology **are** live and load-bearing today — those are the ones to be careful about.

**Recommendation:** retire objectives and the renderer outright; keep completion criteria and analysis methodology running until v2 cards can produce the same session-end artifacts, then retire. Do not delete the tables — retire the rows, per the never-delete convention the schema already enforces.

---

## 5. Engineering gap analysis

All verified against the code.

### E1. The seven-component format has three homes and four holes

`heuristic_component_type` = `signal · intervention · coaching_move · outcome · module_mapping · population_context · notes`.

| v2 component | Home today |
|---|---|
| `signal` | `signal` — exact |
| `coaching_move` | `coaching_move` — exact |
| `success_criteria` | `outcome` — usable, narrower semantics |
| `detection_method` | **none** |
| `intervention_type` | **none** — `intervention` holds text, not a type |
| `delivery_adaptation` | **none** |
| `failure_path` | **none** |

Danielle's email guessed "the current API supports four componentType values"; it is seven, but only two match by name. Her offer to park the new three in `notes` would work mechanically and would make them invisible to the engine, which already ignores `notes`.

**Add four enum values.** `intervention_type` should probably be a *column* on `heuristics` rather than a component, since it is a single classifier per card, not versioned prose.

### E2. The engine reads three component types

`engine.ts` builds its detector prompt from `signal` only, and its guidance from `intervention` + `coaching_move`. So on a v2 card: `detection_method` (which specifies *how* to detect — keyword match, behavioural pattern, cross-session comparison), `delivery_adaptation` (the per-population and per-personality delivery rules) and `failure_path` (what to do when the intervention doesn't work, including which card to fire next) would all be imported and never read.

`delivery_adaptation` is the one that hurts most: it is where the seven audiences actually differ, and without it every population gets identical coaching language.

### E3. Integrity gates have no execution point — the biggest item

47 of 184 specifications are gates. They are structurally different from coaching cards: they fire on **Wing's output**, before delivery, with `intervention_type: META`.

- **No card-type discriminator.** `heuristics` has `status` (candidate/validated/retired) — a lifecycle, not a kind. No `is_gate`, no `card_type`. A parser would load gates as ordinary coaching cards and the engine would offer them to the detector as if they were signals to match against student turns.
- **No pre-delivery inspection anywhere.** `engine.ts` evaluates the student's turn only. The orchestrator is transport — its request type has no tools field and no post-processing hook. `authenticity.ts` is a real output checker but its only caller is LinkedIn content drafts; it never runs on a session turn.
- **The streaming path forecloses the obvious hook.** `foundation-sessions-routes.ts` writes tokens to the client inside the `for await` loop; the first place the whole reply exists is after the student has read it.

This needs a deliberate design decision, and there are three viable shapes:

1. **Prompt-side only** — compile the gates into the system prompt and accept that enforcement is probabilistic. Cheapest; no architecture change; no audit trail; H-309 (trust vault) would rest on the model's compliance.
2. **Buffer-then-inspect for gated surfaces** — stop streaming on turns where high-weight gates are active, inspect, then release. Real enforcement, measurable latency cost on exactly the surfaces where Wing is most conversational.
3. **Two-phase: stream a draft, inspect, correct in-stream** — most complex, best UX, most ways to go wrong.

My recommendation is **1 for most gates plus 2 for the small set where a violation is unrecoverable** — H-309 trust vault, H-916 experiment safety, IG-1102 third-party data privacy, H-005 sensitive context containment. Danielle's own framing supports this: "if the directive is strong, the gates fire rarely." Which gates get hard enforcement is a decision for her and Sam, not for engineering alone.

### E4. Population tags are stored but never resolved, and 3 of 8 cannot be produced

- `population_tags text[]` on `heuristics` — free-form, so all 8 tags store fine. No schema change needed.
- **Nothing resolves them at runtime.** `getSequenceCards` filters on sequence and `status != retired` only. Every card in a sequence enters the detector catalogue for every student regardless of tags. The only consumer anywhere is a client-side filter in the admin cards panel.
- `professional_status` has 4 values. Mapping to the 8 tags: `early_career` exact; `undergraduate` and `mid_career` lossy (each conflated with a second population); `career_returner` exists as `career_break_or_transition` but routes to the mid-career prompt set, so it has no distinct behaviour; **`executive`, `entrepreneur`, `mid_career_pivot` and `mid_career_advancement` have no source value at all.**

So the 83 cards tagged `executive` and the 83 tagged `entrepreneur` could never be selected for the right student, because the platform has no way to know a student is one.

### E5. Sequence weights are inert

`heuristic_sequence_entries.weight numeric(5,2)` exists, is written by the seeds, is editable in the admin UI, and is read by nothing at runtime. `engine.ts` has zero references to it; the detector orders cards by `position` and the model returns a single ID, so ties are resolved by the model. Both the store's doc comment ("higher means the engine prefers it when several match") and the admin label ("weight breaks ties") describe behaviour that does not exist.

The methodology uses weights meaningfully — 2.0 on H-309 trust vault and H-922 R6 null hypothesis specifically to make them pre-empt everything else. Those two cards being weight-2.0 is the mechanism by which the platform's most important safety rules win. Today they would not.

### E6. `prompt_library` is missing every field the new library needs

Seven columns: `id`, `category`, `prompt_text`, `population_tags`, `active`, `created_at`, `updated_at`. Of the five things v2 prompts need — behavioural-signal annotation, audience scope, event-sensitivity flag, cadence class, opener pool — **none exists**. Cadence is hardcoded (`daysRunning < 30 ? 5 : 7`). Every seeded row has empty `population_tags`, meaning "everyone".

### E7. Prompt selection is uniform random

`messaging-store.nextPrompt` selects all active prompts, subtracts those sent in the last 14 days, and returns `pool[Math.floor(Math.random() * pool.length)]`. Falls back to the full pool when everything is recent.

Against this, the addendum specifies: adaptive selection over a six-dimension per-user state estimate; nine routing rules with a 3-response minimum; withhold logic for crisis language, declining engagement and active fundraising; four signal-decay windows; per-population cadences and notification timing windows. **None of the substrate exists** — no state estimate, no engagement trend, no per-population cadence, no crisis detection, no decline detection.

`user_delivery_profiles` has the right shape to hold a state estimate (`observed_signals jsonb`, `confidence`, `last_evaluated_at`) and has zero readers or writers.

### E8. Modules 4–11 cannot be recorded

`modules` and `module_completions` do not exist — marked "Designed now, built in Tier 2" in the schema. `session_type` includes `module_run`, but it is never written by any code path and there is no module identifier on `sessions`, so nothing can say *which* module a `module_run` was. The admin, objective and criteria surfaces hardcode `["foundation_1","foundation_2","foundation_3"]`.

Eight of the eleven modules in the new methodology have no representation.

### E9. The voice layer is schema-only

`voice_profiles`, `voice_profile_components`, `user_delivery_profiles` all exist with **zero readers or writers**. `school_cycles.voice_profile_id` is a dangling FK nothing populates. The persona reaching the model is hardcoded string literals in three prompt files (42–51 KB each).

The new methodology puts substantial weight here: the system personality directive goes into *every* API call; IG-V01–V03 govern Wing's own language; `delivery_adaptation` on all 133 coaching cards needs a doorway concept; IG-V02 needs trait hierarchy by session context — and `voice_component_type` already has exactly the right enum values (`trait_hierarchy`, `tone_rule`, `language_principle`, `anti_pattern`, `calibration_example`, `delivery_doorway`) and `voice_context` the right contexts. The tables were designed for this and never wired.

### E10. Two UX gates are violated in the current client

**IG-UX01 (never show a locked module)** — 6 user-facing violations, including a full-page block in `foundation-session-chat.tsx` with a padlock icon and the heading "Session Locked", a padlock emoji in the sidebar, and 12 lock-state computations in `new-dashboard.tsx`. `session_status` has `locked` as a first-class enum value.

**IG-UX03 ("built" not "completed"; no bars, checkmarks, X-of-Y)** — 8+ user-facing violations: `label: "Completed"` with a `CheckCircle` in two status maps, a "Session Progress / 47%" progress bar, a `role="progressbar"` meter in the session rail, seven score bars in the freshness report, checkmark glyphs in the sidebar and module list. The dashboard's entire state model is completion-framed.

Both are contained, mechanical changes. IG-UX03's own failure path allows completion language to remain in the institutional admin dashboard, so the admin panel is out of scope — which is fortunate, because the funnel labels there are all "… Completed".

### E11. Radar has no substrate

No web-search-capable model call — `CompletionRequest` has no tools or retrieval field, and there is no search provider anywhere in the repo. No weekly per-user generated brief; the closest is the `life_log` sequence, which emails a randomly chosen prompt-library row and makes no model call at all. No intelligence archive.

Module 7's premise is "a single API call with web search enabled — no content database or RSS feeds to build." That is the right architecture and none of it is present.

### E12. What already fits

Worth stating, because it is more than nothing:

- The card/component/sequence tables, the versioning and never-delete conventions, and `card_code` all map cleanly.
- `numeric(5,2)` weight already accommodates 0.5–2.0.
- The eight NACE competencies in `nace-competencies.ts` match Module 8's framework.
- `session_artifacts` with typed `artifact_type` can hold module outputs.
- The admin editor pattern (draft → publish → version history → rollback) is exactly what 184 cards need.
- `user_heuristic_applications` already logs which card fired, with the component version — the audit trail the gates will need.
- Cycle-scoped publication via `school_cycles` gives the methodology-changes-between-cohorts guarantee for free.

---

## 6. Plan

Nine workstreams. W1–W3 are the spine; nothing downstream is worth much until they are done.

### W1 — Canonical card set (ingest and normalise)

Build a parser for the compendium's card-table format into the canonical shape, and resolve the document defects on the way in.

- Parse `## H-xxx` blocks → name, description, populationTags, 7 components, module, sequence weight, notes
- Dedupe the six repeated boilerplate blocks (D4)
- Resolve D1 (H-411), D2 (H-710), D3 (IG-U format) — needs Danielle's renumbering
- Emit a review artefact: card count per module, per population, per intervention type, so the count can be checked against the methodology before anything is seeded
- Keep the parser in the repo. This document set will be revised, and hand-transcribing 184 cards twice is not viable

**Depends on:** D1, D2, D3 answered. **Blocks:** everything else.

### W2 — Schema and resolution for v2 cards

- Add 4 `heuristic_component_type` values: `detection_method`, `delivery_adaptation`, `failure_path`, `success_criteria` (keep `outcome` for the existing scoring path or migrate it)
- Add `intervention_type` as a column on `heuristics` (enum: COACH, CHALLENGE, REDIRECT, REFRAME, AFFIRM, META)
- Add a card-kind discriminator distinguishing coaching cards from integrity gates
- Make `population_tags` resolve at runtime: filter `getSequenceCards` by the student's tags
- Decide the audience-track model (D11) and give students a field that can produce all 8 tags — either extend `professional_status` or add an `audience_track` alongside it
- Make `weight` consume: order the detector catalogue by weight, and let weight-2.0 cards pre-empt
- Wire `failure_path` as card-to-card routing rather than prose

**Depends on:** W1, D11. **Blocks:** W3, W4, W5.

### W3 — The gate engine

The architectural piece. Per E3, my recommendation:

- Compile all gates into the system prompt, grouped by module and context, from the database
- Add a buffered inspect-then-release path for the small set of unrecoverable gates (H-309, H-916, IG-1102, H-005), which means restructuring the turn path so those surfaces do not stream
- Log every gate evaluation to `user_heuristic_applications` so "did the gate fire" is answerable
- Implement H-003 (coaching intensity sequencing) as interaction-intensity tagging plus a history check — this needs a new column and is the one gate that is pure bookkeeping rather than output inspection

**Depends on:** W2, and a decision from Danielle and Sam on which gates get hard enforcement. **Blocks:** any module that carries gates, which is all of them.

### W4 — Prompt library v2 and the micro-journaling engine

- Extend `prompt_library`: behavioural signal, audience scope, event-sensitivity flag, cadence class, prompt code
- Add the opener pool as its own table, selected independently of the prompt
- Seed 220 micro-journal prompts + 48 heartbeat + 28 population prompts (D9/D10 first)
- Replace uniform-random selection with weighted selection under constraints — Danielle's recommended simple version, not Bayesian
- Add the per-user state estimate (`user_delivery_profiles` is the right home)
- Implement R1–R9 with the 3-response minimum, withhold logic, decay windows, per-population cadence
- IG-MJ01–06

**Depends on:** W2. **Independent of W3** — this is the workstream that can run in parallel.

### W5 — Module framework

- Build `modules` and `module_completions`
- Add a module identifier to `sessions`; start writing `module_run`
- Per-module sequences for 4–11 plus Reveal Cycle and Positioning Refresh
- Repeatability: multiple completions per student per module, with Wing referencing prior cycles

**Depends on:** W1, W2.

### W6 — Voice layer activation

- Seed `voice_profiles` / `voice_profile_components` from the personality directive and the Voice Guide, using the enum values already defined
- Read the voice profile in prompt assembly; publish per cohort via `school_cycles.voice_profile_id`
- Populate `user_delivery_profiles` with doorway selection
- IG-V01–V07

**Depends on:** W2, W3 (V04–V07 are output gates). Retires a large part of the three prompt files.

### W7 — UX gate compliance

- IG-UX01: remove locked states from user-facing surfaces; decide the fate of `session_status = locked` (D13)
- IG-UX03: replace completion language with creation language, remove user-facing bars/checkmarks/counters, leave the admin panel alone
- IG-UX02, IG-UX04–06: one recommendation, two-observation limit, three-part transitions, context-aware openings

**Depends on:** D13 ruling. Independent of everything else — can be done any time, and is the cheapest visible win.

### W8 — Wing Radar

- Web-search-capable model call (needs an orchestrator change: tools on `CompletionRequest`)
- Weekly per-user scheduled generation — depends on the scheduler from fix #5, still outstanding
- Five-component brief, multi-channel delivery, response capture from all channels
- Intelligence archive, fadeout protocol (H-709), cross-module synthesis (H-708)

**Depends on:** W2, W5, and the scheduler runtime.

### W9 — Retire the superseded methodology

Per Part 4: retire objectives and the renderer; hold completion criteria and analysis methodology until v2 produces equivalent session-end artifacts; retire rows, never delete tables.

**Depends on:** W1–W3 delivering working v2 cards.

---

## 7. Decisions needed before W1 starts

| # | Decision | Owner |
|---|---|---|
| 1 | Renumber `H-411` (gate vs exercise) and `H-710` (card vs gate) | Danielle |
| 2 | Canonical `IG-U0x` / `IG-U00x` format | Danielle |
| 3 | The definitive audience-track list — 6, 7 or 8, and whether entrepreneur splits three ways (D11) | Danielle |
| 4 | `H-706`/`H-707`/`H-210`/`H-408–410` — reserved or dropped? (D7) | Danielle |
| 5 | Exercise library — 16 or 17? (D6) | Danielle |
| 6 | Missing Entrepreneur (Early) prompt section and the two half-length sections (D9) | Danielle |
| 7 | Missing heartbeat track (D10) | Danielle |
| 8 | `Module9_Power_Influence_Source_Integrity.md` — send it | Danielle |
| 9 | Locked modules: IG-UX01 or Feature List §A2? (D13) | Danielle + Aditya |
| 10 | Which gates get hard enforcement vs prompt-only (E3) | Danielle + Sam |
| 11 | Accept the clean-slate cost, and whether completion criteria / analysis methodology stay live during transition (Part 4) | Aditya + Sam |
| 12 | Rewrite R4 against the 11-module architecture; resolve Enhancement A/C (D14, D15) | Danielle |

Items 1–8 are cheap for Danielle and unblock the parser. Items 9–12 are the ones worth a call.

---

## 8. What I would do first

**Start W1 now.** The parser is worth building before the answers arrive — it will surface further defects mechanically, and every subsequent revision of these documents needs it. Feed the review artefact back to Danielle alongside the twelve questions; the numbers will be more persuasive than the questions.

**Then W7,** because it is independent, mechanical, and the most visible thing a partner would notice.

**Then W2 → W3.** W3 is where the schedule risk lives. It is not a large amount of code, but it changes the shape of the turn path, and getting it wrong means either latency on every conversational surface or gates that are documented and unenforced. It deserves a design review before implementation, not after.

---

## Appendix — verification method

Card inventory, population tags, intervention types, component completeness, ID collisions and numbering gaps were extracted by parsing `Wing_Master_Module_Compendium-2.md` directly, distinguishing byte-identical duplicate blocks from genuine collisions by body hash. Prompt counts were taken from the two copy documents section by section. Engineering findings were verified against the repository at file and line level; every "absent" in Part 5 means a repo-wide search returned nothing, not that it was not found in the obvious place.

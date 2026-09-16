/**
 * Wing — post-migration data model
 * =================================
 * Drizzle realization of "SLI.pro / Wing — Database Structure & Schema
 * Specification" v1.0 (July 2026): 53 tables across 12 domains, built on the
 * thirteen-table architecture from the Wing Data Architecture spec.
 *
 * BUILD-LINE (spec §2.2). Each table below is annotated with its status:
 *   - "Build now"                  → created, populated and active at migration
 *   - "Provision now, activate later" → created now; pipeline activates on trigger
 *   - "Stub for later"             → schema defined, feature deferred
 *   - "Designed now — built in Tier 2" → NOT created here; added when the
 *     feature ships (positioning_scores, drift_submissions, sli_update_proposals,
 *     career_direction_suggestions, journal_entries, modules, module_completions,
 *     free_tier_assessments, phyllo_scores)
 *
 * NAMESPACE. These tables live in a dedicated `wing` Postgres schema rather
 * than `public`, because six names (users, sessions, documents, transactions,
 * freshness_reports, linkedin_optimizations) collide with live MVP tables that
 * the running application still depends on. The Phase 2 scripted migration
 * moves data across (spec §14) before the legacy `public` tables are dropped.
 *
 * CONVENTIONS (spec §3).
 *   - snake_case; PK is `id` bigint GENERATED ALWAYS AS IDENTITY unless noted
 *   - all timestamps are timestamptz (UTC); created_at defaults to now()
 *   - money is integer cents
 *   - versioning, never deletion: records retire/supersede; component rows
 *     carry is_current + supersedes_* lineage
 *   - every dual-origin table carries source_type
 *   - binaries live in Azure Blob and are referenced by URI
 */

import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  pgSchema,
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const wing = pgSchema("wing");

/** bigint identity PK, per spec §3. */
const id = () => bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity();
/** FK column helper — bigint to match identity PKs. */
const fk = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const tsNow = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

/* ══════════════════════════════════════════════════════════════════════════
 * 4. ENUMERATED TYPES  (spec §4)
 * ══════════════════════════════════════════════════════════════════════════ */

// 4.1 Identity
export const userRole = wing.enum("user_role", [
  "student", "advisor", "institution_admin", "platform_admin",
]);
export const userStatus = wing.enum("user_status", ["active", "suspended", "closed"]);
export const professionalStatus = wing.enum("professional_status", [
  "undergraduate_or_recent_grad", "early_career", "mid_career_or_senior",
  "career_break_or_transition",
]);
export const discoverySource = wing.enum("discovery_source", [
  "university_partnership", "colleague_or_mentor", "linkedin", "web_search",
  "professional_network_or_conference", "other",
]);
export const studentOrigin = wing.enum("student_origin", ["institutional", "direct"]);
export const enrollmentStatus = wing.enum("enrollment_status", [
  "prospective", "active", "graduated", "withdrawn",
]);
export const institutionStatus = wing.enum("institution_status", ["active", "inactive"]);
export const cycleStatus = wing.enum("cycle_status", ["active", "closed", "archived"]);
export const appointmentStatus = wing.enum("appointment_status", [
  "scheduled", "completed", "canceled",
]);

// 4.2 Methodology, classification and voice
export const heuristicStatus = wing.enum("heuristic_status", [
  "candidate", "validated", "retired",
]);
/**
 * Card components. The first seven predate the final methodology; the last four
 * arrive with it (migration 0019).
 *
 * v2 cards carry seven components and this enum held three of them by name.
 * All 182 cards in the compendium carry all seven with no omissions, so the four
 * added here are not edge cases — without them a v2 import stores four sevenths
 * of every card nowhere. `delivery_adaptation` matters most: it is where the
 * seven audiences differ, so losing it gives every population identical
 * coaching language.
 *
 * `outcome` and `success_criteria` are the same concept under two names for one
 * release. Post-session scoring reads `outcome` today; `outcome` retires with
 * the rest of the superseded methodology rather than being repointed inside a
 * migration that changes the enum. Order matters — ALTER TYPE ADD VALUE appends.
 */
export const heuristicComponentType = wing.enum("heuristic_component_type", [
  "signal", "intervention", "coaching_move", "outcome", "module_mapping",
  "population_context", "notes",
  "detection_method", "delivery_adaptation", "failure_path", "success_criteria",
]);

/**
 * What a card does to the conversation.
 *
 * A column on `heuristics` rather than a component row: one classifier per card
 * is a single fact, not versioned prose, and the engine needs it on every turn
 * without a JOIN and a version walk.
 *
 * SEVEN values. An earlier inventory of the compendium found six and missed
 * `GATE`, which 19 cards declare — every `IG-*` gate in Modules 10 and 11 plus
 * all six universal `IG-U` gates. An enum built from the six-value list rejects
 * them at seed time. Found by `parse-compendium.ts`.
 */
export const heuristicInterventionType = wing.enum("heuristic_intervention_type", [
  "COACH", "CHALLENGE", "REDIRECT", "REFRAME", "AFFIRM", "META", "GATE",
  // ELICIT and OBSERVE arrived with the intake module on 18 August 2026 — the
  // questions and the reveals. Both are deliberately not COACH: intake leads with
  // ENCOURAGING and CURIOUS and does not coach, which is the difference between
  // this module and the 18-question assessment it replaces. Migration 0022.
  "ELICIT", "OBSERVE",
  // EDUCATE (Module 13's diagnostic layer) and SAFETY_OVERRIDE (IG-RC01, the
  // Reveal Cycle's safety pre-pass) arrived with the 16 September parse of those
  // two documents. Migration 0049. SAFETY_OVERRIDE normalises the document's
  // "SAFETY OVERRIDE" — the only value here whose token is not verbatim, and the
  // parser keeps the original.
  "EDUCATE", "SAFETY_OVERRIDE",
]);

/**
 * What KIND of card a row is — the discriminator the engine was missing.
 *
 * `status` is candidate/validated/retired, a lifecycle. Nothing said whether a
 * card fires on the student's turn or on Wing's own output, and the difference
 * is not cosmetic:
 *
 *   coaching_card   fires on the STUDENT's turn. What the detector matches.
 *   integrity_gate  fires on WING's OUTPUT, before delivery. Must never enter
 *                   the detector catalogue — a gate's signal describes something
 *                   Wing is about to say, so offering it to the detector asks
 *                   the model to match Wing's rules against the student's words.
 *   exercise        routed to by explicit reference from another card's
 *                   coaching_move, not by signal match. Which is why all 19
 *                   exercise-library cards state no sequence weight: they are
 *                   not in the precedence ordering because they are not
 *                   competing to fire.
 *
 * 54 of the 184 specifications are gates. Without this column a v2 import loads
 * all 54 as student-turn signals.
 */
export const heuristicCardKind = wing.enum("heuristic_card_kind", [
  "coaching_card", "integrity_gate", "exercise",
]);
export const sequenceOwnerType = wing.enum("sequence_owner_type", ["school_cycle", "student"]);
export const classifierTask = wing.enum("classifier_task", [
  "turn_typing", "signal_prefilter", "routing",
]);
export const classifierComponentType = wing.enum("classifier_component_type", [
  "rules", "examples",
]);
export const publishStatus = wing.enum("publish_status", ["draft", "published", "retired"]);
export const voiceComponentType = wing.enum("voice_component_type", [
  "trait_hierarchy", "tone_rule", "language_principle", "anti_pattern",
  "calibration_example", "delivery_doorway",
]);
export const voiceContext = wing.enum("voice_context", [
  "intake", "foundation_session", "ongoing_engagement", "setback", "notification",
]);

// 4.3 Sessions and provenance
export const sessionType = wing.enum("session_type", [
  "intake", "foundation_1", "foundation_2", "foundation_3",
  "enhancement_a", "enhancement_b", "enhancement_c",
  "ongoing_engagement", "career_event_review", "module_run",
  /*
   * One value per module, and one for the Reveal Cycle — migration 0050.
   *
   * `applies_to_session` on a sequence entry reuses this enum, and until now
   * every module from 4 to 13 shared `module_run`. That was survivable while
   * only Foundation was deployed; with 105 coaching cards across those modules
   * it would put Module 9's power cards and Module 10's interview cards in
   * front of the detector during a Module 4 session, at a peak load of 105
   * against a hard limit of 40.
   *
   * `module_12` is absent on purpose — reserved and unassigned. `module_run`
   * stays because `sessions.session_type` stores it on real rows.
   */
  "module_4", "module_5", "module_6", "module_7", "module_8", "module_9",
  "module_10", "module_11", "module_13", "reveal_cycle",
]);
export const sessionStatus = wing.enum("session_status", [
  "locked", "available", "in_progress", "completed", "ended_early",
]);
export const transcriptStatus = wing.enum("transcript_status", [
  "complete", "incomplete", "migrated_provenance_unknown",
]);
/** ★ Fifth value `ai_adapted` adopted in architecture review: the AI turn
 *  immediately following a human_correction. Captured from day one; the
 *  scoring logic that consumes it is a Tier 2 refinement. */
export const turnType = wing.enum("turn_type", [
  "ai_prompt", "human_elicited_response", "human_spontaneous",
  "human_correction", "ai_adapted",
]);
/** Unchanged by the review — ai_adapted turns carry `ai_generated`. */
export const provenanceTag = wing.enum("provenance_tag", [
  "ai_generated", "human_elicited", "human_spontaneous", "human_correction",
  "provenance_unknown",
]);
export const classificationStatus = wing.enum("classification_status", [
  "provisional", "classified", "hand_tagged",
]);
export const classifierActor = wing.enum("classifier_actor", ["rule", "nano", "human"]);
export const captureChannel = wing.enum("capture_channel", [
  "in_app", "voice", "email_reply", "sms_reply", "legacy_import",
]);
export const artifactType = wing.enum("artifact_type", [
  "functional_identity", "credibility_assessment", "signature_story",
  "module_outcome", "intake_summary", "advisor_snapshot", "wing_summary",
]);
/** Required on every dual-origin table (spec §3). */
export const sourceType = wing.enum("source_type", ["human_originated", "ai_generated"]);
export const outcomeSignal = wing.enum("outcome_signal", [
  "breakthrough", "positive", "neutral", "regression", "correction",
]);
/**
 * Whether a gate finding IS a breach, or only means the rule now applies.
 *
 * H-109's "your function is Marketing" is a breach outright. H-002's "you
 * mentioned" is not — it signals a cross-session reference, at which point
 * provenance is required. Recording the second as a breach would make every
 * legitimate callback a violation.
 */
export const gateFindingMode = wing.enum("gate_finding_mode", ["violation", "review"]);
export const patternStatus = wing.enum("pattern_status", [
  "pending_review", "accepted", "rejected", "authored",
]);

// 4.4 Artifacts, engagement and commerce
export const sliSource = wing.enum("sli_source", ["generated", "custom", "refined", "refresh"]);
export const sliStatus = wing.enum("sli_status", [
  "candidate", "selected", "active", "superseded",
]);
export const documentType = wing.enum("document_type", [
  "resume", "linkedin", "essay", "assessment", "certificate", "other",
]);
export const careerPathway = wing.enum("career_pathway", ["employment", "venture", "freelance"]);
export const verificationStatus = wing.enum("verification_status", [
  "pending", "verified", "failed",
]);
export const entryType = wing.enum("entry_type", ["career", "personal"]);
export const promptCategory = wing.enum("prompt_category", [
  "career", "personal", "content", "education", "encouragement", "fun",
  "design_thinking",
]);
export const messageChannel = wing.enum("message_channel", ["email", "sms", "in_app"]);
export const messageDirection = wing.enum("message_direction", ["outbound", "inbound"]);
export const sequenceStatus = wing.enum("sequence_status", [
  "active", "paused", "completed", "silenced",
]);
export const contentDraftType = wing.enum("content_draft_type", ["post", "article"]);
export const contentStatus = wing.enum("content_status", ["draft", "final", "published"]);

/** Wing_Content_System_v1 (H-620–624). Five trigger types, not the same set as
 *  contentDraftType (post/article) — comment, DM and connection-request are
 *  one-off responses that never go through the draft→final→published pipeline
 *  `content_drafts` models, so they need their own vocabulary. */
export const contentTriggerType = wing.enum("content_trigger_type", [
  "comment", "post", "article", "dm", "connection_request",
]);
/** What content_activity_log records about one interaction. `coaching_round`
 *  is what IG-M6-05 counts to enforce its 3-round cap. */
export const contentActivityEventType = wing.enum("content_activity_event_type", [
  "trigger_fired", "trigger_declined", "coaching_round", "draft_started",
  "draft_abandoned", "published",
]);
/** H-701 (Baby Radar): what Wing suggests doing with a surfaced topic. */
export const radarSuggestedAction = wing.enum("radar_suggested_action", [
  "comment", "post", "save_for_later",
]);
export const planAudience = wing.enum("plan_audience", ["institutional", "direct"]);
export const billingType = wing.enum("billing_type", ["one_time", "subscription", "license"]);
export const entitlementSource = wing.enum("entitlement_source", [
  "purchase", "institutional_license",
]);
export const entitlementStatus = wing.enum("entitlement_status", [
  "active", "expired", "canceled",
]);
export const paymentStatus = wing.enum("payment_status", [
  "pending", "succeeded", "failed", "refunded",
]);
/** Used by Tier 2 proposal tables; defined now so they add without a type change. */
export const proposalResponse = wing.enum("proposal_response", [
  "accepted", "declined", "deferred",
]);

/* ══════════════════════════════════════════════════════════════════════════
 * 6. IDENTITY, INSTITUTIONS AND PEOPLE  (spec §6)
 *
 * Separates the authentication identity (`users`) from the coaching entity
 * (`students`). Every coaching-side table keys on students.id.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Build now · Authentication identity for every human on the platform. */
export const users = wing.table("users", {
  id: id(),
  externalId: uuid("external_id").notNull().unique().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // NULL for LinkedIn-only accounts
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phoneNumber: text("phone_number"), // E.164; SMS requires verified opt-in
  role: userRole("role").notNull().default("student"),
  /*
   * The institution an ADMINISTRATOR belongs to — the scope of what they may
   * see. Not a student's binding: that lives on `students.institution_id`, and
   * duplicating it here would give the same fact two homes.
   *
   *   platform_admin    NULL → unrestricted (SLI.pro staff)
   *   institution_admin set  → that institution only
   *                     NULL → nothing. Fail closed; see migration 0018.
   *   advisor           set  → mirrors `advisors.institution_id`
   *   student           NULL → unused
   */
  institutionId: fk("institution_id").references((): AnyPgColumn => institutions.id),
  linkedinId: text("linkedin_id").unique(),
  linkedinAccessToken: text("linkedin_access_token"), // encrypted at rest
  linkedinRefreshToken: text("linkedin_refresh_token"),
  linkedinTokenExpiry: ts("linkedin_token_expiry"),
  professionalStatus: professionalStatus("professional_status"),
  discoverySource: discoverySource("discovery_source"),
  discoverySourceOther: text("discovery_source_other"),
  // IANA zone; drives per-user scheduling (daily prompt at 8:00 local)
  timezone: text("timezone").notNull().default("America/New_York"),
  isTestUser: boolean("is_test_user").notNull().default(false),
  /** Lets an account use `applyCheckpoint` (`checkpoint-store.ts`) WITHOUT
   *  being excluded from the real behavioral corpus the way `isTestUser`
   *  is — for a real staff account (Danielle's own) that wants the
   *  fast-forward convenience on itself without opting its own real
   *  coaching data out of analysis. Independent of `isTestUser`: a seeded
   *  persona never needs this (it already has `isTestUser`), and a real
   *  student never gets it. See `checkpoint-store.ts`'s own doc comment. */
  allowManualCheckpoints: boolean("allow_manual_checkpoints").notNull().default(false),
  status: userStatus("status").notNull().default("active"),
  lastLoginAt: ts("last_login_at"),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
}, (t) => ({
  emailLowerIdx: uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`),
}));
// Note: subscription columns do NOT carry forward here; commercial state lives
// in `entitlements` (spec §13), keeping pricing configurable.

/** Build now · Server-side HTTP session store (connect-pg-simple). */
export const userSessions = wing.table("user_sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: ts("expire").notNull(),
}, (t) => ({
  expireIdx: index("user_sessions_expire_idx").on(t.expire),
}));

/** Build now · Single-use password-reset tokens. */
export const passwordResets = wing.table("password_resets", {
  id: id(),
  userId: fk("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: tsNow("created_at"),
});

/** Build now · Channel consent and scheduling state. Email/in-app default,
 *  SMS strictly opt-in (spec §2.1 channel strategy). */
export const userChannelPreferences = wing.table("user_channel_preferences", {
  userId: fk("user_id").primaryKey().references(() => users.id),
  emailOptIn: boolean("email_opt_in").notNull().default(true),
  smsOptIn: boolean("sms_opt_in").notNull().default(false),
  smsVerifiedAt: ts("sms_verified_at"),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
  microPromptsPaused: boolean("micro_prompts_paused").notNull().default(false),
  preferredChannel: messageChannel("preferred_channel").notNull().default("email"),
  dailyPromptHourLocal: smallint("daily_prompt_hour_local").notNull().default(8),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
});

/** Build now · Stable partner-school data; unchanged when a cohort starts. */
export const institutions = wing.table("institutions", {
  id: id(),
  name: text("name").notNull(),
  country: text("country").notNull(), // 'US' for every Tier 1 row
  populationTags: text("population_tags").array().notNull().default(sql`'{}'`),
  primaryContactName: text("primary_contact_name"),
  primaryContactEmail: text("primary_contact_email"),
  /**
   * Email domains that identify this institution's students, e.g.
   * {berkeley.edu, vanderbilt.edu}.
   *
   * Without this nothing ever set students.institution_id: registration creates
   * every account as origin='direct' with a NULL institution, so cohort
   * reporting for a partner returned zero however many of their students had
   * signed up. Matching on the registration domain is both the natural
   * definition of an institutional student and the only signal available
   * without asking them.
   */
  emailDomains: text("email_domains").array().notNull().default(sql`'{}'`),
  status: institutionStatus("status").notNull().default("active"),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
});

/** Build now · Institution × cohort — the governance point at which
 *  methodology, classifier and voice versions publish. Nothing changes
 *  mid-cycle; edits happen in the evaluation window. */
export const schoolCycles = wing.table("school_cycles", {
  id: id(),
  institutionId: fk("institution_id").notNull().references(() => institutions.id),
  cycleYear: smallint("cycle_year").notNull(),
  label: text("label"), // multiple cohorts per institution-year
  cohortStartDate: date("cohort_start_date").notNull(),
  cohortEndDate: date("cohort_end_date").notNull(),
  activeHeuristicSequenceId: fk("active_heuristic_sequence_id")
    .references((): AnyPgColumn => heuristicSequences.id),
  classifierPromptId: fk("classifier_prompt_id")
    .references((): AnyPgColumn => classifierPrompts.id), // ★ review addition
  voiceProfileId: fk("voice_profile_id")
    .references((): AnyPgColumn => voiceProfiles.id), // ★ review addition
  evaluationWindowStart: date("evaluation_window_start"),
  evaluationWindowEnd: date("evaluation_window_end"),
  status: cycleStatus("status").notNull().default("active"),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
}, (t) => ({
  institutionYearIdx: index("school_cycles_institution_year_idx").on(t.institutionId, t.cycleYear),
}));

/** Build now · Per-institution academic calendar driving touchpoint messages. */
export const institutionCalendarEvents = wing.table("institution_calendar_events", {
  id: id(),
  institutionId: fk("institution_id").notNull().references(() => institutions.id),
  label: text("label").notNull(),
  eventDate: date("event_date").notNull(),
  templateKey: text("template_key"),
  active: boolean("active").notNull().default(true),
  createdAt: tsNow("created_at"),
}, (t) => ({
  institutionDateIdx: index("institution_calendar_events_inst_date_idx").on(t.institutionId, t.eventDate),
}));

/** Build now · Career advisors. Tier 1 advisors receive snapshots by email and
 *  need no login; the optional users link enables a later advisor portal. */
export const advisors = wing.table("advisors", {
  id: id(),
  institutionId: fk("institution_id").notNull().references(() => institutions.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  userId: fk("user_id").references(() => users.id),
  active: boolean("active").notNull().default(true),
  createdAt: tsNow("created_at"),
}, (t) => ({
  institutionEmailUnique: uniqueIndex("advisors_institution_email_unique").on(t.institutionId, t.email),
}));

/** Build now · Advising appointments. Registration fires the student prep
 *  prompt; the T-24h job sends the advisor snapshot. */
export const advisorAppointments = wing.table("advisor_appointments", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  advisorId: fk("advisor_id").notNull().references(() => advisors.id),
  scheduledAt: ts("scheduled_at").notNull(),
  registeredAt: tsNow("registered_at"),
  snapshot: jsonb("snapshot"), // immutable copy of what was sent (audit)
  snapshotSentAt: ts("snapshot_sent_at"),
  studentPromptSentAt: ts("student_prompt_sent_at"),
  status: appointmentStatus("status").notNull().default("scheduled"),
  createdAt: tsNow("created_at"),
});

/** Build now · The coaching entity. personal_sequence_id stays NULL until
 *  graduation; the graduate-loop logic that instantiates it is deferred. */
export const students = wing.table("students", {
  id: id(),
  userId: fk("user_id").notNull().unique().references(() => users.id),
  institutionId: fk("institution_id").references(() => institutions.id), // NULL for direct/B2C
  cycleId: fk("cycle_id").references(() => schoolCycles.id),
  origin: studentOrigin("origin").notNull().default("institutional"),
  enrollmentStatus: enrollmentStatus("enrollment_status").notNull().default("active"),
  graduationDate: date("graduation_date"),
  /**
   * When their internship began — the anchor for the 30- and 60-day milestone
   * messages (B3 E2). NULL for most students, which simply means those
   * messages never fire.
   *
   * Set explicitly rather than inferred from a life log entry: guessing "I
   * started my internship" from prose would send real emails on an inference,
   * and a milestone landing three weeks early is worse than one that never
   * lands at all.
   */
  internshipStartDate: date("internship_start_date"),
  /**
   * Onboarding wizard progress. Was `public.profiles` (completion_step,
   * is_complete) — two columns behind a whole legacy table.
   *
   * It had to move: registration creates a `wing.users` row, but
   * `public.profiles.user_id` has a foreign key to `public.users`, so every
   * new registration failed on that constraint. Migrated users have rows in
   * both tables, which is exactly why it went unnoticed — the only people who
   * hit it were people signing up, and everyone testing was already migrated.
   */
  onboardingStep: integer("onboarding_step").notNull().default(0),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  // Stays NULL until graduation, exactly per the spec; instantiated by the
  // graduate loop (logic deferred).
  personalSequenceId: fk("personal_sequence_id")
    .references((): AnyPgColumn => heuristicSequences.id),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
}, (t) => ({
  institutionCycleIdx: index("students_institution_cycle_idx").on(t.institutionId, t.cycleId),
}));

/* ══════════════════════════════════════════════════════════════════════════
 * 7. METHODOLOGY, CLASSIFICATION AND VOICE  (spec §7)
 *
 * "Code the engine, not the heuristics." Three card families share one
 * pattern: a parent record, typed component rows that version independently,
 * and never-delete semantics. The orchestrator composes each prompt from the
 * heuristic intervention (what to say), the voice profile (how to say it) and
 * the student's context and memory.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Build now · Parent card record. Never deleted, only retired. */
export const heuristics = wing.table("heuristics", {
  id: id(),
  /**
   * Stable identifier, safe to reference from elsewhere.
   *
   * Cards had only `id` and `name`. Numeric ids are meaningless in a definition
   * a human has to read, and names change the moment the methodology owner
   * rewords a card in the editor she already has — so anything referring to a
   * card had nothing it could safely bind to.
   *
   * The first consumer was the objective set, retired in Tier 1 part 4. The
   * reason outlived it: sequence entries, gate audit findings and the v2 cards
   * all point at this column, and the thing other records point at must survive
   * rewording, because the alternative is a reference that breaks silently and
   * renders as nothing.
   */
  cardCode: text("card_code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  versionNumber: integer("version_number").notNull().default(1),
  populationTags: text("population_tags").array().notNull().default(sql`'{}'`),
  status: heuristicStatus("status").notNull().default("candidate"),
  /** Nullable: the 253 pre-v2 extracted cards were never classified. */
  interventionType: heuristicInterventionType("intervention_type"),
  /**
   * Defaults to coaching_card, which is correct rather than merely convenient —
   * every pre-v2 card came out of the prompt files as student-turn coaching.
   */
  cardKind: heuristicCardKind("card_kind").notNull().default("coaching_card"),
  createdAt: tsNow("created_at"),
  modifiedAt: tsNow("modified_at"),
}, (t) => ({
  // "which non-retired cards in this sequence may fire on a student turn" is
  // asked on every turn, and it is now two columns wide.
  kindStatusIdx: index("heuristics_kind_status_idx").on(t.cardKind, t.status),
}));

/** Build now · The seven components as rows, not columns. A refinement
 *  inserts a new row and flips the prior row's is_current to false. */
/**
 * How a self-description came to be said. Her three values, and only hers.
 *
 * `coached` is reserved: it cannot occur during intake, which is the whole point
 * of intake as a baseline, but downstream modules will need it and a value added
 * later is a migration on a table with rows in it.
 */
export const selfDescriptionProvenance = wing.enum("self_description_provenance", [
  "spontaneous", "elicited", "coached",
]);

/**
 * Whether the prompt that produced a description IS the question it is filed under.
 *
 * Today's intake asks thirteen beats of its own, and two of them are near-misses for
 * two of Danielle's questions rather than the same question:
 *
 *   Q6 asks for a capability a resume does not show. Our `proud_of` asks for
 *   something they did and are quietly pleased with. Related, not identical.
 *   Q7 asks what they would change about how they are perceived. Our
 *   `self_perception` asks how they think they are seen.
 *
 * Filing those as Q6 and Q7 with no qualifier would overclaim; filing them as
 * nothing would throw away the only pre-coaching self-descriptions we can capture
 * before her question set is built. So they are filed under her identifier and
 * marked `approximate`, and a downstream reader that needs clean data filters on
 * `exact`. Once her questions are live every row is exact and this column stops
 * mattering.
 */
export const selfDescriptionEquivalence = wing.enum("self_description_equivalence", [
  "exact", "approximate",
]);

/**
 * Build now · The user's own words about themselves, one row per utterance.
 *
 * Intake is the only time Wing sees a user describe themselves before Wing has
 * taught them any language for it, and that reference point cannot be
 * reconstructed afterwards — so capture starts before the feature that reads it
 * exists. Wing's own output never goes in here; storing it beside the user's words
 * would contaminate the baseline. See migration 0023 for the reasoning in full.
 */
export const selfDescriptions = wing.table("self_descriptions", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  sessionId: fk("session_id").notNull().references(() => sessions.id),
  /** Her `timestamp` field: when the response was given. */
  capturedAt: tsNow("captured_at"),
  /** "intake" for now. Text, because other modules will feed this later. */
  sourceModule: text("source_module").notNull(),
  /**
   * Her question identifier — Q2, Q6, Q7, reveal_reaction — or NULL.
   *
   * NULL is a statement, not a gap: today's intake asks thirteen beats that are
   * not her question set, and a row claiming to be "Q5" while answering something
   * else would corrupt the convergence comparison this table exists to support.
   */
  sourceQuestion: text("source_question"),
  /** What was actually asked: the beat key today, the card code after the rebuild. */
  askedAs: text("asked_as").notNull(),
  /**
   * Whether `asked_as` IS `source_question`. See the enum.
   *
   * Nullable, and null exactly when `source_question` is: an equivalence is a
   * property of a PAIRING, so it cannot exist when there is nothing to pair with.
   * A row whose prompt matches none of her questions carries `asked_as` alone.
   */
  equivalence: selfDescriptionEquivalence("equivalence"),
  /** The user's exact words, unmodified. Never Wing's. */
  verbatimText: text("verbatim_text").notNull(),
  provenance: selfDescriptionProvenance("provenance").notNull(),
}, (t) => ({
  studentIdx: index("self_descriptions_student_idx").on(t.studentId, t.capturedAt),
  questionIdx: index("self_descriptions_question_idx")
    .on(t.studentId, t.sourceQuestion, t.capturedAt),
}));

export const heuristicComponents = wing.table("heuristic_components", {
  id: id(),
  heuristicId: fk("heuristic_id").notNull().references(() => heuristics.id),
  componentType: heuristicComponentType("component_type").notNull(),
  content: text("content").notNull(),
  versionNumber: integer("version_number").notNull().default(1),
  isCurrent: boolean("is_current").notNull().default(true),
  supersedesComponentId: fk("supersedes_component_id")
    .references((): AnyPgColumn => heuristicComponents.id), // version lineage
  createdAt: tsNow("created_at"),
}, (t) => ({
  lookupIdx: index("heuristic_components_lookup_idx")
    .on(t.heuristicId, t.componentType, t.isCurrent),
  currentIdx: index("heuristic_components_current_idx")
    .on(t.heuristicId).where(sql`${t.isCurrent}`),
}));

/** Build now · Ordered, weighted set active for a cycle or an individual.
 *  Superseded, never deleted. owner_type/owner_id is the one deliberate
 *  polymorphic reference in the schema, validated at the service layer. */
export const heuristicSequences = wing.table("heuristic_sequences", {
  id: id(),
  ownerType: sequenceOwnerType("owner_type").notNull(),
  ownerId: fk("owner_id").notNull(), // no FK by design (polymorphic)
  versionNumber: integer("version_number").notNull().default(1),
  activeFrom: ts("active_from").notNull(),
  supersededAt: ts("superseded_at"),
  createdAt: tsNow("created_at"),
}, (t) => ({
  ownerIdx: index("heuristic_sequences_owner_idx").on(t.ownerType, t.ownerId, t.supersededAt),
}));

/** Build now · The spec's "ordered heuristic list with weights", realized as a
 *  child table for referential integrity and queryability. */
export const heuristicSequenceEntries = wing.table("heuristic_sequence_entries", {
  id: id(),
  sequenceId: fk("sequence_id").notNull().references(() => heuristicSequences.id),
  heuristicId: fk("heuristic_id").notNull().references(() => heuristics.id),
  position: smallint("position").notNull(),
  weight: numeric("weight", { precision: 5, scale: 2 }).notNull().default("1.0"),
  /**
   * Which session this entry fires in. NULL = every session (migration 0020).
   *
   * The compendium publishes three Foundation sequence maps but the schema has
   * one active sequence per cycle, so all 53 Tier 1 cards live in one sequence
   * and this column is what keeps a Foundation 1 student from being offered
   * H-201, the Foundation 2 credibility test.
   *
   * On the ENTRY rather than the card because it is a deployment decision, like
   * `position` and `weight` beside it: the same card may be deployed in more
   * than one session, and the methodology owner's sequence decides where. NULL
   * covers the 18 universal and voice gates that apply wherever Wing speaks.
   */
  appliesToSession: sessionType("applies_to_session"),
}, (t) => ({
  positionUnique: uniqueIndex("heuristic_sequence_entries_position_unique").on(t.sequenceId, t.position),
  heuristicUnique: uniqueIndex("heuristic_sequence_entries_heuristic_unique").on(t.sequenceId, t.heuristicId),
  sessionIdx: index("heuristic_sequence_entries_session_idx").on(t.sequenceId, t.appliesToSession),
}));

/** Build now · ★ Review addition. Versioned classifier definition; Tier 1
 *  ships turn typing for the Nano classifier. Classification is asynchronous:
 *  the deterministic rule tags provisionally with zero added latency, then the
 *  Nano classifier reclassifies within seconds via Service Bus. */
export const classifierPrompts = wing.table("classifier_prompts", {
  id: id(),
  name: text("name").notNull(),
  task: classifierTask("task").notNull().default("turn_typing"),
  versionNumber: integer("version_number").notNull().default(1),
  status: publishStatus("status").notNull().default("draft"),
  createdAt: tsNow("created_at"),
  modifiedAt: tsNow("modified_at"),
});

/** Build now · ★ Review addition. Rules (rarely change) and examples (grow
 *  with the hand-tagged corpus) version independently. */
export const classifierPromptComponents = wing.table("classifier_prompt_components", {
  id: id(),
  classifierPromptId: fk("classifier_prompt_id").notNull().references(() => classifierPrompts.id),
  componentType: classifierComponentType("component_type").notNull(),
  // rules: instruction text + label definitions.
  // examples: { turn_text, label, rationale }
  content: jsonb("content").notNull(),
  // Provenance for examples drawn from the hand-tagged gold-standard corpus.
  sourceTurnId: fk("source_turn_id").references((): AnyPgColumn => transcriptTurns.id),
  versionNumber: integer("version_number").notNull().default(1),
  isCurrent: boolean("is_current").notNull().default(true),
  createdAt: tsNow("created_at"),
}, (t) => ({
  lookupIdx: index("classifier_prompt_components_lookup_idx")
    .on(t.classifierPromptId, t.componentType, t.isCurrent),
}));

/** Build now · ★ Review addition. Wing's persona, versioned and published per
 *  cohort — personality evolves deliberately, never mid-cycle. */
export const voiceProfiles = wing.table("voice_profiles", {
  id: id(),
  name: text("name").notNull(),
  versionNumber: integer("version_number").notNull().default(1),
  status: publishStatus("status").notNull().default("draft"),
  notes: text("notes"),
  createdAt: tsNow("created_at"),
  publishedAt: ts("published_at"),
  supersededAt: ts("superseded_at"),
});

/** Build now · ★ Review addition. The Voice Guide as typed records. The
 *  doorway set (ego-driven, anxious, analytical, conflict-avoidant) is data,
 *  not an enum — what adapts is the doorway, never the conclusion. */
export const voiceProfileComponents = wing.table("voice_profile_components", {
  id: id(),
  voiceProfileId: fk("voice_profile_id").notNull().references(() => voiceProfiles.id),
  componentType: voiceComponentType("component_type").notNull(),
  context: voiceContext("context"), // trait hierarchies vary by context
  content: jsonb("content").notNull(),
  versionNumber: integer("version_number").notNull().default(1),
  isCurrent: boolean("is_current").notNull().default(true),
  createdAt: tsNow("created_at"),
}, (t) => ({
  lookupIdx: index("voice_profile_components_lookup_idx")
    .on(t.voiceProfileId, t.componentType, t.isCurrent),
}));

/** Build now · ★ Review addition. Per-student adaptive-delivery state: the
 *  structured half of prompt assembly (how to speak to this person), where
 *  embeddings are the content half (what to recall). Signals derive from
 *  human-originated turns only. */
export const userDeliveryProfiles = wing.table("user_delivery_profiles", {
  studentId: fk("student_id").primaryKey().references(() => students.id),
  observedSignals: jsonb("observed_signals").notNull().default(sql`'{}'::jsonb`),
  currentDoorwayComponentId: fk("current_doorway_component_id")
    .references(() => voiceProfileComponents.id),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  lastEvaluatedAt: ts("last_evaluated_at"),
  updatedAt: tsNow("updated_at"),
});

/* ══════════════════════════════════════════════════════════════════════════
 * 8. SESSIONS, TRANSCRIPTS AND TURN-LEVEL PROVENANCE  (spec §8)
 *
 * The architectural centrepiece and the least reversible part of the schema.
 * The unit of storage is the turn, not the transcript. Every turn carries its
 * type and human/AI provenance from the moment of capture. Human-originated
 * turns are behavioural signal (scoring, pattern detection, memory);
 * AI-generated turns are recorded for completeness but excluded from memory
 * and from any future training corpus.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Build now · Parent record for each Wing interaction, in-session and
 *  between-session alike. Forward-locking and prerequisites are engine logic,
 *  not schema: completed sessions stay revisitable, Enhancement Modules
 *  default to available and are skippable in any order. */
export const sessions = wing.table("sessions", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  cycleId: fk("cycle_id").references(() => schoolCycles.id), // NULL post-graduation / direct
  sessionType: sessionType("session_type").notNull(),
  status: sessionStatus("status").notNull().default("available"),
  startedAt: ts("started_at"),
  completedAt: ts("completed_at"),
  timerElapsedSeconds: integer("timer_elapsed_seconds").notNull().default(0),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
}, (t) => ({
  studentTypeIdx: index("sessions_student_type_idx").on(t.studentId, t.sessionType),
  studentCreatedIdx: index("sessions_student_created_idx").on(t.studentId, t.createdAt),
}));

/** Build now · One transcript per session; carries migration status.
 *  `migrated_provenance_unknown` marks the Replit corpus, held separately and
 *  feeding pattern analysis only until reviewed. */
export const transcripts = wing.table("transcripts", {
  id: id(),
  sessionId: fk("session_id").notNull().unique().references(() => sessions.id),
  status: transcriptStatus("status").notNull().default("incomplete"),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
});

/** Build now · THE SEPARATION MECHANISM.
 *
 *  Turn typing at capture follows the deterministic rule (spec §8):
 *    - prior turn was ai_prompt          → human_elicited_response
 *    - otherwise                          → human_spontaneous
 *    - turn after a human_correction      → ai_adapted ★
 *  That assigns a provisional tag synchronously with zero added latency; the
 *  Nano classifier refines it asynchronously within seconds via Service Bus.
 *  classification_status / classified_by / classifier_prompt_id make every
 *  label auditable and let the tagging upgrade without a schema change. */
export const transcriptTurns = wing.table("transcript_turns", {
  id: id(),
  transcriptId: fk("transcript_id").notNull().references(() => transcripts.id),
  sequencePosition: integer("sequence_position").notNull(),
  turnType: turnType("turn_type").notNull(),
  content: text("content").notNull(),
  provenanceTag: provenanceTag("provenance_tag").notNull(),
  activeHeuristicId: fk("active_heuristic_id").references(() => heuristics.id),
  signalDetected: boolean("signal_detected").notNull().default(false),
  /**
   * Which audience population `voice.ts` resolved this turn against, and
   * which register (if any) actually rendered -- `VoiceContextResult.audience`
   * / `.register`, persisted for the first time as of this column (this
   * session, 15 Sep 2026, resolving Danielle's "output requirements" doc's
   * #1/#6/#10: `test-run-export.ts` previously had to name "audience
   * adaptation" as `notReconstructed` because nothing captured which
   * register was in force when a past turn happened, only which one today's
   * config would resolve to). Written only on Wing's own turns
   * (`recordAiTurn`) -- a student/persona turn has no delivery register of
   * its own. Null on every turn recorded before this column existed, and on
   * any turn where voice resolved nothing (no profile, no population match).
   */
  deliveryAudience: text("delivery_audience"),
  deliveryRegister: text("delivery_register"),
  channel: captureChannel("channel").notNull().default("in_app"),
  classificationStatus: classificationStatus("classification_status").notNull().default("provisional"),
  classifiedBy: classifierActor("classified_by"),
  classifierPromptId: fk("classifier_prompt_id").references(() => classifierPrompts.id),
  /**
   * Human-originated does not automatically mean suitable longitudinal evidence.
   * Scoped free chat records refused/off-topic turns for audit and conversation
   * continuity, but those words must not become career memory or pattern evidence.
   */
  analysisEligible: boolean("analysis_eligible").notNull().default(true),
  /** Stable policy reason when analysisEligible is false; never model prose. */
  analysisExclusionReason: text("analysis_exclusion_reason"),
  createdAt: tsNow("created_at"),
}, (t) => ({
  positionUnique: uniqueIndex("transcript_turns_position_unique").on(t.transcriptId, t.sequencePosition),
  turnTypeIdx: index("transcript_turns_type_idx").on(t.turnType),
  heuristicIdx: index("transcript_turns_heuristic_idx").on(t.activeHeuristicId),
  // The Nano worker's queue scan.
  provisionalIdx: index("transcript_turns_provisional_idx")
    .on(t.createdAt).where(sql`${t.classificationStatus} = 'provisional'`),
}));

/** Build now · Structured outputs extracted at session end. Replaces the
 *  MVP's completionData columns. */
export const sessionArtifacts = wing.table("session_artifacts", {
  id: id(),
  sessionId: fk("session_id").notNull().references(() => sessions.id),
  artifactType: artifactType("artifact_type").notNull(),
  content: jsonb("content").notNull(),
  sourceType: sourceType("source_type").notNull().default("ai_generated"),
  version: integer("version").notNull().default(1),
  createdAt: tsNow("created_at"),
}, (t) => ({
  sessionTypeIdx: index("session_artifacts_session_type_idx").on(t.sessionId, t.artifactType),
}));

/* ══════════════════════════════════════════════════════════════════════════
 * 9. LONGITUDINAL MEMORY  (spec §9)
 * ══════════════════════════════════════════════════════════════════════════ */

/** Provision now, activate later · pgvector store for longitudinal retrieval.
 *  ONLY human-originated turns are embedded; ai_generated turns are excluded,
 *  so Wing's memory is grounded in what students actually said rather than in
 *  its own prior output. Table and extension exist at migration; the
 *  population pipeline activates at the first returning-user session. */
export const userMemoryEmbeddings = wing.table("user_memory_embeddings", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  turnId: fk("turn_id").notNull().unique().references(() => transcriptTurns.id),
  transcriptId: fk("transcript_id").notNull().references(() => transcripts.id),
  sessionId: fk("session_id").notNull().references(() => sessions.id),
  heuristicContext: jsonb("heuristic_context"),
  // text-embedding-3 at 1,536 dims (native for -small; -large via dimension
  // reduction), keeping the HNSW index within pgvector's limits.
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  createdAt: tsNow("created_at"),
}, (t) => ({
  embeddingIdx: index("user_memory_embeddings_hnsw_idx")
    .using("hnsw", t.embedding.op("vector_cosine_ops")),
  studentIdx: index("user_memory_embeddings_student_idx").on(t.studentId),
}));

/* ══════════════════════════════════════════════════════════════════════════
 * 10. SCORING, FEEDBACK AND METHODOLOGY EVOLUTION  (spec §10)
 * ══════════════════════════════════════════════════════════════════════════ */

/** Build now · The audit trail: answers "why did Wing say what it said".
 *  heuristic_component_id recovers the exact intervention text applied. */
export const userHeuristicApplications = wing.table("user_heuristic_applications", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  sessionId: fk("session_id").notNull().references(() => sessions.id),
  heuristicId: fk("heuristic_id").notNull().references(() => heuristics.id),
  heuristicComponentId: fk("heuristic_component_id").notNull().references(() => heuristicComponents.id),
  turnId: fk("turn_id").references(() => transcriptTurns.id), // triggering turn
  cycleId: fk("cycle_id").references(() => schoolCycles.id),
  sequenceId: fk("sequence_id").notNull().references(() => heuristicSequences.id),
  outcomeSignal: outcomeSignal("outcome_signal"),
  notes: text("notes"),
  appliedAt: tsNow("applied_at"),
}, (t) => ({
  studentAppliedIdx: index("user_heuristic_applications_student_applied_idx").on(t.studentId, t.appliedAt),
  heuristicIdx: index("user_heuristic_applications_heuristic_idx").on(t.heuristicId),
  sessionIdx: index("user_heuristic_applications_session_idx").on(t.sessionId),
}));

/** Build now (student level) · Aggregated heuristic performance, written by
 *  the post-session scoring engine. Cycle-level aggregation is deferred — it
 *  derives from this table and the application log without schema change. */
export const userHeuristicScores = wing.table("user_heuristic_scores", {
  studentId: fk("student_id").notNull().references(() => students.id),
  heuristicId: fk("heuristic_id").notNull().references(() => heuristics.id),
  cycleId: fk("cycle_id").notNull().references(() => schoolCycles.id),
  sessionsApplied: integer("sessions_applied").notNull().default(0),
  positiveSignalCount: integer("positive_signal_count").notNull().default(0),
  regressionCount: integer("regression_count").notNull().default(0),
  compositeScore: numeric("composite_score", { precision: 6, scale: 2 }),
  lastUpdated: tsNow("last_updated"),
}, (t) => ({
  pk: primaryKey({ columns: [t.studentId, t.heuristicId, t.cycleId] }),
}));

/** Build now · What the gate audit found in Wing's delivered output.
 *
 *  NOT `user_heuristic_applications`: that table means "this card was applied"
 *  and `user_heuristic_scores` aggregates from it to decide which methodology
 *  earns promotion. A breach written there would build a card's composite score
 *  out of its own failures. See migration 0021.
 *
 *  `excerpt` is a window of Wing's reply and may quote the student, so it carries
 *  the same sensitivity as `transcript_turns.content` and needs the same access
 *  control on any admin surface over it. */
export const gateAuditFindings = wing.table("gate_audit_findings", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  sessionId: fk("session_id").notNull().references(() => sessions.id),
  /** The AI turn whose text broke the rule. */
  turnId: fk("turn_id").references(() => transcriptTurns.id),
  heuristicId: fk("heuristic_id").notNull().references(() => heuristics.id),
  /** Denormalised: how the methodology names the gate, and it survives a rename. */
  cardCode: text("card_code").notNull(),
  mode: gateFindingMode("mode").notNull(),
  matched: text("matched").notNull(),
  excerpt: text("excerpt").notNull(),
  /** Danielle's review state. A rejected finding means the PATTERN is too broad. */
  status: patternStatus("status").notNull().default("pending_review"),
  detectedAt: tsNow("detected_at"),
}, (t) => ({
  cardStatusIdx: index("gate_audit_findings_card_status_idx").on(t.cardCode, t.status),
  studentIdx: index("gate_audit_findings_student_idx").on(t.studentId, t.detectedAt),
  sessionIdx: index("gate_audit_findings_session_idx").on(t.sessionId),
}));

/** Stub for later · Human review queue for candidates surfaced by the
 *  between-cohort pipeline. The system proposes; the methodology owner
 *  decides. Schema exists now; the pipeline that populates it comes later. */
export const patternDetectionQueue = wing.table("pattern_detection_queue", {
  id: id(),
  cycleId: fk("cycle_id").notNull().references(() => schoolCycles.id),
  patternDescription: text("pattern_description").notNull(),
  // Acceptable at stub stage; may normalize to a child table on activation.
  supportingTurnIds: bigint("supporting_turn_ids", { mode: "number" }).array().notNull().default(sql`'{}'`),
  candidateCardDraft: jsonb("candidate_card_draft"),
  status: patternStatus("status").notNull().default("pending_review"),
  reviewedBy: fk("reviewed_by").references(() => users.id),
  reviewedAt: ts("reviewed_at"),
  createdAt: tsNow("created_at"),
});

/* ══════════════════════════════════════════════════════════════════════════
 * 11. ENGAGEMENT AND COMMUNICATIONS  (spec §11)
 *
 * The feature list's `email_events` is realized here as `message_events`,
 * generalized with a channel column: one log for all channels keeps delivery,
 * engagement and reply-to-log uniform, and adding push/WhatsApp later is an
 * enum value rather than a new table. Between-session interactions are
 * captured as ongoing_engagement sessions and tagged/scored exactly like
 * Foundation Session turns — the turn store remains the single behavioural
 * corpus while these tables carry the feature-level record.
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Session completion criteria — methodology, editable without a deploy.
 *
 * WHY THIS TABLE EXISTS (a deliberate addition beyond the 44-table spec)
 *
 * Completion criteria decide when a Foundation Session is finished. They are
 * methodology, not code — but they were written TWICE per session per
 * population, once in the conversation prompt and once in the analysis prompt.
 * Eighteen copies, kept in sync by hand across three 800-line prompt files.
 *
 * They drifted, and it was not theoretical: a mid-career Session 2 that had
 * plainly met its stated bar would not complete, because the analysis required
 * something the conversation was never instructed to pursue. Five of the nine
 * pairs also gate on the student replying AFTER the closing message, which the
 * completion check cannot see because it runs before any reply exists.
 *
 * One row per (population, session type) is the single definition both prompts
 * render from, so that class of drift stops being possible. Versioned and
 * published like heuristics and classifier prompts: a past session stays
 * explicable by the criteria that were live when it ran.
 */
export const sessionCompletionCriteria = wing.table(
  "session_completion_criteria",
  {
    id: id(),
    /** Matches users.professional_status, which selects the prompt set. */
    populationTag: text("population_tag").notNull(),
    sessionType: sessionType("session_type").notNull(),
    versionNumber: integer("version_number").notNull().default(1),
    status: publishStatus("status").notNull().default("draft"),
    /**
     * [{ id, text, reachable, note }] — `reachable` records whether the
     * conversation prompt is actually instructed to achieve the criterion.
     * A criterion the session never pursues can only be met by luck.
     */
    criteria: jsonb("criteria").notNull(),
    /** Why this version exists. Shown in the version history. */
    changeNote: text("change_note"),
    createdBy: fk("created_by").references(() => users.id),
    createdAt: tsNow("created_at"),
    publishedAt: ts("published_at"),
  },
  (t) => ({
    lookupIdx: index("session_completion_criteria_lookup_idx")
      .on(t.populationTag, t.sessionType, t.status),
    // At most one published version per population/session — the resolution
    // path must never have to choose between two live definitions.
    publishedUnique: uniqueIndex("session_completion_criteria_published_unique")
      .on(t.populationTag, t.sessionType)
      .where(sql`${t.status} = 'published'`),
  }),
);

/**
 * How the analysis reasons about a finished transcript.
 *
 * Sibling of session_completion_criteria, and the distinction between them is
 * worth keeping straight:
 *
 *   criteria    — WHETHER the session is done. A checklist.
 *   methodology — HOW to judge the transcript at all. The lenses, tests and
 *                 translation rules the model applies before reaching that
 *                 checklist.
 *
 * They were tangled until now: five of the nine analysis prompts stated their
 * completion criteria a second time *inside* the methodology block, disagreeing
 * with the criteria the editor controlled. Those duplicates are gone, so the
 * two surfaces no longer overlap and can be owned separately.
 *
 * Same shape and same rules as criteria — versioned, retire-never-edit, one
 * published row per population/session, absent row means the prompt file's own
 * text is used.
 */
export const analysisMethodology = wing.table(
  "analysis_methodology",
  {
    id: id(),
    /** Matches users.professional_status, which selects the prompt set. */
    populationTag: text("population_tag").notNull(),
    sessionType: sessionType("session_type").notNull(),
    versionNumber: integer("version_number").notNull().default(1),
    status: publishStatus("status").notNull().default("draft"),
    /**
     * [{ id, title, body }] — one entry per numbered section.
     *
     * Stored unnumbered and renumbered at render, so reordering or retiring a
     * section does not require renumbering the rest by hand — which is the
     * kind of edit that silently produces "1) 2) 4)".
     */
    sections: jsonb("sections").notNull(),
    changeNote: text("change_note"),
    createdBy: fk("created_by").references(() => users.id),
    createdAt: tsNow("created_at"),
    publishedAt: ts("published_at"),
  },
  (t) => ({
    lookupIdx: index("analysis_methodology_lookup_idx")
      .on(t.populationTag, t.sessionType, t.status),
    publishedUnique: uniqueIndex("analysis_methodology_published_unique")
      .on(t.populationTag, t.sessionType)
      .where(sql`${t.status} = 'published'`),
  }),
);

/**
 * RETIRED — Tier 1 part 4, migration 0032. Rows kept, nothing reads them.
 *
 * The objective set for a session — what it is trying to achieve, in order.
 *
 * The renderer that read this table was gated on `OBJECTIVE_RENDERER_POPULATIONS`,
 * which was never set, so it never once assembled a prompt for a student. What
 * carries the argument below in Tier 1 is the v2 Foundation cards — `gate-compiler`
 * and `voice-compiler` — which assemble a turn prompt from published components and
 * have been built, audited and reviewed. Two mechanisms for the same job is one more
 * than anyone can keep correct.
 *
 * The table stays because the reasoning does, and because a version history is not
 * worth destroying to save a table nothing queries. The rest of this comment is why
 * the design was right, and is still the argument for what replaced it.
 *
 * WHY THIS EXISTS
 * Methodology used to live inside 22,000-character prompt template literals,
 * three near-identical copies of them, and reaching in to change one thing kept
 * silently changing another. Four separate extractors written against those
 * files were wrong in ways that looked like success. Criteria ended up stated
 * in three places and disagreeing.
 *
 * So the prompt stops being a document and becomes a render target: assembled
 * per turn from the objective in play, the heuristic cards eligible for it, the
 * student's context, and the published completion criteria. Nothing to
 * duplicate into, no interpolation for an editor to delete.
 *
 * POPULATIONS ARE OVERLAYS, NOT COPIES
 * One objective set per session type. Where a population genuinely differs, it
 * says so in `overrides` — so "why is mid-career stricter here?" has an answer
 * in a field instead of being lost in prose, and copy-paste decay becomes
 * impossible to mistake for deliberate methodology.
 *
 * Versioned exactly like criteria and methodology: retire-never-edit, one
 * published set per session type, absent row means the legacy prompt file is
 * still in charge — so this can be adopted one session at a time.
 */
export const objectiveSets = wing.table(
  "objective_sets",
  {
    id: id(),
    sessionType: sessionType("session_type").notNull(),
    versionNumber: integer("version_number").notNull().default(1),
    status: publishStatus("status").notNull().default("draft"),
    /**
     * Ordered Objective[]. The shape and the overlay merge lived in
     * `objective-rules.ts`, removed with the renderer in Tier 1 part 4; the rows
     * that remain are the only surviving record of it.
     */
    objectives: jsonb("objectives").notNull(),
    changeNote: text("change_note"),
    createdBy: fk("created_by").references(() => users.id),
    createdAt: tsNow("created_at"),
    publishedAt: ts("published_at"),
  },
  (t) => ({
    lookupIdx: index("objective_sets_lookup_idx").on(t.sessionType, t.status),
    publishedUnique: uniqueIndex("objective_sets_published_unique")
      .on(t.sessionType)
      .where(sql`${t.status} = 'published'`),
  }),
);

/**
 * RETIRED — Tier 1 part 4, migration 0032. Its only writer was the objective
 * renderer, which never ran; nothing writes here now. Rows kept.
 *
 * Which objective each turn was pursuing.
 *
 * The reason the whole design pays for itself. Turns already carry provenance
 * and turn type; adding the objective gives every heuristic card a real
 * denominator — "applied while pursuing objective X, and X was subsequently
 * satisfied" — instead of the much weaker "applied in a session that later
 * completed".
 *
 * It is also what makes a conversation change measurable at all. Replay cannot
 * work for conversation prompts, because changing what Wing says changes what
 * the student says next. But per-objective satisfaction rates across cohorts
 * can be compared, which is a real experiment rather than a simulated one.
 */
export const turnObjectives = wing.table(
  "turn_objectives",
  {
    turnId: fk("turn_id").notNull().unique().references(() => transcriptTurns.id),
    sessionId: fk("session_id").notNull().references(() => sessions.id),
    objectiveKey: text("objective_key").notNull(),
    /** True on the turn where the objective's evidence test first passed. */
    satisfiedHere: boolean("satisfied_here").notNull().default(false),
    createdAt: tsNow("created_at"),
  },
  (t) => ({
    sessionIdx: index("turn_objectives_session_idx").on(t.sessionId),
    objectiveIdx: index("turn_objectives_objective_idx").on(t.objectiveKey),
  }),
);

/** Build now · Rotating prompt library, configurable without a deploy. The "no
 *  repeat within 14 days" rule is a query against message_events.prompt_id, not
 *  an unbounded array column.
 *
 *  Widened by 0028 to hold what her library actually carries. Every added column
 *  answers a line in the micro-journal library's own Integration Notes; see that
 *  migration, which quotes each one against the column it produced.
 *
 *  `category` is the original seven-value enum and is now nullable: none of her
 *  220 prompts has one, and forcing a value would be inventing a classification.
 *  It stays for the 28 rows that predate her library and for selectPrompt's
 *  optional filter. */
export const promptLibrary = wing.table(
  "prompt_library",
  {
    id: id(),
    category: promptCategory("category"),
    promptText: text("prompt_text").notNull(),
    populationTags: text("population_tags").array().notNull().default(sql`'{}'`),

    /** Her id: a bare number in Section 1, a code like U-01 or EF-03 elsewhere.
     *  Heartbeat prompts are numbered 1-8 within each track, so this repeats
     *  across blocks — uniqueness is on (source_block, prompt_code). */
    promptCode: text("prompt_code"),

    /** Her `*Signal:*` line, verbatim. "Every prompt in this library should be
     *  tagged with its behavioral signal in the prompt_library schema so the
     *  adaptive selection engine can choose based on what signal is most
     *  informative for the current user." — her Integration Notes. */
    behavioralSignal: text("behavioral_signal"),

    /** Zero or more of her eight: language, energy, decision, relationship,
     *  industry, career, influence, achievement. Empty on every seeded row until
     *  she assigns them — the library carries analytical prose, not categories,
     *  and a guess would either manufacture or collapse the distinctness Gate 2
     *  counts. **This is what currently blocks the Reveal Cycle.**
     *
     *  A set rather than one value since 0041: "a single prompt response could
     *  contain both an energy signal and a relationship signal" (her Sept 4
     *  pre-read, §7e). Empty is the only "uncategorised" — like `populationTags`
     *  above there is no NULL state, so nothing has to decide whether NULL and
     *  `{}` mean different things. */
    signalCategory: text("signal_category").array().notNull().default(sql`'{}'`),

    /** The words that decided signalCategory — usually a quote from behavioralSignal.
     *  Migration 0039. Describes the set as a whole, not one element of it. */
    signalCategoryBecause: text("signal_category_because"),

    /** Same vocabulary as evidenceTierSource, for signalCategory. */
    signalCategorySource: text("signal_category_source"),

    /** 1, 2 or 3, proposed by `wing:tag-prompts` / `populate-prompt-attributes.ts`.
     *  Null until a tier is set — by the rule engine, by Claude's review, or by her. */
    evidenceTier: smallint("evidence_tier"),

    /** The words that decided evidenceTier — migration 0039. */
    evidenceTierBecause: text("evidence_tier_because"),

    /** 'rule_engine' | 'claude_review' | 'danielle'. What produced evidenceTier, not
     *  whether a person has checked it — see 0039's header. */
    evidenceTierSource: text("evidence_tier_source"),

    /** universal | adapted | specific — her three sections. Works with
     *  populationTags, which already holds the audience. */
    audienceScope: text("audience_scope"),

    /** micro_journal | heartbeat | synthesis_cycle. Three rhythms across her two
     *  documents; the third comes from Section 5's preamble — "prompts marked
     *  *synthesis-cycle* should only be used at monthly/quarterly cadence, not in
     *  the weekly rotation". NULL where her marker names a delivery MODE rather
     *  than a rhythm. None of them can fire until the scheduler exists. */
    cadence: text("cadence"),

    /** Her inline marker from Section 5, verbatim. `cadence` and `eventSensitive`
     *  are derived from it; this is what they were derived from, so the
     *  derivation can be checked against her document without reading the
     *  parser. */
    deliveryMarker: text("delivery_marker"),

    /** approachable | reflective. Her rotation weighting is "roughly 2:1
     *  approachable-to-serious in any given week", which needs the two pools to
     *  be told apart. */
    library: text("library"),

    /** Her event-sensitivity rule as a filter: "prompts referencing specific
     *  events … are only eligible for delivery if the user has mentioned the
     *  event". False by default because her prompts use general scenes on
     *  purpose. */
    eventSensitive: boolean("event_sensitive").notNull().default(false),

    /** Where the row came from, so a re-seed diffs against the document rather
     *  than against memory. */
    sourceDocument: text("source_document"),
    sourceBlock: text("source_block"),
    sourceLine: integer("source_line"),

    active: boolean("active").notNull().default(true),
    createdAt: tsNow("created_at"),
    updatedAt: tsNow("updated_at"),
  },
  /* `prompt_library_code_idx` — UNIQUE on (source_block, prompt_code) WHERE
     prompt_code IS NOT NULL — lives in 0028 only. It is partial, which this
     drizzle version cannot express, and a non-partial version would be wrong:
     the 28 pre-existing rows carry neither column and would all collide. */
  (t) => ({
    selectionIdx: index("prompt_library_selection_idx").on(
      t.active,
      t.cadence,
      t.library,
      t.audienceScope,
    ),
  }),
);

/** Build now · The opener pool, as its own layer.
 *
 *  "The universal opener pool should be implemented as a separate layer — the
 *  system selects the opener independently of the prompt, ensuring variety in
 *  how prompts feel even when the underlying question repeats at the 14-day
 *  minimum interval." — her Integration Notes.
 *
 *  A table rather than a column on prompt_library, because independent selection
 *  is the whole point: folding the opener in would make the two move together,
 *  which is the one thing that note rules out. */
export const promptOpeners = wing.table(
  "prompt_openers",
  {
    id: id(),
    /** casual | warm_return | post_response. Not interchangeable: warm_return is
     *  for "users who haven't responded in 5+ days" and post_response is for
     *  following up on a theme, so the pool is a precondition, not a flavour. */
    pool: text("pool").notNull(),
    text: text("text").notNull(),
    /** Her openers interpolate the user's name; one post_response opener also
     *  interpolates a topic. Recorded so a renderer refuses an opener whose
     *  placeholders it cannot fill rather than sending "[Name]" to a student. */
    placeholders: text("placeholders").array().notNull().default(sql`'{}'`),
    active: boolean("active").notNull().default(true),
    createdAt: tsNow("created_at"),
    updatedAt: tsNow("updated_at"),
  },
  /* `prompt_openers_text_idx` — UNIQUE on (pool, text) — is in 0028 only, for
     symmetry with the note above: both uniqueness rules are enforced by the
     database and stated there. */
  (t) => ({
    poolIdx: index("prompt_openers_pool_idx").on(t.active, t.pool),
  }),
);

/** Build now · The institutional reporting block — migration 0035.
 *
 *  Collected at registration under an explicit promise: "Collected for [Institution]
 *  reporting. Does not affect your Wing experience."
 *
 *  A SEPARATE TABLE, not columns on `students`, and that is the promise expressed as
 *  schema. Columns on `students` would be honoured the day they were added and quietly
 *  broken the first time a context builder selected the whole row — which is how
 *  `student_context` is assembled. Nothing that builds a prompt joins this table; see
 *  `wing/demographics-store.ts`, which is its only accessor.
 *
 *  Every field is nullable. "Prefer not to say" is one of the form's own options and is
 *  stored as that string — an answer, distinct from NULL meaning never asked. */
export const studentDemographics = wing.table("student_demographics", {
  id: id(),
  studentId: fk("student_id").notNull().unique().references(() => students.id, { onDelete: "cascade" }),
  /** A year, not a date of birth — a DOB identifies far more than reporting needs. */
  age: smallint("age"),
  gender: text("gender"),
  genderSelfDescribe: text("gender_self_describe"),
  ethnicities: text("ethnicities").array().notNull().default(sql`'{}'`),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  /** When the acknowledgement was ticked. A boolean cannot date a consent record. */
  privacyAcceptedAt: ts("privacy_accepted_at"),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
});

/** Build now · The career-and-personal event log — Tier 1's core
 *  data-generating surface. Human input (entry_text) and AI output
 *  (wing_response) occupy distinct columns; only entry_text is ever embedded. */
export const lifeLogEntries = wing.table("life_log_entries", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  entryType: entryType("entry_type").notNull(),
  promptId: fk("prompt_id").references(() => promptLibrary.id),
  entryText: text("entry_text").notNull(), // human-originated
  voiceRecordingUri: text("voice_recording_uri"), // Azure Blob
  wingResponse: text("wing_response"), // AI-generated (distinct column)
  sliConnections: jsonb("sli_connections"),
  patternsNoted: jsonb("patterns_noted"),
  competencies: text("competencies").array().notNull().default(sql`'{}'`),
  // Computed from entry_text only; pipeline activates with Tier 2 pattern detection.
  vectorEmbedding: vector("vector_embedding", { dimensions: 1536 }),
  captureSource: captureChannel("capture_source").notNull().default("in_app"),
  sessionId: fk("session_id").references(() => sessions.id),
  createdAt: tsNow("created_at"),
}, (t) => ({
  studentCreatedIdx: index("life_log_entries_student_created_idx").on(t.studentId, t.createdAt),
}));

/**
 * Build now · Coach-assigned homework.
 *
 * Was `public.homework_assignments`, whose user_id is a foreign key to
 * `public.users`. Registration creates a `wing.users` row and no public one, so
 * assigning or answering homework threw a constraint violation for every
 * student who signed up after the cutover — the same defect that broke
 * registration and the questionnaire.
 *
 * Keyed on students.id like every other coaching-side table. `assignedByUserId`
 * points at wing.users because the assigner is staff, not a student.
 */
export const homeworkAssignments = wing.table("homework_assignments", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  assignedByUserId: fk("assigned_by_user_id").references(() => users.id),
  questionText: text("question_text").notNull(),
  answerText: text("answer_text"), // null until the student answers
  answeredAt: ts("answered_at"),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
}, (t) => ({
  studentCreatedIdx: index("homework_assignments_student_created_idx").on(t.studentId, t.createdAt),
}));

/**
 * Build now · Monthly self-reported activity check-in.
 *
 * Was `public.monthly_check_ins`, FK'd to `public.users` — a table no
 * post-cutover student has a row in, so submitting one failed for every student
 * who registered after the migration.
 *
 * Screenshots move to Blob rather than staying as base64 in the row: the legacy
 * table held three separate base64 image columns, and a check-in with three
 * screenshots was routinely over a megabyte of text in a jsonb/text column.
 * The URIs are kept here; the images live where images belong.
 */
export const monthlyCheckIns = wing.table("monthly_check_ins", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  /** YYYY-MM. One check-in per student per month. */
  month: text("month").notNull(),
  contentPosts: integer("content_posts").notNull().default(0),
  contentLinks: text("content_links").array().notNull().default(sql`'{}'`),
  engagementFrequency: text("engagement_frequency"),
  newConnections: integer("new_connections").notNull().default(0),
  targetConnectionPercentage: text("target_connection_percentage"),
  recommendationImplementation: text("recommendation_implementation"),
  implementationChallenges: text("implementation_challenges"),
  updatedProfileVisuals: boolean("updated_profile_visuals").notNull().default(false),
  /** Azure Blob URIs. The MVP inlined base64 here; that does not carry forward. */
  screenshotUris: text("screenshot_uris").array().notNull().default(sql`'{}'`),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
}, (t) => ({
  studentMonthUnique: uniqueIndex("monthly_check_ins_student_month_unique").on(t.studentId, t.month),
}));

/**
 * Build now · Staff notes about a student.
 *
 * Was `public.coaching_notes`, with TWO foreign keys to `public.users` — the
 * student and the admin who wrote it. Both broke for post-cutover accounts.
 *
 * `authorUserId` is nullable because staff accounts were not all migrated, and
 * a note whose author cannot be resolved is still worth keeping.
 */
export const coachingNotes = wing.table("coaching_notes", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  authorUserId: fk("author_user_id").references(() => users.id),
  content: text("content").notNull(),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
}, (t) => ({
  studentCreatedIdx: index("coaching_notes_student_created_idx").on(t.studentId, t.createdAt),
}));

/** Build now · Versioned message templates; copy governed by the Voice Guide
 *  and editable without a deploy. message_events records the key and version
 *  actually sent, so delivered copy is always recoverable. */
export const messageTemplates = wing.table("message_templates", {
  id: id(),
  templateKey: text("template_key").notNull(), // welcome_1, dormancy_2, ...
  channel: messageChannel("channel").notNull(),
  subjectTemplate: text("subject_template"), // email only
  bodyTemplate: text("body_template").notNull(),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  createdAt: tsNow("created_at"),
}, (t) => ({
  keyChannelVersionUnique: uniqueIndex("message_templates_key_channel_version_unique")
    .on(t.templateKey, t.channel, t.version),
}));

/** Build now · Per-student journey state: welcome, dormancy, 90-day launch,
 *  academic calendar. sequence_key is data, not an enum. */
export const engagementSequenceStates = wing.table("engagement_sequence_states", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  sequenceKey: text("sequence_key").notNull(),
  currentStep: smallint("current_step").notNull().default(0),
  status: sequenceStatus("status").notNull().default("active"),
  startedAt: tsNow("started_at"),
  nextRunAt: ts("next_run_at"), // scheduler cursor (Azure Functions)
  completedAt: ts("completed_at"),
  updatedAt: tsNow("updated_at"),
}, (t) => ({
  studentSequenceUnique: uniqueIndex("engagement_sequence_states_student_key_unique")
    .on(t.studentId, t.sequenceKey),
  scheduleIdx: index("engagement_sequence_states_schedule_idx").on(t.nextRunAt, t.status),
}));

/** Build now · One log of every outbound and inbound message across email,
 *  SMS and in-app — delivery, engagement and reply-to-log in one audit trail. */
export const messageEvents = wing.table("message_events", {
  id: id(),
  studentId: fk("student_id").references(() => students.id),
  advisorId: fk("advisor_id").references(() => advisors.id), // advisor snapshots
  channel: messageChannel("channel").notNull(),
  direction: messageDirection("direction").notNull(),
  templateKey: text("template_key"),
  templateVersion: integer("template_version"),
  sequenceKey: text("sequence_key"),
  sequenceStep: smallint("sequence_step"),
  promptId: fk("prompt_id").references(() => promptLibrary.id), // enforces 14-day no-repeat
  /** The greeting that carried it, when it had one. Selected independently of
   *  `promptId`, per her Integration Notes, and read back so the same opener
   *  does not arrive twice running. NULL on every message that is not a
   *  life-log prompt, which is most of them. */
  openerId: fk("opener_id").references(() => promptOpeners.id),
  providerMessageId: text("provider_message_id"), // SendGrid / Twilio
  sentAt: tsNow("sent_at"),
  /**
   * Set when the provider refused the send. `sent_at` alone could not express
   * this — it defaults to now() on every row, so a refused send was recorded as
   * delivered and `alreadySent()` then suppressed its own retry forever.
   *
   * NULL means "not known to have failed", which for rows written before this
   * column existed is the honest answer rather than a claim of success.
   */
  failedAt: ts("failed_at"),
  failureReason: text("failure_reason"),
  deliveredAt: ts("delivered_at"),
  openedAt: ts("opened_at"),
  clickedAt: ts("clicked_at"),
  /**
   * The handle in this message's Reply-To address, when it invited a reply.
   *
   * Identity for the inbound webhook. `From` is forgeable, so a reply is attributed
   * by the address it was sent TO — see migration 0033. NULL on every message that
   * does not ask for an answer, which is most of them.
   */
  replyToken: text("reply_token"),
  repliedAt: ts("replied_at"),
  replyContent: text("reply_content"), // inbound body (human-originated)
  loggedLifeLogEntryId: fk("logged_life_log_entry_id").references(() => lifeLogEntries.id),
  createdAt: tsNow("created_at"),
}, (t) => ({
  studentSentIdx: index("message_events_student_sent_idx").on(t.studentId, t.sentAt),
  channelSentIdx: index("message_events_channel_sent_idx").on(t.channel, t.sentAt),
}));

/* ══════════════════════════════════════════════════════════════════════════
 * 12. POSITIONING ARTIFACTS, DOCUMENTS AND INTAKE  (spec §12)
 * ══════════════════════════════════════════════════════════════════════════ */

/** Build now · Versioned SLI records. Each candidate, custom statement,
 *  refinement and Positioning Refresh is a row with lineage back to its
 *  parent. A previous SLI is never deleted — it is superseded and becomes
 *  part of the longitudinal record (the career-evolution re-entry pathway). */
export const sliRecords = wing.table("sli_records", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  title: text("title").notNull(),
  statement: text("statement").notNull(),
  rationale: text("rationale"),
  // DEVIATION from the approved spec (§12), additive and agreed with Aditya:
  // refinement produces implementation guidance alongside the rationale, and
  // it must survive a page reload rather than living only in the response.
  implementationGuidance: text("implementation_guidance"),
  source: sliSource("source").notNull(),
  status: sliStatus("status").notNull().default("candidate"),
  parentSliId: fk("parent_sli_id").references((): AnyPgColumn => sliRecords.id), // refinement / refresh lineage
  refinementCount: smallint("refinement_count").notNull().default(0), // max 3, engine-enforced
  generatedInSessionId: fk("generated_in_session_id").references(() => sessions.id),
  sourceType: sourceType("source_type").notNull().default("ai_generated"),
  createdAt: tsNow("created_at"),
  activatedAt: ts("activated_at"),
  supersededAt: ts("superseded_at"),
}, (t) => ({
  studentStatusIdx: index("sli_records_student_status_idx").on(t.studentId, t.status),
}));

/** Build now · The Behavioral Evidence Portfolio — positioning claim,
 *  supporting evidence from the student's own stories, and NACE competency.
 *  source_turn_id extends provenance into the product's outputs. */
export const evidencePortfolioItems = wing.table("evidence_portfolio_items", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  sliId: fk("sli_id").references(() => sliRecords.id),
  positioningClaim: text("positioning_claim").notNull(),
  evidence: text("evidence").notNull(),
  // NACE category: reference data, not an enum, anticipating Tier 3 (D6).
  competencyCategory: text("competency_category").notNull(),
  sourceSessionId: fk("source_session_id").references(() => sessions.id),
  sourceTurnId: fk("source_turn_id").references(() => transcriptTurns.id),
  sourceType: sourceType("source_type").notNull().default("ai_generated"),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
});

/** Build now · Holistic, integrated full-profile optimization — replacing the
 *  MVP's fragmented per-section chunks. */
export const linkedinOptimizations = wing.table("linkedin_optimizations", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  sliId: fk("sli_id").references(() => sliRecords.id),
  holisticReview: jsonb("holistic_review").notNull(),
  sourceType: sourceType("source_type").notNull().default("ai_generated"),
  createdAt: tsNow("created_at"),
}, (t) => ({
  studentIdx: index("linkedin_optimizations_student_idx").on(t.studentId),
}));

/** Build now · LinkedIn post/article drafts conforming to the 360Brew
 *  authenticity standard. First published SLI-aligned post activates the
 *  90-day launch sequence (S5). */
export const contentDrafts = wing.table("content_drafts", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  draftType: contentDraftType("draft_type").notNull(),
  content: jsonb("content").notNull(), // hook/body/closing/hashtags or sections
  iteration: smallint("iteration").notNull().default(1),
  sliId: fk("sli_id").references(() => sliRecords.id),
  moduleCompletionId: fk("module_completion_id"), // Tier 2 (modules not yet built)
  status: contentStatus("status").notNull().default("draft"),
  publishedUrl: text("published_url"),
  publishedAt: ts("published_at"),
  /**
   * How many times this post has been shared to LinkedIn.
   *
   * The MVP kept this in `public.linkedin_post_shares`, keyed by
   * (draft_id, post_number), because a legacy draft row held two posts. In
   * Wing each row IS a post (spec §12), so the count belongs on the row and
   * the join table has nothing left to key on. `published_at` carries the
   * "last shared at" that table also stored.
   */
  shareCount: integer("share_count").notNull().default(0),
  sourceType: sourceType("source_type").notNull().default("ai_generated"),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
});

/** Build now · Wing_Content_System_v1 (H-620–627) — behavioral content-interaction
 *  log, one row per interaction rather than per draft.
 *
 *  `content_drafts` already holds the actual post/article text through its
 *  draft→final→published lifecycle; this records what the student DID around
 *  that lifecycle, plus the trigger types content_drafts has no room for
 *  (comment, DM, connection-request are one-off responses, never staged
 *  drafts). It exists because `behavioral_content_comfort` — Danielle, 2 Sep,
 *  replacing H-626's original self-reported-B2 gate per IG-U014 ("self-report
 *  governs institutional reporting only, never coaching decisions") — has to
 *  be inferred from what a student does across content interactions, not
 *  asked. There is no comfort column anywhere: `behavioral-content-comfort.ts`
 *  derives it at read time from this log, the same way `audience-track.ts`
 *  derives audience_track from professional_status + intake pathway rather
 *  than storing it. Also the substrate H-626's progression gates and IG-M6-02
 *  through IG-M6-04's timing/material checks read from. */
export const contentActivityLog = wing.table("content_activity_log", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  triggerType: contentTriggerType("trigger_type").notNull(),
  eventType: contentActivityEventType("event_type").notNull(),
  contentDraftId: fk("content_draft_id").references(() => contentDrafts.id),
  /** Which of IG-M6-05's 3 coaching rounds this is. Null for every event type
   *  except coaching_round. */
  coachingRound: smallint("coaching_round"),
  /** H-627: what fired the trigger (a Radar topic, a module completion, a
   *  journal quote, a cadence check) — IG-M6-04 requires every suggestion to
   *  trace to a named source, so the source is recorded, not just the fact
   *  that something fired. Free text rather than an enum: the four
   *  integration sources in H-627 don't reduce to a fixed set of reasons
   *  without losing the specific reference IG-U006 needs to check against. */
  triggerSource: text("trigger_source"),
  sourceType: sourceType("source_type").notNull(),
  occurredAt: tsNow("occurred_at"),
}, (t) => ({
  studentTriggerIdx: index("content_activity_log_student_trigger_idx")
    .on(t.studentId, t.triggerType, t.occurredAt),
  studentEventIdx: index("content_activity_log_student_event_idx")
    .on(t.studentId, t.eventType),
}));

/**
 * H-701 (Baby Radar, Wing_Content_System_v1 Spec 2, 2 Sep) — one row per
 * generated topic suggestion, not one row per weekly batch: `engagedAt` is
 * H-701's own success_criteria ("user engages with at least one topic
 * suggestion per month"), and that's a per-topic fact, not a per-week one.
 * `generatedAt` doubles as the weekly-cadence cursor — `max(generated_at)`
 * per student is what `isRadarDueThisWeek` reads, the same
 * derive-from-the-log approach `behavioral_content_comfort` uses rather than
 * a separate `last_run_at` column that could drift from it.
 */
export const radarSuggestions = wing.table("radar_suggestions", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  generatedAt: tsNow("generated_at"),
  topic: text("topic").notNull(),
  whyRelevant: text("why_relevant").notNull(),
  suggestedAction: radarSuggestedAction("suggested_action").notNull(),
  /** Null until the student acts on this suggestion. */
  engagedAt: ts("engaged_at"),
}, (t) => ({
  studentGeneratedIdx: index("radar_suggestions_student_generated_idx")
    .on(t.studentId, t.generatedAt),
  studentEngagedIdx: index("radar_suggestions_student_engaged_idx")
    .on(t.studentId, t.engagedAt),
}));

/** Build now · Multi-step freshness analysis, carried forward on new keys. */
export const freshnessReports = wing.table("freshness_reports", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  questionnaireAnalysis: jsonb("questionnaire_analysis"),
  resumeAnalysis: jsonb("resume_analysis"),
  linkedinAnalysis: jsonb("linkedin_analysis"),
  additionalDocumentsAnalysis: jsonb("additional_documents_analysis"),
  finalSynthesis: jsonb("final_synthesis"),
  sourceType: sourceType("source_type").notNull().default("ai_generated"),
  createdAt: tsNow("created_at"),
}, (t) => ({
  studentIdx: index("freshness_reports_student_idx").on(t.studentId),
}));

/** Build now · Document metadata with content in Azure Blob. Extracted text
 *  is retained so Wing references uploads instead of re-asking (A2). Inline
 *  base64 does not carry forward. */
export const documents = wing.table("documents", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  name: text("name").notNull(),
  docType: documentType("doc_type").notNull(),
  blobUri: text("blob_uri").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  extractedText: text("extracted_text"),
  analysis: jsonb("analysis"), // AI-derived; excluded from memory
  uploadedAt: tsNow("uploaded_at"),
}, (t) => ({
  studentTypeIdx: index("documents_student_type_idx").on(t.studentId, t.docType),
}));

/** Build now · Conversational intake state. Structured responses for
 *  analytics alongside the full transcript captured as an intake session —
 *  both formats, per A1. Replaces questionnaires and branding_intakes. */
export const intakeRecords = wing.table("intake_records", {
  id: id(),
  studentId: fk("student_id").notNull().unique().references(() => students.id),
  sessionId: fk("session_id").references(() => sessions.id),
  pathway: careerPathway("pathway"), // founder/freelancer branch (A2)
  structuredResponses: jsonb("structured_responses").notNull().default(sql`'{}'::jsonb`),
  verificationStatus: verificationStatus("verification_status").notNull().default("pending"),
  earlyInsightDeliveredAt: ts("early_insight_delivered_at"), // the Q8–10 reveal
  completed: boolean("completed").notNull().default(false),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
});

/* ══════════════════════════════════════════════════════════════════════════
 * 13. MODULES, COMMERCE, GROWTH AND GOVERNANCE  (spec §13)
 * ══════════════════════════════════════════════════════════════════════════ */

/** Build now · Plans as configuration — institutional licenses and direct
 *  one-time or subscription tiers, with entitlement flags in data. */
export const pricingPlans = wing.table("pricing_plans", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  audience: planAudience("audience").notNull(),
  billingType: billingType("billing_type").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: char("currency", { length: 3 }).notNull().default("usd"),
  billingInterval: text("billing_interval"), // month · year, for subscriptions
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
  active: boolean("active").notNull().default(true),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
});

/** Build now · What a user is entitled to and why. Replaces the subscription
 *  columns on the MVP users table. */
export const entitlements = wing.table("entitlements", {
  id: id(),
  userId: fk("user_id").notNull().references(() => users.id),
  planId: fk("plan_id").notNull().references(() => pricingPlans.id),
  source: entitlementSource("source").notNull(),
  institutionId: fk("institution_id").references(() => institutions.id),
  cycleId: fk("cycle_id").references(() => schoolCycles.id),
  status: entitlementStatus("status").notNull().default("active"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  startsAt: ts("starts_at").notNull(),
  expiresAt: ts("expires_at"),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
}, (t) => ({
  userStatusIdx: index("entitlements_user_status_idx").on(t.userId, t.status),
}));

/** Build now · Stripe payments against configurable plans rather than
 *  hardcoded tiers. */
export const transactions = wing.table("transactions", {
  id: id(),
  userId: fk("user_id").notNull().references(() => users.id),
  planId: fk("plan_id").references(() => pricingPlans.id),
  stripePaymentId: text("stripe_payment_id"),
  stripeSessionId: text("stripe_session_id"),
  amountCents: integer("amount_cents").notNull(),
  currency: char("currency", { length: 3 }).notNull().default("usd"),
  status: paymentStatus("status").notNull().default("pending"),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
});

/** Build now · Typed, read-only archive for migrated content with no live
 *  Tier 1 surface — monthly check-ins, coaching notes, homework assignments,
 *  profile sub-records. Nothing is dropped; nothing pollutes live tables. */
export const legacyRecords = wing.table("legacy_records", {
  id: id(),
  studentId: fk("student_id").notNull().references(() => students.id),
  recordType: text("record_type").notNull(),
  payload: jsonb("payload").notNull(), // original record, verbatim
  originalCreatedAt: ts("original_created_at"),
  importedAt: tsNow("imported_at"),
}, (t) => ({
  studentTypeIdx: index("legacy_records_student_type_idx").on(t.studentId, t.recordType),
}));

/** Build now · Actor-attributed log of administrative actions — every
 *  methodology, classifier, voice and template publish. The governance
 *  backing for the admin UI. */
export const adminAuditLog = wing.table("admin_audit_log", {
  id: id(),
  actorUserId: fk("actor_user_id").notNull().references(() => users.id),
  action: text("action").notNull(), // e.g. heuristic_component.publish
  entityType: text("entity_type").notNull(),
  entityId: fk("entity_id"),
  detail: jsonb("detail"),
  occurredAt: tsNow("occurred_at"),
}, (t) => ({
  entityIdx: index("admin_audit_log_entity_idx").on(t.entityType, t.entityId),
  actorIdx: index("admin_audit_log_actor_idx").on(t.actorUserId, t.occurredAt),
}));

/* ══════════════════════════════════════════════════════════════════════════
 * TEST HARNESS — added 10 Sep 2026. Not part of the July 2026 spec above.
 *
 * `wing.harness_personas` is authored data for the test harness only: nothing
 * in the live methodology ever reads it. It replaces file-based
 * `methodology/personas/*.md` specs for anyone who isn't running commands —
 * Danielle authors a persona here, from the Admin panel, and "activating" one
 * runs the same account-creation logic `server/wing/seed-personas.ts` already
 * runs from the CLI (a `wing.users` + `wing.students` + `wing.intake_records`
 * row, `is_test_user = true`). See `claude/HARNESS_PERSONA_UI_AND_DOC_REVIEW_SEP10.md`.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Build now (harness) · One persona spec, draft through seeded. */
export const harnessPersonas = wing.table("harness_personas", {
  id: id(),
  /**
   * Stable slug — the same identity rule `parse-persona.ts`'s file-based `id`
   * uses, so both authoring paths (file or UI) key on the same thing and a
   * persona's email (`persona+<key>@sli-harness.invalid`) never changes under
   * an edit.
   */
  personaKey: text("persona_key").notNull().unique(),
  name: text("name").notNull(),
  /**
   * Nullable at the column level — a draft may be saved before either is
   * filled in. NOT nullable in practice past 'draft': the API refuses to mark
   * a persona 'ready' or to activate it without both, the same refusal
   * `parse-persona.ts` already makes for the file format, for the same reason
   * (§2 of HARNESS_BUILD_STEP4_SEP9.md — without them every audience-specific
   * card looks like dead weight in the Unfired Cards report).
   */
  professionalStatus: professionalStatus("professional_status"),
  pathway: careerPathway("pathway"),
  /**
   * Danielle's deterministic-marker vocabulary — optional, and distinct from
   * `whatThisTests` below, which is qualitative and read by a person via the
   * Simulations trace, not counted by the (not yet built) Stage 1 counters.
   */
  expectedMarkers: text("expected_markers").array().notNull().default(sql`'{}'`),
  /**
   * Which Azure OpenAI deployment tier plays this persona's side of the
   * conversation by default — Danielle's own choice from the admin panel
   * (Aditya, 11 Sep 2026: "provide a dropdown in the admin panel for
   * danielle to select a model for persona. The current list should have
   * the existing deployments."), consulted by `claimTestRun`
   * (`test-run-engine.ts`) before it falls back to the platform-wide
   * default. Nullable, and validated against `model-tier.ts`'s
   * `PERSONA_TIERS` rather than typed as its own enum — a three-value flag
   * with no other consumer, same reasoning as `status` below. Null means
   * "use the platform default", not "nano" baked into every existing row.
   */
  defaultModelTier: text("default_model_tier"),
  /**
   * The eight sections Danielle's own sample document actually contains —
   * exposed as their own fields rather than one blob, so she is never asked
   * to paste in a document or depend on anything parsing one (Aditya, 10 Sep
   * 2026). Each is kept verbatim, the same "never reflowed, never summarised"
   * guarantee `parse-persona.ts` gives the file-based body — just split at
   * the seams she already writes at. `composeSpecPrompt()` below concatenates
   * them, in this fixed order, into the one text a future runner injects.
   */
  quickReference: text("quick_reference").notNull().default(""),
  readinessByBehavior: text("readiness_by_behavior").notNull().default(""),
  interactionPolicy: text("interaction_policy").notNull().default(""),
  voiceSample: text("voice_sample").notNull().default(""),
  diamond: text("diamond").notNull().default(""),
  coldStartNote: text("cold_start_note").notNull().default(""),
  systemPromptSummary: text("system_prompt_summary").notNull().default(""),
  whatThisTests: text("what_this_tests").notNull().default(""),
  /** 'draft' | 'ready' | 'seeded' — plain text + CHECK, not a new enum type,
   *  for a three-value flag with no other consumer. */
  status: text("status").notNull().default("draft"),
  /**
   * Set once activated. Mirrors `seed-personas.ts`: activating is idempotent
   * by `persona_key`, and an already-seeded persona is refused rather than
   * silently repointed to a different account.
   */
  seededStudentId: fk("seeded_student_id").references(() => students.id),
  seededCycleId: fk("seeded_cycle_id").references(() => schoolCycles.id),
  createdByAdminId: fk("created_by_admin_id").references(() => users.id),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
});

/**
 * P3 (the runner) — one row per attempt to run a persona through the real
 * conversation engine. `claude/TEST_HARNESS_PLAN_SEP9.md`, P3.3: "a finding
 * must be able to name the exact persona version and sequence version that
 * produced it" — recorded here at the moment a run starts, not
 * reconstructed afterward from whatever session rows happen to exist.
 *
 * `spec_hash` rather than a live join to `harness_personas`: the persona row
 * can be edited after a run started, and the run has to keep pointing at the
 * wording that actually produced it. `checkpoint`/`fidelity` mirror
 * `checkpoint-store.ts`'s vocabulary as plain text (not a shared enum) so
 * that file stays the one place the checkpoint list is defined — this table
 * only ever labels a run with whichever value that file already validated.
 */
export const testRuns = wing.table("test_runs", {
  id: id(),
  personaId: fk("persona_id").notNull().references(() => harnessPersonas.id),
  specHash: text("spec_hash").notNull(),
  /** The published `heuristic_sequences` row in force when the run started —
   *  nullable at the column level, though `activatePersona`/`applyCheckpoint`
   *  already refuse a cycle that publishes nothing, so this should always be
   *  set in practice. */
  sequenceId: fk("sequence_id").references(() => heuristicSequences.id),
  /** One of `checkpoint-store.ts`'s four checkpoint values. Plain text, not
   *  this table's own enum — see the file doc comment above. */
  checkpoint: text("checkpoint").notNull(),
  /** 'marked_complete' | 'replayed' — see `ApplyCheckpointResult`. A finding
   *  read off the wrong fidelity is exactly the failure mode this column
   *  exists to prevent. */
  fidelity: text("fidelity").notNull().default("marked_complete"),
  turnCeiling: integer("turn_ceiling").notNull().default(12),
  /**
   * P3.1's spend/latency guards, added alongside `turn_ceiling` rather than
   * replacing it — `turn_ceiling` bounds how many exchanges happen,
   * `token_budget` bounds what they cost (a turn's own `maxTokens` caps one
   * call; nothing before this capped the sum across a whole run), and
   * `max_wall_clock_seconds` bounds how long a stuck or slow run is allowed
   * to keep going. `tokens_used` is the running total `test-run-engine.ts`
   * updates every turn — cumulative input+output tokens across both the
   * persona's and Wing's calls, so a run that goes over gets caught between
   * turns rather than only after the fact.
   */
  tokenBudget: integer("token_budget").notNull().default(300000),
  tokensUsed: integer("tokens_used").notNull().default(0),
  maxWallClockSeconds: integer("max_wall_clock_seconds").notNull().default(900),
  /** Which Azure OpenAI deployment tier played the persona's side of the
   *  conversation. Null until the run actually starts driving turns (P3.1) —
   *  a provisioned-but-not-yet-run record hasn't chosen one yet. */
  modelDeployment: text("model_deployment"),
  /** 'provisioned' | 'running' | 'completed' | 'aborted'. */
  status: text("status").notNull().default("provisioned"),
  abortReason: text("abort_reason"),
  /**
   * Set only when `status` is 'completed', to distinguish HOW a run
   * completed. Today's one value: 'crisis_hold_asserted' — the persona's own
   * turn tripped IG-S01 mid-run and the run was deliberately ended rather
   * than continuing to drive turns against a student now under a safety
   * hold (Aditya, 11 Sep 2026: "treat hold as success" — `test-run-engine.ts`'s
   * own doc comment has the full reasoning). Null on every ordinary
   * completion, which reads as "completed the normal way, via
   * `finalizeFoundationTurn`'s own `shouldComplete`" — this column adds a
   * reason, it never replaces `status` itself.
   */
  completionReason: text("completion_reason"),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
}, (t) => ({
  personaIdx: index("test_runs_persona_idx").on(t.personaId),
  statusIdx: index("test_runs_status_idx").on(t.status),
}));

/**
 * One row per Foundation session a run actually drives turns against. Today
 * that's always exactly one row (the run's single target session) — kept as
 * its own table rather than a column on `test_runs` so a later run driving
 * several sessions back to back doesn't need a schema change to add.
 */
export const testRunSessions = wing.table("test_run_sessions", {
  id: id(),
  testRunId: fk("test_run_id").notNull().references(() => testRuns.id),
  sessionId: fk("session_id").notNull().references(() => sessions.id),
  /** Denormalized from `sessions.session_type` — cheap, and lets a run's
   *  session list be read without a join for the common case. */
  sessionType: sessionType("session_type").notNull(),
  turnCount: integer("turn_count").notNull().default(0),
  /** 'pending' | 'in_progress' | 'completed' | 'aborted'. */
  status: text("status").notNull().default("pending"),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
}, (t) => ({
  runIdx: index("test_run_sessions_run_idx").on(t.testRunId),
}));


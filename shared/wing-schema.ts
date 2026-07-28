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
export const heuristicComponentType = wing.enum("heuristic_component_type", [
  "signal", "intervention", "coaching_move", "outcome", "module_mapping",
  "population_context", "notes",
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
  name: text("name").notNull(),
  description: text("description").notNull(),
  versionNumber: integer("version_number").notNull().default(1),
  populationTags: text("population_tags").array().notNull().default(sql`'{}'`),
  status: heuristicStatus("status").notNull().default("candidate"),
  createdAt: tsNow("created_at"),
  modifiedAt: tsNow("modified_at"),
});

/** Build now · The seven components as rows, not columns. A refinement
 *  inserts a new row and flips the prior row's is_current to false. */
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
}, (t) => ({
  positionUnique: uniqueIndex("heuristic_sequence_entries_position_unique").on(t.sequenceId, t.position),
  heuristicUnique: uniqueIndex("heuristic_sequence_entries_heuristic_unique").on(t.sequenceId, t.heuristicId),
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
  channel: captureChannel("channel").notNull().default("in_app"),
  classificationStatus: classificationStatus("classification_status").notNull().default("provisional"),
  classifiedBy: classifierActor("classified_by"),
  classifierPromptId: fk("classifier_prompt_id").references(() => classifierPrompts.id),
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

/** Build now · Rotating categorized prompt library, configurable without a
 *  deploy. The "no repeat within 14 days" rule is a query against
 *  message_events.prompt_id, not an unbounded array column. */
export const promptLibrary = wing.table("prompt_library", {
  id: id(),
  category: promptCategory("category").notNull(),
  promptText: text("prompt_text").notNull(),
  populationTags: text("population_tags").array().notNull().default(sql`'{}'`),
  active: boolean("active").notNull().default(true),
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
  providerMessageId: text("provider_message_id"), // SendGrid / Twilio
  sentAt: tsNow("sent_at"),
  deliveredAt: ts("delivered_at"),
  openedAt: ts("opened_at"),
  clickedAt: ts("clicked_at"),
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
});

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
  sourceType: sourceType("source_type").notNull().default("ai_generated"),
  createdAt: tsNow("created_at"),
  updatedAt: tsNow("updated_at"),
});

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
});

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

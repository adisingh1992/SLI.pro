CREATE SCHEMA "wing";
--> statement-breakpoint
CREATE TYPE "wing"."appointment_status" AS ENUM('scheduled', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "wing"."artifact_type" AS ENUM('functional_identity', 'credibility_assessment', 'signature_story', 'module_outcome', 'intake_summary', 'advisor_snapshot', 'wing_summary');--> statement-breakpoint
CREATE TYPE "wing"."billing_type" AS ENUM('one_time', 'subscription', 'license');--> statement-breakpoint
CREATE TYPE "wing"."capture_channel" AS ENUM('in_app', 'voice', 'email_reply', 'sms_reply', 'legacy_import');--> statement-breakpoint
CREATE TYPE "wing"."career_pathway" AS ENUM('employment', 'venture', 'freelance');--> statement-breakpoint
CREATE TYPE "wing"."classification_status" AS ENUM('provisional', 'classified', 'hand_tagged');--> statement-breakpoint
CREATE TYPE "wing"."classifier_actor" AS ENUM('rule', 'nano', 'human');--> statement-breakpoint
CREATE TYPE "wing"."classifier_component_type" AS ENUM('rules', 'examples');--> statement-breakpoint
CREATE TYPE "wing"."classifier_task" AS ENUM('turn_typing', 'signal_prefilter', 'routing');--> statement-breakpoint
CREATE TYPE "wing"."content_draft_type" AS ENUM('post', 'article');--> statement-breakpoint
CREATE TYPE "wing"."content_status" AS ENUM('draft', 'final', 'published');--> statement-breakpoint
CREATE TYPE "wing"."cycle_status" AS ENUM('active', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "wing"."discovery_source" AS ENUM('university_partnership', 'colleague_or_mentor', 'linkedin', 'web_search', 'professional_network_or_conference', 'other');--> statement-breakpoint
CREATE TYPE "wing"."document_type" AS ENUM('resume', 'linkedin', 'essay', 'assessment', 'certificate', 'other');--> statement-breakpoint
CREATE TYPE "wing"."enrollment_status" AS ENUM('prospective', 'active', 'graduated', 'withdrawn');--> statement-breakpoint
CREATE TYPE "wing"."entitlement_source" AS ENUM('purchase', 'institutional_license');--> statement-breakpoint
CREATE TYPE "wing"."entitlement_status" AS ENUM('active', 'expired', 'canceled');--> statement-breakpoint
CREATE TYPE "wing"."entry_type" AS ENUM('career', 'personal');--> statement-breakpoint
CREATE TYPE "wing"."heuristic_component_type" AS ENUM('signal', 'intervention', 'coaching_move', 'outcome', 'module_mapping', 'population_context', 'notes');--> statement-breakpoint
CREATE TYPE "wing"."heuristic_status" AS ENUM('candidate', 'validated', 'retired');--> statement-breakpoint
CREATE TYPE "wing"."institution_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "wing"."message_channel" AS ENUM('email', 'sms', 'in_app');--> statement-breakpoint
CREATE TYPE "wing"."message_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "wing"."outcome_signal" AS ENUM('breakthrough', 'positive', 'neutral', 'regression', 'correction');--> statement-breakpoint
CREATE TYPE "wing"."pattern_status" AS ENUM('pending_review', 'accepted', 'rejected', 'authored');--> statement-breakpoint
CREATE TYPE "wing"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "wing"."plan_audience" AS ENUM('institutional', 'direct');--> statement-breakpoint
CREATE TYPE "wing"."professional_status" AS ENUM('undergraduate_or_recent_grad', 'early_career', 'mid_career_or_senior', 'career_break_or_transition');--> statement-breakpoint
CREATE TYPE "wing"."prompt_category" AS ENUM('career', 'personal', 'content', 'education', 'encouragement', 'fun', 'design_thinking');--> statement-breakpoint
CREATE TYPE "wing"."proposal_response" AS ENUM('accepted', 'declined', 'deferred');--> statement-breakpoint
CREATE TYPE "wing"."provenance_tag" AS ENUM('ai_generated', 'human_elicited', 'human_spontaneous', 'human_correction', 'provenance_unknown');--> statement-breakpoint
CREATE TYPE "wing"."publish_status" AS ENUM('draft', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "wing"."sequence_owner_type" AS ENUM('school_cycle', 'student');--> statement-breakpoint
CREATE TYPE "wing"."sequence_status" AS ENUM('active', 'paused', 'completed', 'silenced');--> statement-breakpoint
CREATE TYPE "wing"."session_status" AS ENUM('locked', 'available', 'in_progress', 'completed', 'ended_early');--> statement-breakpoint
CREATE TYPE "wing"."session_type" AS ENUM('intake', 'foundation_1', 'foundation_2', 'foundation_3', 'enhancement_a', 'enhancement_b', 'enhancement_c', 'ongoing_engagement', 'career_event_review', 'module_run');--> statement-breakpoint
CREATE TYPE "wing"."sli_source" AS ENUM('generated', 'custom', 'refined', 'refresh');--> statement-breakpoint
CREATE TYPE "wing"."sli_status" AS ENUM('candidate', 'selected', 'active', 'superseded');--> statement-breakpoint
CREATE TYPE "wing"."source_type" AS ENUM('human_originated', 'ai_generated');--> statement-breakpoint
CREATE TYPE "wing"."student_origin" AS ENUM('institutional', 'direct');--> statement-breakpoint
CREATE TYPE "wing"."transcript_status" AS ENUM('complete', 'incomplete', 'migrated_provenance_unknown');--> statement-breakpoint
CREATE TYPE "wing"."turn_type" AS ENUM('ai_prompt', 'human_elicited_response', 'human_spontaneous', 'human_correction', 'ai_adapted');--> statement-breakpoint
CREATE TYPE "wing"."user_role" AS ENUM('student', 'advisor', 'institution_admin', 'platform_admin');--> statement-breakpoint
CREATE TYPE "wing"."user_status" AS ENUM('active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "wing"."verification_status" AS ENUM('pending', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "wing"."voice_component_type" AS ENUM('trait_hierarchy', 'tone_rule', 'language_principle', 'anti_pattern', 'calibration_example', 'delivery_doorway');--> statement-breakpoint
CREATE TYPE "wing"."voice_context" AS ENUM('intake', 'foundation_session', 'ongoing_engagement', 'setback', 'notification');--> statement-breakpoint
CREATE TABLE "wing"."admin_audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."admin_audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" bigint NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" bigint,
	"detail" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."advisor_appointments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."advisor_appointments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"advisor_id" bigint NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot" jsonb,
	"snapshot_sent_at" timestamp with time zone,
	"student_prompt_sent_at" timestamp with time zone,
	"status" "wing"."appointment_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."advisors" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."advisors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"institution_id" bigint NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"user_id" bigint,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."classifier_prompt_components" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."classifier_prompt_components_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"classifier_prompt_id" bigint NOT NULL,
	"component_type" "wing"."classifier_component_type" NOT NULL,
	"content" jsonb NOT NULL,
	"source_turn_id" bigint,
	"version_number" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."classifier_prompts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."classifier_prompts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"task" "wing"."classifier_task" DEFAULT 'turn_typing' NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"status" "wing"."publish_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."content_drafts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."content_drafts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"draft_type" "wing"."content_draft_type" NOT NULL,
	"content" jsonb NOT NULL,
	"iteration" smallint DEFAULT 1 NOT NULL,
	"sli_id" bigint,
	"module_completion_id" bigint,
	"status" "wing"."content_status" DEFAULT 'draft' NOT NULL,
	"published_url" text,
	"published_at" timestamp with time zone,
	"source_type" "wing"."source_type" DEFAULT 'ai_generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."documents" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"name" text NOT NULL,
	"doc_type" "wing"."document_type" NOT NULL,
	"blob_uri" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"extracted_text" text,
	"analysis" jsonb,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."engagement_sequence_states" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."engagement_sequence_states_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"sequence_key" text NOT NULL,
	"current_step" smallint DEFAULT 0 NOT NULL,
	"status" "wing"."sequence_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_run_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wing"."entitlements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."entitlements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"plan_id" bigint NOT NULL,
	"source" "wing"."entitlement_source" NOT NULL,
	"institution_id" bigint,
	"cycle_id" bigint,
	"status" "wing"."entitlement_status" DEFAULT 'active' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."evidence_portfolio_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."evidence_portfolio_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"sli_id" bigint,
	"positioning_claim" text NOT NULL,
	"evidence" text NOT NULL,
	"competency_category" text NOT NULL,
	"source_session_id" bigint,
	"source_turn_id" bigint,
	"source_type" "wing"."source_type" DEFAULT 'ai_generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."freshness_reports" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."freshness_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"questionnaire_analysis" jsonb,
	"resume_analysis" jsonb,
	"linkedin_analysis" jsonb,
	"additional_documents_analysis" jsonb,
	"final_synthesis" jsonb,
	"source_type" "wing"."source_type" DEFAULT 'ai_generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."heuristic_components" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."heuristic_components_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"heuristic_id" bigint NOT NULL,
	"component_type" "wing"."heuristic_component_type" NOT NULL,
	"content" text NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"supersedes_component_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."heuristic_sequence_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."heuristic_sequence_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"sequence_id" bigint NOT NULL,
	"heuristic_id" bigint NOT NULL,
	"position" smallint NOT NULL,
	"weight" numeric(5, 2) DEFAULT '1.0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."heuristic_sequences" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."heuristic_sequences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"owner_type" "wing"."sequence_owner_type" NOT NULL,
	"owner_id" bigint NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"active_from" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."heuristics" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."heuristics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"population_tags" text[] DEFAULT '{}' NOT NULL,
	"status" "wing"."heuristic_status" DEFAULT 'candidate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."institution_calendar_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."institution_calendar_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"institution_id" bigint NOT NULL,
	"label" text NOT NULL,
	"event_date" date NOT NULL,
	"template_key" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."institutions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."institutions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"country" text NOT NULL,
	"population_tags" text[] DEFAULT '{}' NOT NULL,
	"primary_contact_name" text,
	"primary_contact_email" text,
	"status" "wing"."institution_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."intake_records" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."intake_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"session_id" bigint,
	"pathway" "wing"."career_pathway",
	"structured_responses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"verification_status" "wing"."verification_status" DEFAULT 'pending' NOT NULL,
	"early_insight_delivered_at" timestamp with time zone,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_records_student_id_unique" UNIQUE("student_id")
);
--> statement-breakpoint
CREATE TABLE "wing"."legacy_records" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."legacy_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"record_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"original_created_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."life_log_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."life_log_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"entry_type" "wing"."entry_type" NOT NULL,
	"prompt_id" bigint,
	"entry_text" text NOT NULL,
	"voice_recording_uri" text,
	"wing_response" text,
	"sli_connections" jsonb,
	"patterns_noted" jsonb,
	"competencies" text[] DEFAULT '{}' NOT NULL,
	"vector_embedding" vector(1536),
	"capture_source" "wing"."capture_channel" DEFAULT 'in_app' NOT NULL,
	"session_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."linkedin_optimizations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."linkedin_optimizations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"sli_id" bigint,
	"holistic_review" jsonb NOT NULL,
	"source_type" "wing"."source_type" DEFAULT 'ai_generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."message_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."message_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint,
	"advisor_id" bigint,
	"channel" "wing"."message_channel" NOT NULL,
	"direction" "wing"."message_direction" NOT NULL,
	"template_key" text,
	"template_version" integer,
	"sequence_key" text,
	"sequence_step" smallint,
	"prompt_id" bigint,
	"provider_message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"reply_content" text,
	"logged_life_log_entry_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."message_templates" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."message_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"template_key" text NOT NULL,
	"channel" "wing"."message_channel" NOT NULL,
	"subject_template" text,
	"body_template" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."password_resets" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."password_resets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "wing"."pattern_detection_queue" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."pattern_detection_queue_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cycle_id" bigint NOT NULL,
	"pattern_description" text NOT NULL,
	"supporting_turn_ids" bigint[] DEFAULT '{}' NOT NULL,
	"candidate_card_draft" jsonb,
	"status" "wing"."pattern_status" DEFAULT 'pending_review' NOT NULL,
	"reviewed_by" bigint,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."pricing_plans" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."pricing_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"audience" "wing"."plan_audience" NOT NULL,
	"billing_type" "wing"."billing_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'usd' NOT NULL,
	"billing_interval" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "wing"."prompt_library" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."prompt_library_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"category" "wing"."prompt_category" NOT NULL,
	"prompt_text" text NOT NULL,
	"population_tags" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."school_cycles" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."school_cycles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"institution_id" bigint NOT NULL,
	"cycle_year" smallint NOT NULL,
	"label" text,
	"cohort_start_date" date NOT NULL,
	"cohort_end_date" date NOT NULL,
	"active_heuristic_sequence_id" bigint,
	"classifier_prompt_id" bigint,
	"voice_profile_id" bigint,
	"evaluation_window_start" date,
	"evaluation_window_end" date,
	"status" "wing"."cycle_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."session_artifacts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."session_artifacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" bigint NOT NULL,
	"artifact_type" "wing"."artifact_type" NOT NULL,
	"content" jsonb NOT NULL,
	"source_type" "wing"."source_type" DEFAULT 'ai_generated' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."sessions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"cycle_id" bigint,
	"session_type" "wing"."session_type" NOT NULL,
	"status" "wing"."session_status" DEFAULT 'available' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"timer_elapsed_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."sli_records" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."sli_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"title" text NOT NULL,
	"statement" text NOT NULL,
	"rationale" text,
	"source" "wing"."sli_source" NOT NULL,
	"status" "wing"."sli_status" DEFAULT 'candidate' NOT NULL,
	"parent_sli_id" bigint,
	"refinement_count" smallint DEFAULT 0 NOT NULL,
	"generated_in_session_id" bigint,
	"source_type" "wing"."source_type" DEFAULT 'ai_generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wing"."students" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."students_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"institution_id" bigint,
	"cycle_id" bigint,
	"origin" "wing"."student_origin" DEFAULT 'institutional' NOT NULL,
	"enrollment_status" "wing"."enrollment_status" DEFAULT 'active' NOT NULL,
	"graduation_date" date,
	"personal_sequence_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "wing"."transactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"plan_id" bigint,
	"stripe_payment_id" text,
	"stripe_session_id" text,
	"amount_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'usd' NOT NULL,
	"status" "wing"."payment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."transcript_turns" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."transcript_turns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"transcript_id" bigint NOT NULL,
	"sequence_position" integer NOT NULL,
	"turn_type" "wing"."turn_type" NOT NULL,
	"content" text NOT NULL,
	"provenance_tag" "wing"."provenance_tag" NOT NULL,
	"active_heuristic_id" bigint,
	"signal_detected" boolean DEFAULT false NOT NULL,
	"channel" "wing"."capture_channel" DEFAULT 'in_app' NOT NULL,
	"classification_status" "wing"."classification_status" DEFAULT 'provisional' NOT NULL,
	"classified_by" "wing"."classifier_actor",
	"classifier_prompt_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."transcripts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."transcripts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" bigint NOT NULL,
	"status" "wing"."transcript_status" DEFAULT 'incomplete' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcripts_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "wing"."user_channel_preferences" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"email_opt_in" boolean DEFAULT true NOT NULL,
	"sms_opt_in" boolean DEFAULT false NOT NULL,
	"sms_verified_at" timestamp with time zone,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"micro_prompts_paused" boolean DEFAULT false NOT NULL,
	"preferred_channel" "wing"."message_channel" DEFAULT 'email' NOT NULL,
	"daily_prompt_hour_local" smallint DEFAULT 8 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."user_delivery_profiles" (
	"student_id" bigint PRIMARY KEY NOT NULL,
	"observed_signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_doorway_component_id" bigint,
	"confidence" numeric(4, 3),
	"last_evaluated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."user_heuristic_applications" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."user_heuristic_applications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"session_id" bigint NOT NULL,
	"heuristic_id" bigint NOT NULL,
	"heuristic_component_id" bigint NOT NULL,
	"turn_id" bigint,
	"cycle_id" bigint,
	"sequence_id" bigint NOT NULL,
	"outcome_signal" "wing"."outcome_signal",
	"notes" text,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."user_heuristic_scores" (
	"student_id" bigint NOT NULL,
	"heuristic_id" bigint NOT NULL,
	"cycle_id" bigint NOT NULL,
	"sessions_applied" integer DEFAULT 0 NOT NULL,
	"positive_signal_count" integer DEFAULT 0 NOT NULL,
	"regression_count" integer DEFAULT 0 NOT NULL,
	"composite_score" numeric(6, 2),
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_heuristic_scores_student_id_heuristic_id_cycle_id_pk" PRIMARY KEY("student_id","heuristic_id","cycle_id")
);
--> statement-breakpoint
CREATE TABLE "wing"."user_memory_embeddings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."user_memory_embeddings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"turn_id" bigint NOT NULL,
	"transcript_id" bigint NOT NULL,
	"session_id" bigint NOT NULL,
	"heuristic_context" jsonb,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_memory_embeddings_turn_id_unique" UNIQUE("turn_id")
);
--> statement-breakpoint
CREATE TABLE "wing"."user_sessions" (
	"sid" text PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."users" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone_number" text,
	"role" "wing"."user_role" DEFAULT 'student' NOT NULL,
	"linkedin_id" text,
	"linkedin_access_token" text,
	"linkedin_refresh_token" text,
	"linkedin_token_expiry" timestamp with time zone,
	"professional_status" "wing"."professional_status",
	"discovery_source" "wing"."discovery_source",
	"discovery_source_other" text,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"is_test_user" boolean DEFAULT false NOT NULL,
	"status" "wing"."user_status" DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_linkedin_id_unique" UNIQUE("linkedin_id")
);
--> statement-breakpoint
CREATE TABLE "wing"."voice_profile_components" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."voice_profile_components_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"voice_profile_id" bigint NOT NULL,
	"component_type" "wing"."voice_component_type" NOT NULL,
	"context" "wing"."voice_context",
	"content" jsonb NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wing"."voice_profiles" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."voice_profiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"status" "wing"."publish_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "wing"."admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."advisor_appointments" ADD CONSTRAINT "advisor_appointments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."advisor_appointments" ADD CONSTRAINT "advisor_appointments_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "wing"."advisors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."advisors" ADD CONSTRAINT "advisors_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "wing"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."advisors" ADD CONSTRAINT "advisors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."classifier_prompt_components" ADD CONSTRAINT "classifier_prompt_components_classifier_prompt_id_classifier_prompts_id_fk" FOREIGN KEY ("classifier_prompt_id") REFERENCES "wing"."classifier_prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."classifier_prompt_components" ADD CONSTRAINT "classifier_prompt_components_source_turn_id_transcript_turns_id_fk" FOREIGN KEY ("source_turn_id") REFERENCES "wing"."transcript_turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."content_drafts" ADD CONSTRAINT "content_drafts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."content_drafts" ADD CONSTRAINT "content_drafts_sli_id_sli_records_id_fk" FOREIGN KEY ("sli_id") REFERENCES "wing"."sli_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."documents" ADD CONSTRAINT "documents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."engagement_sequence_states" ADD CONSTRAINT "engagement_sequence_states_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."entitlements" ADD CONSTRAINT "entitlements_plan_id_pricing_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "wing"."pricing_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."entitlements" ADD CONSTRAINT "entitlements_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "wing"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."entitlements" ADD CONSTRAINT "entitlements_cycle_id_school_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "wing"."school_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."evidence_portfolio_items" ADD CONSTRAINT "evidence_portfolio_items_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."evidence_portfolio_items" ADD CONSTRAINT "evidence_portfolio_items_sli_id_sli_records_id_fk" FOREIGN KEY ("sli_id") REFERENCES "wing"."sli_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."evidence_portfolio_items" ADD CONSTRAINT "evidence_portfolio_items_source_session_id_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "wing"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."evidence_portfolio_items" ADD CONSTRAINT "evidence_portfolio_items_source_turn_id_transcript_turns_id_fk" FOREIGN KEY ("source_turn_id") REFERENCES "wing"."transcript_turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."freshness_reports" ADD CONSTRAINT "freshness_reports_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."heuristic_components" ADD CONSTRAINT "heuristic_components_heuristic_id_heuristics_id_fk" FOREIGN KEY ("heuristic_id") REFERENCES "wing"."heuristics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."heuristic_components" ADD CONSTRAINT "heuristic_components_supersedes_component_id_heuristic_components_id_fk" FOREIGN KEY ("supersedes_component_id") REFERENCES "wing"."heuristic_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."heuristic_sequence_entries" ADD CONSTRAINT "heuristic_sequence_entries_sequence_id_heuristic_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "wing"."heuristic_sequences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."heuristic_sequence_entries" ADD CONSTRAINT "heuristic_sequence_entries_heuristic_id_heuristics_id_fk" FOREIGN KEY ("heuristic_id") REFERENCES "wing"."heuristics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."institution_calendar_events" ADD CONSTRAINT "institution_calendar_events_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "wing"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."intake_records" ADD CONSTRAINT "intake_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."intake_records" ADD CONSTRAINT "intake_records_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "wing"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."legacy_records" ADD CONSTRAINT "legacy_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."life_log_entries" ADD CONSTRAINT "life_log_entries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."life_log_entries" ADD CONSTRAINT "life_log_entries_prompt_id_prompt_library_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "wing"."prompt_library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."life_log_entries" ADD CONSTRAINT "life_log_entries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "wing"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."linkedin_optimizations" ADD CONSTRAINT "linkedin_optimizations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."linkedin_optimizations" ADD CONSTRAINT "linkedin_optimizations_sli_id_sli_records_id_fk" FOREIGN KEY ("sli_id") REFERENCES "wing"."sli_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."message_events" ADD CONSTRAINT "message_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."message_events" ADD CONSTRAINT "message_events_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "wing"."advisors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."message_events" ADD CONSTRAINT "message_events_prompt_id_prompt_library_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "wing"."prompt_library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."message_events" ADD CONSTRAINT "message_events_logged_life_log_entry_id_life_log_entries_id_fk" FOREIGN KEY ("logged_life_log_entry_id") REFERENCES "wing"."life_log_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."pattern_detection_queue" ADD CONSTRAINT "pattern_detection_queue_cycle_id_school_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "wing"."school_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."pattern_detection_queue" ADD CONSTRAINT "pattern_detection_queue_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."school_cycles" ADD CONSTRAINT "school_cycles_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "wing"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."school_cycles" ADD CONSTRAINT "school_cycles_active_heuristic_sequence_id_heuristic_sequences_id_fk" FOREIGN KEY ("active_heuristic_sequence_id") REFERENCES "wing"."heuristic_sequences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."school_cycles" ADD CONSTRAINT "school_cycles_classifier_prompt_id_classifier_prompts_id_fk" FOREIGN KEY ("classifier_prompt_id") REFERENCES "wing"."classifier_prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."school_cycles" ADD CONSTRAINT "school_cycles_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "wing"."voice_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."session_artifacts" ADD CONSTRAINT "session_artifacts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "wing"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."sessions" ADD CONSTRAINT "sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."sessions" ADD CONSTRAINT "sessions_cycle_id_school_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "wing"."school_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."sli_records" ADD CONSTRAINT "sli_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."sli_records" ADD CONSTRAINT "sli_records_parent_sli_id_sli_records_id_fk" FOREIGN KEY ("parent_sli_id") REFERENCES "wing"."sli_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."sli_records" ADD CONSTRAINT "sli_records_generated_in_session_id_sessions_id_fk" FOREIGN KEY ("generated_in_session_id") REFERENCES "wing"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."students" ADD CONSTRAINT "students_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "wing"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."students" ADD CONSTRAINT "students_cycle_id_school_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "wing"."school_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."students" ADD CONSTRAINT "students_personal_sequence_id_heuristic_sequences_id_fk" FOREIGN KEY ("personal_sequence_id") REFERENCES "wing"."heuristic_sequences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."transactions" ADD CONSTRAINT "transactions_plan_id_pricing_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "wing"."pricing_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."transcript_turns" ADD CONSTRAINT "transcript_turns_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "wing"."transcripts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."transcript_turns" ADD CONSTRAINT "transcript_turns_active_heuristic_id_heuristics_id_fk" FOREIGN KEY ("active_heuristic_id") REFERENCES "wing"."heuristics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."transcript_turns" ADD CONSTRAINT "transcript_turns_classifier_prompt_id_classifier_prompts_id_fk" FOREIGN KEY ("classifier_prompt_id") REFERENCES "wing"."classifier_prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."transcripts" ADD CONSTRAINT "transcripts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "wing"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_channel_preferences" ADD CONSTRAINT "user_channel_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_delivery_profiles" ADD CONSTRAINT "user_delivery_profiles_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_delivery_profiles" ADD CONSTRAINT "user_delivery_profiles_current_doorway_component_id_voice_profile_components_id_fk" FOREIGN KEY ("current_doorway_component_id") REFERENCES "wing"."voice_profile_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_heuristic_applications" ADD CONSTRAINT "user_heuristic_applications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_heuristic_applications" ADD CONSTRAINT "user_heuristic_applications_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "wing"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_heuristic_applications" ADD CONSTRAINT "user_heuristic_applications_heuristic_id_heuristics_id_fk" FOREIGN KEY ("heuristic_id") REFERENCES "wing"."heuristics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_heuristic_applications" ADD CONSTRAINT "user_heuristic_applications_heuristic_component_id_heuristic_components_id_fk" FOREIGN KEY ("heuristic_component_id") REFERENCES "wing"."heuristic_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_heuristic_applications" ADD CONSTRAINT "user_heuristic_applications_turn_id_transcript_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "wing"."transcript_turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_heuristic_applications" ADD CONSTRAINT "user_heuristic_applications_cycle_id_school_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "wing"."school_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_heuristic_applications" ADD CONSTRAINT "user_heuristic_applications_sequence_id_heuristic_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "wing"."heuristic_sequences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_heuristic_scores" ADD CONSTRAINT "user_heuristic_scores_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_heuristic_scores" ADD CONSTRAINT "user_heuristic_scores_heuristic_id_heuristics_id_fk" FOREIGN KEY ("heuristic_id") REFERENCES "wing"."heuristics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_heuristic_scores" ADD CONSTRAINT "user_heuristic_scores_cycle_id_school_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "wing"."school_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_memory_embeddings" ADD CONSTRAINT "user_memory_embeddings_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "wing"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_memory_embeddings" ADD CONSTRAINT "user_memory_embeddings_turn_id_transcript_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "wing"."transcript_turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_memory_embeddings" ADD CONSTRAINT "user_memory_embeddings_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "wing"."transcripts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."user_memory_embeddings" ADD CONSTRAINT "user_memory_embeddings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "wing"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."voice_profile_components" ADD CONSTRAINT "voice_profile_components_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "wing"."voice_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_entity_idx" ON "wing"."admin_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "admin_audit_log_actor_idx" ON "wing"."admin_audit_log" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "advisors_institution_email_unique" ON "wing"."advisors" USING btree ("institution_id","email");--> statement-breakpoint
CREATE INDEX "classifier_prompt_components_lookup_idx" ON "wing"."classifier_prompt_components" USING btree ("classifier_prompt_id","component_type","is_current");--> statement-breakpoint
CREATE INDEX "documents_student_type_idx" ON "wing"."documents" USING btree ("student_id","doc_type");--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_sequence_states_student_key_unique" ON "wing"."engagement_sequence_states" USING btree ("student_id","sequence_key");--> statement-breakpoint
CREATE INDEX "engagement_sequence_states_schedule_idx" ON "wing"."engagement_sequence_states" USING btree ("next_run_at","status");--> statement-breakpoint
CREATE INDEX "entitlements_user_status_idx" ON "wing"."entitlements" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "heuristic_components_lookup_idx" ON "wing"."heuristic_components" USING btree ("heuristic_id","component_type","is_current");--> statement-breakpoint
CREATE INDEX "heuristic_components_current_idx" ON "wing"."heuristic_components" USING btree ("heuristic_id") WHERE "wing"."heuristic_components"."is_current";--> statement-breakpoint
CREATE UNIQUE INDEX "heuristic_sequence_entries_position_unique" ON "wing"."heuristic_sequence_entries" USING btree ("sequence_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "heuristic_sequence_entries_heuristic_unique" ON "wing"."heuristic_sequence_entries" USING btree ("sequence_id","heuristic_id");--> statement-breakpoint
CREATE INDEX "heuristic_sequences_owner_idx" ON "wing"."heuristic_sequences" USING btree ("owner_type","owner_id","superseded_at");--> statement-breakpoint
CREATE INDEX "institution_calendar_events_inst_date_idx" ON "wing"."institution_calendar_events" USING btree ("institution_id","event_date");--> statement-breakpoint
CREATE INDEX "legacy_records_student_type_idx" ON "wing"."legacy_records" USING btree ("student_id","record_type");--> statement-breakpoint
CREATE INDEX "life_log_entries_student_created_idx" ON "wing"."life_log_entries" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "message_events_student_sent_idx" ON "wing"."message_events" USING btree ("student_id","sent_at");--> statement-breakpoint
CREATE INDEX "message_events_channel_sent_idx" ON "wing"."message_events" USING btree ("channel","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_key_channel_version_unique" ON "wing"."message_templates" USING btree ("template_key","channel","version");--> statement-breakpoint
CREATE INDEX "school_cycles_institution_year_idx" ON "wing"."school_cycles" USING btree ("institution_id","cycle_year");--> statement-breakpoint
CREATE INDEX "session_artifacts_session_type_idx" ON "wing"."session_artifacts" USING btree ("session_id","artifact_type");--> statement-breakpoint
CREATE INDEX "sessions_student_type_idx" ON "wing"."sessions" USING btree ("student_id","session_type");--> statement-breakpoint
CREATE INDEX "sessions_student_created_idx" ON "wing"."sessions" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "sli_records_student_status_idx" ON "wing"."sli_records" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "students_institution_cycle_idx" ON "wing"."students" USING btree ("institution_id","cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_turns_position_unique" ON "wing"."transcript_turns" USING btree ("transcript_id","sequence_position");--> statement-breakpoint
CREATE INDEX "transcript_turns_type_idx" ON "wing"."transcript_turns" USING btree ("turn_type");--> statement-breakpoint
CREATE INDEX "transcript_turns_heuristic_idx" ON "wing"."transcript_turns" USING btree ("active_heuristic_id");--> statement-breakpoint
CREATE INDEX "transcript_turns_provisional_idx" ON "wing"."transcript_turns" USING btree ("created_at") WHERE "wing"."transcript_turns"."classification_status" = 'provisional';--> statement-breakpoint
CREATE INDEX "user_heuristic_applications_student_applied_idx" ON "wing"."user_heuristic_applications" USING btree ("student_id","applied_at");--> statement-breakpoint
CREATE INDEX "user_heuristic_applications_heuristic_idx" ON "wing"."user_heuristic_applications" USING btree ("heuristic_id");--> statement-breakpoint
CREATE INDEX "user_heuristic_applications_session_idx" ON "wing"."user_heuristic_applications" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "user_memory_embeddings_hnsw_idx" ON "wing"."user_memory_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "user_memory_embeddings_student_idx" ON "wing"."user_memory_embeddings" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "user_sessions_expire_idx" ON "wing"."user_sessions" USING btree ("expire");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "wing"."users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "voice_profile_components_lookup_idx" ON "wing"."voice_profile_components" USING btree ("voice_profile_id","component_type","is_current");
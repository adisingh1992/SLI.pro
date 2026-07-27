CREATE TYPE "public"."branding_intake_platform" AS ENUM('undergraduate', 'early_career', 'mid_career');--> statement-breakpoint
CREATE TYPE "public"."discovery_source" AS ENUM('university_partnership', 'colleague_or_mentor', 'linkedin', 'web_search', 'professional_network_or_conference', 'other');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."professional_status" AS ENUM('undergraduate_or_recent_grad', 'early_career', 'mid_career_or_senior', 'career_break_or_transition');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('locked', 'available', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'expired', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('free', 'premium', 'subscription');--> statement-breakpoint
CREATE TABLE "branding_intakes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"platform" "branding_intake_platform" NOT NULL,
	"current_stage" integer DEFAULT 1 NOT NULL,
	"responses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"marketing_opt_in" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "branding_intakes_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "coaching_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"admin_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"basic_info" jsonb NOT NULL,
	"functional_categorization" jsonb NOT NULL,
	"career_transition" jsonb NOT NULL,
	"strengths_and_positioning" jsonb NOT NULL,
	"digital_presence" jsonb NOT NULL,
	"psychology_and_motivation" jsonb NOT NULL,
	"content_strategy" jsonb NOT NULL,
	"recommendations" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text DEFAULT 'New Conversation' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_data" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"analysis_content" text
);
--> statement-breakpoint
CREATE TABLE "education" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"degree" text NOT NULL,
	"institution" text NOT NULL,
	"start_year" text NOT NULL,
	"end_year" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "enhancement_module_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" integer NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enhancement_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"module_code" varchar(1) NOT NULL,
	"status" "session_status" DEFAULT 'available' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"timer_elapsed" integer DEFAULT 0,
	"completion_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "enhancement_modules_user_id_module_code_unique" UNIQUE("user_id","module_code"),
	CONSTRAINT "module_code_check" CHECK ("enhancement_modules"."module_code" IN ('A', 'B', 'C'))
);
--> statement-breakpoint
CREATE TABLE "experiences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"description" text,
	"current" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "foundation_session_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"session_number" integer NOT NULL,
	"status" "session_status" DEFAULT 'locked' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"timer_elapsed" integer DEFAULT 0,
	"completion_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "foundation_sessions_user_id_session_number_unique" UNIQUE("user_id","session_number"),
	CONSTRAINT "session_number_check" CHECK ("foundation_sessions"."session_number" >= 1 AND "foundation_sessions"."session_number" <= 3)
);
--> statement-breakpoint
CREATE TABLE "freshness_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"questionnaire_analysis" jsonb,
	"resume_analysis" jsonb,
	"linkedin_analysis" jsonb,
	"additional_documents_analysis" jsonb DEFAULT '[]'::jsonb,
	"final_synthesis" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homework_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"admin_id" integer NOT NULL,
	"question_text" text NOT NULL,
	"answer_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"proficiency" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linkedin_content_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"post1_type" text NOT NULL,
	"post1_content" jsonb NOT NULL,
	"post2_type" text NOT NULL,
	"post2_content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linkedin_optimizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"alignment_assessment" text,
	"headline_optimization" jsonb,
	"about_section" jsonb,
	"profile_enhancements" jsonb,
	"content_strategy" jsonb,
	"implementation_priorities" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linkedin_post_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"draft_id" integer NOT NULL,
	"post_number" integer NOT NULL,
	"share_count" integer DEFAULT 0 NOT NULL,
	"last_shared_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_check_ins" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"month" text NOT NULL,
	"content_posts" integer NOT NULL,
	"content_links" jsonb DEFAULT '[]'::jsonb,
	"content_screenshots" jsonb DEFAULT '[]'::jsonb,
	"engagement_frequency" text NOT NULL,
	"engagement_screenshot" text,
	"updated_profile_visuals" boolean DEFAULT false,
	"profile_screenshot" text,
	"new_connections" integer NOT NULL,
	"target_connection_percentage" text NOT NULL,
	"recommendation_implementation" text NOT NULL,
	"implementation_challenges" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"completion_step" integer DEFAULT 0,
	"is_complete" boolean DEFAULT false,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "questionnaires" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"industry" text,
	"background" text,
	"goals" text,
	"aspirations" text,
	"challenges" text,
	"interests" text,
	"timeframe" text,
	"raw_answers" jsonb,
	"is_draft" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slis" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"admin_id" integer NOT NULL,
	"title1" text NOT NULL,
	"statement1" text NOT NULL,
	"rationale1" text NOT NULL,
	"title2" text NOT NULL,
	"statement2" text NOT NULL,
	"rationale2" text NOT NULL,
	"title3" text NOT NULL,
	"statement3" text NOT NULL,
	"rationale3" text NOT NULL,
	"selected_sli_index" integer,
	"custom_sli_text" text,
	"refined_sli_text" text,
	"refinement_rationale" text,
	"implementation_guidance" text,
	"refined_at" timestamp,
	"refinement_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"stripe_payment_id" text,
	"stripe_session_id" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"tier" "subscription_tier" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone_number" text,
	"linkedin_id" text,
	"linkedin_access_token" text,
	"linkedin_refresh_token" text,
	"linkedin_token_expiry" timestamp,
	"headline" text,
	"bio" text,
	"location" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_test_user" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp,
	"subscription_tier" "subscription_tier" DEFAULT 'subscription' NOT NULL,
	"subscription_status" "subscription_status" DEFAULT 'active',
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_expires_at" timestamp,
	"premium_purchased_at" timestamp,
	"professional_status" "professional_status",
	"discovery_source" "discovery_source",
	"discovery_source_other" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_linkedin_id_unique" UNIQUE("linkedin_id")
);
--> statement-breakpoint
ALTER TABLE "branding_intakes" ADD CONSTRAINT "branding_intakes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_notes" ADD CONSTRAINT "coaching_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_notes" ADD CONSTRAINT "coaching_notes_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "education" ADD CONSTRAINT "education_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhancement_module_messages" ADD CONSTRAINT "enhancement_module_messages_module_id_enhancement_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."enhancement_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhancement_modules" ADD CONSTRAINT "enhancement_modules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_session_messages" ADD CONSTRAINT "foundation_session_messages_session_id_foundation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."foundation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_sessions" ADD CONSTRAINT "foundation_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freshness_reports" ADD CONSTRAINT "freshness_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "languages" ADD CONSTRAINT "languages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_content_drafts" ADD CONSTRAINT "linkedin_content_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_optimizations" ADD CONSTRAINT "linkedin_optimizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_post_shares" ADD CONSTRAINT "linkedin_post_shares_draft_id_linkedin_content_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."linkedin_content_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_check_ins" ADD CONSTRAINT "monthly_check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis" ADD CONSTRAINT "slis_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slis" ADD CONSTRAINT "slis_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enhancement_module_messages_module_time_idx" ON "enhancement_module_messages" USING btree ("module_id","created_at");--> statement-breakpoint
CREATE INDEX "enhancement_modules_user_module_idx" ON "enhancement_modules" USING btree ("user_id","module_code");--> statement-breakpoint
CREATE INDEX "foundation_session_messages_session_time_idx" ON "foundation_session_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "foundation_sessions_user_session_idx" ON "foundation_sessions" USING btree ("user_id","session_number");
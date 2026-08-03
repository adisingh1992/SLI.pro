CREATE TABLE "wing"."session_completion_criteria" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."session_completion_criteria_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"population_tag" text NOT NULL,
	"session_type" "wing"."session_type" NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"status" "wing"."publish_status" DEFAULT 'draft' NOT NULL,
	"criteria" jsonb NOT NULL,
	"change_note" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "wing"."session_completion_criteria" ADD CONSTRAINT "session_completion_criteria_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_completion_criteria_lookup_idx" ON "wing"."session_completion_criteria" USING btree ("population_tag","session_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "session_completion_criteria_published_unique" ON "wing"."session_completion_criteria" USING btree ("population_tag","session_type") WHERE "wing"."session_completion_criteria"."status" = 'published';
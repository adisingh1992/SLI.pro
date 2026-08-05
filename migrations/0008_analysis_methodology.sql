CREATE TABLE "wing"."analysis_methodology" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."analysis_methodology_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"population_tag" text NOT NULL,
	"session_type" "wing"."session_type" NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"status" "wing"."publish_status" DEFAULT 'draft' NOT NULL,
	"sections" jsonb NOT NULL,
	"change_note" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "wing"."analysis_methodology" ADD CONSTRAINT "analysis_methodology_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_methodology_lookup_idx" ON "wing"."analysis_methodology" USING btree ("population_tag","session_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_methodology_published_unique" ON "wing"."analysis_methodology" USING btree ("population_tag","session_type") WHERE "wing"."analysis_methodology"."status" = 'published';

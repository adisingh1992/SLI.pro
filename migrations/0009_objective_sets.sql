CREATE TABLE "wing"."objective_sets" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wing"."objective_sets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_type" "wing"."session_type" NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"status" "wing"."publish_status" DEFAULT 'draft' NOT NULL,
	"objectives" jsonb NOT NULL,
	"change_note" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wing"."turn_objectives" (
	"turn_id" bigint NOT NULL,
	"session_id" bigint NOT NULL,
	"objective_key" text NOT NULL,
	"satisfied_here" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turn_objectives_turn_id_unique" UNIQUE("turn_id")
);
--> statement-breakpoint
ALTER TABLE "wing"."objective_sets" ADD CONSTRAINT "objective_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "wing"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."turn_objectives" ADD CONSTRAINT "turn_objectives_turn_id_transcript_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "wing"."transcript_turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wing"."turn_objectives" ADD CONSTRAINT "turn_objectives_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "wing"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "objective_sets_lookup_idx" ON "wing"."objective_sets" USING btree ("session_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "objective_sets_published_unique" ON "wing"."objective_sets" USING btree ("session_type") WHERE "wing"."objective_sets"."status" = 'published';--> statement-breakpoint
CREATE INDEX "turn_objectives_session_idx" ON "wing"."turn_objectives" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "turn_objectives_objective_idx" ON "wing"."turn_objectives" USING btree ("objective_key");

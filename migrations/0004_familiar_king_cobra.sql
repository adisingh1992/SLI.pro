CREATE TABLE "wing_migration_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"legacy_type" text NOT NULL,
	"legacy_id" integer NOT NULL,
	"wing_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wing_migration_links_legacy_type_legacy_id_unique" UNIQUE("legacy_type","legacy_id")
);
--> statement-breakpoint
CREATE INDEX "wing_migration_links_lookup_idx" ON "wing_migration_links" USING btree ("legacy_type","legacy_id");
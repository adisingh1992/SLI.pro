ALTER TABLE "documents" ALTER COLUMN "file_data" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "blob_key" text;
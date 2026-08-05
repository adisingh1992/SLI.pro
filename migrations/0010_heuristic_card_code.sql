-- Stable identifier for heuristic cards.
--
-- Added nullable, backfilled from the name, then made NOT NULL UNIQUE — the
-- table already holds reviewed cards and a bare NOT NULL would reject them.

ALTER TABLE "wing"."heuristics" ADD COLUMN "card_code" text;--> statement-breakpoint

-- Slug of the name, deduplicated by id where two cards slug identically.
UPDATE "wing"."heuristics" SET "card_code" =
  regexp_replace(
    regexp_replace(lower("name"), '[^a-z0-9]+', '_', 'g'),
    '^_|_$', '', 'g'
  );--> statement-breakpoint

UPDATE "wing"."heuristics" h SET "card_code" = h."card_code" || '_' || h."id"
WHERE EXISTS (
  SELECT 1 FROM "wing"."heuristics" o
  WHERE o."card_code" = h."card_code" AND o."id" <> h."id"
);--> statement-breakpoint

-- Any card whose name slugged to nothing at all.
UPDATE "wing"."heuristics" SET "card_code" = 'card_' || "id"
WHERE "card_code" IS NULL OR "card_code" = '';--> statement-breakpoint

ALTER TABLE "wing"."heuristics" ALTER COLUMN "card_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wing"."heuristics" ADD CONSTRAINT "heuristics_card_code_unique" UNIQUE("card_code");

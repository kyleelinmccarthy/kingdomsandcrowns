ALTER TABLE "deed_run" ADD COLUMN "second_tries" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "deed_run" ADD COLUMN "stars" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deed_run" ADD COLUMN "kind" text DEFAULT 'deed' NOT NULL;--> statement-breakpoint
ALTER TABLE "deed_run" ADD COLUMN "second_chances" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "realm_settings" ADD COLUMN "side_quest_length" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "realm_settings" ADD COLUMN "second_chances" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE deed_run SET stars = CASE
  WHEN correct_count * 1.0 / NULLIF(json_array_length(questions::json), 0) >= 0.9 THEN 3
  WHEN correct_count * 1.0 / NULLIF(json_array_length(questions::json), 0) >= 0.65 THEN 2
  WHEN correct_count * 1.0 / NULLIF(json_array_length(questions::json), 0) >= 0.35 THEN 1
  ELSE 0 END
WHERE completed_at IS NOT NULL AND kind = 'deed' AND stars = 0;

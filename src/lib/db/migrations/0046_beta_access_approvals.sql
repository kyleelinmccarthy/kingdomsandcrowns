ALTER TABLE `access_request` ADD `admit_until` integer;--> statement-breakpoint
ALTER TABLE `access_request` ADD `decided_at` integer;--> statement-breakpoint
ALTER TABLE `access_request` ADD `decided_by_user_id` text REFERENCES user(id);
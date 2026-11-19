CREATE TABLE `realm_improvement` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`improvement_id` text NOT NULL,
	`level` integer NOT NULL,
	`stars` integer NOT NULL,
	`season_id` text,
	`built_by_name` text NOT NULL,
	`sources` text NOT NULL,
	`built_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `realm_improvement_child_level_idx` ON `realm_improvement` (`child_id`,`improvement_id`,`level`);--> statement-breakpoint
CREATE TABLE `realm_material` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`material_id` text NOT NULL,
	`amount` integer NOT NULL,
	`kind` text NOT NULL,
	`origin` text DEFAULT 'quest' NOT NULL,
	`source_assignment_id` text,
	`improvement_id` text,
	`level` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `realm_material_child_created_idx` ON `realm_material` (`child_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `realm_material_earned_assignment_idx` ON `realm_material` (`source_assignment_id`) WHERE "realm_material"."kind" = 'earned';--> statement-breakpoint
ALTER TABLE `kingdom_progress` ADD `announced_at` integer;--> statement-breakpoint
ALTER TABLE `kingdom_progress` ADD `raised_by_name` text;--> statement-breakpoint
ALTER TABLE `kingdom_progress` ADD `raised_season_id` text;--> statement-breakpoint
ALTER TABLE `realm_settings` ADD `materials_per_quest` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `realm_settings` ADD `show_minutes_on_quests` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `realm_settings` ADD `pinned_plan` text;--> statement-breakpoint
ALTER TABLE `realm_settings` ADD `delivery_seen_at` integer;--> statement-breakpoint
ALTER TABLE `realm_settings` ADD `regraded_at` integer;--> statement-breakpoint
ALTER TABLE `subject` ADD `material` text;
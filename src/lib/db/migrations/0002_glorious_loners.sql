CREATE TABLE `child_avatar_unlock` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`category` text NOT NULL,
	`item_id` text NOT NULL,
	`source` text DEFAULT 'quest_reward' NOT NULL,
	`source_quest_id` text,
	`unlocked_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_quest_id`) REFERENCES `quest`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `child_avatar_unlock_unique_idx` ON `child_avatar_unlock` (`child_id`,`category`,`item_id`);--> statement-breakpoint
CREATE INDEX `child_avatar_unlock_child_idx` ON `child_avatar_unlock` (`child_id`);--> statement-breakpoint
ALTER TABLE `child` ADD `bonus_xp` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `quest` ADD `reward_xp` integer;--> statement-breakpoint
ALTER TABLE `quest` ADD `reward_description` text;--> statement-breakpoint
ALTER TABLE `quest` ADD `reward_avatar_item` text;
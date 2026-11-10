CREATE TABLE `learning_focus` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_focus_child_skill_idx` ON `learning_focus` (`child_id`,`skill_id`);
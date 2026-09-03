CREATE TABLE `spell` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`slot` integer NOT NULL,
	`element_id` text NOT NULL,
	`form_id` text NOT NULL,
	`modifier_id` text,
	`adjective` text NOT NULL,
	`noun` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spell_child_slot_idx` ON `spell` (`child_id`,`slot`);--> statement-breakpoint
CREATE INDEX `spell_child_idx` ON `spell` (`child_id`);--> statement-breakpoint
ALTER TABLE `subject` ADD `spell_school` text DEFAULT 'none' NOT NULL;
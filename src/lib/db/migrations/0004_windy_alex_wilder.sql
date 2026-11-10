CREATE TABLE `castle` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`type` text DEFAULT 'campsite' NOT NULL,
	`name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `castle_child_id_unique` ON `castle` (`child_id`);--> statement-breakpoint
CREATE INDEX `castle_child_idx` ON `castle` (`child_id`);
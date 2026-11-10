CREATE TABLE `realm_recess_record` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`total_gleams` integer DEFAULT 0 NOT NULL,
	`laps` integer DEFAULT 0 NOT NULL,
	`best_lap_ms` integer,
	`best_mounted_lap_ms` integer,
	`course_id` text DEFAULT 'island-ring-1' NOT NULL,
	`last_lap_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `realm_recess_record_child_id_unique` ON `realm_recess_record` (`child_id`);
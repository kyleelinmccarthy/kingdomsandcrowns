CREATE TABLE `realm_world_state` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`object_id` text NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `realm_world_state_child_object_idx` ON `realm_world_state` (`child_id`,`object_id`);
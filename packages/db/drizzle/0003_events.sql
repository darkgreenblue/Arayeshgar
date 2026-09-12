CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`event` text NOT NULL,
	`props` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_user` ON `events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_events_event` ON `events` (`event`,`created_at`);
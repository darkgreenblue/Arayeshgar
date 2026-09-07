CREATE TABLE `bot_bindings` (
	`platform` text NOT NULL,
	`platform_user_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`platform`, `platform_user_id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bot_bindings_platform_ck" CHECK("bot_bindings"."platform" IN ('telegram', 'bale'))
);
--> statement-breakpoint
CREATE INDEX `bot_bindings_tenant_idx` ON `bot_bindings` (`tenant_id`);
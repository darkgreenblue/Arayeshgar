CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`data` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "audit_actor_type_ck" CHECK("audit_log"."actor_type" IN ('user', 'customer', 'system'))
);
--> statement-breakpoint
CREATE INDEX `audit_tenant_created_idx` ON `audit_log` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`service_id` text NOT NULL,
	`code` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`price_snapshot` integer NOT NULL,
	`deposit_amount` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`notes` text,
	`cancelled_by` text,
	`cancel_reason` text,
	`reminder_24h_sent_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bookings_status_ck" CHECK("bookings"."status" IN ('pending_payment', 'receipt_submitted', 'pending_approval', 'confirmed', 'completed', 'cancelled', 'rejected', 'expired', 'no_show')),
	CONSTRAINT "bookings_source_ck" CHECK("bookings"."source" IN ('web', 'telegram', 'bale', 'admin')),
	CONSTRAINT "bookings_span_ck" CHECK("bookings"."end_at" > "bookings"."start_at")
);
--> statement-breakpoint
CREATE INDEX `bookings_staff_start_idx` ON `bookings` (`staff_id`,`start_at`);--> statement-breakpoint
CREATE INDEX `bookings_tenant_start_idx` ON `bookings` (`tenant_id`,`start_at`);--> statement-breakpoint
CREATE INDEX `bookings_customer_idx` ON `bookings` (`customer_id`);--> statement-breakpoint
CREATE INDEX `bookings_status_expires_idx` ON `bookings` (`status`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_tenant_code_uq` ON `bookings` (`tenant_id`,`code`);--> statement-breakpoint
CREATE TABLE `bot_sessions` (
	`tenant_id` text NOT NULL,
	`platform` text NOT NULL,
	`platform_user_id` text NOT NULL,
	`state` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`tenant_id`, `platform`, `platform_user_id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bot_sessions_platform_ck" CHECK("bot_sessions"."platform" IN ('telegram', 'bale'))
);
--> statement-breakpoint
CREATE TABLE `customer_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`platform` text NOT NULL,
	`platform_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "customer_identities_platform_ck" CHECK("customer_identities"."platform" IN ('telegram', 'bale'))
);
--> statement-breakpoint
CREATE INDEX `customer_identities_customer_idx` ON `customer_identities` (`customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_identities_uq` ON `customer_identities` (`tenant_id`,`platform`,`platform_user_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`notes` text,
	`blocked` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_tenant_phone_uq` ON `customers` (`tenant_id`,`phone`);--> statement-breakpoint
CREATE TABLE `manual_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `manual_slots_staff_start_idx` ON `manual_slots` (`staff_id`,`start_at`);--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`channel` text NOT NULL,
	`recipient_chat_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_try_at` integer DEFAULT (unixepoch()) NOT NULL,
	`sent_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "outbox_channel_ck" CHECK("notification_outbox"."channel" IN ('telegram', 'bale'))
);
--> statement-breakpoint
CREATE INDEX `outbox_pending_idx` ON `notification_outbox` (`sent_at`,`next_try_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'awaiting_receipt' NOT NULL,
	`pay_to_card_number` text,
	`pay_to_card_holder` text,
	`receipt_path` text,
	`tracking_no` text,
	`submitted_at` integer,
	`reviewed_by` text,
	`reviewed_at` integer,
	`reject_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "payments_status_ck" CHECK("payments"."status" IN ('awaiting_receipt', 'submitted', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX `payments_booking_idx` ON `payments` (`booking_id`);--> statement-breakpoint
CREATE INDEX `payments_tenant_status_idx` ON `payments` (`tenant_id`,`status`);--> statement-breakpoint
CREATE TABLE `schedule_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`start_min` integer,
	`end_min` integer,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "schedule_overrides_kind_ck" CHECK("schedule_overrides"."kind" IN ('closed', 'open'))
);
--> statement-breakpoint
CREATE INDEX `schedule_overrides_staff_day_idx` ON `schedule_overrides` (`staff_id`,`day`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_min` integer NOT NULL,
	`end_min` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `schedules_staff_idx` ON `schedules` (`staff_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `schedules_staff_weekday_start_uq` ON `schedules` (`staff_id`,`weekday`,`start_min`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`duration_min` integer NOT NULL,
	`price` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `services_tenant_idx` ON `services` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`photo_url` text,
	`bio` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deposit_settings` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `staff_tenant_idx` ON `staff` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `staff_services` (
	`staff_id` text NOT NULL,
	`service_id` text NOT NULL,
	`price_override` integer,
	`duration_override_min` integer,
	PRIMARY KEY(`staff_id`, `service_id`),
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`custom_domain` text,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Tehran' NOT NULL,
	`mode` text DEFAULT 'solo' NOT NULL,
	`status` text DEFAULT 'demo' NOT NULL,
	`theme` text DEFAULT 'night-gold' NOT NULL,
	`branding` text NOT NULL,
	`features` text DEFAULT '{}' NOT NULL,
	`booking_rules` text NOT NULL,
	`deposit_settings` text NOT NULL,
	`telegram_bot_token` text,
	`telegram_bot_username` text,
	`bale_bot_token` text,
	`bale_bot_username` text,
	`webhook_secret` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "tenants_mode_ck" CHECK("tenants"."mode" IN ('solo', 'salon_central', 'salon_independent')),
	CONSTRAINT "tenants_status_ck" CHECK("tenants"."status" IN ('demo', 'active', 'suspended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_slug_unique` ON `tenants` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_custom_domain_unique` ON `tenants` (`custom_domain`);--> statement-breakpoint
CREATE INDEX `tenants_status_idx` ON `tenants` (`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text,
	`role` text NOT NULL,
	`staff_id` text,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`telegram_chat_id` integer,
	`bale_chat_id` integer,
	`bot_link_code` text,
	`bot_link_code_expires_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "users_role_ck" CHECK("users"."role" IN ('platform_admin', 'owner', 'manager', 'staff'))
);
--> statement-breakpoint
CREATE INDEX `users_tenant_idx` ON `users` (`tenant_id`);
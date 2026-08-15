CREATE TABLE `game_events` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text,
	`event_type` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`visibility` text NOT NULL,
	`payload_version` integer DEFAULT 1 NOT NULL,
	`payload_json` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "game_events_payload_version_check" CHECK("game_events"."payload_version" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_game_events_idempotency_key` ON `game_events` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_game_events_household_occurred` ON `game_events` (`household_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_game_events_member_occurred` ON `game_events` (`member_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `progress_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text,
	`dimension` text NOT NULL,
	`lifetime_points` integer DEFAULT 0 NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "progress_balances_points_check" CHECK("progress_balances"."lifetime_points" >= 0),
	CONSTRAINT "progress_balances_level_check" CHECK("progress_balances"."level" BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_progress_balances_personal_dimension` ON `progress_balances` (`household_id`,`member_id`,`dimension`) WHERE "progress_balances"."member_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_progress_balances_household_dimension` ON `progress_balances` (`household_id`,`dimension`) WHERE "progress_balances"."member_id" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_progress_balances_household_member` ON `progress_balances` (`household_id`,`member_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_daily_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text NOT NULL,
	`local_date` text NOT NULL,
	`slot` integer NOT NULL,
	`family` text NOT NULL,
	`ownership_type` text NOT NULL,
	`visibility` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`short_label` text NOT NULL,
	`estimated_seconds` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`selection_reason_code` text NOT NULL,
	`move_policy_version` integer DEFAULT 1 NOT NULL,
	`completed_at` text,
	`replacement_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "daily_moves_slot_check" CHECK("__new_daily_moves"."slot" BETWEEN 1 AND 3),
	CONSTRAINT "daily_moves_estimated_seconds_check" CHECK("__new_daily_moves"."estimated_seconds" BETWEEN 1 AND 86400),
	CONSTRAINT "daily_moves_policy_version_check" CHECK("__new_daily_moves"."move_policy_version" = 1),
	CONSTRAINT "daily_moves_replacement_count_check" CHECK("__new_daily_moves"."replacement_count" BETWEEN 0 AND 1)
);
--> statement-breakpoint
INSERT INTO `__new_daily_moves`("id", "household_id", "member_id", "local_date", "slot", "family", "ownership_type", "visibility", "source_type", "source_id", "title", "short_label", "estimated_seconds", "status", "selection_reason_code", "move_policy_version", "completed_at", "replacement_count", "created_at") SELECT "id", "household_id", "member_id", "local_date", "slot", "family", "ownership_type", "visibility", "source_type", "source_id", "title", "short_label", "estimated_seconds", "status", "selection_reason_code", "move_policy_version", "completed_at", 0, "created_at" FROM `daily_moves`;--> statement-breakpoint
DROP TABLE `daily_moves`;--> statement-breakpoint
ALTER TABLE `__new_daily_moves` RENAME TO `daily_moves`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_moves_member_date_slot` ON `daily_moves` (`member_id`,`local_date`,`slot`);--> statement-breakpoint
CREATE INDEX `idx_daily_moves_household_member_date_status` ON `daily_moves` (`household_id`,`member_id`,`local_date`,`status`);

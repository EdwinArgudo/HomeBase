CREATE TABLE `daily_moves` (
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
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "daily_moves_slot_check" CHECK("daily_moves"."slot" BETWEEN 1 AND 3),
	CONSTRAINT "daily_moves_estimated_seconds_check" CHECK("daily_moves"."estimated_seconds" BETWEEN 1 AND 86400),
	CONSTRAINT "daily_moves_policy_version_check" CHECK("daily_moves"."move_policy_version" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_moves_member_date_slot` ON `daily_moves` (`member_id`,`local_date`,`slot`);--> statement-breakpoint
CREATE INDEX `idx_daily_moves_household_member_date_status` ON `daily_moves` (`household_id`,`member_id`,`local_date`,`status`);
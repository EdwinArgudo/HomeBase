CREATE TABLE `household_unlocks` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`reward_key` text NOT NULL,
	`catalog_version` integer DEFAULT 1 NOT NULL,
	`policy_version` integer DEFAULT 1 NOT NULL,
	`source_event_id` text NOT NULL,
	`unlocked_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_event_id`) REFERENCES `game_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "household_unlocks_catalog_version_check" CHECK("household_unlocks"."catalog_version" = 1),
	CONSTRAINT "household_unlocks_policy_version_check" CHECK("household_unlocks"."policy_version" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_unlocks_household_reward` ON `household_unlocks` (`household_id`,`reward_key`);--> statement-breakpoint
CREATE INDEX `idx_household_unlocks_household` ON `household_unlocks` (`household_id`,`unlocked_at`);
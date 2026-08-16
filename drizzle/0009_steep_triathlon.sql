CREATE TABLE `persona_unlocks` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text NOT NULL,
	`persona_id` text NOT NULL,
	`reward_key` text NOT NULL,
	`catalog_version` integer DEFAULT 1 NOT NULL,
	`policy_version` integer DEFAULT 1 NOT NULL,
	`source_event_id` text NOT NULL,
	`unlocked_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_event_id`) REFERENCES `game_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "persona_unlocks_catalog_version_check" CHECK("persona_unlocks"."catalog_version" = 1),
	CONSTRAINT "persona_unlocks_policy_version_check" CHECK("persona_unlocks"."policy_version" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_persona_unlocks_persona_reward` ON `persona_unlocks` (`persona_id`,`reward_key`);--> statement-breakpoint
CREATE INDEX `idx_persona_unlocks_household_member` ON `persona_unlocks` (`household_id`,`member_id`,`persona_id`);
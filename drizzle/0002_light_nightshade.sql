CREATE TABLE `bank_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`owner_member_id` text,
	`ownership_type` text NOT NULL,
	`provider` text DEFAULT 'plaid' NOT NULL,
	`item_id` text NOT NULL,
	`access_token_ciphertext` text NOT NULL,
	`cursor` text,
	`institution_name` text NOT NULL,
	`status` text DEFAULT 'healthy' NOT NULL,
	`last_synced_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bank_connections_item_id` ON `bank_connections` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_bank_connections_household` ON `bank_connections` (`household_id`,`status`);
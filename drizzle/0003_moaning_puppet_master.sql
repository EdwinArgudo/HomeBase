CREATE TABLE `merchant_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_member_id` text NOT NULL,
	`match_text` text NOT NULL,
	`merchant_name` text NOT NULL,
	`category_id` text NOT NULL,
	`spending_type` text NOT NULL,
	`personal_member_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`personal_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_merchant_rules_member_match` ON `merchant_rules` (`household_id`,`created_by_member_id`,`match_text`);--> statement-breakpoint
CREATE INDEX `idx_merchant_rules_household_match` ON `merchant_rules` (`household_id`,`match_text`);
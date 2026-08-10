ALTER TABLE `accounts` RENAME COLUMN "scope" TO "ownership_type";--> statement-breakpoint
ALTER TABLE `categories` RENAME COLUMN "scope" TO "ownership_type";--> statement-breakpoint
ALTER TABLE `goals` RENAME COLUMN "scope" TO "ownership_type";--> statement-breakpoint
ALTER TABLE `transaction_splits` RENAME COLUMN "scope" TO "spending_type";--> statement-breakpoint
ALTER TABLE `transactions` RENAME COLUMN "scope" TO "spending_type";--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`email` text NOT NULL,
	`invited_by_member_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`accepted_at` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invited_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invitations_household_email` ON `invitations` (`household_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_invitations_email_status` ON `invitations` (`email`,`status`);--> statement-breakpoint
DROP INDEX `idx_accounts_household_scope`;--> statement-breakpoint
CREATE INDEX `idx_accounts_household_ownership` ON `accounts` (`household_id`,`ownership_type`);--> statement-breakpoint
DROP INDEX `idx_categories_household_scope_name`;--> statement-breakpoint
ALTER TABLE `categories` ADD `owner_member_id` text REFERENCES members(id);--> statement-breakpoint
CREATE INDEX `idx_categories_household_ownership` ON `categories` (`household_id`,`ownership_type`,`owner_member_id`);--> statement-breakpoint
ALTER TABLE `transaction_splits` ADD `personal_member_id` text REFERENCES members(id);--> statement-breakpoint
ALTER TABLE `transactions` ADD `personal_member_id` text REFERENCES members(id);--> statement-breakpoint
ALTER TABLE `households` ADD `minimum_mode` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `email` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_household_email` ON `members` (`household_id`,`email`);
--> statement-breakpoint
PRAGMA optimize;

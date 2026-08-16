CREATE TABLE `adventures` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`template_key` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "adventures_completion_check" CHECK(("adventures"."status" = 'complete' AND "adventures"."completed_at" IS NOT NULL) OR ("adventures"."status" <> 'complete' AND "adventures"."completed_at" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_adventures_household_active` ON `adventures` (`household_id`) WHERE "adventures"."status" = 'active';--> statement-breakpoint
CREATE INDEX `idx_adventures_household_status` ON `adventures` (`household_id`,`status`,`ends_at`);
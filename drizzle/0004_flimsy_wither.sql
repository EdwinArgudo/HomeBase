CREATE TABLE `monthly_category_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`category_id` text NOT NULL,
	`budget_month` text NOT NULL,
	`limit_cents` integer NOT NULL,
	`rollover_cents` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monthly_category_budgets_category_month` ON `monthly_category_budgets` (`category_id`,`budget_month`);--> statement-breakpoint
CREATE INDEX `idx_monthly_category_budgets_household_month` ON `monthly_category_budgets` (`household_id`,`budget_month`);
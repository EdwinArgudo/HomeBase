ALTER TABLE `bank_connections` ADD `last_sync_attempt_at` text;--> statement-breakpoint
ALTER TABLE `bank_connections` ADD `provider_last_successful_update` text;--> statement-breakpoint
ALTER TABLE `bank_connections` ADD `provider_last_failed_update` text;--> statement-breakpoint
ALTER TABLE `bank_connections` ADD `last_error_code` text;--> statement-breakpoint
ALTER TABLE `bank_connections` ADD `last_error_message` text;
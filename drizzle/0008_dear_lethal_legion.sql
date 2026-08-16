CREATE TABLE `personas` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text NOT NULL,
	`display_name` text NOT NULL,
	`creation_method` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`base_style_version` text DEFAULT 'homebase-pixel-v1' NOT NULL,
	`appearance_json` text NOT NULL,
	`active_loadout_json` text DEFAULT '{}' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`approved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "personas_creation_method_check" CHECK("personas"."creation_method" = 'manual'),
	CONSTRAINT "personas_status_check" CHECK("personas"."status" IN ('draft', 'ready', 'deleted')),
	CONSTRAINT "personas_visibility_check" CHECK("personas"."visibility" IN ('private', 'household')),
	CONSTRAINT "personas_appearance_json_check" CHECK(json_valid("personas"."appearance_json")),
	CONSTRAINT "personas_loadout_json_check" CHECK(json_valid("personas"."active_loadout_json")),
	CONSTRAINT "personas_approval_check" CHECK(("personas"."status" = 'ready' AND "personas"."approved_at" IS NOT NULL AND "personas"."deleted_at" IS NULL) OR ("personas"."status" = 'draft' AND "personas"."approved_at" IS NULL AND "personas"."deleted_at" IS NULL) OR ("personas"."status" = 'deleted' AND "personas"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_personas_member_active` ON `personas` (`household_id`,`member_id`) WHERE "personas"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_personas_household_member_status` ON `personas` (`household_id`,`member_id`,`status`);
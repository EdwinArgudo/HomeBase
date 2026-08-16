import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  minimumMode: integer("minimum_mode", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  externalUserId: text("external_user_id").notNull(),
  email: text("email").notNull().default(""),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["owner", "member"] }).notNull().default("member"),
  personalDetailVisibility: text("personal_detail_visibility", { enum: ["private", "shared"] }).notNull().default("private"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_members_household_external_user").on(table.householdId, table.externalUserId),
  uniqueIndex("idx_members_household_email").on(table.householdId, table.email),
  index("idx_members_household_id").on(table.householdId),
]);

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  email: text("email").notNull(),
  invitedByMemberId: text("invited_by_member_id").notNull().references(() => members.id),
  status: text("status", { enum: ["pending", "accepted", "revoked"] }).notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  acceptedAt: text("accepted_at"),
}, (table) => [
  uniqueIndex("idx_invitations_household_email").on(table.householdId, table.email),
  index("idx_invitations_email_status").on(table.email, table.status),
]);

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  ownerMemberId: text("owner_member_id").references(() => members.id),
  ownershipType: text("ownership_type", { enum: ["personal", "shared"] }).notNull(),
  providerItemId: text("provider_item_id"),
  providerAccountId: text("provider_account_id"),
  institutionName: text("institution_name"),
  name: text("name").notNull(),
  type: text("type", { enum: ["checking", "savings", "credit", "cash"] }).notNull(),
  mask: text("mask"),
  connectionStatus: text("connection_status", { enum: ["manual", "healthy", "attention"] }).notNull().default("manual"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_accounts_household_ownership").on(table.householdId, table.ownershipType),
  uniqueIndex("idx_accounts_provider_account_id").on(table.providerAccountId),
]);

export const bankConnections = sqliteTable("bank_connections", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  ownerMemberId: text("owner_member_id").references(() => members.id),
  ownershipType: text("ownership_type", { enum: ["personal", "shared"] }).notNull(),
  provider: text("provider").notNull().default("plaid"),
  itemId: text("item_id").notNull(),
  accessTokenCiphertext: text("access_token_ciphertext").notNull(),
  cursor: text("cursor"),
  institutionName: text("institution_name").notNull(),
  status: text("status", { enum: ["healthy", "attention"] }).notNull().default("healthy"),
  lastSyncAttemptAt: text("last_sync_attempt_at"),
  lastSyncedAt: text("last_synced_at"),
  providerLastSuccessfulUpdate: text("provider_last_successful_update"),
  providerLastFailedUpdate: text("provider_last_failed_update"),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_bank_connections_item_id").on(table.itemId),
  index("idx_bank_connections_household").on(table.householdId, table.status),
]);

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  ownerMemberId: text("owner_member_id").references(() => members.id),
  ownershipType: text("ownership_type", { enum: ["personal", "shared"] }).notNull(),
  name: text("name").notNull(),
  monthlyLimitCents: integer("monthly_limit_cents").notNull(),
  rolloverEnabled: integer("rollover_enabled", { mode: "boolean" }).notNull().default(false),
  archivedAt: text("archived_at"),
}, (table) => [
  index("idx_categories_household_ownership").on(table.householdId, table.ownershipType, table.ownerMemberId),
]);

export const monthlyCategoryBudgets = sqliteTable("monthly_category_budgets", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  categoryId: text("category_id").notNull().references(() => categories.id),
  budgetMonth: text("budget_month").notNull(),
  limitCents: integer("limit_cents").notNull(),
  rolloverCents: integer("rollover_cents").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_monthly_category_budgets_category_month").on(table.categoryId, table.budgetMonth),
  index("idx_monthly_category_budgets_household_month").on(table.householdId, table.budgetMonth),
]);

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  providerTransactionId: text("provider_transaction_id"),
  merchantName: text("merchant_name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  transactionDate: text("transaction_date").notNull(),
  spendingType: text("spending_type", { enum: ["personal", "shared"] }),
  personalMemberId: text("personal_member_id").references(() => members.id),
  categoryId: text("category_id").references(() => categories.id),
  reviewStatus: text("review_status", { enum: ["ready", "needs_review", "split"] }).notNull().default("needs_review"),
  isTransfer: integer("is_transfer", { mode: "boolean" }).notNull().default(false),
  note: text("note"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_transactions_provider_id").on(table.providerTransactionId),
  index("idx_transactions_household_date").on(table.householdId, table.transactionDate),
  index("idx_transactions_household_review").on(table.householdId, table.reviewStatus),
]);

export const transactionSplits = sqliteTable("transaction_splits", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").notNull().references(() => transactions.id),
  categoryId: text("category_id").notNull().references(() => categories.id),
  spendingType: text("spending_type", { enum: ["personal", "shared"] }).notNull(),
  personalMemberId: text("personal_member_id").references(() => members.id),
  amountCents: integer("amount_cents").notNull(),
}, (table) => [index("idx_transaction_splits_transaction_id").on(table.transactionId)]);

export const merchantRules = sqliteTable("merchant_rules", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  createdByMemberId: text("created_by_member_id").notNull().references(() => members.id),
  matchText: text("match_text").notNull(),
  merchantName: text("merchant_name").notNull(),
  categoryId: text("category_id").notNull().references(() => categories.id),
  spendingType: text("spending_type", { enum: ["personal", "shared"] }).notNull(),
  personalMemberId: text("personal_member_id").references(() => members.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_merchant_rules_member_match").on(table.householdId, table.createdByMemberId, table.matchText),
  index("idx_merchant_rules_household_match").on(table.householdId, table.matchText),
]);

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  ownerMemberId: text("owner_member_id").references(() => members.id),
  title: text("title").notNull(),
  status: text("status", { enum: ["open", "complete"] }).notNull().default("open"),
  dueDate: text("due_date"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_tasks_household_status").on(table.householdId, table.status)]);

export const groceryItems = sqliteTable("grocery_items", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  addedByMemberId: text("added_by_member_id").references(() => members.id),
  name: text("name").notNull(),
  checked: integer("checked", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_grocery_items_household_checked").on(table.householdId, table.checked)]);

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  ownerMemberId: text("owner_member_id").references(() => members.id),
  ownershipType: text("ownership_type", { enum: ["personal", "shared"] }).notNull(),
  name: text("name").notNull(),
  trackingType: text("tracking_type", { enum: ["sessions", "amount"] }).notNull(),
  targetValue: integer("target_value").notNull(),
  minimumValue: integer("minimum_value"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [index("idx_goals_household_active").on(table.householdId, table.active)]);

export const goalEntries = sqliteTable("goal_entries", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull().references(() => goals.id),
  memberId: text("member_id").references(() => members.id),
  value: integer("value").notNull(),
  occurredAt: text("occurred_at").notNull(),
}, (table) => [index("idx_goal_entries_goal_date").on(table.goalId, table.occurredAt)]);

export const dailyMoves = sqliteTable("daily_moves", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  memberId: text("member_id").notNull().references(() => members.id),
  localDate: text("local_date").notNull(),
  slot: integer("slot").notNull(),
  family: text("family", { enum: ["tend", "move", "grow", "connect"] }).notNull(),
  ownershipType: text("ownership_type", { enum: ["personal", "shared"] }).notNull(),
  visibility: text("visibility", { enum: ["private", "household", "display"] }).notNull(),
  sourceType: text("source_type", { enum: ["transaction", "bank_connection", "task", "grocery_item", "goal", "adventure", "comeback", "household"] }).notNull(),
  sourceId: text("source_id").notNull(),
  title: text("title").notNull(),
  shortLabel: text("short_label").notNull(),
  estimatedSeconds: integer("estimated_seconds").notNull(),
  status: text("status", { enum: ["active", "complete", "deferred", "replaced", "expired"] }).notNull().default("active"),
  selectionReasonCode: text("selection_reason_code", { enum: ["urgent", "uncertainty", "due_soon", "preference", "cooperative", "minimum_mode", "comeback"] }).notNull(),
  movePolicyVersion: integer("move_policy_version").notNull().default(1),
  completedAt: text("completed_at"),
  replacementCount: integer("replacement_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_daily_moves_member_date_slot").on(table.memberId, table.localDate, table.slot),
  index("idx_daily_moves_household_member_date_status").on(table.householdId, table.memberId, table.localDate, table.status),
  check("daily_moves_slot_check", sql`${table.slot} BETWEEN 1 AND 3`),
  check("daily_moves_estimated_seconds_check", sql`${table.estimatedSeconds} BETWEEN 1 AND 86400`),
  check("daily_moves_policy_version_check", sql`${table.movePolicyVersion} = 1`),
  check("daily_moves_replacement_count_check", sql`${table.replacementCount} BETWEEN 0 AND 1`),
]);

export const personas = sqliteTable("personas", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  memberId: text("member_id").notNull().references(() => members.id),
  displayName: text("display_name").notNull(),
  creationMethod: text("creation_method", { enum: ["manual"] }).notNull().default("manual"),
  status: text("status", { enum: ["draft", "ready", "deleted"] }).notNull().default("draft"),
  baseStyleVersion: text("base_style_version").notNull().default("homebase-pixel-v1"),
  appearanceJson: text("appearance_json").notNull(),
  activeLoadoutJson: text("active_loadout_json").notNull().default("{}"),
  visibility: text("visibility", { enum: ["private", "household"] }).notNull().default("private"),
  approvedAt: text("approved_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: text("deleted_at"),
}, (table) => [
  uniqueIndex("idx_personas_member_active").on(table.householdId, table.memberId).where(sql`${table.deletedAt} IS NULL`),
  index("idx_personas_household_member_status").on(table.householdId, table.memberId, table.status),
  check("personas_creation_method_check", sql`${table.creationMethod} = 'manual'`),
  check("personas_status_check", sql`${table.status} IN ('draft', 'ready', 'deleted')`),
  check("personas_visibility_check", sql`${table.visibility} IN ('private', 'household')`),
  check("personas_appearance_json_check", sql`json_valid(${table.appearanceJson})`),
  check("personas_loadout_json_check", sql`json_valid(${table.activeLoadoutJson})`),
  check("personas_approval_check", sql`(${table.status} = 'ready' AND ${table.approvedAt} IS NOT NULL AND ${table.deletedAt} IS NULL) OR (${table.status} = 'draft' AND ${table.approvedAt} IS NULL AND ${table.deletedAt} IS NULL) OR (${table.status} = 'deleted' AND ${table.deletedAt} IS NOT NULL)`),
]);

export const gameEvents = sqliteTable("game_events", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  memberId: text("member_id").references(() => members.id),
  eventType: text("event_type", { enum: ["transaction.reviewed", "merchant_rule.created", "bank_connection.repaired", "task.completed", "grocery_item.checked", "goal_entry.recorded", "daily_move.completed", "adventure.completed", "persona.approved", "persona.cosmetic_equipped"] }).notNull(),
  sourceType: text("source_type", { enum: ["transaction", "merchant_rule", "bank_connection", "task", "grocery_item", "goal_entry", "daily_move", "adventure", "persona", "cosmetic"] }).notNull(),
  sourceId: text("source_id").notNull(),
  visibility: text("visibility", { enum: ["private", "household", "display"] }).notNull(),
  payloadVersion: integer("payload_version").notNull().default(1),
  payloadJson: text("payload_json").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  occurredAt: text("occurred_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_game_events_idempotency_key").on(table.idempotencyKey),
  index("idx_game_events_household_occurred").on(table.householdId, table.occurredAt),
  index("idx_game_events_member_occurred").on(table.memberId, table.occurredAt),
  check("game_events_payload_version_check", sql`${table.payloadVersion} = 1`),
]);

export const personaUnlocks = sqliteTable("persona_unlocks", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  memberId: text("member_id").notNull().references(() => members.id),
  personaId: text("persona_id").notNull().references(() => personas.id),
  rewardKey: text("reward_key").notNull(),
  catalogVersion: integer("catalog_version").notNull().default(1),
  policyVersion: integer("policy_version").notNull().default(1),
  sourceEventId: text("source_event_id").notNull().references(() => gameEvents.id),
  unlockedAt: text("unlocked_at").notNull(),
}, (table) => [
  uniqueIndex("idx_persona_unlocks_persona_reward").on(table.personaId, table.rewardKey),
  index("idx_persona_unlocks_household_member").on(table.householdId, table.memberId, table.personaId),
  check("persona_unlocks_catalog_version_check", sql`${table.catalogVersion} = 1`),
  check("persona_unlocks_policy_version_check", sql`${table.policyVersion} = 1`),
]);

export const adventures = sqliteTable("adventures", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  templateKey: text("template_key").notNull(),
  status: text("status", { enum: ["offered", "active", "complete", "expired", "dismissed"] }).notNull().default("active"),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  // One adventure at a time: a household is two people, not a backlog.
  uniqueIndex("idx_adventures_household_active").on(table.householdId).where(sql`${table.status} = 'active'`),
  index("idx_adventures_household_status").on(table.householdId, table.status, table.endsAt),
  check("adventures_completion_check", sql`(${table.status} = 'complete' AND ${table.completedAt} IS NOT NULL) OR (${table.status} <> 'complete' AND ${table.completedAt} IS NULL)`),
]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  memberId: text("member_id").references(() => members.id),
  action: text("action", {
    enum: [
      "invitation.saved",
      "persona.visibility_changed",
      "bank_connection.created",
      "budget_limits.changed",
      "transaction.reclassified",
    ],
  }).notNull(),
  subjectType: text("subject_type", { enum: ["invitation", "persona", "bank_connection", "budget", "transaction"] }).notNull(),
  subjectId: text("subject_id").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  occurredAt: text("occurred_at").notNull(),
}, (table) => [
  index("idx_audit_events_household_occurred").on(table.householdId, table.occurredAt),
  index("idx_audit_events_household_action").on(table.householdId, table.action),
  check("audit_events_metadata_json_check", sql`json_valid(${table.metadataJson})`),
]);

export const householdUnlocks = sqliteTable("household_unlocks", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  rewardKey: text("reward_key").notNull(),
  catalogVersion: integer("catalog_version").notNull().default(1),
  policyVersion: integer("policy_version").notNull().default(1),
  sourceEventId: text("source_event_id").notNull().references(() => gameEvents.id),
  unlockedAt: text("unlocked_at").notNull(),
}, (table) => [
  uniqueIndex("idx_household_unlocks_household_reward").on(table.householdId, table.rewardKey),
  index("idx_household_unlocks_household").on(table.householdId, table.unlockedAt),
  check("household_unlocks_catalog_version_check", sql`${table.catalogVersion} = 1`),
  check("household_unlocks_policy_version_check", sql`${table.policyVersion} = 1`),
]);

export const progressBalances = sqliteTable("progress_balances", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  memberId: text("member_id").references(() => members.id),
  dimension: text("dimension", { enum: ["tend", "move", "grow", "connect", "household"] }).notNull(),
  lifetimePoints: integer("lifetime_points").notNull().default(0),
  level: integer("level").notNull().default(1),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_progress_balances_personal_dimension")
    .on(table.householdId, table.memberId, table.dimension)
    .where(sql`${table.memberId} IS NOT NULL`),
  uniqueIndex("idx_progress_balances_household_dimension")
    .on(table.householdId, table.dimension)
    .where(sql`${table.memberId} IS NULL`),
  index("idx_progress_balances_household_member").on(table.householdId, table.memberId),
  check("progress_balances_points_check", sql`${table.lifetimePoints} >= 0`),
  check("progress_balances_level_check", sql`${table.level} BETWEEN 1 AND 1000`),
]);

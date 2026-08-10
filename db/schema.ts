import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  lastSyncedAt: text("last_synced_at"),
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

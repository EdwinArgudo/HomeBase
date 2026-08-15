import assert from "node:assert/strict";
import test from "node:test";

import { bankConnectionMoveCandidates } from "../adapters/bank-connections.ts";
import { classifyGoalFamilyV1, goalMoveCandidates } from "../adapters/goals.ts";
import { groceryMoveCandidates } from "../adapters/groceries.ts";
import { taskMoveCandidates } from "../adapters/tasks.ts";
import { transactionMoveCandidates } from "../adapters/transactions.ts";
import { loadAuthorizedMoveCandidates, loadHouseholdMinimumMode } from "../candidate-coordinator.ts";

const member = {
  id: "member-current",
  household_id: "household-current",
  external_user_id: "external-current",
  email: "member@example.com",
  display_name: "Current member",
  role: "member",
  personal_detail_visibility: "private",
};

class FixtureStatement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new FixtureStatement(this.database, this.sql, values);
  }

  async all() {
    assert.doesNotMatch(this.sql, /SELECT\s+\*/i);
    assert.match(this.sql, /(?:t\.)?household_id = \?/);
    assert.equal(this.values[0], member.household_id);
    assert.equal(typeof this.values[0], "string");
    const ownershipDomain = /(?:transactions|bank_connections|tasks|goals)/.test(this.sql);
    if (ownershipDomain) {
      assert.equal(this.values[1], member.id);
      assert.equal(typeof this.values[1], "string");
    }
    this.database.queries.push({ sql: this.sql, values: [...this.values] });
    const table = ["transactions", "bank_connections", "tasks", "grocery_items", "goals"]
      .find((name) => this.sql.includes(`FROM ${name}`));
    return { success: true, results: (this.database.fixtures[table] ?? []).map((row) => ({ ...row })), meta: {} };
  }

  async first() {
    assert.match(this.sql, /FROM households WHERE id = \?/);
    assert.deepEqual(this.values, [member.household_id]);
    this.database.queries.push({ sql: this.sql, values: [...this.values] });
    return this.database.minimumMode === undefined ? null : { minimum_mode: this.database.minimumMode };
  }
}

class FixtureDatabase {
  constructor(fixtures = {}, minimumMode = 0) {
    this.fixtures = fixtures;
    this.minimumMode = minimumMode;
    this.queries = [];
  }

  prepare(sql) {
    return new FixtureStatement(this, sql);
  }
}

function context(database) {
  return { identity: { externalId: member.external_user_id, email: member.email, displayName: member.display_name }, member, db: database };
}

test("transaction adapter emits only reviewable authorized non-transfer rows with sanitized copy", async () => {
  const secret = "PRIVATE MERCHANT $9,999";
  const database = new FixtureDatabase({
    transactions: [
      { id: "txn-shared", transaction_date: "2026-08-01", review_status: "needs_review", is_transfer: 0, ownership_type: "shared", owner_member_id: null, merchant_name: secret },
      { id: "txn-own", transaction_date: "2026-08-15", review_status: "needs_review", is_transfer: 0, ownership_type: "personal", owner_member_id: member.id, merchant_name: secret },
      { id: "txn-other", transaction_date: "2026-08-15", review_status: "needs_review", is_transfer: 0, ownership_type: "personal", owner_member_id: "member-other" },
      { id: "txn-ready", transaction_date: "2026-08-15", review_status: "ready", is_transfer: 0, ownership_type: "shared", owner_member_id: null },
      { id: "txn-transfer", transaction_date: "2026-08-15", review_status: "needs_review", is_transfer: 1, ownership_type: "shared", owner_member_id: null },
    ],
  });
  const candidates = await transactionMoveCandidates(context(database), "2026-08-16");

  assert.deepEqual(candidates.map((entry) => entry.source.id), ["txn-shared", "txn-own"]);
  assert.deepEqual(candidates.map((entry) => [entry.ownership, entry.visibility, entry.memberId]), [
    ["shared", "household", null],
    ["personal", "private", member.id],
  ]);
  assert.ok(candidates[0].signals.urgency > candidates[1].signals.urgency);
  assert.doesNotMatch(JSON.stringify(candidates), new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("bank adapter emits attention only and never selects or exposes institution/error detail", async () => {
  const database = new FixtureDatabase({
    bank_connections: [
      { id: "bank-shared", status: "attention", ownership_type: "shared", owner_member_id: null, institution_name: "Secret Shared Bank", last_error_message: "token leaked" },
      { id: "bank-own", status: "attention", ownership_type: "personal", owner_member_id: member.id },
      { id: "bank-other", status: "attention", ownership_type: "personal", owner_member_id: "member-other" },
      { id: "bank-healthy", status: "healthy", ownership_type: "shared", owner_member_id: null },
      { id: "bank-manual", status: "manual", ownership_type: "shared", owner_member_id: null },
    ],
  });
  const candidates = await bankConnectionMoveCandidates(context(database));

  assert.deepEqual(candidates.map((entry) => entry.source.id), ["bank-shared", "bank-own"]);
  assert.ok(candidates.every((entry) => entry.signals.urgency === 1));
  assert.doesNotMatch(database.queries[0].sql, /institution_name|last_error/i);
  assert.doesNotMatch(JSON.stringify(candidates), /Secret Shared Bank|token leaked/);
});

test("task adapter excludes completed and other-member rows and derives due signals from localDate", async () => {
  const database = new FixtureDatabase({
    tasks: [
      { id: "task-overdue", owner_member_id: null, title: "Shared overdue task", status: "open", due_date: "2026-08-15" },
      { id: "task-today", owner_member_id: member.id, title: "Private due task", status: "open", due_date: "2026-08-16" },
      { id: "task-undated", owner_member_id: null, title: "Shared anytime task", status: "open", due_date: null },
      { id: "task-other", owner_member_id: "member-other", title: "Other private title", status: "open", due_date: null },
      { id: "task-complete", owner_member_id: null, title: "Finished", status: "complete", due_date: null },
    ],
  });
  const candidates = await taskMoveCandidates(context(database), "2026-08-16");

  assert.deepEqual(candidates.map((entry) => entry.source.id), ["task-overdue", "task-today", "task-undated"]);
  assert.equal(candidates[0].signals.dueSoon, 1);
  assert.equal(candidates[0].signals.urgency, 0.85);
  assert.equal(candidates[1].visibility, "private");
  assert.equal(candidates[2].signals.preference, 0.35);
  assert.doesNotMatch(JSON.stringify(candidates), /Other private title/);
});

test("grocery adapter emits one shared aggregate and checked-only lists emit nothing", async () => {
  const database = new FixtureDatabase({ grocery_items: [
    { id: "grocery-a", checked: 0, name: "Private item detail" },
    { id: "grocery-b", checked: 0, name: "Another detail" },
    { id: "grocery-c", checked: 1, name: "Checked detail" },
  ] });
  const candidates = await groceryMoveCandidates(context(database));

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].title, "Choose 2 grocery items");
  assert.equal(candidates[0].visibility, "household");
  assert.equal(candidates[0].source.id, "grocery-a");
  assert.doesNotMatch(database.queries[0].sql, /\bname\b/i);

  const checkedOnly = new FixtureDatabase({ grocery_items: [{ id: "done", checked: 1 }] });
  assert.deepEqual(await groceryMoveCandidates(context(checkedOnly)), []);
});

test("goal classifier v1 and adapter apply audited mappings and ownership", async () => {
  assert.equal(classifyGoalFamilyV1("Morning workout", "sessions", "personal"), "move");
  assert.equal(classifyGoalFamilyV1("Learn Spanish", "sessions", "personal"), "grow");
  assert.equal(classifyGoalFamilyV1("Emergency fund", "amount", "shared"), "tend");
  assert.equal(classifyGoalFamilyV1("Weekly ritual", "sessions", "shared"), "connect");
  assert.equal(classifyGoalFamilyV1("Personal ritual", "sessions", "personal"), "grow");

  const database = new FixtureDatabase({ goals: [
    { id: "goal-move", owner_member_id: null, ownership_type: "shared", name: "Walk together", tracking_type: "sessions", active: 1 },
    { id: "goal-learn", owner_member_id: member.id, ownership_type: "personal", name: "Spanish vocabulary", tracking_type: "sessions", active: 1 },
    { id: "goal-amount", owner_member_id: null, ownership_type: "shared", name: "Weekend fund", tracking_type: "amount", active: 1 },
    { id: "goal-other", owner_member_id: "member-other", ownership_type: "personal", name: "Other private goal", tracking_type: "sessions", active: 1 },
    { id: "goal-inactive", owner_member_id: null, ownership_type: "shared", name: "Inactive", tracking_type: "sessions", active: 0 },
  ] });
  const candidates = await goalMoveCandidates(context(database));

  assert.deepEqual(candidates.map((entry) => [entry.source.id, entry.family]), [
    ["goal-move", "move"],
    ["goal-learn", "grow"],
    ["goal-amount", "tend"],
  ]);
  assert.equal(candidates[0].visibility, "household");
  assert.equal(candidates[1].visibility, "private");
  assert.doesNotMatch(JSON.stringify(candidates), /Other private goal/);
});

test("authorized coordinator runs all five scoped adapters and reads household Minimum Mode", async () => {
  const database = new FixtureDatabase({
    transactions: [],
    bank_connections: [],
    tasks: [],
    grocery_items: [],
    goals: [],
  }, 1);
  const householdContext = context(database);

  assert.deepEqual(await loadAuthorizedMoveCandidates(householdContext, "2026-08-16"), []);
  assert.equal(await loadHouseholdMinimumMode(householdContext), true);
  assert.equal(database.queries.length, 6);
  assert.ok(database.queries.every((query) => query.values[0] === member.household_id));
});

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { HttpError } from "../../auth/identity.ts";
import { completeDailyMove } from "../completion.ts";
import { deferDailyMove, replaceDailyMove } from "../move-actions.ts";

class SqliteD1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new SqliteD1Statement(this.database, this.sql, values);
  }

  async first() {
    return this.database.sqlite.prepare(this.sql).get(...this.values) ?? null;
  }

  async all() {
    return { success: true, results: this.database.sqlite.prepare(this.sql).all(...this.values), meta: {} };
  }

  async run() {
    if (this.database.failPattern?.test(this.sql)) throw new Error("D1_SECRET_BATCH_FAILURE");
    const result = this.database.sqlite.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

class SqliteD1Database {
  constructor(sqlite) {
    this.sqlite = sqlite;
    this.failPattern = null;
    this.beforeBatch = null;
    this.batchTail = Promise.resolve();
  }

  prepare(sql) {
    return new SqliteD1Statement(this, sql);
  }

  async batch(statements) {
    let release;
    const previous = this.batchTail;
    this.batchTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const beforeBatch = this.beforeBatch;
      this.beforeBatch = null;
      beforeBatch?.();
      this.sqlite.exec("BEGIN IMMEDIATE");
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }
}

async function database() {
  const sqlite = new DatabaseSync(":memory:");
  const directory = new URL("../../../drizzle/", import.meta.url);
  const migrations = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  for (const migration of migrations) {
    const sql = await readFile(new URL(migration, directory), "utf8");
    sqlite.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  sqlite.exec(`
    INSERT INTO households (id, name) VALUES ('household-a', 'Test home');
    INSERT INTO members (id, household_id, external_user_id, email, display_name)
      VALUES ('member-a', 'household-a', 'external-a', 'a@example.com', 'Member A');
    INSERT INTO members (id, household_id, external_user_id, email, display_name)
      VALUES ('member-b', 'household-a', 'external-b', 'b@example.com', 'Member B');
  `);
  return new SqliteD1Database(sqlite);
}

function context(db) {
  return {
    identity: { externalId: "external-a", email: "a@example.com", displayName: "Member A" },
    member: {
      id: "member-a",
      household_id: "household-a",
      external_user_id: "external-a",
      email: "a@example.com",
      display_name: "Member A",
      role: "member",
      personal_detail_visibility: "private",
    },
    db,
  };
}

function insertMove(db, overrides = {}) {
  const move = {
    id: "move-a",
    householdId: "household-a",
    memberId: "member-a",
    localDate: "2026-08-16",
    slot: 1,
    family: "tend",
    ownership: "personal",
    visibility: "private",
    sourceType: "task",
    sourceId: "task-a",
    title: "Do the thing",
    shortLabel: "Do thing",
    estimatedSeconds: 60,
    ...overrides,
  };
  db.sqlite.prepare(`INSERT INTO daily_moves (
    id, household_id, member_id, local_date, slot, family, ownership_type,
    visibility, source_type, source_id, title, short_label, estimated_seconds,
    status, selection_reason_code, move_policy_version, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'preference', 1, '2026-08-16T09:00:00.000Z')`)
    .run(
      move.id, move.householdId, move.memberId, move.localDate, move.slot,
      move.family, move.ownership, move.visibility, move.sourceType, move.sourceId,
      move.title, move.shortLabel, move.estimatedSeconds,
    );
  return move;
}

function dependencies() {
  let id = 0;
  return {
    occurredAt: "2026-08-16T12:00:00.000Z",
    createId: () => `generated-${++id}`,
  };
}

function count(db, table) {
  return Number(db.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}

test("task completion is canonical and duplicate/concurrent requests award once", async () => {
  const db = await database();
  db.sqlite.exec("INSERT INTO tasks (id, household_id, owner_member_id, title) VALUES ('task-a', 'household-a', 'member-a', 'Private task')");
  insertMove(db);
  const memberContext = context(db);

  await assert.rejects(
    completeDailyMove(memberContext, "move-a", { points: 999 }, dependencies()),
    (error) => error instanceof HttpError && error.status === 400,
  );
  assert.equal(db.sqlite.prepare("SELECT status FROM tasks WHERE id = 'task-a'").get().status, "open");
  assert.equal(count(db, "game_events"), 0);

  const [first, second] = await Promise.all([
    completeDailyMove(memberContext, "move-a", {}, dependencies()),
    completeDailyMove(memberContext, "move-a", {}, dependencies()),
  ]);
  const repeated = await completeDailyMove(memberContext, "move-a", { ignored: "after completion" }, dependencies());

  assert.equal(first.move.status, "complete");
  assert.equal(second.move.status, "complete");
  assert.equal(repeated.move.status, "complete");
  assert.equal(count(db, "game_events"), 1);
  assert.equal(count(db, "progress_balances"), 1);
  assert.equal(db.sqlite.prepare("SELECT lifetime_points FROM progress_balances").get().lifetime_points, 10);
  assert.equal(db.sqlite.prepare("SELECT status FROM tasks WHERE id = 'task-a'").get().status, "complete");
  const payload = db.sqlite.prepare("SELECT payload_json FROM game_events").get().payload_json;
  assert.deepEqual(JSON.parse(payload), { family: "tend", ownership: "personal", personalPoints: 10, householdPoints: 0 });
  assert.doesNotMatch(payload, /Private task|title|detail/);
});

test("shared grocery completion creates personal and household progress", async () => {
  const db = await database();
  db.sqlite.exec("INSERT INTO grocery_items (id, household_id, name) VALUES ('grocery-a', 'household-a', 'Secret groceries')");
  insertMove(db, { ownership: "shared", visibility: "household", sourceType: "grocery_item", sourceId: "grocery-a" });

  const result = await completeDailyMove(context(db), "move-a", {}, dependencies());
  assert.equal(result.event.visibility, "household");
  assert.deepEqual(result.balances.map((balance) => [balance.memberId, balance.dimension, balance.lifetimePoints]), [
    ["member-a", "tend", 10],
    [null, "household", 4],
  ]);
  assert.equal(db.sqlite.prepare("SELECT checked FROM grocery_items").get().checked, 1);
});

test("goal completion validates ownership and positive bounded values", async () => {
  const db = await database();
  db.sqlite.exec(`INSERT INTO goals (id, household_id, owner_member_id, ownership_type, name, tracking_type, target_value)
    VALUES ('goal-a', 'household-a', 'member-a', 'personal', 'Private goal', 'sessions', 5)`);
  insertMove(db, { family: "grow", sourceType: "goal", sourceId: "goal-a" });

  await assert.rejects(
    completeDailyMove(context(db), "move-a", { value: 0 }, dependencies()),
    (error) => error instanceof HttpError && error.status === 400,
  );
  assert.equal(count(db, "game_events"), 0);
  await completeDailyMove(context(db), "move-a", { value: 2 }, dependencies());
  assert.equal(db.sqlite.prepare("SELECT value FROM goal_entries").get().value, 2);

  const unauthorized = await database();
  unauthorized.sqlite.exec(`INSERT INTO goals (id, household_id, owner_member_id, ownership_type, name, tracking_type, target_value)
    VALUES ('goal-other', 'household-a', 'member-b', 'personal', 'Other goal', 'sessions', 5)`);
  insertMove(unauthorized, { family: "grow", sourceType: "goal", sourceId: "goal-other" });
  await assert.rejects(
    completeDailyMove(context(unauthorized), "move-a", { value: 1 }, dependencies()),
    (error) => error instanceof HttpError && error.status === 404,
  );
  assert.equal(count(unauthorized, "game_events"), 0);
});

test("transaction completion reuses category ownership and optional merchant-rule invariants", async () => {
  const db = await database();
  db.sqlite.exec(`
    INSERT INTO accounts (id, household_id, ownership_type, name, type) VALUES ('account-a', 'household-a', 'shared', 'Joint', 'credit');
    INSERT INTO transactions (id, household_id, account_id, merchant_name, amount_cents, transaction_date)
      VALUES ('transaction-a', 'household-a', 'account-a', 'Example Merchant', 1200, '2026-08-15');
    INSERT INTO categories (id, household_id, ownership_type, name, monthly_limit_cents)
      VALUES ('category-a', 'household-a', 'shared', 'Shared', 10000);
  `);
  insertMove(db, { ownership: "shared", visibility: "household", sourceType: "transaction", sourceId: "transaction-a" });

  await completeDailyMove(context(db), "move-a", { categoryId: "category-a", createRule: true }, dependencies());
  const transaction = db.sqlite.prepare("SELECT review_status, category_id FROM transactions").get();
  assert.equal(transaction.review_status, "ready");
  assert.equal(transaction.category_id, "category-a");
  assert.equal(count(db, "merchant_rules"), 1);
  assert.equal(count(db, "game_events"), 1);

  const mismatched = await database();
  mismatched.sqlite.exec(`
    INSERT INTO accounts (id, household_id, owner_member_id, ownership_type, name, type)
      VALUES ('account-private', 'household-a', 'member-a', 'personal', 'Private', 'credit');
    INSERT INTO transactions (id, household_id, account_id, merchant_name, amount_cents, transaction_date)
      VALUES ('transaction-private', 'household-a', 'account-private', 'Private Merchant', 1200, '2026-08-15');
    INSERT INTO categories (id, household_id, ownership_type, name, monthly_limit_cents)
      VALUES ('category-a', 'household-a', 'shared', 'Shared', 10000);
  `);
  insertMove(mismatched, {
    ownership: "shared",
    visibility: "household",
    sourceType: "transaction",
    sourceId: "transaction-private",
  });
  await assert.rejects(
    completeDailyMove(context(mismatched), "move-a", { categoryId: "category-a" }, dependencies()),
    (error) => error instanceof HttpError && error.status === 409,
  );
  assert.equal(mismatched.sqlite.prepare("SELECT review_status FROM transactions").get().review_status, "needs_review");
  assert.equal(count(mismatched, "game_events"), 0);
});

test("bank completion requires a verified healthy connection", async () => {
  const db = await database();
  db.sqlite.exec(`INSERT INTO bank_connections
    (id, household_id, ownership_type, item_id, access_token_ciphertext, institution_name, status)
    VALUES ('bank-a', 'household-a', 'shared', 'item-a', 'cipher', 'Private Bank', 'attention')`);
  insertMove(db, { ownership: "shared", visibility: "household", sourceType: "bank_connection", sourceId: "bank-a" });

  await assert.rejects(
    completeDailyMove(context(db), "move-a", {}, dependencies()),
    (error) => error instanceof HttpError && error.status === 409,
  );
  assert.equal(count(db, "game_events"), 0);
  db.sqlite.exec("UPDATE bank_connections SET status = 'healthy' WHERE id = 'bank-a'");
  await completeDailyMove(context(db), "move-a", {}, dependencies());
  assert.equal(count(db, "game_events"), 1);
});

test("a failed atomic batch rolls back domain, move, event, and progress writes", async () => {
  const db = await database();
  db.sqlite.exec("INSERT INTO tasks (id, household_id, owner_member_id, title) VALUES ('task-a', 'household-a', 'member-a', 'Private task')");
  insertMove(db);
  db.failPattern = /INSERT OR IGNORE INTO game_events/;

  await assert.rejects(completeDailyMove(context(db), "move-a", {}, dependencies()), /D1_SECRET_BATCH_FAILURE/);
  assert.equal(db.sqlite.prepare("SELECT status FROM tasks").get().status, "open");
  assert.equal(db.sqlite.prepare("SELECT status FROM daily_moves").get().status, "active");
  assert.equal(count(db, "game_events"), 0);
  assert.equal(count(db, "progress_balances"), 0);
});

test("a move that stops being active before the batch cannot mutate its source or award progress", async () => {
  const db = await database();
  db.sqlite.exec("INSERT INTO tasks (id, household_id, owner_member_id, title) VALUES ('task-a', 'household-a', 'member-a', 'Private task')");
  insertMove(db);
  db.beforeBatch = () => db.sqlite.exec("UPDATE daily_moves SET status = 'deferred' WHERE id = 'move-a'");

  await assert.rejects(
    completeDailyMove(context(db), "move-a", {}, dependencies()),
    (error) => error instanceof HttpError && error.status === 409,
  );
  assert.equal(db.sqlite.prepare("SELECT status FROM tasks").get().status, "open");
  assert.equal(db.sqlite.prepare("SELECT status FROM daily_moves").get().status, "deferred");
  assert.equal(count(db, "game_events"), 0);
  assert.equal(count(db, "progress_balances"), 0);
});

test("deferral and replacement never write events or progress", async () => {
  const deferredDb = await database();
  insertMove(deferredDb);
  const deferred = await deferDailyMove(context(deferredDb), "move-a");
  assert.equal(deferred.status, "deferred");
  assert.equal((await deferDailyMove(context(deferredDb), "move-a")).status, "deferred");
  assert.equal(count(deferredDb, "game_events"), 0);
  assert.equal(count(deferredDb, "progress_balances"), 0);

  const replacementDb = await database();
  insertMove(replacementDb);
  insertMove(replacementDb, { id: "move-b", slot: 2, sourceType: "goal", sourceId: "goal-y" });
  const candidate = (id, family, sourceType = "goal", urgency = 0) => ({
    householdId: "household-a",
    memberId: "member-a",
    family,
    ownership: "personal",
    visibility: "private",
    source: { type: sourceType, id },
    title: `Candidate ${id}`,
    shortLabel: `Candidate ${id}`,
    estimatedSeconds: 60,
    eligible: true,
    signals: { urgency, uncertainty: 0, dueSoon: 0, preference: 0.5, cooperative: 0, comeback: 0, effort: 0, repetition: 0 },
  });
  const candidates = [
    candidate("task-a", "tend", "task", 1),
    candidate("goal-y", "grow"),
    candidate("goal-z", "grow"),
    candidate("goal-a", "move"),
  ];
  const replaced = await replaceDailyMove(context(replacementDb), "move-a", {
    candidateProvider: async () => [...candidates].reverse(),
    occurredAt: "2026-08-16T12:00:00.000Z",
  });
  assert.equal(replaced.source.id, "goal-a");
  await assert.rejects(
    replaceDailyMove(context(replacementDb), "move-b", { candidateProvider: async () => candidates, occurredAt: "2026-08-16T13:00:00.000Z" }),
    (error) => error instanceof HttpError && error.status === 409,
  );
  assert.equal(count(replacementDb, "game_events"), 0);
  assert.equal(count(replacementDb, "progress_balances"), 0);
});

test("an empty day performs no progress writes", async () => {
  const db = await database();
  assert.equal(count(db, "game_events"), 0);
  assert.equal(count(db, "progress_balances"), 0);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { spendingByCategory } from "../lib/household/spending.ts";
import { prepareTransferStatements } from "../lib/household/transaction-review.ts";

class Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new Statement(this.database, this.sql, values);
  }

  async first() {
    return this.database.sqlite.prepare(this.sql).get(...this.values) ?? null;
  }

  async all() {
    return { success: true, results: this.database.sqlite.prepare(this.sql).all(...this.values), meta: {} };
  }

  async run() {
    const result = this.database.sqlite.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

class Database {
  constructor(sqlite) {
    this.sqlite = sqlite;
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

const member = { id: "member-a", household_id: "household-a" };

async function household() {
  const sqlite = new DatabaseSync(":memory:");
  const directory = new URL("../drizzle/", import.meta.url);
  const journal = JSON.parse(await readFile(new URL("meta/_journal.json", directory), "utf8"));
  for (const entry of [...journal.entries].sort((left, right) => left.idx - right.idx)) {
    const sql = await readFile(new URL(`${entry.tag}.sql`, directory), "utf8");
    sqlite.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  sqlite.exec(`
    INSERT INTO households (id, name) VALUES ('household-a', 'Home');
    INSERT INTO members (id, household_id, external_user_id, email, display_name)
      VALUES ('member-a', 'household-a', 'external-a', 'a@example.com', 'A'),
             ('member-b', 'household-a', 'external-b', 'b@example.com', 'B');
    INSERT INTO accounts (id, household_id, owner_member_id, ownership_type, name, type)
      VALUES ('account-shared', 'household-a', NULL, 'shared', 'Joint', 'checking'),
             ('account-partner', 'household-a', 'member-b', 'personal', 'Their card', 'credit');
    INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents)
      VALUES ('cat-groceries', 'household-a', NULL, 'shared', 'Groceries', 60000);
    INSERT INTO transactions (id, household_id, account_id, merchant_name, amount_cents, transaction_date, spending_type, category_id, review_status)
      VALUES ('txn-groceries', 'household-a', 'account-shared', 'Market', 5000, '2026-08-05', 'shared', 'cat-groceries', 'ready'),
             ('txn-card-payment', 'household-a', 'account-shared', 'Card payment', 40000, '2026-08-06', 'shared', 'cat-groceries', 'ready'),
             ('txn-refund', 'household-a', 'account-shared', 'Market refund', -1500, '2026-08-07', 'shared', 'cat-groceries', 'ready'),
             ('txn-theirs', 'household-a', 'account-partner', 'Private', 2000, '2026-08-08', 'personal', NULL, 'needs_review');
  `);
  return new Database(sqlite);
}

test("a refund reduces its category instead of adding to it", async () => {
  const db = await household();
  const spending = await spendingByCategory(db, "household-a", "2026-08");
  // 50.00 spent, 400.00 card payment still counted, 15.00 back.
  assert.equal(spending.get("cat-groceries"), 43500);
});

test("marking a transfer takes it out of spending and out of every budget", async () => {
  const db = await household();
  await db.batch(await prepareTransferStatements(db, member, "txn-card-payment", true));

  const spending = await spendingByCategory(db, "household-a", "2026-08");
  assert.equal(spending.get("cat-groceries"), 3500, "only the purchase and its refund remain");

  const row = db.sqlite.prepare("SELECT is_transfer, category_id, review_status FROM transactions WHERE id = 'txn-card-payment'").get();
  assert.equal(row.is_transfer, 1);
  assert.equal(row.category_id, null, "a transfer belongs to no budget");
  assert.equal(row.review_status, "ready", "and it stops asking to be filed");
});

test("marking a split purchase as a transfer clears the split it no longer has", async () => {
  const db = await household();
  db.sqlite.exec(`
    UPDATE transactions SET review_status = 'split', category_id = NULL WHERE id = 'txn-groceries';
    INSERT INTO transaction_splits (id, transaction_id, category_id, spending_type, amount_cents)
      VALUES ('split-1', 'txn-groceries', 'cat-groceries', 'shared', 5000);
  `);
  await db.batch(await prepareTransferStatements(db, member, "txn-groceries", true));

  const splits = db.sqlite.prepare("SELECT COUNT(*) AS count FROM transaction_splits WHERE transaction_id = 'txn-groceries'").get();
  assert.equal(Number(splits.count), 0);
  const spending = await spendingByCategory(db, "household-a", "2026-08");
  assert.equal(spending.get("cat-groceries"), 38500, "the card payment and the refund are all that is left");
});

test("counting a transfer again asks for a category", async () => {
  const db = await household();
  await db.batch(await prepareTransferStatements(db, member, "txn-card-payment", true));
  await db.batch(await prepareTransferStatements(db, member, "txn-card-payment", false));

  const row = db.sqlite.prepare("SELECT is_transfer, review_status FROM transactions WHERE id = 'txn-card-payment'").get();
  assert.equal(row.is_transfer, 0);
  assert.equal(row.review_status, "needs_review");
});

test("a partner's private purchase is not yours to reclassify", async () => {
  const db = await household();
  await assert.rejects(
    prepareTransferStatements(db, member, "txn-theirs", true),
    (error) => error.status === 403,
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { auditEventStatement, safeAuditMetadata } from "../lib/observability/audit.ts";
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
    this.failFrom = null;
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const [index, statement] of statements.entries()) {
        if (this.failFrom === index) throw new Error("D1_BATCH_FAILURE");
        results.push(await statement.run());
      }
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
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
      VALUES ('member-a', 'household-a', 'external-a', 'a@example.com', 'A');
    INSERT INTO accounts (id, household_id, owner_member_id, ownership_type, name, type)
      VALUES ('account-shared', 'household-a', NULL, 'shared', 'Joint', 'checking');
    INSERT INTO transactions (id, household_id, account_id, merchant_name, amount_cents, transaction_date, spending_type, review_status)
      VALUES ('txn-card-payment', 'household-a', 'account-shared', 'Card payment', 40000, '2026-08-06', 'shared', 'ready');
  `);
  return new Database(sqlite);
}

test("audit metadata carries identifiers and counts, never financial detail", () => {
  assert.deepEqual(
    safeAuditMetadata({ month: "2026-08", accounts: 3, isTransfer: true, ownership: "shared" }),
    { month: "2026-08", accounts: 3, isTransfer: true, ownership: "shared" },
  );

  // Anything that could be a person's money or identity is dropped, whatever
  // the caller thought it was doing.
  assert.deepEqual(safeAuditMetadata({
    amountCents: 40000,
    balance: 12,
    merchantName: "Costco",
    email: "a@example.com",
    accessToken: "secret-token",
    note: "bought a very specific and private thing",
  }), {});
});

test("a change and its audit record land together or not at all", async () => {
  const db = await household();
  await db.batch(await prepareTransferStatements(db, member, "txn-card-payment", true));

  const rows = db.sqlite.prepare("SELECT action, subject_type, subject_id, member_id, metadata_json FROM audit_events").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "transaction.reclassified");
  assert.equal(rows[0].subject_id, "txn-card-payment");
  assert.equal(rows[0].member_id, "member-a");
  assert.deepEqual(JSON.parse(rows[0].metadata_json), { isTransfer: true });

  // If the change fails, its record must not survive on its own.
  const failing = await household();
  failing.failFrom = 2;
  await assert.rejects(failing.batch(await prepareTransferStatements(failing, member, "txn-card-payment", true)));
  assert.equal(Number(failing.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events").get().count), 0);
  assert.equal(
    Number(failing.sqlite.prepare("SELECT is_transfer FROM transactions WHERE id = 'txn-card-payment'").get().is_transfer),
    0,
    "and the transaction is untouched",
  );
});

test("the audit trail is scoped to one household and rejects unreadable metadata", async () => {
  const db = await household();
  await db.batch([auditEventStatement(db, {
    householdId: "household-a",
    memberId: null,
    action: "invitation.saved",
    subjectType: "invitation",
    subjectId: "invitation-1",
    occurredAt: "2026-08-16T10:00:00.000Z",
  })]);

  const row = db.sqlite.prepare("SELECT household_id, member_id, metadata_json FROM audit_events WHERE subject_id = 'invitation-1'").get();
  assert.equal(row.household_id, "household-a");
  assert.equal(row.member_id, null, "a household action need not belong to a member");
  assert.equal(row.metadata_json, "{}");

  // The column check keeps anything unreadable out of the trail entirely.
  assert.throws(() => db.sqlite.prepare(`INSERT INTO audit_events
    (id, household_id, action, subject_type, subject_id, metadata_json, occurred_at)
    VALUES ('bad', 'household-a', 'invitation.saved', 'invitation', 'x', 'not json', '2026-08-16T10:00:00.000Z')`).run());
});

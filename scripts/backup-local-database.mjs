import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";

import { localDatabaseFiles } from "./local-database.mjs";

const BACKUP_DIRECTORY = join("backups");

// Ordered so a restore never inserts a row before the row it references.
const TABLE_ORDER = [
  "households",
  "members",
  "invitations",
  "accounts",
  "bank_connections",
  "categories",
  "monthly_category_budgets",
  "transactions",
  "transaction_splits",
  "merchant_rules",
  "tasks",
  "grocery_items",
  "goals",
  "goal_entries",
  "daily_moves",
  "personas",
  "game_events",
  "persona_unlocks",
  "household_unlocks",
  "progress_balances",
  "audit_events",
];

function openLocalDatabase() {
  const files = localDatabaseFiles();
  if (files.length !== 1) {
    throw new Error("Expected exactly one local database. Start the dev server, then try again.");
  }
  return { file: files[0], database: new DatabaseSync(files[0]) };
}

function existingTables(database) {
  const rows = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  return new Set(rows.map((row) => row.name));
}

export function backupLocalDatabase() {
  const { database } = openLocalDatabase();
  try {
    const present = existingTables(database);
    const tables = {};
    let rowCount = 0;
    for (const table of TABLE_ORDER) {
      if (!present.has(table)) continue;
      const rows = database.prepare(`SELECT * FROM ${table}`).all();
      tables[table] = rows;
      rowCount += rows.length;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = join(BACKUP_DIRECTORY, `homebase-${stamp}.json`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ takenAt: new Date().toISOString(), tables }, null, 2)}\n`);
    console.log(`Backed up ${rowCount} rows across ${Object.keys(tables).length} tables to ${path}`);
    return path;
  } finally {
    database.close();
  }
}

export function restoreLocalDatabase(path) {
  if (!path) throw new Error("Usage: npm run db:restore:local -- backups/homebase-<stamp>.json");
  const backup = JSON.parse(readFileSync(path, "utf8"));
  const { database } = openLocalDatabase();

  try {
    const present = existingTables(database);
    database.exec("BEGIN IMMEDIATE");
    try {
      // Clear in reverse dependency order, then refill in forward order.
      for (const table of [...TABLE_ORDER].reverse()) {
        if (present.has(table)) database.prepare(`DELETE FROM ${table}`).run();
      }
      let restored = 0;
      for (const table of TABLE_ORDER) {
        const rows = backup.tables?.[table] ?? [];
        if (!present.has(table) || rows.length === 0) continue;
        const columns = Object.keys(rows[0]);
        const insert = database.prepare(
          `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(", ")})
           VALUES (${columns.map(() => "?").join(", ")})`,
        );
        for (const row of rows) {
          insert.run(...columns.map((column) => row[column] ?? null));
          restored += 1;
        }
      }
      database.exec("COMMIT");
      console.log(`Restored ${restored} rows from ${path} (taken ${backup.takenAt}).`);
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

const [command, argument] = process.argv.slice(2);
try {
  if (command === "backup") backupLocalDatabase();
  else if (command === "restore") restoreLocalDatabase(argument);
  else throw new Error("Usage: node scripts/backup-local-database.mjs <backup|restore [path]>");
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exitCode = 1;
}

import { existsSync, readdirSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

// Local Miniflare keeps one SQLite file per D1 binding under this directory.
// `metadata.sqlite` is Miniflare bookkeeping, not the Homebase database.
const D1_STATE_DIRECTORY = join(".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");
const MIGRATIONS_DIRECTORY = "drizzle";
const JOURNAL_PATH = join(MIGRATIONS_DIRECTORY, "meta", "_journal.json");
const TRACKING_TABLE = "_homebase_local_migrations";
const FIRST_APPLICATION_TABLE = "households";

const DEV_URL = process.env.HOMEBASE_DEV_URL ?? "http://localhost:3000";
const START_DEV_FIRST = `No local database found in ${D1_STATE_DIRECTORY}.

Miniflare creates it the first time a request opens the D1 binding, so the dev
server has to be running. Start it with \`npm run dev\`, then run this command
again in a second terminal. Set HOMEBASE_DEV_URL if it is not on ${DEV_URL}.`;

export function localDatabaseFiles() {
  if (!existsSync(D1_STATE_DIRECTORY)) return [];
  return readdirSync(D1_STATE_DIRECTORY)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => join(D1_STATE_DIRECTORY, name));
}

// Miniflare creates the SQLite file lazily. One request against a
// household-scoped route opens the binding, which is enough to create it.
async function createDatabaseThroughDevServer() {
  try {
    await fetch(new URL("/api/world", DEV_URL), { signal: AbortSignal.timeout(5_000) });
  } catch {
    return false;
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (localDatabaseFiles().length > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function resolveLocalDatabase() {
  if (localDatabaseFiles().length === 0) await createDatabaseThroughDevServer();

  const files = localDatabaseFiles();
  if (files.length === 0) {
    throw new Error(START_DEV_FIRST);
  }
  if (files.length > 1) {
    throw new Error(`Found more than one local database and cannot choose between them:\n${files.map((file) => `  ${file}`).join("\n")}\n\nRun \`npm run db:reset:local\` to clear local state, then start the dev server again.`);
  }
  return files[0];
}

async function orderedMigrationTags() {
  const journal = JSON.parse(await readFile(JOURNAL_PATH, "utf8"));
  return [...journal.entries]
    .sort((left, right) => left.idx - right.idx)
    .map((entry) => entry.tag);
}

function tableExists(database, name) {
  return database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) !== undefined;
}

export async function applyLocalMigrations() {
  const file = await resolveLocalDatabase();
  const tags = await orderedMigrationTags();
  const database = new DatabaseSync(file);

  try {
    const tracked = tableExists(database, TRACKING_TABLE);
    if (!tracked && tableExists(database, FIRST_APPLICATION_TABLE)) {
      throw new Error(`The local database at ${file} already has Homebase tables but no migration history, so pending migrations cannot be applied safely.

This happens to databases created before this command existed. Local data is
seeded demonstration data, so the fix is to start over:

  1. Stop the dev server.
  2. npm run db:reset:local
  3. npm run dev
  4. npm run db:migrate:local`);
    }

    database.exec(`CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      tag TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`);

    const applied = new Set(
      database.prepare(`SELECT tag FROM ${TRACKING_TABLE}`).all().map((row) => row.tag),
    );
    const pending = tags.filter((tag) => !applied.has(tag));
    if (pending.length === 0) {
      console.log(`Local database is up to date (${tags.length} migrations applied).`);
      return;
    }

    for (const tag of pending) {
      const sql = await readFile(join(MIGRATIONS_DIRECTORY, `${tag}.sql`), "utf8");
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const statement of sql.split("--> statement-breakpoint")) {
          if (statement.trim().length > 0) database.exec(statement);
        }
        database
          .prepare(`INSERT INTO ${TRACKING_TABLE} (tag, applied_at) VALUES (?, ?)`)
          .run(tag, new Date().toISOString());
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw new Error(`Migration ${tag} failed: ${error.message}`);
      }
      console.log(`Applied ${tag}`);
    }
    console.log(`Local database is ready (${pending.length} migration${pending.length === 1 ? "" : "s"} applied).`);
  } finally {
    database.close();
  }
}

export function resetLocalDatabase() {
  const files = localDatabaseFiles();
  if (files.length === 0) {
    console.log("No local database to remove.");
    return;
  }
  for (const file of files) {
    for (const path of [file, `${file}-wal`, `${file}-shm`]) {
      rmSync(path, { force: true });
    }
    console.log(`Removed ${file}`);
  }
  console.log("Start the dev server to recreate it, then run `npm run db:migrate:local`.");
}

const command = process.argv[2];
const invokedDirectly = process.argv[1]?.endsWith("local-database.mjs") === true;
try {
  if (!invokedDirectly) {
    // Imported for its helpers, not run as a command.
  } else {
    if (command === "migrate") await applyLocalMigrations();
    else if (command === "reset") resetLocalDatabase();
    else throw new Error("Usage: node scripts/local-database.mjs <migrate|reset>");
  }
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exitCode = 1;
}

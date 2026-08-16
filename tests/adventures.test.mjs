import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { offeredAdventureTemplateV1 } from "@homebase/domain-game";

import { acceptAdventure, loadAndSettleAdventures } from "../lib/adventures/service.ts";

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

const context = (db) => ({
  identity: { externalId: "external-a", email: "a@example.com", displayName: "A" },
  member: { id: "member-a", household_id: "household-a", external_user_id: "external-a", email: "a@example.com", display_name: "A", role: "owner", personal_detail_visibility: "private" },
  db,
});

async function household() {
  const sqlite = new DatabaseSync(":memory:");
  const directory = new URL("../drizzle/", import.meta.url);
  const journal = JSON.parse(await readFile(new URL("meta/_journal.json", directory), "utf8"));
  for (const entry of [...journal.entries].sort((left, right) => left.idx - right.idx)) {
    const sql = await readFile(new URL(`${entry.tag}.sql`, directory), "utf8");
    sqlite.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  sqlite.exec(`
    INSERT INTO households (id, name) VALUES ('household-a', 'Home'), ('household-b', 'Other');
    INSERT INTO members (id, household_id, external_user_id, email, display_name)
      VALUES ('member-a', 'household-a', 'external-a', 'a@example.com', 'A');
  `);
  return new Database(sqlite);
}

let completions = 0;
function completion(db, { family, ownership = "shared", visibility = "household", occurredAt, householdId = "household-a" }) {
  completions += 1;
  db.sqlite.prepare(`INSERT INTO game_events
    (id, household_id, member_id, event_type, source_type, source_id, visibility, payload_version, payload_json, idempotency_key, occurred_at, created_at)
    VALUES (?, ?, 'member-a', 'daily_move.completed', 'daily_move', ?, ?, 1, ?, ?, ?, ?)`)
    .run(
      `event-${completions}`,
      householdId,
      `move-${completions}`,
      visibility,
      JSON.stringify({ family, ownership, personalPoints: 10, householdPoints: ownership === "shared" ? 4 : 0 }),
      `daily_move.completed:move-${completions}:v1`,
      occurredAt,
      occurredAt,
    );
}

const startedAt = "2026-08-10T09:00:00.000Z";

async function beginAdventure(db, at = startedAt) {
  const template = offeredAdventureTemplateV1(at.slice(0, 10));
  const snapshot = await acceptAdventure(context(db), template.key, { createId: () => "adventure-1", generatedAt: at });
  return { template, snapshot };
}

test("an adventure is offered until one is under way", async () => {
  const db = await household();
  const before = await loadAndSettleAdventures(context(db), startedAt);
  assert.equal(before.active, null);
  assert.ok(before.offered, "a household with nothing running has something to begin");
  assert.equal(before.offered.status, "offered");
  assert.equal(before.offered.currentValue, 0);

  const { snapshot } = await beginAdventure(db);
  assert.equal(snapshot.offered, null, "nothing new is offered while one runs");
  assert.equal(snapshot.active?.status, "active");
});

test("only shared moves of the right kind count toward it", async () => {
  const db = await household();
  const { template } = await beginAdventure(db);
  const other = template.family === "connect" ? "tend" : "connect";

  completion(db, { family: template.family, occurredAt: "2026-08-11T10:00:00.000Z" });
  completion(db, { family: other, occurredAt: "2026-08-11T11:00:00.000Z" });
  completion(db, { family: template.family, ownership: "personal", visibility: "private", occurredAt: "2026-08-11T12:00:00.000Z" });
  completion(db, { family: template.family, occurredAt: "2026-08-09T10:00:00.000Z" });
  completion(db, { family: template.family, householdId: "household-b", occurredAt: "2026-08-11T13:00:00.000Z" });

  const snapshot = await loadAndSettleAdventures(context(db), "2026-08-12T09:00:00.000Z");
  // Only the one shared move of the right family, inside the week, in this home.
  assert.equal(snapshot.active?.currentValue, 1);
});

test("reaching the target finishes it once, and records it once", async () => {
  const db = await household();
  const { template } = await beginAdventure(db);
  for (let index = 0; index < template.targetValue; index += 1) {
    completion(db, { family: template.family, occurredAt: `2026-08-1${index + 1}T10:00:00.000Z` });
  }

  const first = await loadAndSettleAdventures(context(db), "2026-08-16T09:00:00.000Z");
  assert.equal(first.active, null, "a finished adventure stops running");
  assert.equal(first.finished[0]?.status, "complete");
  assert.equal(first.finished[0]?.currentValue, template.targetValue);
  assert.ok(first.offered, "and the next one becomes available");

  const again = await loadAndSettleAdventures(context(db), "2026-08-16T10:00:00.000Z");
  assert.deepEqual(again.finished.map((entry) => entry.status), first.finished.map((entry) => entry.status));

  const events = db.sqlite.prepare("SELECT COUNT(*) AS count FROM game_events WHERE event_type = 'adventure.completed'").get();
  assert.equal(Number(events.count), 1, "reading twice does not record it twice");
});

test("a week that goes differently expires without penalty", async () => {
  const db = await household();
  const { template } = await beginAdventure(db);
  completion(db, { family: template.family, occurredAt: "2026-08-11T10:00:00.000Z" });

  const snapshot = await loadAndSettleAdventures(context(db), "2026-08-20T09:00:00.000Z");
  assert.equal(snapshot.active, null);
  assert.equal(snapshot.finished[0]?.status, "expired");
  assert.ok(snapshot.offered, "and something new is waiting whenever they come back");

  // Nothing was taken away: no completion event, and progress is untouched.
  const events = db.sqlite.prepare("SELECT COUNT(*) AS count FROM game_events WHERE event_type = 'adventure.completed'").get();
  assert.equal(Number(events.count), 0);
});

test("an adventure that is not the one on offer cannot be started", async () => {
  const db = await household();
  const offered = offeredAdventureTemplateV1(startedAt.slice(0, 10));
  const other = ["dinners-together", "tend-the-home", "move-together", "learn-together"]
    .find((key) => key !== offered.key);

  await assert.rejects(
    acceptAdventure(context(db), other, { createId: () => "adventure-x", generatedAt: startedAt }),
    (error) => error.status === 409,
  );
  await assert.rejects(
    acceptAdventure(context(db), "not-a-template", { createId: () => "adventure-y", generatedAt: startedAt }),
    (error) => error.status === 404,
  );
});

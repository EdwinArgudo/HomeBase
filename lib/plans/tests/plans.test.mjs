import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { HttpError } from "../../auth/identity.ts";
import { createPlansHandlers } from "../http.ts";
import { applyPlansAction, loadPlansSnapshot } from "../service.ts";

class Statement {
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.db, this.sql, values); }
  async first() { return this.db.sqlite.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { success: true, results: this.db.sqlite.prepare(this.sql).all(...this.values), meta: {} }; }
  async run() { const result = this.db.sqlite.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; }
}
class D1 { constructor(sqlite) { this.sqlite = sqlite; } prepare(sql) { return new Statement(this, sql); } }

async function database() {
  const sqlite = new DatabaseSync(":memory:");
  const directory = new URL("../../../drizzle/", import.meta.url);
  for (const migration of (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
    sqlite.exec((await readFile(new URL(migration, directory), "utf8")).replaceAll("--> statement-breakpoint", ""));
  }
  sqlite.exec(`
    INSERT INTO households (id, name) VALUES ('house-a', 'A'), ('house-b', 'B');
    INSERT INTO members (id, household_id, external_user_id, display_name, email) VALUES
      ('member-a', 'house-a', 'external-a', 'A', 'a@example.test'),
      ('member-b', 'house-a', 'external-b', 'B', 'b@example.test'),
      ('member-z', 'house-b', 'external-z', 'Z', 'z@example.test');
    INSERT INTO tasks (id, household_id, owner_member_id, title, status, due_date) VALUES
      ('task-shared', 'house-a', NULL, 'Shared task', 'open', '2026-08-16'),
      ('task-mine', 'house-a', 'member-a', 'My private task', 'open', NULL),
      ('task-partner', 'house-a', 'member-b', 'Partner secret task', 'open', NULL),
      ('task-other', 'house-b', 'member-z', 'Other secret task', 'open', NULL);
    INSERT INTO grocery_items (id, household_id, name, checked) VALUES
      ('grocery-a', 'house-a', 'Oats', 0), ('grocery-b', 'house-b', 'Other secret grocery', 0);
    INSERT INTO goals (id, household_id, owner_member_id, ownership_type, name, tracking_type, target_value, minimum_value, active) VALUES
      ('goal-shared', 'house-a', NULL, 'shared', 'House fund', 'amount', 10000, 1000, 1),
      ('goal-mine', 'house-a', 'member-a', 'personal', 'Practice Spanish', 'sessions', 12, 1, 1),
      ('goal-partner', 'house-a', 'member-b', 'personal', 'Partner secret goal', 'sessions', 20, NULL, 1),
      ('goal-inactive', 'house-a', NULL, 'shared', 'Finished goal', 'sessions', 3, NULL, 0),
      ('goal-other', 'house-b', 'member-z', 'personal', 'Other secret goal', 'amount', 9000, NULL, 1);
    INSERT INTO goal_entries (id, goal_id, member_id, value, occurred_at) VALUES
      ('entry-shared-a', 'goal-shared', 'member-a', 2500, '2026-08-15'),
      ('entry-shared-b', 'goal-shared', 'member-b', 1500, '2026-08-16'),
      ('entry-mine', 'goal-mine', 'member-a', 3, '2026-08-16'),
      ('entry-partner', 'goal-partner', 'member-b', 9, '2026-08-16');
  `);
  return new D1(sqlite);
}

function context(db) {
  return { identity: { externalId: "external-a", displayName: "A" }, member: { id: "member-a", household_id: "house-a", external_user_id: "external-a", display_name: "A" }, db };
}
const now = "2026-08-16T12:00:00.000Z";

test("plans snapshot is current-member scoped, field-minimal, and deterministically aggregates goals", async () => {
  const db = await database();
  const snapshot = await loadPlansSnapshot(context(db), now);
  assert.deepEqual(snapshot.tasks.map((item) => [item.id, item.owner]), [["task-shared", "together"], ["task-mine", "you"]]);
  assert.deepEqual(snapshot.groceries.map((item) => item.id), ["grocery-a"]);
  assert.deepEqual(snapshot.goals.map((goal) => [goal.id, goal.currentValue]), [["goal-shared", 4000], ["goal-mine", 3]]);
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /Partner secret|Other secret|member-|house-|goal_entries|added_by|created_at/i);
  assert.equal(snapshot.goals.find((goal) => goal.id === "goal-shared").trackingType, "amount");
});

test("task and grocery writes are exact-scoped and return authoritative snapshots", async () => {
  const db = await database();
  await assert.rejects(
    applyPlansAction(context(db), { contractVersion: 1, action: "toggle_task", id: "task-partner" }, { generatedAt: now, createId: () => "unused" }),
    (error) => error instanceof HttpError && error.status === 404,
  );
  assert.equal(db.sqlite.prepare("SELECT status FROM tasks WHERE id='task-partner'").get().status, "open");
  await assert.rejects(
    applyPlansAction(context(db), { contractVersion: 1, action: "toggle_task", id: "task-other" }, { generatedAt: now, createId: () => "unused" }),
    (error) => error instanceof HttpError && error.status === 404,
  );
  const toggled = await applyPlansAction(context(db), { contractVersion: 1, action: "toggle_task", id: "task-mine" }, { generatedAt: now, createId: () => "unused" });
  assert.equal(toggled.tasks.find((item) => item.id === "task-mine").status, "complete");
  const added = await applyPlansAction(context(db), { contractVersion: 1, action: "add_grocery", text: "Apples" }, { generatedAt: now, createId: () => "grocery-new" });
  assert.equal(added.groceries.find((item) => item.id === "grocery-new").name, "Apples");
  assert.equal(db.sqlite.prepare("SELECT added_by_member_id FROM grocery_items WHERE id='grocery-new'").get().added_by_member_id, "member-a");
  const checked = await applyPlansAction(context(db), { contractVersion: 1, action: "toggle_grocery", id: "grocery-new" }, { generatedAt: now, createId: () => "unused" });
  assert.equal(checked.groceries.find((item) => item.id === "grocery-new").checked, true);
});

test("plans HTTP authenticates before body/storage and hides unexpected failures", async () => {
  const calls = [];
  const handlers = createPlansHandlers({
    requireMember: async () => { calls.push("identity"); return context({}); }, now: () => now, createId: () => "new",
    apply: async () => { calls.push("storage"); throw new Error("D1_PLANS_SECRET"); },
  });
  const response = await handlers.POST(new Request("https://homebase.test/api/plans", { method: "POST", body: JSON.stringify({ contractVersion: 1, action: "add_grocery", text: "Oats" }) }));
  assert.deepEqual(calls, ["identity", "storage"]);
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /D1_PLANS_SECRET/);

  const get = createPlansHandlers({
    requireMember: async () => context({}), now: () => now, createId: () => "new",
    load: async () => { throw new Error("D1_PLANS_READ_SECRET"); },
  });
  const failedGet = await get.GET(new Request("https://homebase.test/api/plans"));
  assert.equal(failedGet.status, 500);
  const getBody = await failedGet.text();
  assert.match(getBody, /Unable to load your plans/);
  assert.doesNotMatch(getBody, /D1_PLANS_READ_SECRET/);

  const denied = createPlansHandlers({ requireMember: async () => { throw new HttpError(401, "Sign in to continue."); }, now: () => now, createId: () => "new", apply: async () => assert.fail() });
  const unauthorized = await denied.POST(new Request("https://homebase.test/api/plans", { method: "POST", body: "not-json" }));
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { error: "Sign in to continue." });
});

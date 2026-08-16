import assert from "node:assert/strict";
import test from "node:test";

import { createProgressGetHandler } from "../progress-http.ts";
import { loadProgressSnapshot } from "../progress.ts";

const member = {
  id: "member-a",
  household_id: "household-a",
  external_user_id: "external-a",
  email: "a@example.com",
  display_name: "Edwin",
  role: "member",
  personal_detail_visibility: "private",
};

function context(db) {
  return {
    identity: { externalId: "external-a", email: "a@example.com", displayName: "Edwin" },
    member,
    db,
  };
}

function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return { async all() { return { success: true, results: rows, meta: {} }; } };
        },
      };
    },
  };
}

const row = (overrides = {}) => ({
  id: "progress-tend",
  household_id: "household-a",
  member_id: "member-a",
  dimension: "tend",
  lifetime_points: 168,
  level: 2,
  updated_at: "2026-08-15T12:00:00.000Z",
  ...overrides,
});

test("progress query selects only exact current-member and household balance fields", async () => {
  const db = fakeDb([
    row({ id: "household", member_id: null, dimension: "household", lifetime_points: 300, level: 4 }),
    row(),
  ]);
  const snapshot = await loadProgressSnapshot(context(db), "2026-08-15T13:00:00.000Z");

  assert.deepEqual(snapshot.balances.map((balance) => balance.dimension), ["tend", "household"]);
  assert.deepEqual(snapshot.member, { id: "member-a", displayName: "Edwin" });
  assert.deepEqual(db.calls[0].values, ["household-a", "member-a"]);
  assert.match(db.calls[0].sql, /household_id = \?/);
  assert.match(db.calls[0].sql, /member_id = \?/);
  assert.match(db.calls[0].sql, /member_id IS NULL AND dimension = 'household'/);
  assert.match(db.calls[0].sql, /ORDER BY CASE dimension/);
  assert.doesNotMatch(db.calls[0].sql, /SELECT \*|game_events|payload|partner|finance|source_/i);
  assert.deepEqual(Object.keys(snapshot.member), ["id", "displayName"]);
});

test("an empty progress result is a valid deterministic snapshot", async () => {
  const snapshot = await loadProgressSnapshot(context(fakeDb([])), "2026-08-15T13:00:00.000Z");
  assert.deepEqual(snapshot.balances, []);
  assert.equal(snapshot.generatedAt, "2026-08-15T13:00:00.000Z");
});

test("progress HTTP authenticates before storage and hides internal failures", async () => {
  const calls = [];
  const handler = createProgressGetHandler({
    requireMember: async () => {
      calls.push("identity");
      return context({});
    },
    generatedAt: () => "2026-08-15T13:00:00.000Z",
    loadProgress: async () => {
      calls.push("storage");
      return {
        contractVersion: 1,
        householdId: "household-a",
        member: { id: "member-a", displayName: "Edwin" },
        balances: [],
        generatedAt: "2026-08-15T13:00:00.000Z",
      };
    },
  });
  const response = await handler(new Request("https://homebase.test/api/game/progress"));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["identity", "storage"]);

  const failure = createProgressGetHandler({
    requireMember: async () => context({}),
    generatedAt: () => "2026-08-15T13:00:00.000Z",
    loadProgress: async () => { throw new Error("D1_SECRET_PROGRESS_FAILURE"); },
  });
  const failed = await failure(new Request("https://homebase.test/api/game/progress"));
  const text = await failed.text();
  assert.equal(failed.status, 500);
  assert.match(text, /Unable to load progress/);
  assert.doesNotMatch(text, /D1_SECRET/);
});

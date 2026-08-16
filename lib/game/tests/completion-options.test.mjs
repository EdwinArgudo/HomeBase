import assert from "node:assert/strict";
import test from "node:test";

import { createMoveOptionsHandler } from "../options-http.ts";
import { loadMoveCompletionOptions } from "../completion-options.ts";

const member = {
  id: "member-a",
  household_id: "household-a",
  external_user_id: "external-a",
  email: "a@example.com",
  display_name: "Member A",
  role: "member",
  personal_detail_visibility: "private",
};

function moveRow(overrides = {}) {
  return {
    id: "move-a",
    household_id: "household-a",
    member_id: "member-a",
    local_date: "2026-08-15",
    slot: 1,
    family: "tend",
    ownership_type: "shared",
    visibility: "household",
    source_type: "transaction",
    source_id: "transaction-a",
    title: "Review one purchase",
    short_label: "Review purchase",
    estimated_seconds: 45,
    status: "active",
    selection_reason_code: "uncertainty",
    move_policy_version: 1,
    completed_at: null,
    replacement_count: 0,
    created_at: "2026-08-15T09:00:00.000Z",
    ...overrides,
  };
}

function fakeDb(row, categories = []) {
  const queries = [];
  return {
    queries,
    prepare(sql) {
      return {
        bind(...values) {
          queries.push({ sql, values });
          return {
            async first() {
              if (!sql.includes("FROM daily_moves")) return null;
              return values[0] === row?.id && values[1] === row?.household_id && values[2] === row?.member_id
                ? row
                : null;
            },
            async all() {
              return { success: true, results: categories, meta: {} };
            },
          };
        },
      };
    },
  };
}

function context(db) {
  return {
    identity: { externalId: "external-a", email: "a@example.com", displayName: "Member A" },
    member,
    db,
  };
}

test("transaction options are household-scoped, privacy-filtered, and field-minimal", async () => {
  const db = fakeDb(moveRow(), [
    { id: "shared-a", name: "Groceries", ownership_type: "shared" },
    { id: "mine-a", name: "Mine", ownership_type: "personal" },
  ]);
  const options = await loadMoveCompletionOptions(context(db), "move-a");

  assert.deepEqual(options, {
    contractVersion: 1,
    moveId: "move-a",
    kind: "transaction",
    categories: [
      { id: "shared-a", name: "Groceries", ownership: "shared" },
      { id: "mine-a", name: "Mine", ownership: "personal" },
    ],
    createRuleDefault: false,
  });
  const categoryQuery = db.queries[1];
  assert.deepEqual(categoryQuery.values, ["household-a", "member-a"]);
  assert.match(categoryQuery.sql, /household_id = \?/);
  assert.match(categoryQuery.sql, /ownership_type = 'shared'/);
  assert.match(categoryQuery.sql, /owner_member_id = \?/);
  assert.match(categoryQuery.sql, /archived_at IS NULL/);
  assert.doesNotMatch(categoryQuery.sql, /SELECT \*/i);
  assert.doesNotMatch(categoryQuery.sql, /merchant|amount|account/i);
  assert.deepEqual(Object.keys(options.categories[0]), ["id", "name", "ownership"]);
});

test("another member's move is indistinguishable from missing", async () => {
  const db = fakeDb(moveRow({ member_id: "member-b" }));
  await assert.rejects(
    loadMoveCompletionOptions(context(db), "move-a"),
    (error) => error?.status === 404 && error.message === "Move not found.",
  );
  assert.equal(db.queries.length, 1);
});

test("options HTTP authenticates before storage and preserves only safe errors", async () => {
  const calls = [];
  const handler = createMoveOptionsHandler({
    requireMember: async () => {
      calls.push("identity");
      return context({});
    },
    loadOptions: async () => {
      calls.push("storage");
      return { contractVersion: 1, moveId: "move-a", kind: "none" };
    },
  });
  const response = await handler(new Request("https://homebase.test/api/game/moves/move-a/options"), { params: { id: "move-a" } });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["identity", "storage"]);

  const failing = createMoveOptionsHandler({
    requireMember: async () => context({}),
    loadOptions: async () => { throw new Error("D1_SECRET_OPTIONS_FAILURE"); },
  });
  const failed = await failing(new Request("https://homebase.test/api/game/moves/move-a/options"), { params: { id: "move-a" } });
  const text = await failed.text();
  assert.equal(failed.status, 500);
  assert.match(text, /Unable to load completion options/);
  assert.doesNotMatch(text, /D1_SECRET/);
});

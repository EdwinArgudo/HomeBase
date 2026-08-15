import assert from "node:assert/strict";
import test from "node:test";

import { getOrCreateDailyMoveSnapshot } from "../daily-moves.ts";

const scope = { householdId: "household-a", memberId: "member-a", localDate: "2026-08-16" };

function row(overrides = {}) {
  return {
    id: "move-existing",
    household_id: scope.householdId,
    member_id: scope.memberId,
    local_date: scope.localDate,
    slot: 1,
    family: "tend",
    ownership_type: "personal",
    visibility: "private",
    source_type: "task",
    source_id: "task-existing",
    title: "Existing daily move",
    short_label: "Existing move",
    estimated_seconds: 120,
    status: "active",
    selection_reason_code: "preference",
    move_policy_version: 1,
    completed_at: null,
    created_at: "2026-08-16T09:00:00.000Z",
    ...overrides,
  };
}

function candidate(sourceId = "task-new") {
  return {
    householdId: scope.householdId,
    memberId: scope.memberId,
    family: "tend",
    ownership: "personal",
    visibility: "private",
    source: { type: "task", id: sourceId },
    title: "New candidate",
    shortLabel: "New candidate",
    estimatedSeconds: 60,
    eligible: true,
    signals: {
      urgency: 0,
      uncertainty: 0,
      dueSoon: 0,
      preference: 1,
      cooperative: 0,
      comeback: 0,
      effort: 0,
      repetition: 0,
    },
  };
}

class FakeStatement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new FakeStatement(this.database, this.sql, values);
  }

  async all() {
    assert.match(this.sql, /WHERE household_id = \? AND member_id = \? AND local_date = \?/);
    assert.deepEqual(this.values.length, 3);
    this.database.reads.push([...this.values]);
    const [householdId, memberId, localDate] = this.values;
    return {
      success: true,
      results: this.database.rows
        .filter((entry) => entry.household_id === householdId
          && entry.member_id === memberId
          && entry.local_date === localDate)
        .sort((left, right) => left.slot - right.slot)
        .map((entry) => ({ ...entry })),
      meta: {},
    };
  }
}

class FakeDatabase {
  constructor(rows = []) {
    this.rows = rows.map((entry) => ({ ...entry }));
    this.reads = [];
    this.batchCount = 0;
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    this.batchCount += 1;
    for (const statement of statements) {
      assert.match(statement.sql, /^INSERT OR IGNORE INTO daily_moves/);
      const values = statement.values;
      const inserted = row({
        id: values[0],
        household_id: values[1],
        member_id: values[2],
        local_date: values[3],
        slot: values[4],
        family: values[5],
        ownership_type: values[6],
        visibility: values[7],
        source_type: values[8],
        source_id: values[9],
        title: values[10],
        short_label: values[11],
        estimated_seconds: values[12],
        status: values[13],
        selection_reason_code: values[14],
        move_policy_version: values[15],
        completed_at: values[16],
        created_at: values[17],
      });
      const conflicts = this.rows.some((entry) => entry.id === inserted.id
        || (entry.member_id === inserted.member_id
          && entry.local_date === inserted.local_date
          && entry.slot === inserted.slot));
      if (!conflicts) this.rows.push(inserted);
    }
    return statements.map(() => ({ success: true, results: [], meta: { changes: 1 } }));
  }
}

function policy(overrides = {}) {
  return {
    candidateProvider: async () => [candidate()],
    createdAt: () => "2026-08-16T10:00:00.000Z",
    createId: ({ slot }) => `move-generated-${slot}`,
    ...overrides,
  };
}

test("an existing snapshot is returned unchanged without re-ranking", async () => {
  const database = new FakeDatabase([row()]);
  let providerCalls = 0;
  let minimumModeCalls = 0;
  const result = await getOrCreateDailyMoveSnapshot(database, scope, policy({
    candidateProvider: async () => {
      providerCalls += 1;
      return [candidate("ranking-changed")];
    },
    minimumModeProvider: async () => {
      minimumModeCalls += 1;
      return true;
    },
  }));

  assert.equal(providerCalls, 0);
  assert.equal(minimumModeCalls, 0);
  assert.equal(database.batchCount, 0);
  assert.deepEqual(result.map((move) => move.id), ["move-existing"]);
});

test("every read is scoped to exact household, member, and local date", async () => {
  const database = new FakeDatabase([
    row(),
    row({ id: "cross-household", household_id: "household-b" }),
    row({ id: "cross-member", member_id: "member-b" }),
    row({ id: "cross-date", local_date: "2026-08-17" }),
  ]);
  const result = await getOrCreateDailyMoveSnapshot(database, scope, policy());

  assert.deepEqual(database.reads, [[scope.householdId, scope.memberId, scope.localDate]]);
  assert.deepEqual(result.map((move) => move.id), ["move-existing"]);
  assert.ok(result.every((move) => move.householdId === scope.householdId
    && move.memberId === scope.memberId
    && move.localDate === scope.localDate));
});

test("zero-row materialization inserts-or-ignores and then re-reads", async () => {
  const database = new FakeDatabase();
  const result = await getOrCreateDailyMoveSnapshot(database, scope, policy());

  assert.equal(database.batchCount, 1);
  assert.deepEqual(database.reads, [
    [scope.householdId, scope.memberId, scope.localDate],
    [scope.householdId, scope.memberId, scope.localDate],
  ]);
  assert.equal(result[0]?.id, "move-generated-1");
});

test("concurrent materializers converge on the unique member/date/slot snapshot", async () => {
  const database = new FakeDatabase();
  let arrivals = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const candidateProvider = async () => {
    arrivals += 1;
    if (arrivals === 2) release();
    await barrier;
    return [candidate()];
  };

  const [first, second] = await Promise.all([
    getOrCreateDailyMoveSnapshot(database, scope, policy({ candidateProvider, createId: () => "move-racer-a" })),
    getOrCreateDailyMoveSnapshot(database, scope, policy({ candidateProvider, createId: () => "move-racer-b" })),
  ]);

  assert.equal(database.rows.length, 1);
  assert.deepEqual(first, second);
  assert.equal(first[0]?.id, "move-racer-a");
  assert.equal(database.batchCount, 2);
});

test("Minimum Mode provider caps a newly materialized snapshot at one move", async () => {
  const database = new FakeDatabase();
  const candidates = [
    candidate("task-a"),
    { ...candidate("task-b"), family: "grow" },
    { ...candidate("task-c"), family: "move" },
  ];
  const result = await getOrCreateDailyMoveSnapshot(database, scope, policy({
    candidateProvider: async () => candidates,
    minimumModeProvider: async () => true,
  }));

  assert.equal(result.length, 1);
  assert.equal(result[0]?.selectionReasonCode, "minimum_mode");
});

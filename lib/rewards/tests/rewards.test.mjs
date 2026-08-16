import assert from "node:assert/strict";
import test from "node:test";

import { HttpError } from "../../auth/identity.ts";
import { createRewardsGetHandler } from "../http.ts";
import { loadAndMaterializeRewards } from "../service.ts";

const now = "2026-08-15T14:00:00.000Z";
const context = (db) => ({
  identity: { externalId: "external-a", email: "a@example.com", displayName: "A" },
  member: { id: "member-a", household_id: "household-a", external_user_id: "external-a", email: "a@example.com", display_name: "A", role: "member", personal_detail_visibility: "private" },
  db,
});

class FakeDb {
  constructor({ persona = { id: "persona-a" }, progress = [], events = [] } = {}) {
    this.persona = persona;
    this.progress = progress;
    this.events = events;
    this.unlocks = new Map();
    this.calls = [];
    this.batchCalls = 0;
  }

  prepare(sql) {
    return { bind: (...values) => {
      this.calls.push({ sql, values });
      return {
        first: async () => sql.includes("FROM personas") ? this.persona : null,
        all: async () => ({ success: true, results: this.#all(sql, values), meta: {} }),
        run: async () => this.#run(sql, values),
      };
    } };
  }

  async batch(statements) {
    this.batchCalls += 1;
    for (const statement of statements) await statement.run();
    return statements.map(() => ({ success: true }));
  }

  #all(sql, values) {
    if (sql.includes("FROM progress_balances")) {
      const [householdId, memberId] = values;
      return this.progress.filter((row) => row.household_id === householdId && (row.member_id === memberId || (row.member_id === null && row.dimension === "household")));
    }
    if (sql.includes("FROM game_events")) {
      const [householdId] = values;
      return this.events.filter((event) => event.household_id === householdId)
        .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id));
    }
    if (sql.includes("FROM persona_unlocks")) {
      const [householdId, memberId, personaId] = values;
      return [...this.unlocks.values()].filter((row) => row.household_id === householdId && row.member_id === memberId && row.persona_id === personaId)
        .map((row) => ({ reward_key: row.reward_key, unlocked_at: row.unlocked_at }));
    }
    return [];
  }

  #run(sql, values) {
    if (sql.includes("INSERT OR IGNORE INTO persona_unlocks")) {
      const [id, householdId, memberId, personaId, rewardKey, sourceEventId, unlockedAt] = values;
      const key = `${personaId}:${rewardKey}`;
      if (!this.unlocks.has(key)) this.unlocks.set(key, { id, household_id: householdId, member_id: memberId, persona_id: personaId, reward_key: rewardKey, source_event_id: sourceEventId, unlocked_at: unlockedAt });
    }
    return { success: true };
  }
}

const progress = [
  { household_id: "household-a", member_id: "member-a", dimension: "tend", lifetime_points: 10 },
  { household_id: "household-a", member_id: null, dimension: "household", lifetime_points: 4 },
  { household_id: "household-a", member_id: "member-partner", dimension: "grow", lifetime_points: 999 },
];
const events = [
  { id: "event-tend-later", household_id: "household-a", member_id: "member-a", payload_json: JSON.stringify({ family: "tend", ownership: "personal", personalPoints: 10, householdPoints: 0 }), occurred_at: "2026-08-15T12:00:00.000Z" },
  { id: "event-tend-first", household_id: "household-a", member_id: "member-a", payload_json: JSON.stringify({ family: "tend", ownership: "personal", personalPoints: 10, householdPoints: 0 }), occurred_at: "2026-08-15T10:00:00.000Z" },
  { id: "event-shared", household_id: "household-a", member_id: "member-partner", payload_json: JSON.stringify({ family: "connect", ownership: "shared", personalPoints: 10, householdPoints: 4 }), occurred_at: "2026-08-15T11:00:00.000Z" },
].map((event) => ({ ...event, payload_version: 1, event_type: "daily_move.completed" }));

test("materializes eligible personal and household rewards from earliest canonical events", async () => {
  const db = new FakeDb({ progress, events });
  const snapshot = await loadAndMaterializeRewards(context(db), now);
  assert.equal(snapshot.personaId, "persona-a");
  assert.equal(snapshot.rewards.find((entry) => entry.reward.key === "first-tend").unlockedAt, "2026-08-15T10:00:00.000Z");
  assert.equal(snapshot.rewards.find((entry) => entry.reward.key === "first-household").unlockedAt, "2026-08-15T11:00:00.000Z");
  assert.equal(snapshot.rewards.find((entry) => entry.reward.key === "first-grow").currentPoints, 0, "partner progress is excluded");
  assert.equal(db.unlocks.size, 2);
  const progressQuery = db.calls.find((call) => call.sql.includes("FROM progress_balances"));
  assert.deepEqual(progressQuery.values, ["household-a", "member-a"]);
  assert.doesNotMatch(JSON.stringify(snapshot), /event-|member-partner|payload|source/i);
  assert.ok(db.calls.every((call) => !/UPDATE progress_balances|INSERT.*progress_balances/i.test(call.sql)));
});

test("repeat and concurrent reads preserve one unlock and its canonical timestamp", async () => {
  const db = new FakeDb({ progress, events });
  const first = await loadAndMaterializeRewards(context(db), now);
  const [second, third] = await Promise.all([
    loadAndMaterializeRewards(context(db), "2026-08-16T12:00:00.000Z"),
    loadAndMaterializeRewards(context(db), "2026-08-17T12:00:00.000Z"),
  ]);
  assert.equal(db.unlocks.size, 2);
  for (const key of ["first-tend", "first-household"]) {
    const unlocked = (snapshot) => snapshot.rewards.find((entry) => entry.reward.key === key).unlockedAt;
    assert.equal(unlocked(second), unlocked(first));
    assert.equal(unlocked(third), unlocked(first));
  }
});

test("no persona writes nothing and eligible progress without evidence stays locked", async () => {
  const withoutPersona = new FakeDb({ persona: null, progress, events });
  const empty = await loadAndMaterializeRewards(context(withoutPersona), now);
  assert.equal(empty.personaId, null);
  assert.ok(empty.rewards.every((entry) => entry.currentPoints === 0 && entry.unlockedAt === null));
  assert.equal(withoutPersona.batchCalls, 0);
  assert.equal(withoutPersona.calls.length, 1);

  const withoutEvent = new FakeDb({ progress, events: [] });
  const locked = await loadAndMaterializeRewards(context(withoutEvent), now);
  assert.equal(locked.rewards.find((entry) => entry.reward.key === "first-tend").currentPoints, 10);
  assert.equal(locked.rewards.find((entry) => entry.reward.key === "first-tend").unlockedAt, null);
  assert.equal(withoutEvent.unlocks.size, 0);
});

test("malformed and noncanonical positive event payloads cannot mint rewards", async () => {
  const malformedEvents = [
    { id: "invalid-json", payload_json: "{private-storage-fragment" },
    { id: "small-award", payload_json: JSON.stringify({ family: "tend", ownership: "personal", personalPoints: 1, householdPoints: 0 }) },
    { id: "personal-household-points", payload_json: JSON.stringify({ family: "tend", ownership: "personal", personalPoints: 10, householdPoints: 4 }) },
    { id: "shared-wrong-household-award", payload_json: JSON.stringify({ family: "connect", ownership: "shared", personalPoints: 10, householdPoints: 1 }) },
    { id: "unknown-family", payload_json: JSON.stringify({ family: "rest", ownership: "shared", personalPoints: 10, householdPoints: 4 }) },
  ].map((event, index) => ({
    ...event,
    household_id: "household-a",
    member_id: "member-a",
    occurred_at: `2026-08-15T1${index}:00:00.000Z`,
    payload_version: 1,
    event_type: "daily_move.completed",
  }));
  const db = new FakeDb({ progress, events: malformedEvents });
  const snapshot = await loadAndMaterializeRewards(context(db), now);
  assert.equal(snapshot.rewards.find((entry) => entry.reward.key === "first-tend").unlockedAt, null);
  assert.equal(snapshot.rewards.find((entry) => entry.reward.key === "first-household").unlockedAt, null);
  assert.equal(db.unlocks.size, 0);
});

test("reward HTTP authenticates before storage and hides internal errors", async () => {
  const calls = [];
  const handler = createRewardsGetHandler({
    requireMember: async () => { calls.push("identity"); return context({}); },
    generatedAt: () => now,
    loadRewards: async () => { calls.push("storage"); throw new Error("D1_REWARD_SECRET"); },
  });
  const response = await handler(new Request("https://homebase.test/api/game/rewards"));
  const body = await response.text();
  assert.deepEqual(calls, ["identity", "storage"]);
  assert.equal(response.status, 500);
  assert.doesNotMatch(body, /D1_REWARD_SECRET/);

  const denied = createRewardsGetHandler({ requireMember: async () => { throw new HttpError(401, "Sign in to continue."); }, generatedAt: () => now });
  const safe = await denied(new Request("https://homebase.test/api/game/rewards"));
  assert.equal(safe.status, 401);
  assert.deepEqual(await safe.json(), { error: "Sign in to continue." });
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  FURNISHING_PLACEMENTS_V1,
  FURNISHING_REWARDS_V1,
  companionActivityV1,
  unlockedFurnishingsV1,
  completedMoveEventV1,
  completionAwardV1,
  levelForLifetimePointsV1,
  REWARD_CATALOG_V1,
  eligibleRewardsV1,
  selectDailyMovesV1,
} from "../index.ts";

test("reward policy v1 has an exact stable catalog of emblems and furnishings", () => {
  assert.deepEqual(REWARD_CATALOG_V1.map(({ key, dimension, thresholdPoints, kind }) => ({ key, dimension, thresholdPoints, kind })), [
    { key: "first-tend", dimension: "tend", thresholdPoints: 10, kind: "emblem" },
    { key: "first-move", dimension: "move", thresholdPoints: 10, kind: "emblem" },
    { key: "first-grow", dimension: "grow", thresholdPoints: 10, kind: "emblem" },
    { key: "first-connect", dimension: "connect", thresholdPoints: 10, kind: "emblem" },
    { key: "first-household", dimension: "household", thresholdPoints: 4, kind: "emblem" },
    { key: "home-lamp", dimension: "household", thresholdPoints: 8, kind: "furnishing" },
    { key: "home-art", dimension: "household", thresholdPoints: 20, kind: "furnishing" },
    { key: "home-cushion", dimension: "household", thresholdPoints: 40, kind: "furnishing" },
    { key: "home-lights", dimension: "household", thresholdPoints: 70, kind: "furnishing" },
  ]);

  // Every furnishing has somewhere to stand, or the home would earn an item it
  // cannot show.
  for (const reward of FURNISHING_REWARDS_V1) {
    assert.ok(FURNISHING_PLACEMENTS_V1[reward.key], `${reward.key} has a placement`);
  }
});

test("furnishings unlock on household points and stay unlocked", () => {
  assert.deepEqual(unlockedFurnishingsV1(0).map((reward) => reward.key), []);
  assert.deepEqual(unlockedFurnishingsV1(7).map((reward) => reward.key), []);
  assert.deepEqual(unlockedFurnishingsV1(8).map((reward) => reward.key), ["home-lamp"]);
  assert.deepEqual(unlockedFurnishingsV1(45).map((reward) => reward.key), ["home-lamp", "home-art", "home-cushion"]);
  assert.deepEqual(unlockedFurnishingsV1(9_999).map((reward) => reward.key),
    FURNISHING_REWARDS_V1.map((reward) => reward.key));
});

test("reward eligibility uses exact thresholds and deterministic catalog order", () => {
  const below = { tend: 9, move: 0, grow: 0, connect: 0, household: 3 };
  assert.deepEqual(eligibleRewardsV1(below), []);
  // Household points high enough for every furnishing keeps the order stable.
  const at = { tend: 10, move: 10, grow: 10, connect: 10, household: 70 };
  const first = eligibleRewardsV1(at);
  const second = eligibleRewardsV1({ household: 70, connect: 10, grow: 10, move: 10, tend: 10 });
  assert.deepEqual(first.map((reward) => reward.key), REWARD_CATALOG_V1.map((reward) => reward.key));
  assert.deepEqual(second, first);
  assert.deepEqual(eligibleRewardsV1({ ...at, tend: 999 }), first);
});

test("reward eligibility rejects incomplete, extra, negative, fractional, and unsafe totals", () => {
  for (const invalid of [
    { tend: 10, move: 0, grow: 0, connect: 0 },
    { tend: 10, move: 0, grow: 0, connect: 0, household: 0, extra: 1 },
    { tend: -1, move: 0, grow: 0, connect: 0, household: 0 },
    { tend: 1.5, move: 0, grow: 0, connect: 0, household: 0 },
    { tend: Number.MAX_SAFE_INTEGER + 1, move: 0, grow: 0, connect: 0, household: 0 },
  ]) assert.throws(() => eligibleRewardsV1(invalid));
});

const scope = {
  householdId: "household-current",
  memberId: "member-current",
  localDate: "2026-08-16",
  createdAt: "2026-08-16T09:00:00.000Z",
};

function candidate(overrides = {}) {
  return {
    householdId: scope.householdId,
    memberId: scope.memberId,
    family: "tend",
    ownership: "personal",
    visibility: "private",
    source: { type: "task", id: "task-default" },
    title: "Tend one small task",
    shortLabel: "Tend task",
    estimatedSeconds: 120,
    eligible: true,
    signals: {
      urgency: 0,
      uncertainty: 0,
      dueSoon: 0,
      preference: 0.2,
      cooperative: 0,
      comeback: 0,
      effort: 0.1,
      repetition: 0,
    },
    ...overrides,
  };
}

function select(candidates, overrides = {}) {
  return selectDailyMovesV1({
    ...scope,
    candidates,
    createId: ({ localDate, slot, candidate: selected }) => `move-${localDate}-${slot}-${selected.source.id}`,
    ...overrides,
  });
}

const fixtures = [
  candidate({
    source: { type: "transaction", id: "transaction-review" },
    title: "Review an uncertain transaction",
    shortLabel: "Review transaction",
    signals: { ...candidate().signals, uncertainty: 0.95 },
  }),
  candidate({
    family: "grow",
    source: { type: "goal", id: "goal-spanish" },
    title: "Practice three Spanish phrases",
    shortLabel: "Practice phrases",
    signals: { ...candidate().signals, preference: 0.8 },
  }),
  candidate({
    memberId: null,
    family: "connect",
    ownership: "shared",
    visibility: "household",
    source: { type: "adventure", id: "adventure-dinner" },
    title: "Choose a dinner together",
    shortLabel: "Choose dinner",
    signals: { ...candidate().signals, cooperative: 0.9 },
  }),
  candidate({
    source: { type: "task", id: "task-second" },
    title: "Handle another home task",
    shortLabel: "Handle task",
    signals: { ...candidate().signals, urgency: 0.7 },
  }),
];

test("policy v1 returns validated stable slots with dominant reasons and family diversity", () => {
  const moves = select(fixtures);

  assert.equal(moves.length, 3);
  assert.deepEqual(moves.map((move) => move.slot), [1, 2, 3]);
  assert.deepEqual(moves.map((move) => move.family), ["tend", "connect", "grow"]);
  assert.deepEqual(moves.map((move) => move.selectionReasonCode), ["uncertainty", "cooperative", "preference"]);
  assert.ok(moves.every((move) => move.contractVersion === 1 && move.movePolicyVersion === 1));
  assert.ok(moves.every((move) => move.householdId === scope.householdId && move.memberId === scope.memberId));
  assert.ok(moves.every((move) => move.createdAt === scope.createdAt && move.completedAt === null));
});

test("stable ties and outputs do not depend on candidate input order", () => {
  const tied = [
    candidate({ family: "move", source: { type: "goal", id: "goal-zulu" }, title: "Zulu", shortLabel: "Zulu" }),
    candidate({ family: "move", source: { type: "goal", id: "goal-alpha" }, title: "Alpha", shortLabel: "Alpha" }),
    candidate({ family: "grow", source: { type: "goal", id: "goal-grow" }, title: "Grow", shortLabel: "Grow" }),
  ];

  assert.deepEqual(select(tied), select([...tied].reverse()));
  assert.equal(select(tied)[0]?.source.id, "goal-alpha");
});

test("scope, privacy, eligibility, cooldown, and duplicate filters run before ranking", () => {
  const allowed = candidate({ source: { type: "task", id: "allowed" } });
  const shared = candidate({
    memberId: null,
    ownership: "shared",
    visibility: "household",
    source: { type: "household", id: "shared" },
  });
  const candidates = [
    allowed,
    candidate({ householdId: "household-other", source: { type: "task", id: "other-household" }, signals: { ...candidate().signals, urgency: 1 } }),
    candidate({ memberId: "member-other", source: { type: "task", id: "other-member" }, signals: { ...candidate().signals, urgency: 1 } }),
    candidate({ ownership: "shared", visibility: "private", memberId: null, source: { type: "household", id: "shared-private" } }),
    candidate({ ownership: "personal", visibility: "display", source: { type: "goal", id: "personal-display" } }),
    candidate({ eligible: false, source: { type: "task", id: "ineligible" }, signals: { ...candidate().signals, urgency: 1 } }),
    candidate({ source: { type: "task", id: "cooldown" }, signals: { ...candidate().signals, urgency: 1 } }),
    candidate({ ...allowed, title: "Duplicate loses deterministically" }),
    shared,
  ];

  const moves = select(candidates, { cooldownSourceIds: ["task:cooldown"] });
  assert.deepEqual(moves.map((move) => move.source.id).sort(), ["allowed", "shared"]);
  assert.equal(moves.filter((move) => move.source.id === "allowed").length, 1);
});

test("recent sources are penalized without becoming nondeterministic", () => {
  const recent = candidate({ source: { type: "task", id: "recent" }, signals: { ...candidate().signals, urgency: 0.7 } });
  const fresh = candidate({ source: { type: "task", id: "fresh" }, signals: { ...candidate().signals, urgency: 0.5 } });
  const moves = select([recent, fresh], { maxMoves: 1, recentSourceIds: ["recent"] });
  assert.equal(moves[0]?.source.id, "fresh");
});

test("Minimum Mode returns at most one move and records the policy reason", () => {
  const moves = select(fixtures, { minimumMode: true });
  assert.equal(moves.length, 1);
  assert.equal(moves[0]?.slot, 1);
  assert.equal(moves[0]?.selectionReasonCode, "minimum_mode");
});

test("a candidate without a positive signal uses the neutral preference reason", () => {
  const neutral = candidate({
    source: { type: "task", id: "neutral" },
    signals: {
      urgency: 0,
      uncertainty: 0,
      dueSoon: 0,
      preference: 0,
      cooperative: 0,
      comeback: 0,
      effort: 0,
      repetition: 0,
    },
  });
  assert.equal(select([neutral])[0]?.selectionReasonCode, "preference");
});

test("policy never returns more than three moves", () => {
  const many = Array.from({ length: 10 }, (_, index) => candidate({
    family: ["tend", "move", "grow", "connect"][index % 4],
    source: { type: "task", id: `task-${index}` },
  }));
  assert.ok(select(many, { maxMoves: 99 }).length <= 3);
});

test("progression policy awards fixed positive points without private detail", () => {
  const [personalMove] = select([candidate()]);
  const [sharedMove] = select([candidate({
    memberId: null,
    ownership: "shared",
    visibility: "household",
    source: { type: "task", id: "shared-task" },
  })]);

  assert.deepEqual(completionAwardV1(personalMove), {
    policyVersion: 1,
    family: "tend",
    ownership: "personal",
    personalPoints: 10,
    householdPoints: 0,
  });
  assert.equal(completionAwardV1(sharedMove).householdPoints, 4);

  const event = completedMoveEventV1(personalMove, "2026-08-16T11:00:00.000Z");
  assert.equal(event.idempotencyKey, `daily_move.completed:${personalMove.id}:v1`);
  assert.equal(event.visibility, "private");
  assert.deepEqual(event.payload.data, {
    family: "tend",
    ownership: "personal",
    personalPoints: 10,
    householdPoints: 0,
  });
  assert.doesNotMatch(JSON.stringify(event.payload), /title|sourceId|detail/i);
});

test("level policy has deterministic monotonic boundaries and rejects negative points", () => {
  assert.deepEqual([0, 99, 100, 199, 200].map(levelForLifetimePointsV1), [1, 1, 2, 2, 3]);
  let previous = 0;
  for (let points = 0; points <= 10_000; points += 17) {
    const level = levelForLifetimePointsV1(points);
    assert.ok(level >= previous);
    previous = level;
  }
  assert.throws(() => levelForLifetimePointsV1(-1), RangeError);
});

test("companion activity reads as care, never as punishment", () => {
  const generatedAt = "2026-08-16T12:00:00.000Z";
  const at = (minutesAgo, family = "tend") => ({
    generatedAt,
    lastCompletion: { family, occurredAt: new Date(Date.parse(generatedAt) - minutesAgo * 60_000).toISOString() },
  });

  assert.equal(companionActivityV1({ generatedAt, lastCompletion: null }), "rest");
  assert.equal(companionActivityV1(at(5)), "celebrate");
  assert.equal(companionActivityV1(at(89)), "celebrate");
  assert.equal(companionActivityV1(at(120, "grow")), "grow");
  assert.equal(companionActivityV1(at(120, "connect")), "connect");
  assert.equal(companionActivityV1(at(60 * 25)), "idle");
  assert.equal(companionActivityV1(at(60 * 24 * 9)), "rest");

  // A clock skew that puts a completion slightly ahead must not break the state.
  assert.equal(companionActivityV1(at(-3)), "celebrate");
  assert.equal(companionActivityV1({ generatedAt, lastCompletion: { family: "tend", occurredAt: "not-a-date" } }), "idle");

  // Every reachable state is a contentment state; none of them diminish anyone.
  const states = new Set([
    companionActivityV1({ generatedAt, lastCompletion: null }),
    companionActivityV1(at(5)),
    companionActivityV1(at(120)),
    companionActivityV1(at(60 * 25)),
  ]);
  for (const state of states) assert.ok(["rest", "idle", "celebrate", "tend", "move", "grow", "connect"].includes(state));
});

import assert from "node:assert/strict";
import test from "node:test";

import { selectDailyMovesV1 } from "../index.ts";

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

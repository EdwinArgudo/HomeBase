import { parseRewardSnapshot } from "@homebase/contracts";

import type { RewardsApi } from "./rewards";

const definitions = [
  ["first-tend", "Steady Hands", "A calm first step in tending everyday life.", "tend", 10, 10, "2026-08-15T10:00:00.000Z"],
  ["first-move", "Gentle Motion", "A first bit of energy put toward feeling well.", "move", 10, 4, null],
  ["first-grow", "New Leaf", "A first moment invested in learning and growth.", "grow", 10, 0, null],
  ["first-connect", "Warm Hello", "A first intentional moment of connection.", "connect", 10, 0, null],
  ["first-household", "Shared Spark", "A first shared move that helped the household together.", "household", 4, 4, "2026-08-15T11:00:00.000Z"],
] as const;

export function createFixtureRewardsApi(): RewardsApi {
  return { async load() { return parseRewardSnapshot({
    contractVersion: 1, catalogVersion: 1, policyVersion: 1,
    householdId: "household-homebase", memberId: "member-edwin", personaId: "persona-edwin",
    generatedAt: new Date().toISOString(),
    rewards: definitions.map(([key, title, description, dimension, thresholdPoints, currentPoints, unlockedAt]) => ({
      contractVersion: 1, policyVersion: 1, currentPoints, unlockedAt,
      reward: { catalogVersion: 1, key, kind: "emblem", title, description, dimension, thresholdPoints },
    })),
  }); } };
}

import {
  arrayAt,
  enumAt,
  fail,
  idAt,
  integerAt,
  nullableIdAt,
  nullableTimestampAt,
  objectAt,
  required,
  stringAt,
  timestampAt,
  uniqueBy,
  versionAt,
} from "./primitives.ts";
import { PROGRESS_DIMENSIONS, type ProgressDimension } from "./progress.ts";

export const REWARD_KINDS = ["emblem", "furnishing"] as const;
export const REWARD_KEYS_V1 = [
  "first-tend", "first-move", "first-grow", "first-connect", "first-household",
  // Furnishings the household earns together, which appear in the home itself.
  "home-lamp", "home-art", "home-cushion", "home-lights",
] as const;

export type RewardKind = typeof REWARD_KINDS[number];
export type RewardKeyV1 = typeof REWARD_KEYS_V1[number];

export type RewardDefinitionV1 = {
  catalogVersion: 1;
  key: RewardKeyV1;
  kind: RewardKind;
  title: string;
  description: string;
  dimension: ProgressDimension;
  thresholdPoints: number;
};

export type RewardProgressV1 = {
  contractVersion: 1;
  policyVersion: 1;
  reward: RewardDefinitionV1;
  currentPoints: number;
  unlockedAt: string | null;
};

export type RewardSnapshotV1 = {
  contractVersion: 1;
  catalogVersion: 1;
  policyVersion: 1;
  householdId: string;
  memberId: string;
  personaId: string | null;
  equippedRewardKey: RewardKeyV1 | null;
  generatedAt: string;
  rewards: RewardProgressV1[];
};

export type RewardEquipInputV1 = {
  contractVersion: 1;
  rewardKey: RewardKeyV1 | null;
};

function rewardDefinitionAt(input: unknown, path: string): RewardDefinitionV1 {
  const record = objectAt(input, path, ["catalogVersion", "key", "kind", "title", "description", "dimension", "thresholdPoints"]);
  versionAt(required(record, "catalogVersion", path), `${path}.catalogVersion`, 1);
  return {
    catalogVersion: 1,
    key: enumAt(required(record, "key", path), `${path}.key`, REWARD_KEYS_V1),
    kind: enumAt(required(record, "kind", path), `${path}.kind`, REWARD_KINDS),
    title: stringAt(required(record, "title", path), `${path}.title`, 1, 80),
    description: stringAt(required(record, "description", path), `${path}.description`, 1, 180),
    dimension: enumAt(required(record, "dimension", path), `${path}.dimension`, PROGRESS_DIMENSIONS),
    thresholdPoints: integerAt(required(record, "thresholdPoints", path), `${path}.thresholdPoints`, 1, Number.MAX_SAFE_INTEGER),
  };
}

export function parseRewardDefinition(input: unknown): RewardDefinitionV1 {
  return rewardDefinitionAt(input, "$");
}

function rewardProgressAt(input: unknown, path: string): RewardProgressV1 {
  const record = objectAt(input, path, ["contractVersion", "policyVersion", "reward", "currentPoints", "unlockedAt"]);
  versionAt(required(record, "contractVersion", path), `${path}.contractVersion`, 1);
  versionAt(required(record, "policyVersion", path), `${path}.policyVersion`, 1);
  const reward = rewardDefinitionAt(required(record, "reward", path), `${path}.reward`);
  const currentPoints = integerAt(required(record, "currentPoints", path), `${path}.currentPoints`, 0, Number.MAX_SAFE_INTEGER);
  const unlockedAt = nullableTimestampAt(required(record, "unlockedAt", path), `${path}.unlockedAt`);
  if (unlockedAt !== null && currentPoints < reward.thresholdPoints) {
    fail(`${path}.unlockedAt`, "requires current points to meet the reward threshold");
  }
  return { contractVersion: 1, policyVersion: 1, reward, currentPoints, unlockedAt };
}

export function parseRewardProgress(input: unknown): RewardProgressV1 {
  return rewardProgressAt(input, "$");
}

export function parseRewardSnapshot(input: unknown): RewardSnapshotV1 {
  const path = "$";
  const record = objectAt(input, path, ["contractVersion", "catalogVersion", "policyVersion", "householdId", "memberId", "personaId", "equippedRewardKey", "generatedAt", "rewards"]);
  versionAt(required(record, "contractVersion", path), "$.contractVersion", 1);
  versionAt(required(record, "catalogVersion", path), "$.catalogVersion", 1);
  versionAt(required(record, "policyVersion", path), "$.policyVersion", 1);
  const rewards = arrayAt(required(record, "rewards", path), "$.rewards", 0, 64)
    .map((reward, index) => rewardProgressAt(reward, `$.rewards[${index}]`));
  uniqueBy(rewards, (entry) => entry.reward.key, "$.rewards", "reward.key");
  rewards.forEach((entry, index) => {
    if (entry.reward.catalogVersion !== 1) fail(`$.rewards[${index}].reward.catalogVersion`, "must match the snapshot catalog version");
    if (entry.policyVersion !== 1) fail(`$.rewards[${index}].policyVersion`, "must match the snapshot policy version");
  });
  const personaId = nullableIdAt(required(record, "personaId", path), "$.personaId");
  const rawEquippedRewardKey = required(record, "equippedRewardKey", path);
  const equippedRewardKey = rawEquippedRewardKey === null
    ? null
    : enumAt(rawEquippedRewardKey, "$.equippedRewardKey", REWARD_KEYS_V1);
  if (personaId === null && equippedRewardKey !== null) fail("$.equippedRewardKey", "requires a current persona");
  if (equippedRewardKey !== null) {
    const equipped = rewards.find((entry) => entry.reward.key === equippedRewardKey);
    if (!equipped) fail("$.equippedRewardKey", "must be present in the reward catalog");
    if (equipped.unlockedAt === null) fail("$.equippedRewardKey", "must reference an unlocked reward");
  }
  return {
    contractVersion: 1,
    catalogVersion: 1,
    policyVersion: 1,
    householdId: idAt(required(record, "householdId", path), "$.householdId"),
    memberId: idAt(required(record, "memberId", path), "$.memberId"),
    personaId,
    equippedRewardKey,
    generatedAt: timestampAt(required(record, "generatedAt", path), "$.generatedAt"),
    rewards,
  };
}

export function parseRewardEquipInput(input: unknown): RewardEquipInputV1 {
  const path = "$";
  const record = objectAt(input, path, ["contractVersion", "rewardKey"]);
  versionAt(required(record, "contractVersion", path), "$.contractVersion", 1);
  const value = required(record, "rewardKey", path);
  return {
    contractVersion: 1,
    rewardKey: value === null ? null : enumAt(value, "$.rewardKey", REWARD_KEYS_V1),
  };
}

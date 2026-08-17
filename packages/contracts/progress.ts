import {
  arrayAt,
  enumAt,
  fail,
  idAt,
  integerAt,
  nullableIdAt,
  objectAt,
  required,
  stringAt,
  timestampAt,
  versionAt,
} from "./primitives.ts";

export const PROGRESS_DIMENSIONS = ["tend", "move", "grow", "connect", "household"] as const;

export type ProgressDimension = typeof PROGRESS_DIMENSIONS[number];

export type ProgressBalanceV1 = {
  contractVersion: 1;
  id: string;
  householdId: string;
  memberId: string | null;
  dimension: ProgressDimension;
  lifetimePoints: number;
  level: number;
  updatedAt: string;
};

export type ProgressSnapshotV1 = {
  contractVersion: 1;
  householdId: string;
  member: { id: string; displayName: string };
  balances: ProgressBalanceV1[];
  generatedAt: string;
};

function parseProgressBalanceAt(input: unknown, path: string): ProgressBalanceV1 {
  const record = objectAt(input, path, ["contractVersion", "id", "householdId", "memberId", "dimension", "lifetimePoints", "level", "updatedAt"]);
  versionAt(required(record, "contractVersion", path), `${path}.contractVersion`, 1);
  const memberId = nullableIdAt(required(record, "memberId", path), `${path}.memberId`);
  const dimension = enumAt(required(record, "dimension", path), `${path}.dimension`, PROGRESS_DIMENSIONS);
  if (dimension === "household" && memberId !== null) fail(`${path}.memberId`, "must be null for household progress");
  if (dimension !== "household" && memberId === null) fail(`${path}.memberId`, "is required for personal progress", "missing_field");
  return {
    contractVersion: 1,
    id: idAt(required(record, "id", path), `${path}.id`),
    householdId: idAt(required(record, "householdId", path), `${path}.householdId`),
    memberId,
    dimension,
    lifetimePoints: integerAt(required(record, "lifetimePoints", path), `${path}.lifetimePoints`, 0, Number.MAX_SAFE_INTEGER),
    level: integerAt(required(record, "level", path), `${path}.level`, 1, 1_000),
    updatedAt: timestampAt(required(record, "updatedAt", path), `${path}.updatedAt`),
  };
}

export function parseProgressBalance(input: unknown): ProgressBalanceV1 {
  return parseProgressBalanceAt(input, "$");
}

export function parseProgressSnapshot(input: unknown): ProgressSnapshotV1 {
  const path = "$";
  const record = objectAt(input, path, ["contractVersion", "householdId", "member", "balances", "generatedAt"]);
  versionAt(required(record, "contractVersion", path), "$.contractVersion", 1);
  const householdId = idAt(required(record, "householdId", path), "$.householdId");
  const memberRecord = objectAt(required(record, "member", path), "$.member", ["id", "displayName"]);
  const member = {
    id: idAt(required(memberRecord, "id", "$.member"), "$.member.id"),
    displayName: stringAt(required(memberRecord, "displayName", "$.member"), "$.member.displayName", 1, 80),
  };
  const balances = arrayAt(required(record, "balances", path), "$.balances", 0, 5)
    .map((balance, index) => parseProgressBalanceAt(balance, `$.balances[${index}]`));
  const seen = new Set<ProgressDimension>();
  balances.forEach((balance, index) => {
    if (balance.householdId !== householdId) fail(`$.balances[${index}].householdId`, "must match the snapshot household");
    if (balance.memberId !== null && balance.memberId !== member.id) {
      fail(`$.balances[${index}].memberId`, "must match the current member");
    }
    if (seen.has(balance.dimension)) fail(`$.balances[${index}].dimension`, "must be unique within its scope", "duplicate");
    seen.add(balance.dimension);
  });
  return {
    contractVersion: 1,
    householdId,
    member,
    balances,
    generatedAt: timestampAt(required(record, "generatedAt", path), "$.generatedAt"),
  };
}

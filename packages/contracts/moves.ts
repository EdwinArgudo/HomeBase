import {
  arrayAt,
  enumAt,
  fail,
  idAt,
  integerAt,
  localDateAt,
  nullableTimestampAt,
  objectAt,
  required,
  sourceAt,
  stringAt,
  timestampAt,
  uniqueBy,
  versionAt,
} from "./primitives.ts";
import { OWNERSHIP_TYPES, VISIBILITIES, type OwnershipType, type Visibility } from "./vocabulary.ts";

export const MOVE_FAMILIES = ["tend", "move", "grow", "connect"] as const;
export const MOVE_STATUSES = ["active", "complete", "deferred", "replaced", "expired"] as const;
export const MOVE_SOURCE_TYPES = ["transaction", "bank_connection", "task", "grocery_item", "goal", "adventure", "comeback", "household"] as const;
export const MOVE_REASON_CODES = ["urgent", "uncertainty", "due_soon", "preference", "cooperative", "minimum_mode", "comeback"] as const;

export type MoveFamily = typeof MOVE_FAMILIES[number];
export type MoveStatus = typeof MOVE_STATUSES[number];
export type MoveSourceType = typeof MOVE_SOURCE_TYPES[number];
export type MoveReasonCode = typeof MOVE_REASON_CODES[number];

export type DailyMoveV1 = {
  contractVersion: 1;
  id: string;
  householdId: string;
  memberId: string;
  localDate: string;
  slot: 1 | 2 | 3;
  family: MoveFamily;
  ownership: OwnershipType;
  visibility: Visibility;
  source: { type: MoveSourceType; id: string };
  title: string;
  shortLabel: string;
  estimatedSeconds: number;
  status: MoveStatus;
  selectionReasonCode: MoveReasonCode;
  movePolicyVersion: 1;
  completedAt: string | null;
  createdAt: string;
};

export type MoveCompletionCategoryV1 = {
  id: string;
  name: string;
  ownership: OwnershipType;
};

export type MoveCompletionOptionsV1 =
  | {
      contractVersion: 1;
      moveId: string;
      kind: "none";
    }
  | {
      contractVersion: 1;
      moveId: string;
      kind: "goal";
      unitLabel: string;
      defaultValue: 1;
    }
  | {
      contractVersion: 1;
      moveId: string;
      kind: "transaction";
      categories: MoveCompletionCategoryV1[];
      createRuleDefault: false;
    };

export function parseDailyMove(input: unknown): DailyMoveV1 {
  const path = "$";
  const record = objectAt(input, path, ["contractVersion", "id", "householdId", "memberId", "localDate", "slot", "family", "ownership", "visibility", "source", "title", "shortLabel", "estimatedSeconds", "status", "selectionReasonCode", "movePolicyVersion", "completedAt", "createdAt"]);
  versionAt(required(record, "contractVersion", path), "$.contractVersion", 1);
  versionAt(required(record, "movePolicyVersion", path), "$.movePolicyVersion", 1);
  const status = enumAt(required(record, "status", path), "$.status", MOVE_STATUSES);
  const completedAt = nullableTimestampAt(required(record, "completedAt", path), "$.completedAt");
  if (status === "complete" && completedAt === null) fail("$.completedAt", "is required for a complete move", "missing_field");
  if (status !== "complete" && completedAt !== null) fail("$.completedAt", "must be null unless the move is complete");
  return {
    contractVersion: 1,
    id: idAt(required(record, "id", path), "$.id"),
    householdId: idAt(required(record, "householdId", path), "$.householdId"),
    memberId: idAt(required(record, "memberId", path), "$.memberId"),
    localDate: localDateAt(required(record, "localDate", path), "$.localDate"),
    slot: integerAt(required(record, "slot", path), "$.slot", 1, 3) as 1 | 2 | 3,
    family: enumAt(required(record, "family", path), "$.family", MOVE_FAMILIES),
    ownership: enumAt(required(record, "ownership", path), "$.ownership", OWNERSHIP_TYPES),
    visibility: enumAt(required(record, "visibility", path), "$.visibility", VISIBILITIES),
    source: sourceAt(required(record, "source", path), "$.source", MOVE_SOURCE_TYPES),
    title: stringAt(required(record, "title", path), "$.title", 1, 120),
    shortLabel: stringAt(required(record, "shortLabel", path), "$.shortLabel", 1, 40),
    estimatedSeconds: integerAt(required(record, "estimatedSeconds", path), "$.estimatedSeconds", 1, 86_400),
    status,
    selectionReasonCode: enumAt(required(record, "selectionReasonCode", path), "$.selectionReasonCode", MOVE_REASON_CODES),
    movePolicyVersion: 1,
    completedAt,
    createdAt: timestampAt(required(record, "createdAt", path), "$.createdAt"),
  };
}

export function parseMoveCompletionOptions(input: unknown): MoveCompletionOptionsV1 {
  const path = "$";
  const broad = objectAt(input, path, ["contractVersion", "moveId", "kind", "unitLabel", "defaultValue", "categories", "createRuleDefault"]);
  versionAt(required(broad, "contractVersion", path), "$.contractVersion", 1);
  const moveId = idAt(required(broad, "moveId", path), "$.moveId");
  const kind = enumAt(required(broad, "kind", path), "$.kind", ["none", "goal", "transaction"] as const);
  if (kind === "none") {
    objectAt(input, path, ["contractVersion", "moveId", "kind"]);
    return { contractVersion: 1, moveId, kind };
  }
  if (kind === "goal") {
    const record = objectAt(input, path, ["contractVersion", "moveId", "kind", "unitLabel", "defaultValue"]);
    versionAt(required(record, "defaultValue", path), "$.defaultValue", 1);
    return {
      contractVersion: 1,
      moveId,
      kind,
      unitLabel: stringAt(required(record, "unitLabel", path), "$.unitLabel", 1, 40),
      defaultValue: 1,
    };
  }
  const record = objectAt(input, path, ["contractVersion", "moveId", "kind", "categories", "createRuleDefault"]);
  const categories = arrayAt(required(record, "categories", path), "$.categories", 0, 100).map((category, index) => {
    const categoryPath = `$.categories[${index}]`;
    const categoryRecord = objectAt(category, categoryPath, ["id", "name", "ownership"]);
    return {
      id: idAt(required(categoryRecord, "id", categoryPath), `${categoryPath}.id`),
      name: stringAt(required(categoryRecord, "name", categoryPath), `${categoryPath}.name`, 1, 80),
      ownership: enumAt(required(categoryRecord, "ownership", categoryPath), `${categoryPath}.ownership`, OWNERSHIP_TYPES),
    };
  });
  uniqueBy(categories, (category) => category.id, "$.categories", "id");
  if (required(record, "createRuleDefault", path) !== false) {
    fail("$.createRuleDefault", "must be false");
  }
  return { contractVersion: 1, moveId, kind, categories, createRuleDefault: false };
}

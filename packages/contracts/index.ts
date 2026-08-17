export const OWNERSHIP_TYPES = ["personal", "shared"] as const;
export const VISIBILITIES = ["private", "household", "display"] as const;
export const MOVE_FAMILIES = ["tend", "move", "grow", "connect"] as const;
export const MOVE_STATUSES = ["active", "complete", "deferred", "replaced", "expired"] as const;
export const MOVE_SOURCE_TYPES = ["transaction", "bank_connection", "task", "grocery_item", "goal", "adventure", "comeback", "household"] as const;
export const MOVE_REASON_CODES = ["urgent", "uncertainty", "due_soon", "preference", "cooperative", "minimum_mode", "comeback"] as const;
export const EVENT_TYPES = [
  "transaction.reviewed",
  "merchant_rule.created",
  "bank_connection.repaired",
  "task.completed",
  "grocery_item.checked",
  "goal_entry.recorded",
  "daily_move.completed",
  "adventure.completed",
  "persona.approved",
  "persona.cosmetic_equipped",
] as const;
export const EVENT_SOURCE_TYPES = ["transaction", "merchant_rule", "bank_connection", "task", "grocery_item", "goal_entry", "daily_move", "adventure", "persona", "cosmetic"] as const;
export const PROGRESS_DIMENSIONS = ["tend", "move", "grow", "connect", "household"] as const;
export const SPRITE_ASSET_KINDS = ["portrait", "neutral", "sprite_sheet"] as const;
export const REQUIRED_ANIMATIONS = ["idle", "walk_down", "walk_up", "walk_left", "walk_right", "celebrate", "rest"] as const;
export const ATTACHMENT_KINDS = ["hair", "clothing", "accessory", "prop"] as const;
export const PERSONA_ACTIVITY_STATES = ["idle", "rest", "tend", "move", "grow", "connect", "celebrate", "travel", "read", "cook"] as const;
export const WORLD_ITEM_STATES = ["idle", "active", "complete"] as const;
export const ADVENTURE_STATUSES = ["offered", "active", "complete", "expired", "dismissed"] as const;
export const WORLD_VIEWERS = ["member", "display"] as const;
export const PERSONA_CREATION_METHODS = ["manual"] as const;
export const PERSONA_STATUSES = ["draft", "ready"] as const;
export const PERSONA_VISIBILITIES = ["private", "household"] as const;
// A fixed roster: each character is a deliberately drawn look, not a point in a
// combination space. Adding one is a contract change and a migration, on purpose.
export const PERSONA_CHARACTERS = [
  "marshmallow",
  "bunny",
  "cat",
  "pup",
  "bear",
  "chick",
  "moss-bunny",
  "dusk-cat",
] as const;
export const REWARD_KINDS = ["emblem", "furnishing"] as const;
export const REWARD_KEYS_V1 = [
  "first-tend", "first-move", "first-grow", "first-connect", "first-household",
  // Furnishings the household earns together, which appear in the home itself.
  "home-lamp", "home-art", "home-cushion", "home-lights",
] as const;
export const PLAN_TASK_STATUSES = ["open", "complete"] as const;
export const PLAN_OWNERS = ["together", "you"] as const;
export const PLAN_GOAL_OWNERSHIPS = ["shared", "personal"] as const;
export const PLAN_GOAL_TRACKING_TYPES = ["sessions", "amount"] as const;

export type OwnershipType = typeof OWNERSHIP_TYPES[number];
export type Visibility = typeof VISIBILITIES[number];
export type MoveFamily = typeof MOVE_FAMILIES[number];
export type MoveStatus = typeof MOVE_STATUSES[number];
export type MoveSourceType = typeof MOVE_SOURCE_TYPES[number];
export type MoveReasonCode = typeof MOVE_REASON_CODES[number];
export type GameEventType = typeof EVENT_TYPES[number];
export type EventSourceType = typeof EVENT_SOURCE_TYPES[number];
export type ProgressDimension = typeof PROGRESS_DIMENSIONS[number];
export type SpriteAssetKind = typeof SPRITE_ASSET_KINDS[number];
export type AnimationName = typeof REQUIRED_ANIMATIONS[number];
export type AttachmentKind = typeof ATTACHMENT_KINDS[number];
export type PersonaActivityState = typeof PERSONA_ACTIVITY_STATES[number];
export type WorldItemState = typeof WORLD_ITEM_STATES[number];
export type AdventureStatus = typeof ADVENTURE_STATUSES[number];
export type WorldViewer = typeof WORLD_VIEWERS[number];
export type PersonaStatus = typeof PERSONA_STATUSES[number];
export type PersonaVisibility = typeof PERSONA_VISIBILITIES[number];
export type RewardKind = typeof REWARD_KINDS[number];
export type RewardKeyV1 = typeof REWARD_KEYS_V1[number];
export type PlanTaskStatus = typeof PLAN_TASK_STATUSES[number];
export type PlanOwner = typeof PLAN_OWNERS[number];
export type PlanGoalOwnership = typeof PLAN_GOAL_OWNERSHIPS[number];
export type PlanGoalTrackingType = typeof PLAN_GOAL_TRACKING_TYPES[number];

export type PersonaAppearanceV1 = {
  character: typeof PERSONA_CHARACTERS[number];
};

export type PersonaDraftInputV1 = {
  contractVersion: 1;
  displayName: string;
  visibility: PersonaVisibility;
  appearance: PersonaAppearanceV1;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

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

export type GameEventV1 = {
  contractVersion: 1;
  id: string;
  householdId: string;
  memberId: string | null;
  eventType: GameEventType;
  source: { type: EventSourceType; id: string };
  visibility: Visibility;
  payload: { version: 1; data: JsonObject };
  idempotencyKey: string;
  occurredAt: string;
  createdAt: string;
};

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

export type PlanTaskV1 = { id: string; title: string; status: PlanTaskStatus; dueDate: string | null; owner: PlanOwner };
export type PlanGroceryV1 = { id: string; name: string; checked: boolean };
export type PlanGoalV1 = {
  id: string;
  name: string;
  ownership: PlanGoalOwnership;
  trackingType: PlanGoalTrackingType;
  targetValue: number;
  minimumValue: number | null;
  currentValue: number;
};
export type PlansSnapshotV1 = { contractVersion: 1; tasks: PlanTaskV1[]; groceries: PlanGroceryV1[]; goals: PlanGoalV1[]; generatedAt: string };
export type PlansActionV1 =
  | { contractVersion: 1; action: "toggle_task"; id: string }
  | { contractVersion: 1; action: "toggle_grocery"; id: string }
  | { contractVersion: 1; action: "add_grocery"; text: string }
  | { contractVersion: 1; action: "log_goal"; id: string; value: number }
  | { contractVersion: 1; action: "retire_goal"; id: string }
  | {
    contractVersion: 1;
    action: "add_goal";
    text: string;
    ownership: PlanGoalOwnership;
    trackingType: PlanGoalTrackingType;
    targetValue: number;
  };

export type SpriteAssetV1 = {
  id: string;
  kind: SpriteAssetKind;
  width: number;
  height: number;
  transparent: true;
};

export type SpriteFrameV1 = {
  column: number;
  row: number;
  durationMs: number;
};

export type SpriteAnimationV1 = {
  name: AnimationName;
  assetId: string;
  loop: boolean;
  frames: SpriteFrameV1[];
};

export type AttachmentAnchorV1 = {
  kind: AttachmentKind;
  x: number;
  y: number;
};

export type PersonaManifestV1 = {
  manifestVersion: 1;
  personaId: string;
  baseStyleVersion: string;
  grid: { frameWidth: number; frameHeight: number; columns: number; rows: number };
  assets: SpriteAssetV1[];
  animations: SpriteAnimationV1[];
  attachmentAnchors: AttachmentAnchorV1[];
};

export type PersonaProfileV1 = {
  contractVersion: 1;
  id: string;
  householdId: string;
  memberId: string;
  displayName: string;
  creationMethod: "manual";
  status: PersonaStatus;
  baseStyleVersion: string;
  appearance: PersonaAppearanceV1;
  visibility: PersonaVisibility;
  manifest: PersonaManifestV1;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersonaSnapshotV1 = {
  contractVersion: 1;
  householdId: string;
  memberId: string;
  persona: PersonaProfileV1 | null;
  generatedAt: string;
};

export type PersonaApprovalResultV1 = {
  contractVersion: 1;
  persona: PersonaProfileV1;
  event: GameEventV1;
};

export type WorldPersonaV1 = {
  id: string;
  displayName: string;
  altDescription: string;
  visibility: Visibility;
  activity: PersonaActivityState;
  appearance: PersonaAppearanceV1 | null;
  equippedRewardKey: RewardKeyV1 | null;
  x: number;
  y: number;
  manifest: PersonaManifestV1;
};

export type WorldItemV1 = {
  id: string;
  catalogKey: string;
  zone: string;
  visibility: Visibility;
  x: number;
  y: number;
  zIndex: number;
  state: WorldItemState;
};

export type AdventureSnapshotV1 = {
  contractVersion: 1;
  householdId: string;
  generatedAt: string;
  /** At most one adventure runs at a time; the offer waits until it ends. */
  active: WorldAdventureV1 | null;
  offered: WorldAdventureV1 | null;
  finished: WorldAdventureV1[];
};

export type WorldAdventureV1 = {
  id: string;
  title: string;
  status: AdventureStatus;
  targetValue: number;
  currentValue: number;
  endsAt: string | null;
  visibility: Visibility;
};

export type WorldProjectionV1 = {
  contractVersion: 1;
  worldVersion: 1;
  revision: number;
  householdId: string;
  viewer: WorldViewer;
  generatedAt: string;
  scene: { key: string; theme: string };
  personas: WorldPersonaV1[];
  items: WorldItemV1[];
  adventures: WorldAdventureV1[];
};

export type ContractErrorCode =
  | "invalid_type"
  | "invalid_value"
  | "missing_field"
  | "unknown_field"
  | "duplicate"
  | "unsupported_version"
  | "not_json_safe";

export class ContractValidationError extends Error {
  readonly path: string;
  readonly code: ContractErrorCode;

  constructor(path: string, expected: string, code: ContractErrorCode = "invalid_value") {
    super(`${path}: ${expected}`);
    this.name = "ContractValidationError";
    this.path = path;
    this.code = code;
  }
}

export type ContractValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ContractValidationError };

export function safeParse<T>(parser: (input: unknown) => T, input: unknown): ContractValidationResult<T> {
  try {
    return { ok: true, value: parser(input) };
  } catch (error) {
    if (error instanceof ContractValidationError) return { ok: false, error };
    return { ok: false, error: new ContractValidationError("$", "could not be validated", "invalid_value") };
  }
}

type UnknownRecord = Record<string, unknown>;

function fail(path: string, expected: string, code: ContractErrorCode = "invalid_value"): never {
  throw new ContractValidationError(path, expected, code);
}

function fieldPath(path: string, key: string) {
  return /^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(key) ? `${path}.${key}` : `${path}.[field]`;
}

function objectAt(input: unknown, path: string, keys: readonly string[]): UnknownRecord {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return fail(path, "must be an object", "invalid_type");
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    return fail(path, "must be a plain JSON object", "not_json_safe");
  }
  const record = input as UnknownRecord;
  if (Object.keys(record).some((key) => !keys.includes(key))) {
    return fail(path, "contains an unsupported field", "unknown_field");
  }
  return record;
}

function required(record: UnknownRecord, key: string, path: string) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return fail(fieldPath(path, key), "is required", "missing_field");
  }
  return record[key];
}

function stringAt(input: unknown, path: string, minimum = 1, maximum = 128) {
  if (typeof input !== "string") return fail(path, "must be a string", "invalid_type");
  if (input.length < minimum || input.length > maximum) return fail(path, `must contain ${minimum} to ${maximum} characters`);
  return input;
}

function idAt(input: unknown, path: string) {
  const value = stringAt(input, path, 1, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) return fail(path, "must be a stable identifier");
  return value;
}

function enumAt<const T extends readonly string[]>(input: unknown, path: string, values: T): T[number] {
  if (typeof input !== "string" || !values.includes(input)) return fail(path, `must be one of ${values.join(", ")}`);
  return input as T[number];
}

function integerAt(input: unknown, path: string, minimum: number, maximum: number) {
  if (typeof input !== "number" || !Number.isInteger(input)) return fail(path, "must be an integer", "invalid_type");
  if (input < minimum || input > maximum) return fail(path, `must be between ${minimum} and ${maximum}`);
  return input;
}

function booleanAt(input: unknown, path: string) {
  if (typeof input !== "boolean") return fail(path, "must be a boolean", "invalid_type");
  return input;
}

function literalTrueAt(input: unknown, path: string): true {
  if (input !== true) return fail(path, "must be true");
  return true;
}

function nullableIdAt(input: unknown, path: string) {
  return input === null ? null : idAt(input, path);
}

function timestampAt(input: unknown, path: string) {
  const value = stringAt(input, path, 20, 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) return fail(path, "must be an ISO-8601 timestamp");
  return value;
}

function nullableTimestampAt(input: unknown, path: string) {
  return input === null ? null : timestampAt(input, path);
}

function localDateAt(input: unknown, path: string) {
  const value = stringAt(input, path, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail(path, "must be a calendar date in YYYY-MM-DD format");
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) {
    return fail(path, "must be a calendar date in YYYY-MM-DD format");
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return fail(path, "must be a calendar date in YYYY-MM-DD format");
  return value;
}

function arrayAt(input: unknown, path: string, minimum: number, maximum: number) {
  if (!Array.isArray(input)) return fail(path, "must be an array", "invalid_type");
  if (input.length < minimum || input.length > maximum) return fail(path, `must contain ${minimum} to ${maximum} entries`);
  return input;
}

function versionAt(input: unknown, path: string, version: number) {
  if (input !== version) return fail(path, `must be supported version ${version}`, "unsupported_version");
  return version;
}

function uniqueBy<T>(values: T[], key: (value: T) => string, path: string, suffix: string) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const current = key(value);
    if (seen.has(current)) fail(`${path}[${index}].${suffix}`, "must be unique", "duplicate");
    seen.add(current);
  });
}

function assertJsonValue(input: unknown, path: string, ancestors = new Set<object>(), depth = 0): asserts input is JsonValue {
  if (depth > 12) return fail(path, "must not exceed 12 nested levels", "not_json_safe");
  if (input === null || typeof input === "string" || typeof input === "boolean") return;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return fail(path, "must contain only finite numbers", "not_json_safe");
    return;
  }
  if (typeof input !== "object") return fail(path, "must contain only JSON-safe values", "not_json_safe");
  if (ancestors.has(input)) return fail(path, "must not contain cycles", "not_json_safe");
  const prototype = Object.getPrototypeOf(input);
  if (!Array.isArray(input) && prototype !== Object.prototype && prototype !== null) {
    return fail(path, "must contain only plain JSON objects", "not_json_safe");
  }
  ancestors.add(input);
  if (Array.isArray(input)) {
    input.forEach((value, index) => assertJsonValue(value, `${path}[${index}]`, ancestors, depth + 1));
  } else {
    Object.entries(input).forEach(([key, value]) => assertJsonValue(value, fieldPath(path, key), ancestors, depth + 1));
  }
  ancestors.delete(input);
}

function sourceAt<T extends readonly string[]>(input: unknown, path: string, sourceTypes: T) {
  const record = objectAt(input, path, ["type", "id"]);
  return {
    type: enumAt(required(record, "type", path), `${path}.type`, sourceTypes),
    id: idAt(required(record, "id", path), `${path}.id`),
  };
}

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

export function parseGameEvent(input: unknown): GameEventV1 {
  const path = "$";
  const record = objectAt(input, path, ["contractVersion", "id", "householdId", "memberId", "eventType", "source", "visibility", "payload", "idempotencyKey", "occurredAt", "createdAt"]);
  versionAt(required(record, "contractVersion", path), "$.contractVersion", 1);
  const memberId = nullableIdAt(required(record, "memberId", path), "$.memberId");
  const visibility = enumAt(required(record, "visibility", path), "$.visibility", VISIBILITIES);
  if (visibility === "private" && memberId === null) fail("$.memberId", "is required for private visibility", "missing_field");
  const payloadRecord = objectAt(required(record, "payload", path), "$.payload", ["version", "data"]);
  versionAt(required(payloadRecord, "version", "$.payload"), "$.payload.version", 1);
  const data = required(payloadRecord, "data", "$.payload");
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    fail("$.payload.data", "must be a JSON object", "invalid_type");
  }
  const jsonData = objectAt(data, "$.payload.data", Object.keys(data as UnknownRecord));
  assertJsonValue(jsonData, "$.payload.data");
  return {
    contractVersion: 1,
    id: idAt(required(record, "id", path), "$.id"),
    householdId: idAt(required(record, "householdId", path), "$.householdId"),
    memberId,
    eventType: enumAt(required(record, "eventType", path), "$.eventType", EVENT_TYPES),
    source: sourceAt(required(record, "source", path), "$.source", EVENT_SOURCE_TYPES),
    visibility,
    payload: { version: 1, data: jsonData as JsonObject },
    idempotencyKey: stringAt(required(record, "idempotencyKey", path), "$.idempotencyKey", 1, 256),
    occurredAt: timestampAt(required(record, "occurredAt", path), "$.occurredAt"),
    createdAt: timestampAt(required(record, "createdAt", path), "$.createdAt"),
  };
}

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

function planTaskAt(input: unknown, path: string): PlanTaskV1 {
  const record = objectAt(input, path, ["id", "title", "status", "dueDate", "owner"]);
  const dueDate = required(record, "dueDate", path);
  return {
    id: idAt(required(record, "id", path), `${path}.id`),
    title: stringAt(required(record, "title", path), `${path}.title`, 1, 160),
    status: enumAt(required(record, "status", path), `${path}.status`, PLAN_TASK_STATUSES),
    dueDate: dueDate === null ? null : localDateAt(dueDate, `${path}.dueDate`),
    owner: enumAt(required(record, "owner", path), `${path}.owner`, PLAN_OWNERS),
  };
}

function planGroceryAt(input: unknown, path: string): PlanGroceryV1 {
  const record = objectAt(input, path, ["id", "name", "checked"]);
  return {
    id: idAt(required(record, "id", path), `${path}.id`),
    name: stringAt(required(record, "name", path), `${path}.name`, 1, 120),
    checked: booleanAt(required(record, "checked", path), `${path}.checked`),
  };
}

function planGoalAt(input: unknown, path: string): PlanGoalV1 {
  const record = objectAt(input, path, ["id", "name", "ownership", "trackingType", "targetValue", "minimumValue", "currentValue"]);
  const minimum = required(record, "minimumValue", path);
  const targetValue = integerAt(required(record, "targetValue", path), `${path}.targetValue`, 1, Number.MAX_SAFE_INTEGER);
  const minimumValue = minimum === null ? null : integerAt(minimum, `${path}.minimumValue`, 1, Number.MAX_SAFE_INTEGER);
  if (minimumValue !== null && minimumValue > targetValue) fail(`${path}.minimumValue`, "must not exceed targetValue");
  return {
    id: idAt(required(record, "id", path), `${path}.id`),
    name: stringAt(required(record, "name", path), `${path}.name`, 1, 160),
    ownership: enumAt(required(record, "ownership", path), `${path}.ownership`, PLAN_GOAL_OWNERSHIPS),
    trackingType: enumAt(required(record, "trackingType", path), `${path}.trackingType`, PLAN_GOAL_TRACKING_TYPES),
    targetValue,
    minimumValue,
    currentValue: integerAt(required(record, "currentValue", path), `${path}.currentValue`, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function parsePlansSnapshot(input: unknown): PlansSnapshotV1 {
  const path = "$";
  const record = objectAt(input, path, ["contractVersion", "tasks", "groceries", "goals", "generatedAt"]);
  versionAt(required(record, "contractVersion", path), "$.contractVersion", 1);
  const tasks = arrayAt(required(record, "tasks", path), "$.tasks", 0, 500).map((entry, index) => planTaskAt(entry, `$.tasks[${index}]`));
  const groceries = arrayAt(required(record, "groceries", path), "$.groceries", 0, 500).map((entry, index) => planGroceryAt(entry, `$.groceries[${index}]`));
  const goals = arrayAt(required(record, "goals", path), "$.goals", 0, 100).map((entry, index) => planGoalAt(entry, `$.goals[${index}]`));
  uniqueBy(tasks, (entry) => entry.id, "$.tasks", "id");
  uniqueBy(groceries, (entry) => entry.id, "$.groceries", "id");
  uniqueBy(goals, (entry) => entry.id, "$.goals", "id");
  return { contractVersion: 1, tasks, groceries, goals, generatedAt: timestampAt(required(record, "generatedAt", path), "$.generatedAt") };
}

export function parsePlansAction(input: unknown): PlansActionV1 {
  const path = "$";
  const record = objectAt(input, path, ["contractVersion", "action", "id", "text", "value", "ownership", "trackingType", "targetValue"]);
  versionAt(required(record, "contractVersion", path), "$.contractVersion", 1);
  const action = enumAt(required(record, "action", path), "$.action",
    ["toggle_task", "toggle_grocery", "add_grocery", "log_goal", "retire_goal", "add_goal"] as const);

  const rejectAllBut = (allowed: readonly string[]) => {
    for (const key of ["id", "text", "value", "ownership", "trackingType", "targetValue"]) {
      if (key in record && !allowed.includes(key)) fail(`$.${key}`, `is not allowed for ${action}`, "unknown_field");
    }
  };

  if (action === "add_grocery") {
    rejectAllBut(["text"]);
    const text = stringAt(required(record, "text", path), "$.text", 1, 120).trim();
    if (!text) fail("$.text", "must contain visible text");
    return { contractVersion: 1, action, text };
  }

  if (action === "add_goal") {
    rejectAllBut(["text", "ownership", "trackingType", "targetValue"]);
    const text = stringAt(required(record, "text", path), "$.text", 1, 160).trim();
    if (!text) fail("$.text", "must contain visible text");
    return {
      contractVersion: 1,
      action,
      text,
      ownership: enumAt(required(record, "ownership", path), "$.ownership", PLAN_GOAL_OWNERSHIPS),
      trackingType: enumAt(required(record, "trackingType", path), "$.trackingType", PLAN_GOAL_TRACKING_TYPES),
      targetValue: integerAt(required(record, "targetValue", path), "$.targetValue", 1, 1_000_000_000),
    };
  }

  if (action === "log_goal") {
    rejectAllBut(["id", "value"]);
    return {
      contractVersion: 1,
      action,
      id: idAt(required(record, "id", path), "$.id"),
      value: integerAt(required(record, "value", path), "$.value", 1, 1_000_000),
    };
  }

  rejectAllBut(["id"]);
  return { contractVersion: 1, action, id: idAt(required(record, "id", path), "$.id") };
}

function spriteAssetAt(input: unknown, path: string): SpriteAssetV1 {
  const record = objectAt(input, path, ["id", "kind", "width", "height", "transparent"]);
  return {
    id: idAt(required(record, "id", path), `${path}.id`),
    kind: enumAt(required(record, "kind", path), `${path}.kind`, SPRITE_ASSET_KINDS),
    width: integerAt(required(record, "width", path), `${path}.width`, 1, 4_096),
    height: integerAt(required(record, "height", path), `${path}.height`, 1, 4_096),
    transparent: literalTrueAt(required(record, "transparent", path), `${path}.transparent`),
  };
}

function animationAt(input: unknown, path: string): SpriteAnimationV1 {
  const record = objectAt(input, path, ["name", "assetId", "loop", "frames"]);
  const frames = arrayAt(required(record, "frames", path), `${path}.frames`, 1, 120).map((frame, index) => {
    const framePath = `${path}.frames[${index}]`;
    const frameRecord = objectAt(frame, framePath, ["column", "row", "durationMs"]);
    return {
      column: integerAt(required(frameRecord, "column", framePath), `${framePath}.column`, 0, 255),
      row: integerAt(required(frameRecord, "row", framePath), `${framePath}.row`, 0, 255),
      durationMs: integerAt(required(frameRecord, "durationMs", framePath), `${framePath}.durationMs`, 16, 10_000),
    };
  });
  return {
    name: enumAt(required(record, "name", path), `${path}.name`, REQUIRED_ANIMATIONS),
    assetId: idAt(required(record, "assetId", path), `${path}.assetId`),
    loop: booleanAt(required(record, "loop", path), `${path}.loop`),
    frames,
  };
}

function anchorAt(input: unknown, path: string): AttachmentAnchorV1 {
  const record = objectAt(input, path, ["kind", "x", "y"]);
  return {
    kind: enumAt(required(record, "kind", path), `${path}.kind`, ATTACHMENT_KINDS),
    x: integerAt(required(record, "x", path), `${path}.x`, 0, 4_095),
    y: integerAt(required(record, "y", path), `${path}.y`, 0, 4_095),
  };
}

function personaManifestAt(input: unknown, path: string): PersonaManifestV1 {
  const record = objectAt(input, path, ["manifestVersion", "personaId", "baseStyleVersion", "grid", "assets", "animations", "attachmentAnchors"]);
  versionAt(required(record, "manifestVersion", path), `${path}.manifestVersion`, 1);
  const gridRecord = objectAt(required(record, "grid", path), `${path}.grid`, ["frameWidth", "frameHeight", "columns", "rows"]);
  const grid = {
    frameWidth: integerAt(required(gridRecord, "frameWidth", `${path}.grid`), `${path}.grid.frameWidth`, 8, 512),
    frameHeight: integerAt(required(gridRecord, "frameHeight", `${path}.grid`), `${path}.grid.frameHeight`, 8, 512),
    columns: integerAt(required(gridRecord, "columns", `${path}.grid`), `${path}.grid.columns`, 1, 64),
    rows: integerAt(required(gridRecord, "rows", `${path}.grid`), `${path}.grid.rows`, 1, 64),
  };
  const assets = arrayAt(required(record, "assets", path), `${path}.assets`, 3, 12).map((asset, index) => spriteAssetAt(asset, `${path}.assets[${index}]`));
  uniqueBy(assets, (asset) => asset.id, `${path}.assets`, "id");
  uniqueBy(assets, (asset) => asset.kind, `${path}.assets`, "kind");
  SPRITE_ASSET_KINDS.forEach((kind) => {
    if (!assets.some((asset) => asset.kind === kind)) fail(`${path}.assets`, `must include one ${kind} asset`, "missing_field");
  });
  const portrait = assets.find((asset) => asset.kind === "portrait")!;
  if (portrait.width !== portrait.height) fail(`${path}.assets`, "portrait asset must be square");
  const sheet = assets.find((asset) => asset.kind === "sprite_sheet")!;
  if (sheet.width !== grid.frameWidth * grid.columns || sheet.height !== grid.frameHeight * grid.rows) {
    fail(`${path}.grid`, "must exactly describe the sprite-sheet geometry");
  }
  const animations = arrayAt(required(record, "animations", path), `${path}.animations`, REQUIRED_ANIMATIONS.length, REQUIRED_ANIMATIONS.length).map((animation, index) => animationAt(animation, `${path}.animations[${index}]`));
  uniqueBy(animations, (animation) => animation.name, `${path}.animations`, "name");
  REQUIRED_ANIMATIONS.forEach((name) => {
    if (!animations.some((animation) => animation.name === name)) fail(`${path}.animations`, `must include ${name}`, "missing_field");
  });
  animations.forEach((animation, animationIndex) => {
    if (animation.assetId !== sheet.id) fail(`${path}.animations[${animationIndex}].assetId`, "must reference the sprite-sheet asset");
    animation.frames.forEach((frame, frameIndex) => {
      if (frame.column >= grid.columns) fail(`${path}.animations[${animationIndex}].frames[${frameIndex}].column`, "must fit within the sprite grid");
      if (frame.row >= grid.rows) fail(`${path}.animations[${animationIndex}].frames[${frameIndex}].row`, "must fit within the sprite grid");
    });
  });
  const attachmentAnchors = arrayAt(required(record, "attachmentAnchors", path), `${path}.attachmentAnchors`, ATTACHMENT_KINDS.length, ATTACHMENT_KINDS.length).map((anchor, index) => anchorAt(anchor, `${path}.attachmentAnchors[${index}]`));
  uniqueBy(attachmentAnchors, (anchor) => anchor.kind, `${path}.attachmentAnchors`, "kind");
  ATTACHMENT_KINDS.forEach((kind) => {
    if (!attachmentAnchors.some((anchor) => anchor.kind === kind)) fail(`${path}.attachmentAnchors`, `must include a ${kind} anchor`, "missing_field");
  });
  attachmentAnchors.forEach((anchor, index) => {
    if (anchor.x >= grid.frameWidth) fail(`${path}.attachmentAnchors[${index}].x`, "must fit within a sprite frame");
    if (anchor.y >= grid.frameHeight) fail(`${path}.attachmentAnchors[${index}].y`, "must fit within a sprite frame");
  });
  return {
    manifestVersion: 1,
    personaId: idAt(required(record, "personaId", path), `${path}.personaId`),
    baseStyleVersion: stringAt(required(record, "baseStyleVersion", path), `${path}.baseStyleVersion`, 1, 64),
    grid,
    assets,
    animations,
    attachmentAnchors,
  };
}

export function parsePersonaManifest(input: unknown): PersonaManifestV1 {
  return personaManifestAt(input, "$");
}

function personaAppearanceAt(input: unknown, path: string): PersonaAppearanceV1 {
  const record = objectAt(input, path, ["character"]);
  return {
    character: enumAt(required(record, "character", path), `${path}.character`, PERSONA_CHARACTERS),
  };
}

export function parsePersonaAppearance(input: unknown): PersonaAppearanceV1 {
  return personaAppearanceAt(input, "$");
}

export function parsePersonaDraftInput(input: unknown): PersonaDraftInputV1 {
  const path = "$";
  const record = objectAt(input, path, ["contractVersion", "displayName", "visibility", "appearance"]);
  versionAt(required(record, "contractVersion", path), "$.contractVersion", 1);
  const displayName = stringAt(required(record, "displayName", path), "$.displayName", 1, 80).trim();
  if (!displayName) fail("$.displayName", "must contain a visible name");
  return {
    contractVersion: 1,
    displayName,
    visibility: enumAt(required(record, "visibility", path), "$.visibility", PERSONA_VISIBILITIES),
    appearance: personaAppearanceAt(required(record, "appearance", path), "$.appearance"),
  };
}

function personaProfileAt(input: unknown, path: string): PersonaProfileV1 {
  const record = objectAt(input, path, ["contractVersion", "id", "householdId", "memberId", "displayName", "creationMethod", "status", "baseStyleVersion", "appearance", "visibility", "manifest", "approvedAt", "createdAt", "updatedAt"]);
  versionAt(required(record, "contractVersion", path), `${path}.contractVersion`, 1);
  const id = idAt(required(record, "id", path), `${path}.id`);
  const status = enumAt(required(record, "status", path), `${path}.status`, PERSONA_STATUSES);
  const approvedAt = nullableTimestampAt(required(record, "approvedAt", path), `${path}.approvedAt`);
  if (status === "ready" && approvedAt === null) fail(`${path}.approvedAt`, "is required for a ready persona", "missing_field");
  if (status === "draft" && approvedAt !== null) fail(`${path}.approvedAt`, "must be null for a draft persona");
  const manifest = personaManifestAt(required(record, "manifest", path), `${path}.manifest`);
  if (manifest.personaId !== id) fail(`${path}.manifest.personaId`, "must match the persona id");
  const baseStyleVersion = stringAt(required(record, "baseStyleVersion", path), `${path}.baseStyleVersion`, 1, 64);
  if (manifest.baseStyleVersion !== baseStyleVersion) fail(`${path}.manifest.baseStyleVersion`, "must match the persona base style version");
  return {
    contractVersion: 1,
    id,
    householdId: idAt(required(record, "householdId", path), `${path}.householdId`),
    memberId: idAt(required(record, "memberId", path), `${path}.memberId`),
    displayName: stringAt(required(record, "displayName", path), `${path}.displayName`, 1, 80),
    creationMethod: enumAt(required(record, "creationMethod", path), `${path}.creationMethod`, PERSONA_CREATION_METHODS),
    status,
    baseStyleVersion,
    appearance: personaAppearanceAt(required(record, "appearance", path), `${path}.appearance`),
    visibility: enumAt(required(record, "visibility", path), `${path}.visibility`, PERSONA_VISIBILITIES),
    manifest,
    approvedAt,
    createdAt: timestampAt(required(record, "createdAt", path), `${path}.createdAt`),
    updatedAt: timestampAt(required(record, "updatedAt", path), `${path}.updatedAt`),
  };
}

export function parsePersonaProfile(input: unknown): PersonaProfileV1 {
  return personaProfileAt(input, "$");
}

export function parsePersonaSnapshot(input: unknown): PersonaSnapshotV1 {
  const path = "$";
  const record = objectAt(input, path, ["contractVersion", "householdId", "memberId", "persona", "generatedAt"]);
  versionAt(required(record, "contractVersion", path), "$.contractVersion", 1);
  const householdId = idAt(required(record, "householdId", path), "$.householdId");
  const memberId = idAt(required(record, "memberId", path), "$.memberId");
  const rawPersona = required(record, "persona", path);
  const persona = rawPersona === null ? null : personaProfileAt(rawPersona, "$.persona");
  if (persona && persona.householdId !== householdId) fail("$.persona.householdId", "must match the snapshot household");
  if (persona && persona.memberId !== memberId) fail("$.persona.memberId", "must match the current member");
  return {
    contractVersion: 1,
    householdId,
    memberId,
    persona,
    generatedAt: timestampAt(required(record, "generatedAt", path), "$.generatedAt"),
  };
}

export function parsePersonaApprovalResult(input: unknown): PersonaApprovalResultV1 {
  const path = "$";
  const record = objectAt(input, path, ["contractVersion", "persona", "event"]);
  versionAt(required(record, "contractVersion", path), "$.contractVersion", 1);
  const persona = personaProfileAt(required(record, "persona", path), "$.persona");
  const event = parseGameEvent(required(record, "event", path));
  if (persona.status !== "ready") fail("$.persona.status", "must be ready after approval");
  if (event.eventType !== "persona.approved" || event.source.type !== "persona" || event.source.id !== persona.id) {
    fail("$.event", "must be the approval event for this persona");
  }
  if (event.householdId !== persona.householdId || event.memberId !== persona.memberId || event.visibility !== persona.visibility) {
    fail("$.event", "must match the persona scope and visibility");
  }
  return { contractVersion: 1, persona, event };
}

function worldPersonaAt(input: unknown, path: string): WorldPersonaV1 {
  const record = objectAt(input, path, ["id", "displayName", "altDescription", "visibility", "activity", "appearance", "equippedRewardKey", "x", "y", "manifest"]);
  const id = idAt(required(record, "id", path), `${path}.id`);
  const manifest = personaManifestAt(required(record, "manifest", path), `${path}.manifest`);
  if (manifest.personaId !== id) fail(`${path}.manifest.personaId`, "must match the world persona id");
  return {
    id,
    displayName: stringAt(required(record, "displayName", path), `${path}.displayName`, 1, 80),
    altDescription: stringAt(required(record, "altDescription", path), `${path}.altDescription`, 1, 240),
    visibility: enumAt(required(record, "visibility", path), `${path}.visibility`, VISIBILITIES),
    activity: enumAt(required(record, "activity", path), `${path}.activity`, PERSONA_ACTIVITY_STATES),
    appearance: required(record, "appearance", path) === null
      ? null
      : personaAppearanceAt(required(record, "appearance", path), `${path}.appearance`),
    equippedRewardKey: required(record, "equippedRewardKey", path) === null
      ? null
      : enumAt(required(record, "equippedRewardKey", path), `${path}.equippedRewardKey`, REWARD_KEYS_V1),
    x: integerAt(required(record, "x", path), `${path}.x`, 0, 100),
    y: integerAt(required(record, "y", path), `${path}.y`, 0, 100),
    manifest,
  };
}

function worldItemAt(input: unknown, path: string): WorldItemV1 {
  const record = objectAt(input, path, ["id", "catalogKey", "zone", "visibility", "x", "y", "zIndex", "state"]);
  return {
    id: idAt(required(record, "id", path), `${path}.id`),
    catalogKey: idAt(required(record, "catalogKey", path), `${path}.catalogKey`),
    zone: idAt(required(record, "zone", path), `${path}.zone`),
    visibility: enumAt(required(record, "visibility", path), `${path}.visibility`, VISIBILITIES),
    x: integerAt(required(record, "x", path), `${path}.x`, 0, 100),
    y: integerAt(required(record, "y", path), `${path}.y`, 0, 100),
    zIndex: integerAt(required(record, "zIndex", path), `${path}.zIndex`, 0, 1_000),
    state: enumAt(required(record, "state", path), `${path}.state`, WORLD_ITEM_STATES),
  };
}

function worldAdventureAt(input: unknown, path: string): WorldAdventureV1 {
  const record = objectAt(input, path, ["id", "title", "status", "targetValue", "currentValue", "endsAt", "visibility"]);
  const targetValue = integerAt(required(record, "targetValue", path), `${path}.targetValue`, 1, 1_000_000_000);
  const currentValue = integerAt(required(record, "currentValue", path), `${path}.currentValue`, 0, 1_000_000_000);
  if (currentValue > targetValue) fail(`${path}.currentValue`, "must not exceed targetValue");
  return {
    id: idAt(required(record, "id", path), `${path}.id`),
    title: stringAt(required(record, "title", path), `${path}.title`, 1, 120),
    status: enumAt(required(record, "status", path), `${path}.status`, ADVENTURE_STATUSES),
    targetValue,
    currentValue,
    endsAt: nullableTimestampAt(required(record, "endsAt", path), `${path}.endsAt`),
    visibility: enumAt(required(record, "visibility", path), `${path}.visibility`, VISIBILITIES),
  };
}

export function parseAdventureSnapshot(input: unknown): AdventureSnapshotV1 {
  const path = "$";
  const record = objectAt(input, path, ["contractVersion", "householdId", "generatedAt", "active", "offered", "finished"]);
  versionAt(required(record, "contractVersion", path), `${path}.contractVersion`, 1);
  const nullableAdventure = (value: unknown, at: string) => (value === null ? null : worldAdventureAt(value, at));
  const finished = arrayAt(required(record, "finished", path), `${path}.finished`, 0, 24)
    .map((entry, index) => worldAdventureAt(entry, `${path}.finished[${index}]`));
  const active = nullableAdventure(required(record, "active", path), `${path}.active`);
  const offered = nullableAdventure(required(record, "offered", path), `${path}.offered`);
  if (active && offered) fail(`${path}.offered`, "must be null while an adventure is active");
  if (active && active.status !== "active") fail(`${path}.active.status`, "must be active");
  if (offered && offered.status !== "offered") fail(`${path}.offered.status`, "must be offered");
  return {
    contractVersion: 1,
    householdId: idAt(required(record, "householdId", path), `${path}.householdId`),
    generatedAt: timestampAt(required(record, "generatedAt", path), `${path}.generatedAt`),
    active,
    offered,
    finished,
  };
}

export function parseWorldProjection(input: unknown): WorldProjectionV1 {
  const path = "$";
  const record = objectAt(input, path, ["contractVersion", "worldVersion", "revision", "householdId", "viewer", "generatedAt", "scene", "personas", "items", "adventures"]);
  versionAt(required(record, "contractVersion", path), "$.contractVersion", 1);
  versionAt(required(record, "worldVersion", path), "$.worldVersion", 1);
  const viewer = enumAt(required(record, "viewer", path), "$.viewer", WORLD_VIEWERS);
  const sceneRecord = objectAt(required(record, "scene", path), "$.scene", ["key", "theme"]);
  const personas = arrayAt(required(record, "personas", path), "$.personas", 0, 16).map((persona, index) => worldPersonaAt(persona, `$.personas[${index}]`));
  const items = arrayAt(required(record, "items", path), "$.items", 0, 256).map((item, index) => worldItemAt(item, `$.items[${index}]`));
  const adventures = arrayAt(required(record, "adventures", path), "$.adventures", 0, 32).map((adventure, index) => worldAdventureAt(adventure, `$.adventures[${index}]`));
  uniqueBy(personas, (persona) => persona.id, "$.personas", "id");
  uniqueBy(items, (item) => item.id, "$.items", "id");
  uniqueBy(adventures, (adventure) => adventure.id, "$.adventures", "id");
  if (viewer === "display") {
    personas.forEach((persona, index) => {
      if (persona.visibility !== "display") fail(`$.personas[${index}].visibility`, "must be display-visible in a display projection");
    });
    adventures.forEach((adventure, index) => {
      if (adventure.visibility !== "display") fail(`$.adventures[${index}].visibility`, "must be display-visible in a display projection");
    });
    items.forEach((item, index) => {
      if (item.visibility !== "display") fail(`$.items[${index}].visibility`, "must be display-visible in a display projection");
    });
  }
  return {
    contractVersion: 1,
    worldVersion: 1,
    revision: integerAt(required(record, "revision", path), "$.revision", 0, Number.MAX_SAFE_INTEGER),
    householdId: idAt(required(record, "householdId", path), "$.householdId"),
    viewer,
    generatedAt: timestampAt(required(record, "generatedAt", path), "$.generatedAt"),
    scene: {
      key: idAt(required(sceneRecord, "key", "$.scene"), "$.scene.key"),
      theme: idAt(required(sceneRecord, "theme", "$.scene"), "$.scene.theme"),
    },
    personas,
    items,
    adventures,
  };
}

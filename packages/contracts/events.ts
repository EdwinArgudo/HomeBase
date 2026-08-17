import {
  assertJsonValue,
  enumAt,
  fail,
  idAt,
  nullableIdAt,
  objectAt,
  required,
  sourceAt,
  stringAt,
  timestampAt,
  versionAt,
  type JsonObject,
  type UnknownRecord,
} from "./primitives.ts";
import { VISIBILITIES, type Visibility } from "./vocabulary.ts";

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

export type GameEventType = typeof EVENT_TYPES[number];
export type EventSourceType = typeof EVENT_SOURCE_TYPES[number];

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

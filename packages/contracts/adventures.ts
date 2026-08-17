import {
  arrayAt,
  enumAt,
  fail,
  idAt,
  integerAt,
  nullableTimestampAt,
  objectAt,
  required,
  stringAt,
  timestampAt,
  versionAt,
} from "./primitives.ts";
import { VISIBILITIES, type Visibility } from "./vocabulary.ts";

export const ADVENTURE_STATUSES = ["offered", "active", "complete", "expired", "dismissed"] as const;

export type AdventureStatus = typeof ADVENTURE_STATUSES[number];

export type WorldAdventureV1 = {
  id: string;
  title: string;
  status: AdventureStatus;
  targetValue: number;
  currentValue: number;
  endsAt: string | null;
  visibility: Visibility;
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

/** Shared with the world projection, which lists the household's adventures. */
export function worldAdventureAt(input: unknown, path: string): WorldAdventureV1 {
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

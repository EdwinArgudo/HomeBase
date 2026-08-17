import {
  arrayAt,
  enumAt,
  fail,
  idAt,
  integerAt,
  objectAt,
  required,
  stringAt,
  timestampAt,
  uniqueBy,
  versionAt,
} from "./primitives.ts";
import { VISIBILITIES, type Visibility } from "./vocabulary.ts";
import {
  PERSONA_ACTIVITY_STATES,
  personaAppearanceAt,
  personaManifestAt,
  type PersonaActivityState,
  type PersonaAppearanceV1,
  type PersonaManifestV1,
} from "./persona.ts";
import { REWARD_KEYS_V1, type RewardKeyV1 } from "./rewards.ts";
import { worldAdventureAt, type WorldAdventureV1 } from "./adventures.ts";

export const WORLD_ITEM_STATES = ["idle", "active", "complete"] as const;
export const WORLD_VIEWERS = ["member", "display"] as const;

export type WorldItemState = typeof WORLD_ITEM_STATES[number];
export type WorldViewer = typeof WORLD_VIEWERS[number];

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

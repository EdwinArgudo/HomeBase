import {
  arrayAt,
  booleanAt,
  enumAt,
  fail,
  idAt,
  integerAt,
  literalTrueAt,
  nullableTimestampAt,
  objectAt,
  required,
  stringAt,
  timestampAt,
  uniqueBy,
  versionAt,
} from "./primitives.ts";
import { parseGameEvent, type GameEventV1 } from "./events.ts";

export const SPRITE_ASSET_KINDS = ["portrait", "neutral", "sprite_sheet"] as const;
export const REQUIRED_ANIMATIONS = ["idle", "walk_down", "walk_up", "walk_left", "walk_right", "celebrate", "rest"] as const;
export const ATTACHMENT_KINDS = ["hair", "clothing", "accessory", "prop"] as const;
export const PERSONA_ACTIVITY_STATES = ["idle", "rest", "tend", "move", "grow", "connect", "celebrate", "travel", "read", "cook"] as const;
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

export type SpriteAssetKind = typeof SPRITE_ASSET_KINDS[number];
export type AnimationName = typeof REQUIRED_ANIMATIONS[number];
export type AttachmentKind = typeof ATTACHMENT_KINDS[number];
export type PersonaActivityState = typeof PERSONA_ACTIVITY_STATES[number];
export type PersonaStatus = typeof PERSONA_STATUSES[number];
export type PersonaVisibility = typeof PERSONA_VISIBILITIES[number];

export type PersonaAppearanceV1 = {
  character: typeof PERSONA_CHARACTERS[number];
};

export type PersonaDraftInputV1 = {
  contractVersion: 1;
  displayName: string;
  visibility: PersonaVisibility;
  appearance: PersonaAppearanceV1;
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

/** Shared with the world projection, which embeds a persona manifest verbatim. */
export function personaManifestAt(input: unknown, path: string): PersonaManifestV1 {
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

/** Shared with the world projection, which embeds a persona appearance verbatim. */
export function personaAppearanceAt(input: unknown, path: string): PersonaAppearanceV1 {
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

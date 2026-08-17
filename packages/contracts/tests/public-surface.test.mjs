import assert from "node:assert/strict";
import { test } from "node:test";

import * as contracts from "../index.ts";

// The package is a versioned boundary, so its surface is data, not an accident
// of which files happen to use `export *`. Adding a contract means adding it
// here on purpose; a helper leaking out of a domain module fails this test.
const PUBLIC_SURFACE = [
  "ADVENTURE_STATUSES",
  "ATTACHMENT_KINDS",
  "ContractValidationError",
  "EVENT_SOURCE_TYPES",
  "EVENT_TYPES",
  "MOVE_FAMILIES",
  "MOVE_REASON_CODES",
  "MOVE_SOURCE_TYPES",
  "MOVE_STATUSES",
  "OWNERSHIP_TYPES",
  "PERSONA_ACTIVITY_STATES",
  "PERSONA_CHARACTERS",
  "PERSONA_CREATION_METHODS",
  "PERSONA_STATUSES",
  "PERSONA_VISIBILITIES",
  "PLAN_GOAL_OWNERSHIPS",
  "PLAN_GOAL_TRACKING_TYPES",
  "PLAN_OWNERS",
  "PLAN_TASK_STATUSES",
  "PROGRESS_DIMENSIONS",
  "REQUIRED_ANIMATIONS",
  "REWARD_KEYS_V1",
  "REWARD_KINDS",
  "SPRITE_ASSET_KINDS",
  "VISIBILITIES",
  "WORLD_ITEM_STATES",
  "WORLD_VIEWERS",
  "parseAdventureSnapshot",
  "parseDailyMove",
  "parseGameEvent",
  "parseMoveCompletionOptions",
  "parsePersonaAppearance",
  "parsePersonaApprovalResult",
  "parsePersonaDraftInput",
  "parsePersonaManifest",
  "parsePersonaProfile",
  "parsePersonaSnapshot",
  "parsePlansAction",
  "parsePlansSnapshot",
  "parseProgressBalance",
  "parseProgressSnapshot",
  "parseRewardDefinition",
  "parseRewardEquipInput",
  "parseRewardProgress",
  "parseRewardSnapshot",
  "parseWorldProjection",
  "safeParse",
].sort();

test("the package exports exactly its declared public surface", () => {
  assert.deepEqual(Object.keys(contracts).sort(), PUBLIC_SURFACE);
});

test("the validation kernel is not reachable from the public index", () => {
  for (const helper of ["fail", "objectAt", "required", "enumAt", "stringAt", "idAt", "assertJsonValue"]) {
    assert.equal(helper in contracts, false, `${helper} must stay internal to the package`);
  }
});

test("cross-module helpers are not reachable from the public index", () => {
  for (const helper of ["personaManifestAt", "personaAppearanceAt", "worldAdventureAt"]) {
    assert.equal(helper in contracts, false, `${helper} must stay internal to the package`);
  }
});

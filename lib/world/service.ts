import { companionActivityV1, isEmblemRewardKeyV1 } from "@homebase/domain-game";
import {
  parsePersonaAppearance,
  parseWorldProjection,
  type RewardKeyV1,
  type WorldProjectionV1,
} from "@homebase/contracts";

import type { HouseholdContext } from "../household/types.ts";
import { furnishingItems, materializeHouseholdFurnishings } from "./furnishings.ts";
import { createManualPersonaManifest } from "../personas/service.ts";

type WorldPersonaRow = {
  id: string;
  member_id: string;
  display_name: string;
  base_style_version: string;
  appearance_json: string;
  equipped_reward_key: string | null;
  visibility: string;
  last_completed_at: string | null;
  last_family: string | null;
};

const MOVE_FAMILIES = ["tend", "move", "grow", "connect"] as const;

function lastCompletion(row: WorldPersonaRow) {
  const family = MOVE_FAMILIES.find((candidate) => candidate === row.last_family);
  return family && row.last_completed_at ? { family, occurredAt: row.last_completed_at } : null;
}

const ACTIVITY_COPY: Record<string, string> = {
  idle: "pottering about at home",
  rest: "curled up resting",
  celebrate: "celebrating a finished move",
  tend: "tidying up around the home",
  move: "stretching their legs",
  grow: "nose deep in something new",
  connect: "waiting for company",
};

const POSITIONS = [
  [28, 62], [70, 57], [48, 68], [18, 52],
  [82, 50], [38, 55], [60, 52], [24, 72],
  [74, 70], [50, 45], [12, 64], [88, 63],
  [34, 74], [66, 74], [42, 48], [58, 64],
] as const;

function knownRewardKey(value: string | null): RewardKeyV1 | null {
  return isEmblemRewardKeyV1(value) ? value : null;
}

export async function loadMemberWorldProjection(
  context: HouseholdContext,
  generatedAt: string,
): Promise<WorldProjectionV1> {
  // A partner's companion may only react to moves they chose to make visible, so
  // the completion feeding each activity is filtered by the viewer's own scope.
  const visibleCompletion = `SELECT %COLUMN% FROM game_events ge
    WHERE ge.household_id = p.household_id AND ge.member_id = p.member_id
      AND ge.event_type = 'daily_move.completed'
      AND (p.member_id = ? OR ge.visibility IN ('household', 'display'))
    ORDER BY ge.occurred_at DESC, ge.id DESC
    LIMIT 1`;

  const result = await context.db.prepare(`SELECT
    p.id, p.member_id, p.display_name, p.base_style_version, p.appearance_json, p.visibility,
    (${visibleCompletion.replace("%COLUMN%", "ge.occurred_at")}) AS last_completed_at,
    (${visibleCompletion.replace("%COLUMN%", "json_extract(ge.payload_json, '$.family')")}) AS last_family,
    pu.reward_key AS equipped_reward_key
  FROM personas p
  LEFT JOIN persona_unlocks pu ON pu.household_id = p.household_id
    AND pu.member_id = p.member_id AND pu.persona_id = p.id
    AND pu.catalog_version = 1 AND pu.policy_version = 1
    AND pu.reward_key = CASE
      WHEN json_type(CASE WHEN json_valid(p.active_loadout_json) THEN p.active_loadout_json ELSE '{}' END) = 'object'
        AND (SELECT COUNT(*) FROM json_each(CASE WHEN json_valid(p.active_loadout_json) THEN p.active_loadout_json ELSE '{}' END)) = 1
        AND json_type(CASE WHEN json_valid(p.active_loadout_json) THEN p.active_loadout_json ELSE '{}' END, '$.emblem') = 'text'
      THEN json_extract(CASE WHEN json_valid(p.active_loadout_json) THEN p.active_loadout_json ELSE '{}' END, '$.emblem')
      ELSE NULL
    END
  WHERE p.household_id = ? AND p.deleted_at IS NULL AND (
    p.member_id = ? OR (
      p.member_id <> ? AND p.status = 'ready' AND p.visibility = 'household'
    )
  )
  ORDER BY CASE WHEN p.member_id = ? THEN 0 ELSE 1 END ASC, p.id ASC
  LIMIT 16`)
    .bind(
      context.member.id,
      context.member.id,
      context.member.household_id,
      context.member.id,
      context.member.id,
      context.member.id,
    )
    .all<WorldPersonaRow>();

  const furnishings = await materializeHouseholdFurnishings(context);

  const personas = result.results.map((row, index) => {
    const activity = companionActivityV1({ generatedAt, lastCompletion: lastCompletion(row) });
    return {
      id: row.id,
      displayName: row.display_name,
      altDescription: `${row.display_name} is ${ACTIVITY_COPY[activity] ?? "at home"}.`,
      visibility: row.visibility,
      activity,
      appearance: parsePersonaAppearance(JSON.parse(row.appearance_json) as unknown),
      equippedRewardKey: knownRewardKey(row.equipped_reward_key),
      x: POSITIONS[index]![0],
      y: POSITIONS[index]![1],
      manifest: createManualPersonaManifest(row.id, row.base_style_version),
    };
  });

  return parseWorldProjection({
    contractVersion: 1,
    worldVersion: 1,
    revision: 0,
    householdId: context.member.household_id,
    viewer: "member",
    generatedAt,
    scene: { key: "homebase-apartment", theme: "calm-morning" },
    personas,
    items: furnishingItems(furnishings, "household"),
    adventures: [],
  });
}

type DisplayPersonaRow = {
  id: string;
  display_name: string;
  base_style_version: string;
  appearance_json: string;
  last_celebrated_at: string | null;
};

/**
 * The wall display is ambient and can be seen by anyone in the room, so it
 * shows who lives here and nothing about what they have been doing. Only a
 * companion whose owner shared it with the household appears at all, and the
 * only state it can express is a celebration from a display-visible event.
 */
export async function loadDisplayWorldProjection(
  context: HouseholdContext,
  generatedAt: string,
): Promise<WorldProjectionV1> {
  const result = await context.db.prepare(`SELECT
    p.id, p.display_name, p.base_style_version, p.appearance_json,
    (SELECT ge.occurred_at FROM game_events ge
      WHERE ge.household_id = p.household_id AND ge.member_id = p.member_id
        AND ge.event_type = 'daily_move.completed' AND ge.visibility = 'display'
      ORDER BY ge.occurred_at DESC, ge.id DESC
      LIMIT 1) AS last_celebrated_at
  FROM personas p
  WHERE p.household_id = ? AND p.deleted_at IS NULL
    AND p.status = 'ready' AND p.visibility = 'household'
  ORDER BY p.id ASC
  LIMIT 16`)
    .bind(context.member.household_id)
    .all<DisplayPersonaRow>();

  const furnishings = await materializeHouseholdFurnishings(context);

  const personas = result.results.map((row, index) => {
    const celebrating = row.last_celebrated_at !== null
      && companionActivityV1({ generatedAt, lastCompletion: { family: "tend", occurredAt: row.last_celebrated_at } }) === "celebrate";
    return {
      id: row.id,
      displayName: row.display_name,
      altDescription: `${row.display_name} is at home.`,
      // Household-shared companions are what this household chose to show in
      // their own home; private ones are excluded by the query above.
      visibility: "display",
      activity: celebrating ? "celebrate" : "idle",
      appearance: parsePersonaAppearance(JSON.parse(row.appearance_json) as unknown),
      equippedRewardKey: null,
      x: POSITIONS[index]![0],
      y: POSITIONS[index]![1],
      manifest: createManualPersonaManifest(row.id, row.base_style_version),
    };
  });

  return parseWorldProjection({
    contractVersion: 1,
    worldVersion: 1,
    revision: 0,
    householdId: context.member.household_id,
    viewer: "display",
    generatedAt,
    scene: { key: "homebase-apartment", theme: "calm-morning" },
    personas,
    // Furniture says nothing about anyone, so the wall display shows the room
    // exactly as the household earned it.
    items: furnishingItems(furnishings, "display"),
    adventures: [],
  });
}

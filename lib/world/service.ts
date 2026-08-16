import {
  parsePersonaAppearance,
  parseWorldProjection,
  REWARD_KEYS_V1,
  type RewardKeyV1,
  type WorldProjectionV1,
} from "@homebase/contracts";

import type { HouseholdContext } from "../household/types.ts";
import { createManualPersonaManifest } from "../personas/service.ts";

type WorldPersonaRow = {
  id: string;
  member_id: string;
  display_name: string;
  base_style_version: string;
  appearance_json: string;
  equipped_reward_key: string | null;
  visibility: string;
};

const POSITIONS = [
  [28, 62], [70, 57], [48, 68], [18, 52],
  [82, 50], [38, 55], [60, 52], [24, 72],
  [74, 70], [50, 45], [12, 64], [88, 63],
  [34, 74], [66, 74], [42, 48], [58, 64],
] as const;

function knownRewardKey(value: string | null): RewardKeyV1 | null {
  return REWARD_KEYS_V1.includes(value as RewardKeyV1) ? value as RewardKeyV1 : null;
}

export async function loadMemberWorldProjection(
  context: HouseholdContext,
  generatedAt: string,
): Promise<WorldProjectionV1> {
  const result = await context.db.prepare(`SELECT
    p.id, p.member_id, p.display_name, p.base_style_version, p.appearance_json, p.visibility,
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
    .bind(context.member.household_id, context.member.id, context.member.id, context.member.id)
    .all<WorldPersonaRow>();

  const personas = result.results.map((row, index) => ({
      id: row.id,
      displayName: row.display_name,
      altDescription: `${row.display_name}'s pixel persona is standing in the preview apartment.`,
      visibility: row.visibility,
      activity: "idle",
      appearance: parsePersonaAppearance(JSON.parse(row.appearance_json) as unknown),
      equippedRewardKey: knownRewardKey(row.equipped_reward_key),
      x: POSITIONS[index]![0],
      y: POSITIONS[index]![1],
      manifest: createManualPersonaManifest(row.id, row.base_style_version),
    }));

  return parseWorldProjection({
    contractVersion: 1,
    worldVersion: 1,
    revision: 0,
    householdId: context.member.household_id,
    viewer: "member",
    generatedAt,
    scene: { key: "homebase-apartment", theme: "calm-morning" },
    personas,
    items: [],
    adventures: [],
  });
}

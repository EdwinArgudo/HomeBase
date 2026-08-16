import {
  parsePersonaAppearance,
  parseWorldProjection,
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
  visibility: string;
};

const POSITIONS = [
  [28, 62], [70, 57], [48, 68], [18, 52],
  [82, 50], [38, 55], [60, 52], [24, 72],
  [74, 70], [50, 45], [12, 64], [88, 63],
  [34, 74], [66, 74], [42, 48], [58, 64],
] as const;

export async function loadMemberWorldProjection(
  context: HouseholdContext,
  generatedAt: string,
): Promise<WorldProjectionV1> {
  const result = await context.db.prepare(`SELECT
    id, member_id, display_name, base_style_version, appearance_json, visibility
  FROM personas
  WHERE household_id = ? AND deleted_at IS NULL AND (
    member_id = ? OR (
      member_id <> ? AND status = 'ready' AND visibility = 'household'
    )
  )
  ORDER BY CASE WHEN member_id = ? THEN 0 ELSE 1 END ASC, id ASC
  LIMIT 16`)
    .bind(context.member.household_id, context.member.id, context.member.id, context.member.id)
    .all<WorldPersonaRow>();

  return parseWorldProjection({
    contractVersion: 1,
    worldVersion: 1,
    revision: 0,
    householdId: context.member.household_id,
    viewer: "member",
    generatedAt,
    scene: { key: "homebase-apartment", theme: "calm-morning" },
    personas: result.results.map((row, index) => ({
      id: row.id,
      displayName: row.display_name,
      altDescription: `${row.display_name}'s pixel persona is standing in the preview apartment.`,
      visibility: row.visibility,
      activity: "idle",
      appearance: parsePersonaAppearance(JSON.parse(row.appearance_json) as unknown),
      x: POSITIONS[index]![0],
      y: POSITIONS[index]![1],
      manifest: createManualPersonaManifest(row.id, row.base_style_version),
    })),
    items: [],
    adventures: [],
  });
}

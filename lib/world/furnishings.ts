import {
  FURNISHING_PLACEMENTS_V1,
  unlockedFurnishingsV1,
} from "@homebase/domain-game";
import type { WorldItemV1 } from "@homebase/contracts";

import type { HouseholdContext } from "../household/types.ts";

type UnlockRow = { reward_key: string; unlocked_at: string };
type EventRow = { id: string; occurred_at: string };

async function readHouseholdPoints(context: HouseholdContext): Promise<number> {
  const row = await context.db.prepare(`SELECT lifetime_points
    FROM progress_balances
    WHERE household_id = ? AND member_id IS NULL AND dimension = 'household'
    LIMIT 1`)
    .bind(context.member.household_id)
    .first<{ lifetime_points: number }>();
  return Number.isSafeInteger(row?.lifetime_points) && row!.lifetime_points >= 0 ? row!.lifetime_points : 0;
}

async function readUnlocks(context: HouseholdContext): Promise<ReadonlyMap<string, string>> {
  const result = await context.db.prepare(`SELECT reward_key, unlocked_at
    FROM household_unlocks
    WHERE household_id = ? AND catalog_version = 1 AND policy_version = 1
    ORDER BY reward_key ASC`)
    .bind(context.member.household_id)
    .all<UnlockRow>();
  return new Map(result.results.map((row) => [row.reward_key, row.unlocked_at]));
}

/**
 * Furnishings the household has earned together, recorded once and then kept.
 * A furnishing is only written when a shared move actually paid for it, so the
 * home can always be rebuilt from the event that earned each piece.
 */
export async function materializeHouseholdFurnishings(
  context: HouseholdContext,
): Promise<ReadonlyMap<string, string>> {
  const points = await readHouseholdPoints(context);
  let unlocks = await readUnlocks(context);
  const unrecorded = unlockedFurnishingsV1(points).filter((reward) => !unlocks.has(reward.key));
  if (unrecorded.length === 0) return unlocks;

  // The earliest shared completion is the canonical moment the home changed.
  const event = await context.db.prepare(`SELECT id, occurred_at
    FROM game_events
    WHERE household_id = ? AND event_type = 'daily_move.completed' AND payload_version = 1
      AND json_extract(payload_json, '$.ownership') = 'shared'
    ORDER BY occurred_at ASC, id ASC
    LIMIT 1`)
    .bind(context.member.household_id)
    .first<EventRow>();
  if (!event) return unlocks;

  await context.db.batch(unrecorded.map((reward) => context.db.prepare(
    `INSERT OR IGNORE INTO household_unlocks (
      id, household_id, reward_key, catalog_version, policy_version, source_event_id, unlocked_at
    ) VALUES (?, ?, ?, 1, 1, ?, ?)`,
  ).bind(
    `furnishing:${context.member.household_id}:${reward.key}`,
    context.member.household_id,
    reward.key,
    event.id,
    event.occurred_at,
  )));

  unlocks = await readUnlocks(context);
  return unlocks;
}

/** Earned furnishings as world items, placed deterministically. */
export function furnishingItems(
  unlocks: ReadonlyMap<string, string>,
  visibility: WorldItemV1["visibility"],
): WorldItemV1[] {
  return Object.entries(FURNISHING_PLACEMENTS_V1)
    .filter(([rewardKey]) => unlocks.has(rewardKey))
    .map(([rewardKey, placement]) => ({
      id: `furnishing-${rewardKey}`,
      catalogKey: placement.catalogKey,
      zone: placement.zone,
      visibility,
      x: placement.x,
      y: placement.y,
      zIndex: placement.zIndex,
      state: "idle" as const,
    }));
}

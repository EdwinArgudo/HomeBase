import { parseRewardSnapshot, type ProgressDimension, type RewardSnapshotV1 } from "@homebase/contracts";
import {
  REWARD_CATALOG_V1,
  REWARD_CATALOG_VERSION,
  REWARD_POLICY_VERSION,
  eligibleRewardsV1,
  type RewardPointTotalsV1,
} from "@homebase/domain-game";

import type { HouseholdContext } from "../household/types.ts";

type ProgressRow = { member_id: string | null; dimension: string; lifetime_points: number };
type EventRow = { id: string; member_id: string | null; payload_json: string; occurred_at: string };
type UnlockRow = { reward_key: string; unlocked_at: string };

function zeroTotals(): RewardPointTotalsV1 {
  return { tend: 0, move: 0, grow: 0, connect: 0, household: 0 };
}

function rewardSnapshot(
  context: HouseholdContext,
  personaId: string | null,
  totals: RewardPointTotalsV1,
  unlocks: ReadonlyMap<string, string>,
  generatedAt: string,
): RewardSnapshotV1 {
  return parseRewardSnapshot({
    contractVersion: 1,
    catalogVersion: REWARD_CATALOG_VERSION,
    policyVersion: REWARD_POLICY_VERSION,
    householdId: context.member.household_id,
    memberId: context.member.id,
    personaId,
    generatedAt,
    rewards: REWARD_CATALOG_V1.map((reward) => ({
      contractVersion: 1,
      policyVersion: REWARD_POLICY_VERSION,
      reward,
      currentPoints: totals[reward.dimension],
      unlockedAt: unlocks.get(reward.key) ?? null,
    })),
  });
}

function canonicalEventForReward(
  reward: (typeof REWARD_CATALOG_V1)[number],
  events: readonly EventRow[],
  memberId: string,
) {
  for (const event of events) {
    let payload: unknown;
    try {
      payload = JSON.parse(event.payload_json);
    } catch {
      continue;
    }
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) continue;
    const data = payload as Record<string, unknown>;
    const familyIsValid = ["tend", "move", "grow", "connect"].includes(String(data.family));
    const awardIsCanonical = familyIsValid
      && data.personalPoints === 10
      && ((data.ownership === "personal" && data.householdPoints === 0)
        || (data.ownership === "shared" && data.householdPoints === 4));
    if (!awardIsCanonical) continue;
    if (reward.dimension === "household") {
      if (data.ownership === "shared" && data.householdPoints === 4) return event;
    } else if (
      event.member_id === memberId
      && data.family === reward.dimension
    ) return event;
  }
  return null;
}

export async function loadAndMaterializeRewards(
  context: HouseholdContext,
  generatedAt: string,
): Promise<RewardSnapshotV1> {
  const persona = await context.db.prepare(`SELECT id
    FROM personas
    WHERE household_id = ? AND member_id = ? AND deleted_at IS NULL
    LIMIT 1`)
    .bind(context.member.household_id, context.member.id)
    .first<{ id: string }>();

  if (!persona) return rewardSnapshot(context, null, zeroTotals(), new Map(), generatedAt);

  const progress = await context.db.prepare(`SELECT member_id, dimension, lifetime_points
    FROM progress_balances
    WHERE household_id = ? AND (
      (member_id = ? AND dimension IN ('tend', 'move', 'grow', 'connect'))
      OR (member_id IS NULL AND dimension = 'household')
    )`)
    .bind(context.member.household_id, context.member.id)
    .all<ProgressRow>();
  const totals = zeroTotals();
  for (const row of progress.results) {
    if (["tend", "move", "grow", "connect", "household"].includes(row.dimension)) {
      totals[row.dimension as ProgressDimension] = row.lifetime_points;
    }
  }

  const eligible = eligibleRewardsV1(totals);
  if (eligible.length > 0) {
    const eventResult = await context.db.prepare(`SELECT id, member_id, payload_json, occurred_at
      FROM game_events
      WHERE household_id = ? AND event_type = 'daily_move.completed' AND payload_version = 1
      ORDER BY occurred_at ASC, id ASC`)
      .bind(context.member.household_id)
      .all<EventRow>();
    const statements = eligible.flatMap((reward) => {
      const event = canonicalEventForReward(reward, eventResult.results, context.member.id);
      if (!event) return [];
      return [context.db.prepare(`INSERT OR IGNORE INTO persona_unlocks (
        id, household_id, member_id, persona_id, reward_key, catalog_version,
        policy_version, source_event_id, unlocked_at
      ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`)
        .bind(`reward:${persona.id}:${reward.key}`, context.member.household_id,
          context.member.id, persona.id, reward.key, event.id, event.occurred_at)];
    });
    if (statements.length > 0) await context.db.batch(statements);
  }

  const unlockResult = await context.db.prepare(`SELECT reward_key, unlocked_at
    FROM persona_unlocks
    WHERE household_id = ? AND member_id = ? AND persona_id = ?
      AND catalog_version = 1 AND policy_version = 1
    ORDER BY reward_key ASC`)
    .bind(context.member.household_id, context.member.id, persona.id)
    .all<UnlockRow>();
  const unlocks = new Map(unlockResult.results.map((row) => [row.reward_key, row.unlocked_at]));
  return rewardSnapshot(context, persona.id, totals, unlocks, generatedAt);
}

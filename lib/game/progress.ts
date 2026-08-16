import { parseProgressSnapshot, type ProgressSnapshotV1 } from "@homebase/contracts";

import type { HouseholdContext } from "../household/types.ts";

type ProgressRow = {
  id: string;
  household_id: string;
  member_id: string | null;
  dimension: string;
  lifetime_points: number;
  level: number;
  updated_at: string;
};

const DIMENSION_ORDER = new Map([
  ["tend", 1],
  ["move", 2],
  ["grow", 3],
  ["connect", 4],
  ["household", 5],
]);

export async function loadProgressSnapshot(
  context: HouseholdContext,
  generatedAt: string,
): Promise<ProgressSnapshotV1> {
  const result = await context.db.prepare(`SELECT
    id, household_id, member_id, dimension, lifetime_points, level, updated_at
  FROM progress_balances
  WHERE household_id = ? AND (
    (member_id = ? AND dimension IN ('tend', 'move', 'grow', 'connect'))
    OR (member_id IS NULL AND dimension = 'household')
  )
  ORDER BY CASE dimension
    WHEN 'tend' THEN 1
    WHEN 'move' THEN 2
    WHEN 'grow' THEN 3
    WHEN 'connect' THEN 4
    WHEN 'household' THEN 5
    ELSE 6 END ASC`)
    .bind(context.member.household_id, context.member.id)
    .all<ProgressRow>();

  return parseProgressSnapshot({
    contractVersion: 1,
    householdId: context.member.household_id,
    member: {
      id: context.member.id,
      displayName: context.member.display_name,
    },
    balances: [...result.results]
      .sort((left, right) => (DIMENSION_ORDER.get(left.dimension) ?? 6) - (DIMENSION_ORDER.get(right.dimension) ?? 6))
      .map((row) => ({
      contractVersion: 1,
      id: row.id,
      householdId: row.household_id,
      memberId: row.member_id,
      dimension: row.dimension,
      lifetimePoints: row.lifetime_points,
      level: row.level,
      updatedAt: row.updated_at,
    })),
    generatedAt,
  });
}

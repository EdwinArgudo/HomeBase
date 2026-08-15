import {
  parseGameEvent,
  parseProgressBalance,
  type GameEventV1,
  type ProgressBalanceV1,
} from "@homebase/contracts";

import { dailyMoveRowToContract, type DailyMoveRow } from "./daily-move-repository.ts";

export async function readAuthorizedDailyMove(
  db: D1Database,
  householdId: string,
  memberId: string,
  moveId: string,
) {
  const row = await db.prepare(`SELECT
    id, household_id, member_id, local_date, slot, family, ownership_type,
    visibility, source_type, source_id, title, short_label, estimated_seconds,
    status, selection_reason_code, move_policy_version, completed_at,
    replacement_count, created_at
  FROM daily_moves
  WHERE id = ? AND household_id = ? AND member_id = ? LIMIT 1`)
    .bind(moveId, householdId, memberId).first<DailyMoveRow>();
  if (!row) return null;
  return { move: dailyMoveRowToContract(row), replacementCount: Number(row.replacement_count ?? 0) };
}

type GameEventRow = {
  id: string;
  household_id: string;
  member_id: string | null;
  event_type: string;
  source_type: string;
  source_id: string;
  visibility: string;
  payload_version: number;
  payload_json: string;
  idempotency_key: string;
  occurred_at: string;
  created_at: string;
};

function eventFromRow(row: GameEventRow): GameEventV1 {
  return parseGameEvent({
    contractVersion: 1,
    id: row.id,
    householdId: row.household_id,
    memberId: row.member_id,
    eventType: row.event_type,
    source: { type: row.source_type, id: row.source_id },
    visibility: row.visibility,
    payload: { version: row.payload_version, data: JSON.parse(row.payload_json) as unknown },
    idempotencyKey: row.idempotency_key,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  });
}

export async function readCompletionEvent(
  db: D1Database,
  householdId: string,
  memberId: string,
  moveId: string,
) {
  const row = await db.prepare(`SELECT
    id, household_id, member_id, event_type, source_type, source_id, visibility,
    payload_version, payload_json, idempotency_key, occurred_at, created_at
  FROM game_events
  WHERE household_id = ? AND member_id = ? AND source_type = 'daily_move'
    AND source_id = ? AND event_type = 'daily_move.completed'
  LIMIT 1`).bind(householdId, memberId, moveId).first<GameEventRow>();
  return row ? eventFromRow(row) : null;
}

type ProgressRow = {
  id: string;
  household_id: string;
  member_id: string | null;
  dimension: string;
  lifetime_points: number;
  level: number;
  updated_at: string;
};

function progressFromRow(row: ProgressRow): ProgressBalanceV1 {
  return parseProgressBalance({
    contractVersion: 1,
    id: row.id,
    householdId: row.household_id,
    memberId: row.member_id,
    dimension: row.dimension,
    lifetimePoints: row.lifetime_points,
    level: row.level,
    updatedAt: row.updated_at,
  });
}

export async function readAffectedBalances(
  db: D1Database,
  householdId: string,
  memberId: string,
  family: string,
  includeHousehold: boolean,
) {
  const result = await db.prepare(`SELECT
    id, household_id, member_id, dimension, lifetime_points, level, updated_at
  FROM progress_balances
  WHERE household_id = ?
    AND ((member_id = ? AND dimension = ?)
      OR (? = 1 AND member_id IS NULL AND dimension = 'household'))
  ORDER BY member_id IS NULL ASC`)
    .bind(householdId, memberId, family, includeHousehold ? 1 : 0)
    .all<ProgressRow>();
  return result.results.map(progressFromRow);
}

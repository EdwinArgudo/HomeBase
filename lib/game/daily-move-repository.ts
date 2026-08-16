import { parseDailyMove, type DailyMoveV1 } from "@homebase/contracts";

export type DailyMoveScope = {
  householdId: string;
  memberId: string;
  localDate: string;
};

export type DailyMoveRow = {
  id: string;
  household_id: string;
  member_id: string;
  local_date: string;
  slot: number;
  family: string;
  ownership_type: string;
  visibility: string;
  source_type: string;
  source_id: string;
  title: string;
  short_label: string;
  estimated_seconds: number;
  status: string;
  selection_reason_code: string;
  move_policy_version: number;
  completed_at: string | null;
  replacement_count?: number;
  created_at: string;
};

const READ_SNAPSHOT_SQL = `SELECT
  id, household_id, member_id, local_date, slot, family, ownership_type,
  visibility, source_type, source_id, title, short_label, estimated_seconds,
  status, selection_reason_code, move_policy_version, completed_at, replacement_count, created_at
FROM daily_moves
WHERE household_id = ? AND member_id = ? AND local_date = ?
ORDER BY slot ASC`;

// Sources shown on recent days, so the selector can prefer something new.
const RECENT_SOURCES_SQL = `SELECT DISTINCT source_id
FROM daily_moves
WHERE household_id = ? AND member_id = ? AND local_date < ? AND local_date >= ?`;

export async function readRecentSourceIds(
  db: D1Database,
  scope: DailyMoveScope,
  sinceLocalDate: string,
): Promise<readonly string[]> {
  const result = await db.prepare(RECENT_SOURCES_SQL)
    .bind(scope.householdId, scope.memberId, scope.localDate, sinceLocalDate)
    .all<{ source_id: string }>();
  return result.results.map((row) => row.source_id);
}

const INSERT_MOVE_SQL = `INSERT OR IGNORE INTO daily_moves (
  id, household_id, member_id, local_date, slot, family, ownership_type,
  visibility, source_type, source_id, title, short_label, estimated_seconds,
  status, selection_reason_code, move_policy_version, completed_at, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export function dailyMoveRowToContract(row: DailyMoveRow) {
  return parseDailyMove({
    contractVersion: 1,
    id: row.id,
    householdId: row.household_id,
    memberId: row.member_id,
    localDate: row.local_date,
    slot: row.slot,
    family: row.family,
    ownership: row.ownership_type,
    visibility: row.visibility,
    source: { type: row.source_type, id: row.source_id },
    title: row.title,
    shortLabel: row.short_label,
    estimatedSeconds: row.estimated_seconds,
    status: row.status,
    selectionReasonCode: row.selection_reason_code,
    movePolicyVersion: row.move_policy_version,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  });
}

export async function readDailyMoveSnapshot(db: D1Database, scope: DailyMoveScope) {
  const result = await db.prepare(READ_SNAPSHOT_SQL)
    .bind(scope.householdId, scope.memberId, scope.localDate)
    .all<DailyMoveRow>();
  return result.results.map(dailyMoveRowToContract);
}

export async function insertDailyMoveSnapshot(
  db: D1Database,
  scope: DailyMoveScope,
  moves: readonly DailyMoveV1[],
) {
  const statements = moves.map((move) => {
    if (
      move.householdId !== scope.householdId
      || move.memberId !== scope.memberId
      || move.localDate !== scope.localDate
    ) {
      throw new Error("Daily move is outside the authorized snapshot scope.");
    }
    return db.prepare(INSERT_MOVE_SQL).bind(
      move.id,
      move.householdId,
      move.memberId,
      move.localDate,
      move.slot,
      move.family,
      move.ownership,
      move.visibility,
      move.source.type,
      move.source.id,
      move.title,
      move.shortLabel,
      move.estimatedSeconds,
      move.status,
      move.selectionReasonCode,
      move.movePolicyVersion,
      move.completedAt,
      move.createdAt,
    );
  });
  if (statements.length > 0) await db.batch(statements);
}

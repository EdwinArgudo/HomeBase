const READINESS_QUERY = `SELECT
  bc.last_sync_attempt_at,
  bc.provider_last_successful_update,
  bc.provider_last_failed_update,
  bc.last_error_code,
  bc.last_error_message,
  dm.selection_reason_code AS daily_move_reason,
  dm.move_policy_version AS daily_move_policy_version,
  dm.replacement_count AS daily_move_replacement_count,
  ge.idempotency_key AS game_event_idempotency_key,
  ge.payload_version AS game_event_payload_version,
  pb.lifetime_points AS progress_lifetime_points,
  pb.level AS progress_level
FROM bank_connections bc
LEFT JOIN daily_moves dm ON 0
LEFT JOIN game_events ge ON 0
LEFT JOIN progress_balances pb ON 0
LIMIT 0`;

export class DatabaseSchemaNotReadyError extends Error {
  constructor() {
    super("Homebase storage needs an update.");
    this.name = "DatabaseSchemaNotReadyError";
  }
}

export async function assertDatabaseSchemaReady(db: D1Database) {
  try {
    await db.prepare(READINESS_QUERY).first();
  } catch {
    throw new DatabaseSchemaNotReadyError();
  }
}

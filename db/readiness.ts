const READINESS_QUERY = `SELECT
  last_sync_attempt_at,
  provider_last_successful_update,
  provider_last_failed_update,
  last_error_code,
  last_error_message
FROM bank_connections
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

export const AUDIT_ACTIONS = [
  "invitation.saved",
  "persona.visibility_changed",
  "bank_connection.created",
  "budget_limits.changed",
  "transaction.reclassified",
] as const;

export type AuditAction = typeof AUDIT_ACTIONS[number];

export type AuditEventInput = {
  householdId: string;
  memberId: string | null;
  action: AuditAction;
  subjectType: "invitation" | "persona" | "bank_connection" | "budget" | "transaction";
  subjectId: string;
  /**
   * Safe action metadata only: identifiers, counts, and booleans. Never an
   * amount, a merchant, an email, or anything else a person would consider
   * their financial detail — an audit trail must be safe to read.
   */
  metadata?: Record<string, string | number | boolean>;
  occurredAt: string;
};

const SAFE_KEY = /^[a-z][a-zA-Z0-9]{0,30}$/;
const FORBIDDEN_KEY = /amount|cents|balance|email|merchant|token|secret|name/i;

export function safeAuditMetadata(metadata: Record<string, unknown> | undefined) {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (!SAFE_KEY.test(key) || FORBIDDEN_KEY.test(key)) continue;
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      safe[key] = value;
      continue;
    }
    // Free text could carry anything, so only short identifier-shaped strings pass.
    if (typeof value === "string" && value.length > 0 && value.length <= 64 && /^[\w.:-]+$/.test(value)) {
      safe[key] = value;
    }
  }
  return safe;
}

/**
 * Returns a statement rather than writing, so an audit record can join the same
 * batch as the change it describes. A change that lands without its record, or
 * a record without its change, would both be lies.
 */
export function auditEventStatement(db: D1Database, input: AuditEventInput): D1PreparedStatement {
  return db.prepare(`INSERT INTO audit_events (
    id, household_id, member_id, action, subject_type, subject_id, metadata_json, occurred_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    crypto.randomUUID(),
    input.householdId,
    input.memberId,
    input.action,
    input.subjectType,
    input.subjectId,
    JSON.stringify(safeAuditMetadata(input.metadata)),
    input.occurredAt,
  );
}

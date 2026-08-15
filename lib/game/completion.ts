import { completedMoveEventV1 } from "@homebase/domain-game";
import type { DailyMoveV1 } from "@homebase/contracts";

import { HttpError } from "../auth/identity.ts";
import { prepareTransactionReviewStatements } from "../household/transaction-review.ts";
import type { HouseholdContext } from "../household/types.ts";
import {
  readAffectedBalances,
  readAuthorizedDailyMove,
  readCompletionEvent,
} from "./action-repository.ts";

type CompletionDependencies = {
  occurredAt: string;
  createId: () => string;
};

type DomainPlan = { statements: D1PreparedStatement[] };
type UnknownRecord = Record<string, unknown>;

function closedBody(input: unknown, allowed: readonly string[]): UnknownRecord {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "Completion details must be an object.");
  }
  const record = input as UnknownRecord;
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new HttpError(400, "Completion details contain an unsupported field.");
  }
  return record;
}

function assertMoveOwnership(
  move: DailyMoveV1,
  ownerMemberId: string | null,
  memberId: string,
) {
  if (move.ownership === "personal" && ownerMemberId !== memberId) {
    throw new HttpError(403, "That private source belongs to another member.");
  }
  if (move.ownership === "shared" && ownerMemberId !== null) {
    throw new HttpError(409, "The move no longer matches its source.");
  }
}

async function taskPlan(context: HouseholdContext, move: DailyMoveV1, body: unknown): Promise<DomainPlan> {
  closedBody(body, []);
  const source = await context.db.prepare(`SELECT id, owner_member_id, status
    FROM tasks
    WHERE id = ? AND household_id = ?
      AND (owner_member_id IS NULL OR owner_member_id = ?)
    LIMIT 1`).bind(move.source.id, context.member.household_id, context.member.id)
    .first<{ id: string; owner_member_id: string | null; status: string }>();
  if (!source) throw new HttpError(404, "Task not found.");
  assertMoveOwnership(move, source.owner_member_id, context.member.id);
  if (source.status !== "open") throw new HttpError(409, "That task is already complete.");
  const ownershipSql = move.ownership === "personal"
    ? "owner_member_id = ?"
    : "owner_member_id IS NULL";
  const ownershipValues = move.ownership === "personal" ? [context.member.id] : [];
  return { statements: [context.db.prepare(`UPDATE tasks SET status = 'complete'
    WHERE id = ? AND household_id = ? AND status = 'open' AND ${ownershipSql}
      AND EXISTS (
        SELECT 1 FROM daily_moves guarded_move
        WHERE guarded_move.id = ? AND guarded_move.household_id = ?
          AND guarded_move.member_id = ? AND guarded_move.status = 'active'
          AND guarded_move.source_type = 'task' AND guarded_move.source_id = ?
      )`)
    .bind(
      source.id,
      context.member.household_id,
      ...ownershipValues,
      move.id,
      move.householdId,
      move.memberId,
      move.source.id,
    )] };
}

async function groceryPlan(context: HouseholdContext, move: DailyMoveV1, body: unknown): Promise<DomainPlan> {
  closedBody(body, []);
  if (move.ownership !== "shared") throw new HttpError(409, "The move no longer matches its source.");
  const source = await context.db.prepare(`SELECT id, checked
    FROM grocery_items WHERE id = ? AND household_id = ? LIMIT 1`)
    .bind(move.source.id, context.member.household_id).first<{ id: string; checked: number }>();
  if (!source) throw new HttpError(404, "Grocery item not found.");
  if (source.checked !== 0) throw new HttpError(409, "That grocery item is already checked.");
  return { statements: [context.db.prepare(`UPDATE grocery_items SET checked = 1
    WHERE id = ? AND household_id = ? AND checked = 0
      AND EXISTS (
        SELECT 1 FROM daily_moves guarded_move
        WHERE guarded_move.id = ? AND guarded_move.household_id = ?
          AND guarded_move.member_id = ? AND guarded_move.status = 'active'
          AND guarded_move.source_type = 'grocery_item' AND guarded_move.source_id = ?
      )`)
    .bind(
      source.id,
      context.member.household_id,
      move.id,
      move.householdId,
      move.memberId,
      move.source.id,
    )] };
}

async function goalPlan(
  context: HouseholdContext,
  move: DailyMoveV1,
  body: unknown,
  occurredAt: string,
): Promise<DomainPlan> {
  const record = closedBody(body, ["value"]);
  const value = record.value;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 1_000_000) {
    throw new HttpError(400, "Goal progress must be a positive whole number up to 1,000,000.");
  }
  const source = await context.db.prepare(`SELECT id, owner_member_id, ownership_type, active
    FROM goals
    WHERE id = ? AND household_id = ?
      AND (ownership_type = 'shared' OR (ownership_type = 'personal' AND owner_member_id = ?))
    LIMIT 1`).bind(move.source.id, context.member.household_id, context.member.id)
    .first<{ id: string; owner_member_id: string | null; ownership_type: string; active: number }>();
  if (!source) throw new HttpError(404, "Goal not found.");
  if (source.active !== 1) throw new HttpError(409, "That goal is not active.");
  assertMoveOwnership(move, source.ownership_type === "personal" ? source.owner_member_id : null, context.member.id);
  const ownershipSql = move.ownership === "personal"
    ? "ownership_type = 'personal' AND owner_member_id = ?"
    : "ownership_type = 'shared'";
  const ownershipValues = move.ownership === "personal" ? [context.member.id] : [];
  return { statements: [context.db.prepare(`INSERT OR IGNORE INTO goal_entries
    (id, goal_id, member_id, value, occurred_at)
    SELECT ?, id, ?, ?, ? FROM goals
    WHERE id = ? AND household_id = ? AND active = 1 AND ${ownershipSql}
      AND EXISTS (
        SELECT 1 FROM daily_moves guarded_move
        WHERE guarded_move.id = ? AND guarded_move.household_id = ?
          AND guarded_move.member_id = ? AND guarded_move.status = 'active'
          AND guarded_move.source_type = 'goal' AND guarded_move.source_id = ?
      )`)
    .bind(
      move.id,
      context.member.id,
      value,
      occurredAt,
      source.id,
      context.member.household_id,
      ...ownershipValues,
      move.id,
      move.householdId,
      move.memberId,
      move.source.id,
    )] };
}

async function transactionPlan(
  context: HouseholdContext,
  move: DailyMoveV1,
  body: unknown,
  createId: () => string,
): Promise<DomainPlan> {
  const record = closedBody(body, ["categoryId", "createRule"]);
  if (typeof record.categoryId !== "string" || record.categoryId.length < 1 || record.categoryId.length > 128) {
    throw new HttpError(400, "Choose a budget category for this transaction.");
  }
  if (record.createRule !== undefined && typeof record.createRule !== "boolean") {
    throw new HttpError(400, "createRule must be true or false.");
  }
  const plan = await prepareTransactionReviewStatements(
    context.db,
    context.member,
    move.source.id,
    record.categoryId,
    record.createRule === true,
    createId,
    { moveId: move.id, memberId: move.memberId },
  );
  assertMoveOwnership(
    move,
    plan.transaction.account_ownership_type === "personal"
      ? plan.transaction.account_owner_id
      : null,
    context.member.id,
  );
  return { statements: plan.statements };
}

async function bankConnectionPlan(context: HouseholdContext, move: DailyMoveV1, body: unknown): Promise<DomainPlan> {
  closedBody(body, []);
  const source = await context.db.prepare(`SELECT id, owner_member_id, ownership_type, status
    FROM bank_connections
    WHERE id = ? AND household_id = ?
      AND (ownership_type = 'shared' OR (ownership_type = 'personal' AND owner_member_id = ?))
    LIMIT 1`).bind(move.source.id, context.member.household_id, context.member.id)
    .first<{ id: string; owner_member_id: string | null; ownership_type: string; status: string }>();
  if (!source) throw new HttpError(404, "Bank connection not found.");
  assertMoveOwnership(move, source.ownership_type === "personal" ? source.owner_member_id : null, context.member.id);
  if (source.status !== "healthy") {
    throw new HttpError(409, "Repair this connection before completing the move.");
  }
  return { statements: [] };
}

async function domainPlan(
  context: HouseholdContext,
  move: DailyMoveV1,
  body: unknown,
  dependencies: CompletionDependencies,
) {
  switch (move.source.type) {
    case "task": return taskPlan(context, move, body);
    case "grocery_item": return groceryPlan(context, move, body);
    case "goal": return goalPlan(context, move, body, dependencies.occurredAt);
    case "transaction": return transactionPlan(context, move, body, dependencies.createId);
    case "bank_connection": return bankConnectionPlan(context, move, body);
    default: throw new HttpError(409, "This move cannot be completed yet.");
  }
}

function eventInsertStatement(
  db: D1Database,
  move: DailyMoveV1,
  occurredAt: string,
) {
  const event = completedMoveEventV1(move, occurredAt);
  return db.prepare(`INSERT OR IGNORE INTO game_events (
    id, household_id, member_id, event_type, source_type, source_id, visibility,
    payload_version, payload_json, idempotency_key, occurred_at, created_at
  ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE EXISTS (
    SELECT 1 FROM daily_moves
    WHERE id = ? AND household_id = ? AND member_id = ?
      AND status = 'complete' AND completed_at = ?
  )`).bind(
    event.id,
    event.householdId,
    event.memberId,
    event.eventType,
    event.source.type,
    event.source.id,
    event.visibility,
    event.payload.version,
    JSON.stringify(event.payload.data),
    event.idempotencyKey,
    event.occurredAt,
    event.createdAt,
    move.id,
    move.householdId,
    move.memberId,
    occurredAt,
  );
}

function personalProgressStatements(
  db: D1Database,
  move: DailyMoveV1,
  occurredAt: string,
  createId: () => string,
) {
  const eventKey = `daily_move.completed:${move.id}:v1`;
  const totalSql = `SELECT COALESCE(SUM(CAST(json_extract(payload_json, '$.personalPoints') AS INTEGER)), 0)
    FROM game_events
    WHERE household_id = ? AND member_id = ? AND event_type = 'daily_move.completed'
      AND json_extract(payload_json, '$.family') = ?`;
  return [
    db.prepare(`INSERT OR IGNORE INTO progress_balances
      (id, household_id, member_id, dimension, lifetime_points, level, updated_at)
      SELECT ?, ?, ?, ?, 0, 1, ?
      WHERE EXISTS (SELECT 1 FROM game_events WHERE idempotency_key = ?)`)
      .bind(createId(), move.householdId, move.memberId, move.family, occurredAt, eventKey),
    db.prepare(`UPDATE progress_balances
      SET lifetime_points = (${totalSql}),
          level = MIN(1000, CAST(((${totalSql}) / 100) AS INTEGER) + 1),
          updated_at = ?
      WHERE household_id = ? AND member_id = ? AND dimension = ?
        AND EXISTS (SELECT 1 FROM game_events WHERE idempotency_key = ?)`)
      .bind(
        move.householdId, move.memberId, move.family,
        move.householdId, move.memberId, move.family,
        occurredAt, move.householdId, move.memberId, move.family, eventKey,
      ),
  ];
}

function householdProgressStatements(
  db: D1Database,
  move: DailyMoveV1,
  occurredAt: string,
  createId: () => string,
) {
  if (move.ownership !== "shared") return [];
  const eventKey = `daily_move.completed:${move.id}:v1`;
  const totalSql = `SELECT COALESCE(SUM(CAST(json_extract(payload_json, '$.householdPoints') AS INTEGER)), 0)
    FROM game_events
    WHERE household_id = ? AND event_type = 'daily_move.completed'`;
  return [
    db.prepare(`INSERT OR IGNORE INTO progress_balances
      (id, household_id, member_id, dimension, lifetime_points, level, updated_at)
      SELECT ?, ?, NULL, 'household', 0, 1, ?
      WHERE EXISTS (SELECT 1 FROM game_events WHERE idempotency_key = ?)`)
      .bind(createId(), move.householdId, occurredAt, eventKey),
    db.prepare(`UPDATE progress_balances
      SET lifetime_points = (${totalSql}),
          level = MIN(1000, CAST(((${totalSql}) / 100) AS INTEGER) + 1),
          updated_at = ?
      WHERE household_id = ? AND member_id IS NULL AND dimension = 'household'
        AND EXISTS (SELECT 1 FROM game_events WHERE idempotency_key = ?)`)
      .bind(move.householdId, move.householdId, occurredAt, move.householdId, eventKey),
  ];
}

async function authoritativeCompletion(context: HouseholdContext, moveId: string, family: string, shared: boolean) {
  const stored = await readAuthorizedDailyMove(context.db, context.member.household_id, context.member.id, moveId);
  if (!stored) throw new HttpError(404, "Move not found.");
  const event = await readCompletionEvent(context.db, context.member.household_id, context.member.id, moveId);
  const balances = await readAffectedBalances(
    context.db,
    context.member.household_id,
    context.member.id,
    family,
    shared,
  );
  return { move: stored.move, event, balances };
}

function completionGuard(move: DailyMoveV1) {
  switch (move.source.type) {
    case "task":
      return {
        sql: `EXISTS (SELECT 1 FROM tasks WHERE id = ? AND household_id = ? AND status = 'complete'
          AND ${move.ownership === "personal" ? "owner_member_id = ?" : "owner_member_id IS NULL"})`,
        values: move.ownership === "personal"
          ? [move.source.id, move.householdId, move.memberId]
          : [move.source.id, move.householdId],
      };
    case "grocery_item":
      return {
        sql: "EXISTS (SELECT 1 FROM grocery_items WHERE id = ? AND household_id = ? AND checked = 1)",
        values: [move.source.id, move.householdId],
      };
    case "goal":
      return {
        sql: "EXISTS (SELECT 1 FROM goal_entries WHERE id = ? AND goal_id = ? AND member_id = ?)",
        values: [move.id, move.source.id, move.memberId],
      };
    case "transaction":
      return {
        sql: `EXISTS (
          SELECT 1 FROM transactions completion_transaction
          JOIN accounts completion_account ON completion_account.id = completion_transaction.account_id
          WHERE completion_transaction.id = ? AND completion_transaction.household_id = ?
            AND completion_transaction.review_status = 'ready'
            AND completion_account.household_id = ?
            AND ${move.ownership === "personal"
              ? "completion_account.ownership_type = 'personal' AND completion_account.owner_member_id = ?"
              : "completion_account.ownership_type = 'shared'"}
        )`,
        values: move.ownership === "personal"
          ? [move.source.id, move.householdId, move.householdId, move.memberId]
          : [move.source.id, move.householdId, move.householdId],
      };
    case "bank_connection":
      return {
        sql: `EXISTS (SELECT 1 FROM bank_connections
          WHERE id = ? AND household_id = ? AND status = 'healthy'
            AND ${move.ownership === "personal"
              ? "ownership_type = 'personal' AND owner_member_id = ?"
              : "ownership_type = 'shared'"})`,
        values: move.ownership === "personal"
          ? [move.source.id, move.householdId, move.memberId]
          : [move.source.id, move.householdId],
      };
    default:
      throw new HttpError(409, "This move cannot be completed yet.");
  }
}

export async function completeDailyMove(
  context: HouseholdContext,
  moveId: string,
  body: unknown,
  dependencies: CompletionDependencies,
) {
  const stored = await readAuthorizedDailyMove(context.db, context.member.household_id, context.member.id, moveId);
  if (!stored) throw new HttpError(404, "Move not found.");
  if (stored.move.status === "complete") {
    return authoritativeCompletion(context, moveId, stored.move.family, stored.move.ownership === "shared");
  }
  if (stored.move.status !== "active") throw new HttpError(409, "Only an active move can be completed.");

  const plan = await domainPlan(context, stored.move, body, dependencies);
  const guard = completionGuard(stored.move);
  const statements = [
    ...plan.statements,
    context.db.prepare(`UPDATE daily_moves SET status = 'complete', completed_at = ?
      WHERE id = ? AND household_id = ? AND member_id = ? AND status = 'active'
        AND source_type = ? AND source_id = ? AND ${guard.sql}`)
      .bind(
        dependencies.occurredAt,
        stored.move.id,
        stored.move.householdId,
        stored.move.memberId,
        stored.move.source.type,
        stored.move.source.id,
        ...guard.values,
      ),
    eventInsertStatement(context.db, stored.move, dependencies.occurredAt),
    ...personalProgressStatements(context.db, stored.move, dependencies.occurredAt, dependencies.createId),
    ...householdProgressStatements(context.db, stored.move, dependencies.occurredAt, dependencies.createId),
  ];
  await context.db.batch(statements);

  const result = await authoritativeCompletion(
    context,
    moveId,
    stored.move.family,
    stored.move.ownership === "shared",
  );
  if (result.move.status !== "complete" || !result.event) {
    throw new HttpError(409, "The move could not be completed. Refresh and try again.");
  }
  return result;
}

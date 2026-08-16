import { parsePlansAction, parsePlansSnapshot, type PlansActionV1, type PlansSnapshotV1 } from "@homebase/contracts";

import { HttpError } from "../auth/identity.ts";
import type { HouseholdContext } from "../household/types.ts";

type TaskRow = { id: string; title: string; status: string; due_date: string | null; owner_member_id: string | null };
type GroceryRow = { id: string; name: string; checked: number };
type GoalRow = { id: string; name: string; ownership_type: string; tracking_type: string; target_value: number; minimum_value: number | null; current_value: number };

export async function loadPlansSnapshot(context: HouseholdContext, generatedAt: string): Promise<PlansSnapshotV1> {
  const householdId = context.member.household_id;
  const memberId = context.member.id;
  const [tasks, groceries, goals] = await Promise.all([
    context.db.prepare(`SELECT id, title, status, due_date, owner_member_id
      FROM tasks
      WHERE household_id = ? AND (owner_member_id IS NULL OR owner_member_id = ?)
      ORDER BY status ASC, CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC, due_date ASC, id ASC`)
      .bind(householdId, memberId).all<TaskRow>(),
    context.db.prepare(`SELECT id, name, checked
      FROM grocery_items
      WHERE household_id = ?
      ORDER BY checked ASC, created_at ASC, id ASC`)
      .bind(householdId).all<GroceryRow>(),
    context.db.prepare(`SELECT g.id, g.name, g.ownership_type, g.tracking_type,
        g.target_value, g.minimum_value, COALESCE(SUM(ge.value), 0) AS current_value
      FROM goals g
      LEFT JOIN goal_entries ge ON ge.goal_id = g.id
      WHERE g.household_id = ? AND g.active = 1 AND (
        g.ownership_type = 'shared' OR (g.ownership_type = 'personal' AND g.owner_member_id = ?)
      )
      GROUP BY g.id, g.name, g.ownership_type, g.tracking_type, g.target_value, g.minimum_value
      ORDER BY g.ownership_type DESC, g.name ASC, g.id ASC`)
      .bind(householdId, memberId).all<GoalRow>(),
  ]);

  return parsePlansSnapshot({
    contractVersion: 1,
    tasks: tasks.results.map((row) => ({ id: row.id, title: row.title, status: row.status, dueDate: row.due_date, owner: row.owner_member_id === null ? "together" : "you" })),
    groceries: groceries.results.map((row) => ({ id: row.id, name: row.name, checked: Boolean(row.checked) })),
    goals: goals.results.map((row) => ({
      id: row.id,
      name: row.name,
      ownership: row.ownership_type,
      trackingType: row.tracking_type,
      targetValue: row.target_value,
      minimumValue: row.minimum_value,
      currentValue: row.current_value,
    })),
    generatedAt,
  });
}

async function requireTask(context: HouseholdContext, id: string) {
  const task = await context.db.prepare(`SELECT id FROM tasks
    WHERE id = ? AND household_id = ? AND (owner_member_id IS NULL OR owner_member_id = ?)
    LIMIT 1`)
    .bind(id, context.member.household_id, context.member.id).first<{ id: string }>();
  if (!task) throw new HttpError(404, "That plan item was not found.");
}

async function requireGrocery(context: HouseholdContext, id: string) {
  const grocery = await context.db.prepare(`SELECT id FROM grocery_items WHERE id = ? AND household_id = ? LIMIT 1`)
    .bind(id, context.member.household_id).first<{ id: string }>();
  if (!grocery) throw new HttpError(404, "That plan item was not found.");
}

export async function applyPlansAction(
  context: HouseholdContext,
  input: PlansActionV1,
  options: { generatedAt: string; createId: () => string },
): Promise<PlansSnapshotV1> {
  const action = parsePlansAction(input);
  if (action.action === "toggle_task") {
    await requireTask(context, action.id);
    await context.db.prepare(`UPDATE tasks
      SET status = CASE status WHEN 'complete' THEN 'open' ELSE 'complete' END
      WHERE id = ? AND household_id = ? AND (owner_member_id IS NULL OR owner_member_id = ?)`)
      .bind(action.id, context.member.household_id, context.member.id).run();
  } else if (action.action === "toggle_grocery") {
    await requireGrocery(context, action.id);
    await context.db.prepare(`UPDATE grocery_items SET checked = CASE checked WHEN 1 THEN 0 ELSE 1 END
      WHERE id = ? AND household_id = ?`)
      .bind(action.id, context.member.household_id).run();
  } else {
    await context.db.prepare(`INSERT INTO grocery_items (id, household_id, added_by_member_id, name, checked)
      VALUES (?, ?, ?, ?, 0)`)
      .bind(options.createId(), context.member.household_id, context.member.id, action.text).run();
  }
  return loadPlansSnapshot(context, options.generatedAt);
}

export async function toggleTaskForHousehold(db: D1Database, householdId: string, id: string) {
  const result = await db.prepare("UPDATE tasks SET status = CASE status WHEN 'complete' THEN 'open' ELSE 'complete' END WHERE id = ? AND household_id = ?")
    .bind(id, householdId).run();
  return Boolean(result.meta.changes);
}

export async function toggleGroceryForHousehold(db: D1Database, householdId: string, id: string | undefined) {
  const result = await db.prepare("UPDATE grocery_items SET checked = CASE checked WHEN 1 THEN 0 ELSE 1 END WHERE id = ? AND household_id = ?")
    .bind(id, householdId).run();
  return Boolean(result.meta.changes);
}

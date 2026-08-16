// Pure calendar and spending arithmetic. Nothing here touches a request or a
// binding, so the accounting rules can be tested directly.

export function currentBudgetMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function shiftBudgetMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return shifted.toISOString().slice(0, 7);
}

export function monthBounds(month: string) {
  return { start: `${month}-01`, end: `${shiftBudgetMonth(month, 1)}-01` };
}

export async function spendingByCategory(db: D1Database, householdId: string, month: string) {
  const { start, end } = monthBounds(month);
  const rows = (await db.prepare(`SELECT category_id, COALESCE(SUM(amount_cents), 0) AS spent
    FROM (
      SELECT category_id, amount_cents
      FROM transactions
      WHERE household_id = ? AND transaction_date >= ? AND transaction_date < ?
        AND review_status = 'ready' AND is_transfer = 0 AND category_id IS NOT NULL
      UNION ALL
      SELECT ts.category_id, ts.amount_cents
      FROM transaction_splits ts
      JOIN transactions t ON t.id = ts.transaction_id
      WHERE t.household_id = ? AND t.transaction_date >= ? AND t.transaction_date < ?
        AND t.review_status = 'split' AND t.is_transfer = 0
    ) categorized_spending
    GROUP BY category_id`).bind(householdId, start, end, householdId, start, end).all()).results as Array<{ category_id: string; spent: number }>;
  return new Map(rows.map((row) => [row.category_id, Number(row.spent)]));
}

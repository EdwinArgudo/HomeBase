import { HttpError } from "../auth/identity";
import { requireMember } from "./membership";
import { auditEventStatement } from "../observability/audit.ts";
import { currentBudgetMonth, monthBounds, shiftBudgetMonth, spendingByCategory } from "./spending.ts";

export { currentBudgetMonth, monthBounds, shiftBudgetMonth, spendingByCategory };

export type CategoryBudgetRow = {
  id: string;
  owner_member_id: string | null;
  ownership_type: string;
  name: string;
  monthly_limit_cents: number;
  rollover_enabled: number;
};

export type MonthlyBudgetRow = { category_id: string; limit_cents: number; rollover_cents: number };

export function budgetMonthFromRequest(request: Request) {
  const requested = new URL(request.url).searchParams.get("month");
  if (!requested) return currentBudgetMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(requested)) throw new HttpError(400, "Choose a valid budget month.");
  if (requested > currentBudgetMonth()) throw new HttpError(400, "Future budget months are not available yet.");
  return requested;
}

export async function ensureMonthlyBudgets(db: D1Database, householdId: string, month: string, categories: CategoryBudgetRow[]) {
  const existingRows = (await db.prepare("SELECT category_id, limit_cents, rollover_cents FROM monthly_category_budgets WHERE household_id = ? AND budget_month = ?")
    .bind(householdId, month).all()).results as MonthlyBudgetRow[];
  const existing = new Map(existingRows.map((row) => [row.category_id, row]));
  const missing = categories.filter((category) => !existing.has(category.id));
  if (missing.length) {
    const previousMonth = shiftBudgetMonth(month, -1);
    const previousRows = (await db.prepare("SELECT category_id, limit_cents, rollover_cents FROM monthly_category_budgets WHERE household_id = ? AND budget_month = ?")
      .bind(householdId, previousMonth).all()).results as MonthlyBudgetRow[];
    const previousBudgets = new Map(previousRows.map((row) => [row.category_id, row]));
    const previousSpending = await spendingByCategory(db, householdId, previousMonth);
    await db.batch(missing.map((category) => {
      const previous = previousBudgets.get(category.id);
      const previousAvailable = Number(previous?.limit_cents ?? category.monthly_limit_cents) + Number(previous?.rollover_cents ?? 0);
      const rolloverCents = category.rollover_enabled ? Math.max(0, previousAvailable - (previousSpending.get(category.id) ?? 0)) : 0;
      return db.prepare("INSERT OR IGNORE INTO monthly_category_budgets (id, household_id, category_id, budget_month, limit_cents, rollover_cents) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), householdId, category.id, month, category.monthly_limit_cents, rolloverCents);
    }));
  }
  const rows = (await db.prepare("SELECT category_id, limit_cents, rollover_cents FROM monthly_category_budgets WHERE household_id = ? AND budget_month = ?")
    .bind(householdId, month).all()).results as MonthlyBudgetRow[];
  return new Map(rows.map((row) => [row.category_id, row]));
}

export function budgetMonthMetadata(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const current = currentBudgetMonth();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const today = new Date();
  const elapsedDays = month === current ? today.getUTCDate() : daysInMonth;
  return {
    value: month,
    label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1))),
    previous: shiftBudgetMonth(month, -1),
    next: month < current ? shiftBudgetMonth(month, 1) : null,
    isCurrent: month === current,
    daysInMonth,
    elapsedDays,
    daysRemaining: Math.max(0, daysInMonth - elapsedDays),
  };
}

export async function saveBudgetLimits(request: Request, month: string, changes: Array<{ id: string; limitCents: number; rolloverEnabled: boolean }>) {
  const { member, db } = await requireMember(request);
  if (month !== currentBudgetMonth()) throw new HttpError(400, "Past budget months are read-only.");
  if (!changes.length || changes.length > 30) throw new HttpError(400, "Choose at least one fixed limit to update.");

  const seen = new Set<string>();
  for (const change of changes) {
    if (!change.id || seen.has(change.id)) throw new HttpError(400, "Each category can only be updated once.");
    if (!Number.isInteger(change.limitCents) || change.limitCents < 0 || change.limitCents > 100_000_000) {
      throw new HttpError(400, "Enter a valid monthly limit.");
    }
    seen.add(change.id);
  }

  const categoryRows = (await db.prepare(`SELECT id, monthly_limit_cents FROM categories
    WHERE household_id = ? AND archived_at IS NULL AND (ownership_type = 'shared' OR owner_member_id = ?)`)
    .bind(member.household_id, member.id).all()).results as Array<{ id: string; monthly_limit_cents: number }>;
  const categories = new Map(categoryRows.map((category) => [category.id, category]));
  if (changes.some((change) => !categories.has(change.id))) throw new HttpError(404, "One of those budget categories is no longer available.");

  const previousMonth = shiftBudgetMonth(month, -1);
  const previousRows = (await db.prepare("SELECT category_id, limit_cents, rollover_cents FROM monthly_category_budgets WHERE household_id = ? AND budget_month = ?")
    .bind(member.household_id, previousMonth).all()).results as MonthlyBudgetRow[];
  const previousBudgets = new Map(previousRows.map((row) => [row.category_id, row]));
  const previousSpending = await spendingByCategory(db, member.household_id, previousMonth);
  const statements: D1PreparedStatement[] = [];
  for (const change of changes) {
    const category = categories.get(change.id)!;
    statements.push(auditEventStatement(db, {
      householdId: member.household_id,
      memberId: member.id,
      action: "budget_limits.changed",
      subjectType: "budget",
      subjectId: change.id,
      metadata: { month, rolloverEnabled: change.rolloverEnabled },
      occurredAt: new Date().toISOString(),
    }));
    const previous = previousBudgets.get(change.id);
    const previousAvailable = Number(previous?.limit_cents ?? category.monthly_limit_cents) + Number(previous?.rollover_cents ?? 0);
    const rolloverCents = change.rolloverEnabled ? Math.max(0, previousAvailable - (previousSpending.get(change.id) ?? 0)) : 0;
    statements.push(db.prepare(`UPDATE categories SET monthly_limit_cents = ?, rollover_enabled = ?
      WHERE id = ? AND household_id = ? AND archived_at IS NULL AND (ownership_type = 'shared' OR owner_member_id = ?)`)
      .bind(change.limitCents, change.rolloverEnabled ? 1 : 0, change.id, member.household_id, member.id));
    statements.push(db.prepare(`INSERT INTO monthly_category_budgets (id, household_id, category_id, budget_month, limit_cents, rollover_cents)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(category_id, budget_month) DO UPDATE SET limit_cents = excluded.limit_cents, rollover_cents = excluded.rollover_cents, updated_at = CURRENT_TIMESTAMP`)
      .bind(crypto.randomUUID(), member.household_id, change.id, month, change.limitCents, rolloverCents));
  }
  const results = await db.batch(statements);
  // Each change writes an audit row, the category update, then the month row.
  if (results.filter((_, index) => index % 3 === 1).some((result) => !result.meta.changes)) {
    throw new HttpError(404, "One of those budget categories is no longer available.");
  }
}

export async function createBudgetCategory(request: Request, input: { scope: "ours" | "mine"; name: string; limitCents: number; month: string }) {
  const { member, db } = await requireMember(request);
  if (input.month !== currentBudgetMonth()) throw new HttpError(400, "Add categories from the current budget month.");
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 50);
  if (!name) throw new HttpError(400, "Enter a category name.");
  if (!Number.isInteger(input.limitCents) || input.limitCents < 0 || input.limitCents > 100_000_000) {
    throw new HttpError(400, "Enter a valid monthly limit.");
  }

  const existing = input.scope === "ours"
    ? await db.prepare("SELECT id FROM categories WHERE household_id = ? AND ownership_type = 'shared' AND archived_at IS NULL AND LOWER(name) = LOWER(?) LIMIT 1").bind(member.household_id, name).first<{ id: string }>()
    : await db.prepare("SELECT id FROM categories WHERE household_id = ? AND ownership_type = 'personal' AND owner_member_id = ? AND archived_at IS NULL AND LOWER(name) = LOWER(?) LIMIT 1").bind(member.household_id, member.id, name).first<{ id: string }>();
  if (existing) throw new HttpError(409, "That category already exists in this budget.");

  const id = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, member.household_id, input.scope === "mine" ? member.id : null, input.scope === "mine" ? "personal" : "shared", name, input.limitCents),
    db.prepare("INSERT INTO monthly_category_budgets (id, household_id, category_id, budget_month, limit_cents, rollover_cents) VALUES (?, ?, ?, ?, ?, 0)")
      .bind(crypto.randomUUID(), member.household_id, id, input.month, input.limitCents),
  ]);
  return { id, name, spent: 0, limit: input.limitCents / 100, baseLimit: input.limitCents / 100, rollover: 0, rolloverEnabled: false, tone: "sage" };
}

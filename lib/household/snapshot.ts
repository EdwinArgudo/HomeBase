import { env } from "cloudflare:workers";
import {
  budgetMonthFromRequest,
  budgetMonthMetadata,
  ensureMonthlyBudgets,
  monthBounds,
  spendingByCategory,
  type CategoryBudgetRow,
} from "./budgets";
import { relativeScope } from "./authorization";
import { resolveMember } from "./membership";

export async function loadHousehold(request: Request) {
  const { identity, member, db } = await resolveMember(request, true);
  const household = await db.prepare("SELECT * FROM households WHERE id = ?").bind(member.household_id).first<{ id: string; name: string; minimum_mode: number }>();
  const memberRows = (await db.prepare("SELECT id, display_name, email, role, personal_detail_visibility FROM members WHERE household_id = ? ORDER BY created_at").bind(member.household_id).all()).results as Array<{ id: string; display_name: string; email: string; role: string; personal_detail_visibility: string }>;
  const month = budgetMonthFromRequest(request);
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const categoryRows = (await db.prepare("SELECT * FROM categories WHERE household_id = ? AND archived_at IS NULL ORDER BY ownership_type DESC, name").bind(member.household_id).all()).results as CategoryBudgetRow[];
  const monthlyBudgets = await ensureMonthlyBudgets(db, member.household_id, month, categoryRows);
  const spending = await spendingByCategory(db, member.household_id, month);
  const membersById = new Map(memberRows.map((row) => [row.id, row]));
  const toneByName: Record<string, string> = { "Dining out": "coral", Household: "gold", Transportation: "blue", Hobbies: "blue", Clothing: "sage", "Personal care": "gold" };
  const budgets = { ours: [], mine: [], yours: [] } as Record<"ours" | "mine" | "yours", Array<{ id: string; name: string; spent: number; limit: number; baseLimit: number; rollover: number; rolloverEnabled: boolean; tone: string }>>;
  const privatePartnerBudget = { spent: 0, limit: 0, baseLimit: 0, rollover: 0, rolloverEnabled: false };
  for (const row of categoryRows) {
    const monthlyBudget = monthlyBudgets.get(row.id);
    const baseLimit = Number(monthlyBudget?.limit_cents ?? row.monthly_limit_cents) / 100;
    const rollover = Number(monthlyBudget?.rollover_cents ?? 0) / 100;
    const scope = relativeScope(row.ownership_type, row.owner_member_id, member.id);
    const owner = row.owner_member_id ? membersById.get(row.owner_member_id) : null;
    if (scope === "yours" && owner?.personal_detail_visibility !== "shared") {
      privatePartnerBudget.spent += (spending.get(row.id) ?? 0) / 100;
      privatePartnerBudget.baseLimit += baseLimit;
      privatePartnerBudget.rollover += rollover;
      privatePartnerBudget.limit += baseLimit + rollover;
      privatePartnerBudget.rolloverEnabled ||= Boolean(row.rollover_enabled);
      continue;
    }
    budgets[scope].push({ id: row.id, name: row.name, spent: (spending.get(row.id) ?? 0) / 100, limit: baseLimit + rollover, baseLimit, rollover, rolloverEnabled: Boolean(row.rollover_enabled), tone: toneByName[row.name] ?? "sage" });
  }
  if (privatePartnerBudget.limit || privatePartnerBudget.spent) {
    budgets.yours.push({ id: "private-partner-budget", name: "Personal spending", ...privatePartnerBudget, tone: "sage" });
  }

  const transactionRows = (await db.prepare(`SELECT t.*, a.name AS account_name, a.owner_member_id AS account_owner_id,
      c.name AS category_name, m.display_name AS personal_owner_name, m.personal_detail_visibility
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN members m ON m.id = t.personal_member_id
    WHERE t.household_id = ? AND t.transaction_date >= ? AND t.transaction_date < ?
    ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT 50`).bind(member.household_id, monthStart, monthEnd).all()).results as Array<Record<string, string | number | null>>;
  const transactionIds = transactionRows.map((row) => String(row.id));
  const splitRows = transactionIds.length ? (await db.prepare(`SELECT ts.transaction_id, ts.category_id, ts.amount_cents, ts.spending_type, ts.personal_member_id, c.name AS category_name
    FROM transaction_splits ts
    JOIN categories c ON c.id = ts.category_id
    JOIN transactions t ON t.id = ts.transaction_id
    WHERE t.household_id = ?
    ORDER BY ts.transaction_id, ts.id`).bind(member.household_id).all()).results as Array<{ transaction_id: string; category_id: string; amount_cents: number; spending_type: string; personal_member_id: string | null; category_name: string }> : [];
  const splitsByTransaction = new Map<string, typeof splitRows>();
  for (const split of splitRows) {
    if (!transactionIds.includes(split.transaction_id)) continue;
    const existing = splitsByTransaction.get(split.transaction_id) ?? [];
    existing.push(split);
    splitsByTransaction.set(split.transaction_id, existing);
  }
  const ruleRows = (await db.prepare(`SELECT mr.id, mr.merchant_name, mr.match_text, mr.category_id, mr.spending_type, c.name AS category_name
    FROM merchant_rules mr
    JOIN categories c ON c.id = mr.category_id
    WHERE mr.household_id = ? AND mr.created_by_member_id = ? AND c.archived_at IS NULL
    ORDER BY mr.updated_at DESC, mr.merchant_name`).bind(member.household_id, member.id).all()).results as Array<{ id: string; merchant_name: string; match_text: string; category_id: string; spending_type: string; category_name: string }>;
  const pendingInvitation = await db.prepare("SELECT id, email, status FROM invitations WHERE household_id = ? AND status = 'pending' LIMIT 1").bind(member.household_id).first<{ id: string; email: string; status: string }>();
  const connectionRows = (await db.prepare(`SELECT bc.id, bc.owner_member_id, bc.ownership_type, bc.institution_name, bc.status, bc.last_sync_attempt_at, bc.last_synced_at,
      bc.provider_last_successful_update, bc.provider_last_failed_update, bc.last_error_code, bc.last_error_message,
      COUNT(a.id) AS account_count
    FROM bank_connections bc
    LEFT JOIN accounts a ON a.provider_item_id = bc.item_id AND a.household_id = bc.household_id
    WHERE bc.household_id = ?
    GROUP BY bc.id, bc.owner_member_id, bc.ownership_type, bc.institution_name, bc.status, bc.last_sync_attempt_at, bc.last_synced_at,
      bc.provider_last_successful_update, bc.provider_last_failed_update, bc.last_error_code, bc.last_error_message
    ORDER BY bc.created_at`).bind(member.household_id).all()).results as Array<{ id: string; owner_member_id: string | null; ownership_type: string; institution_name: string; status: string; last_sync_attempt_at: string | null; last_synced_at: string | null; provider_last_successful_update: string | null; provider_last_failed_update: string | null; last_error_code: string | null; last_error_message: string | null; account_count: number }>;

  return {
    user: { id: member.id, displayName: identity.displayName, email: identity.email, role: member.role },
    household: { id: household!.id, name: household!.name, minimumMode: Boolean(household!.minimum_mode) },
    budgetMonth: budgetMonthMetadata(month),
    members: memberRows.map((row) => ({ id: row.id, displayName: row.display_name, email: row.email, role: row.role })),
    invitation: pendingInvitation ?? null,
    plaid: {
      configured: Boolean(env.PLAID_CLIENT_ID && env.PLAID_SECRET && env.BANK_TOKEN_ENCRYPTION_KEY),
      environment: env.PLAID_ENV === "production" ? "production" : env.PLAID_ENV === "development" ? "development" : "sandbox",
      connections: connectionRows.filter((row) => row.ownership_type === "shared" || row.owner_member_id === member.id).map((row) => {
        const lastSync = row.last_synced_at ? new Date(`${row.last_synced_at.replace(" ", "T")}Z`).getTime() : 0;
        const ageHours = lastSync ? (Date.now() - lastSync) / 3_600_000 : Number.POSITIVE_INFINITY;
        const health = row.status === "attention" ? "attention" : row.last_error_code ? "warning" : ageHours > 24 ? "stale" : "healthy";
        return {
          id: row.id,
          institutionName: row.institution_name,
          scope: relativeScope(row.ownership_type, row.owner_member_id, member.id),
          status: row.status,
          health,
          healthLabel: health === "attention" ? "Repair needed" : health === "warning" ? "Refresh issue" : health === "stale" ? "Update overdue" : "Up to date",
          healthMessage: row.last_error_message || (health === "stale" ? "Homebase has not refreshed this connection in over 24 hours." : "Automatic refresh is working."),
          lastSyncAttemptAt: row.last_sync_attempt_at,
          lastSyncedAt: row.last_synced_at,
          providerLastSuccessfulUpdate: row.provider_last_successful_update,
          providerLastFailedUpdate: row.provider_last_failed_update,
          accountCount: Number(row.account_count),
        };
      }),
    },
    budgets,
    merchantRules: ruleRows.map((row) => ({
      id: row.id,
      merchant: row.merchant_name,
      matchText: row.match_text,
      categoryId: row.category_id,
      category: row.category_name,
      scope: row.spending_type === "shared" ? "Ours" : "Mine",
    })),
    transactions: transactionRows.map((row) => {
      const spendingType = row.spending_type as string | null;
      const personalId = row.personal_member_id as string | null;
      const belongsToOtherMember = (spendingType === "personal" && personalId !== member.id) || (row.account_owner_id && row.account_owner_id !== member.id);
      const isOtherPrivate = Boolean(belongsToOtherMember && row.personal_detail_visibility !== "shared");
      const scope = spendingType ? relativeScope(spendingType, personalId, member.id) : null;
      const splits = splitsByTransaction.get(String(row.id)) ?? [];
      const splitScopes = new Set(splits.map((split) => relativeScope(split.spending_type, split.personal_member_id, member.id)));
      const splitScope = splitScopes.size === 1 ? [...splitScopes][0] : "mixed";
      return {
        id: row.id,
        merchant: isOtherPrivate ? "Personal purchase" : row.merchant_name,
        detail: `${row.transaction_date} · ${row.account_name}`,
        amount: Number(row.amount_cents) / 100,
        scope: row.review_status === "split" ? splitScope[0].toUpperCase() + splitScope.slice(1) : scope ? scope[0].toUpperCase() + scope.slice(1) : "Unassigned",
        category: isOtherPrivate ? "Private" : row.review_status === "split" ? `Split · ${splits.length} categories` : row.category_name ?? "Needs review",
        mark: isOtherPrivate ? "P" : String(row.merchant_name).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
        reviewStatus: row.review_status,
        isTransfer: Boolean(row.is_transfer),
        editable: !isOtherPrivate && (!row.account_owner_id || row.account_owner_id === member.id) && (!personalId || personalId === member.id),
        splits: isOtherPrivate ? [] : splits.map((split) => ({
          categoryId: split.category_id,
          category: split.category_name,
          scope: relativeScope(split.spending_type, split.personal_member_id, member.id),
          amount: Number(split.amount_cents) / 100,
        })),
      };
    }),
  };
}

export type LedgerScope = "ours" | "mine" | "yours";

export type LedgerCategory = {
  id: string;
  name: string;
  spent: number;
  limit: number;
  /** The limit before rollover; this is the figure a person edits. */
  baseLimit: number;
  rollover: number;
  rolloverEnabled: boolean;
  editable: boolean;
};

export type LedgerTransaction = {
  id: string;
  merchant: string;
  detail: string;
  amount: number;
  scope: string;
  category: string;
  reviewStatus: string;
  editable: boolean;
  /** Moving money between accounts, or paying a card: never spending. */
  isTransfer: boolean;
  /** Money coming back, which reduces its category rather than adding to it. */
  isRefund: boolean;
};

export type LedgerMerchantRule = {
  id: string;
  merchant: string;
  category: string;
  scope: string;
};

export type LedgerConnection = {
  id: string;
  institutionName: string;
  health: string;
  healthLabel: string;
  healthMessage: string;
  /** A connection Plaid can no longer refresh until the person signs in again. */
  needsRepair: boolean;
};

export type LedgerSnapshot = {
  monthLabel: string;
  monthValue: string;
  isCurrentMonth: boolean;
  previousMonth: string;
  /** Null in the current month: there is no next month to look at yet. */
  nextMonth: string | null;
  daysInMonth: number;
  elapsedDays: number;
  daysRemaining: number;
  budgets: Record<LedgerScope, LedgerCategory[]>;
  categoryChoices: { id: string; name: string; scope: LedgerScope }[];
  needsReview: LedgerTransaction[];
  recent: LedgerTransaction[];
  connections: LedgerConnection[];
  plaidConfigured: boolean;
  merchantRules: LedgerMerchantRule[];
};

export type LedgerSplitPart = { categoryId: string; amountCents: number };
export type LedgerLimitChange = { id: string; limitCents: number; rolloverEnabled: boolean };
export type LedgerNewCategory = { scope: "ours" | "mine"; name: string; limitCents: number };

export interface LedgerApi {
  load(month?: string): Promise<LedgerSnapshot>;
  review(transactionId: string, categoryId: string, createRule: boolean): Promise<void>;
  split(transactionId: string, parts: LedgerSplitPart[]): Promise<void>;
  removeMerchantRule(ruleId: string): Promise<void>;
  setTransfer(transactionId: string, isTransfer: boolean): Promise<void>;
  startBankLink(connectionId?: string): Promise<string>;
  saveBankConnection(input: { publicToken: string; ownership: "ours" | "mine"; institutionName: string | null }): Promise<void>;
  syncBankConnection(connectionId: string): Promise<void>;
  saveLimits(month: string, changes: LedgerLimitChange[]): Promise<void>;
  createCategory(month: string, category: LedgerNewCategory): Promise<void>;
}

export class LedgerApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerApiError";
  }
}

const FALLBACK = "Unable to read your ledger.";

function record(input: unknown, fallback: string): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new LedgerApiError(fallback);
  return input as Record<string, unknown>;
}

function text(value: unknown, fallback: string, max = 200): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max) throw new LedgerApiError(fallback);
  return value;
}

function plain(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new LedgerApiError(FALLBACK);
  return input as Record<string, unknown>;
}

function list(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function money(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function count(value: unknown): number {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : 0;
}

// A partner's private spending arrives as one aggregate row with a synthetic
// id, and their own categories are theirs to set, so neither can be edited.
const AGGREGATE_CATEGORY_ID = "private-partner-budget";

function categoryFrom(input: unknown, editableScope: boolean): LedgerCategory {
  const row = plain(input);
  const id = str(row.id);
  const limit = money(row.limit);
  return {
    id,
    name: str(row.name, "Category"),
    spent: money(row.spent),
    limit,
    baseLimit: typeof row.baseLimit === "number" ? money(row.baseLimit) : limit,
    rollover: money(row.rollover),
    rolloverEnabled: row.rolloverEnabled === true,
    editable: editableScope && id.length > 0 && id !== AGGREGATE_CATEGORY_ID,
  };
}

function transactionFrom(input: unknown): LedgerTransaction {
  const row = plain(input);
  return {
    id: str(row.id),
    merchant: str(row.merchant, "Purchase"),
    detail: str(row.detail),
    amount: money(row.amount),
    scope: str(row.scope, "Unassigned"),
    category: str(row.category, "Needs review"),
    reviewStatus: str(row.reviewStatus, "ready"),
    editable: row.editable === true,
    isTransfer: row.isTransfer === true,
    isRefund: money(row.amount) < 0,
  };
}

/** Whole cents, so a split can be checked against the server's exact rule. */
export function amountInCents(amount: number): number {
  return Math.round(amount * 100);
}

// The household payload is the legacy dashboard's shape. Reading it defensively
// keeps the Ledger from breaking on fields it does not care about.
export function snapshotFrom(input: unknown): LedgerSnapshot {
  const data = plain(input);
  const budgetsRaw = plain(data.budgets ?? {});
  const budgets = {
    ours: list(budgetsRaw.ours).map((entry) => categoryFrom(entry, true)),
    mine: list(budgetsRaw.mine).map((entry) => categoryFrom(entry, true)),
    yours: list(budgetsRaw.yours).map((entry) => categoryFrom(entry, false)),
  };
  const budgetMonth = plain(data.budgetMonth ?? {});
  const transactions = list(data.transactions).map(transactionFrom);
  const plaid = plain(data.plaid ?? {});
  return {
    monthLabel: str(budgetMonth.label, "This month"),
    monthValue: str(budgetMonth.value),
    isCurrentMonth: budgetMonth.isCurrent === true,
    previousMonth: str(budgetMonth.previous),
    nextMonth: typeof budgetMonth.next === "string" ? budgetMonth.next : null,
    daysInMonth: count(budgetMonth.daysInMonth),
    elapsedDays: count(budgetMonth.elapsedDays),
    daysRemaining: count(budgetMonth.daysRemaining),
    budgets,
    // A partner's private categories are aggregated by the server and cannot be
    // chosen, so only your own and shared categories are offered.
    categoryChoices: (["ours", "mine"] as const).flatMap((scope) => budgets[scope]
      .filter((category) => category.editable)
      .map((category) => ({ id: category.id, name: category.name, scope }))),
    needsReview: transactions.filter((entry) => entry.reviewStatus === "needs_review" && entry.editable && !entry.isTransfer),
    recent: transactions.slice(0, 8),
    connections: list(plaid.connections).map((entry) => {
      const row = plain(entry);
      return {
        id: str(row.id),
        institutionName: str(row.institutionName, "Bank"),
        health: str(row.health, "healthy"),
        healthLabel: str(row.healthLabel, "Up to date"),
        healthMessage: str(row.healthMessage),
        needsRepair: str(row.health) === "attention" || str(row.health) === "warning",
      };
    }),
    plaidConfigured: plaid.configured === true,
    merchantRules: list(data.merchantRules).map((entry) => {
      const row = plain(entry);
      return {
        id: str(row.id),
        merchant: str(row.merchant, "Merchant"),
        category: str(row.category, "Category"),
        scope: str(row.scope, "Ours"),
      };
    }),
  };
}

async function readJson(response: Response, fallback: string) {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new LedgerApiError(fallback);
  }
  if (!response.ok) {
    const data = body as Record<string, unknown> | null;
    const message = data && typeof data.error === "string" ? data.error.trim() : "";
    throw new LedgerApiError(message.length > 0 && message.length <= 200 ? message : fallback);
  }
  return body;
}

export function createHttpLedgerApi(): LedgerApi {
  return {
    async load(month) {
      const query = month ? `?month=${encodeURIComponent(month)}` : "";
      const response = await fetch(`/api/household${query}`, { headers: { accept: "application/json" } });
      return snapshotFrom(await readJson(response, FALLBACK));
    },
    async review(transactionId, categoryId, createRule) {
      const response = await fetch("/api/transactions/review", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ id: transactionId, categoryId, createRule }),
      });
      await readJson(response, "Unable to file that purchase.");
    },
    async split(transactionId, parts) {
      const response = await fetch("/api/transactions/split", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ id: transactionId, splits: parts }),
      });
      await readJson(response, "Unable to split that purchase.");
    },
    async removeMerchantRule(ruleId) {
      const response = await fetch("/api/merchant-rules", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ action: "delete", id: ruleId }),
      });
      await readJson(response, "Unable to remove that rule.");
    },
    async setTransfer(transactionId, isTransfer) {
      const response = await fetch("/api/transactions/transfer", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ id: transactionId, isTransfer }),
      });
      await readJson(response, "Unable to update that transaction.");
    },
    async startBankLink(connectionId) {
      const fallback = "Plaid Link could not start.";
      const response = await fetch("/api/plaid/link-token", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(connectionId ? { connectionId } : {}),
      });
      const data = record(await readJson(response, fallback), fallback);
      return text(data.linkToken, fallback, 500);
    },
    async saveBankConnection(input) {
      const response = await fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          publicToken: input.publicToken,
          ownership: input.ownership,
          institutionName: input.institutionName ?? undefined,
        }),
      });
      await readJson(response, "That bank connection could not be saved.");
    },
    async syncBankConnection(connectionId) {
      const response = await fetch("/api/plaid/sync", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      await readJson(response, "That bank could not be refreshed.");
    },
    async saveLimits(month, changes) {
      const response = await fetch("/api/budgets/categories", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ action: "update-limits", month, changes }),
      });
      await readJson(response, "Unable to update those limits.");
    },
    async createCategory(month, category) {
      const response = await fetch("/api/budgets/categories", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ action: "create", month, ...category }),
      });
      await readJson(response, "Unable to add that category.");
    },
  };
}

export function createFixtureLedgerApi(): LedgerApi {
  const snapshot: LedgerSnapshot = {
    monthLabel: "August 2026",
    monthValue: "2026-08",
    isCurrentMonth: true,
    previousMonth: "2026-07",
    nextMonth: null,
    daysInMonth: 31,
    elapsedDays: 16,
    daysRemaining: 15,
    budgets: {
      ours: [
        { id: "cat-groceries", name: "Groceries", spent: 286, limit: 600, baseLimit: 600, rollover: 0, rolloverEnabled: false, editable: true },
        { id: "cat-dining", name: "Dining out", spent: 272, limit: 350, baseLimit: 350, rollover: 0, rolloverEnabled: false, editable: true },
      ],
      mine: [{ id: "cat-hobbies", name: "Hobbies", spent: 82, limit: 150, baseLimit: 150, rollover: 0, rolloverEnabled: false, editable: true }],
      yours: [{ id: "private-partner-budget", name: "Personal spending", spent: 140, limit: 300, baseLimit: 300, rollover: 0, rolloverEnabled: false, editable: false }],
    },
    categoryChoices: [
      { id: "cat-groceries", name: "Groceries", scope: "ours" },
      { id: "cat-hobbies", name: "Hobbies", scope: "mine" },
    ],
    needsReview: [{
      id: "txn-costco",
      merchant: "Costco",
      detail: "2026-08-08 · Visa",
      amount: 126.42,
      scope: "Unassigned",
      category: "Needs review",
      reviewStatus: "needs_review",
      editable: true,
      isTransfer: false,
      isRefund: false,
    }],
    recent: [{
      id: "txn-whole-foods",
      merchant: "Whole Foods",
      detail: "2026-08-09 · Visa",
      amount: 84.27,
      scope: "Ours",
      category: "Groceries",
      reviewStatus: "ready",
      editable: true,
      isTransfer: false,
      isRefund: false,
    }, {
      id: "txn-card-payment",
      merchant: "Card payment",
      detail: "2026-08-07 · Checking",
      amount: 400,
      scope: "Ours",
      category: "Transfer",
      reviewStatus: "ready",
      editable: true,
      isTransfer: true,
      isRefund: false,
    }, {
      id: "txn-refund",
      merchant: "Uniqlo refund",
      detail: "2026-08-06 · Visa",
      amount: -32.5,
      scope: "Mine",
      category: "Clothing",
      reviewStatus: "ready",
      editable: true,
      isTransfer: false,
      isRefund: true,
    }],
    connections: [{
      id: "connection-demo",
      institutionName: "Demo Bank",
      health: "healthy",
      healthLabel: "Up to date",
      healthMessage: "Automatic refresh is working.",
      needsRepair: false,
    }],
    plaidConfigured: true,
    merchantRules: [
      { id: "rule-costco", merchant: "Costco", category: "Groceries", scope: "Ours" },
      { id: "rule-mta", merchant: "MTA", category: "Transportation", scope: "Ours" },
    ],
  };
  return {
    async load(month) {
      const viewed = JSON.parse(JSON.stringify(snapshot)) as LedgerSnapshot;
      if (month && month !== snapshot.monthValue) {
        // A closed month has run its course and can no longer be edited.
        return {
          ...viewed,
          monthValue: month,
          monthLabel: "July 2026",
          isCurrentMonth: false,
          previousMonth: "2026-06",
          nextMonth: "2026-08",
          elapsedDays: 31,
          daysRemaining: 0,
          needsReview: [],
        };
      }
      return viewed;
    },
    async review() {
      snapshot.needsReview = [];
    },
    async split() {
      snapshot.needsReview = [];
    },
    async removeMerchantRule(ruleId) {
      snapshot.merchantRules = snapshot.merchantRules.filter((rule) => rule.id !== ruleId);
    },
    async startBankLink() {
      return "link-sandbox-token";
    },
    async saveBankConnection(input) {
      snapshot.plaidConfigured = true;
      snapshot.connections = [...snapshot.connections, {
        id: `connection-${snapshot.connections.length + 1}`,
        institutionName: input.institutionName ?? "Bank",
        health: "healthy",
        healthLabel: "Up to date",
        healthMessage: "Automatic refresh is working.",
        needsRepair: false,
      }];
    },
    async syncBankConnection(connectionId) {
      snapshot.connections = snapshot.connections.map((connection) => (connection.id === connectionId
        ? { ...connection, health: "healthy", healthLabel: "Up to date", healthMessage: "Automatic refresh is working.", needsRepair: false }
        : connection));
    },
    async setTransfer(transactionId, isTransfer) {
      const entry = [...snapshot.needsReview, ...snapshot.recent].find((row) => row.id === transactionId);
      if (entry) entry.isTransfer = isTransfer;
      snapshot.needsReview = snapshot.needsReview.filter((row) => !row.isTransfer);
    },
    async saveLimits(_month, changes) {
      for (const change of changes) {
        const category = [...snapshot.budgets.ours, ...snapshot.budgets.mine].find((entry) => entry.id === change.id);
        if (!category) continue;
        category.baseLimit = change.limitCents / 100;
        category.limit = category.baseLimit + category.rollover;
        category.rolloverEnabled = change.rolloverEnabled;
      }
    },
    async createCategory(_month, category) {
      snapshot.budgets[category.scope === "ours" ? "ours" : "mine"].push({
        id: `cat-${category.name.toLowerCase().replace(/\s+/g, "-")}`,
        name: category.name,
        spent: 0,
        limit: category.limitCents / 100,
        baseLimit: category.limitCents / 100,
        rollover: 0,
        rolloverEnabled: false,
        editable: true,
      });
    },
  };
}

export type LedgerScope = "ours" | "mine" | "yours";

export type LedgerCategory = {
  id: string;
  name: string;
  spent: number;
  limit: number;
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
};

export type LedgerSnapshot = {
  monthLabel: string;
  budgets: Record<LedgerScope, LedgerCategory[]>;
  categoryChoices: { id: string; name: string; scope: LedgerScope }[];
  needsReview: LedgerTransaction[];
  recent: LedgerTransaction[];
  connections: LedgerConnection[];
  plaidConfigured: boolean;
  merchantRules: LedgerMerchantRule[];
};

export type LedgerSplitPart = { categoryId: string; amountCents: number };

export interface LedgerApi {
  load(): Promise<LedgerSnapshot>;
  review(transactionId: string, categoryId: string, createRule: boolean): Promise<void>;
  split(transactionId: string, parts: LedgerSplitPart[]): Promise<void>;
  removeMerchantRule(ruleId: string): Promise<void>;
}

export class LedgerApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerApiError";
  }
}

const FALLBACK = "Unable to read your ledger.";

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

function categoryFrom(input: unknown): LedgerCategory {
  const row = plain(input);
  return {
    id: str(row.id),
    name: str(row.name, "Category"),
    spent: money(row.spent),
    limit: money(row.limit),
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
    ours: list(budgetsRaw.ours).map(categoryFrom),
    mine: list(budgetsRaw.mine).map(categoryFrom),
    yours: list(budgetsRaw.yours).map(categoryFrom),
  };
  const transactions = list(data.transactions).map(transactionFrom);
  const plaid = plain(data.plaid ?? {});
  return {
    monthLabel: str(plain(data.budgetMonth ?? {}).label, "This month"),
    budgets,
    // A partner's private categories are aggregated by the server and cannot be
    // chosen, so only your own and shared categories are offered.
    categoryChoices: (["ours", "mine"] as const).flatMap((scope) => budgets[scope]
      .filter((category) => category.id.length > 0 && category.id !== "private-partner-budget")
      .map((category) => ({ id: category.id, name: category.name, scope }))),
    needsReview: transactions.filter((entry) => entry.reviewStatus === "needs_review" && entry.editable),
    recent: transactions.slice(0, 8),
    connections: list(plaid.connections).map((entry) => {
      const row = plain(entry);
      return {
        id: str(row.id),
        institutionName: str(row.institutionName, "Bank"),
        health: str(row.health, "healthy"),
        healthLabel: str(row.healthLabel, "Up to date"),
        healthMessage: str(row.healthMessage),
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
    async load() {
      const response = await fetch("/api/household", { headers: { accept: "application/json" } });
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
  };
}

export function createFixtureLedgerApi(): LedgerApi {
  const snapshot: LedgerSnapshot = {
    monthLabel: "August",
    budgets: {
      ours: [
        { id: "cat-groceries", name: "Groceries", spent: 286, limit: 600 },
        { id: "cat-dining", name: "Dining out", spent: 272, limit: 350 },
      ],
      mine: [{ id: "cat-hobbies", name: "Hobbies", spent: 82, limit: 150 }],
      yours: [{ id: "private-partner-budget", name: "Personal spending", spent: 140, limit: 300 }],
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
    }],
    connections: [{
      id: "connection-demo",
      institutionName: "Demo Bank",
      health: "healthy",
      healthLabel: "Up to date",
      healthMessage: "Automatic refresh is working.",
    }],
    plaidConfigured: false,
    merchantRules: [
      { id: "rule-costco", merchant: "Costco", category: "Groceries", scope: "Ours" },
      { id: "rule-mta", merchant: "MTA", category: "Transportation", scope: "Ours" },
    ],
  };
  return {
    async load() {
      return JSON.parse(JSON.stringify(snapshot)) as LedgerSnapshot;
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
  };
}

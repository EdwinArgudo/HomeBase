import { env } from "cloudflare:workers";

type Identity = { externalId: string; email: string; displayName: string };
type MemberRow = {
  id: string;
  household_id: string;
  external_user_id: string;
  email: string;
  display_name: string;
  role: "owner" | "member";
  personal_detail_visibility: "private" | "shared";
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeMerchantName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ").slice(0, 120);
}

function identityFromRequest(request: Request): Identity {
  const externalId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");

  if (externalId && email) {
    let displayName = email.split("@")[0];
    if (encodedName && encoding === "percent-encoded-utf-8") {
      try {
        displayName = decodeURIComponent(encodedName);
      } catch {
        // Keep the email-derived fallback when the optional name is malformed.
      }
    }
    return { externalId, email: normalizeEmail(email), displayName };
  }

  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return { externalId: "local-edwin", email: "edwin@homebase.local", displayName: "Edwin" };
  }

  throw new HttpError(401, "Sign in to continue.");
}

function database() {
  if (!env.DB) throw new HttpError(503, "Homebase storage is unavailable.");
  return env.DB;
}

async function ensureSchema() {
  const db = database();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS households (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      timezone TEXT DEFAULT 'America/New_York' NOT NULL,
      minimum_mode INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY NOT NULL,
      household_id TEXT NOT NULL REFERENCES households(id),
      external_user_id TEXT NOT NULL,
      email TEXT DEFAULT '' NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT DEFAULT 'member' NOT NULL,
      personal_detail_visibility TEXT DEFAULT 'private' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_members_household_external_user ON members(household_id, external_user_id)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_members_household_email ON members(household_id, email)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY NOT NULL,
      household_id TEXT NOT NULL REFERENCES households(id),
      email TEXT NOT NULL,
      invited_by_member_id TEXT NOT NULL REFERENCES members(id),
      status TEXT DEFAULT 'pending' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      accepted_at TEXT
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_household_email ON invitations(household_id, email)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_invitations_email_status ON invitations(email, status)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY NOT NULL,
      household_id TEXT NOT NULL REFERENCES households(id),
      owner_member_id TEXT REFERENCES members(id),
      ownership_type TEXT NOT NULL,
      provider_item_id TEXT,
      provider_account_id TEXT,
      institution_name TEXT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      mask TEXT,
      connection_status TEXT DEFAULT 'manual' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_accounts_household_ownership ON accounts(household_id, ownership_type)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_provider_account_id ON accounts(provider_account_id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS bank_connections (
      id TEXT PRIMARY KEY NOT NULL,
      household_id TEXT NOT NULL REFERENCES households(id),
      owner_member_id TEXT REFERENCES members(id),
      ownership_type TEXT NOT NULL,
      provider TEXT DEFAULT 'plaid' NOT NULL,
      item_id TEXT NOT NULL,
      access_token_ciphertext TEXT NOT NULL,
      cursor TEXT,
      institution_name TEXT NOT NULL,
      status TEXT DEFAULT 'healthy' NOT NULL,
      last_synced_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_connections_item_id ON bank_connections(item_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_bank_connections_household ON bank_connections(household_id, status)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      household_id TEXT NOT NULL REFERENCES households(id),
      owner_member_id TEXT REFERENCES members(id),
      ownership_type TEXT NOT NULL,
      name TEXT NOT NULL,
      monthly_limit_cents INTEGER NOT NULL,
      rollover_enabled INTEGER DEFAULT 0 NOT NULL,
      archived_at TEXT
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_categories_household_ownership ON categories(household_id, ownership_type, owner_member_id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY NOT NULL,
      household_id TEXT NOT NULL REFERENCES households(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      provider_transaction_id TEXT,
      merchant_name TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      transaction_date TEXT NOT NULL,
      spending_type TEXT,
      personal_member_id TEXT REFERENCES members(id),
      category_id TEXT REFERENCES categories(id),
      review_status TEXT DEFAULT 'needs_review' NOT NULL,
      is_transfer INTEGER DEFAULT 0 NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_provider_id ON transactions(provider_transaction_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_transactions_household_date ON transactions(household_id, transaction_date)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_transactions_household_review ON transactions(household_id, review_status)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS transaction_splits (
      id TEXT PRIMARY KEY NOT NULL,
      transaction_id TEXT NOT NULL REFERENCES transactions(id),
      category_id TEXT NOT NULL REFERENCES categories(id),
      spending_type TEXT NOT NULL,
      personal_member_id TEXT REFERENCES members(id),
      amount_cents INTEGER NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction_id ON transaction_splits(transaction_id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS merchant_rules (
      id TEXT PRIMARY KEY NOT NULL,
      household_id TEXT NOT NULL REFERENCES households(id),
      created_by_member_id TEXT NOT NULL REFERENCES members(id),
      match_text TEXT NOT NULL,
      merchant_name TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id),
      spending_type TEXT NOT NULL,
      personal_member_id TEXT REFERENCES members(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_rules_member_match ON merchant_rules(household_id, created_by_member_id, match_text)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_merchant_rules_household_match ON merchant_rules(household_id, match_text)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      household_id TEXT NOT NULL REFERENCES households(id),
      owner_member_id TEXT REFERENCES members(id),
      title TEXT NOT NULL,
      status TEXT DEFAULT 'open' NOT NULL,
      due_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_tasks_household_status ON tasks(household_id, status)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS grocery_items (
      id TEXT PRIMARY KEY NOT NULL,
      household_id TEXT NOT NULL REFERENCES households(id),
      added_by_member_id TEXT REFERENCES members(id),
      name TEXT NOT NULL,
      checked INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_grocery_items_household_checked ON grocery_items(household_id, checked)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY NOT NULL,
      household_id TEXT NOT NULL REFERENCES households(id),
      owner_member_id TEXT REFERENCES members(id),
      ownership_type TEXT NOT NULL,
      name TEXT NOT NULL,
      tracking_type TEXT NOT NULL,
      target_value INTEGER NOT NULL,
      minimum_value INTEGER,
      active INTEGER DEFAULT 1 NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_goals_household_active ON goals(household_id, active)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS goal_entries (
      id TEXT PRIMARY KEY NOT NULL,
      goal_id TEXT NOT NULL REFERENCES goals(id),
      member_id TEXT REFERENCES members(id),
      value INTEGER NOT NULL,
      occurred_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_goal_entries_goal_date ON goal_entries(goal_id, occurred_at)`),
  ]);
  await db.prepare("PRAGMA optimize").run();
}

function ids(householdId: string, ownerId: string) {
  return {
    sharedGroceries: `${householdId}-cat-groceries`,
    sharedDining: `${householdId}-cat-dining`,
    sharedHousehold: `${householdId}-cat-household`,
    sharedTransport: `${householdId}-cat-transport`,
    ownerHobbies: `${ownerId}-cat-hobbies`,
    ownerDining: `${ownerId}-cat-dining`,
    ownerClothing: `${ownerId}-cat-clothing`,
    ownerVisa: `${ownerId}-account-visa`,
    jointCard: `${householdId}-account-joint`,
  };
}

async function seedHousehold(householdId: string, ownerId: string) {
  const db = database();
  const seed = ids(householdId, ownerId);
  await db.batch([
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, NULL, 'shared', 'Groceries', 60000)").bind(seed.sharedGroceries, householdId),
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, NULL, 'shared', 'Dining out', 35000)").bind(seed.sharedDining, householdId),
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, NULL, 'shared', 'Household', 20000)").bind(seed.sharedHousehold, householdId),
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, NULL, 'shared', 'Transportation', 25000)").bind(seed.sharedTransport, householdId),
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, ?, 'personal', 'Hobbies', 15000)").bind(seed.ownerHobbies, householdId, ownerId),
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, ?, 'personal', 'Dining out', 7500)").bind(seed.ownerDining, householdId, ownerId),
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, ?, 'personal', 'Clothing', 10000)").bind(seed.ownerClothing, householdId, ownerId),
    db.prepare("INSERT INTO accounts (id, household_id, owner_member_id, ownership_type, institution_name, name, type, mask) VALUES (?, ?, ?, 'personal', 'Demo Bank', 'Visa', 'credit', '4242')").bind(seed.ownerVisa, householdId, ownerId),
    db.prepare("INSERT INTO accounts (id, household_id, owner_member_id, ownership_type, institution_name, name, type, mask) VALUES (?, ?, NULL, 'shared', 'Demo Bank', 'Joint Mastercard', 'credit', '1884')").bind(seed.jointCard, householdId),
    db.prepare("INSERT INTO transactions (id, household_id, account_id, merchant_name, amount_cents, transaction_date, spending_type, category_id, review_status) VALUES (?, ?, ?, 'Whole Foods', 8427, '2026-08-09', 'shared', ?, 'ready')").bind(`${householdId}-txn-whole-foods`, householdId, seed.ownerVisa, seed.sharedGroceries),
    db.prepare("INSERT INTO transactions (id, household_id, account_id, merchant_name, amount_cents, transaction_date, spending_type, category_id, review_status) VALUES (?, ?, ?, 'MTA', 2900, '2026-08-08', 'shared', ?, 'ready')").bind(`${householdId}-txn-mta`, householdId, seed.jointCard, seed.sharedTransport),
    db.prepare("INSERT INTO transactions (id, household_id, account_id, merchant_name, amount_cents, transaction_date, review_status) VALUES (?, ?, ?, 'Costco', 12642, '2026-08-08', 'needs_review')").bind(`${householdId}-txn-costco`, householdId, seed.ownerVisa),
    db.prepare("INSERT INTO tasks (id, household_id, owner_member_id, title, status) VALUES (?, ?, NULL, 'Plan this week''s dinners', 'open')").bind(`${householdId}-task-dinners`, householdId),
    db.prepare("INSERT INTO tasks (id, household_id, owner_member_id, title, status) VALUES (?, ?, ?, 'Take recycling downstairs', 'open')").bind(`${householdId}-task-recycling`, householdId, ownerId),
    db.prepare("INSERT INTO tasks (id, household_id, owner_member_id, title, status) VALUES (?, ?, ?, 'Book annual checkup', 'complete')").bind(`${householdId}-task-checkup`, householdId, ownerId),
    db.prepare("INSERT INTO grocery_items (id, household_id, added_by_member_id, name, checked) VALUES (?, ?, ?, 'Milk', 0)").bind(`${householdId}-grocery-milk`, householdId, ownerId),
    db.prepare("INSERT INTO grocery_items (id, household_id, added_by_member_id, name, checked) VALUES (?, ?, ?, 'Bananas', 0)").bind(`${householdId}-grocery-bananas`, householdId, ownerId),
    db.prepare("INSERT INTO grocery_items (id, household_id, added_by_member_id, name, checked) VALUES (?, ?, ?, 'Dish soap', 1)").bind(`${householdId}-grocery-soap`, householdId, ownerId),
    db.prepare("INSERT INTO goals (id, household_id, owner_member_id, ownership_type, name, tracking_type, target_value, minimum_value) VALUES (?, ?, NULL, 'shared', 'Move together', 'sessions', 3, 1)").bind(`${householdId}-goal-workouts`, householdId),
    db.prepare("INSERT INTO goals (id, household_id, owner_member_id, ownership_type, name, tracking_type, target_value, minimum_value) VALUES (?, ?, ?, 'personal', 'Spanish momentum', 'sessions', 4, 1)").bind(`${householdId}-goal-spanish`, householdId, ownerId),
    db.prepare("INSERT INTO goals (id, household_id, owner_member_id, ownership_type, name, tracking_type, target_value) VALUES (?, ?, NULL, 'shared', 'Weekend getaway', 'amount', 200000)").bind(`${householdId}-goal-savings`, householdId),
  ]);
}

async function seedPersonalCategories(householdId: string, memberId: string) {
  const db = database();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, ?, 'personal', 'Personal care', 15000)").bind(`${memberId}-cat-care`, householdId, memberId),
    db.prepare("INSERT OR IGNORE INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, ?, 'personal', 'Dining out', 7500)").bind(`${memberId}-cat-dining`, householdId, memberId),
    db.prepare("INSERT OR IGNORE INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, ?, 'personal', 'Clothing', 10000)").bind(`${memberId}-cat-clothing`, householdId, memberId),
  ]);
}

async function ensureMember(request: Request, allowOwnerBootstrap: boolean) {
  const identity = identityFromRequest(request);
  await ensureSchema();
  const db = database();
  const existing = await db.prepare("SELECT * FROM members WHERE external_user_id = ? LIMIT 1").bind(identity.externalId).first<MemberRow>();
  if (existing) return { identity, member: existing };

  const invitation = await db.prepare("SELECT * FROM invitations WHERE email = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1").bind(identity.email).first<{ id: string; household_id: string }>();
  if (invitation) {
    const memberId = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO members (id, household_id, external_user_id, email, display_name, role) VALUES (?, ?, ?, ?, ?, 'member')").bind(memberId, invitation.household_id, identity.externalId, identity.email, identity.displayName),
      db.prepare("UPDATE invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP WHERE id = ?").bind(invitation.id),
    ]);
    await seedPersonalCategories(invitation.household_id, memberId);
    const member = await db.prepare("SELECT * FROM members WHERE id = ?").bind(memberId).first<MemberRow>();
    return { identity, member: member! };
  }

  const householdCount = await db.prepare("SELECT COUNT(*) AS count FROM households").first<{ count: number }>();
  if (!allowOwnerBootstrap || Number(householdCount?.count ?? 0) > 0) {
    throw new HttpError(403, "This account has not been invited to the household.");
  }

  const householdId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO households (id, name) VALUES (?, 'Our household')").bind(householdId),
    db.prepare("INSERT INTO members (id, household_id, external_user_id, email, display_name, role) VALUES (?, ?, ?, ?, ?, 'owner')").bind(memberId, householdId, identity.externalId, identity.email, identity.displayName),
  ]);
  await seedHousehold(householdId, memberId);
  const member = await db.prepare("SELECT * FROM members WHERE id = ?").bind(memberId).first<MemberRow>();
  return { identity, member: member! };
}

async function requireMember(request: Request) {
  return ensureMember(request, false);
}

export async function requireHouseholdMember(request: Request) {
  return requireMember(request);
}

export function householdDatabase() {
  return database();
}

function relativeScope(type: string | null, ownerMemberId: string | null, currentMemberId: string) {
  if (type === "shared") return "ours" as const;
  return ownerMemberId === currentMemberId ? "mine" as const : "yours" as const;
}

export async function loadHousehold(request: Request) {
  const { identity, member } = await ensureMember(request, true);
  const db = database();
  const household = await db.prepare("SELECT * FROM households WHERE id = ?").bind(member.household_id).first<{ id: string; name: string; minimum_mode: number }>();
  const memberRows = (await db.prepare("SELECT id, display_name, email, role, personal_detail_visibility FROM members WHERE household_id = ? ORDER BY created_at").bind(member.household_id).all()).results as Array<{ id: string; display_name: string; email: string; role: string; personal_detail_visibility: string }>;
  const categoryRows = (await db.prepare("SELECT * FROM categories WHERE household_id = ? AND archived_at IS NULL ORDER BY ownership_type DESC, name").bind(member.household_id).all()).results as Array<{ id: string; owner_member_id: string | null; ownership_type: string; name: string; monthly_limit_cents: number }>;
  const spendingRows = (await db.prepare(`SELECT category_id, COALESCE(SUM(amount_cents), 0) AS spent
    FROM (
      SELECT category_id, amount_cents
      FROM transactions
      WHERE household_id = ? AND review_status = 'ready' AND is_transfer = 0 AND category_id IS NOT NULL
      UNION ALL
      SELECT ts.category_id, ts.amount_cents
      FROM transaction_splits ts
      JOIN transactions t ON t.id = ts.transaction_id
      WHERE t.household_id = ? AND t.review_status = 'split' AND t.is_transfer = 0
    ) categorized_spending
    GROUP BY category_id`).bind(member.household_id, member.household_id).all()).results as Array<{ category_id: string; spent: number }>;
  const spending = new Map(spendingRows.map((row) => [row.category_id, Number(row.spent)]));
  const membersById = new Map(memberRows.map((row) => [row.id, row]));
  const toneByName: Record<string, string> = { "Dining out": "coral", Household: "gold", Transportation: "blue", Hobbies: "blue", Clothing: "sage", "Personal care": "gold" };
  const budgets = { ours: [], mine: [], yours: [] } as Record<"ours" | "mine" | "yours", Array<{ id: string; name: string; spent: number; limit: number; tone: string }>>;
  const privatePartnerBudget = { spent: 0, limit: 0 };
  for (const row of categoryRows) {
    const scope = relativeScope(row.ownership_type, row.owner_member_id, member.id);
    const owner = row.owner_member_id ? membersById.get(row.owner_member_id) : null;
    if (scope === "yours" && owner?.personal_detail_visibility !== "shared") {
      privatePartnerBudget.spent += (spending.get(row.id) ?? 0) / 100;
      privatePartnerBudget.limit += row.monthly_limit_cents / 100;
      continue;
    }
    budgets[scope].push({ id: row.id, name: row.name, spent: (spending.get(row.id) ?? 0) / 100, limit: row.monthly_limit_cents / 100, tone: toneByName[row.name] ?? "sage" });
  }
  if (privatePartnerBudget.limit || privatePartnerBudget.spent) {
    budgets.yours.push({ id: "private-partner-budget", name: "Personal spending", ...privatePartnerBudget, tone: "sage" });
  }

  const taskRows = (await db.prepare("SELECT * FROM tasks WHERE household_id = ? ORDER BY status, created_at").bind(member.household_id).all()).results as Array<{ id: string; owner_member_id: string | null; title: string; status: string }>;
  const groceryRows = (await db.prepare("SELECT * FROM grocery_items WHERE household_id = ? ORDER BY checked, created_at").bind(member.household_id).all()).results as Array<{ id: string; name: string; checked: number }>;
  const transactionRows = (await db.prepare(`SELECT t.*, a.name AS account_name, a.owner_member_id AS account_owner_id,
      c.name AS category_name, m.display_name AS personal_owner_name, m.personal_detail_visibility
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN members m ON m.id = t.personal_member_id
    WHERE t.household_id = ?
    ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT 20`).bind(member.household_id).all()).results as Array<Record<string, string | number | null>>;
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
  const connectionRows = (await db.prepare(`SELECT bc.id, bc.owner_member_id, bc.ownership_type, bc.institution_name, bc.status, bc.last_synced_at,
      COUNT(a.id) AS account_count
    FROM bank_connections bc
    LEFT JOIN accounts a ON a.provider_item_id = bc.item_id AND a.household_id = bc.household_id
    WHERE bc.household_id = ?
    GROUP BY bc.id, bc.owner_member_id, bc.ownership_type, bc.institution_name, bc.status, bc.last_synced_at
    ORDER BY bc.created_at`).bind(member.household_id).all()).results as Array<{ id: string; owner_member_id: string | null; ownership_type: string; institution_name: string; status: string; last_synced_at: string | null; account_count: number }>;

  return {
    user: { id: member.id, displayName: identity.displayName, email: identity.email, role: member.role },
    household: { id: household!.id, name: household!.name, minimumMode: Boolean(household!.minimum_mode) },
    members: memberRows.map((row) => ({ id: row.id, displayName: row.display_name, email: row.email, role: row.role })),
    invitation: pendingInvitation ?? null,
    plaid: {
      configured: Boolean(env.PLAID_CLIENT_ID && env.PLAID_SECRET && env.BANK_TOKEN_ENCRYPTION_KEY),
      environment: env.PLAID_ENV === "production" ? "production" : env.PLAID_ENV === "development" ? "development" : "sandbox",
      connections: connectionRows.filter((row) => row.ownership_type === "shared" || row.owner_member_id === member.id).map((row) => ({
        id: row.id,
        institutionName: row.institution_name,
        scope: relativeScope(row.ownership_type, row.owner_member_id, member.id),
        status: row.status,
        lastSyncedAt: row.last_synced_at,
        accountCount: Number(row.account_count),
      })),
    },
    budgets,
    tasks: taskRows.map((row) => ({ id: row.id, text: row.title, owner: row.owner_member_id ? (row.owner_member_id === member.id ? "You" : membersById.get(row.owner_member_id)?.display_name ?? "Partner") : "Together", done: row.status === "complete" })),
    groceries: groceryRows.map((row) => ({ id: row.id, text: row.name, checked: Boolean(row.checked) })),
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

export async function saveInvitation(request: Request, emailValue: string) {
  const { member } = await requireMember(request);
  if (member.role !== "owner") throw new HttpError(403, "Only the household owner can invite a partner.");
  const email = normalizeEmail(emailValue);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  if (email === member.email) throw new HttpError(400, "Use your partner’s email address.");
  const db = database();
  const count = await db.prepare("SELECT COUNT(*) AS count FROM members WHERE household_id = ?").bind(member.household_id).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= 2) throw new HttpError(409, "This household already has two members.");
  const invitationId = crypto.randomUUID();
  await db.prepare(`INSERT INTO invitations (id, household_id, email, invited_by_member_id, status)
    VALUES (?, ?, ?, ?, 'pending')
    ON CONFLICT(household_id, email) DO UPDATE SET status = 'pending', invited_by_member_id = excluded.invited_by_member_id, created_at = CURRENT_TIMESTAMP, accepted_at = NULL`)
    .bind(invitationId, member.household_id, email, member.id).run();
  return { id: invitationId, email, status: "pending" };
}

export async function updateTask(request: Request, id: string) {
  const { member } = await requireMember(request);
  const db = database();
  const result = await db.prepare("UPDATE tasks SET status = CASE status WHEN 'complete' THEN 'open' ELSE 'complete' END WHERE id = ? AND household_id = ?").bind(id, member.household_id).run();
  if (!result.meta.changes) throw new HttpError(404, "Task not found.");
}

export async function updateGrocery(request: Request, action: "add" | "toggle", input: { id?: string; text?: string }) {
  const { member } = await requireMember(request);
  const db = database();
  if (action === "add") {
    const text = input.text?.trim();
    if (!text) throw new HttpError(400, "Enter a grocery item.");
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO grocery_items (id, household_id, added_by_member_id, name) VALUES (?, ?, ?, ?)").bind(id, member.household_id, member.id, text.slice(0, 120)).run();
    return { id, text, checked: false };
  }
  const result = await db.prepare("UPDATE grocery_items SET checked = CASE checked WHEN 1 THEN 0 ELSE 1 END WHERE id = ? AND household_id = ?").bind(input.id, member.household_id).run();
  if (!result.meta.changes) throw new HttpError(404, "Grocery item not found.");
  return null;
}

export async function saveBudgetLimits(request: Request, changes: Array<{ id: string; limitCents: number }>) {
  const { member } = await requireMember(request);
  if (!changes.length || changes.length > 30) throw new HttpError(400, "Choose at least one fixed limit to update.");

  const seen = new Set<string>();
  for (const change of changes) {
    if (!change.id || seen.has(change.id)) throw new HttpError(400, "Each category can only be updated once.");
    if (!Number.isInteger(change.limitCents) || change.limitCents < 0 || change.limitCents > 100_000_000) {
      throw new HttpError(400, "Enter a valid monthly limit.");
    }
    seen.add(change.id);
  }

  const db = database();
  const results = await db.batch(changes.map((change) => db.prepare(`UPDATE categories
    SET monthly_limit_cents = ?
    WHERE id = ? AND household_id = ? AND archived_at IS NULL
      AND (ownership_type = 'shared' OR owner_member_id = ?)`)
    .bind(change.limitCents, change.id, member.household_id, member.id)));
  if (results.some((result) => !result.meta.changes)) throw new HttpError(404, "One of those budget categories is no longer available.");
}

export async function createBudgetCategory(request: Request, input: { scope: "ours" | "mine"; name: string; limitCents: number }) {
  const { member } = await requireMember(request);
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 50);
  if (!name) throw new HttpError(400, "Enter a category name.");
  if (!Number.isInteger(input.limitCents) || input.limitCents < 0 || input.limitCents > 100_000_000) {
    throw new HttpError(400, "Enter a valid monthly limit.");
  }

  const db = database();
  const existing = input.scope === "ours"
    ? await db.prepare("SELECT id FROM categories WHERE household_id = ? AND ownership_type = 'shared' AND archived_at IS NULL AND LOWER(name) = LOWER(?) LIMIT 1").bind(member.household_id, name).first<{ id: string }>()
    : await db.prepare("SELECT id FROM categories WHERE household_id = ? AND ownership_type = 'personal' AND owner_member_id = ? AND archived_at IS NULL AND LOWER(name) = LOWER(?) LIMIT 1").bind(member.household_id, member.id, name).first<{ id: string }>();
  if (existing) throw new HttpError(409, "That category already exists in this budget.");

  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, member.household_id, input.scope === "mine" ? member.id : null, input.scope === "mine" ? "personal" : "shared", name, input.limitCents).run();
  return { id, name, spent: 0, limit: input.limitCents / 100, tone: "sage" };
}

async function editableTransaction(db: D1Database, householdId: string, memberId: string, id: string) {
  const transaction = await db.prepare(`SELECT t.id, t.merchant_name, t.amount_cents, t.personal_member_id, a.owner_member_id AS account_owner_id, a.ownership_type AS account_ownership_type
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ? AND t.household_id = ? LIMIT 1`).bind(id, householdId).first<{ id: string; merchant_name: string; amount_cents: number; personal_member_id: string | null; account_owner_id: string | null; account_ownership_type: string }>();
  if (!transaction) throw new HttpError(404, "Transaction not found.");
  if ((transaction.account_ownership_type === "personal" && transaction.account_owner_id !== memberId) || (transaction.personal_member_id && transaction.personal_member_id !== memberId)) {
    throw new HttpError(403, "Only your partner can edit that private transaction.");
  }
  return transaction;
}

export async function reviewTransaction(request: Request, id: string, categoryId: string, createRule = false) {
  const { member } = await requireMember(request);
  const db = database();
  const transaction = await editableTransaction(db, member.household_id, member.id, id);
  const category = await db.prepare("SELECT id, ownership_type, owner_member_id FROM categories WHERE id = ? AND household_id = ? AND archived_at IS NULL LIMIT 1")
    .bind(categoryId, member.household_id).first<{ id: string; ownership_type: "shared" | "personal"; owner_member_id: string | null }>();
  if (!category) throw new HttpError(404, "That budget category is no longer available.");
  if (category.ownership_type === "personal" && category.owner_member_id !== member.id) {
    throw new HttpError(403, "Choose one of your own personal categories.");
  }
  const personalMemberId = category.ownership_type === "shared" ? null : member.id;
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM transaction_splits WHERE transaction_id = ?").bind(id),
    db.prepare("UPDATE transactions SET spending_type = ?, personal_member_id = ?, category_id = ?, review_status = 'ready' WHERE id = ? AND household_id = ?")
      .bind(category.ownership_type, personalMemberId, category.id, id, member.household_id),
  ];

  if (createRule) {
    const matchText = normalizeMerchantName(transaction.merchant_name);
    if (!matchText) throw new HttpError(400, "That merchant name cannot be saved as a rule.");
    statements.push(db.prepare(`INSERT INTO merchant_rules
      (id, household_id, created_by_member_id, match_text, merchant_name, category_id, spending_type, personal_member_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(household_id, created_by_member_id, match_text) DO UPDATE SET
        merchant_name = excluded.merchant_name,
        category_id = excluded.category_id,
        spending_type = excluded.spending_type,
        personal_member_id = excluded.personal_member_id,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(crypto.randomUUID(), member.household_id, member.id, matchText, transaction.merchant_name.slice(0, 120), category.id, category.ownership_type, personalMemberId));

    const candidates = (await db.prepare(`SELECT t.id, t.merchant_name
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.household_id = ? AND t.review_status = 'needs_review'
        AND (a.ownership_type = 'shared' OR a.owner_member_id = ?)
        AND (t.personal_member_id IS NULL OR t.personal_member_id = ?)`)
      .bind(member.household_id, member.id, member.id).all()).results as Array<{ id: string; merchant_name: string }>;
    for (const candidate of candidates) {
      if (candidate.id !== id && normalizeMerchantName(candidate.merchant_name) === matchText) {
        statements.push(db.prepare("UPDATE transactions SET spending_type = ?, personal_member_id = ?, category_id = ?, review_status = 'ready' WHERE id = ? AND household_id = ?")
          .bind(category.ownership_type, personalMemberId, category.id, candidate.id, member.household_id));
      }
    }
  }

  const results = await db.batch(statements);
  if (!results[1]?.meta.changes) throw new HttpError(404, "Transaction not found.");
}

export async function splitTransaction(request: Request, id: string, splits: Array<{ categoryId: string; amountCents: number }>) {
  const { member } = await requireMember(request);
  if (splits.length < 2 || splits.length > 10) throw new HttpError(400, "Split the transaction into two to ten parts.");
  const db = database();
  const transaction = await editableTransaction(db, member.household_id, member.id, id);
  const seen = new Set<string>();
  let total = 0;
  for (const split of splits) {
    if (!split.categoryId || seen.has(split.categoryId)) throw new HttpError(400, "Choose each split category once.");
    if (!Number.isInteger(split.amountCents) || split.amountCents <= 0) throw new HttpError(400, "Every split needs a positive amount.");
    seen.add(split.categoryId);
    total += split.amountCents;
  }
  if (total !== Number(transaction.amount_cents)) throw new HttpError(400, "Split amounts must add up to the transaction total.");

  const categoryRows = (await db.prepare("SELECT id, ownership_type, owner_member_id FROM categories WHERE household_id = ? AND archived_at IS NULL")
    .bind(member.household_id).all()).results as Array<{ id: string; ownership_type: "shared" | "personal"; owner_member_id: string | null }>;
  const categories = new Map(categoryRows.map((category) => [category.id, category]));
  const parts = splits.map((split) => {
    const category = categories.get(split.categoryId);
    if (!category) throw new HttpError(404, "One of those budget categories is no longer available.");
    if (category.ownership_type === "personal" && category.owner_member_id !== member.id) throw new HttpError(403, "Choose only shared categories or your own personal categories.");
    return { ...split, category, personalMemberId: category.ownership_type === "personal" ? member.id : null };
  });
  const spendingTypes = new Set(parts.map((part) => part.category.ownership_type));
  const singleType = spendingTypes.size === 1 ? parts[0].category.ownership_type : null;
  const statements: D1PreparedStatement[] = [db.prepare("DELETE FROM transaction_splits WHERE transaction_id = ?").bind(id)];
  for (const part of parts) {
    statements.push(db.prepare("INSERT INTO transaction_splits (id, transaction_id, category_id, spending_type, personal_member_id, amount_cents) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), id, part.categoryId, part.category.ownership_type, part.personalMemberId, part.amountCents));
  }
  statements.push(db.prepare("UPDATE transactions SET spending_type = ?, personal_member_id = ?, category_id = NULL, review_status = 'split' WHERE id = ? AND household_id = ?")
    .bind(singleType, singleType === "personal" ? member.id : null, id, member.household_id));
  const results = await db.batch(statements);
  if (!results.at(-1)?.meta.changes) throw new HttpError(404, "Transaction not found.");
}

export async function deleteMerchantRule(request: Request, id: string) {
  const { member } = await requireMember(request);
  const result = await database().prepare("DELETE FROM merchant_rules WHERE id = ? AND household_id = ? AND created_by_member_id = ?")
    .bind(id, member.household_id, member.id).run();
  if (!result.meta.changes) throw new HttpError(404, "Merchant rule not found.");
}

export async function setMinimumMode(request: Request, enabled: boolean) {
  const { member } = await requireMember(request);
  await database().prepare("UPDATE households SET minimum_mode = ? WHERE id = ?").bind(enabled ? 1 : 0, member.household_id).run();
}

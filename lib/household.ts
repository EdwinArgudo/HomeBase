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
  const spendingRows = (await db.prepare("SELECT category_id, COALESCE(SUM(amount_cents), 0) AS spent FROM transactions WHERE household_id = ? AND review_status = 'ready' AND is_transfer = 0 GROUP BY category_id").bind(member.household_id).all()).results as Array<{ category_id: string; spent: number }>;
  const spending = new Map(spendingRows.map((row) => [row.category_id, Number(row.spent)]));
  const toneByName: Record<string, string> = { "Dining out": "coral", Household: "gold", Transportation: "blue", Hobbies: "blue", Clothing: "sage", "Personal care": "gold" };
  const budgets = { ours: [], mine: [], yours: [] } as Record<"ours" | "mine" | "yours", Array<{ id: string; name: string; spent: number; limit: number; tone: string }>>;
  for (const row of categoryRows) {
    const scope = relativeScope(row.ownership_type, row.owner_member_id, member.id);
    budgets[scope].push({ id: row.id, name: row.name, spent: (spending.get(row.id) ?? 0) / 100, limit: row.monthly_limit_cents / 100, tone: toneByName[row.name] ?? "sage" });
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
  const pendingInvitation = await db.prepare("SELECT id, email, status FROM invitations WHERE household_id = ? AND status = 'pending' LIMIT 1").bind(member.household_id).first<{ id: string; email: string; status: string }>();

  const membersById = new Map(memberRows.map((row) => [row.id, row]));
  return {
    user: { id: member.id, displayName: identity.displayName, email: identity.email, role: member.role },
    household: { id: household!.id, name: household!.name, minimumMode: Boolean(household!.minimum_mode) },
    members: memberRows.map((row) => ({ id: row.id, displayName: row.display_name, email: row.email, role: row.role })),
    invitation: pendingInvitation ?? null,
    budgets,
    tasks: taskRows.map((row) => ({ id: row.id, text: row.title, owner: row.owner_member_id ? (row.owner_member_id === member.id ? "You" : membersById.get(row.owner_member_id)?.display_name ?? "Partner") : "Together", done: row.status === "complete" })),
    groceries: groceryRows.map((row) => ({ id: row.id, text: row.name, checked: Boolean(row.checked) })),
    transactions: transactionRows.map((row) => {
      const spendingType = row.spending_type as string | null;
      const personalId = row.personal_member_id as string | null;
      const isOtherPrivate = spendingType === "personal" && personalId !== member.id && row.personal_detail_visibility !== "shared";
      const scope = spendingType ? relativeScope(spendingType, personalId, member.id) : null;
      return {
        id: row.id,
        merchant: isOtherPrivate ? "Personal purchase" : row.merchant_name,
        detail: `${row.transaction_date} · ${row.account_name}`,
        amount: Number(row.amount_cents) / 100,
        scope: scope ? scope[0].toUpperCase() + scope.slice(1) : "Unassigned",
        category: isOtherPrivate ? "Private" : row.category_name ?? "Needs review",
        mark: isOtherPrivate ? "P" : String(row.merchant_name).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
        reviewStatus: row.review_status,
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

export async function reviewTransaction(request: Request, id: string, choice: "ours" | "mine") {
  const { member } = await requireMember(request);
  const db = database();
  const category = choice === "ours"
    ? await db.prepare("SELECT id FROM categories WHERE household_id = ? AND ownership_type = 'shared' AND name = 'Household' LIMIT 1").bind(member.household_id).first<{ id: string }>()
    : await db.prepare("SELECT id FROM categories WHERE household_id = ? AND owner_member_id = ? AND ownership_type = 'personal' ORDER BY name LIMIT 1").bind(member.household_id, member.id).first<{ id: string }>();
  if (!category) throw new HttpError(409, "Create a matching budget category first.");
  const result = await db.prepare("UPDATE transactions SET spending_type = ?, personal_member_id = ?, category_id = ?, review_status = 'ready' WHERE id = ? AND household_id = ?")
    .bind(choice === "ours" ? "shared" : "personal", choice === "ours" ? null : member.id, category.id, id, member.household_id).run();
  if (!result.meta.changes) throw new HttpError(404, "Transaction not found.");
}

export async function setMinimumMode(request: Request, enabled: boolean) {
  const { member } = await requireMember(request);
  await database().prepare("UPDATE households SET minimum_mode = ? WHERE id = ?").bind(enabled ? 1 : 0, member.household_id).run();
}

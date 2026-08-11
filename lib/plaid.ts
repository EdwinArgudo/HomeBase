import { env } from "cloudflare:workers";
import { householdDatabase, HttpError, normalizeMerchantName, requireHouseholdMember } from "./household";

type Ownership = "ours" | "mine";
type PlaidEnvironment = "sandbox" | "development" | "production";
type PlaidAccount = {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type: string;
  subtype?: string | null;
};
type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  merchant_name?: string | null;
  name: string;
  amount: number;
  date: string;
  personal_finance_category?: { primary?: string | null; detailed?: string | null } | null;
};

class PlaidApiError extends HttpError {
  constructor(public code: string, message: string) {
    super(502, message);
  }
}

function plaidEnvironment(): PlaidEnvironment {
  return env.PLAID_ENV === "production" ? "production" : env.PLAID_ENV === "development" ? "development" : "sandbox";
}

function requirePlaidConfig() {
  if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET || !env.BANK_TOKEN_ENCRYPTION_KEY) {
    throw new HttpError(503, "Plaid is ready to connect once its credentials are added.");
  }
  return {
    clientId: env.PLAID_CLIENT_ID,
    secret: env.PLAID_SECRET,
    environment: plaidEnvironment(),
    encryptionKey: env.BANK_TOKEN_ENCRYPTION_KEY,
  };
}

async function plaidPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const config = requirePlaidConfig();
  const response = await fetch(`https://${config.environment}.plaid.com${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "PLAID-CLIENT-ID": config.clientId,
      "PLAID-SECRET": config.secret,
      "Plaid-Version": "2020-09-14",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json() as T & { error_code?: string; display_message?: string | null; error_message?: string };
  if (!response.ok) {
    const code = data.error_code ?? "PLAID_REQUEST_FAILED";
    const message = data.display_message || (code === "INVALID_API_KEYS" ? "Plaid rejected the configured credentials." : "Plaid could not complete that request. Try again in a moment.");
    throw new PlaidApiError(code, message);
  }
  return data;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new HttpError(503, "The bank-token encryption key is invalid.");
  }
}

async function encryptionKey() {
  const raw = base64ToBytes(requirePlaidConfig().encryptionKey);
  if (raw.byteLength !== 32) throw new HttpError(503, "The bank-token encryption key must be a 32-byte base64 value.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptAccessToken(accessToken: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(accessToken));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptAccessToken(ciphertext: string) {
  const [ivValue, encryptedValue] = ciphertext.split(".");
  if (!ivValue || !encryptedValue) throw new HttpError(503, "A saved bank connection could not be decrypted.");
  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(ivValue) }, await encryptionKey(), base64ToBytes(encryptedValue));
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new HttpError(503, "A saved bank connection could not be decrypted.");
  }
}

export async function createPlaidLinkToken(request: Request) {
  const { member } = await requireHouseholdMember(request);
  const body: Record<string, unknown> = {
    client_name: "Homebase",
    language: "en",
    country_codes: ["US"],
    user: { client_user_id: member.id },
    products: ["transactions"],
    transactions: { days_requested: 90 },
    account_filters: {
      depository: { account_subtypes: ["all"] },
      credit: { account_subtypes: ["all"] },
    },
  };
  if (env.PLAID_REDIRECT_URI?.trim()) body.redirect_uri = env.PLAID_REDIRECT_URI.trim();
  const result = await plaidPost<{ link_token: string; expiration: string }>("/link/token/create", body);
  return { linkToken: result.link_token, expiration: result.expiration, environment: plaidEnvironment() };
}

function homebaseAccountType(account: PlaidAccount): "checking" | "savings" | "credit" | "cash" {
  if (account.type === "credit") return "credit";
  if (account.type === "depository" && account.subtype === "savings") return "savings";
  if (account.type === "depository") return "checking";
  return "cash";
}

async function runStatementBatches(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 50) {
    await db.batch(statements.slice(index, index + 50));
  }
}

function suggestedCategoryName(transaction: PlaidTransaction) {
  const primary = transaction.personal_finance_category?.primary ?? "";
  const detailed = transaction.personal_finance_category?.detailed ?? "";
  const merchant = `${transaction.merchant_name ?? ""} ${transaction.name}`.toLowerCase();
  if (detailed.includes("GROCERIES") || /whole foods|trader joe|costco|aldi|kroger|safeway/.test(merchant)) return "Groceries";
  if (primary === "FOOD_AND_DRINK") return "Dining out";
  if (primary === "TRANSPORTATION") return "Transportation";
  if (primary === "HOME_IMPROVEMENT" || detailed.includes("HOME_IMPROVEMENT")) return "Household";
  return null;
}

async function fetchTransactionUpdates(accessToken: string, originalCursor: string | null) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let cursor = originalCursor;
    const added: PlaidTransaction[] = [];
    const modified: PlaidTransaction[] = [];
    const removed: Array<{ transaction_id: string }> = [];
    try {
      for (let page = 0; page < 20; page += 1) {
        const result = await plaidPost<{ added: PlaidTransaction[]; modified: PlaidTransaction[]; removed: Array<{ transaction_id: string }>; next_cursor: string; has_more: boolean }>("/transactions/sync", {
          access_token: accessToken,
          cursor: cursor ?? undefined,
          count: 500,
          options: { personal_finance_category_version: "v2" },
        });
        added.push(...result.added);
        modified.push(...result.modified);
        removed.push(...result.removed);
        cursor = result.next_cursor;
        if (!result.has_more) return { added, modified, removed, cursor };
      }
      throw new PlaidApiError("SYNC_PAGE_LIMIT", "That bank has more updates than Homebase can import at once.");
    } catch (error) {
      if (!(error instanceof PlaidApiError) || error.code !== "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" || attempt === 1) throw error;
    }
  }
  throw new PlaidApiError("SYNC_FAILED", "Plaid could not finish syncing this bank.");
}

async function syncConnectionWithToken(db: D1Database, connection: { id: string; household_id: string; owner_member_id: string | null; ownership_type: "personal" | "shared"; cursor: string | null }, accessToken: string) {
  const updates = await fetchTransactionUpdates(accessToken, connection.cursor);
  const accountRows = (await db.prepare("SELECT id, provider_account_id FROM accounts WHERE household_id = ? AND provider_item_id = (SELECT item_id FROM bank_connections WHERE id = ?)")
    .bind(connection.household_id, connection.id).all()).results as Array<{ id: string; provider_account_id: string }>;
  const accountIds = new Map(accountRows.map((row) => [row.provider_account_id, row.id]));
  const categoryRows = (await db.prepare("SELECT id, name, ownership_type, owner_member_id FROM categories WHERE household_id = ? AND archived_at IS NULL")
    .bind(connection.household_id).all()).results as Array<{ id: string; name: string; ownership_type: string; owner_member_id: string | null }>;
  const categoryIds = new Map(categoryRows
    .filter((row) => connection.ownership_type === "shared" ? row.ownership_type === "shared" : row.ownership_type === "personal" && row.owner_member_id === connection.owner_member_id)
    .map((row) => [row.name.toLowerCase(), row.id]));
  const ruleRows = (await db.prepare(`SELECT mr.match_text, mr.category_id, mr.spending_type, mr.personal_member_id, mr.created_by_member_id
    FROM merchant_rules mr
    JOIN categories c ON c.id = mr.category_id AND c.archived_at IS NULL
    WHERE mr.household_id = ?
    ORDER BY mr.updated_at DESC`).bind(connection.household_id).all()).results as Array<{ match_text: string; category_id: string; spending_type: "personal" | "shared"; personal_member_id: string | null; created_by_member_id: string }>;
  const merchantRules = new Map<string, typeof ruleRows[number]>();
  for (const rule of ruleRows) {
    const applies = connection.ownership_type === "shared" ? rule.spending_type === "shared" : rule.created_by_member_id === connection.owner_member_id;
    if (applies && !merchantRules.has(rule.match_text)) merchantRules.set(rule.match_text, rule);
  }

  const statements: D1PreparedStatement[] = [];
  for (const transaction of [...updates.added, ...updates.modified]) {
    const accountId = accountIds.get(transaction.account_id);
    if (!accountId) continue;
    const primary = transaction.personal_finance_category?.primary ?? "";
    const isTransfer = primary.startsWith("TRANSFER_");
    const merchantName = (transaction.merchant_name || transaction.name || "Imported transaction").slice(0, 120);
    const merchantRule = merchantRules.get(normalizeMerchantName(merchantName));
    const categoryName = suggestedCategoryName(transaction);
    const categoryId = merchantRule?.category_id ?? (categoryName ? categoryIds.get(categoryName.toLowerCase()) ?? null : null);
    const reviewStatus = isTransfer || categoryId ? "ready" : "needs_review";
    const spendingType = merchantRule?.spending_type ?? connection.ownership_type;
    const personalMemberId = merchantRule ? merchantRule.personal_member_id : spendingType === "personal" ? connection.owner_member_id : null;
    statements.push(db.prepare(`INSERT INTO transactions
      (id, household_id, account_id, provider_transaction_id, merchant_name, amount_cents, transaction_date, spending_type, personal_member_id, category_id, review_status, is_transfer, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_transaction_id) DO UPDATE SET
        account_id = excluded.account_id,
        merchant_name = excluded.merchant_name,
        amount_cents = excluded.amount_cents,
        transaction_date = excluded.transaction_date,
        spending_type = COALESCE(transactions.spending_type, excluded.spending_type),
        personal_member_id = COALESCE(transactions.personal_member_id, excluded.personal_member_id),
        category_id = COALESCE(transactions.category_id, excluded.category_id),
        review_status = CASE WHEN transactions.review_status = 'needs_review' AND excluded.category_id IS NOT NULL THEN 'ready' ELSE transactions.review_status END,
        is_transfer = excluded.is_transfer,
        note = excluded.note`)
      .bind(crypto.randomUUID(), connection.household_id, accountId, transaction.transaction_id, merchantName, Math.round(transaction.amount * 100), transaction.date, spendingType, personalMemberId, categoryId, reviewStatus, isTransfer ? 1 : 0, transaction.personal_finance_category?.detailed ?? null));
  }
  for (const removed of updates.removed) {
    statements.push(db.prepare("DELETE FROM transaction_splits WHERE transaction_id = (SELECT id FROM transactions WHERE household_id = ? AND provider_transaction_id = ?)").bind(connection.household_id, removed.transaction_id));
    statements.push(db.prepare("DELETE FROM transactions WHERE household_id = ? AND provider_transaction_id = ?").bind(connection.household_id, removed.transaction_id));
  }
  await runStatementBatches(db, statements);
  await db.prepare("UPDATE bank_connections SET cursor = ?, status = 'healthy', last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND household_id = ?")
    .bind(updates.cursor, connection.id, connection.household_id).run();
  return { added: updates.added.length, modified: updates.modified.length, removed: updates.removed.length };
}

export async function exchangePlaidPublicToken(request: Request, input: { publicToken: string; ownership: Ownership; institutionName?: string }) {
  const { member } = await requireHouseholdMember(request);
  if (!input.publicToken || input.publicToken.length > 1000) throw new HttpError(400, "Plaid did not return a valid connection token.");
  if (input.ownership !== "ours" && input.ownership !== "mine") throw new HttpError(400, "Choose whether this account is Mine or Ours.");

  const exchange = await plaidPost<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: input.publicToken });
  const accountData = await plaidPost<{ accounts: PlaidAccount[]; item?: { institution_name?: string | null } }>("/accounts/get", { access_token: exchange.access_token });
  const db = householdDatabase();
  const existing = await db.prepare("SELECT id, household_id FROM bank_connections WHERE item_id = ? LIMIT 1").bind(exchange.item_id).first<{ id: string; household_id: string }>();
  if (existing && existing.household_id !== member.household_id) throw new HttpError(409, "That Plaid connection already belongs to another household.");

  const connectionId = existing?.id ?? crypto.randomUUID();
  const institutionName = (input.institutionName || accountData.item?.institution_name || "Connected institution").trim().slice(0, 100);
  const ownershipType = input.ownership === "ours" ? "shared" : "personal";
  const ownerMemberId = input.ownership === "mine" ? member.id : null;
  const encryptedAccessToken = await encryptAccessToken(exchange.access_token);
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO bank_connections
      (id, household_id, owner_member_id, ownership_type, provider, item_id, access_token_ciphertext, institution_name, status)
      VALUES (?, ?, ?, ?, 'plaid', ?, ?, ?, 'healthy')
      ON CONFLICT(item_id) DO UPDATE SET
        owner_member_id = excluded.owner_member_id,
        ownership_type = excluded.ownership_type,
        access_token_ciphertext = excluded.access_token_ciphertext,
        institution_name = excluded.institution_name,
        status = 'healthy',
        updated_at = CURRENT_TIMESTAMP
      WHERE bank_connections.household_id = excluded.household_id`)
      .bind(connectionId, member.household_id, ownerMemberId, ownershipType, exchange.item_id, encryptedAccessToken, institutionName),
  ];
  for (const account of accountData.accounts) {
    statements.push(db.prepare(`INSERT INTO accounts
      (id, household_id, owner_member_id, ownership_type, provider_item_id, provider_account_id, institution_name, name, type, mask, connection_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'healthy')
      ON CONFLICT(provider_account_id) DO UPDATE SET
        owner_member_id = excluded.owner_member_id,
        ownership_type = excluded.ownership_type,
        institution_name = excluded.institution_name,
        name = excluded.name,
        type = excluded.type,
        mask = excluded.mask,
        connection_status = 'healthy'
      WHERE accounts.household_id = excluded.household_id`)
      .bind(crypto.randomUUID(), member.household_id, ownerMemberId, ownershipType, exchange.item_id, account.account_id, institutionName, (account.name || account.official_name || "Account").slice(0, 100), homebaseAccountType(account), account.mask ?? null));
  }
  await runStatementBatches(db, statements);
  const sync = await syncConnectionWithToken(db, { id: connectionId, household_id: member.household_id, owner_member_id: ownerMemberId, ownership_type: ownershipType, cursor: null }, exchange.access_token);
  return { connectionId, institutionName, accountCount: accountData.accounts.length, sync };
}

export async function syncPlaidConnection(request: Request, connectionId: string) {
  const { member } = await requireHouseholdMember(request);
  const db = householdDatabase();
  const connection = await db.prepare("SELECT id, household_id, owner_member_id, ownership_type, access_token_ciphertext, cursor FROM bank_connections WHERE id = ? AND household_id = ? LIMIT 1")
    .bind(connectionId, member.household_id).first<{ id: string; household_id: string; owner_member_id: string | null; ownership_type: "personal" | "shared"; access_token_ciphertext: string; cursor: string | null }>();
  if (!connection) throw new HttpError(404, "That bank connection was not found.");
  try {
    return await syncConnectionWithToken(db, connection, await decryptAccessToken(connection.access_token_ciphertext));
  } catch (error) {
    if (error instanceof PlaidApiError && (error.code === "ITEM_LOGIN_REQUIRED" || error.code === "PENDING_DISCONNECT")) {
      await db.prepare("UPDATE bank_connections SET status = 'attention', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND household_id = ?").bind(connection.id, member.household_id).run();
    }
    throw error;
  }
}

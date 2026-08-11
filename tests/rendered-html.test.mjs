import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Homebase product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Homebase — Your shared household rhythm<\/title>/i);
  assert.match(html, /Good morning,[\s\S]{0,40}Edwin/);
  assert.match(html, /Your household is on track/);
  assert.match(html, /Open apartment display/);
  assert.match(html, /Money snapshot/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("publishes PWA and social metadata", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/i);
  assert.match(html, /property="og:title" content="Homebase"/i);
  assert.match(html, /property="og:image" content="http:\/\/localhost(?::3000)?\/og\.png"/i);
  assert.match(html, /name="twitter:card" content="summary_large_image"/i);
});

test("authenticates before touching household storage", async () => {
  const source = await readFile(new URL("../lib/household.ts", import.meta.url), "utf8");
  const ensureMember = source.slice(source.indexOf("async function ensureMember"), source.indexOf("async function requireMember"));
  assert.ok(ensureMember.indexOf("identityFromRequest(request)") < ensureMember.indexOf("ensureSchema()"));
  assert.match(source, /WHERE id = \? AND household_id = \?/);
});

test("protects personal budgets while allowing exact categorization", async () => {
  const source = await readFile(new URL("../lib/household.ts", import.meta.url), "utf8");
  const budgetUpdates = source.slice(source.indexOf("export async function saveBudgetLimits"), source.indexOf("export async function createBudgetCategory"));
  const transactionReview = source.slice(source.indexOf("export async function reviewTransaction"), source.indexOf("export async function setMinimumMode"));

  assert.match(budgetUpdates, /ownership_type = 'shared' OR owner_member_id = \?/);
  assert.match(transactionReview, /category\.owner_member_id !== member\.id/);
  assert.match(transactionReview, /category_id = \?/);
});

test("keeps Plaid credentials server-side and encrypts saved access tokens", async () => {
  const plaidSource = await readFile(new URL("../lib/plaid.ts", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0002_light_nightshade.sql", import.meta.url), "utf8");

  assert.match(plaidSource, /AES-GCM/);
  assert.match(plaidSource, /PLAID-SECRET/);
  assert.match(plaidSource, /access_token_ciphertext/);
  assert.doesNotMatch(pageSource, /PLAID_SECRET|BANK_TOKEN_ENCRYPTION_KEY/);
  assert.match(pageSource, /https:\/\/cdn\.plaid\.com\/link\/v2\/stable\/link-initialize\.js/);
  assert.match(migration, /CREATE TABLE `bank_connections`/);
  assert.doesNotMatch(migration, /`access_token` text/);
});

test("persists merchant rules and exact transaction splits", async () => {
  const householdSource = await readFile(new URL("../lib/household.ts", import.meta.url), "utf8");
  const plaidSource = await readFile(new URL("../lib/plaid.ts", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0003_moaning_puppet_master.sql", import.meta.url), "utf8");

  assert.match(migration, /CREATE TABLE `merchant_rules`/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_merchant_rules_member_match`/);
  assert.match(householdSource, /FROM transaction_splits ts[\s\S]*review_status = 'split'/);
  assert.match(householdSource, /Split amounts must add up to the transaction total/);
  assert.match(householdSource, /created_by_member_id = \?/);
  assert.match(plaidSource, /merchantRules\.get\(normalizeMerchantName\(merchantName\)\)/);
  assert.match(pageSource, /Remember this merchant/);
  assert.match(pageSource, /Save split/);
  assert.doesNotMatch(pageSource, /localStorage|sessionStorage/);
});

test("scopes budgets to durable calendar months with optional rollover", async () => {
  const householdSource = await readFile(new URL("../lib/household.ts", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0004_flimsy_wither.sql", import.meta.url), "utf8");

  assert.match(migration, /CREATE TABLE `monthly_category_budgets`/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_monthly_category_budgets_category_month`/);
  assert.match(householdSource, /transaction_date >= \? AND transaction_date < \?/);
  assert.match(householdSource, /rolloverCents = category\.rollover_enabled \? Math\.max/);
  assert.match(householdSource, /Past budget months are read-only/);
  assert.match(pageSource, /Previous budget month/);
  assert.match(pageSource, /Roll over unused funds next month/);
  assert.match(pageSource, /daysRemaining/);
});

test("automatically refreshes Plaid connections and surfaces repairable health", async () => {
  const householdSource = await readFile(new URL("../lib/household.ts", import.meta.url), "utf8");
  const plaidSource = await readFile(new URL("../lib/plaid.ts", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const autoSyncRoute = await readFile(new URL("../app/api/plaid/auto-sync/route.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0005_lonely_shiva.sql", import.meta.url), "utf8");

  assert.match(migration, /ADD `last_sync_attempt_at`/);
  assert.match(migration, /ADD `last_error_code`/);
  assert.match(plaidSource, /last_sync_attempt_at < datetime\('now', '-4 hours'\)/);
  assert.match(plaidSource, /provider_last_successful_update/);
  assert.match(plaidSource, /body\.access_token = await decryptAccessToken/);
  assert.match(autoSyncRoute, /autoSyncPlaidConnections/);
  assert.match(householdSource, /healthLabel/);
  assert.match(pageSource, /Auto refresh on/);
  assert.match(pageSource, /Repair connection/);
});

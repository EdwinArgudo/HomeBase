import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
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

async function sourceFiles(relativeDirectory) {
  const directory = new URL(relativeDirectory, import.meta.url);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const url = new URL(entry.name, directory.href.endsWith("/") ? directory : new URL(`${directory.href}/`));
    if (entry.isDirectory()) return sourceFiles(`${relativeDirectory}${entry.name}/`);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [url] : [];
  }));
  return files.flat();
}

test("server-renders the Homebase product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Homebase — Your shared household rhythm<\/title>/i);
  assert.match(html, /Good morning,[\s\S]{0,40}Edwin/);
  assert.match(html, /On track/);
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
  assert.ok(ensureMember.indexOf("identityFromRequest(request)") < ensureMember.indexOf("ensureStorageReady()"));
  assert.match(source, /WHERE id = \? AND household_id = \?/);
});

test("keeps schema ownership in Drizzle and checked-in migrations", async () => {
  const runtimeDirectories = ["../app/", "../build/", "../db/", "../lib/", "../worker/"];
  const runtimeFiles = (await Promise.all(runtimeDirectories.map(sourceFiles))).flat();
  const runtimeSources = await Promise.all(runtimeFiles
    .filter((url) => !url.pathname.endsWith("/db/schema.ts"))
    .map(async (url) => `${url.pathname}\n${await readFile(url, "utf8")}`));
  const runtimeSource = runtimeSources.join("\n");
  const drizzleConfig = await readFile(new URL("../drizzle.config.ts", import.meta.url), "utf8");
  const packaging = await readFile(new URL("../build/sites-vite-plugin.ts", import.meta.url), "utf8");

  assert.doesNotMatch(runtimeSource, /\b(?:CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE)\b/i);
  assert.match(drizzleConfig, /schema:\s*"\.\/db\/schema\.ts"/);
  assert.match(drizzleConfig, /out:\s*"\.\/drizzle"/);
  assert.match(packaging, /const drizzleSource = resolve\(root, "drizzle"\)/);
  assert.match(packaging, /cp\(drizzleSource/);
});

test("checks migration readiness without mutating or leaking storage details", async () => {
  const readinessUrl = new URL("../db/readiness.ts", import.meta.url);
  readinessUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { assertDatabaseSchemaReady, DatabaseSchemaNotReadyError } = await import(readinessUrl.href);
  const statements = [];
  const readyDatabase = {
    prepare(statement) {
      statements.push(statement);
      return { first: async () => null };
    },
  };

  await assertDatabaseSchemaReady(readyDatabase);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /last_sync_attempt_at/);
  assert.doesNotMatch(statements[0], /\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE|PRAGMA)\b/i);

  const unavailableDatabase = {
    prepare() {
      return { first: async () => { throw new Error("provider SQL detail"); } };
    },
  };
  await assert.rejects(
    assertDatabaseSchemaReady(unavailableDatabase),
    (error) => error instanceof DatabaseSchemaNotReadyError
      && error.message === "Homebase storage needs an update."
      && !error.message.includes("provider SQL detail"),
  );
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
  assert.match(pageSource, /refresh automatically/);
  assert.match(pageSource, /Repair connection/);
});

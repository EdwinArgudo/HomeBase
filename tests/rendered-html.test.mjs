import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
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

test("server-renders the Vue Homebase host at root and every direct product route", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Homebase — Your shared household rhythm<\/title>/i);
  assert.match(html, /Loading Homebase/);
  assert.match(html, /\/homebase-app\/assets\/app\.css/);
  assert.match(html, /\/homebase-app\/assets\/app\.js/);
  assert.doesNotMatch(html, /Good morning,[\s\S]{0,40}Edwin|Money snapshot|Preview|Current Homebase/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);

  for (const path of ["/plans", "/ledger", "/adventures", "/persona", "/household", "/display", "/living-game/ledger"]) {
    const deepLink = await render(path);
    assert.equal(deepLink.status, 200, path);
    assert.match(await deepLink.text(), /\/homebase-app\/assets\/app\.js/, path);
  }
});

test("uses only the Vue stylesheet across root and direct routes", async () => {
  const stylesheets = (html) => html.match(/<link rel="stylesheet"[^>]*>/g) ?? [];
  for (const path of ["/", "/plans", "/living-game"]) {
    assert.deepEqual(
      stylesheets(await (await render(path)).text()).map((link) => link.match(/href="([^"]+)"/)?.[1]),
      ["/homebase-app/assets/app.css"],
    );
  }

  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(layout, /globals\.css/);
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
  const identityUrl = new URL("../lib/auth/identity.ts", import.meta.url);
  identityUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { HttpError, identityBeforeStorage } = await import(identityUrl.href);
  let storageOpened = false;
  const request = new Request("https://homebase.example/");

  await assert.rejects(
    identityBeforeStorage(request, async () => {
      storageOpened = true;
      return {};
    }),
    (error) => error instanceof HttpError && error.status === 401,
  );
  assert.equal(storageOpened, false);

  const membershipSource = await readFile(new URL("../lib/household/membership.ts", import.meta.url), "utf8");
  assert.match(membershipSource, /identityBeforeStorage\(request, readyHouseholdDatabase\)/);
});

test("moves task and grocery access to the scoped Plans boundary", async () => {
  const plansService = await readFile(new URL("../lib/plans/service.ts", import.meta.url), "utf8");
  assert.match(plansService, /household_id = \? AND \(owner_member_id IS NULL OR owner_member_id = \?\)/);
  assert.match(plansService, /UPDATE tasks[\s\S]*household_id = \?[\s\S]*owner_member_id = \?/);
  assert.match(plansService, /UPDATE grocery_items[\s\S]*household_id = \?/);
  await assert.rejects(readFile(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8"));
  await assert.rejects(readFile(new URL("../app/api/groceries/route.ts", import.meta.url), "utf8"));
});

test("denies cross-household and partner-private ownership in shared authorization", async () => {
  const authorizationUrl = new URL("../lib/household/authorization.ts", import.meta.url);
  authorizationUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { belongsToHousehold, ownsPersonalRecord } = await import(authorizationUrl.href);
  const member = { id: "member-current", household_id: "household-current" };

  assert.equal(belongsToHousehold(member, { household_id: "household-partner" }), false);
  assert.equal(ownsPersonalRecord(member, "member-partner"), false);
  assert.equal(ownsPersonalRecord(member, member.id), true);
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
  const budgetUpdates = await readFile(new URL("../lib/household/budgets.ts", import.meta.url), "utf8");
  const transactionReview = await readFile(new URL("../lib/household/transactions.ts", import.meta.url), "utf8");
  const transactionReviewPlan = await readFile(new URL("../lib/household/transaction-review.ts", import.meta.url), "utf8");

  assert.match(budgetUpdates, /ownership_type = 'shared' OR owner_member_id = \?/);
  assert.match(transactionReviewPlan, /ownsPersonalRecord\(member, category\.owner_member_id\)/);
  assert.match(transactionReviewPlan, /category_id = \?/);
  assert.match(transactionReview, /prepareTransactionReviewStatements/);
});

test("keeps Plaid credentials server-side and encrypts saved access tokens", async () => {
  const plaidSource = await readFile(new URL("../lib/plaid.ts", import.meta.url), "utf8");
  const plaidClientSource = await readFile(new URL("../apps/living-game/src/client/api/plaidLink.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0002_light_nightshade.sql", import.meta.url), "utf8");

  assert.match(plaidSource, /AES-GCM/);
  assert.match(plaidSource, /PLAID-SECRET/);
  assert.match(plaidSource, /access_token_ciphertext/);
  assert.doesNotMatch(plaidClientSource, /PLAID_SECRET|BANK_TOKEN_ENCRYPTION_KEY/);
  assert.match(plaidClientSource, /https:\/\/cdn\.plaid\.com\/link\/v2\/stable\/link-initialize\.js/);
  assert.match(migration, /CREATE TABLE `bank_connections`/);
  assert.doesNotMatch(migration, /`access_token` text/);
});

test("persists merchant rules and exact transaction splits", async () => {
  const budgetSource = await readFile(new URL("../lib/household/spending.ts", import.meta.url), "utf8");
  const transactionsSource = await readFile(new URL("../lib/household/transactions.ts", import.meta.url), "utf8");
  const plaidSource = await readFile(new URL("../lib/plaid.ts", import.meta.url), "utf8");
  const ledgerView = await readFile(new URL("../apps/living-game/src/client/views/LedgerView.vue", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0003_moaning_puppet_master.sql", import.meta.url), "utf8");

  assert.match(migration, /CREATE TABLE `merchant_rules`/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_merchant_rules_member_match`/);
  assert.match(budgetSource, /FROM transaction_splits ts[\s\S]*review_status = 'split'/);
  assert.match(transactionsSource, /Split amounts must add up to the transaction total/);
  assert.match(transactionsSource, /created_by_member_id = \?/);
  assert.match(plaidSource, /merchantRules\.get\(normalizeMerchantName\(merchantName\)\)/);
  assert.match(ledgerView, /Remember this merchant/);
  assert.match(ledgerView, /Save split/);
  assert.doesNotMatch(ledgerView, /localStorage|sessionStorage/);
});

test("scopes budgets to durable calendar months with optional rollover", async () => {
  const budgetSource = [
    await readFile(new URL("../lib/household/budgets.ts", import.meta.url), "utf8"),
    await readFile(new URL("../lib/household/spending.ts", import.meta.url), "utf8"),
  ].join("\n");
  const ledgerView = await readFile(new URL("../apps/living-game/src/client/views/LedgerView.vue", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0004_flimsy_wither.sql", import.meta.url), "utf8");

  assert.match(migration, /CREATE TABLE `monthly_category_budgets`/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_monthly_category_budgets_category_month`/);
  assert.match(budgetSource, /transaction_date >= \? AND transaction_date < \?/);
  assert.match(budgetSource, /rolloverCents = category\.rollover_enabled \? Math\.max/);
  assert.match(budgetSource, /Past budget months are read-only/);
  assert.match(ledgerView, /aria-label="Previous month"/);
  assert.match(ledgerView, /Carry over what is left/);
  assert.match(ledgerView, /daysRemaining/);
});

test("automatically refreshes Plaid connections and surfaces repairable health", async () => {
  const snapshotSource = await readFile(new URL("../lib/household/snapshot.ts", import.meta.url), "utf8");
  const plaidSource = await readFile(new URL("../lib/plaid.ts", import.meta.url), "utf8");
  const ledgerStore = await readFile(new URL("../apps/living-game/src/client/stores/ledger.ts", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../apps/living-game/src/client/App.vue", import.meta.url), "utf8");
  const autoSyncRoute = await readFile(new URL("../app/api/plaid/auto-sync/route.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0005_lonely_shiva.sql", import.meta.url), "utf8");

  assert.match(migration, /ADD `last_sync_attempt_at`/);
  assert.match(migration, /ADD `last_error_code`/);
  assert.match(plaidSource, /last_sync_attempt_at < datetime\('now', '-4 hours'\)/);
  assert.match(plaidSource, /provider_last_successful_update/);
  assert.match(plaidSource, /body\.access_token = await decryptAccessToken/);
  assert.match(autoSyncRoute, /autoSyncPlaidConnections/);
  assert.match(snapshotSource, /healthLabel/);
  assert.match(ledgerStore, /\/api\/plaid\/auto-sync|autoSync/);
  assert.match(ledgerStore, /visibilitychange/);
  assert.match(appSource, /startAutoSync/);
});

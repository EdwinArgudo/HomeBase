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

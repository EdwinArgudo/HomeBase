import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
async function source(path) { return readFile(new URL(path, root), "utf8"); }

test("mounts the Vue product shell at the root catch-all and retires legacy pages", async () => {
  const hostPage = await source("app/[[...path]]/page.tsx");
  assert.match(hostPage, /id="app"/);
  assert.match(hostPage, /\/homebase-app\/assets\/app\.css/);
  assert.match(hostPage, /\/homebase-app\/assets\/app\.js/);
  assert.doesNotMatch(hostPage, /Preview|Current Homebase|legacy/i);
  await assert.rejects(access(new URL("app/page.tsx", root)));
  await assert.rejects(access(new URL("app/globals.css", root)));
  await assert.rejects(access(new URL("app/living-game/[[...path]]/page.tsx", root)));
});

test("wires deterministic ignored Vue client assets into root build and development", async () => {
  const [rootPackage, vuePackage, embeddedConfig, gitignore, eslintConfig, runner] = await Promise.all([
    source("package.json"),
    source("apps/living-game/package.json"),
    source("apps/living-game/vite.embedded.config.ts"),
    source(".gitignore"),
    source("eslint.config.mjs"),
    source("scripts/dev.mjs"),
  ]);
  assert.match(rootPackage, /npm run build:homebase-client &&/);
  assert.match(rootPackage, /"dev:homebase-client"/);
  assert.match(vuePackage, /vite build --config vite\.embedded\.config\.ts/);
  assert.match(vuePackage, /vite build --watch --config vite\.embedded\.config\.ts/);
  assert.match(embeddedConfig, /outDir: "\.\.\/\.\.\/public\/homebase-app"/);
  assert.match(embeddedConfig, /entryFileNames: "assets\/app\.js"/);
  assert.match(gitignore, /\/public\/homebase-app\//);
  assert.match(eslintConfig, /public\/homebase-app\/\*\*/);
  assert.match(runner, /"homebase-client", "dev:homebase-client"/);
  assert.match(runner, /"homebase", "dev:app"/);
});

test("uses the root router base, live APIs, compatibility redirects, and no preview shell", async () => {
  const [router, embeddedConfig, app, plansApi, dailyApi, progressApi, personaApi, worldApi, rewardsApi] = await Promise.all([
    source("apps/living-game/src/client/router.ts"),
    source("apps/living-game/vite.embedded.config.ts"),
    source("apps/living-game/src/client/App.vue"),
    source("apps/living-game/src/client/api/plans.ts"),
    source("apps/living-game/src/client/api/dailyMoves.ts"),
    source("apps/living-game/src/client/api/progress.ts"),
    source("apps/living-game/src/client/api/persona.ts"),
    source("apps/living-game/src/client/api/world.ts"),
    source("apps/living-game/src/client/api/rewards.ts"),
  ]);
  assert.match(router, /createWebHistory\(import\.meta\.env\.VITE_ROUTER_BASE/);
  assert.match(router, /path: "\/living-game\/:pathMatch/);
  assert.match(router, /path: "\/:pathMatch/);
  assert.match(embeddedConfig, /VITE_ROUTER_BASE.*"\/"/s);
  for (const flag of ["MOVES", "PROGRESS", "PERSONA", "WORLD", "REWARDS", "PLANS"]) {
    assert.match(embeddedConfig, new RegExp(`VITE_LIVE_${flag}.*"true"`, "s"));
  }
  assert.match(plansApi, /\/api\/plans/);
  assert.match(dailyApi, /\/api\/game\/moves\?date=/);
  assert.match(progressApi, /\/api\/game\/progress/);
  assert.match(personaApi, /\/api\/personas\/current/);
  assert.match(worldApi, /\/api\/world/);
  assert.match(rewardsApi, /\/api\/game\/rewards/);
  assert.doesNotMatch(app, /Preview|Current Homebase|Fixture data/);
});

test("keeps exact API routes outside the product-page catch-all", async () => {
  const routes = [
    "app/api/plans/route.ts",
    "app/api/household/route.ts",
    "app/api/plaid/auto-sync/route.ts",
    "app/api/game/progress/route.ts",
  ];
  for (const route of routes) assert.match(await source(route), /export (?:async function|const) (?:GET|POST)/);
});

test("keeps Plans data out of the transitional Ledger household payload", async () => {
  const snapshot = await source("lib/household/snapshot.ts");
  assert.doesNotMatch(snapshot, /FROM tasks|FROM grocery_items|\btasks:\s|\bgroceries:\s/);
  const plans = await source("lib/plans/service.ts");
  assert.match(plans, /FROM tasks/);
  assert.match(plans, /FROM grocery_items/);
});

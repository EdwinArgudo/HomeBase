import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("keeps legacy Homebase at root and mounts Vue only in the living-game catch-all", async () => {
  const [legacyPage, hostPage] = await Promise.all([
    source("app/page.tsx"),
    source("app/living-game/[[...path]]/page.tsx"),
  ]);

  assert.match(legacyPage, /export default function Home\(\)/);
  assert.doesNotMatch(legacyPage, /living-game-preview/);
  assert.match(hostPage, /id="app"/);
  assert.match(hostPage, /\/living-game-preview\/assets\/app\.css/);
  assert.match(hostPage, /\/living-game-preview\/assets\/app\.js/);
});

test("wires deterministic ignored Vue preview assets into the root build", async () => {
  const [rootPackage, vuePackage, previewConfig, gitignore, eslintConfig] = await Promise.all([
    source("package.json"),
    source("apps/living-game/package.json"),
    source("apps/living-game/vite.preview.config.ts"),
    source(".gitignore"),
    source("eslint.config.mjs"),
  ]);

  assert.match(rootPackage, /build:living-game-preview/);
  assert.match(rootPackage, /npm run build:living-game-preview &&/);
  assert.match(vuePackage, /vite build --config vite\.preview\.config\.ts/);
  assert.match(previewConfig, /outDir: "\.\.\/\.\.\/public\/living-game-preview"/);
  assert.match(previewConfig, /entryFileNames: "assets\/app\.js"/);
  assert.match(previewConfig, /"assets\/app\.css"/);
  assert.match(gitignore, /\/public\/living-game-preview\//);
  assert.match(eslintConfig, /public\/living-game-preview\/\*\*/);
});

test("uses the living-game router base and identifies live member data inside the preview world", async () => {
  const [router, previewConfig, app, api, progressApi, personaApi, displayView] = await Promise.all([
    source("apps/living-game/src/client/router.ts"),
    source("apps/living-game/vite.preview.config.ts"),
    source("apps/living-game/src/client/App.vue"),
    source("apps/living-game/src/client/api/dailyMoves.ts"),
    source("apps/living-game/src/client/api/progress.ts"),
    source("apps/living-game/src/client/api/persona.ts"),
    source("apps/living-game/src/client/views/DisplayView.vue"),
  ]);

  assert.match(router, /createWebHistory\(import\.meta\.env\.VITE_ROUTER_BASE/);
  assert.match(previewConfig, /VITE_ROUTER_BASE.*"\/living-game\/"/s);
  assert.match(previewConfig, /VITE_LIVE_MOVES.*"true"/s);
  assert.match(previewConfig, /VITE_LIVE_PROGRESS.*"true"/s);
  assert.match(previewConfig, /VITE_LIVE_PERSONA.*"true"/s);
  assert.match(app, />Preview</);
  assert.match(app, /Live moves \+ progress \+ persona · Preview world/);
  assert.match(api, /\/api\/game\/moves\?date=/);
  assert.doesNotMatch(api, /dailyMoveFixtures/);
  assert.match(progressApi, /\/api\/game\/progress/);
  assert.doesNotMatch(progressApi, /progressFixtures/);
  assert.match(personaApi, /\/api\/personas\/current/);
  assert.doesNotMatch(personaApi, /worldFixture|fixturePersona/);
  assert.match(app, /href="\/"/);
  assert.match(app, />Current Homebase</);
  assert.match(displayView, /No personal or financial details are shown/);
});

import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import { createHttpDailyMovesApi } from "./api/dailyMoves";
import { createFixtureDailyMovesApi } from "./api/fixtureDailyMoves";
import { createFixtureProgressApi } from "./api/fixtureProgress";
import { createHttpProgressApi } from "./api/progress";
import { createFixturePersonaApi } from "./api/fixturePersona";
import { createHttpPersonaApi } from "./api/persona";
import { createFixtureWorldApi } from "./api/fixtureWorld";
import { createHttpWorldApi } from "./api/world";
import { createFixtureRewardsApi } from "./api/fixtureRewards";
import { createHttpRewardsApi } from "./api/rewards";
import { createFixtureSettingsApi, createHttpSettingsApi } from "./api/settings";
import { createFixtureHouseholdApi, createHttpHouseholdApi } from "./api/household";
import { createFixtureDisplayWorldApi, createHttpDisplayWorldApi } from "./api/displayWorld";
import { createFixtureLedgerApi, createHttpLedgerApi } from "./api/ledger";
import { createBrowserPlaidLinkLauncher, createFixturePlaidLinkLauncher } from "./api/plaidLink";
import { router } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import { configureProgressRuntime } from "./stores/progress";
import { configurePersonaRuntime } from "./stores/persona";
import { configureWorldRuntime } from "./stores/world";
import { configureRewardsRuntime } from "./stores/rewards";
import { configureSettingsRuntime } from "./stores/settings";
import { configureHouseholdRuntime } from "./stores/household";
import { configureDisplayWorldRuntime } from "./stores/displayWorld";
import { configureLedgerRuntime } from "./stores/ledger";
import "./styles.css";

const liveMoves = import.meta.env.VITE_LIVE_MOVES === "true";
const liveProgress = import.meta.env.VITE_LIVE_PROGRESS === "true";
const livePersona = import.meta.env.VITE_LIVE_PERSONA === "true";
const liveWorld = import.meta.env.VITE_LIVE_WORLD === "true";
const liveRewards = import.meta.env.VITE_LIVE_REWARDS === "true";
configureDailyMovesRuntime({
  api: liveMoves ? createHttpDailyMovesApi() : createFixtureDailyMovesApi(),
  now: () => new Date(),
});
configureProgressRuntime({
  api: liveProgress ? createHttpProgressApi() : createFixtureProgressApi(),
});
configurePersonaRuntime({
  api: livePersona ? createHttpPersonaApi() : createFixturePersonaApi(),
});
configureWorldRuntime({
  api: liveWorld ? createHttpWorldApi() : createFixtureWorldApi(),
});
configureRewardsRuntime({ api: liveRewards ? createHttpRewardsApi() : createFixtureRewardsApi() });
configureSettingsRuntime({ api: liveMoves ? createHttpSettingsApi() : createFixtureSettingsApi() });
configureHouseholdRuntime({ api: liveWorld ? createHttpHouseholdApi() : createFixtureHouseholdApi() });
configureDisplayWorldRuntime({ api: liveWorld ? createHttpDisplayWorldApi() : createFixtureDisplayWorldApi() });
configureLedgerRuntime({
  api: liveWorld ? createHttpLedgerApi() : createFixtureLedgerApi(),
  openPlaidLink: liveWorld ? createBrowserPlaidLinkLauncher() : createFixturePlaidLinkLauncher(),
});

createApp(App).use(createPinia()).use(router).mount("#app");

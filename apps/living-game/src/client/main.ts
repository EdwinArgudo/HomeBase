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
import { router } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import { configureProgressRuntime } from "./stores/progress";
import { configurePersonaRuntime } from "./stores/persona";
import { configureWorldRuntime } from "./stores/world";
import "./styles.css";

const liveMoves = import.meta.env.VITE_LIVE_MOVES === "true";
const liveProgress = import.meta.env.VITE_LIVE_PROGRESS === "true";
const livePersona = import.meta.env.VITE_LIVE_PERSONA === "true";
const liveWorld = import.meta.env.VITE_LIVE_WORLD === "true";
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

createApp(App).use(createPinia()).use(router).mount("#app");

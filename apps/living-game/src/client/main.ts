import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import { createHttpDailyMovesApi } from "./api/dailyMoves";
import { createFixtureDailyMovesApi } from "./api/fixtureDailyMoves";
import { createFixtureProgressApi } from "./api/fixtureProgress";
import { createHttpProgressApi } from "./api/progress";
import { createFixturePersonaApi } from "./api/fixturePersona";
import { createHttpPersonaApi } from "./api/persona";
import { router } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import { configureProgressRuntime } from "./stores/progress";
import { configurePersonaRuntime } from "./stores/persona";
import "./styles.css";

const liveMoves = import.meta.env.VITE_LIVE_MOVES === "true";
const liveProgress = import.meta.env.VITE_LIVE_PROGRESS === "true";
const livePersona = import.meta.env.VITE_LIVE_PERSONA === "true";
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

createApp(App).use(createPinia()).use(router).mount("#app");

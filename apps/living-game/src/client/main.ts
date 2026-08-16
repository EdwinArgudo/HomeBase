import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import { createHttpDailyMovesApi } from "./api/dailyMoves";
import { createFixtureDailyMovesApi } from "./api/fixtureDailyMoves";
import { createFixtureProgressApi } from "./api/fixtureProgress";
import { createHttpProgressApi } from "./api/progress";
import { router } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import { configureProgressRuntime } from "./stores/progress";
import "./styles.css";

const liveMoves = import.meta.env.VITE_LIVE_MOVES === "true";
const liveProgress = import.meta.env.VITE_LIVE_PROGRESS === "true";
configureDailyMovesRuntime({
  api: liveMoves ? createHttpDailyMovesApi() : createFixtureDailyMovesApi(),
  now: () => new Date(),
});
configureProgressRuntime({
  api: liveProgress ? createHttpProgressApi() : createFixtureProgressApi(),
});

createApp(App).use(createPinia()).use(router).mount("#app");

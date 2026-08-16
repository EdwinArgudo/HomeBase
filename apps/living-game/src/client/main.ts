import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import { createHttpDailyMovesApi } from "./api/dailyMoves";
import { createFixtureDailyMovesApi } from "./api/fixtureDailyMoves";
import { router } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import "./styles.css";

const liveMoves = import.meta.env.VITE_LIVE_MOVES === "true";
configureDailyMovesRuntime({
  api: liveMoves ? createHttpDailyMovesApi() : createFixtureDailyMovesApi(),
  now: () => new Date(),
});

createApp(App).use(createPinia()).use(router).mount("#app");

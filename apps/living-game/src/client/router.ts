import { createRouter, createWebHistory } from "vue-router";

import AdventuresView from "./views/AdventuresView.vue";
import DisplayView from "./views/DisplayView.vue";
import LedgerView from "./views/LedgerView.vue";
import PersonaView from "./views/PersonaView.vue";
import TodayView from "./views/TodayView.vue";
import WorldView from "./views/WorldView.vue";

export const routes = [
  { path: "/", name: "world", component: WorldView },
  { path: "/today", name: "today", component: TodayView },
  { path: "/adventures", name: "adventures", component: AdventuresView },
  { path: "/persona", name: "persona", component: PersonaView },
  { path: "/ledger", name: "ledger", component: LedgerView },
  { path: "/display", name: "display", component: DisplayView },
] as const;

export const router = createRouter({
  history: createWebHistory(),
  routes: [...routes],
});

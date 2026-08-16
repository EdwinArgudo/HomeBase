import { createRouter, createWebHistory } from "vue-router";

import AdventuresView from "./views/AdventuresView.vue";
import DisplayView from "./views/DisplayView.vue";
import HomeView from "./views/HomeView.vue";
import LedgerView from "./views/LedgerView.vue";
import PersonaView from "./views/PersonaView.vue";

export const routes = [
  { path: "/", name: "home", component: HomeView },
  { path: "/adventures", name: "adventures", component: AdventuresView },
  { path: "/persona", name: "persona", component: PersonaView },
  { path: "/ledger", name: "ledger", component: LedgerView },
  { path: "/display", name: "display", component: DisplayView },
] as const;

export const router = createRouter({
  history: createWebHistory(import.meta.env.VITE_ROUTER_BASE ?? import.meta.env.BASE_URL),
  // The world and today's moves are one page now; the old path still resolves.
  routes: [...routes, { path: "/today", redirect: "/" }],
});

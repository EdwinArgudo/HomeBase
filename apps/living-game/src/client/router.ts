import { createRouter, createWebHistory } from "vue-router";

import AdventuresView from "./views/AdventuresView.vue";
import DisplayView from "./views/DisplayView.vue";
import HomeView from "./views/HomeView.vue";
import HouseholdView from "./views/HouseholdView.vue";
import LedgerView from "./views/LedgerView.vue";
import PersonaView from "./views/PersonaView.vue";
import PlansView from "./views/PlansView.vue";

export const routes = [
  { path: "/", name: "home", component: HomeView },
  { path: "/adventures", name: "adventures", component: AdventuresView },
  { path: "/persona", name: "persona", component: PersonaView },
  { path: "/plans", name: "plans", component: PlansView },
  { path: "/household", name: "household", component: HouseholdView },
  { path: "/ledger", name: "ledger", component: LedgerView },
  // The wall display is a mode, not a page: it renders without app chrome.
  { path: "/display", name: "display", component: DisplayView, meta: { bare: true } },
] as const;

const knownCompatibilityPaths = new Set(["", "adventures", "persona", "household", "ledger", "plans", "display"]);
export function compatibilityTarget(value: string | string[] | undefined) {
  const path = Array.isArray(value) ? value.join("/") : value ?? "";
  return knownCompatibilityPaths.has(path) ? `/${path}` : "/";
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.VITE_ROUTER_BASE ?? import.meta.env.BASE_URL),
  // The world and today's moves are one page now; the old path still resolves.
  routes: [
    ...routes,
    { path: "/today", redirect: "/" },
    { path: "/home", redirect: "/plans" },
    { path: "/goals", redirect: "/plans" },
    { path: "/living-game", redirect: "/" },
    { path: "/living-game/:pathMatch(.*)*", redirect: (to) => compatibilityTarget(to.params.pathMatch as string | string[] | undefined) },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

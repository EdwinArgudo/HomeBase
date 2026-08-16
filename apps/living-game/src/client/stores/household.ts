import { defineStore } from "pinia";
import { computed, ref } from "vue";

import type { HouseholdApi, HouseholdSummary } from "../api/household";

let runtime: { api: HouseholdApi } | null = null;

export function configureHouseholdRuntime(configuration: { api: HouseholdApi }) {
  runtime = configuration;
}

function configuredRuntime() {
  if (!runtime) throw new Error("Household runtime has not been configured.");
  return runtime;
}

function safeMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.length > 0 && error.message.length <= 200
    ? error.message
    : fallback;
}

export const useHouseholdStore = defineStore("household", () => {
  const summary = ref<HouseholdSummary | null>(null);
  const loadState = ref<"idle" | "loading" | "ready" | "error">("idle");
  const loadError = ref("");
  const actionState = ref<"idle" | "inviting">("idle");
  const actionError = ref("");
  const feedback = ref("");
  let pendingLoad: Promise<void> | null = null;

  async function ensureLoaded(force = false) {
    if (!force && loadState.value === "ready") return;
    if (!force && pendingLoad) return pendingLoad;
    loadState.value = "loading";
    loadError.value = "";
    const request = configuredRuntime().api.load().then((loaded) => {
      summary.value = loaded;
      loadState.value = "ready";
    }).catch((error: unknown) => {
      summary.value = null;
      loadState.value = "error";
      loadError.value = safeMessage(error, "Unable to read your household.");
    }).finally(() => {
      pendingLoad = null;
    });
    pendingLoad = request;
    return request;
  }

  async function invite(email: string) {
    if (actionState.value !== "idle") return false;
    actionState.value = "inviting";
    actionError.value = "";
    feedback.value = "";
    try {
      const invitation = await configuredRuntime().api.invite(email.trim());
      feedback.value = `${invitation.email} can join as soon as they sign in.`;
      await ensureLoaded(true);
      return true;
    } catch (error) {
      actionError.value = safeMessage(error, "Unable to send that invitation.");
      return false;
    } finally {
      actionState.value = "idle";
    }
  }

  const partnerCount = computed(() => (summary.value?.members ?? []).filter((member) => !member.isYou).length);
  const isAlone = computed(() => loadState.value === "ready" && partnerCount.value === 0);

  return { summary, loadState, loadError, actionState, actionError, feedback, partnerCount, isAlone, ensureLoaded, invite };
});

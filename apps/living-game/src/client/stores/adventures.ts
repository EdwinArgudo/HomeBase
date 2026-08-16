import type { AdventureSnapshotV1 } from "@homebase/contracts";
import { defineStore } from "pinia";
import { ref } from "vue";

import type { AdventuresApi } from "../api/adventures";

let runtime: { api: AdventuresApi } | null = null;

export function configureAdventuresRuntime(configuration: { api: AdventuresApi }) {
  runtime = configuration;
}

function configuredRuntime() {
  if (!runtime) throw new Error("Adventures runtime has not been configured.");
  return runtime;
}

function safeMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.length > 0 && error.message.length <= 200
    ? error.message
    : fallback;
}

export const useAdventuresStore = defineStore("adventures", () => {
  const snapshot = ref<AdventureSnapshotV1 | null>(null);
  const loadState = ref<"idle" | "loading" | "ready" | "error">("idle");
  const loadError = ref("");
  const actionState = ref<"idle" | "starting">("idle");
  const actionError = ref("");
  const feedback = ref("");

  async function ensureLoaded(force = false) {
    if (!force && loadState.value === "ready") return;
    loadState.value = "loading";
    loadError.value = "";
    try {
      snapshot.value = await configuredRuntime().api.load();
      loadState.value = "ready";
    } catch (error) {
      snapshot.value = null;
      loadState.value = "error";
      loadError.value = safeMessage(error, "Unable to load your adventures.");
    }
  }

  async function accept(templateKey: string) {
    if (actionState.value !== "idle") return false;
    actionState.value = "starting";
    actionError.value = "";
    feedback.value = "";
    try {
      // The server returns the settled snapshot, so nothing is guessed here.
      snapshot.value = await configuredRuntime().api.accept(templateKey);
      feedback.value = "Started. Shared moves will carry it along.";
      return true;
    } catch (error) {
      actionError.value = safeMessage(error, "Unable to begin that adventure.");
      return false;
    } finally {
      actionState.value = "idle";
    }
  }

  return { snapshot, loadState, loadError, actionState, actionError, feedback, ensureLoaded, accept };
});

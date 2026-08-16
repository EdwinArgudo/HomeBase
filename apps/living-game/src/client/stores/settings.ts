import { defineStore } from "pinia";
import { ref } from "vue";

import type { SettingsApi } from "../api/settings";

let runtime: { api: SettingsApi } | null = null;

export function configureSettingsRuntime(configuration: { api: SettingsApi }) {
  runtime = configuration;
}

function configuredRuntime() {
  if (!runtime) throw new Error("Settings runtime has not been configured.");
  return runtime;
}

function safeMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.length > 0 && error.message.length <= 200
    ? error.message
    : fallback;
}

export const useSettingsStore = defineStore("settings", () => {
  const restMode = ref(false);
  const loadState = ref<"idle" | "loading" | "ready" | "error">("idle");
  const actionState = ref<"idle" | "saving">("idle");
  const actionError = ref("");

  async function ensureLoaded(force = false) {
    if (!force && loadState.value === "ready") return;
    loadState.value = "loading";
    try {
      restMode.value = await configuredRuntime().api.loadRestMode();
      loadState.value = "ready";
    } catch {
      // Rest mode is a comfort setting; a failed read must not block the page.
      loadState.value = "error";
    }
  }

  async function setRestMode(enabled: boolean) {
    if (actionState.value !== "idle") return;
    actionState.value = "saving";
    actionError.value = "";
    try {
      restMode.value = await configuredRuntime().api.setRestMode(enabled);
    } catch (error) {
      actionError.value = safeMessage(error, "Unable to update Rest mode.");
    } finally {
      actionState.value = "idle";
    }
  }

  return { restMode, loadState, actionState, actionError, ensureLoaded, setRestMode };
});

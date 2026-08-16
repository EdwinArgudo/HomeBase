import type { WorldProjectionV1 } from "@homebase/contracts";
import { defineStore } from "pinia";
import { ref } from "vue";

import type { DisplayWorldApi } from "../api/displayWorld";

let runtime: { api: DisplayWorldApi } | null = null;

export function configureDisplayWorldRuntime(configuration: { api: DisplayWorldApi }) {
  runtime = configuration;
}

function configuredRuntime() {
  if (!runtime) throw new Error("Display runtime has not been configured.");
  return runtime;
}

export const useDisplayWorldStore = defineStore("displayWorld", () => {
  const projection = ref<WorldProjectionV1 | null>(null);
  const loadState = ref<"idle" | "loading" | "ready" | "error">("idle");
  const loadError = ref("");

  async function ensureLoaded(force = false) {
    if (!force && loadState.value === "ready") return;
    loadState.value = "loading";
    loadError.value = "";
    try {
      projection.value = await configuredRuntime().api.load();
      loadState.value = "ready";
    } catch (error) {
      projection.value = null;
      loadState.value = "error";
      loadError.value = error instanceof Error && error.message.length <= 200
        ? error.message
        : "The display is unavailable right now.";
    }
  }

  return { projection, loadState, loadError, ensureLoaded };
});

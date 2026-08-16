import type { WorldProjectionV1 } from "@homebase/contracts";
import { computed, ref } from "vue";
import { defineStore } from "pinia";

import type { WorldApi } from "../api/world";

let runtime: { api: WorldApi } | null = null;

export function configureWorldRuntime(configuration: { api: WorldApi }) {
  runtime = configuration;
}

function api() {
  if (!runtime) throw new Error("World runtime has not been configured.");
  return runtime.api;
}

function safeMessage(error: unknown) {
  return error instanceof Error && error.message.length > 0 && error.message.length <= 200
    ? error.message
    : "Unable to load the household world.";
}

export const useWorldStore = defineStore("world", () => {
  const projection = ref<WorldProjectionV1 | null>(null);
  const selectedPersonaId = ref<string | null>(null);
  const loadState = ref<"idle" | "loading" | "ready" | "error">("idle");
  const loadError = ref("");
  let requestSequence = 0;
  let pendingLoad: Promise<void> | null = null;

  const selectedPersona = computed(() => (
    projection.value?.personas.find((persona) => persona.id === selectedPersonaId.value) ?? null
  ));

  async function ensureLoaded(force = false) {
    if (pendingLoad) return pendingLoad;
    if (!force && loadState.value === "ready") return;
    const sequence = ++requestSequence;
    loadState.value = "loading";
    loadError.value = "";
    const request = api().load().then((loaded) => {
      if (sequence !== requestSequence) return;
      projection.value = loaded;
      if (!loaded.personas.some((persona) => persona.id === selectedPersonaId.value)) {
        selectedPersonaId.value = loaded.personas[0]?.id ?? null;
      }
      loadState.value = "ready";
    }).catch((error: unknown) => {
      if (sequence !== requestSequence) return;
      projection.value = null;
      selectedPersonaId.value = null;
      loadState.value = "error";
      loadError.value = safeMessage(error);
    }).finally(() => {
      if (sequence === requestSequence) pendingLoad = null;
    });
    pendingLoad = request;
    return request;
  }

  function selectPersona(personaId: string) {
    if (projection.value?.personas.some((persona) => persona.id === personaId)) selectedPersonaId.value = personaId;
  }

  return { projection, selectedPersonaId, selectedPersona, loadState, loadError, ensureLoaded, selectPersona };
});

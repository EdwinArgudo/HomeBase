import type { PersonaDraftInputV1, PersonaProfileV1 } from "@homebase/contracts";
import { ref } from "vue";
import { defineStore } from "pinia";

import type { PersonaApi } from "../api/persona";

let runtime: { api: PersonaApi } | null = null;

export function configurePersonaRuntime(configuration: { api: PersonaApi }) {
  runtime = configuration;
}

function api() {
  if (!runtime) throw new Error("Persona runtime has not been configured.");
  return runtime.api;
}

function safeMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.length > 0 && error.message.length <= 200 ? error.message : fallback;
}

export const usePersonaStore = defineStore("persona", () => {
  const persona = ref<PersonaProfileV1 | null>(null);
  const loadState = ref<"idle" | "loading" | "ready" | "error">("idle");
  const actionState = ref<"idle" | "saving" | "approving">("idle");
  const loadError = ref("");
  const actionError = ref("");
  const feedback = ref("");
  let pendingLoad: Promise<void> | null = null;
  let sequence = 0;

  async function ensureLoaded(force = false) {
    if (!force && loadState.value === "ready") return;
    if (!force && pendingLoad) return pendingLoad;
    const current = ++sequence;
    loadState.value = "loading";
    loadError.value = "";
    const request = api().load().then((snapshot) => {
      if (current !== sequence) return;
      persona.value = snapshot.persona;
      loadState.value = "ready";
    }).catch((error: unknown) => {
      if (current !== sequence) return;
      persona.value = null;
      loadState.value = "error";
      loadError.value = safeMessage(error, "Unable to load your persona.");
    }).finally(() => {
      if (current === sequence) pendingLoad = null;
    });
    pendingLoad = request;
    return request;
  }

  async function save(input: PersonaDraftInputV1) {
    if (actionState.value !== "idle") return false;
    actionState.value = "saving";
    actionError.value = "";
    feedback.value = "";
    try {
      persona.value = await api().save(input);
      loadState.value = "ready";
      feedback.value = persona.value.status === "ready" ? "Approved persona updated." : "Persona saved as a draft.";
      return true;
    } catch (error) {
      actionError.value = safeMessage(error, "Unable to save your persona.");
      return false;
    } finally {
      actionState.value = "idle";
    }
  }

  async function approve() {
    if (actionState.value !== "idle") return false;
    actionState.value = "approving";
    actionError.value = "";
    feedback.value = "";
    try {
      persona.value = (await api().approve()).persona;
      feedback.value = "Persona approved and ready.";
      return true;
    } catch (error) {
      actionError.value = safeMessage(error, "Unable to approve your persona.");
      return false;
    } finally {
      actionState.value = "idle";
    }
  }

  return { persona, loadState, actionState, loadError, actionError, feedback, ensureLoaded, save, approve };
});

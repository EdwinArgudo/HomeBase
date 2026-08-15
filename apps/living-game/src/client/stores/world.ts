import { computed, ref } from "vue";
import { defineStore } from "pinia";

import { worldFixture } from "../fixtures/game";

export const useWorldStore = defineStore("world", () => {
  const projection = worldFixture;
  const selectedPersonaId = ref<string | null>(projection.personas[0]?.id ?? null);
  const selectedPersona = computed(() => (
    projection.personas.find((persona) => persona.id === selectedPersonaId.value) ?? null
  ));

  function selectPersona(personaId: string) {
    if (projection.personas.some((persona) => persona.id === personaId)) {
      selectedPersonaId.value = personaId;
    }
  }

  return { projection, selectedPersonaId, selectedPersona, selectPersona };
});

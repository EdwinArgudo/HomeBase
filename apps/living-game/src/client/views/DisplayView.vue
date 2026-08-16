<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted } from "vue";

import WorldScene from "../components/WorldScene.vue";
import { useDisplayWorldStore } from "../stores/displayWorld";

const display = useDisplayWorldStore();
const { projection, loadState, loadError } = storeToRefs(display);

onMounted(() => void display.ensureLoaded());

const weekday = computed(() => new Date().toLocaleDateString(undefined, { weekday: "long" }));

// Nothing here describes what anyone has been doing; the display only says who
// is home, because anyone in the room can read it.
const presence = computed(() => {
  const names = (projection.value?.personas ?? []).map((persona) => persona.displayName);
  if (names.length === 0) return "Nobody is home yet";
  if (names.length === 1) return `${names[0]} is home`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are home`;
});
</script>

<template>
  <section class="display-mode" aria-labelledby="display-heading">
    <header class="display-mode__header">
      <p class="display-mode__day">{{ weekday }}</p>
      <h1 id="display-heading">{{ presence }}</h1>
    </header>

    <div v-if="loadState === 'idle' || loadState === 'loading'" class="display-mode__state" role="status" aria-live="polite">
      Waking up…
    </div>
    <p v-else-if="loadState === 'error'" class="display-mode__state" role="alert">{{ loadError }}</p>
    <p v-else-if="!projection?.personas.length" class="display-mode__state">
      Choose a companion on your phone and it will appear here.
    </p>

    <WorldScene v-else-if="projection" :world="projection" display-mode />

    <p class="world-text-equivalent">
      Display summary: {{ presence }}. No personal or financial details are shown.
    </p>
  </section>
</template>

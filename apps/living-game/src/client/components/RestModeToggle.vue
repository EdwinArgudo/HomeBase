<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted } from "vue";

import { useSettingsStore } from "../stores/settings";

const settings = useSettingsStore();
const { restMode, actionState, actionError } = storeToRefs(settings);

onMounted(() => void settings.ensureLoaded());
</script>

<template>
  <div class="rest-mode">
    <button
      class="rest-mode__switch"
      type="button"
      role="switch"
      :aria-checked="restMode"
      :disabled="actionState !== 'idle'"
      @click="settings.setRestMode(!restMode)"
    >
      <span class="rest-mode__track" aria-hidden="true"><span class="rest-mode__knob" /></span>
      <span class="rest-mode__label">
        <strong>Rest mode</strong>
        <!-- Today's shortlist is already settled, so this shapes the days ahead. -->
        <span>{{ restMode ? "New days bring one gentle move." : "New days bring up to three moves." }}</span>
      </span>
    </button>
    <p v-if="actionError" class="rest-mode__error" role="alert">{{ actionError }}</p>
  </div>
</template>

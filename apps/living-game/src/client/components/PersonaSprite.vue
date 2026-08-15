<script setup lang="ts">
import type { WorldPersonaV1 } from "@homebase/contracts";

defineProps<{
  persona: WorldPersonaV1;
  variant: "mint" | "berry" | "sun";
  selected?: boolean;
  static?: boolean;
}>();

defineEmits<{
  select: [personaId: string];
}>();

function activityLabel(activity: WorldPersonaV1["activity"]) {
  return activity.replace("_", " ");
}
</script>

<template>
  <div class="persona-anchor" :class="`persona-anchor--${variant}`">
    <button
      v-if="!static"
      class="persona-control"
      type="button"
      :aria-label="`Select ${persona.displayName}, currently ${activityLabel(persona.activity)}`"
      :aria-pressed="selected"
      @click="$emit('select', persona.id)"
    >
      <span class="pixel-persona" aria-hidden="true" data-motion="ambient">
        <span class="pixel-persona__hair" />
        <span class="pixel-persona__head"><span class="pixel-persona__eyes" /></span>
        <span class="pixel-persona__body" />
        <span class="pixel-persona__legs" />
      </span>
      <span class="persona-label">
        <strong>{{ persona.displayName }}</strong>
        <span>{{ activityLabel(persona.activity) }}</span>
      </span>
    </button>

    <div v-else class="persona-control persona-control--static">
      <span class="pixel-persona" aria-hidden="true" data-motion="ambient">
        <span class="pixel-persona__hair" />
        <span class="pixel-persona__head"><span class="pixel-persona__eyes" /></span>
        <span class="pixel-persona__body" />
        <span class="pixel-persona__legs" />
      </span>
      <span class="persona-label">
        <strong>{{ persona.displayName }}</strong>
        <span>{{ activityLabel(persona.activity) }}</span>
      </span>
    </div>
  </div>
</template>

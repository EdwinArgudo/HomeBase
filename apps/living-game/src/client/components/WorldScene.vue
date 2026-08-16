<script setup lang="ts">
import type { WorldProjectionV1 } from "@homebase/contracts";

import PersonaSprite from "./PersonaSprite.vue";

defineProps<{
  world: WorldProjectionV1;
  selectedPersonaId?: string | null;
  displayMode?: boolean;
}>();

defineEmits<{
  selectPersona: [personaId: string];
}>();
</script>

<template>
  <div class="world-scene" :class="{ 'world-scene--display': displayMode }">
    <p class="world-scene__bezel" aria-hidden="true">
      <span class="world-scene__lamp">Homebase</span>
      <span>{{ world.scene.theme.replace("-", " ") }}</span>
    </p>
    <div
      class="world-scene__panel"
      :role="displayMode ? 'img' : 'group'"
      :aria-label="displayMode ? 'Shared household home' : 'Interactive household home'"
    >
      <div class="world-scene__wall" aria-hidden="true">
        <div class="world-window"><span class="world-window__sun" /></div>
        <div class="world-shelf"><span /><span /><span /></div>
        <div class="world-clock"><span /></div>
      </div>
      <div class="world-scene__floor" aria-hidden="true">
        <div class="world-rug" />
        <div class="world-sofa"><span /><span /></div>
        <div class="world-plant"><span /><span /><span /></div>
        <div class="world-table" />
      </div>

      <div
        v-for="item in world.items"
        :key="item.id"
        class="world-item"
        :class="`world-item--${item.catalogKey}`"
        :style="{ left: `${item.x}%`, top: `${item.y}%`, zIndex: item.zIndex }"
        aria-hidden="true"
      ><span /><span /></div>

      <PersonaSprite
        v-for="(persona, index) in world.personas"
        :key="persona.id"
        class="world-scene__persona"
        :class="`world-scene__persona--${index + 1}`"
        :persona="persona"
        :appearance="persona.appearance ?? undefined"
        :variant="index % 2 === 0 ? 'mint' : 'berry'"
        :selected="persona.id === selectedPersonaId"
        :static="displayMode"
        @select="$emit('selectPersona', $event)"
      />
    </div>
  </div>
</template>

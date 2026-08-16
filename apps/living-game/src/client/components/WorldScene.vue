<script setup lang="ts">
import type { PersonaAppearanceV1, WorldProjectionV1 } from "@homebase/contracts";

import PersonaSprite from "./PersonaSprite.vue";

defineProps<{
  world: WorldProjectionV1;
  selectedPersonaId?: string | null;
  displayMode?: boolean;
  appearances?: Record<string, PersonaAppearanceV1>;
}>();

defineEmits<{
  selectPersona: [personaId: string];
}>();
</script>

<template>
  <div
    class="world-scene"
    :class="{ 'world-scene--display': displayMode }"
    :role="displayMode ? 'img' : 'group'"
    :aria-label="displayMode ? 'Shared pixel apartment scene' : 'Interactive pixel apartment scene'"
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

    <PersonaSprite
      v-for="(persona, index) in world.personas"
      :key="persona.id"
      class="world-scene__persona"
      :class="`world-scene__persona--${index + 1}`"
      :persona="persona"
      :appearance="appearances?.[persona.id]"
      :variant="index % 2 === 0 ? 'mint' : 'berry'"
      :selected="persona.id === selectedPersonaId"
      :static="displayMode"
      @select="$emit('selectPersona', $event)"
    />
  </div>
</template>

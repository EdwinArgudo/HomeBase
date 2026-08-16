<script setup lang="ts">
import type { PersonaAppearanceV1, WorldPersonaV1 } from "@homebase/contracts";

const props = defineProps<{
  persona: WorldPersonaV1;
  variant: "mint" | "berry" | "sun";
  appearance?: PersonaAppearanceV1;
  selected?: boolean;
  static?: boolean;
}>();

defineEmits<{
  select: [personaId: string];
}>();

function activityLabel(activity: WorldPersonaV1["activity"]) {
  return activity.replace("_", " ");
}

const emblemLabels = {
  "first-tend": "Steady Hands",
  "first-move": "Gentle Motion",
  "first-grow": "New Leaf",
  "first-connect": "Warm Hello",
  "first-household": "Shared Spark",
} as const;

function personaLabel() {
  const emblem = props.persona.equippedRewardKey;
  return `Select ${props.persona.displayName}, currently ${activityLabel(props.persona.activity)}${emblem ? `, wearing the ${emblemLabels[emblem]} emblem` : ""}`;
}

function appearanceClasses() {
  if (!props.appearance) return [];
  return [
    `persona-skin--${props.appearance.skinPalette}`,
    `persona-hair--${props.appearance.hairStyle}`,
    `persona-hair-color--${props.appearance.hairColor}`,
    `persona-outfit--${props.appearance.outfit}`,
    `persona-accent--${props.appearance.accent}`,
  ];
}
</script>

<template>
  <div class="persona-anchor" :class="[`persona-anchor--${variant}`, ...appearanceClasses()]">
    <button
      v-if="!static"
      class="persona-control"
      type="button"
      :aria-label="personaLabel()"
      :aria-pressed="selected"
      @click="$emit('select', persona.id)"
    >
      <span class="pixel-persona" aria-hidden="true" data-motion="ambient">
        <span class="pixel-persona__hair" />
        <span class="pixel-persona__head"><span class="pixel-persona__eyes" /><span class="pixel-persona__accent" /></span>
        <span class="pixel-persona__body" />
        <span class="pixel-persona__legs" />
        <span v-if="persona.equippedRewardKey" class="pixel-emblem" :class="`pixel-emblem--${persona.equippedRewardKey}`" aria-hidden="true">✦</span>
      </span>
      <span class="persona-label">
        <strong>{{ persona.displayName }}</strong>
        <span>{{ activityLabel(persona.activity) }}</span>
      </span>
    </button>

    <div v-else class="persona-control persona-control--static" role="img" :aria-label="`${persona.displayName}'s pixel persona${persona.equippedRewardKey ? ` wearing the ${emblemLabels[persona.equippedRewardKey]} emblem` : ''}`">
      <span class="pixel-persona" aria-hidden="true" data-motion="ambient">
        <span class="pixel-persona__hair" />
        <span class="pixel-persona__head"><span class="pixel-persona__eyes" /><span class="pixel-persona__accent" /></span>
        <span class="pixel-persona__body" />
        <span class="pixel-persona__legs" />
        <span v-if="persona.equippedRewardKey" class="pixel-emblem" :class="`pixel-emblem--${persona.equippedRewardKey}`" aria-hidden="true">✦</span>
      </span>
      <span class="persona-label">
        <strong>{{ persona.displayName }}</strong>
        <span>{{ activityLabel(persona.activity) }}</span>
      </span>
    </div>
  </div>
</template>

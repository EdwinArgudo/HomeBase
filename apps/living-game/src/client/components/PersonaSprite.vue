<script setup lang="ts">
import type { PersonaAppearanceV1, WorldPersonaV1 } from "@homebase/contracts";

const props = defineProps<{
  persona: WorldPersonaV1;
  variant: "mint" | "berry" | "sun";
  appearance?: PersonaAppearanceV1;
  selected?: boolean;
  static?: boolean;
}>();

const emit = defineEmits<{
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

function emblemSuffix() {
  const emblem = props.persona.equippedRewardKey;
  return emblem ? ` wearing the ${emblemLabels[emblem]} emblem` : "";
}

// A tappable persona is a button; a display persona is an image. Both render
// the same sprite, so only the control semantics differ.
function controlAttributes() {
  if (props.static) {
    return {
      role: "img",
      "aria-label": `${props.persona.displayName}'s pixel persona${emblemSuffix()}`,
    };
  }
  const emblem = emblemSuffix();
  return {
    type: "button",
    "aria-label": `Select ${props.persona.displayName}, currently ${activityLabel(props.persona.activity)}${emblem ? `,${emblem}` : ""}`,
    "aria-pressed": props.selected,
    onClick: () => emit("select", props.persona.id),
  };
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
    <component
      :is="static ? 'div' : 'button'"
      class="persona-control"
      :class="{ 'persona-control--static': static }"
      v-bind="controlAttributes()"
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
    </component>
  </div>
</template>

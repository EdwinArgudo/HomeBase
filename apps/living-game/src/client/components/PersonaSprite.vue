<script setup lang="ts">
import type { PersonaAppearanceV1, WorldPersonaV1 } from "@homebase/contracts";
import { computed } from "vue";

import { characterLook } from "../characters";

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

// Companions are drawn on a 64x64 field as soft overlapping forms. Colour never
// comes from persona data directly: the character class on the wrapper sets
// custom properties, and every shape here paints from a fixed class.
const look = computed(() => characterLook(props.appearance?.character));
const species = computed(() => look.value.body);
const pattern = computed(() => look.value.pattern);
const accessory = computed(() => look.value.accessory);

const asleep = computed(() => props.persona.activity === "rest");
const cheerful = computed(() => props.persona.activity === "celebrate");

const emblemLabels: Record<string, string> = {
  "first-tend": "Steady Hands",
  "first-move": "Gentle Motion",
  "first-grow": "New Leaf",
  "first-connect": "Warm Hello",
  "first-household": "Shared Spark",
};

const emblemSuffix = computed(() => {
  const emblem = props.persona.equippedRewardKey;
  return emblem ? ` wearing the ${emblemLabels[emblem]} emblem` : "";
});
</script>

<template>
  <div
    class="persona-anchor"
    :class="[
      `persona-anchor--${variant}`,
      appearance ? `persona-character--${appearance.character}` : '',
      `persona-species--${species}`,
    ]"
  >
    <component
      :is="static ? 'div' : 'button'"
      class="persona-control"
      :class="{ 'persona-control--static': static }"
      v-bind="static
        ? { role: 'img', 'aria-label': `${persona.displayName}, a ${look.name} companion${emblemSuffix}` }
        : {
          type: 'button',
          'aria-label': `Select ${persona.displayName}, currently ${persona.activity.replace('_', ' ')}${emblemSuffix}`,
          'aria-pressed': selected,
          onClick: () => emit('select', persona.id),
        }"
    >
      <span class="companion" aria-hidden="true">
        <svg class="companion__art" viewBox="0 0 64 64" role="presentation" focusable="false">
          <ellipse class="companion__shadow" cx="32" cy="58" rx="17" ry="4" />

          <g class="companion__body-group">
            <!-- Ears sit behind the head so they read as part of one soft form. -->
            <g class="companion__ears">
              <template v-if="species === 'bunny'">
                <rect class="ear ear--fill" x="19" y="2" width="9" height="24" rx="4.5" />
                <rect class="ear ear--inner" x="21.5" y="6" width="4" height="16" rx="2" />
                <rect class="ear ear--fill" x="36" y="2" width="9" height="24" rx="4.5" />
                <rect class="ear ear--inner" x="38.5" y="6" width="4" height="16" rx="2" />
              </template>
              <template v-else-if="species === 'cat'">
                <path class="ear ear--fill" d="M15 24 L18 8 L31 17 Z" />
                <path class="ear ear--inner" d="M19 20 L20.5 13 L26 18 Z" />
                <path class="ear ear--fill" d="M49 24 L46 8 L33 17 Z" />
                <path class="ear ear--inner" d="M45 20 L43.5 13 L38 18 Z" />
              </template>
              <template v-else-if="species === 'dog'">
                <rect class="ear ear--fill" x="7" y="16" width="13" height="26" rx="6.5" />
                <rect class="ear ear--fill" x="44" y="16" width="13" height="26" rx="6.5" />
              </template>
              <template v-else-if="species === 'bear'">
                <circle class="ear ear--fill" cx="17" cy="15" r="8" />
                <circle class="ear ear--inner" cx="17" cy="15" r="4" />
                <circle class="ear ear--fill" cx="47" cy="15" r="8" />
                <circle class="ear ear--inner" cx="47" cy="15" r="4" />
              </template>
              <template v-else-if="species === 'chick'">
                <path class="ear ear--tuft" d="M28 8 Q32 -1 36 8 Q32 5 28 8 Z" />
              </template>
            </g>

            <!-- One rounded body. The species tweaks its proportions in CSS. -->
            <rect class="companion__body" x="10" y="16" width="44" height="42" rx="21" />

            <g class="companion__pattern">
              <ellipse v-if="pattern === 'belly'" class="mark mark--belly" cx="32" cy="45" rx="13" ry="11" />
              <template v-else-if="pattern === 'spots'">
                <circle class="mark" cx="19" cy="42" r="4" />
                <circle class="mark" cx="45" cy="46" r="5.5" />
                <circle class="mark" cx="27" cy="52" r="3" />
              </template>
              <path v-else-if="pattern === 'patch'" class="mark" d="M10 30 Q22 20 30 22 L30 44 Q16 46 10 40 Z" />
            </g>

            <!-- Face -->
            <g class="companion__face">
              <g class="companion__eyes">
                <template v-if="asleep">
                  <path class="eye-line" d="M20 35 q4 4 8 0" />
                  <path class="eye-line" d="M36 35 q4 4 8 0" />
                </template>
                <template v-else-if="cheerful">
                  <path class="eye-line" d="M20 37 q4 -6 8 0" />
                  <path class="eye-line" d="M36 37 q4 -6 8 0" />
                </template>
                <template v-else>
                  <ellipse class="eye" cx="24" cy="35" rx="3.6" ry="4.2" />
                  <ellipse class="eye" cx="40" cy="35" rx="3.6" ry="4.2" />
                  <circle class="eye-shine" cx="25.4" cy="33.4" r="1.3" />
                  <circle class="eye-shine" cx="41.4" cy="33.4" r="1.3" />
                </template>
              </g>
              <ellipse class="blush" cx="16.5" cy="42" rx="4" ry="2.6" />
              <ellipse class="blush" cx="47.5" cy="42" rx="4" ry="2.6" />
              <path v-if="cheerful" class="mouth" d="M28 42 q4 5 8 0" />
              <path v-else class="mouth" d="M29 41 q3 3 6 0" />
              <g v-if="species === 'cat'" class="whiskers">
                <path class="whisker" d="M6 36 h8" />
                <path class="whisker" d="M6 41 h8" />
                <path class="whisker" d="M50 36 h8" />
                <path class="whisker" d="M50 41 h8" />
              </g>
              <ellipse v-if="species === 'chick'" class="beak" cx="32" cy="41" rx="4" ry="3" />
              <ellipse v-if="species === 'dog' || species === 'bear'" class="snout" cx="32" cy="42" rx="8" ry="6" />
              <ellipse v-if="species === 'dog' || species === 'bear' || species === 'cat'" class="nose" cx="32" cy="39.5" rx="2.6" ry="2" />
            </g>

            <!-- Feet peek out from under the body. -->
            <ellipse class="companion__foot" cx="23" cy="57" rx="6" ry="3.4" />
            <ellipse class="companion__foot" cx="41" cy="57" rx="6" ry="3.4" />

            <g class="companion__accessory">
              <template v-if="accessory === 'bow'">
                <ellipse class="accessory-fill" cx="42.5" cy="24" rx="5.5" ry="4" transform="rotate(-18 42.5 24)" />
                <ellipse class="accessory-fill" cx="53.5" cy="24" rx="5.5" ry="4" transform="rotate(18 53.5 24)" />
                <circle class="accessory-knot" cx="48" cy="24" r="2.8" />
              </template>
              <template v-else-if="accessory === 'scarf'">
                <path class="accessory-fill" d="M14 47 q18 9 36 0 l0 6 q-18 8 -36 0 Z" />
                <path class="accessory-fill" d="M44 51 l7 10 -6 1 -3 -9 Z" />
              </template>
              <template v-else-if="accessory === 'glasses'">
                <circle class="accessory-lens" cx="24" cy="35" r="7" />
                <circle class="accessory-lens" cx="40" cy="35" r="7" />
                <path class="accessory-stroke" d="M31 35 h2" />
              </template>
              <template v-else-if="accessory === 'cap'">
                <path class="accessory-fill" d="M13 22 q19 -16 38 0 Z" />
                <rect class="accessory-fill" x="9" y="20" width="26" height="5" rx="2.5" />
              </template>
            </g>
          </g>
        </svg>
        <span
          v-if="persona.equippedRewardKey"
          class="companion-emblem"
          :class="`companion-emblem--${persona.equippedRewardKey}`"
          aria-hidden="true"
        >✦</span>
      </span>
      <span class="persona-label">
        <strong>{{ persona.displayName }}</strong>
        <span>{{ persona.activity.replace("_", " ") }}</span>
      </span>
    </component>
  </div>
</template>

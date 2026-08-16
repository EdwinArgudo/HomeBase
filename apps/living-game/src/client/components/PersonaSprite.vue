<script setup lang="ts">
import type { PersonaAppearanceV1, WorldPersonaV1 } from "@homebase/contracts";
import { computed } from "vue";

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

// The sprite is authored on a 16x24 pixel grid. Every part is a whole-pixel
// rect so the character stays crisp at any rendered size, and colours come from
// custom properties set by the allow-listed appearance classes below — never
// from values threaded through the template.
type Part = { x: number; y: number; w: number; h: number; kind: string };

const HEAD: Part[] = [
  { x: 4, y: 4, w: 8, h: 8, kind: "skin" },
];

const HAIR: Record<PersonaAppearanceV1["hairStyle"], Part[]> = {
  short: [{ x: 4, y: 2, w: 8, h: 3, kind: "hair" }],
  waves: [
    { x: 4, y: 2, w: 8, h: 3, kind: "hair" },
    { x: 3, y: 4, w: 1, h: 3, kind: "hair" },
    { x: 12, y: 4, w: 1, h: 3, kind: "hair" },
  ],
  curls: [
    { x: 3, y: 1, w: 10, h: 4, kind: "hair" },
    { x: 2, y: 3, w: 1, h: 3, kind: "hair" },
    { x: 13, y: 3, w: 1, h: 3, kind: "hair" },
  ],
  long: [
    { x: 4, y: 2, w: 8, h: 3, kind: "hair" },
    { x: 3, y: 4, w: 1, h: 9, kind: "hair" },
    { x: 12, y: 4, w: 1, h: 9, kind: "hair" },
  ],
};

const FACE: Part[] = [
  { x: 4, y: 9, w: 1, h: 1, kind: "blush" },
  { x: 11, y: 9, w: 1, h: 1, kind: "blush" },
  { x: 7, y: 10, w: 2, h: 1, kind: "mouth" },
];

const BODY: Part[] = [
  { x: 4, y: 12, w: 8, h: 6, kind: "outfit" },
  { x: 2, y: 12, w: 2, h: 3, kind: "outfit" },
  { x: 12, y: 12, w: 2, h: 3, kind: "outfit" },
  { x: 2, y: 15, w: 2, h: 2, kind: "skin" },
  { x: 12, y: 15, w: 2, h: 2, kind: "skin" },
  { x: 5, y: 18, w: 2, h: 3, kind: "legs" },
  { x: 9, y: 18, w: 2, h: 3, kind: "legs" },
  { x: 4, y: 21, w: 3, h: 1, kind: "shoes" },
  { x: 9, y: 21, w: 3, h: 1, kind: "shoes" },
];

// An 8px-wide head cannot hold an enclosed frame without swallowing the eyes,
// so glasses are a pale lens behind the eyes plus a bridge and temples in front.
const ACCENT_BACK: Record<PersonaAppearanceV1["accent"], Part[]> = {
  none: [],
  glasses: [
    { x: 4, y: 6, w: 3, h: 3, kind: "lens" },
    { x: 9, y: 6, w: 3, h: 3, kind: "lens" },
  ],
  headband: [],
};

const ACCENT_FRONT: Record<PersonaAppearanceV1["accent"], Part[]> = {
  none: [],
  glasses: [
    { x: 7, y: 7, w: 2, h: 1, kind: "frame" },
    { x: 3, y: 7, w: 1, h: 1, kind: "frame" },
    { x: 12, y: 7, w: 1, h: 1, kind: "frame" },
  ],
  headband: [{ x: 3, y: 3, w: 10, h: 1, kind: "band" }],
};

// A true 1px silhouette outline: the whole solid shape stamped in ink at four
// offsets behind the colour layer. Expanding each part on its own instead
// leaves ink seams wherever two parts meet.
const OUTLINE_OFFSETS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

const hairStyle = computed(() => props.appearance?.hairStyle ?? "short");
const accent = computed(() => props.appearance?.accent ?? "none");

// Everything except the face detail casts the silhouette outline, so the
// character reads as one shape rather than a pile of boxes.
const solids = computed<Part[]>(() => [
  ...HAIR[hairStyle.value],
  ...HEAD,
  ...BODY,
]);

const behindEyes = computed<Part[]>(() => ACCENT_BACK[accent.value]);
const details = computed<Part[]>(() => [...FACE, ...ACCENT_FRONT[accent.value]]);

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
      <span class="pixel-persona" aria-hidden="true">
        <svg class="pixel-persona__sprite" viewBox="0 0 16 24" role="presentation" focusable="false">
          <g class="px-outline">
            <g
              v-for="(offset, offsetIndex) in OUTLINE_OFFSETS"
              :key="`outline-${offsetIndex}`"
              :transform="`translate(${offset[0]} ${offset[1]})`"
            >
              <rect
                v-for="(part, index) in solids"
                :key="index"
                :x="part.x"
                :y="part.y"
                :width="part.w"
                :height="part.h"
              />
            </g>
          </g>
          <rect
            v-for="(part, index) in solids"
            :key="`solid-${index}`"
            :class="`px px--${part.kind}`"
            :x="part.x"
            :y="part.y"
            :width="part.w"
            :height="part.h"
          />
          <rect
            v-for="(part, index) in behindEyes"
            :key="`back-${index}`"
            :class="`px px--${part.kind}`"
            :x="part.x"
            :y="part.y"
            :width="part.w"
            :height="part.h"
          />
          <rect class="px px--eyes-shut" x="5" y="8" width="2" height="1" />
          <rect class="px px--eyes-shut" x="9" y="8" width="2" height="1" />
          <g class="px-eyes">
            <rect class="px px--eyes" x="5" y="7" width="2" height="2" />
            <rect class="px px--eyes" x="9" y="7" width="2" height="2" />
          </g>
          <rect
            v-for="(part, index) in details"
            :key="`detail-${index}`"
            :class="`px px--${part.kind}`"
            :x="part.x"
            :y="part.y"
            :width="part.w"
            :height="part.h"
          />
        </svg>
        <span
          v-if="persona.equippedRewardKey"
          class="pixel-emblem"
          :class="`pixel-emblem--${persona.equippedRewardKey}`"
          aria-hidden="true"
        >✦</span>
      </span>
      <span class="persona-label">
        <strong>{{ persona.displayName }}</strong>
        <span>{{ activityLabel(persona.activity) }}</span>
      </span>
    </component>
  </div>
</template>

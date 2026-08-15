<script setup lang="ts">
import type { DailyMoveV1 } from "@homebase/contracts";

defineProps<{
  move: DailyMoveV1;
  compact?: boolean;
}>();

defineEmits<{
  complete: [moveId: string];
}>();

const familyLabels = {
  tend: "Tend",
  move: "Move",
  grow: "Grow",
  connect: "Connect",
} as const;

function durationLabel(seconds: number) {
  if (seconds < 60) return "Under a minute";
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min`;
}
</script>

<template>
  <article class="move-card" :class="[`move-card--${move.family}`, { 'move-card--compact': compact, 'move-card--done': move.status === 'complete' }]">
    <div class="move-card__meta">
      <span class="family-chip">{{ familyLabels[move.family] }}</span>
      <span>{{ durationLabel(move.estimatedSeconds) }}</span>
    </div>
    <h2>{{ move.title }}</h2>
    <p v-if="!compact">
      {{ move.ownership === "shared" ? "A small win for both of you." : "A small step, just for you." }}
    </p>
    <button
      class="action-button"
      type="button"
      :disabled="move.status === 'complete'"
      @click="$emit('complete', move.id)"
    >
      <span aria-hidden="true">{{ move.status === "complete" ? "✓" : "→" }}</span>
      {{ move.status === "complete" ? "Done for today" : `Do ${move.shortLabel.toLowerCase()}` }}
    </button>
  </article>
</template>

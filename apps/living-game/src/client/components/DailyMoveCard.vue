<script setup lang="ts">
import type { DailyMoveV1, MoveCompletionOptionsV1 } from "@homebase/contracts";
import { ref, watch } from "vue";

import type { CompleteMoveInput } from "../api/dailyMoves";

const props = defineProps<{
  move: DailyMoveV1;
  compact?: boolean;
  busy?: boolean;
  actionError?: string;
  completionOptions?: MoveCompletionOptionsV1;
  optionsState?: "loading" | "ready" | "error";
  optionsError?: string;
}>();

const emit = defineEmits<{
  complete: [moveId: string, input: CompleteMoveInput];
  defer: [moveId: string];
  replace: [moveId: string];
  requestOptions: [move: DailyMoveV1, force?: boolean];
}>();

const goalValue = ref(1);
const selectedCategoryId = ref("");
const createRule = ref(false);

watch(
  () => [props.move.id, props.move.source.type, props.move.status] as const,
  () => {
    if (props.move.status === "active" && ["goal", "transaction"].includes(props.move.source.type)) {
      emit("requestOptions", props.move);
    }
  },
  { immediate: true },
);

watch(
  () => props.completionOptions,
  (loaded) => {
    if (loaded?.kind === "goal") goalValue.value = loaded.defaultValue;
    if (loaded?.kind === "transaction" && !loaded.categories.some((category) => category.id === selectedCategoryId.value)) {
      selectedCategoryId.value = loaded.categories[0]?.id ?? "";
      createRule.value = loaded.createRuleDefault;
    }
  },
  { immediate: true },
);

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

// Adapters already phrase shortLabel as the action ("Review transaction",
// "Repair connection"). Goal moves carry the goal's name instead, so they get
// their own verb rather than reading as a fragment.
function actionLabel() {
  return props.move.source.type === "goal" ? "Log progress" : props.move.shortLabel;
}

function completionInput(): CompleteMoveInput | null {
  if (props.move.source.type === "goal") {
    return Number.isInteger(goalValue.value) && goalValue.value > 0
      ? { value: goalValue.value }
      : null;
  }
  if (props.move.source.type === "transaction") {
    return selectedCategoryId.value
      ? { categoryId: selectedCategoryId.value, createRule: createRule.value }
      : null;
  }
  return {};
}

function complete() {
  const input = completionInput();
  if (input) emit("complete", props.move.id, input);
}
</script>

<template>
  <article
    class="move-card"
    :class="[
      `move-card--${move.family}`,
      {
        'move-card--compact': compact,
        'move-card--done': move.status === 'complete',
        'move-card--deferred': move.status === 'deferred',
      },
    ]"
    :aria-busy="busy || undefined"
  >
    <div class="move-card__meta">
      <span class="family-chip">{{ familyLabels[move.family] }}</span>
      <span>{{ durationLabel(move.estimatedSeconds) }}</span>
    </div>
    <h2>{{ move.title }}</h2>
    <p v-if="!compact">
      {{ move.ownership === "shared" ? "A small win for both of you." : "A small step, just for you." }}
    </p>

    <div v-if="move.status === 'active' && move.source.type === 'goal'" class="completion-input">
      <label :for="`goal-value-${move.id}`">
        Progress <span v-if="completionOptions?.kind === 'goal'">({{ completionOptions.unitLabel }})</span>
      </label>
      <input
        :id="`goal-value-${move.id}`"
        v-model.number="goalValue"
        type="number"
        min="1"
        max="1000000"
        step="1"
        :disabled="busy || optionsState === 'loading'"
      >
    </div>

    <div v-if="move.status === 'active' && move.source.type === 'transaction'" class="completion-input">
      <label :for="`category-${move.id}`">Category</label>
      <select
        :id="`category-${move.id}`"
        v-model="selectedCategoryId"
        :disabled="busy || optionsState !== 'ready'"
      >
        <option value="">Choose a category</option>
        <option
          v-for="category in completionOptions?.kind === 'transaction' ? completionOptions.categories : []"
          :key="category.id"
          :value="category.id"
        >
          {{ category.name }} · {{ category.ownership === "shared" ? "Ours" : "Mine" }}
        </option>
      </select>
      <label class="rule-option">
        <input v-model="createRule" type="checkbox" :disabled="busy || optionsState !== 'ready'">
        Remember this choice for this merchant
      </label>
    </div>

    <p v-if="optionsState === 'loading'" class="move-feedback" role="status">Loading choices…</p>
    <p v-else-if="optionsState === 'error'" class="move-feedback" role="alert">
      {{ optionsError }}
      <button type="button" class="inline-retry" @click="emit('requestOptions', move, true)">Retry choices</button>
    </p>

    <div v-if="move.status === 'active'" class="move-card__actions">
      <button
        class="action-button"
        type="button"
        :disabled="busy || completionInput() === null || (['goal', 'transaction'].includes(move.source.type) && optionsState !== 'ready')"
        @click="complete"
      >
        <span aria-hidden="true">→</span>
        {{ busy ? "Working…" : actionLabel() }}
      </button>
      <button class="move-secondary-action" type="button" :disabled="busy" @click="emit('defer', move.id)">Defer</button>
      <button class="move-secondary-action" type="button" :disabled="busy" @click="emit('replace', move.id)">Replace</button>
    </div>
    <p v-else class="move-status">
      {{ move.status === "complete" ? "✓ Done for today" : move.status === "deferred" ? "Deferred for today" : move.status }}
    </p>
    <p v-if="actionError" class="move-feedback" role="alert">{{ actionError }}</p>
  </article>
</template>

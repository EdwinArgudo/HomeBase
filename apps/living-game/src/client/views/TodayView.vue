<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted } from "vue";

import DailyMoveCard from "../components/DailyMoveCard.vue";
import { useDailyMovesStore } from "../stores/dailyMoves";

const movesStore = useDailyMovesStore();
const { moves, remainingMoves, completedCount, loadState, loadError, feedback } = storeToRefs(movesStore);

onMounted(() => void movesStore.ensureLoaded());
</script>

<template>
  <section class="content-view" aria-labelledby="today-heading">
    <header class="view-intro">
      <div>
        <p class="eyebrow">Your gentle shortlist</p>
        <h1 id="today-heading">Today’s Moves</h1>
      </div>
      <p class="count-bubble" aria-live="polite">
        <strong>{{ remainingMoves.length }}</strong> remaining · {{ completedCount }} done
      </p>
    </header>
    <p class="view-lede">Three useful things, held steady for today. Pick any one—or leave them here for later.</p>

    <p class="move-view-feedback" aria-live="polite">{{ feedback }}</p>
    <div v-if="loadState === 'idle' || loadState === 'loading'" class="move-state" role="status" aria-live="polite">
      Loading today’s moves…
    </div>
    <div v-else-if="loadState === 'error'" class="move-state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="inline-retry" @click="movesStore.ensureLoaded(true)">Retry</button>
    </div>
    <div v-else-if="moves.length === 0" class="move-state" role="status">
      No moves for today. Your shortlist is clear.
    </div>
    <div v-else class="move-list" aria-label="Today's moves">
      <DailyMoveCard
        v-for="move in moves"
        :key="move.id"
        :move="move"
        :busy="movesStore.busyMoveIds.has(move.id)"
        :action-error="movesStore.actionErrors.get(move.id)"
        :completion-options="movesStore.options.get(move.id)"
        :options-state="movesStore.optionStates.get(move.id)"
        :options-error="movesStore.optionErrors.get(move.id)"
        @complete="movesStore.completeMove"
        @defer="movesStore.deferMove"
        @replace="movesStore.replaceMove"
        @request-options="movesStore.ensureOptions"
      />
    </div>
  </section>
</template>

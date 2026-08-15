<script setup lang="ts">
import { storeToRefs } from "pinia";

import DailyMoveCard from "../components/DailyMoveCard.vue";
import { useDailyMovesStore } from "../stores/dailyMoves";

const movesStore = useDailyMovesStore();
const { moves, remainingMoves, completedCount } = storeToRefs(movesStore);
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

    <div class="move-list" aria-label="Today's three moves">
      <DailyMoveCard
        v-for="move in moves"
        :key="move.id"
        :move="move"
        @complete="movesStore.completeMove"
      />
    </div>
  </section>
</template>

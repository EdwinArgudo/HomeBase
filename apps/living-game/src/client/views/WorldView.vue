<script setup lang="ts">
import { storeToRefs } from "pinia";

import DailyMoveCard from "../components/DailyMoveCard.vue";
import WorldScene from "../components/WorldScene.vue";
import { useDailyMovesStore } from "../stores/dailyMoves";
import { useWorldStore } from "../stores/world";

const worldStore = useWorldStore();
const movesStore = useDailyMovesStore();
const { selectedPersona, selectedPersonaId } = storeToRefs(worldStore);
const { recommendedMove } = storeToRefs(movesStore);

function activityLabel(activity: string) {
  return activity.replace("_", " ");
}
</script>

<template>
  <section class="world-view" aria-labelledby="world-heading">
    <header class="view-intro view-intro--world">
      <div>
        <p class="eyebrow">Saturday · soft morning</p>
        <h1 id="world-heading">Our World</h1>
      </div>
      <p class="world-level"><span>12</span> shared moments this week</p>
    </header>

    <WorldScene
      :world="worldStore.projection"
      :selected-persona-id="selectedPersonaId"
      @select-persona="worldStore.selectPersona"
    />

    <div class="world-dashboard">
      <section class="world-readout" aria-labelledby="home-now-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Live at home</p>
            <h2 id="home-now-heading">Home now</h2>
          </div>
          <span class="status-orb" aria-label="World is in sync" />
        </div>
        <ul>
          <li v-for="persona in worldStore.projection.personas" :key="persona.id">
            <button
              type="button"
              :aria-pressed="persona.id === selectedPersonaId"
              @click="worldStore.selectPersona(persona.id)"
            >
              <span class="mini-avatar" :class="persona.id.includes('vienna') ? 'mini-avatar--berry' : ''" aria-hidden="true" />
              <span><strong>{{ persona.displayName }}</strong><small>{{ activityLabel(persona.activity) }}</small></span>
            </button>
          </li>
        </ul>
        <p v-if="selectedPersona" class="selected-persona-note" aria-live="polite">
          {{ selectedPersona.altDescription }}
        </p>
      </section>

      <section v-if="recommendedMove" class="recommended-move" aria-labelledby="next-move-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">A good next move</p>
            <h2 id="next-move-heading">Ready when you are</h2>
          </div>
          <RouterLink to="/today">All moves</RouterLink>
        </div>
        <DailyMoveCard :move="recommendedMove" compact @complete="movesStore.completeMove" />
      </section>
    </div>

    <p class="world-text-equivalent">
      World summary: Edwin is tending the home. Vienna is reading. Your available move is
      {{ recommendedMove?.title ?? "complete for today" }}.
    </p>
  </section>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted } from "vue";

import DailyMoveCard from "../components/DailyMoveCard.vue";
import WorldScene from "../components/WorldScene.vue";
import { useDailyMovesStore } from "../stores/dailyMoves";
import { useWorldStore } from "../stores/world";

const worldStore = useWorldStore();
const movesStore = useDailyMovesStore();
const { selectedPersona, selectedPersonaId } = storeToRefs(worldStore);
const { recommendedMove, loadState, loadError, feedback } = storeToRefs(movesStore);

onMounted(() => void movesStore.ensureLoaded());

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

      <section class="recommended-move" aria-labelledby="next-move-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">A good next move</p>
            <h2 id="next-move-heading">Ready when you are</h2>
          </div>
          <RouterLink to="/today">All moves</RouterLink>
        </div>
        <p class="move-view-feedback" aria-live="polite">{{ feedback }}</p>
        <div v-if="loadState === 'idle' || loadState === 'loading'" class="move-state" role="status" aria-live="polite">
          Loading today’s move…
        </div>
        <div v-else-if="loadState === 'error'" class="move-state" role="alert">
          <p>{{ loadError }}</p>
          <button type="button" class="inline-retry" @click="movesStore.ensureLoaded(true)">Retry</button>
        </div>
        <p v-else-if="!recommendedMove" class="move-state">No moves remain for today.</p>
        <DailyMoveCard
          v-else
          :move="recommendedMove"
          compact
          :busy="movesStore.busyMoveIds.has(recommendedMove.id)"
          :action-error="movesStore.actionErrors.get(recommendedMove.id)"
          :completion-options="movesStore.options.get(recommendedMove.id)"
          :options-state="movesStore.optionStates.get(recommendedMove.id)"
          :options-error="movesStore.optionErrors.get(recommendedMove.id)"
          @complete="movesStore.completeMove"
          @defer="movesStore.deferMove"
          @replace="movesStore.replaceMove"
          @request-options="movesStore.ensureOptions"
        />
      </section>
    </div>

    <p class="world-text-equivalent">
      World summary: Edwin is tending the home. Vienna is reading. Your available move is
      {{ loadState === "loading" || loadState === "idle" ? "loading" : recommendedMove?.title ?? "complete for today" }}.
    </p>
  </section>
</template>

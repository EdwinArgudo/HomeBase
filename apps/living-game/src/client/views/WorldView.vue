<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted } from "vue";

import DailyMoveCard from "../components/DailyMoveCard.vue";
import WorldScene from "../components/WorldScene.vue";
import { useDailyMovesStore } from "../stores/dailyMoves";
import { useProgressStore } from "../stores/progress";
import { useWorldStore } from "../stores/world";

const movesStore = useDailyMovesStore();
const progressStore = useProgressStore();
const worldStore = useWorldStore();
const { projection, selectedPersona, selectedPersonaId, loadState: worldLoadState, loadError: worldLoadError } = storeToRefs(worldStore);
const { recommendedMove, loadState, loadError, feedback } = storeToRefs(movesStore);
const {
  householdLevel,
  householdPoints,
  loadState: progressLoadState,
  loadError: progressLoadError,
} = storeToRefs(progressStore);

onMounted(() => void movesStore.ensureLoaded());
onMounted(() => void progressStore.ensureLoaded());
onMounted(() => void worldStore.ensureLoaded(true));

function activityLabel(activity: string) {
  return activity.replace("_", " ");
}
</script>

<template>
  <section class="world-view" aria-labelledby="world-heading">
    <header class="view-intro view-intro--world">
      <div>
        <p class="eyebrow">Live household personas · preview apartment scene</p>
        <h1 id="world-heading">Our World</h1>
      </div>
      <p v-if="progressLoadState === 'ready'" class="world-level" aria-live="polite">
        <span>{{ householdLevel }}</span> household level · {{ householdPoints }} points
      </p>
      <p v-else-if="progressLoadState === 'idle' || progressLoadState === 'loading'" class="world-level" role="status" aria-live="polite">
        Loading household progress…
      </p>
      <p v-else class="world-level" role="alert">
        {{ progressLoadError }}
        <button type="button" class="inline-retry" @click="progressStore.ensureLoaded(true)">Retry</button>
      </p>
    </header>

    <div v-if="worldLoadState === 'idle' || worldLoadState === 'loading'" class="persona-load-state" role="status" aria-live="polite">Loading household personas…</div>
    <div v-else-if="worldLoadState === 'error'" class="persona-load-state" role="alert">
      <p>{{ worldLoadError }}</p><button type="button" class="inline-retry" @click="worldStore.ensureLoaded(true)">Retry</button>
    </div>
    <div v-else-if="!projection?.personas.length" class="persona-load-state">
      No household personas are visible yet. <RouterLink to="/persona">Create your persona</RouterLink> to enter the preview scene.
    </div>

    <WorldScene
      v-if="worldLoadState === 'ready' && projection?.personas.length"
      :world="projection"
      :selected-persona-id="selectedPersonaId"
      @select-persona="worldStore.selectPersona"
    />

    <div class="world-dashboard">
      <section class="world-readout" aria-labelledby="home-now-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Live household personas</p>
            <h2 id="home-now-heading">Home now</h2>
          </div>
          <span class="status-orb" aria-label="Preview world is ready" />
        </div>
        <ul>
          <li v-for="worldPersona in projection?.personas ?? []" :key="worldPersona.id">
            <button
              type="button"
              :aria-pressed="worldPersona.id === selectedPersonaId"
              @click="worldStore.selectPersona(worldPersona.id)"
            >
              <span class="mini-avatar" aria-hidden="true" />
              <span><strong>{{ worldPersona.displayName }}</strong><small>{{ activityLabel(worldPersona.activity) }}</small></span>
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
      World summary: {{ projection?.personas.length ? `${projection.personas.length} live household persona${projection.personas.length === 1 ? " is" : "s are"} visible in the preview scene.` : "No household personas are visible in the preview scene." }} Your available move is
      {{ loadState === "loading" || loadState === "idle" ? "loading" : recommendedMove?.title ?? "complete for today" }}.
      Household progress is level {{ householdLevel }} with {{ householdPoints }} points. The scene remains a preview.
    </p>
  </section>
</template>

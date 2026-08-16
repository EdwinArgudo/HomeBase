<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch } from "vue";

import DailyMoveCard from "../components/DailyMoveCard.vue";
import WorldScene from "../components/WorldScene.vue";
import { useDailyMovesStore } from "../stores/dailyMoves";
import { useProgressStore } from "../stores/progress";
import { usePersonaStore } from "../stores/persona";
import { worldFixture } from "../fixtures/game";

const movesStore = useDailyMovesStore();
const progressStore = useProgressStore();
const personaStore = usePersonaStore();
const { persona, loadState: personaLoadState, loadError: personaLoadError } = storeToRefs(personaStore);
const selectedPersonaId = ref<string | null>(null);
const { recommendedMove, loadState, loadError, feedback } = storeToRefs(movesStore);
const {
  householdLevel,
  householdPoints,
  loadState: progressLoadState,
  loadError: progressLoadError,
} = storeToRefs(progressStore);

onMounted(() => void movesStore.ensureLoaded());
onMounted(() => void progressStore.ensureLoaded());
onMounted(() => void personaStore.ensureLoaded());

const projection = computed(() => ({
  ...worldFixture,
  personas: persona.value ? [{
    id: persona.value.id,
    displayName: persona.value.displayName,
    altDescription: `${persona.value.displayName}'s saved manual pixel persona in the preview apartment.`,
    visibility: persona.value.visibility,
    activity: "idle" as const,
    x: 28,
    y: 62,
    manifest: persona.value.manifest,
  }] : [],
}));
const appearances = computed(() => persona.value ? { [persona.value.id]: persona.value.appearance } : {});
const selectedPersona = computed(() => projection.value.personas.find((candidate) => candidate.id === selectedPersonaId.value) ?? null);

watch(persona, (current) => { selectedPersonaId.value = current?.id ?? null; }, { immediate: true });

function selectPersona(personaId: string) {
  if (projection.value.personas.some((candidate) => candidate.id === personaId)) selectedPersonaId.value = personaId;
}

function activityLabel(activity: string) {
  return activity.replace("_", " ");
}
</script>

<template>
  <section class="world-view" aria-labelledby="world-heading">
    <header class="view-intro view-intro--world">
      <div>
        <p class="eyebrow">Preview scene · Saturday · soft morning</p>
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

    <div v-if="personaLoadState === 'idle' || personaLoadState === 'loading'" class="persona-load-state" role="status" aria-live="polite">Loading your saved persona…</div>
    <div v-else-if="personaLoadState === 'error'" class="persona-load-state" role="alert">
      <p>{{ personaLoadError }}</p><button type="button" class="inline-retry" @click="personaStore.ensureLoaded(true)">Retry</button>
    </div>
    <div v-else-if="!persona" class="persona-load-state">
      No persona is saved yet. <RouterLink to="/persona">Create your persona</RouterLink> to enter the preview world.
    </div>

    <WorldScene
      v-if="personaLoadState === 'ready' && persona"
      :world="projection"
      :appearances="appearances"
      :selected-persona-id="selectedPersonaId"
      @select-persona="selectPersona"
    />

    <div class="world-dashboard">
      <section class="world-readout" aria-labelledby="home-now-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Preview at home</p>
            <h2 id="home-now-heading">Home now</h2>
          </div>
          <span class="status-orb" aria-label="Preview world is ready" />
        </div>
        <ul>
          <li v-for="worldPersona in projection.personas" :key="worldPersona.id">
            <button
              type="button"
              :aria-pressed="worldPersona.id === selectedPersonaId"
              @click="selectPersona(worldPersona.id)"
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
      World summary: {{ persona ? `${persona.displayName}'s saved persona is idle in the preview scene.` : "No saved persona is in the preview scene." }} Your available move is
      {{ loadState === "loading" || loadState === "idle" ? "loading" : recommendedMove?.title ?? "complete for today" }}.
      Household progress is level {{ householdLevel }} with {{ householdPoints }} points. The scene remains a preview.
    </p>
  </section>
</template>

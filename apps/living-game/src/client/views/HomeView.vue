<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted } from "vue";

import DailyMoveCard from "../components/DailyMoveCard.vue";
import RestModeToggle from "../components/RestModeToggle.vue";
import WorldScene from "../components/WorldScene.vue";
import { useDailyMovesStore } from "../stores/dailyMoves";
import { useHouseholdStore } from "../stores/household";
import { useProgressStore } from "../stores/progress";
import { useWorldStore } from "../stores/world";

const householdStore = useHouseholdStore();
const movesStore = useDailyMovesStore();
const progressStore = useProgressStore();
const worldStore = useWorldStore();
const { projection, selectedPersona, selectedPersonaId, loadState: worldLoadState, loadError: worldLoadError } = storeToRefs(worldStore);
const { moves, remainingMoves, completedCount, loadState, loadError, feedback } = storeToRefs(movesStore);
const { isAlone } = storeToRefs(householdStore);
const {
  householdLevel,
  householdPoints,
  loadState: progressLoadState,
  loadError: progressLoadError,
} = storeToRefs(progressStore);

// The household comes first: a member arriving here for the first time has no
// household yet, and everything below is scoped to one.
onMounted(async () => {
  await householdStore.ensureLoaded();
  void movesStore.ensureLoaded();
  void progressStore.ensureLoaded();
  void worldStore.ensureLoaded(true);
});
</script>

<template>
  <section class="flex w-[min(100%,71rem)] flex-col gap-6" aria-labelledby="home-heading">
    <header class="view-intro view-intro--world">
      <div>
        <p class="eyebrow">Your household, right now</p>
        <h1 id="home-heading">Our World</h1>
      </div>
      <p v-if="progressLoadState === 'ready'" class="world-level" aria-live="polite">
        <span class="visually-hidden">Household level</span>
        <span class="world-level__badge">{{ householdLevel }}</span>
        <span class="world-level__text">Household · {{ householdPoints }} points</span>
      </p>
      <p v-else-if="progressLoadState === 'idle' || progressLoadState === 'loading'" class="world-level" role="status" aria-live="polite">
        Loading household progress…
      </p>
      <p v-else class="world-level" role="alert">
        {{ progressLoadError }}
        <button type="button" class="inline-retry" @click="progressStore.ensureLoaded(true)">Retry</button>
      </p>
    </header>

    <div v-if="worldLoadState === 'idle' || worldLoadState === 'loading'" class="hb-card" role="status" aria-live="polite">Loading your household…</div>
    <div v-else-if="worldLoadState === 'error'" class="hb-card grid justify-items-start gap-3" role="alert">
      <p>{{ worldLoadError }}</p><button type="button" class="inline-retry" @click="worldStore.ensureLoaded(true)">Retry</button>
    </div>
    <div v-else-if="!projection?.personas.length" class="hb-card">
      Nobody lives here yet. <RouterLink to="/persona">Choose a companion</RouterLink> to bring the place to life.
    </div>

    <figure v-if="worldLoadState === 'ready' && projection?.personas.length" class="m-0 grid gap-2">
      <WorldScene
        :world="projection"
        :selected-persona-id="selectedPersonaId"
        @select-persona="worldStore.selectPersona"
      />
      <figcaption v-if="selectedPersona" class="text-center text-small text-muted" aria-live="polite">{{ selectedPersona.altDescription }}</figcaption>
    </figure>

    <p v-if="isAlone" class="rounded-md bg-accent-soft px-4 py-3 text-center text-small text-accent-deep">
      It's just you here so far. <RouterLink to="/household">Invite your partner</RouterLink> whenever you're ready.
    </p>

    <section class="mt-6 flex flex-col gap-4" aria-labelledby="today-heading">
      <div class="section-heading-row">
        <div>
          <p class="eyebrow">A gentle shortlist</p>
          <h2 id="today-heading">Today's moves</h2>
        </div>
        <p class="count-bubble" aria-live="polite">
          <strong>{{ remainingMoves.length }}</strong> left · {{ completedCount }} done
        </p>
      </div>

      <RestModeToggle />

      <p class="text-small text-accent-deep empty:hidden" aria-live="polite">{{ feedback }}</p>
      <div v-if="loadState === 'idle' || loadState === 'loading'" class="rounded-md border border-line bg-paper p-4 text-small" role="status" aria-live="polite">
        Loading today's moves…
      </div>
      <div v-else-if="loadState === 'error'" class="grid justify-items-start gap-3 rounded-md border border-line bg-paper p-4 text-small" role="alert">
        <p>{{ loadError }}</p>
        <button type="button" class="inline-retry" @click="movesStore.ensureLoaded(true)">Retry</button>
      </div>
      <div v-else-if="moves.length === 0" class="rounded-md border border-line bg-paper p-4 text-small" role="status">
        Nothing needs you today. Your companion is happy pottering about.
      </div>
      <div v-else class="grid gap-4 lg:grid-cols-3" aria-label="Today's moves">
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

    <p class="world-text-equivalent">
      Home summary:
      {{ projection?.personas.length ? `${projection.personas.length} companion${projection.personas.length === 1 ? " is" : "s are"} at home.` : "No companions are at home yet." }}
      {{ loadState === "loading" || loadState === "idle" ? "Today's moves are loading." : `${remainingMoves.length} move${remainingMoves.length === 1 ? " remains" : "s remain"} and ${completedCount} are done.` }}
      Household progress is level {{ householdLevel }} with {{ householdPoints }} points.
    </p>
  </section>
</template>

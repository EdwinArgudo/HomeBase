<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted, ref } from "vue";

import PersonaSprite from "../components/PersonaSprite.vue";
import { worldFixture } from "../fixtures/game";
import { useProgressStore } from "../stores/progress";

const persona = worldFixture.personas[0];
const progressStore = useProgressStore();
const {
  displayName,
  personaLevel,
  personalBalances,
  personalTotalPoints,
  loadState,
  loadError,
} = storeToRefs(progressStore);
const selectedMood = ref<"mint" | "berry" | "sun">("mint");
const dimensionCopy = {
  tend: "Life admin & home",
  move: "Energy & wellbeing",
  grow: "Learning & practice",
  connect: "Time together",
} as const;

onMounted(() => void progressStore.ensureLoaded());
</script>

<template>
  <section class="content-view" aria-labelledby="persona-heading">
    <header class="view-intro">
      <div>
        <p class="eyebrow">Character identity</p>
        <h1 id="persona-heading">My Persona</h1>
      </div>
      <span class="persona-status">Feeling curious</span>
    </header>

    <div v-if="persona" class="persona-layout">
      <section class="persona-card" aria-labelledby="persona-name">
        <div class="persona-stage">
          <PersonaSprite :persona="persona" :variant="selectedMood" static />
        </div>
        <div>
          <p class="eyebrow">Level {{ personaLevel }} · {{ personalTotalPoints }} total points</p>
          <h2 id="persona-name">{{ displayName }}</h2>
          <p>Your progress is live. This sprite and closet remain a cosmetic preview and are not saved yet.</p>
        </div>
      </section>

      <section class="progress-panel" aria-labelledby="progress-heading">
        <p class="eyebrow">Four ways to grow</p>
        <h2 id="progress-heading">Your progress</h2>
        <div v-if="loadState === 'idle' || loadState === 'loading'" class="progress-state" role="status" aria-live="polite">
          Loading your progress…
        </div>
        <div v-else-if="loadState === 'error'" class="progress-state" role="alert">
          <p>{{ loadError }}</p>
          <button type="button" class="inline-retry" @click="progressStore.ensureLoaded(true)">Retry</button>
        </div>
        <template v-else>
          <p v-if="personalTotalPoints === 0" class="progress-state" role="status">
            No progress recorded yet. Every path starts at level 1.
          </p>
          <ul>
            <li v-for="progress in personalBalances" :key="progress.dimension">
              <div>
                <strong>{{ progress.dimension }}</strong>
                <span>{{ dimensionCopy[progress.dimension] }} · {{ progress.lifetimePoints }} points</span>
              </div>
              <div class="mini-progress" role="progressbar" :aria-label="`${progress.dimension} progress to next level`" :aria-valuenow="progress.progressPercent" aria-valuemin="0" aria-valuemax="100">
                <span :style="{ width: `${progress.progressPercent}%` }" />
              </div>
              <b>Lv {{ progress.level }}</b>
            </li>
          </ul>
        </template>
      </section>
    </div>

    <section class="customization-panel" aria-labelledby="customize-heading">
      <div>
        <p class="eyebrow">Closet preview · cosmetic only</p>
        <h2 id="customize-heading">Make it yours</h2>
        <p>Try a color mood now. This preview choice is not persisted.</p>
      </div>
      <div class="swatch-row" role="group" aria-label="Preview color mood">
        <button class="swatch swatch--mint" type="button" aria-label="Preview mint mood" :aria-pressed="selectedMood === 'mint'" @click="selectedMood = 'mint'" />
        <button class="swatch swatch--berry" type="button" aria-label="Preview berry mood" :aria-pressed="selectedMood === 'berry'" @click="selectedMood = 'berry'" />
        <button class="swatch swatch--sun" type="button" aria-label="Preview sunshine mood" :aria-pressed="selectedMood === 'sun'" @click="selectedMood = 'sun'" />
      </div>
    </section>
  </section>
</template>

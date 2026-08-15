<script setup lang="ts">
import { ref } from "vue";

import PersonaSprite from "../components/PersonaSprite.vue";
import { progressFixtures, worldFixture } from "../fixtures/game";

const persona = worldFixture.personas[0];
const selectedMood = ref<"mint" | "berry" | "sun">("mint");
const dimensionCopy = {
  tend: "Life admin & home",
  move: "Energy & wellbeing",
  grow: "Learning & practice",
  connect: "Time together",
  household: "Shared home",
} as const;
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
          <p class="eyebrow">Level 4 · Home tender</p>
          <h2 id="persona-name">{{ persona.displayName }}</h2>
          <p>Your progress changes what Edwin can wear and do, without changing who he is.</p>
        </div>
      </section>

      <section class="progress-panel" aria-labelledby="progress-heading">
        <p class="eyebrow">Four ways to grow</p>
        <h2 id="progress-heading">Your progress</h2>
        <ul>
          <li v-for="progress in progressFixtures" :key="progress.id">
            <div>
              <strong>{{ progress.dimension }}</strong>
              <span>{{ dimensionCopy[progress.dimension] }}</span>
            </div>
            <div class="mini-progress">
              <span :style="{ width: `${progress.lifetimePoints}%` }" />
            </div>
            <b>Lv {{ progress.level }}</b>
          </li>
        </ul>
      </section>
    </div>

    <section class="customization-panel" aria-labelledby="customize-heading">
      <div>
        <p class="eyebrow">Closet preview</p>
        <h2 id="customize-heading">Make it yours</h2>
        <p>Try a color mood now. Outfits and props arrive as you explore.</p>
      </div>
      <div class="swatch-row" role="group" aria-label="Preview color mood">
        <button class="swatch swatch--mint" type="button" aria-label="Preview mint mood" :aria-pressed="selectedMood === 'mint'" @click="selectedMood = 'mint'" />
        <button class="swatch swatch--berry" type="button" aria-label="Preview berry mood" :aria-pressed="selectedMood === 'berry'" @click="selectedMood = 'berry'" />
        <button class="swatch swatch--sun" type="button" aria-label="Preview sunshine mood" :aria-pressed="selectedMood === 'sun'" @click="selectedMood = 'sun'" />
      </div>
    </section>
  </section>
</template>

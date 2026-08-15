<script setup lang="ts">
import WorldScene from "../components/WorldScene.vue";
import { displayWorldFixture } from "../fixtures/game";

const adventure = displayWorldFixture.adventures[0];
</script>

<template>
  <section class="display-view" aria-labelledby="display-heading">
    <header class="display-heading">
      <div>
        <p class="eyebrow">Homebase · Saturday</p>
        <h1 id="display-heading">Apartment Display</h1>
      </div>
      <p><span aria-hidden="true" /> A calm morning at home</p>
    </header>

    <WorldScene :world="displayWorldFixture" display-mode />

    <div class="display-readout">
      <p><strong>Everyone’s here</strong><span>Enjoying a slow start</span></p>
      <p v-if="adventure"><strong>{{ adventure.currentValue }} of {{ adventure.targetValue }}</strong><span>shared dinners</span></p>
      <p><strong>72°</strong><span>soft morning</span></p>
    </div>

    <p class="world-text-equivalent">
      Display summary: Edwin and Vienna are enjoying the apartment. The shared dinner adventure is 1 of 3 complete.
      No personal or financial details are shown.
    </p>
  </section>
</template>

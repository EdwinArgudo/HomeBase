<script setup lang="ts">
import { worldFixture } from "../fixtures/game";

const adventure = worldFixture.adventures[0];
const percent = adventure ? Math.round((adventure.currentValue / adventure.targetValue) * 100) : 0;
</script>

<template>
  <section class="content-view" aria-labelledby="adventures-heading">
    <header class="view-intro">
      <div>
        <p class="eyebrow">Small quests, shared wins</p>
        <h1 id="adventures-heading">Adventures</h1>
      </div>
      <span class="adventure-token" aria-hidden="true">◇</span>
    </header>
    <p class="view-lede">Cooperative goals turn ordinary plans into something you build together.</p>

    <article v-if="adventure" class="adventure-card">
      <div class="adventure-card__art" aria-hidden="true">
        <span class="tiny-table"><span /><span /></span>
        <span class="tiny-heart">♥</span>
      </div>
      <div class="adventure-card__content">
        <p class="eyebrow">This week · Together</p>
        <h2>{{ adventure.title }}</h2>
        <p>One relaxed meal at a time. Any dinner you make together counts.</p>
        <div
          class="progress-track"
          role="progressbar"
          :aria-valuenow="adventure.currentValue"
          aria-valuemin="0"
          :aria-valuemax="adventure.targetValue"
          :aria-label="`${adventure.currentValue} of ${adventure.targetValue} shared dinners`"
        >
          <span :style="{ width: `${percent}%` }" />
        </div>
        <div class="progress-copy">
          <strong>{{ adventure.currentValue }} of {{ adventure.targetValue }} dinners</strong>
          <span>{{ percent }}%</span>
        </div>
      </div>
    </article>

    <aside class="quiet-note">
      <span aria-hidden="true">☼</span>
      <div><strong>No rush.</strong><p>Adventures wait quietly and never take progress away.</p></div>
    </aside>
  </section>
</template>

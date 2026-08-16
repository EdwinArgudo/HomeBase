<script setup lang="ts">
import type { WorldAdventureV1 } from "@homebase/contracts";
import { storeToRefs } from "pinia";
import { onMounted } from "vue";

import { adventureDescription } from "../api/adventures";
import { useAdventuresStore } from "../stores/adventures";

const adventures = useAdventuresStore();
const { snapshot, loadState, loadError, actionState, actionError, feedback } = storeToRefs(adventures);

function percent(adventure: WorldAdventureV1) {
  return Math.min(100, Math.round((adventure.currentValue / adventure.targetValue) * 100));
}

function daysLeft(endsAt: string | null) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(endsAt) - Date.now()) / 86_400_000));
}

// The offer's id carries the template it came from.
function templateKeyOf(adventure: WorldAdventureV1) {
  return adventure.id.startsWith("offer:") ? adventure.id.slice("offer:".length) : "";
}

onMounted(() => void adventures.ensureLoaded());
</script>

<template>
  <section class="content-view" aria-labelledby="adventures-heading">
    <header class="view-intro">
      <div>
        <p class="eyebrow">Small quests, shared wins</p>
        <h1 id="adventures-heading">Adventures</h1>
      </div>
    </header>
    <p class="view-lede">
      A week's worth of shared moves, given a name. Nothing extra to do — the moves you already
      make together carry it along.
    </p>

    <div v-if="loadState === 'idle' || loadState === 'loading'" class="move-state" role="status" aria-live="polite">
      Loading your adventures…
    </div>
    <div v-else-if="loadState === 'error'" class="move-state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="inline-retry" @click="adventures.ensureLoaded(true)">Retry</button>
    </div>

    <template v-else-if="snapshot">
      <section v-if="snapshot.active" class="adventure-card adventure-card--active" aria-labelledby="active-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">This week · together</p>
            <h2 id="active-heading">{{ snapshot.active.title }}</h2>
          </div>
          <span class="count-bubble">{{ daysLeft(snapshot.active.endsAt) }} days left</span>
        </div>
        <p>{{ adventureDescription(snapshot.active.title) }}</p>
        <div
          class="progress-track"
          role="progressbar"
          :aria-label="`${snapshot.active.title} progress`"
          :aria-valuenow="snapshot.active.currentValue"
          aria-valuemin="0"
          :aria-valuemax="snapshot.active.targetValue"
        ><span :style="{ width: `${percent(snapshot.active)}%` }" /></div>
        <p class="adventure-count">
          <strong>{{ snapshot.active.currentValue }} of {{ snapshot.active.targetValue }}</strong>
          <span>Shared moves count on their own — there is nothing to tick off here.</span>
        </p>
      </section>

      <section v-else-if="snapshot.offered" class="adventure-card" aria-labelledby="offer-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">On offer this week</p>
            <h2 id="offer-heading">{{ snapshot.offered.title }}</h2>
          </div>
        </div>
        <p>{{ adventureDescription(snapshot.offered.title) }}</p>
        <p class="adventure-count">
          <strong>{{ snapshot.offered.targetValue }} shared moves</strong>
          <span>Over a week, whenever they happen.</span>
        </p>
        <button
          type="button"
          class="action-button"
          :disabled="actionState !== 'idle'"
          @click="adventures.accept(templateKeyOf(snapshot.offered))"
        >{{ actionState === "starting" ? "Starting…" : "Begin together" }}</button>
      </section>

      <p
        class="adventure-feedback"
        :class="{ 'adventure-feedback--error': actionError }"
        :role="actionError ? 'alert' : 'status'"
        aria-live="polite"
      >{{ actionError || feedback }}</p>

      <p class="quiet-note"><span aria-hidden="true">✿</span>
        <strong>No rush.</strong>
        An adventure that runs out of week simply ends, and a new one is waiting. Nothing is lost.
      </p>

      <section v-if="snapshot.finished.length > 0" class="ledger-panel" aria-labelledby="finished-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Behind you</p>
            <h2 id="finished-heading">Weeks gone by</h2>
          </div>
        </div>
        <ul class="finished-list">
          <li v-for="adventure in snapshot.finished" :key="adventure.id">
            <span class="finished-mark" :class="`finished-mark--${adventure.status}`" aria-hidden="true">
              {{ adventure.status === "complete" ? "✓" : "·" }}
            </span>
            <div>
              <strong>{{ adventure.title }}</strong>
              <span>{{ adventure.currentValue }} of {{ adventure.targetValue }} · {{ adventure.status === "complete" ? "finished together" : "ran out of week" }}</span>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

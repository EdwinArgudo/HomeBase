<script setup lang="ts">
import {
  PERSONA_ACCENTS,
  PERSONA_HAIR_COLORS,
  PERSONA_HAIR_STYLES,
  PERSONA_OUTFITS,
  PERSONA_SKIN_PALETTES,
  type PersonaAppearanceV1,
  type RewardKeyV1,
  type WorldPersonaV1,
} from "@homebase/contracts";
import { storeToRefs } from "pinia";
import { computed, onMounted, reactive, ref, watch } from "vue";

import PersonaSprite from "../components/PersonaSprite.vue";
import { worldFixture } from "../fixtures/game";
import { usePersonaStore } from "../stores/persona";
import { useProgressStore } from "../stores/progress";
import { useRewardsStore } from "../stores/rewards";
import { useWorldStore } from "../stores/world";

const personaStore = usePersonaStore();
const progressStore = useProgressStore();
const rewardsStore = useRewardsStore();
const worldStore = useWorldStore();
const { persona, loadState: personaLoadState, loadError: personaLoadError, actionState, actionError, feedback } = storeToRefs(personaStore);
const { personaLevel, personalBalances, personalTotalPoints, loadState, loadError } = storeToRefs(progressStore);
const {
  snapshot: rewardSnapshot,
  loadState: rewardLoadState,
  loadError: rewardLoadError,
  actionState: rewardActionState,
  actionError: rewardActionError,
  feedback: rewardFeedback,
} = storeToRefs(rewardsStore);
const form = reactive<{ displayName: string; visibility: "private" | "household"; appearance: PersonaAppearanceV1 }>({
  displayName: "",
  visibility: "private",
  appearance: { skinPalette: "warm", hairStyle: "short", hairColor: "espresso", outfit: "mint", accent: "none" },
});
const dirty = ref(false);
const dimensionCopy = {
  tend: "Life admin & home",
  move: "Energy & wellbeing",
  grow: "Learning & practice",
  connect: "Time together",
} as const;

watch(persona, (current) => {
  if (!current || dirty.value) return;
  form.displayName = current.displayName;
  form.visibility = current.visibility;
  Object.assign(form.appearance, current.appearance);
}, { immediate: true });

const previewPersona = computed<WorldPersonaV1>(() => ({
  id: persona.value?.id ?? "persona-manual-preview",
  displayName: form.displayName.trim() || "Your persona",
  altDescription: `Manual pixel persona preview for ${form.displayName.trim() || "the current member"}.`,
  visibility: form.visibility,
  activity: "idle",
  appearance: { ...form.appearance },
  equippedRewardKey: rewardSnapshot.value?.equippedRewardKey ?? null,
  x: 50,
  y: 60,
  manifest: persona.value?.manifest ?? { ...worldFixture.personas[0]!.manifest, personaId: "persona-manual-preview" },
}));

function markDirty() {
  dirty.value = true;
}

async function save() {
  const saved = await personaStore.save({
    contractVersion: 1,
    displayName: form.displayName.trim(),
    visibility: form.visibility,
    appearance: { ...form.appearance },
  });
  if (saved) dirty.value = false;
}

async function equipReward(rewardKey: RewardKeyV1 | null) {
  if (await rewardsStore.equip(rewardKey)) await worldStore.ensureLoaded(true);
}

onMounted(() => void personaStore.ensureLoaded());
onMounted(() => void progressStore.ensureLoaded());
onMounted(() => void rewardsStore.ensureLoaded(true));
</script>

<template>
  <section class="content-view" aria-labelledby="persona-heading">
    <header class="view-intro">
      <div>
        <p class="eyebrow">Character identity · live manual profile</p>
        <h1 id="persona-heading">My Persona</h1>
      </div>
      <span class="persona-status">{{ personaLoadState === "loading" || personaLoadState === "idle" ? "Loading" : persona?.status === "ready" ? "Ready" : persona ? "Draft" : "Not created" }}</span>
    </header>

    <div v-if="personaLoadState === 'idle' || personaLoadState === 'loading'" class="persona-load-state" role="status" aria-live="polite">
      Loading your persona…
    </div>
    <div v-else-if="personaLoadState === 'error'" class="persona-load-state" role="alert">
      <p>{{ personaLoadError }}</p>
      <button type="button" class="inline-retry" @click="personaStore.ensureLoaded(true)">Retry</button>
    </div>

    <div v-else class="persona-layout">
      <section class="persona-card" aria-labelledby="persona-name">
        <div class="persona-stage">
          <PersonaSprite :persona="previewPersona" :appearance="form.appearance" :variant="form.appearance.outfit" static />
        </div>
        <div>
          <p class="eyebrow">Level {{ personaLevel }} · {{ personalTotalPoints }} total points</p>
          <h2 id="persona-name">{{ previewPersona.displayName }}</h2>
          <p>{{ persona ? `Saved ${persona.status} persona` : "No persona saved yet" }}. Appearance is rendered only from approved manual choices.</p>
        </div>
      </section>

      <section class="progress-panel" aria-labelledby="progress-heading">
        <p class="eyebrow">Four ways to grow</p>
        <h2 id="progress-heading">Your progress</h2>
        <div v-if="loadState === 'idle' || loadState === 'loading'" class="progress-state" role="status" aria-live="polite">Loading your progress…</div>
        <div v-else-if="loadState === 'error'" class="progress-state" role="alert">
          <p>{{ loadError }}</p>
          <button type="button" class="inline-retry" @click="progressStore.ensureLoaded(true)">Retry</button>
        </div>
        <template v-else>
          <p v-if="personalTotalPoints === 0" class="progress-state" role="status">No progress recorded yet. Every path starts at level 1.</p>
          <ul>
            <li v-for="progress in personalBalances" :key="progress.dimension">
              <div><strong>{{ progress.dimension }}</strong><span>{{ dimensionCopy[progress.dimension] }} · {{ progress.lifetimePoints }} points</span></div>
              <div class="mini-progress" role="progressbar" :aria-label="`${progress.dimension} progress to next level`" :aria-valuenow="progress.progressPercent" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${progress.progressPercent}%` }" /></div>
              <b>Lv {{ progress.level }}</b>
            </li>
          </ul>
        </template>
      </section>
    </div>

    <section class="reward-shelf" aria-labelledby="reward-shelf-heading">
      <div class="section-heading-row">
        <div><p class="eyebrow">Permanent emblems · live rewards</p><h2 id="reward-shelf-heading">Reward Shelf</h2></div>
        <span v-if="rewardLoadState === 'ready' && rewardSnapshot">{{ rewardSnapshot.rewards.filter((entry) => entry.unlockedAt).length }}/{{ rewardSnapshot.rewards.length }} unlocked</span>
      </div>
      <div v-if="rewardLoadState === 'idle' || rewardLoadState === 'loading'" class="reward-state" role="status" aria-live="polite">Loading your rewards…</div>
      <div v-else-if="rewardLoadState === 'error'" class="reward-state" role="alert">
        <p>{{ rewardLoadError }}</p><button type="button" class="inline-retry" @click="rewardsStore.ensureLoaded(true)">Retry</button>
      </div>
      <p v-else-if="rewardSnapshot?.personaId === null" class="reward-state">Create a persona to begin keeping permanent rewards.</p>
      <ul v-else class="reward-list">
        <li v-for="entry in rewardSnapshot?.rewards ?? []" :key="entry.reward.key" :class="{ 'reward-entry--unlocked': entry.unlockedAt }">
          <span class="reward-emblem" aria-hidden="true">✦</span>
          <div><strong>{{ entry.reward.title }}</strong><span>{{ entry.reward.description }}</span></div>
          <template v-if="!entry.unlockedAt">
            <b>{{ `${Math.min(entry.currentPoints, entry.reward.thresholdPoints)}/${entry.reward.thresholdPoints}` }}</b>
            <button type="button" class="reward-equip" disabled :aria-label="`${entry.reward.title} emblem locked`">Locked</button>
          </template>
          <button
            v-else-if="rewardSnapshot?.equippedRewardKey === entry.reward.key"
            type="button"
            class="reward-equip"
            :disabled="rewardActionState !== 'idle'"
            :aria-label="`Remove ${entry.reward.title} emblem`"
            @click="equipReward(null)"
          >{{ rewardActionState === "equipping" ? "Updating…" : "Equipped · Remove" }}</button>
          <button
            v-else
            type="button"
            class="reward-equip"
            :disabled="rewardActionState !== 'idle'"
            :aria-label="`Equip ${entry.reward.title} emblem`"
            @click="equipReward(entry.reward.key)"
          >{{ rewardActionState === "equipping" ? "Updating…" : "Equip" }}</button>
        </li>
      </ul>
      <p class="reward-action-feedback" :class="{ 'reward-action-feedback--error': rewardActionError }" :role="rewardActionError ? 'alert' : 'status'" aria-live="polite">{{ rewardActionError || rewardFeedback }}</p>
    </section>

    <form v-if="personaLoadState === 'ready'" class="persona-builder" aria-labelledby="customize-heading" @submit.prevent="save">
      <div class="persona-builder__heading">
        <div><p class="eyebrow">Persistent manual builder</p><h2 id="customize-heading">Make it yours</h2></div>
        <p>Approve when it is ready for your world. Approved appearance and name edits stay ready; visibility is then locked.</p>
      </div>
      <div class="persona-builder__controls">
        <label>Display name<input v-model="form.displayName" maxlength="80" required @input="markDirty" /></label>
        <label>Visibility<select v-model="form.visibility" :disabled="persona?.status === 'ready'" @change="markDirty"><option value="private">Only me</option><option value="household">Household</option></select></label>
        <label>Skin palette<select v-model="form.appearance.skinPalette" @change="markDirty"><option v-for="value in PERSONA_SKIN_PALETTES" :key="value" :value="value">{{ value }}</option></select></label>
        <label>Hair style<select v-model="form.appearance.hairStyle" @change="markDirty"><option v-for="value in PERSONA_HAIR_STYLES" :key="value" :value="value">{{ value }}</option></select></label>
        <label>Hair color<select v-model="form.appearance.hairColor" @change="markDirty"><option v-for="value in PERSONA_HAIR_COLORS" :key="value" :value="value">{{ value }}</option></select></label>
        <label>Outfit<select v-model="form.appearance.outfit" @change="markDirty"><option v-for="value in PERSONA_OUTFITS" :key="value" :value="value">{{ value }}</option></select></label>
        <label>Accent<select v-model="form.appearance.accent" @change="markDirty"><option v-for="value in PERSONA_ACCENTS" :key="value" :value="value">{{ value }}</option></select></label>
      </div>
      <div class="persona-builder__actions">
        <button type="submit" class="action-button action-button--primary" :disabled="actionState !== 'idle' || !form.displayName.trim()">{{ actionState === "saving" ? "Saving…" : "Save draft" }}</button>
        <button type="button" class="action-button" :disabled="actionState !== 'idle' || !persona || dirty || persona.status === 'ready'" @click="personaStore.approve">{{ actionState === "approving" ? "Approving…" : persona?.status === "ready" ? "Approved" : "Approve persona" }}</button>
        <span v-if="dirty" class="persona-unsaved">Unsaved changes</span>
      </div>
      <p class="persona-action-feedback" :class="{ 'persona-action-feedback--error': actionError }" :role="actionError ? 'alert' : 'status'" aria-live="polite">{{ actionError || feedback }}</p>
    </form>
  </section>
</template>

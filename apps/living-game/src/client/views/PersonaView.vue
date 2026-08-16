<script setup lang="ts">
import {
  PERSONA_ACCENTS,
  PERSONA_HAIR_COLORS,
  PERSONA_HAIR_STYLES,
  PERSONA_OUTFITS,
  PERSONA_SKIN_PALETTES,
  type PersonaAppearanceV1,
  type WorldPersonaV1,
} from "@homebase/contracts";
import { storeToRefs } from "pinia";
import { computed, onMounted, reactive, ref, watch } from "vue";

import PersonaSprite from "../components/PersonaSprite.vue";
import { worldFixture } from "../fixtures/game";
import { usePersonaStore } from "../stores/persona";
import { useProgressStore } from "../stores/progress";

const personaStore = usePersonaStore();
const progressStore = useProgressStore();
const { persona, loadState: personaLoadState, loadError: personaLoadError, actionState, actionError, feedback } = storeToRefs(personaStore);
const { personaLevel, personalBalances, personalTotalPoints, loadState, loadError } = storeToRefs(progressStore);
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

onMounted(() => void personaStore.ensureLoaded());
onMounted(() => void progressStore.ensureLoaded());
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

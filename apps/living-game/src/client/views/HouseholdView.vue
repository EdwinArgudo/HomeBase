<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted, ref } from "vue";

import { useHouseholdStore } from "../stores/household";

const household = useHouseholdStore();
const { summary, loadState, loadError, actionState, actionError, feedback } = storeToRefs(household);
const partnerEmail = ref("");

onMounted(() => void household.ensureLoaded());

async function invite() {
  if (await household.invite(partnerEmail.value)) partnerEmail.value = "";
}
</script>

<template>
  <section class="content-view" aria-labelledby="household-heading">
    <header class="view-intro">
      <div>
        <p class="eyebrow">Who lives here</p>
        <h1 id="household-heading">Your household</h1>
      </div>
    </header>
    <p class="view-lede">Homebase is built for two. Everything you keep here stays between the people below.</p>

    <div v-if="loadState === 'idle' || loadState === 'loading'" class="move-state" role="status" aria-live="polite">
      Loading your household…
    </div>
    <div v-else-if="loadState === 'error'" class="move-state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="inline-retry" @click="household.ensureLoaded(true)">Retry</button>
    </div>

    <template v-else-if="summary">
      <section class="household-card" aria-labelledby="members-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">{{ summary.householdName }}</p>
            <h2 id="members-heading">Members</h2>
          </div>
        </div>
        <ul class="member-list">
          <li v-for="member in summary.members" :key="member.id">
            <span class="member-initial" aria-hidden="true">{{ member.displayName.slice(0, 1) }}</span>
            <span>
              <strong>{{ member.displayName }}</strong>
              <small>{{ member.isYou ? "You" : "Partner" }}{{ member.role === "owner" ? " · set up this household" : "" }}</small>
            </span>
          </li>
        </ul>
      </section>

      <section v-if="summary.canInvite" class="household-card" aria-labelledby="invite-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">One more person</p>
            <h2 id="invite-heading">Invite your partner</h2>
          </div>
        </div>
        <p>
          Save their email here. The next time they sign in to Homebase they join this household automatically —
          there is nothing for them to accept.
        </p>
        <p v-if="summary.invitation" class="invitation-state">
          Waiting for <strong>{{ summary.invitation.email }}</strong> to sign in.
        </p>
        <form class="invite-form" @submit.prevent="invite">
          <label>
            Partner's email
            <input v-model="partnerEmail" type="email" required autocomplete="email" placeholder="partner@example.com" />
          </label>
          <button type="submit" class="action-button" :disabled="actionState !== 'idle' || partnerEmail.trim().length === 0">
            {{ actionState === "inviting" ? "Saving…" : summary.invitation ? "Update invitation" : "Save invitation" }}
          </button>
        </form>
        <p
          class="household-feedback"
          :class="{ 'household-feedback--error': actionError }"
          :role="actionError ? 'alert' : 'status'"
          aria-live="polite"
        >{{ actionError || feedback }}</p>
      </section>

      <section v-else-if="summary.members.length >= 2" class="household-card">
        <p class="quiet-note-text">Your household is complete. Homebase keeps each person's private details to themselves.</p>
      </section>
    </template>
  </section>
</template>

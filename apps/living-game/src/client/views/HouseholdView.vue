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

    <div v-if="loadState === 'idle' || loadState === 'loading'" class="mt-5 rounded-md border border-line bg-paper p-4 text-small" role="status" aria-live="polite">
      Loading your household…
    </div>
    <div v-else-if="loadState === 'error'" class="mt-5 grid justify-items-start gap-2 rounded-md border border-line bg-paper p-4 text-small" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="inline-retry" @click="household.ensureLoaded(true)">Retry</button>
    </div>

    <template v-else-if="summary">
      <section class="hb-card mt-5 shadow-lift-1" aria-labelledby="members-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">{{ summary.householdName }}</p>
            <h2 id="members-heading">Members</h2>
          </div>
        </div>
        <ul class="mt-4 grid gap-2">
          <li v-for="member in summary.members" :key="member.id" class="flex items-center gap-3">
            <span class="grid size-10 shrink-0 place-items-center rounded-pill bg-accent-soft text-heading font-display text-accent-deep" aria-hidden="true">{{ member.displayName.slice(0, 1) }}</span>
            <span class="grid gap-0.5">
              <strong>{{ member.displayName }}</strong>
              <small class="text-small text-muted">{{ member.isYou ? "You" : "Partner" }}{{ member.role === "owner" ? " · set up this household" : "" }}</small>
            </span>
          </li>
        </ul>
      </section>

      <section v-if="summary.canInvite" class="hb-card mt-4 shadow-lift-1" aria-labelledby="invite-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">One more person</p>
            <h2 id="invite-heading">Invite your partner</h2>
          </div>
        </div>
        <p class="mt-3 max-w-[60ch] text-small text-muted">
          Save their email here. The next time they sign in to Homebase they join this household automatically —
          there is nothing for them to accept.
        </p>
        <p v-if="summary.invitation" class="mt-2 text-small text-muted">
          Waiting for <strong class="text-ink">{{ summary.invitation.email }}</strong> to sign in.
        </p>
        <form class="mt-4 flex flex-wrap items-end gap-3" @submit.prevent="invite">
          <label class="grid flex-1 basis-56 gap-1">
            <span class="hb-label">Partner's email</span>
            <input v-model="partnerEmail" class="hb-field" type="email" required autocomplete="email" placeholder="partner@example.com" />
          </label>
          <button type="submit" class="hb-control hb-control--primary" :disabled="actionState !== 'idle' || partnerEmail.trim().length === 0">
            {{ actionState === "inviting" ? "Saving…" : summary.invitation ? "Update invitation" : "Save invitation" }}
          </button>
        </form>
        <p
          class="mt-3 min-h-5 text-small"
          :class="actionError ? 'text-gap' : 'text-accent-deep'"
          :role="actionError ? 'alert' : 'status'"
          aria-live="polite"
        >{{ actionError || feedback }}</p>
      </section>

      <section v-else-if="summary.members.length >= 2" class="hb-card mt-4 shadow-lift-1">
        <p class="text-small text-muted">Your household is complete. Homebase keeps each person's private details to themselves.</p>
      </section>
    </template>
  </section>
</template>

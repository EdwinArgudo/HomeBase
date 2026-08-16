<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import { usePlansStore } from "../stores/plans";
import { useHouseholdStore } from "../stores/household";

const store = usePlansStore();
const householdStore = useHouseholdStore();
const { snapshot, loadState, loadError, actionError, feedback, actionBusy } = storeToRefs(store);
const { loadState: householdLoadState, loadError: householdLoadError } = storeToRefs(householdStore);
const groceryText = ref("");
const openTasks = computed(() => snapshot.value?.tasks.filter((item) => item.status === "open").length ?? 0);
const openGroceries = computed(() => snapshot.value?.groceries.filter((item) => !item.checked).length ?? 0);
function goalValue(value: number, type: "sessions" | "amount") { return type === "amount" ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100) : `${value} session${value === 1 ? "" : "s"}`; }
async function add() { const text = groceryText.value.trim(); if (!text) return; if (await store.addGrocery(text)) groceryText.value = ""; }
async function bootstrap() {
  await householdStore.ensureLoaded();
  if (householdLoadState.value === "ready") await store.ensureLoaded();
}
onMounted(() => void bootstrap());
</script>

<template>
  <section class="content-view plans-view" aria-labelledby="plans-heading">
    <header class="view-intro"><div><p class="eyebrow">Shared rhythm, private where it matters</p><h1 id="plans-heading">Plans</h1></div></header>
    <div v-if="householdLoadState === 'idle' || householdLoadState === 'loading'" class="plans-state" role="status" aria-live="polite">Preparing your household…</div>
    <div v-else-if="householdLoadState === 'error'" class="plans-state" role="alert"><p>{{ householdLoadError }}</p><button class="inline-retry" type="button" @click="bootstrap">Retry</button></div>
    <div v-else-if="loadState === 'idle' || loadState === 'loading'" class="plans-state" role="status" aria-live="polite">Loading your plans…</div>
    <div v-else-if="loadState === 'error'" class="plans-state" role="alert"><p>{{ loadError }}</p><button class="inline-retry" type="button" @click="store.ensureLoaded(true)">Retry</button></div>
    <template v-else>
      <p class="plans-feedback" :role="actionError ? 'alert' : 'status'" aria-live="polite">{{ actionError || feedback }}</p>
      <div class="plans-grid">
        <section class="plans-panel" aria-labelledby="tasks-heading"><div class="section-heading-row"><div><p class="eyebrow">{{ openTasks }} open</p><h2 id="tasks-heading">Tasks</h2></div></div>
          <p v-if="!snapshot?.tasks.length" class="plans-empty">No tasks need your attention.</p>
          <ul v-else class="plans-list"><li v-for="task in snapshot.tasks" :key="task.id"><button type="button" :disabled="actionBusy" :aria-label="`${task.status === 'complete' ? 'Reopen' : 'Complete'} ${task.title}`" @click="store.toggleTask(task.id)"><span aria-hidden="true">{{ task.status === "complete" ? "✓" : "" }}</span><span><strong>{{ task.title }}</strong><small>{{ task.owner === "you" ? "Only you" : "Together" }}{{ task.dueDate ? ` · due ${task.dueDate}` : "" }}</small></span></button></li></ul>
        </section>
        <section class="plans-panel" aria-labelledby="groceries-heading"><div class="section-heading-row"><div><p class="eyebrow">{{ openGroceries }} to pick up</p><h2 id="groceries-heading">Groceries</h2></div></div>
          <form class="grocery-quick-add" @submit.prevent="add"><label for="grocery-name">Add an item</label><div><input id="grocery-name" v-model="groceryText" maxlength="120" autocomplete="off" :disabled="actionBusy" /><button type="submit" :disabled="actionBusy || !groceryText.trim()">Add</button></div></form>
          <p v-if="!snapshot?.groceries.length" class="plans-empty">The grocery list is clear.</p>
          <ul v-else class="plans-list"><li v-for="item in snapshot.groceries" :key="item.id"><button type="button" :disabled="actionBusy" :aria-label="`${item.checked ? 'Put back' : 'Pick up'} ${item.name}`" @click="store.toggleGrocery(item.id)"><span aria-hidden="true">{{ item.checked ? "✓" : "" }}</span><strong>{{ item.name }}</strong></button></li></ul>
        </section>
        <section class="plans-panel plans-panel--goals" aria-labelledby="goals-heading"><div class="section-heading-row"><div><p class="eyebrow">Real progress, no streaks</p><h2 id="goals-heading">Goals</h2></div></div>
          <p class="plans-note">Progress is logged through completed moves on Today, so this view stays consistent with your real activity.</p>
          <p v-if="!snapshot?.goals.length" class="plans-empty">No active goals right now.</p>
          <ul v-else class="goal-list"><li v-for="goal in snapshot.goals" :key="goal.id"><div><strong>{{ goal.name }}</strong><small>{{ goal.ownership === "shared" ? "Together" : "Only you" }}</small></div><div class="goal-progress"><span><i :style="{ width: `${Math.min(100, Math.round(goal.currentValue / goal.targetValue * 100))}%` }" /></span><b>{{ goalValue(goal.currentValue, goal.trackingType) }} / {{ goalValue(goal.targetValue, goal.trackingType) }}</b></div><small v-if="goal.minimumValue">A gentle minimum: {{ goalValue(goal.minimumValue, goal.trackingType) }}</small></li></ul>
        </section>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import type { PlanGoalOwnership, PlanGoalTrackingType } from "@homebase/contracts";
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

/**
 * Money is typed in dollars and stored in cents; sessions are counted whole.
 * Anything that does not round to at least one unit is not a log, so the
 * button stays disabled rather than sending a zero the server would reject.
 */
const amountDrafts = ref<Record<string, string>>({});
function loggedValue(id: string, type: "sessions" | "amount") {
  if (type === "sessions") return 1;
  const dollars = Number.parseFloat(amountDrafts.value[id] ?? "");
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
}
async function logGoal(id: string, type: "sessions" | "amount") {
  const value = loggedValue(id, type);
  if (value < 1) return;
  if (await store.logGoal(id, value)) amountDrafts.value = { ...amountDrafts.value, [id]: "" };
}

// Finishing a goal is not undoable from here, so it asks once in place.
const retiring = ref("");
async function retireGoal(id: string) {
  retiring.value = "";
  await store.retireGoal(id);
}

const composing = ref(false);
const draft = ref({ text: "", ownership: "shared" as PlanGoalOwnership, trackingType: "sessions" as PlanGoalTrackingType, target: "" });
const draftTarget = computed(() => {
  const entered = Number.parseFloat(draft.value.target);
  if (!Number.isFinite(entered) || entered <= 0) return 0;
  return draft.value.trackingType === "amount" ? Math.round(entered * 100) : Math.round(entered);
});
async function addGoal() {
  const text = draft.value.text.trim();
  if (!text || draftTarget.value < 1) return;
  const added = await store.addGoal({
    text,
    ownership: draft.value.ownership,
    trackingType: draft.value.trackingType,
    targetValue: draftTarget.value,
  });
  if (!added) return;
  draft.value = { text: "", ownership: "shared", trackingType: "sessions", target: "" };
  composing.value = false;
}
async function bootstrap() {
  await householdStore.ensureLoaded();
  if (householdLoadState.value === "ready") await store.ensureLoaded();
}
onMounted(() => void bootstrap());
</script>

<template>
  <section class="content-view" aria-labelledby="plans-heading">
    <header class="view-intro"><div><p class="eyebrow">Shared rhythm, private where it matters</p><h1 id="plans-heading">Plans</h1></div></header>

    <div v-if="householdLoadState === 'idle' || householdLoadState === 'loading'" class="p-4" role="status" aria-live="polite">Preparing your household…</div>
    <div v-else-if="householdLoadState === 'error'" class="p-4" role="alert"><p>{{ householdLoadError }}</p><button class="inline-retry" type="button" @click="bootstrap">Retry</button></div>
    <div v-else-if="loadState === 'idle' || loadState === 'loading'" class="p-4" role="status" aria-live="polite">Loading your plans…</div>
    <div v-else-if="loadState === 'error'" class="p-4" role="alert"><p>{{ loadError }}</p><button class="inline-retry" type="button" @click="store.ensureLoaded(true)">Retry</button></div>

    <template v-else>
      <p class="min-h-5 mb-3 text-small" :class="actionError ? 'text-gap' : 'text-muted'" :role="actionError ? 'alert' : 'status'" aria-live="polite">{{ actionError || feedback }}</p>

      <div class="grid gap-4 md:grid-cols-2">
        <section class="hb-card" aria-labelledby="tasks-heading">
          <div class="section-heading-row"><div><p class="eyebrow">{{ openTasks }} open</p><h2 id="tasks-heading">Tasks</h2></div></div>
          <p v-if="!snapshot?.tasks.length" class="mt-4 text-small text-muted">No tasks need your attention.</p>
          <ul v-else class="mt-4 grid gap-2">
            <li v-for="task in snapshot.tasks" :key="task.id">
              <button
                class="hb-row"
                type="button"
                :disabled="actionBusy"
                :aria-label="`${task.status === 'complete' ? 'Reopen' : 'Complete'} ${task.title}`"
                @click="store.toggleTask(task.id)"
              >
                <span class="grid size-5 shrink-0 place-items-center rounded-xs border border-accent-deep text-accent-deep" aria-hidden="true">{{ task.status === "complete" ? "✓" : "" }}</span>
                <span class="grid gap-0.5">
                  <strong :class="task.status === 'complete' ? 'text-muted line-through' : ''">{{ task.title }}</strong>
                  <small class="text-label text-muted">{{ task.owner === "you" ? "Only you" : "Together" }}{{ task.dueDate ? ` · due ${task.dueDate}` : "" }}</small>
                </span>
              </button>
            </li>
          </ul>
        </section>

        <section class="hb-card" aria-labelledby="groceries-heading">
          <div class="section-heading-row"><div><p class="eyebrow">{{ openGroceries }} to pick up</p><h2 id="groceries-heading">Groceries</h2></div></div>
          <form class="mt-4 grid gap-1" aria-label="Add a grocery item" @submit.prevent="add">
            <label class="hb-label" for="grocery-name">Add an item</label>
            <div class="grid grid-cols-[1fr_auto] gap-2">
              <input id="grocery-name" v-model="groceryText" class="hb-field" maxlength="120" autocomplete="off" :disabled="actionBusy" />
              <button class="hb-control hb-control--primary" type="submit" :disabled="actionBusy || !groceryText.trim()">Add</button>
            </div>
          </form>
          <p v-if="!snapshot?.groceries.length" class="mt-4 text-small text-muted">The grocery list is clear.</p>
          <ul v-else class="mt-4 grid gap-2">
            <li v-for="item in snapshot.groceries" :key="item.id">
              <button
                class="hb-row"
                type="button"
                :disabled="actionBusy"
                :aria-label="`${item.checked ? 'Put back' : 'Pick up'} ${item.name}`"
                @click="store.toggleGrocery(item.id)"
              >
                <span class="grid size-5 shrink-0 place-items-center rounded-xs border border-accent-deep text-accent-deep" aria-hidden="true">{{ item.checked ? "✓" : "" }}</span>
                <strong :class="item.checked ? 'text-muted line-through' : ''">{{ item.name }}</strong>
              </button>
            </li>
          </ul>
        </section>

        <section class="hb-card md:col-span-2" aria-labelledby="goals-heading">
          <div class="section-heading-row">
            <div><p class="eyebrow">Real progress, no streaks</p><h2 id="goals-heading">Goals</h2></div>
            <button class="hb-control hb-control--primary" type="button" :aria-expanded="composing" @click="composing = !composing">{{ composing ? "Cancel" : "New goal" }}</button>
          </div>
          <p class="mt-1 text-small text-muted">Log it here or finish a move on Today — both count the same way.</p>

          <form v-if="composing" class="mt-4 grid gap-3 rounded-md bg-canvas p-4" aria-label="Add a goal" @submit.prevent="addGoal">
            <div class="grid gap-1">
              <label class="hb-label" for="goal-name">What are you working toward?</label>
              <input id="goal-name" v-model="draft.text" class="hb-field" maxlength="120" autocomplete="off" :disabled="actionBusy" />
            </div>
            <div class="grid gap-3 sm:grid-cols-3">
              <div class="grid gap-1">
                <label class="hb-label" for="goal-ownership">Who it&apos;s for</label>
                <select id="goal-ownership" v-model="draft.ownership" class="hb-field" :disabled="actionBusy">
                  <option value="shared">Together</option>
                  <option value="personal">Only you</option>
                </select>
              </div>
              <div class="grid gap-1">
                <label class="hb-label" for="goal-tracking">Counted in</label>
                <select id="goal-tracking" v-model="draft.trackingType" class="hb-field" :disabled="actionBusy">
                  <option value="sessions">Sessions</option>
                  <option value="amount">Dollars</option>
                </select>
              </div>
              <div class="grid gap-1">
                <label class="hb-label" for="goal-target">Target</label>
                <input id="goal-target" v-model="draft.target" class="hb-field" inputmode="decimal" autocomplete="off" :disabled="actionBusy" />
              </div>
            </div>
            <button class="hb-control hb-control--primary justify-self-start" type="submit" :disabled="actionBusy || !draft.text.trim() || draftTarget < 1">Add goal</button>
          </form>

          <p v-if="!snapshot?.goals.length" class="mt-4 text-small text-muted">No active goals right now.</p>
          <ul v-else class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <li v-for="goal in snapshot.goals" :key="goal.id" class="grid content-start gap-3 rounded-md bg-canvas p-4">
              <div class="grid gap-0.5">
                <strong class="text-heading leading-tight">{{ goal.name }}</strong>
                <small class="text-label text-muted">{{ goal.ownership === "shared" ? "Together" : "Only you" }}</small>
              </div>

              <div class="grid gap-1.5">
                <span class="block h-1.5 overflow-hidden rounded-pill bg-line">
                  <i class="block h-full rounded-pill bg-accent-deep" :style="{ width: `${Math.min(100, Math.round(goal.currentValue / goal.targetValue * 100))}%` }" />
                </span>
                <b class="text-small tabular-nums">{{ goalValue(goal.currentValue, goal.trackingType) }} / {{ goalValue(goal.targetValue, goal.trackingType) }}</b>
                <small v-if="goal.minimumValue" class="text-label text-muted">A gentle minimum: {{ goalValue(goal.minimumValue, goal.trackingType) }}</small>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <template v-if="goal.trackingType === 'amount'">
                  <label class="sr-only" :for="`goal-amount-${goal.id}`">Amount to add to {{ goal.name }}</label>
                  <input :id="`goal-amount-${goal.id}`" v-model="amountDrafts[goal.id]" class="hb-field w-24" inputmode="decimal" autocomplete="off" placeholder="$0.00" :disabled="actionBusy" />
                </template>
                <button
                  class="hb-control hb-control--primary"
                  type="button"
                  :aria-label="goal.trackingType === 'amount' ? `Add to ${goal.name}` : `Log a session for ${goal.name}`"
                  :disabled="actionBusy || loggedValue(goal.id, goal.trackingType) < 1"
                  @click="logGoal(goal.id, goal.trackingType)"
                >{{ goal.trackingType === "amount" ? "Add" : "Log a session" }}</button>

                <button v-if="retiring !== goal.id" class="hb-control hb-control--quiet" type="button" :aria-label="`Finish ${goal.name}`" :disabled="actionBusy" @click="retiring = goal.id">Finish</button>
                <template v-else>
                  <span class="text-label font-[var(--weight-display)]">Finish this goal?</span>
                  <button class="hb-control hb-control--quiet" type="button" :aria-label="`Yes, finish ${goal.name}`" :disabled="actionBusy" @click="retireGoal(goal.id)">Yes, finish</button>
                  <button class="hb-control" type="button" :aria-label="`Keep ${goal.name}`" :disabled="actionBusy" @click="retiring = ''">Keep it</button>
                </template>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </section>
</template>

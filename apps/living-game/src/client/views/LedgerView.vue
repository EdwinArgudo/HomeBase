<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted, reactive } from "vue";

import type { LedgerScope } from "../api/ledger";
import { useLedgerStore } from "../stores/ledger";

const ledger = useLedgerStore();
const { snapshot, loadState, loadError, busyTransactionIds, actionError, feedback } = storeToRefs(ledger);

const scopeLabels: Record<LedgerScope, string> = { ours: "Ours", mine: "Mine", yours: "Yours" };
const drafts = reactive<Record<string, { categoryId: string; createRule: boolean }>>({});

function draftFor(transactionId: string) {
  if (!drafts[transactionId]) drafts[transactionId] = { categoryId: "", createRule: false };
  return drafts[transactionId]!;
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function percent(spent: number, limit: number) {
  return limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
}

async function file(transactionId: string) {
  const draft = draftFor(transactionId);
  if (await ledger.review(transactionId, draft.categoryId, draft.createRule)) delete drafts[transactionId];
}

onMounted(() => void ledger.ensureLoaded());
</script>

<template>
  <section class="content-view" aria-labelledby="ledger-heading">
    <header class="view-intro">
      <div>
        <p class="eyebrow">Exact detail, when you want it</p>
        <h1 id="ledger-heading">The Ledger</h1>
      </div>
      <span v-if="snapshot" class="connection-pill">{{ snapshot.monthLabel }}</span>
    </header>
    <p class="view-lede">Every number Homebase keeps, separate from the calm of your home.</p>

    <div v-if="loadState === 'idle' || loadState === 'loading'" class="move-state" role="status" aria-live="polite">
      Loading your ledger…
    </div>
    <div v-else-if="loadState === 'error'" class="move-state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="inline-retry" @click="ledger.ensureLoaded(true)">Retry</button>
    </div>

    <template v-else-if="snapshot">
      <section class="ledger-panel" aria-labelledby="review-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Uncertain purchases</p>
            <h2 id="review-heading">Needs a quick look</h2>
          </div>
          <span class="count-bubble"><strong>{{ snapshot.needsReview.length }}</strong> waiting</span>
        </div>

        <p v-if="snapshot.needsReview.length === 0" class="ledger-empty">
          Nothing is waiting. Homebase files anything it recognises on its own.
        </p>
        <ul v-else class="review-list">
          <li v-for="transaction in snapshot.needsReview" :key="transaction.id">
            <div class="review-row">
              <div class="review-row__what">
                <strong>{{ transaction.merchant }}</strong>
                <span>{{ transaction.detail }}</span>
              </div>
              <b class="review-row__amount">{{ money(transaction.amount) }}</b>
            </div>
            <div class="review-row__controls">
              <label>
                <span class="visually-hidden">Category for {{ transaction.merchant }}</span>
                <select v-model="draftFor(transaction.id).categoryId" :disabled="busyTransactionIds.has(transaction.id)">
                  <option value="">Choose a category</option>
                  <option v-for="choice in snapshot.categoryChoices" :key="choice.id" :value="choice.id">
                    {{ choice.name }} · {{ scopeLabels[choice.scope] }}
                  </option>
                </select>
              </label>
              <label class="rule-option">
                <input
                  v-model="draftFor(transaction.id).createRule"
                  type="checkbox"
                  :disabled="busyTransactionIds.has(transaction.id)"
                >
                Remember this merchant
              </label>
              <button
                type="button"
                class="action-button"
                :disabled="busyTransactionIds.has(transaction.id) || draftFor(transaction.id).categoryId === ''"
                @click="file(transaction.id)"
              >{{ busyTransactionIds.has(transaction.id) ? "Filing…" : "File it" }}</button>
            </div>
          </li>
        </ul>
        <p
          class="ledger-feedback"
          :class="{ 'ledger-feedback--error': actionError }"
          :role="actionError ? 'alert' : 'status'"
          aria-live="polite"
        >{{ actionError || feedback }}</p>
      </section>

      <section v-for="scope in (['ours', 'mine', 'yours'] as LedgerScope[])" :key="scope" class="ledger-panel">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">{{ scopeLabels[scope] }}</p>
            <h2>{{ scope === "ours" ? "Shared spending" : scope === "mine" ? "Your spending" : "Your partner's spending" }}</h2>
          </div>
        </div>
        <p v-if="snapshot.budgets[scope].length === 0" class="ledger-empty">No categories here yet.</p>
        <ul v-else class="budget-list">
          <li v-for="category in snapshot.budgets[scope]" :key="category.id">
            <div class="budget-row">
              <strong>{{ category.name }}</strong>
              <span>{{ money(category.spent) }} of {{ money(category.limit) }}</span>
            </div>
            <div
              class="mini-progress"
              role="progressbar"
              :aria-label="`${category.name} spending`"
              :aria-valuenow="percent(category.spent, category.limit)"
              aria-valuemin="0"
              aria-valuemax="100"
            ><span :style="{ width: `${percent(category.spent, category.limit)}%` }" /></div>
          </li>
        </ul>
      </section>

      <section class="ledger-panel" aria-labelledby="recent-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Filed automatically</p>
            <h2 id="recent-heading">Recent purchases</h2>
          </div>
        </div>
        <p v-if="snapshot.recent.length === 0" class="ledger-empty">No purchases this month yet.</p>
        <ul v-else class="recent-list">
          <li v-for="transaction in snapshot.recent" :key="transaction.id">
            <div class="review-row__what">
              <strong>{{ transaction.merchant }}</strong>
              <span>{{ transaction.category }} · {{ transaction.scope }}</span>
            </div>
            <b>{{ money(transaction.amount) }}</b>
          </li>
        </ul>
      </section>

      <section class="ledger-panel" aria-labelledby="connections-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Where the numbers come from</p>
            <h2 id="connections-heading">Connections</h2>
          </div>
          <span class="connection-pill">{{ snapshot.merchantRuleCount }} merchant rules</span>
        </div>
        <p v-if="!snapshot.plaidConfigured" class="ledger-empty">
          No bank is connected yet, so these figures come from Homebase's demonstration data.
        </p>
        <ul v-else-if="snapshot.connections.length === 0" class="ledger-empty">No connections yet.</ul>
        <ul v-else class="connection-list">
          <li v-for="connection in snapshot.connections" :key="connection.id" :class="`connection--${connection.health}`">
            <div class="review-row__what">
              <strong>{{ connection.institutionName }}</strong>
              <span>{{ connection.healthMessage }}</span>
            </div>
            <b>{{ connection.healthLabel }}</b>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

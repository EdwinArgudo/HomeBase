<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted, reactive, ref } from "vue";

import { amountInCents, type LedgerCategory, type LedgerScope, type LedgerSnapshot } from "../api/ledger";
import { useLedgerStore } from "../stores/ledger";

const ledger = useLedgerStore();
const { snapshot, loadState, loadError, busyTransactionIds, actionError, feedback, bankState } = storeToRefs(ledger);
const connectionScope = ref<"ours" | "mine">("ours");

const scopeLabels: Record<LedgerScope, string> = { ours: "Ours", mine: "Mine", yours: "Yours" };
const drafts = reactive<Record<string, { categoryId: string; createRule: boolean }>>({});
const splitDrafts = reactive<Record<string, { categoryId: string; amount: string | number }[]>>({});

function draftFor(transactionId: string) {
  if (!drafts[transactionId]) drafts[transactionId] = { categoryId: "", createRule: false };
  return drafts[transactionId]!;
}

function splitRowsFor(transactionId: string) {
  return splitDrafts[transactionId];
}

function beginSplit(transactionId: string) {
  splitDrafts[transactionId] = [{ categoryId: "", amount: "" }, { categoryId: "", amount: "" }];
}

function cancelSplit(transactionId: string) {
  delete splitDrafts[transactionId];
}

function splitParts(transactionId: string) {
  return (splitDrafts[transactionId] ?? [])
    .filter((row) => row.categoryId.length > 0 && String(row.amount).trim().length > 0)
    .map((row) => ({ categoryId: row.categoryId, amountCents: amountInCents(Number(row.amount)) }))
    .filter((part) => Number.isInteger(part.amountCents) && part.amountCents > 0);
}

// The server requires the parts to add up exactly, so the remainder is shown
// here and the button stays closed until it reaches zero.
function remainderCents(transactionId: string, total: number) {
  return amountInCents(total) - splitParts(transactionId).reduce((sum, part) => sum + part.amountCents, 0);
}

function splitReady(transactionId: string, total: number) {
  const parts = splitParts(transactionId);
  const uniqueCategories = new Set(parts.map((part) => part.categoryId));
  return parts.length >= 2 && uniqueCategories.size === parts.length && remainderCents(transactionId, total) === 0;
}

const editingScope = ref<LedgerScope | null>(null);
const limitDrafts = reactive<Record<string, { limit: string | number; rolloverEnabled: boolean }>>({});
const newCategory = reactive({ name: "", limit: "" as string | number });

function beginEditing(scope: LedgerScope) {
  editingScope.value = scope;
  newCategory.name = "";
  newCategory.limit = "";
  for (const key of Object.keys(limitDrafts)) delete limitDrafts[key];
}

// Lazily, so a category added mid-edit has a draft the moment it appears.
function limitDraftFor(category: LedgerCategory) {
  if (!limitDrafts[category.id]) {
    limitDrafts[category.id] = { limit: category.baseLimit, rolloverEnabled: category.rolloverEnabled };
  }
  return limitDrafts[category.id]!;
}

function stopEditing() {
  editingScope.value = null;
  for (const key of Object.keys(limitDrafts)) delete limitDrafts[key];
}

// Only what actually moved is sent; the server treats each change as a decision.
function limitChanges(categories: LedgerCategory[]) {
  return categories
    .filter((category) => category.editable && limitDrafts[category.id])
    .map((category) => ({
      id: category.id,
      limitCents: amountInCents(Number(limitDrafts[category.id]!.limit)),
      rolloverEnabled: limitDrafts[category.id]!.rolloverEnabled,
    }))
    .filter((change) => Number.isInteger(change.limitCents) && change.limitCents >= 0)
    .filter((change) => {
      const category = categories.find((entry) => entry.id === change.id)!;
      return change.limitCents !== amountInCents(category.baseLimit)
        || change.rolloverEnabled !== category.rolloverEnabled;
    });
}

async function saveLimits(categories: LedgerCategory[]) {
  if (await ledger.saveLimits(limitChanges(categories))) stopEditing();
}

async function addCategory(scope: LedgerScope) {
  if (scope === "yours") return;
  const limitCents = amountInCents(Number(newCategory.limit));
  if (!Number.isInteger(limitCents) || limitCents < 0) return;
  if (await ledger.createCategory({ scope, name: String(newCategory.name), limitCents })) {
    newCategory.name = "";
    newCategory.limit = "";
  }
}

async function saveSplit(transactionId: string) {
  if (await ledger.split(transactionId, splitParts(transactionId))) cancelSplit(transactionId);
}

// Budget bars read better in whole dollars; anything a person has to reconcile
// against a receipt shows its cents.
function money(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function exactMoney(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

// A refund is money coming back, so it reads as a credit rather than a purchase
// with a minus sign in front of it.
function signedMoney(value: number) {
  return value < 0 ? `+${exactMoney(Math.abs(value))}` : exactMoney(value);
}

// The month at a glance, over what this member can see and plan: shared
// spending and their own. A partner's is theirs to read.
function monthTotals(current: LedgerSnapshot) {
  const categories = [...current.budgets.ours, ...current.budgets.mine];
  const spent = categories.reduce((sum, category) => sum + category.spent, 0);
  const limit = categories.reduce((sum, category) => sum + category.limit, 0);
  const pace = current.elapsedDays > 0 ? (spent / current.elapsedDays) * current.daysInMonth : spent;
  return { spent, limit, left: limit - spent, projected: current.isCurrentMonth ? pace : spent };
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
      <div v-if="snapshot" class="month-nav">
        <button
          type="button"
          class="hb-control hb-control--quiet"
          aria-label="Previous month"
          :disabled="loadState === 'loading'"
          @click="ledger.viewMonth(snapshot.previousMonth)"
        >‹</button>
        <span class="connection-pill" aria-live="polite">{{ snapshot.monthLabel }}</span>
        <button
          type="button"
          class="hb-control hb-control--quiet"
          aria-label="Next month"
          :disabled="!snapshot.nextMonth || loadState === 'loading'"
          @click="snapshot.nextMonth && ledger.viewMonth(snapshot.nextMonth)"
        >›</button>
      </div>
    </header>
    <p class="view-lede">Every number Homebase keeps, separate from the calm of your home.</p>

    <div v-if="loadState === 'idle' || loadState === 'loading'" class="rounded-md border border-line bg-paper p-4 text-small" role="status" aria-live="polite">
      Loading your ledger…
    </div>
    <div v-else-if="loadState === 'error'" class="rounded-md border border-line bg-paper p-4 text-small" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="inline-retry" @click="ledger.ensureLoaded(true)">Retry</button>
    </div>

    <template v-else-if="snapshot">
      <section class="ledger-panel month-summary" aria-labelledby="month-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">{{ snapshot.isCurrentMonth ? "So far this month" : "How it finished" }}</p>
            <h2 id="month-heading">{{ snapshot.monthLabel }}</h2>
          </div>
          <span class="count-bubble">
            {{ snapshot.isCurrentMonth ? `${snapshot.daysRemaining} days to go` : "Closed" }}
          </span>
        </div>
        <div class="month-figures">
          <div>
            <span>{{ snapshot.isCurrentMonth ? "Left to spend" : "Final balance" }}</span>
            <strong :class="{ 'month-figure--over': monthTotals(snapshot).left < 0 }">
              {{ exactMoney(monthTotals(snapshot).left) }}
            </strong>
          </div>
          <div>
            <span>Spent</span>
            <strong>{{ exactMoney(monthTotals(snapshot).spent) }} of {{ money(monthTotals(snapshot).limit) }}</strong>
          </div>
          <div>
            <span>{{ snapshot.isCurrentMonth ? "On track for" : "Total" }}</span>
            <strong>{{ exactMoney(monthTotals(snapshot).projected) }}</strong>
          </div>
        </div>
        <p v-if="!snapshot.isCurrentMonth" class="ledger-empty">
          Limits are set in the current month. A purchase can still be corrected here — noticing a
          mis-filed card payment is exactly what looking back is for.
        </p>
      </section>

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
                <span>
                  {{ transaction.detail }}
                  <template v-if="transaction.isRefund"> · money coming back</template>
                </span>
              </div>
              <b class="review-row__amount" :class="{ 'review-row__amount--refund': transaction.isRefund }">
                {{ signedMoney(transaction.amount) }}
              </b>
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
              <label class="mt-1 flex items-center gap-2 text-small font-strong text-muted">
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
              <button
                v-if="!splitRowsFor(transaction.id)"
                type="button"
                class="hb-control hb-control--quiet"
                @click="beginSplit(transaction.id)"
              >Split it</button>
              <button
                v-if="!splitRowsFor(transaction.id)"
                type="button"
                class="hb-control hb-control--quiet"
                :disabled="busyTransactionIds.has(transaction.id)"
                @click="ledger.setTransfer(transaction.id, true)"
              >Not spending</button>
            </div>

            <div v-if="splitRowsFor(transaction.id)" class="split-editor">
              <p class="split-editor__lede">Divide {{ exactMoney(transaction.amount) }} between categories. The parts have to add up exactly.</p>
              <div v-for="(row, index) in splitRowsFor(transaction.id)" :key="index" class="split-row">
                <label>
                  <span class="visually-hidden">Split {{ index + 1 }} category</span>
                  <select v-model="row.categoryId" :disabled="busyTransactionIds.has(transaction.id)">
                    <option value="">Choose a category</option>
                    <option v-for="choice in snapshot.categoryChoices" :key="choice.id" :value="choice.id">
                      {{ choice.name }} · {{ scopeLabels[choice.scope] }}
                    </option>
                  </select>
                </label>
                <label>
                  <span class="visually-hidden">Split {{ index + 1 }} amount</span>
                  <input
                    v-model="row.amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputmode="decimal"
                    placeholder="0.00"
                    :disabled="busyTransactionIds.has(transaction.id)"
                  >
                </label>
                <button
                  v-if="splitRowsFor(transaction.id)!.length > 2"
                  type="button"
                  class="hb-control hb-control--quiet"
                  :aria-label="`Remove split ${index + 1}`"
                  @click="splitRowsFor(transaction.id)!.splice(index, 1)"
                >Remove</button>
              </div>

              <div class="split-editor__actions">
                <button
                  type="button"
                  class="hb-control hb-control--quiet"
                  :disabled="splitRowsFor(transaction.id)!.length >= 10"
                  @click="splitRowsFor(transaction.id)!.push({ categoryId: '', amount: '' })"
                >Add a part</button>
                <p class="split-remainder" :class="{ 'split-remainder--settled': remainderCents(transaction.id, transaction.amount) === 0 }" aria-live="polite">
                  {{ remainderCents(transaction.id, transaction.amount) === 0
                    ? "Adds up exactly"
                    : `${exactMoney(remainderCents(transaction.id, transaction.amount) / 100)} left to place` }}
                </p>
                <button
                  type="button"
                  class="action-button"
                  :disabled="busyTransactionIds.has(transaction.id) || !splitReady(transaction.id, transaction.amount)"
                  @click="saveSplit(transaction.id)"
                >{{ busyTransactionIds.has(transaction.id) ? "Saving…" : "Save split" }}</button>
                <button type="button" class="hb-control hb-control--quiet" @click="cancelSplit(transaction.id)">Cancel</button>
              </div>
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
          <button
            v-if="scope !== 'yours' && snapshot.isCurrentMonth && editingScope !== scope"
            type="button"
            class="hb-control hb-control--quiet"
            @click="beginEditing(scope)"
          >Adjust limits</button>
        </div>

        <p v-if="scope === 'yours' && snapshot.budgets[scope].length > 0" class="ledger-empty">
          Your partner sets these. Anything they keep private arrives as a single total.
        </p>
        <p v-else-if="scope !== 'yours' && !snapshot.isCurrentMonth" class="ledger-empty">
          {{ snapshot.monthLabel }} has finished, so its limits are fixed.
        </p>

        <p v-if="snapshot.budgets[scope].length === 0" class="ledger-empty">No categories here yet.</p>
        <ul v-else class="budget-list">
          <li v-for="category in snapshot.budgets[scope]" :key="category.id">
            <div class="budget-row">
              <strong>{{ category.name }}</strong>
              <span v-if="editingScope !== scope || !category.editable">
                {{ money(category.spent) }} of {{ money(category.limit) }}
                <template v-if="category.rollover > 0"> · {{ money(category.rollover) }} carried over</template>
              </span>
            </div>
            <div
              v-if="editingScope !== scope || !category.editable"
              class="mini-progress"
              role="progressbar"
              :aria-label="`${category.name} spending`"
              :aria-valuenow="percent(category.spent, category.limit)"
              aria-valuemin="0"
              aria-valuemax="100"
            ><span :style="{ width: `${percent(category.spent, category.limit)}%` }" /></div>
            <div v-else class="limit-row">
              <label>
                <span class="visually-hidden">{{ category.name }} monthly limit</span>
                <input
                  v-model="limitDraftFor(category).limit"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="decimal"
                >
              </label>
              <label class="mt-1 flex items-center gap-2 text-small font-strong text-muted">
                <input v-model="limitDraftFor(category).rolloverEnabled" type="checkbox">
                Carry over what is left
              </label>
            </div>
          </li>
        </ul>

        <div v-if="editingScope === scope" class="limit-editor">
          <div class="split-row">
            <label>
              <span class="visually-hidden">New category name</span>
              <input v-model="newCategory.name" type="text" maxlength="50" placeholder="New category">
            </label>
            <label>
              <span class="visually-hidden">New category monthly limit</span>
              <input v-model="newCategory.limit" type="number" min="0" step="1" inputmode="decimal" placeholder="Limit">
            </label>
            <button
              type="button"
              class="hb-control hb-control--quiet"
              :disabled="String(newCategory.name).trim().length === 0 || String(newCategory.limit).trim().length === 0"
              @click="addCategory(scope)"
            >Add category</button>
          </div>
          <div class="split-editor__actions">
            <p class="split-remainder split-remainder--settled" aria-live="polite">
              {{ limitChanges(snapshot.budgets[scope]).length === 0
                ? "Nothing changed yet"
                : `${limitChanges(snapshot.budgets[scope]).length} limit${limitChanges(snapshot.budgets[scope]).length === 1 ? "" : "s"} to save` }}
            </p>
            <button
              type="button"
              class="action-button"
              :disabled="limitChanges(snapshot.budgets[scope]).length === 0"
              @click="saveLimits(snapshot.budgets[scope])"
            >Save limits</button>
            <button type="button" class="hb-control hb-control--quiet" @click="stopEditing()">Done</button>
          </div>
        </div>
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
              <span>
                <template v-if="transaction.isTransfer">Moving money · not counted as spending</template>
                <template v-else-if="transaction.isRefund">Money back into {{ transaction.category }} · {{ transaction.scope }}</template>
                <template v-else>{{ transaction.category }} · {{ transaction.scope }}</template>
              </span>
            </div>
            <!-- A card payment usually arrives already filed as spending, so
                 correcting one has to be possible after the fact. -->
            <button
              v-if="transaction.editable"
              type="button"
              class="hb-control hb-control--quiet"
              :disabled="busyTransactionIds.has(transaction.id)"
              @click="ledger.setTransfer(transaction.id, !transaction.isTransfer)"
            >{{ transaction.isTransfer ? "Count it" : "Not spending" }}</button>
            <b :class="{ 'review-row__amount--refund': transaction.isRefund, 'review-row__amount--transfer': transaction.isTransfer }">
              {{ signedMoney(transaction.amount) }}
            </b>
          </li>
        </ul>
      </section>

      <section class="ledger-panel" aria-labelledby="connections-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Where the numbers come from</p>
            <h2 id="connections-heading">Connections</h2>
          </div>
          <span class="connection-pill">{{ snapshot.merchantRules.length }} merchant rules</span>
        </div>
        <p v-if="!snapshot.plaidConfigured" class="ledger-empty">
          Bank connections are switched off in this environment, so these figures come from
          Homebase's demonstration data.
        </p>
        <template v-else>
          <p v-if="snapshot.connections.length === 0" class="ledger-empty">
            No bank is connected yet. Homebase never sees your bank sign-in — that happens inside
            your bank's own screen.
          </p>
          <ul v-else class="connection-list">
            <li v-for="connection in snapshot.connections" :key="connection.id" :class="`connection--${connection.health}`">
              <div class="review-row__what">
                <strong>{{ connection.institutionName }}</strong>
                <span>{{ connection.healthMessage }}</span>
              </div>
              <button
                v-if="connection.needsRepair"
                type="button"
                class="hb-control hb-control--quiet"
                :disabled="bankState !== 'idle'"
                @click="ledger.repairConnection(connection.id)"
              >{{ bankState === "linking" ? "Opening…" : "Repair" }}</button>
              <b>{{ connection.healthLabel }}</b>
            </li>
          </ul>

          <div class="connect-bank">
            <label>
              <span class="visually-hidden">Whose accounts are these</span>
              <select v-model="connectionScope" :disabled="bankState !== 'idle'">
                <option value="ours">Shared accounts</option>
                <option value="mine">My accounts</option>
              </select>
            </label>
            <button
              type="button"
              class="action-button"
              :disabled="bankState !== 'idle'"
              @click="ledger.connectBank(connectionScope)"
            >{{ bankState === "linking" ? "Opening your bank…" : "Connect a bank" }}</button>
          </div>
        </template>
      </section>
      <section class="ledger-panel" aria-labelledby="rules-heading">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Quiet work</p>
            <h2 id="rules-heading">Merchant rules</h2>
          </div>
        </div>
        <p v-if="snapshot.merchantRules.length === 0" class="ledger-empty">
          No rules yet. Tick "remember this merchant" when filing and Homebase will do it for you next time.
        </p>
        <ul v-else class="rule-list">
          <li v-for="rule in snapshot.merchantRules" :key="rule.id">
            <div class="review-row__what">
              <strong>{{ rule.merchant }}</strong>
              <span>Files to {{ rule.category }} · {{ rule.scope }}</span>
            </div>
            <button
              type="button"
              class="hb-control hb-control--quiet"
              :aria-label="`Remove the rule for ${rule.merchant}`"
              @click="ledger.removeMerchantRule(rule.id)"
            >Remove</button>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

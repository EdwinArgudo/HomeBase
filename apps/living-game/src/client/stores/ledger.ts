import { defineStore } from "pinia";
import { computed, ref } from "vue";

import type { LedgerApi, LedgerLimitChange, LedgerNewCategory, LedgerSnapshot, LedgerSplitPart } from "../api/ledger";

let runtime: { api: LedgerApi } | null = null;

export function configureLedgerRuntime(configuration: { api: LedgerApi }) {
  runtime = configuration;
}

function configuredRuntime() {
  if (!runtime) throw new Error("Ledger runtime has not been configured.");
  return runtime;
}

function safeMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.length > 0 && error.message.length <= 200
    ? error.message
    : fallback;
}

export const useLedgerStore = defineStore("ledger", () => {
  const snapshot = ref<LedgerSnapshot | null>(null);
  const loadState = ref<"idle" | "loading" | "ready" | "error">("idle");
  const loadError = ref("");
  const busyTransactionIds = ref(new Set<string>());
  const actionError = ref("");
  const feedback = ref("");

  async function ensureLoaded(force = false) {
    if (!force && loadState.value === "ready") return;
    loadState.value = "loading";
    loadError.value = "";
    try {
      snapshot.value = await configuredRuntime().api.load();
      loadState.value = "ready";
    } catch (error) {
      snapshot.value = null;
      loadState.value = "error";
      loadError.value = safeMessage(error, "Unable to read your ledger.");
    }
  }

  async function review(transactionId: string, categoryId: string, createRule: boolean) {
    if (busyTransactionIds.value.has(transactionId) || categoryId.length === 0) return false;
    busyTransactionIds.value = new Set(busyTransactionIds.value).add(transactionId);
    actionError.value = "";
    feedback.value = "";
    try {
      await configuredRuntime().api.review(transactionId, categoryId, createRule);
      // The server owns every total here, so the ledger is re-read rather than
      // patched locally.
      await ensureLoaded(true);
      feedback.value = createRule ? "Filed, and Homebase will remember this merchant." : "Filed.";
      return true;
    } catch (error) {
      actionError.value = safeMessage(error, "Unable to file that purchase.");
      return false;
    } finally {
      const next = new Set(busyTransactionIds.value);
      next.delete(transactionId);
      busyTransactionIds.value = next;
    }
  }

  async function split(transactionId: string, parts: LedgerSplitPart[]) {
    if (busyTransactionIds.value.has(transactionId) || parts.length < 2) return false;
    busyTransactionIds.value = new Set(busyTransactionIds.value).add(transactionId);
    actionError.value = "";
    feedback.value = "";
    try {
      await configuredRuntime().api.split(transactionId, parts);
      await ensureLoaded(true);
      feedback.value = `Split across ${parts.length} categories.`;
      return true;
    } catch (error) {
      actionError.value = safeMessage(error, "Unable to split that purchase.");
      return false;
    } finally {
      const next = new Set(busyTransactionIds.value);
      next.delete(transactionId);
      busyTransactionIds.value = next;
    }
  }

  async function removeMerchantRule(ruleId: string) {
    actionError.value = "";
    feedback.value = "";
    try {
      await configuredRuntime().api.removeMerchantRule(ruleId);
      await ensureLoaded(true);
      feedback.value = "Rule removed. Purchases from that merchant will ask again.";
      return true;
    } catch (error) {
      actionError.value = safeMessage(error, "Unable to remove that rule.");
      return false;
    }
  }

  async function saveLimits(changes: LedgerLimitChange[]) {
    const month = snapshot.value?.monthValue ?? "";
    if (changes.length === 0 || month.length === 0) return false;
    actionError.value = "";
    feedback.value = "";
    try {
      await configuredRuntime().api.saveLimits(month, changes);
      await ensureLoaded(true);
      feedback.value = `Updated ${changes.length} limit${changes.length === 1 ? "" : "s"}.`;
      return true;
    } catch (error) {
      actionError.value = safeMessage(error, "Unable to update those limits.");
      return false;
    }
  }

  async function createCategory(category: LedgerNewCategory) {
    const month = snapshot.value?.monthValue ?? "";
    if (month.length === 0 || category.name.trim().length === 0) return false;
    actionError.value = "";
    feedback.value = "";
    try {
      await configuredRuntime().api.createCategory(month, { ...category, name: category.name.trim() });
      await ensureLoaded(true);
      feedback.value = `Added ${category.name.trim()}.`;
      return true;
    } catch (error) {
      actionError.value = safeMessage(error, "Unable to add that category.");
      return false;
    }
  }

  const needsReviewCount = computed(() => snapshot.value?.needsReview.length ?? 0);

  return {
    snapshot, loadState, loadError, busyTransactionIds, actionError, feedback, needsReviewCount,
    ensureLoaded, review, split, removeMerchantRule, saveLimits, createCategory,
  };
});

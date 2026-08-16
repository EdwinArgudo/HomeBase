import { defineStore } from "pinia";
import { computed, ref } from "vue";

import type { LedgerApi, LedgerLimitChange, LedgerNewCategory, LedgerSnapshot, LedgerSplitPart } from "../api/ledger";
import { PlaidLinkClosed, type PlaidLinkLauncher } from "../api/plaidLink";

let runtime: { api: LedgerApi; openPlaidLink: PlaidLinkLauncher } | null = null;

export function configureLedgerRuntime(configuration: { api: LedgerApi; openPlaidLink: PlaidLinkLauncher }) {
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
  const viewedMonth = ref<string | undefined>(undefined);
  const actionError = ref("");
  const feedback = ref("");

  async function ensureLoaded(force = false) {
    if (!force && loadState.value === "ready") return;
    loadState.value = "loading";
    loadError.value = "";
    try {
      snapshot.value = await configuredRuntime().api.load(viewedMonth.value);
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

  async function setTransfer(transactionId: string, isTransfer: boolean) {
    if (busyTransactionIds.value.has(transactionId)) return false;
    busyTransactionIds.value = new Set(busyTransactionIds.value).add(transactionId);
    actionError.value = "";
    feedback.value = "";
    try {
      await configuredRuntime().api.setTransfer(transactionId, isTransfer);
      await ensureLoaded(true);
      feedback.value = isTransfer
        ? "Marked as moving money. It no longer counts as spending."
        : "Counted as spending again. Give it a category when you can.";
      return true;
    } catch (error) {
      actionError.value = safeMessage(error, "Unable to update that transaction.");
      return false;
    } finally {
      const next = new Set(busyTransactionIds.value);
      next.delete(transactionId);
      busyTransactionIds.value = next;
    }
  }

  /** Looking back at a closed month; every write still targets its own month. */
  async function viewMonth(month: string) {
    viewedMonth.value = month;
    actionError.value = "";
    feedback.value = "";
    await ensureLoaded(true);
  }

  const bankState = ref<"idle" | "linking">("idle");

  async function withLink(connectionId: string | undefined, finish: () => Promise<void>, done: string) {
    if (bankState.value !== "idle") return false;
    bankState.value = "linking";
    actionError.value = "";
    feedback.value = "";
    try {
      const linkToken = await configuredRuntime().api.startBankLink(connectionId);
      await finishWithToken(linkToken, finish);
      feedback.value = done;
      return true;
    } catch (error) {
      // Closing Plaid Link is a decision, not a failure.
      if (error instanceof PlaidLinkClosed) {
        feedback.value = error.message;
        return false;
      }
      actionError.value = safeMessage(error, "That bank connection could not be saved.");
      return false;
    } finally {
      bankState.value = "idle";
    }
  }

  let pendingLink: { publicToken: string; institutionName: string | null } | null = null;

  async function finishWithToken(linkToken: string, finish: () => Promise<void>) {
    pendingLink = await configuredRuntime().openPlaidLink(linkToken);
    await finish();
    await ensureLoaded(true);
    pendingLink = null;
  }

  async function connectBank(ownership: "ours" | "mine") {
    return withLink(undefined, async () => {
      if (!pendingLink) return;
      await configuredRuntime().api.saveBankConnection({ ...pendingLink, ownership });
    }, "Bank connected. Homebase is importing your transactions.");
  }

  async function repairConnection(connectionId: string) {
    return withLink(connectionId, async () => {
      await configuredRuntime().api.syncBankConnection(connectionId);
    }, "Connection repaired and refreshed.");
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
    bankState, viewedMonth, viewMonth,
    ensureLoaded, review, split, removeMerchantRule, setTransfer, saveLimits, createCategory,
    connectBank, repairConnection,
  };
});

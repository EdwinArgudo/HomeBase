import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFixtureLedgerApi, snapshotFrom } from "./api/ledger";
import { configureLedgerRuntime, useLedgerStore } from "./stores/ledger";
import LedgerView from "./views/LedgerView.vue";

describe("the ledger", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("reads the household payload without trusting its shape", () => {
    const snapshot = snapshotFrom({
      budgetMonth: { label: "August" },
      budgets: {
        ours: [{ id: "cat-a", name: "Groceries", spent: 10, limit: 100 }],
        mine: [{ id: "cat-b", name: "Hobbies", spent: 5, limit: 50 }],
        yours: [{ id: "private-partner-budget", name: "Personal spending", spent: 40, limit: 90 }],
      },
      transactions: [
        { id: "t1", merchant: "Costco", reviewStatus: "needs_review", editable: true, amount: 12.5 },
        { id: "t2", merchant: "Hidden", reviewStatus: "needs_review", editable: false, amount: 9 },
        { id: "t3", merchant: "Filed", reviewStatus: "ready", editable: true, amount: 4 },
      ],
      plaid: { configured: true, connections: [{ id: "c1", institutionName: "Bank", health: "stale" }] },
      merchantRules: [{ id: "r1" }, { id: "r2" }],
      unexpectedField: { nested: true },
    });

    // A partner's purchase is theirs to file, and their aggregated private
    // budget is not a category anyone can choose.
    expect(snapshot.needsReview.map((entry) => entry.id)).toEqual(["t1"]);
    expect(snapshot.categoryChoices.map((choice) => choice.id)).toEqual(["cat-a", "cat-b"]);
    expect(snapshot.merchantRuleCount).toBe(2);
    expect(snapshot.connections[0]?.health).toBe("stale");
    expect(snapshot.monthLabel).toBe("August");
  });

  it("survives a payload with nothing in it", () => {
    const snapshot = snapshotFrom({});
    expect(snapshot.budgets.ours).toEqual([]);
    expect(snapshot.needsReview).toEqual([]);
    expect(snapshot.plaidConfigured).toBe(false);
  });

  it("files a purchase through the server and re-reads every total", async () => {
    const api = createFixtureLedgerApi();
    const review = vi.spyOn(api, "review");
    const load = vi.spyOn(api, "load");
    configureLedgerRuntime({ api });

    const wrapper = mount(LedgerView);
    await flushPromises();
    expect(wrapper.text()).toContain("Costco");

    await wrapper.get(".review-list select").setValue("cat-groceries");
    await wrapper.get(".review-list .action-button").trigger("click");
    await flushPromises();

    expect(review).toHaveBeenCalledWith("txn-costco", "cat-groceries", false);
    // Totals belong to the server, so filing re-reads rather than patching.
    expect(load).toHaveBeenCalledTimes(2);
    expect(useLedgerStore().needsReviewCount).toBe(0);
    wrapper.unmount();
  });

  it("keeps a purchase in place when the server refuses it", async () => {
    const api = createFixtureLedgerApi();
    vi.spyOn(api, "review").mockRejectedValue(new Error("Choose a budget category for this transaction."));
    configureLedgerRuntime({ api });

    const wrapper = mount(LedgerView);
    await flushPromises();
    await wrapper.get(".review-list select").setValue("cat-groceries");
    await wrapper.get(".review-list .action-button").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Choose a budget category");
    expect(useLedgerStore().needsReviewCount).toBe(1);
    wrapper.unmount();
  });
});

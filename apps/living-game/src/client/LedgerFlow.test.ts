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
      merchantRules: [{ id: "r1", merchant: "Costco", category: "Groceries", scope: "Ours" }, { id: "r2" }],
      unexpectedField: { nested: true },
    });

    // A partner's purchase is theirs to file, and their aggregated private
    // budget is not a category anyone can choose.
    expect(snapshot.needsReview.map((entry) => entry.id)).toEqual(["t1"]);
    expect(snapshot.categoryChoices.map((choice) => choice.id)).toEqual(["cat-a", "cat-b"]);
    expect(snapshot.merchantRules.map((rule) => rule.id)).toEqual(["r1", "r2"]);
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

describe("splitting a purchase", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("stays closed until the parts add up exactly, then sends whole cents", async () => {
    const api = createFixtureLedgerApi();
    const split = vi.spyOn(api, "split");
    configureLedgerRuntime({ api });

    const wrapper = mount(LedgerView);
    await flushPromises();
    await wrapper.get(".review-list .move-secondary-action").trigger("click");

    const selects = () => wrapper.findAll(".split-row select");
    const amounts = () => wrapper.findAll(".split-row input");
    const saveButton = () => wrapper.findAll(".split-editor__actions button")
      .find((button) => button.text().startsWith("Save split"))!;

    expect(saveButton().attributes("disabled")).toBeDefined();

    await selects()[0]!.setValue("cat-groceries");
    await amounts()[0]!.setValue("100");
    await selects()[1]!.setValue("cat-hobbies");
    await amounts()[1]!.setValue("20");

    // 126.42 total, so 120 is still short and the button stays closed.
    expect(wrapper.get(".split-remainder").text()).toContain("left to place");
    expect(saveButton().attributes("disabled")).toBeDefined();

    await amounts()[1]!.setValue("26.42");
    expect(wrapper.get(".split-remainder").text()).toContain("Adds up exactly");
    await saveButton().trigger("click");
    await flushPromises();

    expect(split).toHaveBeenCalledWith("txn-costco", [
      { categoryId: "cat-groceries", amountCents: 10000 },
      { categoryId: "cat-hobbies", amountCents: 2642 },
    ]);
    wrapper.unmount();
  });

  it("refuses to send the same category twice", async () => {
    configureLedgerRuntime({ api: createFixtureLedgerApi() });
    const wrapper = mount(LedgerView);
    await flushPromises();
    await wrapper.get(".review-list .move-secondary-action").trigger("click");

    const selects = wrapper.findAll(".split-row select");
    const amounts = wrapper.findAll(".split-row input");
    await selects[0]!.setValue("cat-groceries");
    await amounts[0]!.setValue("100");
    await selects[1]!.setValue("cat-groceries");
    await amounts[1]!.setValue("26.42");

    const saveButton = wrapper.findAll(".split-editor__actions button")
      .find((button) => button.text().startsWith("Save split"))!;
    expect(saveButton.attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
});

describe("merchant rules", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("removes a rule and re-reads the ledger", async () => {
    const api = createFixtureLedgerApi();
    const remove = vi.spyOn(api, "removeMerchantRule");
    configureLedgerRuntime({ api });

    const wrapper = mount(LedgerView);
    await flushPromises();
    expect(wrapper.findAll(".rule-list li")).toHaveLength(2);

    await wrapper.get(".rule-list .move-secondary-action").trigger("click");
    await flushPromises();

    expect(remove).toHaveBeenCalledWith("rule-costco");
    expect(wrapper.findAll(".rule-list li")).toHaveLength(1);
    wrapper.unmount();
  });
});

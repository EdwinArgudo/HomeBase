import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlaidLinkClosed, PlaidLinkError, createFixturePlaidLinkLauncher } from "./api/plaidLink";
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
    configureLedgerRuntime({ api, openPlaidLink: createFixturePlaidLinkLauncher() });

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
    configureLedgerRuntime({ api, openPlaidLink: createFixturePlaidLinkLauncher() });

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
    configureLedgerRuntime({ api, openPlaidLink: createFixturePlaidLinkLauncher() });

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
    configureLedgerRuntime({ api: createFixtureLedgerApi(), openPlaidLink: createFixturePlaidLinkLauncher() });
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
    configureLedgerRuntime({ api, openPlaidLink: createFixturePlaidLinkLauncher() });

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

describe("budget limits", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("sends only the limits that actually moved", async () => {
    const api = createFixtureLedgerApi();
    const saveLimits = vi.spyOn(api, "saveLimits");
    configureLedgerRuntime({ api, openPlaidLink: createFixturePlaidLinkLauncher() });

    const wrapper = mount(LedgerView);
    await flushPromises();
    const adjust = wrapper.findAll(".ledger-panel button").find((button) => button.text() === "Adjust limits")!;
    await adjust.trigger("click");

    const saveButton = () => wrapper.findAll(".limit-editor button").find((button) => button.text() === "Save limits")!;
    expect(saveButton().attributes("disabled")).toBeDefined();
    expect(wrapper.get(".limit-editor .split-remainder").text()).toBe("Nothing changed yet");

    // Groceries moves; Dining out is left exactly as it was.
    await wrapper.findAll(".limit-row input[type=number]")[0]!.setValue("700");
    expect(wrapper.get(".limit-editor .split-remainder").text()).toContain("1 limit to save");
    await saveButton().trigger("click");
    await flushPromises();

    expect(saveLimits).toHaveBeenCalledWith("2026-08", [
      { id: "cat-groceries", limitCents: 70000, rolloverEnabled: false },
    ]);
    wrapper.unmount();
  });

  it("treats turning carry-over on as a change of its own", async () => {
    const api = createFixtureLedgerApi();
    const saveLimits = vi.spyOn(api, "saveLimits");
    configureLedgerRuntime({ api, openPlaidLink: createFixturePlaidLinkLauncher() });

    const wrapper = mount(LedgerView);
    await flushPromises();
    await wrapper.findAll(".ledger-panel button").find((button) => button.text() === "Adjust limits")!.trigger("click");
    await wrapper.findAll(".limit-row input[type=checkbox]")[0]!.setValue(true);
    await wrapper.findAll(".limit-editor button").find((button) => button.text() === "Save limits")!.trigger("click");
    await flushPromises();

    expect(saveLimits).toHaveBeenCalledWith("2026-08", [
      { id: "cat-groceries", limitCents: 60000, rolloverEnabled: true },
    ]);
    wrapper.unmount();
  });

  it("never offers to edit a partner's spending", async () => {
    configureLedgerRuntime({ api: createFixtureLedgerApi(), openPlaidLink: createFixturePlaidLinkLauncher() });
    const wrapper = mount(LedgerView);
    await flushPromises();

    const panels = wrapper.findAll(".ledger-panel");
    const partnerPanel = panels.find((panel) => panel.text().includes("Your partner's spending"))!;
    expect(partnerPanel.findAll("button").some((button) => button.text() === "Adjust limits")).toBe(false);
    expect(partnerPanel.text()).toContain("Your partner sets these");
    wrapper.unmount();
  });

  it("adds a category to the scope being edited", async () => {
    const api = createFixtureLedgerApi();
    const createCategory = vi.spyOn(api, "createCategory");
    configureLedgerRuntime({ api, openPlaidLink: createFixturePlaidLinkLauncher() });

    const wrapper = mount(LedgerView);
    await flushPromises();
    await wrapper.findAll(".ledger-panel button").find((button) => button.text() === "Adjust limits")!.trigger("click");
    await wrapper.get('.limit-editor input[type="text"]').setValue("Pets");
    await wrapper.get('.limit-editor input[type="number"]').setValue("40");
    await wrapper.findAll(".limit-editor button").find((button) => button.text() === "Add category")!.trigger("click");
    await flushPromises();

    expect(createCategory).toHaveBeenCalledWith("2026-08", { scope: "ours", name: "Pets", limitCents: 4000 });
    wrapper.unmount();
  });
});

describe("transfers and refunds", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("marks a purchase as moving money, which takes it out of the inbox", async () => {
    const api = createFixtureLedgerApi();
    const setTransfer = vi.spyOn(api, "setTransfer");
    configureLedgerRuntime({ api, openPlaidLink: createFixturePlaidLinkLauncher() });

    const wrapper = mount(LedgerView);
    await flushPromises();
    expect(useLedgerStore().needsReviewCount).toBe(1);

    await wrapper.findAll(".review-row__controls button").find((button) => button.text() === "Not spending")!.trigger("click");
    await flushPromises();

    expect(setTransfer).toHaveBeenCalledWith("txn-costco", true);
    // A transfer belongs to no budget, so it stops asking to be filed.
    expect(useLedgerStore().needsReviewCount).toBe(0);
    wrapper.unmount();
  });

  it("shows a transfer as not counted, and can count it again", async () => {
    const api = createFixtureLedgerApi();
    const setTransfer = vi.spyOn(api, "setTransfer");
    configureLedgerRuntime({ api, openPlaidLink: createFixturePlaidLinkLauncher() });

    const wrapper = mount(LedgerView);
    await flushPromises();
    const transferRow = wrapper.findAll(".recent-list li").find((row) => row.text().includes("Card payment"))!;
    expect(transferRow.text()).toContain("not counted as spending");

    await transferRow.get("button").trigger("click");
    await flushPromises();
    expect(setTransfer).toHaveBeenCalledWith("txn-card-payment", false);
    wrapper.unmount();
  });

  it("can reclassify a purchase that was already filed as spending", async () => {
    const api = createFixtureLedgerApi();
    const setTransfer = vi.spyOn(api, "setTransfer");
    configureLedgerRuntime({ api, openPlaidLink: createFixturePlaidLinkLauncher() });

    const wrapper = mount(LedgerView);
    await flushPromises();
    const filedRow = wrapper.findAll(".recent-list li").find((row) => row.text().includes("Whole Foods"))!;
    await filedRow.get("button").trigger("click");
    await flushPromises();

    expect(setTransfer).toHaveBeenCalledWith("txn-whole-foods", true);
    wrapper.unmount();
  });

  it("reads a refund as money coming back rather than a negative purchase", async () => {
    configureLedgerRuntime({ api: createFixtureLedgerApi(), openPlaidLink: createFixturePlaidLinkLauncher() });
    const wrapper = mount(LedgerView);
    await flushPromises();

    const refundRow = wrapper.findAll(".recent-list li").find((row) => row.text().includes("Uniqlo refund"))!;
    expect(refundRow.text()).toContain("Money back into Clothing");
    expect(refundRow.get("b").text()).toContain("+$32.50");
    expect(refundRow.get("b").text()).not.toContain("-");
    wrapper.unmount();
  });
});

describe("connecting a bank", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("takes the token from Homebase, the sign-in from Plaid, and saves what comes back", async () => {
    const api = createFixtureLedgerApi();
    const startBankLink = vi.spyOn(api, "startBankLink");
    const saveBankConnection = vi.spyOn(api, "saveBankConnection");
    const openPlaidLink = vi.fn().mockResolvedValue({ publicToken: "public-token", institutionName: "Chase" });
    configureLedgerRuntime({ api, openPlaidLink });

    const wrapper = mount(LedgerView);
    await flushPromises();
    await wrapper.findAll(".connect-bank button").find((button) => button.text().includes("Connect a bank"))!.trigger("click");
    await flushPromises();

    expect(startBankLink).toHaveBeenCalledWith(undefined);
    expect(openPlaidLink).toHaveBeenCalledWith("link-sandbox-token");
    // Only the public token crosses back; no credential ever reaches Homebase.
    expect(saveBankConnection).toHaveBeenCalledWith({
      publicToken: "public-token",
      institutionName: "Chase",
      ownership: "ours",
    });
    expect(wrapper.text()).toContain("Chase");
    wrapper.unmount();
  });

  it("treats closing Plaid Link as a decision, not an error", async () => {
    const api = createFixtureLedgerApi();
    const saveBankConnection = vi.spyOn(api, "saveBankConnection");
    configureLedgerRuntime({ api, openPlaidLink: vi.fn().mockRejectedValue(new PlaidLinkClosed()) });

    const wrapper = mount(LedgerView);
    await flushPromises();
    await wrapper.findAll(".connect-bank button").find((button) => button.text().includes("Connect a bank"))!.trigger("click");
    await flushPromises();

    expect(saveBankConnection).not.toHaveBeenCalled();
    expect(wrapper.get('[role="status"]').text()).toContain("No bank connection was changed");
    expect(wrapper.find(".ledger-feedback--error").exists()).toBe(false);
    wrapper.unmount();
  });

  it("surfaces a real Link failure", async () => {
    configureLedgerRuntime({
      api: createFixtureLedgerApi(),
      openPlaidLink: vi.fn().mockRejectedValue(new PlaidLinkError("Plaid Link could not load.")),
    });

    const wrapper = mount(LedgerView);
    await flushPromises();
    await wrapper.findAll(".connect-bank button").find((button) => button.text().includes("Connect a bank"))!.trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Plaid Link could not load.");
    wrapper.unmount();
  });

  it("offers no way to connect where bank connections are switched off", async () => {
    const api = createFixtureLedgerApi();
    const snapshot = await api.load();
    snapshot.plaidConfigured = false;
    vi.spyOn(api, "load").mockResolvedValue(snapshot);
    configureLedgerRuntime({ api, openPlaidLink: createFixturePlaidLinkLauncher() });

    const wrapper = mount(LedgerView);
    await flushPromises();
    // A button that cannot work is worse than an explanation.
    expect(wrapper.find(".connect-bank").exists()).toBe(false);
    expect(wrapper.text()).toContain("switched off in this environment");
    wrapper.unmount();
  });

  it("repairs a connection through Link in update mode", async () => {
    const api = createFixtureLedgerApi();
    await api.saveBankConnection({ publicToken: "t", ownership: "ours", institutionName: "Wobbly Bank" });
    const snapshot = await api.load();
    snapshot.connections[snapshot.connections.length - 1]!.needsRepair = true;
    vi.spyOn(api, "load").mockResolvedValue(snapshot);
    const startBankLink = vi.spyOn(api, "startBankLink");
    const syncBankConnection = vi.spyOn(api, "syncBankConnection");
    configureLedgerRuntime({ api, openPlaidLink: createFixturePlaidLinkLauncher() });

    const wrapper = mount(LedgerView);
    await flushPromises();
    await wrapper.findAll(".connection-list button").find((button) => button.text() === "Repair")!.trigger("click");
    await flushPromises();

    const connectionId = snapshot.connections[snapshot.connections.length - 1]!.id;
    expect(startBankLink).toHaveBeenCalledWith(connectionId);
    expect(syncBankConnection).toHaveBeenCalledWith(connectionId);
    wrapper.unmount();
  });
});

describe("looking back at a closed month", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("walks back a month and asks the server for that month", async () => {
    const api = createFixtureLedgerApi();
    const load = vi.spyOn(api, "load");
    configureLedgerRuntime({ api, openPlaidLink: createFixturePlaidLinkLauncher() });

    const wrapper = mount(LedgerView);
    await flushPromises();
    expect(load).toHaveBeenLastCalledWith(undefined);
    expect(wrapper.get(".month-nav").text()).toContain("August 2026");
    // There is no next month while you are in the current one.
    expect(wrapper.get('[aria-label="Next month"]').attributes("disabled")).toBeDefined();

    await wrapper.get('[aria-label="Previous month"]').trigger("click");
    await flushPromises();

    expect(load).toHaveBeenLastCalledWith("2026-07");
    expect(wrapper.get(".month-nav").text()).toContain("July 2026");
    expect(wrapper.get('[aria-label="Next month"]').attributes("disabled")).toBeUndefined();
    wrapper.unmount();
  });

  it("reads a closed month as a record rather than a plan", async () => {
    configureLedgerRuntime({ api: createFixtureLedgerApi(), openPlaidLink: createFixturePlaidLinkLauncher() });
    const wrapper = mount(LedgerView);
    await flushPromises();

    expect(wrapper.text()).toContain("Left to spend");
    expect(wrapper.text()).toContain("days to go");
    expect(wrapper.findAll(".ledger-panel button").some((button) => button.text() === "Adjust limits")).toBe(true);

    await wrapper.get('[aria-label="Previous month"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Final balance");
    // Limits are what a finished month fixes, not the record of what happened.
    expect(wrapper.findAll(".ledger-panel button").some((button) => button.text() === "Adjust limits")).toBe(false);
    expect(wrapper.text()).toContain("its limits are fixed");
    expect(wrapper.findAll(".recent-list button").some((button) => button.text() === "Not spending")).toBe(true);
    wrapper.unmount();
  });

  it("shows a pace for the current month and a total for a closed one", async () => {
    configureLedgerRuntime({ api: createFixtureLedgerApi(), openPlaidLink: createFixturePlaidLinkLauncher() });
    const wrapper = mount(LedgerView);
    await flushPromises();

    // 640 spent over 16 of 31 days projects to 1,240.
    const figures = () => wrapper.get(".month-figures").text();
    expect(figures()).toContain("On track for");
    expect(figures()).toContain("$1,240.00");

    await wrapper.get('[aria-label="Previous month"]').trigger("click");
    await flushPromises();
    expect(figures()).toContain("Total");
    expect(figures()).toContain("$640.00");
    wrapper.unmount();
  });
});

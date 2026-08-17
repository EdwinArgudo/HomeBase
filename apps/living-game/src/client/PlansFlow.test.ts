import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import { createFixturePlansApi } from "./api/fixturePlans";
import { createFixtureHouseholdApi } from "./api/household";
import { routes } from "./router";
import { configurePlansRuntime } from "./stores/plans";
import { configureHouseholdRuntime } from "./stores/household";
import PlansView from "./views/PlansView.vue";

async function mounted(api = createFixturePlansApi(), householdApi = createFixtureHouseholdApi()) {
  configurePlansRuntime({ api });
  configureHouseholdRuntime({ api: householdApi });
  const router = createRouter({ history: createMemoryHistory(), routes: [...routes] });
  await router.push("/plans"); await router.isReady();
  return mount(PlansView, { global: { plugins: [createPinia(), router] } });
}

describe("Plans view", () => {
  it("shows real task, grocery, sessions, and cents progress and performs authoritative actions", async () => {
    const wrapper = await mounted(); await flushPromises();
    expect(wrapper.text()).toContain("Practice Spanish");
    expect(wrapper.text()).toContain("3 sessions / 12 sessions");
    expect(wrapper.text()).toContain("$40.00 / $100.00");
    expect(wrapper.text()).toContain("both count the same way");
    await wrapper.get('button[aria-label="Complete Take recycling downstairs"]').trigger("click"); await flushPromises();
    expect(wrapper.find('button[aria-label="Reopen Take recycling downstairs"]').exists()).toBe(true);
    await wrapper.get("#grocery-name").setValue("Apples"); await wrapper.get("form[aria-label='Add a grocery item']").trigger("submit"); await flushPromises();
    expect(wrapper.text()).toContain("Apples");
    await wrapper.get('button[aria-label="Pick up Apples"]').trigger("click"); await flushPromises();
    expect(wrapper.find('button[aria-label="Put back Apples"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("logs sessions and dollars against a goal and shows the new total", async () => {
    const wrapper = await mounted(); await flushPromises();

    await wrapper.get('button[aria-label="Log a session for Practice Spanish"]').trigger("click"); await flushPromises();
    expect(wrapper.text()).toContain("4 sessions / 12 sessions");

    // Dollars are typed the way they are spoken and stored in cents.
    await wrapper.get("#goal-amount-goal-fund").setValue("12.50");
    await wrapper.get('button[aria-label="Add to Household fund"]').trigger("click"); await flushPromises();
    expect(wrapper.text()).toContain("$52.50 / $100.00");
    expect((wrapper.get("#goal-amount-goal-fund").element as HTMLInputElement).value).toBe("");
    wrapper.unmount();
  });

  it("will not send an amount that is not an amount", async () => {
    const act = vi.fn();
    const fixture = createFixturePlansApi();
    const wrapper = await mounted({ load: fixture.load, act }); await flushPromises();
    const button = () => wrapper.get('button[aria-label="Add to Household fund"]');

    expect(button().attributes("disabled")).toBeDefined();
    await wrapper.get("#goal-amount-goal-fund").setValue("0.004");
    expect(button().attributes("disabled")).toBeDefined();
    await wrapper.get("#goal-amount-goal-fund").setValue("nine dollars");
    expect(button().attributes("disabled")).toBeDefined();
    await button().trigger("click"); await flushPromises();
    expect(act).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("adds a goal and asks before finishing one", async () => {
    const wrapper = await mounted(); await flushPromises();

    await wrapper.get("button[aria-expanded]").trigger("click");
    await wrapper.get("#goal-name").setValue("Read together");
    await wrapper.get("#goal-target").setValue("24");
    await wrapper.get("form[aria-label='Add a goal']").trigger("submit"); await flushPromises();
    expect(wrapper.text()).toContain("Read together");
    expect(wrapper.text()).toContain("0 sessions / 24 sessions");
    expect(wrapper.find("form[aria-label='Add a goal']").exists()).toBe(false);

    // Finishing is not undoable from here, so it asks first.
    await wrapper.get('button[aria-label="Finish Practice Spanish"]').trigger("click");
    expect(wrapper.text()).toContain("Finish this goal?");
    await wrapper.get('button[aria-label="Keep Practice Spanish"]').trigger("click");
    expect(wrapper.text()).toContain("Practice Spanish");

    await wrapper.get('button[aria-label="Finish Practice Spanish"]').trigger("click");
    await wrapper.get('button[aria-label="Yes, finish Practice Spanish"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).not.toContain("Practice Spanish");
    wrapper.unmount();
  });

  it("renders retryable errors and honest empty sections", async () => {
    const fixture = createFixturePlansApi(); const empty = { ...(await fixture.load()), tasks: [], groceries: [], goals: [] };
    const load = vi.fn().mockRejectedValueOnce(new Error("Plans are resting briefly.")).mockResolvedValueOnce(empty);
    const wrapper = await mounted({ load, act: vi.fn() }); await flushPromises();
    expect(wrapper.get("div[role='alert']").text()).toContain("resting briefly");
    await wrapper.get("div[role='alert'] button").trigger("click"); await flushPromises();
    expect(wrapper.text()).toContain("No tasks need your attention");
    expect(wrapper.text()).toContain("The grocery list is clear");
    expect(wrapper.text()).toContain("No active goals");
    wrapper.unmount();
  });

  it("bootstraps household membership before a direct Plans read", async () => {
    const order: string[] = [];
    const household = createFixtureHouseholdApi();
    const plans = createFixturePlansApi();
    const wrapper = await mounted(
      { load: async () => { order.push("plans"); return plans.load(); }, act: plans.act },
      { load: async () => { order.push("household"); return household.load(); }, invite: household.invite },
    );
    await flushPromises(); await flushPromises();
    expect(order).toEqual(["household", "plans"]);
    wrapper.unmount();
  });
});

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
    expect(wrapper.text()).toContain("Progress is logged through completed moves on Today");
    await wrapper.get('button[aria-label="Complete Take recycling downstairs"]').trigger("click"); await flushPromises();
    expect(wrapper.find('button[aria-label="Reopen Take recycling downstairs"]').exists()).toBe(true);
    await wrapper.get("#grocery-name").setValue("Apples"); await wrapper.get(".grocery-quick-add").trigger("submit"); await flushPromises();
    expect(wrapper.text()).toContain("Apples");
    await wrapper.get('button[aria-label="Pick up Apples"]').trigger("click"); await flushPromises();
    expect(wrapper.find('button[aria-label="Put back Apples"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("renders retryable errors and honest empty sections", async () => {
    const fixture = createFixturePlansApi(); const empty = { ...(await fixture.load()), tasks: [], groceries: [], goals: [] };
    const load = vi.fn().mockRejectedValueOnce(new Error("Plans are resting briefly.")).mockResolvedValueOnce(empty);
    const wrapper = await mounted({ load, act: vi.fn() }); await flushPromises();
    expect(wrapper.get(".plans-state[role='alert']").text()).toContain("resting briefly");
    await wrapper.get(".plans-state button").trigger("click"); await flushPromises();
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
